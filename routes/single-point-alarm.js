const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const router = express.Router();

// 初始化SQLite数据库
const dbPath = path.join(__dirname, '../data/single_point_alarm.db');
const db = new sqlite3.Database(dbPath);

// 创建表
db.serialize(() => {
  // 单点报警规则表
  db.run(`CREATE TABLE IF NOT EXISTS single_point_alarm_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    dataPointId TEXT NOT NULL,
    dataPointName TEXT NOT NULL,
    alarmType TEXT NOT NULL CHECK (alarmType IN ('no_update', 'threshold')),
    config TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'medium' CHECK (level IN ('low', 'medium', 'high')),
    content TEXT NOT NULL,
    notifications TEXT NOT NULL,
    enabled BOOLEAN DEFAULT 1,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 单点报警历史表
  db.run(`CREATE TABLE IF NOT EXISTS single_point_alarm_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ruleId INTEGER NOT NULL,
    ruleName TEXT NOT NULL,
    dataPointId TEXT NOT NULL,
    dataPointName TEXT NOT NULL,
    alarmType TEXT NOT NULL,
    content TEXT NOT NULL,
    level TEXT NOT NULL,
    triggered BOOLEAN NOT NULL,
    value TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ruleId) REFERENCES single_point_alarm_rules(id)
  )`);
});

console.log('[单点报警] 数据库表已初始化');

// 监控状态
let monitoringActive = false;
let monitoringInterval = null;
const ruleStates = new Map(); // 存储每个规则的状态

// 数据点缓存机制
const dataPointCache = new Map(); // 存储数据点的最后更新时间和值
const activeDataPoints = new Set(); // 存储当前需要监控的数据点标识符

// 自动启动监控
console.log('[单点报警] 自动启动监控...');
setTimeout(() => {
  startMonitoring();
  monitoringActive = true;
  console.log('[单点报警] 监控已自动启动');
  
  // 初始化数据点缓存
  initializeDataPointCache();
}, 2000); // 延迟2秒启动，确保其他模块已加载

// 初始化数据点缓存
function initializeDataPointCache() {
  console.log('[单点报警] 初始化数据点缓存...');
  
  // 获取所有启用的规则，构建需要监控的数据点列表
  db.all('SELECT DISTINCT dataPointId FROM single_point_alarm_rules WHERE enabled = 1', [], (err, rows) => {
    if (err) {
      console.error('[单点报警] 获取启用规则失败:', err);
      return;
    }
    
    console.log(`[单点报警] 找到 ${rows.length} 个需要监控的数据点`);
    
    // 清空并重新构建活跃数据点集合
    activeDataPoints.clear();
    rows.forEach(row => {
      activeDataPoints.add(row.dataPointId);
      console.log(`[单点报警] 添加监控数据点: ${row.dataPointId}`);
    });
    
    console.log(`[单点报警] 数据点缓存初始化完成，监控 ${activeDataPoints.size} 个数据点`);
    
    // 注册数据更新监听器
    registerDataUpdateListener();
  });
}

// 注册数据更新监听器
function registerDataUpdateListener() {
  try {
    console.log('[单点报警] 注册数据更新监听器...');
    
    // 获取MQTT服务实例
    const MQTTService = require('../modules/mqtt-service');
    const mqttService = MQTTService.getInstance();
    
    // 注册数据更新回调
    mqttService.onDataUpdate = (dataPointId, value, timestamp) => {
      handleDataPointUpdate(dataPointId, value, timestamp);
    };
    
    console.log('[单点报警] 数据更新监听器注册成功');
  } catch (error) {
    console.warn('[单点报警] 无法注册数据更新监听器:', error.message);
    console.log('[单点报警] 将继续使用定时检查机制作为备用方案');
  }
}

// 处理数据点更新
function handleDataPointUpdate(dataPointId, value, timestamp) {
  // 检查是否是我们需要监控的数据点
  if (!activeDataPoints.has(dataPointId)) {
    return; // 不需要监控的数据点，直接返回
  }
  
  const now = new Date();
  const updateTime = timestamp ? new Date(timestamp) : now;
  
  // 更新缓存
  dataPointCache.set(dataPointId, {
    value: value,
    lastUpdate: updateTime,
    available: true
  });
  
  console.log(`[单点报警] 数据点更新: ${dataPointId} = ${value} at ${updateTime.toISOString()}`);
  
  // 重置该数据点相关的无更新报警状态（如果数据重新开始更新）
  resetNoUpdateAlarmStates(dataPointId);
  
  // 立即检查相关的报警规则
  checkRulesForDataPoint(dataPointId);
}

// 重置无更新报警状态
function resetNoUpdateAlarmStates(dataPointId) {
  // 查找该数据点的所有无更新报警规则
  db.all(
    'SELECT id FROM single_point_alarm_rules WHERE dataPointId = ? AND alarmType = "no_update" AND enabled = 1',
    [dataPointId],
    (err, rules) => {
      if (err) {
        console.error(`[单点报警] 获取数据点 ${dataPointId} 的无更新规则失败:`, err);
        return;
      }
      
      if (rules.length > 0) {
        console.log(`[单点报警] 数据点 ${dataPointId} 重新更新，重置 ${rules.length} 个无更新报警状态`);
        
        rules.forEach(rule => {
          const currentState = ruleStates.get(rule.id);
          if (currentState && currentState.triggered) {
            // 重置为未触发状态，这样如果数据再次停止更新，会重新触发报警
            ruleStates.set(rule.id, { triggered: false });
            console.log(`[单点报警] 已重置规则 ${rule.id} 的报警状态`);
          }
        });
      }
    }
  );
}

// 检查特定数据点的报警规则
async function checkRulesForDataPoint(dataPointId) {
  return new Promise((resolve) => {
    // 获取该数据点相关的所有启用规则
    db.all(
      'SELECT * FROM single_point_alarm_rules WHERE dataPointId = ? AND enabled = 1',
      [dataPointId],
      async (err, rules) => {
        if (err) {
          console.error(`[单点报警] 获取数据点 ${dataPointId} 的规则失败:`, err);
          resolve();
          return;
        }
        
        if (rules.length === 0) {
          resolve();
          return;
        }
        
        console.log(`[单点报警] 检查数据点 ${dataPointId} 的 ${rules.length} 个规则`);
        
        for (const rule of rules) {
          try {
            await checkSingleRuleWithCache(rule);
          } catch (error) {
            console.error(`[单点报警] 检查规则 ${rule.name} 失败:`, error);
          }
        }
        
        resolve();
      }
    );
  });
}

// 使用缓存检查单个规则
async function checkSingleRuleWithCache(rule) {
  const config = JSON.parse(rule.config);
  const notifications = JSON.parse(rule.notifications);
  
  // 从缓存获取数据点信息
  const cachedData = dataPointCache.get(rule.dataPointId);
  
  let dataValue;
  if (cachedData) {
    dataValue = {
      value: cachedData.value,
      timestamp: cachedData.lastUpdate,
      available: cachedData.available,
      dataPointName: rule.dataPointName
    };
  } else {
    // 如果缓存中没有数据，说明该数据点从未更新过
    console.log(`[单点报警] 数据点 ${rule.dataPointId} 不在缓存中，视为未更新`);
    dataValue = {
      value: null,
      timestamp: new Date(0), // 使用一个很老的时间戳
      available: false,
      dataPointName: rule.dataPointName
    };
  }
  
  if (rule.alarmType === 'no_update') {
    await checkNoUpdateAlarmWithCache(rule, dataValue, config, notifications);
  } else if (rule.alarmType === 'threshold') {
    await checkThresholdAlarmWithCache(rule, dataValue, config, notifications);
  }
}

// 使用缓存检查无更新报警
async function checkNoUpdateAlarmWithCache(rule, dataValue, config, notifications) {
  console.log(`[单点报警] 检查无更新报警(缓存): ${rule.name}`);
  
  const now = new Date();
  const timeout = config.timeout * 1000; // 转换为毫秒
  
  // 确保正确解析时间戳
  let lastUpdate;
  if (dataValue.timestamp) {
    lastUpdate = new Date(dataValue.timestamp);
  } else {
    lastUpdate = new Date(0);
  }
  
  // 计算时间差（毫秒）
  const timeDiff = now - lastUpdate;
  const isTimeout = timeDiff > timeout;
  
  // 转换为中国标准时间显示
  const nowCST = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const lastUpdateCST = new Date(lastUpdate.getTime() + 8 * 60 * 60 * 1000);
  
  console.log(`[单点报警] 数据点: ${rule.dataPointId}`);
  console.log(`[单点报警] 最后更新时间(UTC): ${lastUpdate.toISOString()}`);
  console.log(`[单点报警] 最后更新时间(CST): ${lastUpdateCST.toISOString().replace('Z', '+08:00')}`);
  console.log(`[单点报警] 当前时间(UTC): ${now.toISOString()}`);
  console.log(`[单点报警] 当前时间(CST): ${nowCST.toISOString().replace('Z', '+08:00')}`);
  console.log(`[单点报警] 时间差: ${Math.floor(timeDiff/1000)}秒`);
  console.log(`[单点报警] 超时阈值: ${config.timeout}秒`);
  console.log(`[单点报警] 是否超时: ${isTimeout}`);
  
  // 🔧 修复：检查数据库中最近的告警历史，确定实际的触发状态
  const actualTriggeredState = await checkLastAlarmState(rule.id);
  let ruleState = ruleStates.get(rule.id) || { triggered: false };
  
  // 如果内存状态与数据库状态不一致，以数据库为准
  if (actualTriggeredState !== null && actualTriggeredState !== ruleState.triggered) {
    console.log(`[单点报警] 🔧 修正状态不一致: 内存=${ruleState.triggered}, 数据库=${actualTriggeredState}`);
    ruleState.triggered = actualTriggeredState;
    ruleStates.set(rule.id, ruleState);
  }
  
  console.log(`[单点报警] 规则状态: 已触发=${ruleState.triggered} (已校正)`);
  
  if (isTimeout && !ruleState.triggered) {
    // 触发报警
    console.log(`[单点报警] 🚨 触发无更新报警: ${rule.name} - 数据已超时 ${Math.floor(timeDiff/1000)} 秒`);
    await triggerAlarm(rule, dataValue, notifications);
    ruleStates.set(rule.id, { triggered: true, triggeredAt: now });
  } else if (!isTimeout && ruleState.triggered) {
    // 解除报警
    console.log(`[单点报警] ✅ 解除无更新报警: ${rule.name} - 数据已恢复更新`);
    await clearAlarm(rule, dataValue, notifications);
    ruleStates.set(rule.id, { triggered: false });
  } else {
    console.log(`[单点报警] 无更新报警状态无变化: ${rule.name}, 超时=${isTimeout}, 已触发=${ruleState.triggered}`);
  }
}

// 使用缓存检查阈值报警
async function checkThresholdAlarmWithCache(rule, dataValue, config, notifications) {
  const { operator, value: thresholdValue, duration = 60 } = config;
  const currentValue = parseFloat(dataValue.value);
  const now = new Date();
  
  // 如果数据不可用，跳过阈值检查
  if (!dataValue.available || isNaN(currentValue)) {
    console.log(`[单点报警] 数据点 ${rule.dataPointId} 数据不可用或非数值，跳过阈值检查`);
    return;
  }
  
  let conditionMet = false;
  
  // 判断条件是否满足
  switch (operator) {
    case 'greater_than':
      conditionMet = currentValue > thresholdValue;
      break;
    case 'greater_equal':
      conditionMet = currentValue >= thresholdValue;
      break;
    case 'less_than':
      conditionMet = currentValue < thresholdValue;
      break;
    case 'less_equal':
      conditionMet = currentValue <= thresholdValue;
      break;
    case 'equals':
      conditionMet = currentValue === thresholdValue;
      break;
    case 'not_equals':
      conditionMet = currentValue !== thresholdValue;
      break;
  }
  
  console.log(`[单点报警] 阈值检查: ${currentValue} ${operator} ${thresholdValue} = ${conditionMet}`);
  
  const ruleState = ruleStates.get(rule.id) || { 
    triggered: false, 
    conditionStartTime: null 
  };
  
  if (conditionMet) {
    if (!ruleState.conditionStartTime) {
      // 条件刚开始满足
      ruleState.conditionStartTime = now;
      ruleStates.set(rule.id, ruleState);
      console.log(`[单点报警] 阈值条件开始满足: ${rule.name}`);
    } else if (!ruleState.triggered) {
      // 检查是否已持续足够时间
      const durationMs = duration * 1000;
      if ((now - ruleState.conditionStartTime) >= durationMs) {
        // 触发报警
        console.log(`[单点报警] 🚨 触发阈值报警: ${rule.name} - 条件持续 ${duration} 秒`);
        await triggerAlarm(rule, dataValue, notifications);
        ruleState.triggered = true;
        ruleStates.set(rule.id, ruleState);
      }
    }
  } else {
    // 条件不满足
    if (ruleState.triggered) {
      // 解除报警
      console.log(`[单点报警] ✅ 解除阈值报警: ${rule.name} - 条件不再满足`);
      await clearAlarm(rule, dataValue, notifications);
    }
    // 重置状态
    ruleStates.set(rule.id, { 
      triggered: false, 
      conditionStartTime: null 
    });
  }
}

// 🔧 新增：检查数据库中最近的告警状态
async function checkLastAlarmState(ruleId) {
  return new Promise((resolve) => {
    // 查询该规则的最近一条告警历史记录
    db.get(`
      SELECT triggered 
      FROM single_point_alarm_history 
      WHERE ruleId = ? 
      ORDER BY timestamp DESC 
      LIMIT 1
    `, [ruleId], (err, row) => {
      if (err) {
        console.error(`[单点报警] 查询规则 ${ruleId} 的告警历史失败:`, err);
        resolve(null);
      } else if (row) {
        const triggered = !!row.triggered;
        console.log(`[单点报警] 规则 ${ruleId} 的最近告警状态: ${triggered}`);
        resolve(triggered);
      } else {
        console.log(`[单点报警] 规则 ${ruleId} 没有告警历史记录`);
        resolve(null);
      }
    });
  });
}

// 获取所有报警规则
router.get('/rules', (req, res) => {
  db.all('SELECT * FROM single_point_alarm_rules ORDER BY createdAt DESC', [], (err, rows) => {
    if (err) {
      console.error('获取单点报警规则失败:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
    
    // 解析JSON字段
    const rules = rows.map(row => ({
      ...row,
      config: JSON.parse(row.config),
      notifications: JSON.parse(row.notifications),
      enabled: !!row.enabled
    }));
    
    res.json({ success: true, data: rules });
  });
});

// 创建报警规则
router.post('/rules', (req, res) => {
  const {
    name,
    dataPointId,
    dataPointName,
    alarmType,
    config,
    level = 'medium',
    content,
    notifications = { page: true, sound: false }
  } = req.body;

  // 验证必填字段
  if (!name || !dataPointId || !dataPointName || !alarmType || !config || !content) {
    return res.status(400).json({
      success: false,
      error: '缺少必填字段'
    });
  }

  // 验证报警类型
  if (!['no_update', 'threshold'].includes(alarmType)) {
    return res.status(400).json({
      success: false,
      error: '无效的报警类型'
    });
  }

  const stmt = db.prepare(`
    INSERT INTO single_point_alarm_rules 
    (name, dataPointId, dataPointName, alarmType, config, level, content, notifications, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  stmt.run([
    name,
    dataPointId,
    dataPointName,
    alarmType,
    JSON.stringify(config),
    level,
    content,
    JSON.stringify(notifications)
  ], function(err) {
    if (err) {
      console.error('创建单点报警规则失败:', err);
      return res.status(500).json({ success: false, error: err.message });
    }

    console.log(`单点报警规则创建成功: ${name} (ID: ${this.lastID})`);
    
    // 更新缓存：添加新的监控数据点
    activeDataPoints.add(dataPointId);
    console.log(`[单点报警] 添加监控数据点: ${dataPointId}`);
    
    res.json({
      success: true,
      data: {
        id: this.lastID,
        name,
        dataPointId,
        dataPointName,
        alarmType,
        config,
        level,
        content,
        notifications,
        enabled: true
      }
    });
  });

  stmt.finalize();
});

// 更新报警规则
router.put('/rules/:id', (req, res) => {
  const ruleId = parseInt(req.params.id);
  const {
    name,
    dataPointId,
    dataPointName,
    alarmType,
    config,
    level,
    content,
    notifications
  } = req.body;

  // 先获取原有规则信息
  db.get('SELECT dataPointId FROM single_point_alarm_rules WHERE id = ?', [ruleId], (err, oldRule) => {
    if (err) {
      console.error('获取原有规则失败:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
    
    if (!oldRule) {
      return res.status(404).json({ success: false, error: '规则不存在' });
    }

    const stmt = db.prepare(`
      UPDATE single_point_alarm_rules 
      SET name = ?, dataPointId = ?, dataPointName = ?, alarmType = ?, 
          config = ?, level = ?, content = ?, notifications = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run([
      name,
      dataPointId,
      dataPointName,
      alarmType,
      JSON.stringify(config),
      level,
      content,
      JSON.stringify(notifications),
      ruleId
    ], function(err) {
      if (err) {
        console.error('更新单点报警规则失败:', err);
        return res.status(500).json({ success: false, error: err.message });
      }

      if (this.changes === 0) {
        return res.status(404).json({ success: false, error: '规则不存在' });
      }

      console.log(`单点报警规则更新成功: ID ${ruleId}`);
      
      // 更新缓存：如果数据点ID发生变化，需要更新监控列表
      if (oldRule.dataPointId !== dataPointId) {
        console.log(`[单点报警] 数据点ID变更: ${oldRule.dataPointId} -> ${dataPointId}`);
        
        // 检查旧数据点是否还有其他规则在使用
        db.get('SELECT COUNT(*) as count FROM single_point_alarm_rules WHERE dataPointId = ? AND enabled = 1 AND id != ?', 
          [oldRule.dataPointId, ruleId], 
          (err, result) => {
            if (!err && result.count === 0) {
              // 没有其他规则使用这个数据点，从监控列表中移除
              activeDataPoints.delete(oldRule.dataPointId);
              dataPointCache.delete(oldRule.dataPointId);
              console.log(`[单点报警] 移除监控数据点: ${oldRule.dataPointId}`);
            }
          }
        );
        
        // 添加新数据点到监控列表
        activeDataPoints.add(dataPointId);
        console.log(`[单点报警] 添加监控数据点: ${dataPointId}`);
      }
      
      res.json({ success: true, message: '规则更新成功' });
    });

    stmt.finalize();
  });
});

// 删除报警规则
router.delete('/rules/:id', (req, res) => {
  const ruleId = parseInt(req.params.id);

  // 先获取规则信息用于缓存清理
  db.get('SELECT dataPointId FROM single_point_alarm_rules WHERE id = ?', [ruleId], (err, rule) => {
    if (err) {
      console.error('获取规则失败:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
    
    if (!rule) {
      return res.status(404).json({ success: false, error: '规则不存在' });
    }

    const stmt = db.prepare('DELETE FROM single_point_alarm_rules WHERE id = ?');
    
    stmt.run([ruleId], function(err) {
      if (err) {
        console.error('删除单点报警规则失败:', err);
        return res.status(500).json({ success: false, error: err.message });
      }

      if (this.changes === 0) {
        return res.status(404).json({ success: false, error: '规则不存在' });
      }

      // 清理规则状态
      ruleStates.delete(ruleId);
      
      // 检查是否还有其他规则使用这个数据点
      db.get('SELECT COUNT(*) as count FROM single_point_alarm_rules WHERE dataPointId = ? AND enabled = 1', 
        [rule.dataPointId], 
        (err, result) => {
          if (!err && result.count === 0) {
            // 没有其他规则使用这个数据点，从监控列表和缓存中移除
            activeDataPoints.delete(rule.dataPointId);
            dataPointCache.delete(rule.dataPointId);
            console.log(`[单点报警] 移除监控数据点: ${rule.dataPointId}`);
          }
        }
      );

      console.log(`单点报警规则删除成功: ID ${ruleId}`);
      res.json({ success: true, message: '规则删除成功' });
    });

    stmt.finalize();
  });
});

// 切换规则启用状态
router.patch('/rules/:id/toggle', (req, res) => {
  const ruleId = parseInt(req.params.id);

  // 先获取规则信息
  db.get('SELECT dataPointId, enabled FROM single_point_alarm_rules WHERE id = ?', [ruleId], (err, rule) => {
    if (err) {
      console.error('获取规则失败:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
    
    if (!rule) {
      return res.status(404).json({ success: false, error: '规则不存在' });
    }

    const stmt = db.prepare('UPDATE single_point_alarm_rules SET enabled = NOT enabled, updatedAt = CURRENT_TIMESTAMP WHERE id = ?');
    
    stmt.run([ruleId], function(err) {
      if (err) {
        console.error('切换单点报警规则状态失败:', err);
        return res.status(500).json({ success: false, error: err.message });
      }

      if (this.changes === 0) {
        return res.status(404).json({ success: false, error: '规则不存在' });
      }

      console.log(`单点报警规则状态切换成功: ID ${ruleId}`);
      
      // 更新缓存
      const wasEnabled = rule.enabled;
      const nowEnabled = !wasEnabled;
      
      if (nowEnabled) {
        // 规则被启用，添加到监控列表
        activeDataPoints.add(rule.dataPointId);
        console.log(`[单点报警] 启用规则，添加监控数据点: ${rule.dataPointId}`);
      } else {
        // 规则被禁用，检查是否还有其他启用的规则使用这个数据点
        db.get('SELECT COUNT(*) as count FROM single_point_alarm_rules WHERE dataPointId = ? AND enabled = 1 AND id != ?', 
          [rule.dataPointId, ruleId], 
          (err, result) => {
            if (!err && result.count === 0) {
              // 没有其他启用的规则使用这个数据点，从监控列表中移除
              activeDataPoints.delete(rule.dataPointId);
              dataPointCache.delete(rule.dataPointId);
              console.log(`[单点报警] 禁用规则，移除监控数据点: ${rule.dataPointId}`);
            }
          }
        );
        
        // 清理规则状态
        ruleStates.delete(ruleId);
      }
      
      res.json({ success: true, message: '规则状态切换成功' });
    });

    stmt.finalize();
  });
});

// 获取报警历史
router.get('/history', (req, res) => {
  const { limit = 100, offset = 0, ruleId } = req.query;
  
  let query = 'SELECT * FROM single_point_alarm_history';
  let params = [];
  
  if (ruleId) {
    query += ' WHERE ruleId = ?';
    params.push(parseInt(ruleId));
  }
  
  query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('获取单点报警历史失败:', err);
      return res.status(500).json({ success: false, error: err.message });
    }

    res.json({ success: true, data: rows });
  });
});

// 获取监控状态
router.get('/monitoring/status', (req, res) => {
  res.json({
    success: true,
    data: {
      active: monitoringActive,
      rulesCount: ruleStates.size
    }
  });
});

// 启动/停止监控
router.post('/monitoring/toggle', (req, res) => {
  if (monitoringActive) {
    // 停止监控
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
      monitoringInterval = null;
    }
    monitoringActive = false;
    console.log('单点报警监控已停止');
  } else {
    // 启动监控
    startMonitoring();
    monitoringActive = true;
    console.log('单点报警监控已启动');
  }

  res.json({
    success: true,
    data: { active: monitoringActive }
  });
});

// 启动监控函数（备用方案，主要用于定期清理和状态检查）
function startMonitoring() {
  console.log('[单点报警] 启动监控函数被调用');
  
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
  }

  // 降低检查频率，主要用于无更新报警的备用检查
  monitoringInterval = setInterval(async () => {
    try {
      console.log('[单点报警] 定期备用检查...');
      await performBackupCheck();
    } catch (error) {
      console.error('[单点报警] 备用检查失败:', error);
    }
  }, 30000); // 每30秒进行一次备用检查
  
  console.log('[单点报警] 备用监控定时器已设置，间隔: 30秒');
}

// 执行备用检查（仅检查无更新报警）
async function performBackupCheck() {
  return new Promise((resolve) => {
    // 只获取无更新类型的规则进行备用检查
    db.all('SELECT * FROM single_point_alarm_rules WHERE enabled = 1 AND alarmType = "no_update"', [], async (err, rules) => {
      if (err) {
        console.error('[单点报警] 获取无更新规则失败:', err);
        resolve();
        return;
      }

      if (rules.length === 0) {
        resolve();
        return;
      }

      console.log(`[单点报警] 备用检查 ${rules.length} 个无更新报警规则`);
      
      for (const rule of rules) {
        try {
          await checkSingleRuleWithCache(rule);
        } catch (error) {
          console.error(`[单点报警] 备用检查规则 ${rule.name} 失败:`, error);
        }
      }

      resolve();
    });
  });
}

// 检查无更新报警（原函数保留但重命名，用于向后兼容）
async function checkNoUpdateAlarm(rule, dataValue, config, notifications) {
  // 直接调用缓存版本
  return await checkNoUpdateAlarmWithCache(rule, dataValue, config, notifications);
}

// 检查阈值报警（原函数保留但重命名，用于向后兼容）
async function checkThresholdAlarm(rule, dataValue, config, notifications) {
  // 直接调用缓存版本
  return await checkThresholdAlarmWithCache(rule, dataValue, config, notifications);
}

// 新增API：获取缓存状态
router.get('/cache/status', (req, res) => {
  const cacheStatus = {
    activeDataPoints: Array.from(activeDataPoints),
    cachedDataPoints: Array.from(dataPointCache.keys()),
    cacheDetails: {}
  };
  
  // 获取每个缓存数据点的详细信息
  for (const [dataPointId, data] of dataPointCache.entries()) {
    cacheStatus.cacheDetails[dataPointId] = {
      value: data.value,
      lastUpdate: data.lastUpdate,
      available: data.available,
      timeSinceUpdate: new Date() - new Date(data.lastUpdate)
    };
  }
  
  res.json({
    success: true,
    data: cacheStatus
  });
});

// 新增API：手动更新数据点缓存
router.post('/cache/update/:dataPointId', (req, res) => {
  const dataPointId = req.params.dataPointId;
  const { value, timestamp } = req.body;
  
  if (!activeDataPoints.has(dataPointId)) {
    return res.status(400).json({
      success: false,
      error: '该数据点未在监控列表中'
    });
  }
  
  const updateTime = timestamp ? new Date(timestamp) : new Date();
  
  // 更新缓存
  dataPointCache.set(dataPointId, {
    value: value,
    lastUpdate: updateTime,
    available: true
  });
  
  console.log(`[单点报警] 手动更新数据点缓存: ${dataPointId} = ${value} at ${updateTime.toISOString()}`);
  
  // 立即检查相关规则
  checkRulesForDataPoint(dataPointId);
  
  res.json({
    success: true,
    message: '数据点缓存已更新'
  });
});

// 新增API：清空缓存
router.post('/cache/clear', (req, res) => {
  dataPointCache.clear();
  console.log('[单点报警] 数据点缓存已清空');
  
  res.json({
    success: true,
    message: '缓存已清空'
  });
});

// 新增API：重新初始化缓存
router.post('/cache/reinitialize', (req, res) => {
  console.log('[单点报警] 重新初始化缓存...');
  initializeDataPointCache();
  
  res.json({
    success: true,
    message: '缓存重新初始化已启动'
  });
});

// 测试API - 创建会立即触发的测试报警规则
router.post('/test/create-trigger-rule', (req, res) => {
  console.log('[单点报警] 创建测试触发规则...');
  
  const testRule = {
    name: '测试立即触发报警_' + Date.now(),
    dataPointId: 'NON_EXISTENT_SENSOR_' + Math.random().toString(36).substr(2, 9),
    dataPointName: '不存在的测试传感器',
    alarmType: 'no_update',
    config: { timeout: 1 }, // 1秒超时，几乎立即触发
    level: 'high',
    content: '这是一个测试报警，数据点不存在所以会立即触发',
    notifications: { page: true, sound: true }
  };

  const stmt = db.prepare(`
    INSERT INTO single_point_alarm_rules 
    (name, dataPointId, dataPointName, alarmType, config, level, content, notifications, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  stmt.run([
    testRule.name,
    testRule.dataPointId,
    testRule.dataPointName,
    testRule.alarmType,
    JSON.stringify(testRule.config),
    testRule.level,
    testRule.content,
    JSON.stringify(testRule.notifications)
  ], function(err) {
    if (err) {
      console.error('创建测试规则失败:', err);
      return res.status(500).json({ success: false, error: err.message });
    }

    console.log(`[单点报警] 测试规则创建成功: ${testRule.name} (ID: ${this.lastID})`);
    console.log(`[单点报警] 该规则将在约${testRule.config.timeout}秒后触发报警`);
    
    // 更新缓存：添加测试数据点到监控列表
    activeDataPoints.add(testRule.dataPointId);
    console.log(`[单点报警] 添加测试监控数据点: ${testRule.dataPointId}`);
    
    res.json({
      success: true,
      data: {
        id: this.lastID,
        ...testRule,
        enabled: true,
        message: '测试规则已创建，将在约1秒后触发报警（因为数据点不存在）'
      }
    });
  });

  stmt.finalize();
});

// 测试API - 手动触发检查
router.post('/test/manual-check', async (req, res) => {
  try {
    console.log('[单点报警] 手动触发检查...');
    // 使用新的备用检查函数
    await performBackupCheck();
    res.json({
      success: true,
      message: '手动检查完成，请查看控制台日志'
    });
  } catch (error) {
    console.error('[单点报警] 手动检查失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 触发报警
async function triggerAlarm(rule, dataValue, notifications) {
  try {
    const now = new Date();
    
    // 构建告警内容
    const alarmData = {
      type: 'single_point_alarm',
      ruleId: rule.id,
      ruleName: rule.name,
      dataPointId: rule.dataPointId,
      dataPointName: rule.dataPointName,
      alarmType: rule.alarmType,
      content: rule.content,
      level: rule.level,
      value: dataValue.value,
      timestamp: now.toISOString(),
      triggered: true
    };
    
    console.log(`[单点报警] 触发报警: ${rule.name}`, alarmData);
    
    // 保存到单点报警历史表
    await saveAlarmHistory(rule, dataValue, true, now);
    
    // 发送WebSocket通知到前端
    await sendAlarmNotification(alarmData, notifications);
    
    // 发送到通用告警系统（如果可用）
    try {
      const AlarmDbService = require('../modbus/alarm-db-service');
      const alarmDbService = new AlarmDbService();
      await alarmDbService.storeAlarm({
        identifier: `single_point_${rule.id}`,
        content: rule.content,
        triggerTime: now.toISOString(),
        dataPointName: rule.dataPointName
      });
      console.log(`[单点报警] 告警已保存到通用告警系统`);
    } catch (error) {
      console.warn(`[单点报警] 保存到通用告警系统失败:`, error.message);
    }
    
  } catch (error) {
    console.error(`[单点报警] 触发报警失败:`, error);
  }
}

// 清除报警
async function clearAlarm(rule, dataValue, notifications) {
  try {
    const now = new Date();
    
    // 构建告警清除内容
    const alarmData = {
      type: 'single_point_alarm',
      ruleId: rule.id,
      ruleName: rule.name,
      dataPointId: rule.dataPointId,
      dataPointName: rule.dataPointName,
      alarmType: rule.alarmType,
      content: `${rule.content} - 已恢复`,
      level: rule.level,
      value: dataValue.value,
      timestamp: now.toISOString(),
      triggered: false
    };
    
    console.log(`[单点报警] 清除报警: ${rule.name}`, alarmData);
    
    // 保存到单点报警历史表
    await saveAlarmHistory(rule, dataValue, false, now);
    
    // 发送WebSocket通知到前端
    await sendAlarmNotification(alarmData, notifications);
    
    // 清除通用告警系统中的告警（如果可用）
    try {
      const AlarmDbService = require('../modbus/alarm-db-service');
      const alarmDbService = new AlarmDbService();
      await alarmDbService.clearAlarm(`single_point_${rule.id}`, now.toISOString());
      console.log(`[单点报警] 告警已在通用告警系统中标记为解除`);
    } catch (error) {
      console.warn(`[单点报警] 清除通用告警系统告警失败:`, error.message);
    }
    
  } catch (error) {
    console.error(`[单点报警] 清除报警失败:`, error);
  }
}

// 保存告警历史
async function saveAlarmHistory(rule, dataValue, triggered, timestamp) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO single_point_alarm_history 
      (ruleId, ruleName, dataPointId, dataPointName, alarmType, content, level, triggered, value, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run([
      rule.id,
      rule.name,
      rule.dataPointId,
      rule.dataPointName,
      rule.alarmType,
      triggered ? rule.content : `${rule.content} - 已恢复`,
      rule.level,
      triggered ? 1 : 0,
      dataValue.value || null,
      timestamp.toISOString()
    ], function(err) {
      if (err) {
        console.error('保存单点报警历史失败:', err);
        reject(err);
      } else {
        console.log(`[单点报警] 告警历史已保存: ID ${this.lastID}`);
        resolve(this.lastID);
      }
    });

    stmt.finalize();
  });
}

// 发送告警通知
async function sendAlarmNotification(alarmData, notifications) {
  try {
    // 通过WebSocket发送到前端
    const MQTTService = require('../modules/mqtt-service');
    const mqttService = MQTTService.getInstance();
    
    if (mqttService && mqttService.sendToWebSocketClients) {
      // 发送正确格式的WebSocket消息
      const wsMessage = {
        type: alarmData.triggered ? 'single_point_alarm' : 'single_point_alarm_cleared',
        data: alarmData
      };
      
      mqttService.sendToWebSocketClients(wsMessage);
      console.log(`[单点报警] WebSocket通知已发送: ${wsMessage.type}`);
    } else {
      console.warn(`[单点报警] MQTT服务不可用，无法发送WebSocket通知`);
    }
    
    // 页面通知
    if (notifications.page) {
      console.log(`[单点报警] 📢 页面通知: ${alarmData.content}`);
    }
    
    // 声音通知
    if (notifications.sound) {
      console.log(`[单点报警] 🔔 声音通知: ${alarmData.content}`);
    }
    
  } catch (error) {
    console.error(`[单点报警] 发送通知失败:`, error);
  }
}

// 新增API：重置报警状态
router.post('/rules/:id/reset-state', (req, res) => {
  const ruleId = parseInt(req.params.id);
  
  // 检查规则是否存在
  db.get('SELECT * FROM single_point_alarm_rules WHERE id = ?', [ruleId], (err, rule) => {
    if (err) {
      console.error('获取规则失败:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
    
    if (!rule) {
      return res.status(404).json({ success: false, error: '规则不存在' });
    }
    
    // 重置规则状态
    ruleStates.delete(ruleId);
    console.log(`[单点报警] 手动重置规则 ${ruleId} (${rule.name}) 的状态`);
    
    // 立即检查该规则
    setTimeout(async () => {
      try {
        await checkSingleRuleWithCache(rule);
        console.log(`[单点报警] 已重新检查规则: ${rule.name}`);
      } catch (error) {
        console.error(`[单点报警] 重新检查规则失败:`, error);
      }
    }, 100);
    
    res.json({ 
      success: true, 
      message: `规则 ${rule.name} 的状态已重置并重新检查` 
    });
  });
});

// 新增API：重置所有报警状态
router.post('/reset-all-states', (req, res) => {
  console.log('[单点报警] 手动重置所有规则状态');
  
  const resetCount = ruleStates.size;
  ruleStates.clear();
  
  // 立即进行一次完整检查
  setTimeout(async () => {
    try {
      await performBackupCheck();
      console.log('[单点报警] 所有规则状态已重置并重新检查');
    } catch (error) {
      console.error('[单点报警] 重新检查所有规则失败:', error);
    }
  }, 100);
  
  res.json({ 
    success: true, 
    message: `已重置 ${resetCount} 个规则的状态并重新检查` 
  });
});

// 🔧 新增API：强制重新检查所有规则（不清除状态）
router.post('/force-check-all', (req, res) => {
  console.log('[单点报警] 强制重新检查所有规则');
  
  setTimeout(async () => {
    try {
      console.log('[单点报警] 开始强制检查所有规则...');
      
      // 获取所有启用的规则
      const rules = await new Promise((resolve, reject) => {
        db.all('SELECT * FROM single_point_alarm_rules WHERE enabled = 1', [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      console.log(`[单点报警] 找到 ${rules.length} 个启用的规则`);
      
      // 逐个检查每个规则
      for (const rule of rules) {
        try {
          const ruleWithConfig = {
            ...rule,
            config: JSON.parse(rule.config),
            notifications: JSON.parse(rule.notifications)
          };
          
          console.log(`[单点报警] 强制检查规则: ${ruleWithConfig.name}`);
          await checkSingleRuleWithCache(ruleWithConfig);
        } catch (error) {
          console.error(`[单点报警] 检查规则 ${rule.name} 失败:`, error);
        }
      }
      
      console.log('[单点报警] 强制检查完成');
    } catch (error) {
      console.error('[单点报警] 强制检查失败:', error);
    }
  }, 100);
  
  res.json({ 
    success: true, 
    message: '强制重新检查所有规则已启动' 
  });
});

module.exports = router; 
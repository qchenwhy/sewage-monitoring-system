const express = require('express');
const router = express.Router();
const modbusService = require('../modbus/modbus-service').getInstance();
const modbusDbService = require('../modbus/modbus-db-service').getInstance();
const alarmDbService = require('../modbus/alarm-db-service').getInstance();
const mysql = require('mysql2/promise');
const { storeModbusDataForCurrentHour, uploadDataToDify } = require('../modbus/modbus-data-to-dify');
const dailyReportService = require('../modbus/daily-report-service').getInstance();
const path = require('path');

// 调试路由日志
console.log('========= Modbus路由模块加载 =========');
console.log('- 当前时间:', new Date().toISOString());
console.log('- 已导入模块:', {
  express: !!express,
  router: !!router,
  modbusService: !!modbusService,
  modbusDbService: !!modbusDbService,
  mysql: !!mysql
});

// 中间件：初始化数据库服务
router.use(async (req, res, next) => {
  try {
    // 如果数据库服务还未初始化，进行初始化
    if (!modbusDbService.initialized) {
      console.log('[Modbus路由] 初始化数据库服务...');
      await modbusDbService.initialize(mysql);
      
      // 将数据库连接池添加到 app.locals 中，以便与旧代码兼容
      if (req.app && modbusDbService.getPool) {
        req.app.locals.pool = modbusDbService.getPool();
      }
      
      // 启动自动数据存储功能（每5分钟存储一次数据）
      modbusDbService.startAutoStorage(300000);
    }
    next();
  } catch (error) {
    console.error('[Modbus路由] 数据库服务初始化失败:', error);
    // 继续处理请求，即使数据库初始化失败
    next();
  }
});

// 获取连接状态
router.get('/connection', (req, res) => {
  try {
    const status = modbusService.getConnectionStatus();
    
    // 检查是否达到最大重连次数
    const maxReconnectReached = modbusService.reconnectAttempts >= modbusService.maxReconnectAttempts;
    const connectionFailed = status.lastError && status.lastError.finalFailure;
    
    // 准备连接状态消息
    let statusMessage = status.connected ? '已连接' : '未连接';
    let severityLevel = status.connected ? 'success' : 'warning';
    
    // 如果达到了最大重连次数，提供更明确的错误信息
    if (maxReconnectReached || connectionFailed) {
      statusMessage = `连接失败: 已尝试 ${modbusService.reconnectAttempts} 次重连，无法连接到服务器。`;
      severityLevel = 'error';
    } else if (!status.connected && status.lastError) {
      statusMessage = `连接失败: ${status.lastError.message}。正在尝试重连 (${modbusService.reconnectAttempts}/${modbusService.maxReconnectAttempts})`;
      severityLevel = 'warning';
    }
    
    // 增加更详细的连接信息
    const enhancedStatus = {
      ...status,
      statusMessage,
      severityLevel,
      timestamp: new Date().toISOString(),
      maxReconnectReached,
      reconnectFailed: connectionFailed,
      details: {
        host: status.config.host,
        port: status.config.port,
        unitId: status.config.unitId,
        connectionTime: modbusService.connectionStartTime || null,
        reconnectAttempts: modbusService.reconnectAttempts || 0,
        maxReconnectAttempts: modbusService.maxReconnectAttempts || 5,
        lastError: modbusService.lastConnectionError || null,
        pollingActive: modbusService.isPolling || false,
        pollingInterval: modbusService.configManager.getPollingConfig().interval,
        errorCode: status.lastError ? status.lastError.code : null
      },
      // 增加系统网络状态信息
      systemInfo: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        uptime: process.uptime()
      }
    };
    
    console.log(`获取Modbus连接状态: `, JSON.stringify({
      connected: enhancedStatus.connected,
      statusMessage: enhancedStatus.statusMessage, 
      severityLevel: enhancedStatus.severityLevel,
      reconnectAttempts: enhancedStatus.details.reconnectAttempts,
      maxReconnectAttempts: enhancedStatus.details.maxReconnectAttempts
    }, null, 2));
    
    res.json({
      success: true,
      data: enhancedStatus
    });
  } catch (error) {
    console.error('获取连接状态时发生错误:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// 测试连接有效性，不保持长连接
router.post('/connection/test', async (req, res) => {
  console.log('收到Modbus测试连接请求', req.body);
  try {
    // 获取连接配置
    const config = req.body.config || modbusService.getConnectionConfigFromManager();
    console.log('使用以下配置测试Modbus连接:', JSON.stringify(config));
    
    // 创建临时的ModbusTCP实例测试连接
    const ModbusTCP = require('../modbus/modbus-tcp');
    
    // 为测试连接设置较短的超时时间
    const testConfig = {
      ...config,
      timeout: config.timeout || 3000, // 默认3秒超时
      keepAliveEnabled: false,         // 禁用保活
      pollingInterval: 0               // 禁用轮询
    };
    
    console.log('创建临时ModbusTCP实例进行测试');
    const tempClient = new ModbusTCP(testConfig);
    
    // 添加一个Promise包装的连接测试
    const testConnection = async () => {
      return new Promise((resolve, reject) => {
        // 设置超时
        const connectionTimeout = setTimeout(() => {
          if (tempClient.socket) {
            tempClient.socket.destroy();
          }
          reject(new Error('连接测试超时'));
        }, testConfig.timeout + 500); // 稍微比socket超时长一点
        
        // 设置事件处理
        tempClient.once('connected', () => {
          clearTimeout(connectionTimeout);
          console.log('测试连接成功');
          // 连接成功，但我们不需要保持连接
          setTimeout(() => {
            tempClient.disconnect();
          }, 100);
          resolve(true);
        });
        
        tempClient.once('error', (err) => {
          clearTimeout(connectionTimeout);
          console.error('测试连接失败:', err);
          reject(err);
        });
        
        // 开始连接测试
        console.log('开始测试连接');
        tempClient.connect().catch(err => {
          clearTimeout(connectionTimeout);
          console.error('测试连接过程中发生错误:', err);
          reject(err);
        });
      });
    };
    
    // 执行连接测试
    const testResult = await testConnection();
    
    res.json({
      success: true,
      data: {
        connectionTest: true,
        message: '连接测试成功',
        config: testConfig
      }
    });
  } catch (error) {
    console.error('Modbus测试连接失败:', error);
    // 获取详细的错误信息
    const errorDetails = {
      message: error.message || '未知错误',
      code: error.code || 'UNKNOWN',
      name: error.name || 'Error'
    };
    
    console.error('Modbus测试连接错误详情:', JSON.stringify(errorDetails));
    
    res.status(500).json({
      success: false,
      data: {
        connectionTest: false,
        message: '连接测试失败',
        error: errorDetails.message,
        errorDetails: errorDetails
      }
    });
  }
});

// 建立连接
router.post('/connection', async (req, res) => {
  console.log('收到Modbus连接请求', req.body);
  try {
    // 获取是否跳过轮询的参数
    const skipPolling = req.body.skipPolling === true;
    console.log(`ModbusConnection: skipPolling=${skipPolling}`);
    
    // 先更新配置
    if (req.body.config) {
      console.log('正在更新连接配置:', req.body.config);
      modbusService.updateConnectionConfig(req.body.config);
    }
    
    // 获取当前连接配置
    const config = modbusService.getConnectionConfigFromManager();
    console.log('使用以下配置建立Modbus连接:', config);
    
    // 连接（传递skipPolling参数）
    console.log('开始建立Modbus连接');
    const success = await modbusService.connect(config, skipPolling);
    console.log('Modbus连接成功建立');
    
    res.json({
      success,
      data: modbusService.getConnectionStatus()
    });
  } catch (error) {
    console.error('Modbus连接失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 断开连接
router.delete('/connection', (req, res) => {
  try {
    modbusService.disconnect();
    res.json({
      success: true,
      data: modbusService.getConnectionStatus()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 强制断开连接（不触发自动重连）
router.delete('/connection/force', (req, res) => {
  try {
    const result = modbusService.forceDisconnect();
    res.json({
      success: true,
      data: {
        result,
        status: modbusService.getConnectionStatus()
      }
    });
  } catch (error) {
    console.error('强制断开连接失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// 更新连接配置
router.put('/connection/config', (req, res) => {
  try {
    const newConfig = modbusService.updateConnectionConfig(req.body);
    res.json({
      success: true,
      data: newConfig
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取轮询状态
router.get('/polling', (req, res) => {
  try {
    const status = modbusService.getPollingStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 启动轮询
router.post('/polling/start', (req, res) => {
  try {
    const interval = req.body.interval;
    modbusService.startPolling(interval);
    res.json({
      success: true,
      data: modbusService.getPollingStatus()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 停止轮询
router.post('/polling/stop', (req, res) => {
  try {
    modbusService.stopPolling();
    res.json({
      success: true,
      data: modbusService.getPollingStatus()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 更新轮询配置
router.put('/polling/config', (req, res) => {
  try {
    const newConfig = modbusService.updatePollingConfig(req.body);
    res.json({
      success: true,
      data: newConfig
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取所有数据点
router.get('/datapoints', (req, res) => {
  try {
    console.log('处理获取所有数据点请求');
    const dataPoints = modbusService.getAllDataPoints();
    
    // 检查是否得到了有效的数据点数组
    if (Array.isArray(dataPoints)) {
      console.log(`成功获取${dataPoints.length}个数据点`);
      res.json({
        success: true,
        dataPoints: dataPoints
      });
    } else {
      // 如果不是数组，尝试转换为数组
      let dataPointsArray = [];
      if (typeof dataPoints === 'object' && dataPoints !== null) {
        console.log('数据点格式不是数组，尝试转换');
        dataPointsArray = Object.values(dataPoints);
      }
      
      res.json({
        success: true,
        dataPoints: dataPointsArray
      });
    }
  } catch (error) {
    console.error('获取数据点失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '未知错误'
    });
  }
});

// 添加数据点
router.post('/datapoints', async (req, res) => {
  try {
    // 先添加到配置文件
    const dataPoint = modbusService.addDataPoint(req.body);
    
    // 同步到数据库
    try {
      // 获取数据库管理器
      let dbManager;
      try {
        dbManager = require('../modbus/db-manager');
      } catch (err) {
        console.log('数据库管理器未加载，跳过数据库同步');
      }
      
      if (dbManager && dbManager.initialized) {
        console.log(`同步新数据点到数据库: ${dataPoint.identifier}`);
        
        // 首先检查并添加unit和description字段（如果不存在）
        try {
          // 先检查字段是否存在
          const [columns] = await dbManager.pool.query('DESCRIBE modbus_data_latest');
          const existingColumns = columns.map(col => col.Field);
          
          // 添加unit字段（如果不存在）
          if (!existingColumns.includes('unit')) {
            await dbManager.pool.query(`
              ALTER TABLE modbus_data_latest 
              ADD COLUMN unit VARCHAR(50) NULL COMMENT '数据点单位' AFTER data_type
            `);
            console.log('✓ unit字段添加成功');
          }
          
          // 添加description字段（如果不存在）
          if (!existingColumns.includes('description')) {
            await dbManager.pool.query(`
              ALTER TABLE modbus_data_latest 
              ADD COLUMN description TEXT NULL COMMENT '数据点描述' AFTER ${existingColumns.includes('unit') ? 'unit' : 'data_type'}
            `);
            console.log('✓ description字段添加成功');
          }
        } catch (alterError) {
          // 字段可能已存在，忽略错误
          console.log('字段添加过程中的错误（可能已存在）:', alterError.message);
        }
        
        // 在最新值表中创建初始记录
        const insertQuery = `
          INSERT INTO modbus_data_latest 
          (data_point_id, data_point_identifier, data_point_name, raw_value, value, 
           formatted_value, quality, data_type, unit, description, updated_at) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
          ON DUPLICATE KEY UPDATE 
          data_point_name = VALUES(data_point_name),
          data_type = VALUES(data_type),
          unit = VALUES(unit),
          description = VALUES(description),
          updated_at = NOW()
        `;
        
        const [result] = await dbManager.pool.query(insertQuery, [
          dataPoint.id,
          dataPoint.identifier,
          dataPoint.name,
          JSON.stringify({ value: null }),
          null,
          '无数据',
          'UNKNOWN',
          dataPoint.format || 'UINT16',
          dataPoint.unit || null,
          dataPoint.description || null
        ]);
        
        if (result.affectedRows > 0) {
          console.log(`数据库同步成功: ${dataPoint.identifier}`);
        }
      }
    } catch (dbError) {
      console.error('数据库同步失败:', dbError.message);
      // 不影响主要功能，继续执行
    }
    
    res.json({
      success: true,
      data: dataPoint
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 更新数据点
router.put('/datapoints/:id', async (req, res) => {
  try {
    // 先更新配置文件中的数据点
    const dataPoint = modbusService.updateDataPoint(req.params.id, req.body);
    
    // 同步到数据库
    try {
      // 获取数据库管理器
      let dbManager;
      try {
        dbManager = require('../modbus/db-manager');
      } catch (err) {
        console.log('数据库管理器未加载，跳过数据库同步');
      }
      
      if (dbManager && dbManager.initialized) {
        console.log(`同步数据点配置到数据库: ${dataPoint.identifier}`);
        
        // 首先检查并添加unit和description字段（如果不存在）
        try {
          // 先检查字段是否存在
          const [columns] = await dbManager.pool.query('DESCRIBE modbus_data_latest');
          const existingColumns = columns.map(col => col.Field);
          
          // 添加unit字段（如果不存在）
          if (!existingColumns.includes('unit')) {
            await dbManager.pool.query(`
              ALTER TABLE modbus_data_latest 
              ADD COLUMN unit VARCHAR(50) NULL COMMENT '数据点单位' AFTER data_type
            `);
            console.log('✓ unit字段添加成功');
          }
          
          // 添加description字段（如果不存在）
          if (!existingColumns.includes('description')) {
            await dbManager.pool.query(`
              ALTER TABLE modbus_data_latest 
              ADD COLUMN description TEXT NULL COMMENT '数据点描述' AFTER ${existingColumns.includes('unit') ? 'unit' : 'data_type'}
            `);
            console.log('✓ description字段添加成功');
          }
        } catch (alterError) {
          // 字段可能已存在，忽略错误
          console.log('字段添加过程中的错误（可能已存在）:', alterError.message);
        }
        
        // 更新最新值表中的数据点信息
        const updateQuery = `
          UPDATE modbus_data_latest 
          SET data_point_name = ?, 
              data_type = ?,
              unit = ?,
              description = ?,
              updated_at = NOW()
          WHERE data_point_identifier = ?
        `;
        
        const [result] = await dbManager.pool.query(updateQuery, [
          dataPoint.name,
          dataPoint.format,
          dataPoint.unit || null,
          dataPoint.description || null,
          dataPoint.identifier
        ]);
        
        if (result.affectedRows > 0) {
          console.log(`数据库同步成功: ${dataPoint.identifier}`);
        } else {
          console.log(`数据库中未找到对应记录: ${dataPoint.identifier}`);
        }
      }
    } catch (dbError) {
      console.error('数据库同步失败:', dbError.message);
      // 不影响主要功能，继续执行
    }
    
    res.json({ success: true, dataPoint });
  } catch (error) {
    console.error('更新数据点失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 删除数据点
router.delete('/datapoints/:id', async (req, res) => {
  try {
    // 先获取要删除的数据点信息
    const dataPoint = modbusService.dataPointManager.getDataPointById(req.params.id);
    
    // 从配置文件中删除
    const success = modbusService.deleteDataPoint(req.params.id);
    
    // 如果删除成功且有数据点信息，同步到数据库
    if (success && dataPoint) {
      try {
        // 获取数据库管理器
        let dbManager;
        try {
          dbManager = require('../modbus/db-manager');
        } catch (err) {
          console.log('数据库管理器未加载，跳过数据库同步');
        }
        
        if (dbManager && dbManager.initialized) {
          console.log(`从数据库删除数据点: ${dataPoint.identifier}`);
          
          // 从最新值表中删除记录
          const deleteLatestQuery = `
            DELETE FROM modbus_data_latest 
            WHERE data_point_identifier = ?
          `;
          
          await dbManager.pool.query(deleteLatestQuery, [dataPoint.identifier]);
          
          // 从历史记录表中删除记录（可选，根据需要决定是否保留历史数据）
          // 注释掉历史记录删除，保留历史数据
          /*
          const deleteHistoryQuery = `
            DELETE FROM modbus_data_history 
            WHERE data_point_identifier = ?
          `;
          
          await dbManager.pool.query(deleteHistoryQuery, [dataPoint.identifier]);
          */
          
          console.log(`✓ 数据点已从数据库删除: ${dataPoint.identifier}`);
        }
      } catch (dbError) {
        console.error('从数据库删除数据点失败:', dbError.message);
        // 不影响主要功能，只记录错误
      }
    }
    
    res.json({
      success
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取所有数据点的当前值
router.get('/values', (req, res) => {
  try {
    console.log('===== GET /api/modbus/values 开始 =====');
    console.log('- 时间:', new Date().toISOString());
    
    // 检查是否请求强制刷新
    const forceRefresh = req.query.forceRefresh === 'true';
    if (forceRefresh) {
      console.log('- 前端请求强制刷新数据');
    }
    
    const values = modbusService.getAllDataValues(forceRefresh);
    
    console.log('- 从ModbusService获取到数据值:', {
      数据点数量: Object.keys(values).length,
      数据点列表: Object.keys(values)
    });
    
    // 检查所有的值
    console.log('- 值详情:');
    let hasTransactionIds = 0;
    let hasRawValues = 0;
    
    Object.entries(values).forEach(([key, data]) => {
      console.log(`  - 数据点 ${key}:`, {
        值: data.value,
        格式化值: data.formatted,
        时间戳: data.timestamp,
        事务ID: data.transactionId || '未提供',
        原始值: data.rawValue ? JSON.stringify(data.rawValue) : '未提供'
      });
      
      if (data.transactionId) hasTransactionIds++;
      if (data.rawValue) hasRawValues++;
    });
    
    console.log(`- 统计: ${hasTransactionIds}个数据点有事务ID, ${hasRawValues}个数据点有原始值`);
    
    // 返回响应
    res.json({
      success: true,
      data: values,
      meta: {
        timestamp: new Date().toISOString(),
        count: Object.keys(values).length,
        withTransactionIds: hasTransactionIds,
        withRawValues: hasRawValues,
        forceRefreshed: forceRefresh
      }
    });
    
    console.log('===== GET /api/modbus/values 完成 =====');
  } catch (error) {
    console.error('获取数据值时发生错误:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取最新存储的数据点值 (旧路径，保持兼容性)
router.get('/values/latest', async (req, res) => {
  try {
    console.log(`[调试] 处理 GET /values/latest 请求（旧路径）`);
    
    // 检查连接池是否存在
    if (!req.app.locals.pool) {
      console.error('错误: MySQL连接池未初始化');
      return res.status(500).json({ 
        success: false, 
        message: '数据库连接未初始化，请检查MySQL服务是否正常运行',
        code: 'DB_NOT_INITIALIZED'
      });
    }
    
    // 从数据库获取最新的数据点值
    try {
      const pool = req.app.locals.pool;
      console.log(`[调试] 开始查询数据库 modbus_data_latest 表`);
      console.log(`[调试] 连接池状态:`, {
        connectionLimit: pool.pool.config.connectionLimit,
        queueSize: pool.pool._connectionQueue ? pool.pool._connectionQueue.length : 'unknown',
        acquiringConnections: pool.pool._acquiringConnections ? pool.pool._acquiringConnections.size : 'unknown'
      });
      
      // 先检查表是否存在
      console.log(`[调试] 检查表是否存在...`);
      try {
        const [tables] = await pool.query('SHOW TABLES LIKE "modbus_data_latest"');
        console.log(`[调试] 表检查结果:`, tables.length > 0 ? '表存在' : '表不存在');
        
        if (tables.length === 0) {
          return res.status(404).json({
            success: false,
            message: '数据表不存在，请先初始化数据库表',
            code: 'TABLE_NOT_EXIST'
          });
        }
      } catch (tableCheckError) {
        console.error('检查表存在性失败:', tableCheckError);
      }
      
      // 检查表中有多少行数据
      try {
        const [countResult] = await pool.query('SELECT COUNT(*) as count FROM modbus_data_latest');
        const count = countResult[0].count;
        console.log(`[调试] 表中有 ${count} 行数据`);
      } catch (countError) {
        console.error('获取行数失败:', countError);
      }
      
      const [rows] = await pool.query('SELECT * FROM modbus_data_latest ORDER BY data_point_name');
      console.log(`[调试] 查询成功，返回 ${rows.length} 条数据`);
      
      res.json({
        success: true,
        data: rows,
        timestamp: new Date().toISOString()
      });
    } catch (dbError) {
      console.error('数据库查询失败:', dbError);
      
      // 提供更详细的错误信息
      let errorMessage = '获取最新存储值失败';
      let errorCode = 'DB_QUERY_ERROR';
      
      if (dbError.code === 'ER_NO_SUCH_TABLE') {
        errorMessage = '数据表不存在，请先初始化数据库表';
        errorCode = 'TABLE_NOT_EXIST';
      } else if (dbError.code === 'ECONNREFUSED') {
        errorMessage = '无法连接到MySQL服务器，请确保服务正在运行';
        errorCode = 'DB_CONNECTION_REFUSED';
      } else if (dbError.code === 'ER_ACCESS_DENIED_ERROR') {
        errorMessage = 'MySQL访问被拒绝，请检查用户名和密码';
        errorCode = 'DB_ACCESS_DENIED';
      }
      
      res.status(500).json({ 
        success: false, 
        message: errorMessage,
        code: errorCode,
        details: process.env.NODE_ENV === 'development' ? dbError.message : undefined
      });
    }
  } catch (error) {
    console.error('处理请求时发生错误:', error);
    res.status(500).json({ 
      success: false, 
      message: `获取最新存储值失败: ${error.message}`,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// 获取特定数据点当前值
router.get('/values/:identifier', (req, res) => {
  try {
    const value = modbusService.getDataValue(req.params.identifier);
    if (value === null) {
      res.status(404).json({
        success: false,
        error: `数据点"${req.params.identifier}"不存在或未连接`
      });
      return;
    }
    
    res.json({
      success: true,
      data: value
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 写入数据点的值
router.post('/write', async (req, res) => {
  try {
    const { identifier, value, bitPosition } = req.body;
    
    console.log(`收到写入请求: identifier=${identifier}, value=${value}, bitPosition=${bitPosition}`);
    
    if (!identifier) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: identifier'
      });
    }
    
    if (value === undefined || value === null) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: value'
      });
    }
    
    // 获取数据点信息
    const dataPoint = modbusService.dataPointManager.getDataPointByIdentifier(identifier);
    if (!dataPoint) {
      return res.status(404).json({
        success: false,
        error: `数据点"${identifier}"不存在`
      });
    }
    
    // 检查数据点是否可写
    if (dataPoint.accessMode === 'read') {
      return res.status(403).json({
        success: false,
        error: `数据点"${identifier}"为只读模式，不能写入`
      });
    }
    
    // 解析和验证值
    let parsedValue;
    try {
      // 根据数据点格式解析值
      switch (dataPoint.format) {
        case 'BIT':
          parsedValue = value ? 1 : 0;
          break;
        case 'INT16':
          parsedValue = parseInt(value);
          if (isNaN(parsedValue) || parsedValue < -32768 || parsedValue > 32767) {
            throw new Error('INT16值必须在-32768到32767之间');
          }
          break;
        case 'UINT16':
          parsedValue = parseInt(value);
          if (isNaN(parsedValue) || parsedValue < 0 || parsedValue > 65535) {
            throw new Error('UINT16值必须在0到65535之间');
          }
          break;
        case 'INT32':
          parsedValue = parseInt(value);
          if (isNaN(parsedValue) || parsedValue < -2147483648 || parsedValue > 2147483647) {
            throw new Error('INT32值必须在-2147483648到2147483647之间');
          }
          break;
        case 'UINT32':
          parsedValue = parseInt(value);
          if (isNaN(parsedValue) || parsedValue < 0 || parsedValue > 4294967295) {
            throw new Error('UINT32值必须在0到4294967295之间');
          }
          break;
        case 'FLOAT32':
          parsedValue = parseFloat(value);
          if (isNaN(parsedValue)) {
            throw new Error('FLOAT32值必须是有效的浮点数');
          }
          break;
        default:
          parsedValue = value;
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: `值解析失败: ${error.message}`
      });
    }
    
    console.log(`解析后的值: ${parsedValue}, 数据点格式: ${dataPoint.format}`);
    
    try {
      // 直接发布写入数据到MQTT主题（不进行实际Modbus写入）
      const MQTTService = require('../modules/mqtt-service');
      const mqttService = MQTTService.getInstance();
      
      // 构建要发布的数据对象（键名和键值格式）
      const publishData = {};
      publishData[identifier] = parsedValue;
      
      // 获取全局发布主题，默认为 'data/mqtt'
      const globalPublishTopic = mqttService.settings?.globalPublishTopic || 'data/mqtt';
      
      // 发布到MQTT主题
      let publishSuccess = false;
      if (mqttService && mqttService.client && mqttService.client.connected) {
        publishSuccess = mqttService.publish(globalPublishTopic, publishData, false);
        if (publishSuccess) {
          console.log(`已发布写入数据到MQTT主题 "${globalPublishTopic}":`, publishData);
        } else {
          console.warn(`发布写入数据到MQTT主题失败: ${globalPublishTopic}`);
        }
      } else {
        console.log('MQTT服务未连接，跳过数据发布');
      }
      
      // 构建响应数据
      const responseData = {
        success: true,
        data: {
          identifier,
          value: parsedValue,
          format: dataPoint.format,
          publishedToMQTT: publishSuccess,
          mqttTopic: globalPublishTopic,
          timestamp: new Date().toISOString()
        },
        message: `数据已发布到MQTT主题: ${globalPublishTopic}`
      };
      
      // 如果是BIT格式，添加位信息到响应
      if (dataPoint.format === 'BIT') {
        responseData.data.bitPosition = dataPoint.bitPosition || bitPosition;
        responseData.data.bitValue = parsedValue;
      }
      
      console.log(`写入操作完成，响应数据:`, responseData);
      res.json(responseData);
      
    } catch (error) {
      console.error(`处理写入请求时发生错误:`, error);
      res.status(500).json({
        success: false,
        error: '发布数据到MQTT时发生错误',
        details: error.message
      });
    }
  } catch (error) {
    console.error('处理写入请求时发生异常:', error);
    res.status(500).json({
      success: false,
      error: '处理写入请求时发生异常',
      details: error.message
    });
  }
});

// 新增API: 写入寄存器的多个位
router.post('/api/modbus/bits/write', async (req, res) => {
  try {
    const { address, bitValues } = req.body;
    
    if (!address && address !== 0) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: address'
      });
    }
    
    if (!Array.isArray(bitValues) || bitValues.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'bitValues必须是非空数组'
      });
    }
    
    // 验证位值格式
    for (const bit of bitValues) {
      if (typeof bit.position !== 'number' || bit.position < 0 || bit.position > 15) {
        return res.status(400).json({
          success: false,
          error: `位位置 ${bit.position} 无效，必须是0-15之间的整数`
        });
      }
      
      if (bit.value !== 0 && bit.value !== 1) {
        return res.status(400).json({
          success: false,
          error: `位值 ${bit.value} 无效，必须是0或1`
        });
      }
    }
    
    console.log(`收到多位写入请求: address=${address}, bitValues=`, bitValues);
    
    try {
      // 模拟寄存器值计算（不进行实际Modbus读写）
      let registerValue = 0; // 假设初始值为0，实际应用中可以从缓存或配置中获取
      const originalValue = registerValue;
      
      // 修改指定的位
      const modifiedBits = [];
      
      bitValues.forEach(bit => {
        const { position, value } = bit;
        const originalBitValue = (registerValue >> position) & 1;
        
        if (value === 1) {
          // 设置位
          registerValue |= (1 << position);
        } else {
          // 清除位
          registerValue &= ~(1 << position);
        }
        
        modifiedBits.push({
          position,
          originalValue: originalBitValue,
          newValue: value
        });
      });
      
      // 直接发布写入数据到MQTT主题（不进行实际Modbus写入）
      const MQTTService = require('../modules/mqtt-service');
      const mqttService = MQTTService.getInstance();
      
      // 构建要发布的数据对象（键名和键值格式）
      const publishData = {};
      publishData[`register_${address}`] = registerValue;
      
      // 获取全局发布主题，默认为 'data/mqtt'
      const globalPublishTopic = mqttService.settings?.globalPublishTopic || 'data/mqtt';
      
      // 发布到MQTT主题
      let publishSuccess = false;
      if (mqttService && mqttService.client && mqttService.client.connected) {
        publishSuccess = mqttService.publish(globalPublishTopic, publishData, false);
        if (publishSuccess) {
          console.log(`已发布多位写入数据到MQTT主题 "${globalPublishTopic}":`, publishData);
        } else {
          console.warn(`发布多位写入数据到MQTT主题失败: ${globalPublishTopic}`);
        }
      } else {
        console.log('MQTT服务未连接，跳过多位写入数据发布');
      }
      
      // 转换为十六进制和二进制字符串
      const originalHex = `0x${originalValue.toString(16).padStart(4, '0')}`;
      const newHex = `0x${registerValue.toString(16).padStart(4, '0')}`;
      const originalBinary = originalValue.toString(2).padStart(16, '0');
      const newBinary = registerValue.toString(2).padStart(16, '0');
      
      res.json({
        success: true,
        data: {
          address,
          originalValue,
          newValue: registerValue,
          originalHex,
          newHex,
          originalBinary,
          newBinary,
          modifiedBits,
          publishedToMQTT: publishSuccess,
          mqttTopic: globalPublishTopic,
          timestamp: new Date().toISOString()
        },
        message: `多位数据已发布到MQTT主题: ${globalPublishTopic}`
      });
    } catch (error) {
      console.error(`处理多位写入请求时发生错误:`, error);
      res.status(500).json({
        success: false,
        error: '发布多位数据到MQTT时发生错误',
        details: error.message
      });
    }
  } catch (error) {
    console.error('处理多位写入请求时发生异常:', error);
    res.status(500).json({
      success: false,
      error: '处理多位写入请求时发生异常',
      details: error.message
    });
  }
});

// 添加一个简单的测试连接API端点
router.get('/api/modbus/connection/test', async (req, res) => {
  try {
    const modbusService = ModbusService.getInstance();
    const status = modbusService.getConnectionStatus();
    
    res.json({
      success: true,
      connected: status.connected,
      connectionTime: status.connectionTime,
      stats: status.stats,
      config: {
        host: status.config.host,
        port: status.config.port,
        unitId: status.config.unitId
      }
    });
  } catch (error) {
    console.error('测试连接API出错:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 数据诊断，显示当前所有数据点详细信息
router.get('/diagnostic', (req, res) => {
  try {
    // 获取所有数据点配置
    const dataPoints = modbusService.getAllDataPoints();
    console.log(`获取${dataPoints.length}个数据点的配置信息`);
    
    // 获取当前值
    const values = modbusService.getAllDataValues();
    console.log(`获取${Object.keys(values).length}个数据点的当前值`);
    
    // 获取原始Modbus连接中的数据点配置
    let modbusDataPoints = [];
    try {
      if (modbusService.modbusTCP) {
        modbusDataPoints = modbusService.modbusTCP.getDataPoints();
        console.log(`从ModbusTCP获取${modbusDataPoints.length}个数据点配置`);
      }
    } catch (err) {
      console.error('获取ModbusTCP数据点失败:', err);
    }
    
    // 获取连接状态
    const connectionStatus = modbusService.getConnectionStatus();
    console.log('获取连接状态信息');
    
    // 合并数据点信息
    const diagnosticData = {
      serverTime: new Date().toISOString(),
      connectionStatus,
      dataPointsCount: dataPoints.length,
      valuesCount: Object.keys(values).length,
      modbusDataPointsCount: modbusDataPoints.length,
      dataPointDetails: []
    };
    
    // 为每个数据点创建诊断信息
    dataPoints.forEach(dataPoint => {
      // 获取当前值
      const value = values[dataPoint.name];
      
      // 找到对应的ModbusTCP数据点配置
      const modbusDataPoint = modbusDataPoints.find(mdp => mdp.name === dataPoint.name);
      
      // 构建诊断信息
      const pointDiagnostic = {
        id: dataPoint.id,
        name: dataPoint.name,
        identifier: dataPoint.identifier,
        address: dataPoint.address,
        format: dataPoint.format,
        currentValue: value ? value.value : null,
        currentValueFormatted: value ? value.formatted : null,
        timestamp: value ? value.timestamp : null,
        transactionId: value ? value.transactionId : null,
        rawValue: value ? value.rawValue : null,
        modbusConfig: modbusDataPoint || null
      };
      
      diagnosticData.dataPointDetails.push(pointDiagnostic);
    });
    
    // 按数据点名称排序
    diagnosticData.dataPointDetails.sort((a, b) => {
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      return 0;
    });
    
    res.json({
      success: true,
      data: diagnosticData
    });
  } catch (error) {
    console.error('获取数据诊断信息失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 执行一次性轮询，不开启持续轮询
router.post('/poll-once', async (req, res) => {
  console.log('收到一次性轮询请求');
  try {
    // 检查连接状态
    if (!modbusService.isConnected) {
      return res.status(400).json({
        success: false,
        error: '未连接到Modbus服务器'
      });
    }
    
    // 获取所有数据点
    const dataPoints = modbusService.getAllDataPoints();
    if (!dataPoints || dataPoints.length === 0) {
      return res.status(400).json({
        success: false,
        error: '没有配置数据点'
      });
    }
    
    console.log(`执行一次性轮询读取 ${dataPoints.length} 个数据点...`);
    
    // 执行一次性读取所有数据点
    const results = await modbusService.readDataPoints(dataPoints);
    
    console.log(`一次性轮询完成，成功读取 ${results.filter(r => r.success).length} 个数据点`);
    
    // 返回结果
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      results: results,
      stats: {
        totalPoints: dataPoints.length,
        successfulReads: results.filter(r => r.success).length,
        failedReads: results.filter(r => !r.success).length
      }
    });
  } catch (error) {
    console.error('执行一次性轮询失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取所有数据点
router.get('/data-points', (req, res) => {
  try {
    const dataPoints = modbusService.getAllDataPoints();
    res.json({
      success: true,
      dataPoints: dataPoints
    });
  } catch (error) {
    console.error('获取数据点失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取所有数据点的值
router.get('/data-values', (req, res) => {
  try {
    // 检查连接状态
    if (!modbusService.isConnected) {
      return res.json({
        success: true,
        values: {},
        message: '未连接到Modbus服务器'
      });
    }
    
    // 获取所有数据点值
    const values = modbusService.getAllDataValues();
    
    res.json({
      success: true,
      values: values,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('获取数据点值失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 手动触发Modbus数据存储
router.post('/archive/store', async (req, res) => {
  console.log('收到手动触发Modbus数据存储请求');
  
  try {
    await storeModbusDataForCurrentHour();
    res.json({
      success: true,
      message: 'Modbus数据存储任务已成功执行'
    });
  } catch (error) {
    console.error('手动触发Modbus数据存储失败:', error);
    res.status(500).json({
      success: false,
      message: '数据存储失败',
      error: error.message
    });
  }
});

// 手动触发数据上传到Dify知识库
router.post('/archive/upload', async (req, res) => {
  console.log('收到手动触发数据上传到Dify知识库请求');
  
  const { date } = req.body;
  const dateStr = date || new Date().toISOString().split('T')[0]; // 默认使用当前日期
  
  try {
    const result = await uploadDataToDify(dateStr);
    
    if (result) {
      res.json({
        success: true,
        message: `${dateStr} 的数据已成功上传到Dify知识库`
      });
    } else {
      res.status(400).json({
        success: false,
        message: '上传失败，请检查Dify配置和数据文件是否存在'
      });
    }
  } catch (error) {
    console.error(`手动触发 ${dateStr} 数据上传失败:`, error);
    res.status(500).json({
      success: false,
      message: '上传到Dify知识库失败',
      error: error.message
    });
  }
});

// 手动触发数据存储
router.post('/data/store', async (req, res) => {
  console.log('收到手动触发数据存储请求');
  
  try {
    const result = await modbusDbService.storeCurrentValues();
    
    res.json({
      success: true,
      message: '数据存储成功',
      result: {
        updatedCount: result.updatedCount,
        insertedCount: result.insertedCount,
        historyInsertedCount: result.historyInsertedCount,
        unchangedCount: result.unchangedCount
      }
    });
  } catch (error) {
    console.error('手动触发数据存储失败:', error);
    res.status(500).json({
      success: false,
      message: '数据存储失败',
      error: error.message
    });
  }
});

// 获取当前活跃告警
router.get('/alarms/active', (req, res) => {
  try {
    console.log('==================== 告警调试 ====================');
    console.log('[/api/modbus/alarms/active] 收到获取告警列表请求', new Date().toISOString());
    
    // 获取告警状态
    const alarmState = modbusService.getAlarmState();
    
    if (!alarmState) {
      console.log('[/api/modbus/alarms/active] 告警状态不存在');
      return res.json([]);
    }
    
    console.log('[/api/modbus/alarms/active] 当前告警状态:');
    console.log(`- activeAlarms: ${JSON.stringify(alarmState.activeAlarms)}`);
    console.log(`- alarmFirstTriggerTime: ${JSON.stringify(alarmState.alarmFirstTriggerTime)}`);
    
    // 构建告警列表
    const alarms = alarmState.activeAlarms.map(content => {
      // 获取该告警的首次触发时间
      const firstTriggerTime = alarmState.alarmFirstTriggerTime[content];
      
      // 验证时间格式是否有效
      let validTriggerTime = firstTriggerTime;
      try {
        const testDate = new Date(firstTriggerTime);
        if (isNaN(testDate.getTime())) {
          console.warn(`[/api/modbus/alarms/active] 告警 ${content} 的触发时间格式无效: ${firstTriggerTime}`);
          validTriggerTime = new Date().toISOString(); // 使用当前时间作为备用
        }
      } catch (e) {
        console.error(`[/api/modbus/alarms/active] 解析告警时间出错:`, e);
        validTriggerTime = new Date().toISOString(); // 使用当前时间作为备用
      }
      
      return {
        content,
        firstTriggerTime: validTriggerTime
      };
    });
    
    console.log(`[/api/modbus/alarms/active] 返回 ${alarms.length} 个告警:`, JSON.stringify(alarms, null, 2));
    console.log('==================== 告警调试结束 ====================');
    
    res.json(alarms);
  } catch (error) {
    console.error('[/api/modbus/alarms/active] 获取告警列表失败:', error);
    res.status(500).json({
      success: false,
      message: '测试告警出错: ' + error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 更新告警状态
router.post('/alarms/update', async (req, res) => {
  try {
    console.log('==================== 告警调试 ====================');
    console.log('[/api/modbus/alarms/update] 收到更新告警状态请求', new Date().toISOString());
    console.log('[/api/modbus/alarms/update] 请求体:', JSON.stringify(req.body, null, 2));
    
    const { identifier, content, triggerTime } = req.body;
    
    if (!identifier || !content) {
      console.error('[/api/modbus/alarms/update] 缺少必要的告警信息');
      return res.status(400).json({
        success: false,
        error: '缺少必要的告警信息'
      });
    }
    
    // 获取ModbusTCP实例
    const modbusTCP = modbusService.getModbusTCP();
    
    if (!modbusTCP) {
      console.error('[/api/modbus/alarms/update] ModbusTCP实例不存在');
      return res.status(500).json({
        success: false,
        error: 'ModbusTCP实例不存在'
      });
    }
    
    try {
      // 调用triggerAlarm方法并确保响应不会导致服务停止
      console.log(`[/api/modbus/alarms/update] 调用modbusTCP.triggerAlarm(${identifier}, ${content})`);
      const alarmResult = modbusTCP.triggerAlarm(identifier, content);
      console.log('[/api/modbus/alarms/update] triggerAlarm结果:', alarmResult);
      
      // 这里是唯一存储告警到数据库的地方
      try {
        // 获取告警数据库服务
        const alarmDbService = modbusService.alarmDbService;
        
        if (alarmDbService) {
          if (!alarmDbService.initialized) {
            console.log('[/api/modbus/alarms/update] 初始化告警数据库服务...');
            await alarmDbService.initialize();
          }
          
          // 准备告警数据
          const alarmData = {
            identifier: identifier,
            content: content,
            triggerTime: triggerTime || alarmResult?.firstTriggerTime || new Date().toISOString(),
            dataPointId: identifier,
            dataPointName: req.body.dataPointName || content.split(' ')[0] // 简单提取数据点名称
          };
          
          console.log('[/api/modbus/alarms/update] 存储告警到数据库，这是唯一存储点:', alarmData);
          console.log('[/api/modbus/alarms/update] ========== 告警存储唯一入口 ========== ');
          const storedAlarm = await alarmDbService.storeAlarm(alarmData);
          
          if (storedAlarm) {
            console.log('[/api/modbus/alarms/update] 告警已存储到数据库:', storedAlarm.id);
          } else {
            console.log('[/api/modbus/alarms/update] 告警存储到数据库返回空结果');
          }
        } else {
          console.warn('[/api/modbus/alarms/update] 告警数据库服务不可用');
        }
      } catch (dbError) {
        // 仅记录数据库错误，不影响API响应
        console.error('[/api/modbus/alarms/update] 存储告警到数据库失败:', dbError);
      }
      
      console.log('[/api/modbus/alarms/update] 告警已触发和存储');
      console.log('==================== 告警调试结束 ====================');
      
      // 发送成功响应
      return res.json({
        success: true,
        message: '告警已触发和存储',
        alarm: {
          identifier,
          content,
          triggerTime: alarmResult ? alarmResult.firstTriggerTime : new Date().toISOString()
        }
      });
    } catch (triggerError) {
      console.error('[/api/modbus/alarms/update] 触发告警失败:', triggerError);
      
      // 即使触发失败，也不中断进程，返回错误响应
      return res.status(500).json({
        success: false,
        error: '触发告警失败: ' + triggerError.message,
        alarm: {
          identifier,
          content
        }
      });
    }
  } catch (error) {
    // 捕获任何可能的异常
    console.error('[/api/modbus/alarms/update] 处理告警请求时发生未预期的错误:', error);
    console.log('==================== 告警调试结束 ====================');
    
    // 确保在出错时也能返回响应
    return res.status(500).json({
      success: false,
      error: '处理告警请求失败: ' + error.message
    });
  }
});

// 清除告警
router.post('/alarms/clear', async (req, res) => {
  try {
    console.log('==================== 告警解除调试 ====================');
    console.log('[/api/modbus/alarms/clear] 收到清除告警请求', new Date().toISOString());
    console.log('[/api/modbus/alarms/clear] 请求体:', JSON.stringify(req.body, null, 2));
    
    const { identifier, content, clearedTime } = req.body;
    
    if (!identifier) {
      console.error('[/api/modbus/alarms/clear] 缺少必要的告警标识符');
      return res.status(400).json({
        success: false,
        error: '缺少必要的告警标识符'
      });
    }
    
    // 使用提供的时间或当前时间
    const actualClearedTime = clearedTime || new Date().toISOString();
    
    // 先尝试更新数据库，这是主要的告警解除操作
    let dbUpdateResult = null;
    try {
      console.log('[/api/modbus/alarms/clear] 确保告警状态更新到数据库');
      
      // 直接导入告警数据库服务
      let alarmDbService;
      try {
        const AlarmDbService = require('../modbus/alarm-db-service');
        alarmDbService = AlarmDbService.getInstance();
      } catch (importError) {
        console.error('[/api/modbus/alarms/clear] 导入告警数据库服务失败:', importError);
        throw importError;
      }
      
      if (alarmDbService) {
        if (!alarmDbService.initialized) {
          console.log('[/api/modbus/alarms/clear] 初始化告警数据库服务...');
          await alarmDbService.initialize();
        }
        
        // 准备告警数据
        const alarmToClear = {
          identifier: identifier,
          content: content,
          clearedTime: actualClearedTime
        };
        
        console.log('[/api/modbus/alarms/clear] 更新告警状态为已清除:', alarmToClear);
        console.log('[/api/modbus/alarms/clear] ========== 告警清除唯一入口 ========== ');
        dbUpdateResult = await alarmDbService.clearAlarm(alarmToClear);
        
        if (dbUpdateResult) {
          console.log('[/api/modbus/alarms/clear] 告警状态已更新为已清除:', dbUpdateResult.id || dbUpdateResult);
        } else {
          console.log('[/api/modbus/alarms/clear] 未找到匹配的活跃告警记录');
        }
      } else {
        console.warn('[/api/modbus/alarms/clear] 告警数据库服务不可用');
        throw new Error('告警数据库服务不可用');
      }
    } catch (dbError) {
      console.error('[/api/modbus/alarms/clear] 更新数据库告警状态失败:', dbError);
      console.log('==================== 告警解除调试结束 ====================');
      return res.status(500).json({
        success: false,
        error: '更新数据库告警状态失败: ' + dbError.message
      });
    }
    
    // 尝试清除ModbusTCP中的告警（如果实例存在）
    let modbusClearResult = false;
    try {
      const modbusTCP = modbusService.getModbusTCP();
      if (modbusTCP) {
        console.log(`[/api/modbus/alarms/clear] 调用modbusTCP.clearAlarm(${identifier}, ${content})`);
        modbusClearResult = modbusTCP.clearAlarm(identifier, content);
        console.log('[/api/modbus/alarms/clear] clearAlarm结果:', modbusClearResult);
      } else {
        console.log('[/api/modbus/alarms/clear] ModbusTCP实例不存在，跳过ModbusTCP告警清除');
      }
    } catch (clearError) {
      console.error('[/api/modbus/alarms/clear] 清除ModbusTCP告警失败:', clearError);
      // 继续处理，不中断流程
    }
    
    // 判断清除操作的整体结果
    if (dbUpdateResult) {
      console.log('[/api/modbus/alarms/clear] 告警已成功清除(数据库操作成功)');
      console.log('==================== 告警解除调试结束 ====================');
      
      return res.json({
        success: true,
        message: '告警已清除',
        modbusClearResult: modbusClearResult,
        dbUpdateResult: !!dbUpdateResult,
        alarm: {
          identifier,
          content,
          clearedTime: actualClearedTime
        }
      });
    } else {
      console.warn('[/api/modbus/alarms/clear] 找不到匹配的告警或清除失败');
      console.log('==================== 告警解除调试结束 ====================');
      
      return res.status(404).json({
        success: false,
        error: '找不到匹配的告警或清除失败',
        alarm: {
          identifier,
          content
        }
      });
    }
  } catch (error) {
    console.error('[/api/modbus/alarms/clear] 处理告警清除请求时发生未预期的错误:', error);
    console.log('==================== 告警解除调试结束 ====================');
    
    // 确保即使在出错时也返回响应
    return res.status(500).json({
      success: false,
      error: '处理告警清除请求失败: ' + error.message
    });
  }
});

// 获取告警历史记录
router.get('/alarms/history', async (req, res) => {
  try {
    console.log('==================== 告警历史调试 ====================');
    console.log('[/api/modbus/alarms/history] 收到获取告警历史记录请求', new Date().toISOString());
    console.log('[/api/modbus/alarms/history] 查询参数:', req.query);

    // 获取查询参数
    const { startTime, endTime, status, limit = 100, offset = 0 } = req.query;
    
    // 如果服务未初始化，尝试初始化
    if (!alarmDbService.initialized) {
      console.log('[/api/modbus/alarms/history] 告警数据库服务未初始化，尝试初始化...');
      try {
        await alarmDbService.initialize();
        console.log('[/api/modbus/alarms/history] 告警数据库服务初始化成功');
      } catch (initError) {
        console.error('[/api/modbus/alarms/history] 初始化告警数据库服务失败:', initError);
        return res.status(500).json({
          success: false,
          error: '初始化告警数据库服务失败'
        });
      }
    }
    
    // 查询告警历史记录
    console.log('[/api/modbus/alarms/history] 开始查询告警历史...');
    const alarms = await alarmDbService.getAlarmHistory({
      startTime,
      endTime,
      status,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    console.log(`[/api/modbus/alarms/history] 查询到 ${alarms.length} 条告警记录`);
    console.log('==================== 告警历史调试结束 ====================');
    
    return res.json({
      success: true,
      alarms,
      count: alarms.length,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('[/api/modbus/alarms/history] 获取告警历史记录失败:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取当前活跃告警（从数据库）
router.get('/alarms/active-db', async (req, res) => {
  try {
    console.log('==================== 活跃告警数据库调试 ====================');
    console.log('[/api/modbus/alarms/active-db] 收到获取活跃告警列表请求', new Date().toISOString());
    
    // 如果服务未初始化，尝试初始化
    if (!alarmDbService.initialized) {
      console.log('[/api/modbus/alarms/active-db] 告警数据库服务未初始化，尝试初始化...');
      try {
        await alarmDbService.initialize();
        console.log('[/api/modbus/alarms/active-db] 告警数据库服务初始化成功');
      } catch (initError) {
        console.error('[/api/modbus/alarms/active-db] 初始化告警数据库服务失败:', initError);
        return res.status(500).json({
          success: false,
          error: '初始化告警数据库服务失败'
        });
      }
    }
    
    // 查询活跃告警
    console.log('[/api/modbus/alarms/active-db] 开始查询活跃告警...');
    const activeAlarms = await alarmDbService.getActiveAlarms();
    
    console.log(`[/api/modbus/alarms/active-db] 查询到 ${activeAlarms.length} 条活跃告警`);
    console.log('==================== 活跃告警数据库调试结束 ====================');
    
    return res.json({
      success: true,
      alarms: activeAlarms,
      count: activeAlarms.length
    });
  } catch (error) {
    console.error('[/api/modbus/alarms/active-db] 获取活跃告警失败:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取日报列表
router.get('/reports', async (req, res) => {
  try {
    const options = {
      limit: parseInt(req.query.limit) || 10,
      offset: parseInt(req.query.offset) || 0,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      type: req.query.type
    };
    
    const result = await dailyReportService.getReportList(options);
    
    res.json({
      success: true,
      reports: result.reports,
      total: result.total,
      pagination: {
        limit: options.limit,
        offset: options.offset,
        total: result.total
      }
    });
  } catch (error) {
    console.error('获取日报列表失败:', error);
    res.status(500).json({
      success: false,
      error: '获取日报列表失败: ' + error.message
    });
  }
});

// 获取单个日报详情
router.get('/reports/:id', async (req, res) => {
  try {
    const reportId = parseInt(req.params.id);
    if (isNaN(reportId)) {
      return res.status(400).json({
        success: false,
        error: '无效的日报ID'
      });
    }
    
    const report = await dailyReportService.getReportById(reportId);
    
    res.json({
      success: true,
      report
    });
  } catch (error) {
    console.error('获取日报详情失败:', error);
    res.status(500).json({
      success: false,
      error: '获取日报详情失败: ' + error.message
    });
  }
});

// 删除日报
router.delete('/reports/:id', async (req, res) => {
  try {
    const reportId = parseInt(req.params.id);
    if (isNaN(reportId)) {
      return res.status(400).json({
        success: false,
        error: '无效的日报ID'
      });
    }
    
    // 调用服务删除日报
    const result = await dailyReportService.deleteReport(reportId);
    
    res.json({
      success: true,
      message: `已成功删除ID为 ${reportId} 的日报`
    });
  } catch (error) {
    console.error('删除日报失败:', error);
    res.status(500).json({
      success: false,
      error: '删除日报失败: ' + error.message
    });
  }
});

// 手动触发生成日报
router.post('/reports/generate', async (req, res) => {
  try {
    const targetDate = req.body.targetDate;
    if (!targetDate) {
      return res.status(400).json({
        success: false,
        error: '请提供目标日期 (targetDate)'
      });
    }
    
    // 验证日期格式 (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      return res.status(400).json({
        success: false,
        error: '日期格式无效，请使用YYYY-MM-DD格式'
      });
    }
    
    const result = await dailyReportService.triggerReportGeneration(targetDate);
    
    res.json({
      success: result.success,
      message: result.message,
      reportId: result.reportId
    });
  } catch (error) {
    console.error('触发日报生成失败:', error);
    res.status(500).json({
      success: false,
      error: '触发日报生成失败: ' + error.message
    });
  }
});

// 上传日报到知识库
router.post('/reports/:id/upload-to-knowledge', async (req, res) => {
  try {
    const reportId = parseInt(req.params.id);
    if (isNaN(reportId)) {
      return res.status(400).json({
        success: false,
        error: '无效的日报ID'
      });
    }
    
    console.log(`接收到上传日报(ID:${reportId})到知识库的请求`);
    
    // 获取日报内容
    const report = await dailyReportService.getReportById(reportId);
    
    if (!report) {
      return res.status(404).json({
        success: false,
        error: '未找到对应ID的日报'
      });
    }
    
    // 从req.body中获取可选的标签
    const { tags } = req.body;
    
    // 准备日报数据
    const reportData = {
      date: report.report_date,
      content: report.report_content,
      originalData: JSON.parse(report.original_json || '{}'),
      tags: tags || ['日报', report.report_date, '设备监控', 'Modbus']
    };
    
    // 获取Dify知识库服务实例
    const DifyKnowledgeService = require('../modbus/dify-knowledge-service');
    const difyService = DifyKnowledgeService.getInstance();
    
    // 确保服务已经初始化
    if (!difyService.initialized) {
      await difyService.initialize();
    }
    
    // 上传日报到知识库
    const uploadResult = await difyService.uploadDailyReportToDify(reportData);
    
    if (!uploadResult.success) {
      throw new Error(`上传日报到知识库失败: ${uploadResult.error}`);
    }
    
    console.log(`日报(ID:${reportId})已成功上传到知识库，文档ID: ${uploadResult.documentId}`);
    
    res.json({
      success: true,
      message: '日报已成功上传到知识库',
      documentId: uploadResult.documentId,
      documentTitle: uploadResult.documentTitle
    });
  } catch (error) {
    console.error('上传日报到知识库失败:', error);
    res.status(500).json({
      success: false,
      error: '上传日报到知识库失败: ' + error.message
    });
  }
});

// 诊断知识库文档状态
router.get('/knowledge/diagnose/:documentId', async (req, res) => {
  try {
    const documentId = req.params.documentId;
    if (!documentId) {
      return res.status(400).json({
        success: false,
        error: '请提供文档ID'
      });
    }
    
    console.log(`开始诊断知识库文档(ID:${documentId})的状态`);
    
    // 获取Dify知识库服务实例
    const DifyKnowledgeService = require('../modbus/dify-knowledge-service');
    const difyService = DifyKnowledgeService.getInstance();
    
    // 确保服务已经初始化
    if (!difyService.initialized) {
      await difyService.initialize();
    }
    
    // 诊断文档状态
    const diagnosisResult = await difyService.diagnoseDailyReportDocument(documentId);
    
    res.json({
      success: true,
      documentId: documentId,
      diagnosis: diagnosisResult
    });
  } catch (error) {
    console.error('诊断知识库文档状态失败:', error);
    res.status(500).json({
      success: false,
      error: '诊断知识库文档状态失败: ' + error.message
    });
  }
});

// 测试上传文档到知识库
router.post('/test-knowledge-upload', async (req, res) => {
  try {
    console.log('收到测试上传文档到知识库的请求');
    
    // 获取测试内容
    const { content, length = 'short' } = req.body;
    
    // 当前日期
    const currentDate = new Date().toISOString().split('T')[0];
    
    // 根据长度参数生成不同大小的测试文档内容
    let testContent = content || '这是一个测试文档内容。';
    
    // 根据指定长度调整内容
    if (length === 'medium' && testContent.length < 500) {
      while (testContent.length < 500) {
        testContent += ' ' + testContent;
      }
    } else if (length === 'long' && testContent.length < 2000) {
      while (testContent.length < 2000) {
        testContent += ' ' + testContent;
      }
    }
    
    // 创建测试标题
    const title = `测试文档_${length}_${Date.now()}`;
    
    // 准备测试日报数据
    const testReportData = {
      date: currentDate,
      content: testContent,
      originalData: {
        testData: true,
        generatedAt: new Date().toISOString(),
        length: length,
        contentLength: testContent.length
      },
      tags: ['测试', '文档', length, currentDate, `长度_${testContent.length}`]
    };
    
    console.log('准备上传测试文档:');
    console.log(`- 标题: ${title}`);
    console.log(`- 日期: ${currentDate}`);
    console.log(`- 内容长度: ${testContent.length} 字符`);
    console.log(`- 类型: ${length}`);
    
    // 获取Dify知识库服务实例
    const DifyKnowledgeService = require('../modbus/dify-knowledge-service');
    const difyService = DifyKnowledgeService.getInstance();
    
    // 确保服务已经初始化
    if (!difyService.initialized) {
      await difyService.initialize();
    }
    
    // 上传测试文档到知识库
    const uploadResult = await difyService.uploadDailyReportToDify(testReportData);
    
    if (!uploadResult.success) {
      throw new Error(`上传测试文档到知识库失败: ${uploadResult.error}`);
    }
    
    console.log(`测试文档已成功上传到知识库，文档ID: ${uploadResult.documentId}`);
    
    // 尝试诊断文档
    try {
      console.log('尝试诊断刚上传的文档...');
      const diagnosisResult = await difyService.diagnoseDailyReportDocument(uploadResult.documentId);
      
      res.json({
        success: true,
        message: '测试文档已成功上传到知识库',
        documentId: uploadResult.documentId,
        documentTitle: uploadResult.documentTitle,
        documentLength: testContent.length,
        segmentCount: diagnosisResult.segmentCount || '未知',
        segmentsCompleted: diagnosisResult.segmentsCompleted || 0,
        diagnosis: diagnosisResult
      });
    } catch (diagnosisError) {
      console.error('诊断文档失败，但上传可能已成功:', diagnosisError);
      
      res.json({
        success: true,
        message: '测试文档已成功上传到知识库，但诊断失败',
        documentId: uploadResult.documentId,
        documentTitle: uploadResult.documentTitle,
        documentLength: testContent.length,
        diagnosisError: diagnosisError.message
      });
    }
  } catch (error) {
    console.error('测试上传文档到知识库失败:', error);
    res.status(500).json({
      success: false,
      error: '测试上传文档到知识库失败: ' + error.message
    });
  }
});

// 手动同步工作任务到modbus_data_latest表
router.post('/work-tasks/sync', async (req, res) => {
  try {
    console.log('收到手动同步工作任务请求');
    
    // 获取工作任务同步服务实例
    const workTaskSyncService = require('../modbus/work-task-sync-service');
    
    // 确保服务已经初始化
    if (!workTaskSyncService.initialized) {
      await workTaskSyncService.initialize();
    }
    
    // 执行同步
    const result = await workTaskSyncService.manualSync();
    
    if (result.success) {
      res.json({
        success: true,
        message: '工作任务同步成功',
        date: result.date,
        regularTasksCount: result.regularTasksCount,
        tempTasksCount: result.tempTasksCount
      });
    } else {
      res.status(500).json({
        success: false,
        message: '工作任务同步失败',
        error: result.error
      });
    }
  } catch (error) {
    console.error('手动同步工作任务失败:', error);
    res.status(500).json({
      success: false,
      error: '手动同步工作任务失败: ' + error.message
    });
  }
});

// 获取工作任务同步状态
router.get('/work-tasks/sync/status', async (req, res) => {
  try {
    console.log('收到获取工作任务同步状态请求');
    
    // 获取工作任务同步服务实例
    const workTaskSyncService = require('../modbus/work-task-sync-service');
    
    // 返回同步状态
    res.json({
      success: true,
      initialized: workTaskSyncService.initialized,
      syncActive: !!workTaskSyncService.syncTimer,
      syncHour: workTaskSyncService.syncHour,
      syncMinute: workTaskSyncService.syncMinute,
      lastSyncDate: workTaskSyncService.lastSyncDate,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('获取工作任务同步状态失败:', error);
    res.status(500).json({
      success: false,
      error: '获取工作任务同步状态失败: ' + error.message
    });
  }
});

// 配置工作任务同步时间
router.post('/work-tasks/sync/configure', async (req, res) => {
  try {
    console.log('收到配置工作任务同步时间请求:', req.body);
    
    const { hour, minute, restart = true } = req.body;
    
    // 验证输入
    if (hour === undefined || minute === undefined) {
      return res.status(400).json({
        success: false,
        error: '小时和分钟参数是必需的'
      });
    }
    
    // 验证小时和分钟的有效范围
    const hourValue = parseInt(hour);
    const minuteValue = parseInt(minute);
    
    if (isNaN(hourValue) || hourValue < 0 || hourValue > 23) {
      return res.status(400).json({
        success: false,
        error: '小时必须是0-23之间的整数'
      });
    }
    
    if (isNaN(minuteValue) || minuteValue < 0 || minuteValue > 59) {
      return res.status(400).json({
        success: false,
        error: '分钟必须是0-59之间的整数'
      });
    }
    
    // 获取工作任务同步服务实例
    const workTaskSyncService = require('../modbus/work-task-sync-service');
    
    // 确保服务已经初始化
    if (!workTaskSyncService.initialized) {
      await workTaskSyncService.initialize();
    }
    
    // 如果已经在运行，先停止当前任务
    if (workTaskSyncService.syncTimer && restart) {
      workTaskSyncService.stopSync();
    }
    
    // 更新配置并启动同步任务
    const options = { hour: hourValue, minute: minuteValue };
    
    // 如果用户指定不重启，则只更新配置
    if (!restart) {
      workTaskSyncService.syncHour = hourValue;
      workTaskSyncService.syncMinute = minuteValue;
      
      return res.json({
        success: true,
        message: '同步时间配置已更新',
        hour: hourValue,
        minute: minuteValue,
        syncActive: !!workTaskSyncService.syncTimer
      });
    }
    
    // 启动同步任务
    const result = workTaskSyncService.startSync(options);
    
    res.json({
      success: true,
      message: result ? '同步时间配置已更新并重启同步任务' : '同步时间配置已更新',
      hour: hourValue,
      minute: minuteValue,
      syncActive: !!workTaskSyncService.syncTimer
    });
  } catch (error) {
    console.error('配置工作任务同步时间失败:', error);
    res.status(500).json({
      success: false,
      error: '配置工作任务同步时间失败: ' + error.message
    });
  }
});

// 更新工作任务的完成状态
router.put('/work-tasks/status/:id', async (req, res) => {
  try {
    const dataPointId = req.params.id;
    const { status } = req.body;
    
    if (!status || !['pending', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: '状态无效，必须为 pending、completed 或 cancelled'
      });
    }
    
    console.log(`收到更新数据点 ${dataPointId} 的工作任务状态请求: ${status}`);
    
    // 获取数据库连接
    const mysql = require('mysql2/promise');
    const dbConfig = require('../modbus/db-config').dbConfig;
    const connection = await mysql.createConnection(dbConfig);
    
    try {
      // 查询该数据点是否存在
      const [rows] = await connection.execute(
        'SELECT * FROM modbus_data_latest WHERE data_point_id = ? OR data_point_identifier = ?',
        [dataPointId, dataPointId]
      );
      
      if (rows.length === 0) {
        await connection.end();
        return res.status(404).json({
          success: false,
          error: `未找到ID为 ${dataPointId} 的数据点`
        });
      }
      
      // 更新工作状态
      await connection.execute(
        'UPDATE modbus_data_latest SET work_status = ? WHERE data_point_id = ? OR data_point_identifier = ?',
        [status, dataPointId, dataPointId]
      );
      
      // 如果有task_id，同时更新临时工作任务表
      if (rows[0].task_id && rows[0].work_type === 'temporary') {
        await connection.execute(
          'UPDATE temporary_work_tasks SET status = ? WHERE id = ?',
          [status, rows[0].task_id]
        );
        console.log(`已更新临时工作任务 ${rows[0].task_id} 的状态为 ${status}`);
      }
      
      await connection.end();
      
      res.json({
        success: true,
        message: '工作任务状态已更新',
        data: {
          dataPointId,
          status,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      await connection.end();
      throw error;
    }
  } catch (error) {
    console.error('更新工作任务状态失败:', error);
    res.status(500).json({
      success: false,
      error: '更新工作任务状态失败: ' + error.message
    });
  }
});

// 获取带工作任务的数据点列表
router.get('/data-points/with-tasks', async (req, res) => {
  try {
    console.log('收到获取带工作任务的数据点列表请求');
    
    // 获取查询参数
    const { workType, status } = req.query;
    
    // 构建查询条件
    let whereClause = 'work_content IS NOT NULL';
    const params = [];
    
    if (workType) {
      whereClause += ' AND work_type = ?';
      params.push(workType);
    }
    
    if (status) {
      whereClause += ' AND work_status = ?';
      params.push(status);
    }
    
    // 获取数据库连接
    const mysql = require('mysql2/promise');
    const dbConfig = require('../modbus/db-config').dbConfig;
    const connection = await mysql.createConnection(dbConfig);
    
    try {
      // 查询带工作任务的数据点
      const [rows] = await connection.execute(
        `SELECT 
          id, data_point_id, data_point_identifier, data_point_name, 
          work_content, work_type, work_status, task_id, updated_at,
          value, formatted_value, quality
        FROM modbus_data_latest 
        WHERE ${whereClause}
        ORDER BY updated_at DESC`,
        params
      );
      
      await connection.end();
      
      res.json({
        success: true,
        dataPoints: rows,
        count: rows.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      await connection.end();
      throw error;
    }
  } catch (error) {
    console.error('获取带工作任务的数据点列表失败:', error);
    res.status(500).json({
      success: false,
      error: '获取带工作任务的数据点列表失败: ' + error.message
    });
  }
});

// 获取最小建议轮询间隔信息
router.get('/polling/min-interval', (req, res) => {
  try {
    console.log('收到获取最小建议轮询间隔请求');
    
    // 调用ModbusService中的getMinPollingIntervalInfo方法
    const intervalInfo = modbusService.getMinPollingIntervalInfo();
    
    res.json({
      success: true,
      data: intervalInfo
    });
  } catch (error) {
    console.error('获取最小建议轮询间隔信息失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取MQTT配置
router.get('/mqtt/config', (req, res) => {
  try {
    console.log('收到获取MQTT配置请求');
    
    // 获取MQTT配置
    const mqttConfig = modbusService.configManager.getMqttConfig();
    
    res.json({
      success: true,
      data: mqttConfig
    });
  } catch (error) {
    console.error('获取MQTT配置失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 更新MQTT配置
router.put('/mqtt/config', (req, res) => {
  try {
    console.log('收到更新MQTT配置请求:', req.body);
    
    // 更新MQTT配置
    const newConfig = modbusService.configManager.updateMqttConfig(req.body);
    
    res.json({
      success: true,
      data: newConfig
    });
  } catch (error) {
    console.error('更新MQTT配置失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// MQTT连接测试
router.post('/mqtt/test-connection', async (req, res) => {
  try {
    const { url, options } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'MQTT服务器地址不能为空'
      });
    }
    
    console.log(`收到MQTT连接测试请求: ${url}`);
    
    try {
      // 导入mqtt库
      const mqtt = require('mqtt');
      
      // 创建临时客户端用于测试
      const client = mqtt.connect(url, {
        ...options,
        connectTimeout: 5000, // 5秒连接超时
        reconnectPeriod: 0    // 禁用自动重连
      });
      
      // 返回结果的Promise
      const result = await new Promise((resolve, reject) => {
        // 设置超时
        const timeout = setTimeout(() => {
          client.end(true);
          reject(new Error('连接超时'));
        }, 6000);
        
        // 连接成功事件
        client.on('connect', () => {
          clearTimeout(timeout);
          client.end(true);
          resolve({ success: true });
        });
        
        // 错误事件
        client.on('error', (err) => {
          clearTimeout(timeout);
          client.end(true);
          reject(err);
        });
      });
      
      res.json({
        success: true,
        message: '连接测试成功'
      });
    } catch (error) {
      console.error('MQTT连接测试失败:', error);
      res.status(500).json({
        success: false,
        error: `连接测试失败: ${error.message}`
      });
    }
  } catch (error) {
    console.error('处理MQTT连接测试请求失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// MQTT消息发布
router.post('/mqtt/publish', async (req, res) => {
  try {
    const { topic, payload, options } = req.body;
    
    if (!topic) {
      return res.status(400).json({
        success: false,
        error: 'MQTT主题不能为空'
      });
    }
    
    console.log(`收到MQTT消息发布请求: 主题=${topic}`);
    
    // 获取MQTT服务实例
    const mqttService = require('../modbus/mqtt-service').getInstance();
    
    // 检查MQTT是否已连接
    if (!mqttService.isConnected()) {
      console.log('MQTT服务未连接，尝试连接');
      // 获取配置并连接
      const config = modbusService.configManager.getMqttConfig();
      await mqttService.connect(config);
    }
    
    // 发布消息
    const result = await mqttService.publish(topic, payload, options);
    
    res.json({
      success: true,
      message: `消息已成功发布到主题: ${topic}`,
      result
    });
  } catch (error) {
    console.error('MQTT消息发布失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取Modbus状态
router.get('/status', (req, res) => {
  try {
    // 获取连接状态
    const connectionStatus = modbusService.getConnectionStatus();
    
    const status = {
      connected: connectionStatus.connected,
      polling: modbusService.isPolling,
      lastError: modbusService.lastError,
      lastData: modbusService.lastData,
      timestamp: new Date().toISOString(),
      config: modbusService.getConnectionConfigFromManager(),
      registerData: modbusService.getLatestData ? modbusService.getLatestData() : null
    };
    
    console.log('获取Modbus状态:', {
      connected: status.connected,
      polling: status.polling,
      timestamp: status.timestamp
    });
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('获取Modbus状态失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 刷新Modbus数据
router.post('/refresh', async (req, res) => {
  try {
    console.log('手动刷新Modbus数据');
    
    // 获取连接状态
    const connectionStatus = modbusService.getConnectionStatus();
    
    if (!connectionStatus.connected) {
      return res.status(400).json({
        success: false,
        error: '未连接到Modbus服务器，无法刷新数据'
      });
    }
    
    let data = null;
    
    // 尝试不同的方法触发数据刷新
    if (typeof modbusService.pollData === 'function') {
      // 如果存在pollData方法
      data = await modbusService.pollData();
    } else if (typeof modbusService.refreshData === 'function') {
      // 如果存在refreshData方法
      data = await modbusService.refreshData();
    } else if (typeof modbusService.readRegisters === 'function') {
      // 如果存在readRegisters方法
      data = await modbusService.readRegisters();
    } else {
      // 没有可用的方法，返回当前最新数据
      console.log('modbusService没有可用的数据刷新方法，返回当前状态');
      data = {
        message: '没有可用的数据刷新方法',
        timestamp: new Date().toISOString()
      };
    }
    
    res.json({
      success: true,
      message: '数据刷新请求已处理',
      timestamp: new Date().toISOString(),
      data
    });
  } catch (error) {
    console.error('刷新Modbus数据失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 从数据库获取最新数据点值
router.get('/db-latest-values', async (req, res) => {
  try {
    console.log('从数据库获取最新数据点值');
    
    // 获取数据库管理器
    let dbManager;
    try {
      dbManager = require('../modbus/db-manager');
    } catch (err) {
      console.error('加载数据库管理器失败:', err);
      return res.status(500).json({
        success: false,
        error: '数据库管理器加载失败'
      });
    }
    
    // 确保数据库已初始化
    if (!dbManager.initialized) {
      try {
        const mysql = require('mysql2/promise');
        await dbManager.initialize(mysql);
      } catch (initErr) {
        console.error('初始化数据库管理器失败:', initErr);
        return res.status(500).json({
          success: false,
          error: '数据库初始化失败: ' + initErr.message
        });
      }
    }
    
    // 从数据库获取最新值
    const latestValues = await dbManager.getLatestValues();
    console.log(`从数据库获取到 ${latestValues.length} 个数据点的最新值`);
    
    // 格式化响应数据
    const formattedValues = {};
    
    latestValues.forEach(item => {
      formattedValues[item.identifier] = {
        value: item.value,
        formattedValue: item.formattedValue,
        quality: item.quality,
        timestamp: item.updatedAt,
        source: 'database'
      };
    });
    
    res.json({
      success: true,
      data: formattedValues,
      meta: {
        count: latestValues.length,
        timestamp: new Date().toISOString(),
        source: 'database'
      }
    });
  } catch (error) {
    console.error('从数据库获取最新值失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 直接存储告警到数据库（不依赖ModbusTCP实例）
router.post('/alarms/store', async (req, res) => {
  try {
    console.log('==================== 告警直接存储调试 ====================');
    console.log('[/api/modbus/alarms/store] 收到直接存储告警请求', new Date().toISOString());
    console.log('[/api/modbus/alarms/store] 请求体:', JSON.stringify(req.body, null, 2));
    
    const { identifier, content, triggerTime, dataPointName } = req.body;
    
    if (!identifier || !content) {
      console.error('[/api/modbus/alarms/store] 缺少必要的告警信息');
      return res.status(400).json({
        success: false,
        error: '缺少必要的告警信息'
      });
    }
    
    // 直接存储告警到数据库
    try {
      // 直接导入告警数据库服务
      let alarmDbService;
      try {
        const AlarmDbService = require('../modbus/alarm-db-service');
        alarmDbService = AlarmDbService.getInstance();
      } catch (importError) {
        console.error('[/api/modbus/alarms/store] 导入告警数据库服务失败:', importError);
        return res.status(500).json({
          success: false,
          error: '告警数据库服务导入失败'
        });
      }
      
      if (alarmDbService) {
        if (!alarmDbService.initialized) {
          console.log('[/api/modbus/alarms/store] 初始化告警数据库服务...');
          await alarmDbService.initialize();
        }
        
        // 准备告警数据
        const alarmData = {
          identifier: identifier,
          content: content,
          triggerTime: triggerTime || new Date().toISOString(),
          dataPointId: identifier,
          dataPointName: dataPointName || content.split(' ')[0] // 简单提取数据点名称
        };
        
        console.log('[/api/modbus/alarms/store] 存储告警到数据库:', alarmData);
        const storedAlarm = await alarmDbService.storeAlarm(alarmData);
        
        if (storedAlarm) {
          console.log('[/api/modbus/alarms/store] 告警已存储到数据库:', storedAlarm.id);
          
          // 广播告警消息到所有WebSocket客户端
          if (modbusService.wsClients && modbusService.wsClients.size > 0) {
            const alarmMsg = {
              type: 'alarm',
              data: {
                identifier: identifier,
                content: content,
                timestamp: triggerTime || new Date().toISOString(),
                dataPointName: dataPointName
              }
            };
            console.log('[/api/modbus/alarms/store] 向WebSocket客户端广播告警消息:', alarmMsg);
            
            // 广播告警消息
            modbusService.wsClients.forEach(client => {
              if (client.readyState === 1) { // 1 = OPEN
                client.send(JSON.stringify(alarmMsg));
              }
            });
          }
          
          return res.json({
            success: true,
            message: '告警已存储到数据库',
            alarm: storedAlarm
          });
        } else {
          console.log('[/api/modbus/alarms/store] 告警存储到数据库返回空结果');
          return res.status(500).json({
            success: false,
            error: '存储告警失败，数据库返回空结果'
          });
        }
      } else {
        console.warn('[/api/modbus/alarms/store] 告警数据库服务不可用');
        return res.status(500).json({
          success: false,
          error: '告警数据库服务不可用'
        });
      }
    } catch (dbError) {
      console.error('[/api/modbus/alarms/store] 存储告警到数据库失败:', dbError);
      return res.status(500).json({
        success: false,
        error: '存储告警到数据库失败: ' + dbError.message
      });
    }
  } catch (error) {
    console.error('[/api/modbus/alarms/store] 处理告警存储请求时发生未预期的错误:', error);
    console.log('==================== 告警直接存储调试结束 ====================');
    
    return res.status(500).json({
      success: false,
      error: '处理告警存储请求失败: ' + error.message
    });
  }
});

// 添加可视化大屏路由
router.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

// 保存POINT数据到数据库
router.post('/save-point-data', async (req, res) => {
  console.log('[POINT数据保存] 收到保存点位数据请求:', req.body);
  
  try {
    const { pointData, timestamp } = req.body;
    
    if (!pointData || typeof pointData !== 'object') {
      console.error('[POINT数据保存] 无效的点位数据:', pointData);
      return res.status(400).json({
        success: false,
        message: '无效的点位数据'
      });
    }
    
    console.log('[POINT数据保存] 点位数据有效，开始处理...');
    
    // 获取数据库管理器
    let dbManager;
    try {
      dbManager = require('../modbus/db-manager');
    } catch (err) {
      console.error('[POINT数据保存] 加载数据库管理器失败:', err);
      return res.status(500).json({
        success: false,
        message: '数据库管理器加载失败'
      });
    }
    
    // 确保数据库已初始化
    if (!dbManager.initialized) {
      console.log('[POINT数据保存] 初始化数据库管理器...');
      const mysql = require('mysql2/promise');
      await dbManager.initialize(mysql);
    }
    
    // 准备数据点配置和值
    const dataPointsToSave = [];
    const valuesToSave = {};
    const currentTime = timestamp || new Date().toISOString();
    
    for (const [identifier, value] of Object.entries(pointData)) {
      // 创建临时数据点配置
      const tempDataPoint = {
        id: identifier,
        identifier: identifier,
        name: identifier,
        format: 'POINT'
      };
      
      dataPointsToSave.push(tempDataPoint);
      
      // 准备值对象
      valuesToSave[identifier] = {
        value: value,
        formattedValue: value.toString(),
        quality: 'GOOD',
        timestamp: currentTime,
        rawValue: { value }
      };
    }
    
    console.log(`[POINT数据保存] 准备保存 ${dataPointsToSave.length} 个数据点:`, dataPointsToSave);
    console.log(`[POINT数据保存] 数据值:`, valuesToSave);
    
    // 使用正确的数据库保存方法
    const saveResult = await dbManager.storeLatestValues(dataPointsToSave, valuesToSave);
    
    console.log('[POINT数据保存] 数据保存结果:', saveResult);
    
    res.json({
      success: true,
      message: `成功保存 ${dataPointsToSave.length} 个POINT数据点`,
      savedCount: dataPointsToSave.length,
      timestamp: currentTime,
      result: saveResult
    });
    
  } catch (error) {
    console.error('[POINT数据保存] 保存失败:', error);
    res.status(500).json({
      success: false,
      message: '保存POINT数据失败',
      error: error.message
    });
  }
});

// 获取数据变化检测配置
router.get('/change-detection/config', (req, res) => {
  try {
    const dbManager = require('../modbus/db-manager');
    const config = dbManager.getChangeDetectionConfig();
    
    res.json({
      success: true,
      config: config,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('获取数据变化检测配置失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 更新数据变化检测配置
router.post('/change-detection/config', (req, res) => {
  try {
    const dbManager = require('../modbus/db-manager');
    
    // 验证配置参数
    const allowedKeys = ['enabled', 'absoluteTolerance', 'relativeTolerance', 'compareFormattedValues', 'forceInsertInterval', 'logLevel', 'enableStatistics'];
    const config = {};
    
    for (const key of allowedKeys) {
      if (req.body[key] !== undefined) {
        config[key] = req.body[key];
      }
    }
    
    if (Object.keys(config).length === 0) {
      return res.status(400).json({
        success: false,
        error: '没有提供有效的配置参数'
      });
    }
    
    dbManager.configureChangeDetection(config);
    const updatedConfig = dbManager.getChangeDetectionConfig();
    
    res.json({
      success: true,
      message: '数据变化检测配置已更新',
      config: updatedConfig,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('更新数据变化检测配置失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取数据变化检测统计信息
router.get('/change-detection/statistics', (req, res) => {
  try {
    const dbManager = require('../modbus/db-manager');
    const stats = dbManager.getChangeDetectionStatistics();
    
    res.json({
      success: true,
      statistics: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('获取数据变化检测统计信息失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 重置数据变化检测统计信息
router.post('/change-detection/statistics/reset', (req, res) => {
  try {
    const dbManager = require('../modbus/db-manager');
    dbManager.resetChangeDetectionStatistics();
    
    res.json({
      success: true,
      message: '数据变化检测统计信息已重置',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('重置数据变化检测统计信息失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 清空数据变化检测缓存
router.post('/change-detection/cache/clear', (req, res) => {
  try {
    const dbManager = require('../modbus/db-manager');
    dbManager.clearChangeDetectionCache();
    
    res.json({
      success: true,
      message: '数据变化检测缓存已清空',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('清空数据变化检测缓存失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router; 
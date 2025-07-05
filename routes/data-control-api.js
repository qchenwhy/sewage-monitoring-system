/**
 * 数据控制API路由
 * 用于处理不同结构的JSON请求，实现对系统数据的增、删、改、查、启停，以及自动更新工作计划状态
 */

const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const moment = require('moment');

// 导入MQTT服务
const MQTTService = require('../modules/mqtt-service');
const mqttService = MQTTService.getInstance();

// 创建数据库连接池
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '753456Chen*',
  database: process.env.DB_NAME || 'mqtt_data',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 确保必要的数据库表存在
async function ensureTablesExist() {
  try {
    // 定义SQL语句创建表
    const sql = `
      -- 确保临时工作任务表存在
      CREATE TABLE IF NOT EXISTS temporary_work_tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        scheduled_date DATE NOT NULL,
        start_time TIME NOT NULL,
        duration INT DEFAULT 60,
        status ENUM('pending', 'completed', 'cancelled') DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_date (scheduled_date),
        INDEX idx_status (status)
      );
      
      -- 确保工作记录表存在
      CREATE TABLE IF NOT EXISTS work_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `;
    
    // 执行SQL
    await pool.query(sql);
    console.log('数据库表检查完成，确保工作计划和工作记录表存在');
  } catch (error) {
    console.error('确保数据库表存在时出错:', error);
  }
}

// 初始化时确保表存在
ensureTablesExist();

/**
 * 主控制API端点
 * POST /api/data-control
 */
router.post('/', async (req, res) => {
  try {
    const jsonData = req.body;
    
    // 基本验证
    if (!jsonData || !jsonData.action_type || !jsonData.target_object) {
      return res.status(400).json({
        success: false,
        message: '无效的请求数据，必须提供action_type和target_object'
      });
    }
    
    console.log(`接收到数据控制请求: ${jsonData.action_type} / ${jsonData.target_object}`);
    
    // 根据操作类型和目标对象分发处理
    let result;
    
    switch (jsonData.action_type) {
      case 'increate':
        result = await handleCreateOperation(jsonData);
        break;
      case 'delete':
        result = await handleDeleteOperation(jsonData);
        break;
      case 'mark_complete':
        result = await handleMarkCompleteOperation(jsonData);
        break;
      case 'update':
        result = await handleUpdateOperation(jsonData);
        break;
      case 'control':
        result = await handleControlOperation(jsonData);
        break;
      default:
        return res.status(400).json({
          success: false,
          message: `不支持的操作类型: ${jsonData.action_type}`
        });
    }
    
    return res.json(result);
  } catch (error) {
    console.error('处理数据控制请求时出错:', error);
    return res.status(500).json({
      success: false,
      message: '服务器处理请求时出错',
      error: error.message
    });
  }
});

/**
 * 处理创建操作
 * @param {Object} data - 请求数据
 */
async function handleCreateOperation(data) {
  const { target_object, details } = data;
  
  switch (target_object) {
    case 'work_plan':
      return await createWorkPlan(details);
    case 'work_record':
      return await createWorkRecord(details);
    case 'temporary_work_record':
      return await createTemporaryWorkRecord(details);
    default:
      return {
        success: false,
        message: `不支持的目标对象: ${target_object}`
      };
  }
}

/**
 * 处理删除操作
 * @param {Object} data - 请求数据
 */
async function handleDeleteOperation(data) {
  const { target_object, details } = data;
  
  switch (target_object) {
    case 'work_plan':
      return await deleteWorkPlan(details);
    case 'work_record':
      return await deleteWorkRecord(details);
    default:
      return {
        success: false,
        message: `不支持的目标对象: ${target_object}`
      };
  }
}

/**
 * 处理标记完成操作
 * @param {Object} data - 请求数据
 */
async function handleMarkCompleteOperation(data) {
  const { target_object, details } = data;
  
  switch (target_object) {
    case 'work_plan':
      return await markWorkPlanComplete(details);
    case 'work_plan_status_update':
      return await updateWorkPlanStatus(details);
    default:
      return {
        success: false,
        message: `不支持的目标对象: ${target_object}`
      };
  }
}

/**
 * 处理更新操作
 * @param {Object} data - 请求数据
 */
async function handleUpdateOperation(data) {
  const { target_object, details } = data;
  
  switch (target_object) {
    case 'work_plan':
      return await updateWorkPlan(details);
    case 'runtime_parameter':
      return await updateRuntimeParameter(details);
    default:
      return {
        success: false,
        message: `不支持的目标对象: ${target_object}`
      };
  }
}

/**
 * 处理控制操作
 * @param {Object} data - 请求数据
 */
async function handleControlOperation(data) {
  const { target_object, details } = data;
  
  switch (target_object) {
    case 'device_control':
      return await controlDevice(details);
    default:
      return {
        success: false,
        message: `不支持的目标对象: ${target_object}`
      };
  }
}

/**
 * 创建工作计划
 * @param {Object} details - 计划详情
 */
async function createWorkPlan(details) {
  try {
    const { content, time } = details;
    
    if (!content) {
      return {
        success: false,
        message: '工作计划内容不能为空'
      };
    }
    
    // 解析时间字符串
    let scheduledDate, startTime;
    
    if (time) {
      // 简单时间解析逻辑，根据实际需求可以进一步完善
      if (time.includes('明天')) {
        scheduledDate = moment().add(1, 'days').format('YYYY-MM-DD');
      } else if (time.includes('后天')) {
        scheduledDate = moment().add(2, 'days').format('YYYY-MM-DD');
      } else {
        scheduledDate = moment().format('YYYY-MM-DD');
      }
      
      // 提取时间部分
      if (time.includes('上午')) {
        startTime = '09:00:00';
      } else if (time.includes('下午')) {
        startTime = '14:00:00';
      } else if (time.includes('晚上')) {
        startTime = '19:00:00';
      } else {
        startTime = '08:30:00'; // 默认时间
      }
      
      // 尝试提取具体小时
      const hourMatch = time.match(/(\d{1,2})点/);
      if (hourMatch) {
        let hour = parseInt(hourMatch[1], 10);
        if (time.includes('下午') && hour < 12) {
          hour += 12;
        }
        startTime = `${hour.toString().padStart(2, '0')}:00:00`;
      }
    } else {
      // 默认为今天
      scheduledDate = moment().format('YYYY-MM-DD');
      startTime = '08:30:00';
    }
    
    // 写入数据库
    const [result] = await pool.query(
      `INSERT INTO temporary_work_tasks (title, description, scheduled_date, start_time, duration, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [content, content, scheduledDate, startTime, 60, 'pending']
    );
    
    // 发送MQTT消息通知
    if (mqttService && mqttService.client && mqttService.client.connected) {
      mqttService.publish('data/work_plans/create', JSON.stringify({
        id: result.insertId,
        title: content,
        scheduled_date: scheduledDate,
        start_time: startTime,
        timestamp: new Date().toISOString()
      }));
    }
    
    return {
      success: true,
      message: '工作计划创建成功',
      data: {
        id: result.insertId,
        title: content,
        scheduled_date: scheduledDate,
        start_time: startTime
      }
    };
  } catch (error) {
    console.error('创建工作计划失败:', error);
    return {
      success: false,
      message: '创建工作计划失败',
      error: error.message
    };
  }
}

/**
 * 创建工作记录
 * @param {Object} details - 记录详情
 */
async function createWorkRecord(details) {
  try {
    const { content } = details;
    
    if (!content) {
      return {
        success: false,
        message: '工作记录内容不能为空'
      };
    }
    
    // 工作记录存储在数据库
    const [result] = await pool.query(
      `INSERT INTO work_records (content, created_at)
       VALUES (?, NOW())`,
      [content]
    );
    
    // 发送MQTT消息通知
    if (mqttService && mqttService.client && mqttService.client.connected) {
      mqttService.publish('data/work_records/create', JSON.stringify({
        id: result.insertId,
        content: content,
        timestamp: new Date().toISOString()
      }));
    }
    
    return {
      success: true,
      message: '工作记录创建成功',
      data: {
        id: result.insertId,
        content: content
      }
    };
  } catch (error) {
    console.error('创建工作记录失败:', error);
    return {
      success: false,
      message: '创建工作记录失败',
      error: error.message
    };
  }
}

/**
 * 创建临时工作记录
 * @param {Object} details - 记录详情
 */
async function createTemporaryWorkRecord(details) {
  try {
    const { content, tempId } = details;
    
    if (!content) {
      return {
        success: false,
        message: '临时工作记录内容不能为空'
      };
    }
    
    // 生成临时ID(如果未提供)
    const recordId = tempId || `temp_${moment().format('YYYYMMDDHHmmss')}`;
    
    // 临时工作记录可能不存储在数据库，仅通过MQTT广播
    if (mqttService && mqttService.client && mqttService.client.connected) {
      mqttService.publish('data/temp_work_records/create', JSON.stringify({
        id: recordId,
        content: content,
        timestamp: new Date().toISOString()
      }));
    }
    
    return {
      success: true,
      message: '临时工作记录创建成功',
      data: {
        id: recordId,
        content: content
      }
    };
  } catch (error) {
    console.error('创建临时工作记录失败:', error);
    return {
      success: false,
      message: '创建临时工作记录失败',
      error: error.message
    };
  }
}

/**
 * 删除工作计划
 * @param {Object} details - 删除详情
 */
async function deleteWorkPlan(details) {
  try {
    const { id } = details;
    
    if (!id) {
      return {
        success: false,
        message: '必须提供要删除的工作计划ID'
      };
    }
    
    // 从数据库删除
    const [result] = await pool.query(
      `DELETE FROM temporary_work_tasks WHERE id = ?`,
      [id]
    );
    
    if (result.affectedRows === 0) {
      return {
        success: false,
        message: `未找到ID为${id}的工作计划`
      };
    }
    
    // 发送MQTT消息通知
    if (mqttService && mqttService.client && mqttService.client.connected) {
      mqttService.publish('data/work_plans/delete', JSON.stringify({
        id: id,
        timestamp: new Date().toISOString()
      }));
    }
    
    return {
      success: true,
      message: '工作计划删除成功',
      data: { id }
    };
  } catch (error) {
    console.error('删除工作计划失败:', error);
    return {
      success: false,
      message: '删除工作计划失败',
      error: error.message
    };
  }
}

/**
 * 删除工作记录
 * @param {Object} details - 删除详情
 */
async function deleteWorkRecord(details) {
  try {
    const { id } = details;
    
    if (!id) {
      return {
        success: false,
        message: '必须提供要删除的工作记录ID'
      };
    }
    
    // 从数据库删除
    const [result] = await pool.query(
      `DELETE FROM work_records WHERE id = ?`,
      [id]
    );
    
    if (result.affectedRows === 0) {
      return {
        success: false,
        message: `未找到ID为${id}的工作记录`
      };
    }
    
    // 发送MQTT消息通知
    if (mqttService && mqttService.client && mqttService.client.connected) {
      mqttService.publish('data/work_records/delete', JSON.stringify({
        id: id,
        timestamp: new Date().toISOString()
      }));
    }
    
    return {
      success: true,
      message: '工作记录删除成功',
      data: { id }
    };
  } catch (error) {
    console.error('删除工作记录失败:', error);
    return {
      success: false,
      message: '删除工作记录失败',
      error: error.message
    };
  }
}

/**
 * 标记工作计划为完成
 * @param {Object} details - 完成详情
 */
async function markWorkPlanComplete(details) {
  try {
    const { id } = details;
    
    if (!id) {
      return {
        success: false,
        message: '必须提供要标记完成的工作计划ID'
      };
    }
    
    // 更新数据库状态
    const [result] = await pool.query(
      `UPDATE temporary_work_tasks SET status = 'completed', updated_at = NOW() WHERE id = ?`,
      [id]
    );
    
    if (result.affectedRows === 0) {
      return {
        success: false,
        message: `未找到ID为${id}的工作计划`
      };
    }
    
    // 发送MQTT消息通知
    if (mqttService && mqttService.client && mqttService.client.connected) {
      mqttService.publish('data/work_plans/status', JSON.stringify({
        id: id,
        status: 'completed',
        timestamp: new Date().toISOString()
      }));
    }
    
    return {
      success: true,
      message: '工作计划已标记为完成',
      data: { id, status: 'completed' }
    };
  } catch (error) {
    console.error('标记工作计划完成失败:', error);
    return {
      success: false,
      message: '标记工作计划完成失败',
      error: error.message
    };
  }
}

/**
 * 更新工作计划状态
 * @param {Object} details - 状态详情
 */
async function updateWorkPlanStatus(details) {
  try {
    const { taskId, status } = details;
    
    if (!taskId || !status) {
      return {
        success: false,
        message: '必须提供工作计划ID和状态'
      };
    }
    
    // 验证状态值
    if (status !== '已完成' && status !== 'completed') {
      return {
        success: false,
        message: '状态必须为"已完成"或"completed"'
      };
    }
    
    // 更新数据库状态
    const [result] = await pool.query(
      `UPDATE temporary_work_tasks SET status = 'completed', updated_at = NOW() WHERE id = ?`,
      [taskId]
    );
    
    if (result.affectedRows === 0) {
      return {
        success: false,
        message: `未找到ID为${taskId}的工作计划`
      };
    }
    
    // 发送MQTT消息通知
    if (mqttService && mqttService.client && mqttService.client.connected) {
      mqttService.publish('data/work_plans/status', JSON.stringify({
        id: taskId,
        status: 'completed',
        timestamp: new Date().toISOString()
      }));
    }
    
    return {
      success: true,
      message: '工作计划状态已更新',
      data: { id: taskId, status: 'completed' }
    };
  } catch (error) {
    console.error('更新工作计划状态失败:', error);
    return {
      success: false,
      message: '更新工作计划状态失败',
      error: error.message
    };
  }
}

/**
 * 更新工作计划
 * @param {Object} details - 更新详情
 */
async function updateWorkPlan(details) {
  try {
    const { id, content, time } = details;
    
    if (!id) {
      return {
        success: false,
        message: '必须提供要更新的工作计划ID'
      };
    }
    
    // 准备更新数据
    const updates = {};
    const params = [];
    
    if (content) {
      updates.title = '?';
      updates.description = '?';
      params.push(content, content);
    }
    
    if (time) {
      // 解析时间
      let scheduledDate, startTime;
      
      if (time.includes('明天')) {
        scheduledDate = moment().add(1, 'days').format('YYYY-MM-DD');
      } else if (time.includes('后天')) {
        scheduledDate = moment().add(2, 'days').format('YYYY-MM-DD');
      } else {
        scheduledDate = moment().format('YYYY-MM-DD');
      }
      
      if (time.includes('上午')) {
        startTime = '09:00:00';
      } else if (time.includes('下午')) {
        startTime = '14:00:00';
      } else if (time.includes('晚上')) {
        startTime = '19:00:00';
      } else {
        startTime = '08:30:00';
      }
      
      const hourMatch = time.match(/(\d{1,2})点/);
      if (hourMatch) {
        let hour = parseInt(hourMatch[1], 10);
        if (time.includes('下午') && hour < 12) {
          hour += 12;
        }
        startTime = `${hour.toString().padStart(2, '0')}:00:00`;
      }
      
      updates.scheduled_date = '?';
      updates.start_time = '?';
      params.push(scheduledDate, startTime);
    }
    
    // 如果没有任何更新项
    if (Object.keys(updates).length === 0) {
      return {
        success: false,
        message: '未提供任何要更新的字段'
      };
    }
    
    // 构建更新SQL
    let sql = 'UPDATE temporary_work_tasks SET ';
    sql += Object.entries(updates).map(([key, value]) => `${key} = ${value}`).join(', ');
    sql += ', updated_at = NOW() WHERE id = ?';
    params.push(id);
    
    // 执行更新
    const [result] = await pool.query(sql, params);
    
    if (result.affectedRows === 0) {
      return {
        success: false,
        message: `未找到ID为${id}的工作计划`
      };
    }
    
    // 发送MQTT消息通知
    if (mqttService && mqttService.client && mqttService.client.connected) {
      mqttService.publish('data/work_plans/update', JSON.stringify({
        id: id,
        content: content,
        time: time,
        timestamp: new Date().toISOString()
      }));
    }
    
    return {
      success: true,
      message: '工作计划更新成功',
      data: { id, ...details }
    };
  } catch (error) {
    console.error('更新工作计划失败:', error);
    return {
      success: false,
      message: '更新工作计划失败',
      error: error.message
    };
  }
}

/**
 * 更新运行时参数
 * @param {Object} details - 参数详情
 */
async function updateRuntimeParameter(details) {
  try {
    // 从details中提取参数名和值
    const paramName = Object.keys(details)[0];
    const paramValue = details[paramName];
    
    if (!paramName) {
      return {
        success: false,
        message: '必须提供参数名称'
      };
    }
    
    // 发送MQTT消息更新参数
    if (mqttService && mqttService.client && mqttService.client.connected) {
      mqttService.publish(`data/parameters/${paramName}`, JSON.stringify({
        value: paramValue,
        timestamp: new Date().toISOString()
      }));
    }
    
    return {
      success: true,
      message: `参数 ${paramName} 已更新`,
      data: { parameter: paramName, value: paramValue }
    };
  } catch (error) {
    console.error('更新运行时参数失败:', error);
    return {
      success: false,
      message: '更新运行时参数失败',
      error: error.message
    };
  }
}

/**
 * 控制设备
 * @param {Object} details - 控制详情
 */
async function controlDevice(details) {
  try {
    const { device_name, duration, action } = details;
    
    if (!device_name) {
      return {
        success: false,
        message: '必须提供设备名称'
      };
    }
    
    // 确定操作类型
    const deviceAction = action || 'start';
    
    // 发送MQTT消息控制设备
    if (mqttService && mqttService.client && mqttService.client.connected) {
      mqttService.publish(`data/devices/${device_name}/control`, JSON.stringify({
        action: deviceAction,
        duration: duration,
        timestamp: new Date().toISOString()
      }));
    }
    
    return {
      success: true,
      message: `设备 ${device_name} 控制命令已发送`,
      data: { 
        device: device_name, 
        action: deviceAction,
        duration: duration
      }
    };
  } catch (error) {
    console.error('控制设备失败:', error);
    return {
      success: false,
      message: '控制设备失败',
      error: error.message
    };
  }
}

module.exports = router; 
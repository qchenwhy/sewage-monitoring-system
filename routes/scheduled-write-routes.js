const express = require('express');
const router = express.Router();
const modbusService = require('../modbus/modbus-service').getInstance();
const cron = require('node-cron');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

// 存储定时任务的数据结构
let scheduledTasks = {};

// 定时任务存储路径
const TASKS_STORE_PATH = path.join(__dirname, '../data/scheduled_write_tasks.json');

// 初始化：加载已保存的定时任务
async function initScheduledTasks() {
  try {
    // 确保目录存在
    const dir = path.dirname(TASKS_STORE_PATH);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (mkdirErr) {
      if (mkdirErr.code !== 'EEXIST') {
        console.error('创建目录失败:', mkdirErr);
      }
    }

    // 读取文件
    const data = await fs.readFile(TASKS_STORE_PATH, 'utf8');
    const savedTasks = JSON.parse(data);
    
    // 恢复任务
    for (const [taskId, taskInfo] of Object.entries(savedTasks)) {
      if (taskInfo.active) {
        scheduleTask(taskId, taskInfo);
      } else {
        // 存储但不调度
        scheduledTasks[taskId] = taskInfo;
      }
    }
    
    console.log(`已加载 ${Object.keys(savedTasks).length} 个定时写入任务`);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('加载定时任务失败:', error);
    }
    scheduledTasks = {};
  }
}

// 保存定时任务到文件
async function saveTasks() {
  try {
    await fs.writeFile(TASKS_STORE_PATH, JSON.stringify(scheduledTasks, null, 2));
  } catch (error) {
    console.error('保存定时任务失败:', error);
  }
}

// 调度一个定时任务
function scheduleTask(taskId, taskInfo) {
  const { cronExpression, identifier, value, bitPosition } = taskInfo;
  
  // 检查是否已经存在此任务
  if (scheduledTasks[taskId] && scheduledTasks[taskId].cronJob) {
    // 停止现有任务
    scheduledTasks[taskId].cronJob.stop();
  }
  
  try {
    // 创建新的cron任务
    const job = cron.schedule(cronExpression, async () => {
      try {
        // 发送数据写入请求
        console.log(`执行定时写入任务 ${taskId}: 数据点=${identifier}, 值=${value}`);
        
        const writeData = {
          identifier,
          value
        };
        
        if (bitPosition !== undefined) {
          writeData.bitPosition = bitPosition;
        }
        
        await modbusService.writeDataPointValue(identifier, value, bitPosition);
        
        // 更新最后执行时间
        scheduledTasks[taskId].lastRun = new Date().toISOString();
        await saveTasks();
        
      } catch (error) {
        console.error(`定时写入任务 ${taskId} 执行失败:`, error);
        // 更新错误信息
        scheduledTasks[taskId].lastError = {
          time: new Date().toISOString(),
          message: error.message
        };
        await saveTasks();
      }
    });
    
    // 存储任务信息和cron作业
    scheduledTasks[taskId] = {
      ...taskInfo,
      cronJob: job,
      active: true
    };
    
    return true;
  } catch (error) {
    console.error(`调度定时任务 ${taskId} 失败:`, error);
    return false;
  }
}

// 获取所有定时任务
router.get('/tasks', (req, res) => {
  // 创建一个不包含cronJob对象的副本
  const tasksToReturn = {};
  for (const [taskId, taskInfo] of Object.entries(scheduledTasks)) {
    const { cronJob, ...rest } = taskInfo;
    tasksToReturn[taskId] = rest;
  }
  
  res.json({
    success: true,
    data: tasksToReturn
  });
});

// 创建新的定时任务
router.post('/tasks', async (req, res) => {
  try {
    const {
      name,
      description,
      cronExpression,
      identifier,
      value,
      bitPosition,
      active = true
    } = req.body;
    
    // 验证必要字段
    if (!name || !cronExpression || !identifier || value === undefined) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数'
      });
    }
    
    // 验证cron表达式
    if (!cron.validate(cronExpression)) {
      return res.status(400).json({
        success: false,
        error: 'Cron表达式无效'
      });
    }
    
    // 验证数据点是否存在
    const dataPoint = modbusService.dataPointManager.getDataPointByIdentifier(identifier);
    if (!dataPoint) {
      return res.status(404).json({
        success: false,
        error: `数据点 "${identifier}" 不存在`
      });
    }
    
    // 创建任务ID
    const taskId = uuidv4();
    
    // 创建任务信息
    const taskInfo = {
      name,
      description,
      cronExpression,
      identifier,
      value,
      bitPosition,
      active,
      created: new Date().toISOString(),
      updated: new Date().toISOString()
    };
    
    // 如果需要激活，调度任务
    if (active) {
      const scheduled = scheduleTask(taskId, taskInfo);
      if (!scheduled) {
        return res.status(500).json({
          success: false,
          error: '调度任务失败'
        });
      }
    } else {
      // 存储但不调度
      scheduledTasks[taskId] = taskInfo;
    }
    
    // 保存到文件
    await saveTasks();
    
    res.json({
      success: true,
      data: {
        taskId,
        ...taskInfo
      }
    });
  } catch (error) {
    console.error('创建定时任务失败:', error);
    res.status(500).json({
      success: false,
      error: '创建定时任务失败',
      details: error.message
    });
  }
});

// 获取单个定时任务
router.get('/tasks/:taskId', (req, res) => {
  const { taskId } = req.params;
  
  if (!scheduledTasks[taskId]) {
    return res.status(404).json({
      success: false,
      error: '定时任务不存在'
    });
  }
  
  // 创建不包含cronJob对象的副本
  const { cronJob, ...taskInfo } = scheduledTasks[taskId];
  
  res.json({
    success: true,
    data: taskInfo
  });
});

// 更新定时任务
router.put('/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    
    if (!scheduledTasks[taskId]) {
      return res.status(404).json({
        success: false,
        error: '定时任务不存在'
      });
    }
    
    const { 
      name, 
      description, 
      cronExpression, 
      identifier, 
      value, 
      bitPosition,
      active 
    } = req.body;
    
    // 创建更新后的任务信息
    const updatedTaskInfo = {
      ...scheduledTasks[taskId]
    };
    
    // 更新提供的字段
    if (name !== undefined) updatedTaskInfo.name = name;
    if (description !== undefined) updatedTaskInfo.description = description;
    if (cronExpression !== undefined) {
      // 验证cron表达式
      if (!cron.validate(cronExpression)) {
        return res.status(400).json({
          success: false,
          error: 'Cron表达式无效'
        });
      }
      updatedTaskInfo.cronExpression = cronExpression;
    }
    if (identifier !== undefined) {
      // 验证数据点是否存在
      const dataPoint = modbusService.dataPointManager.getDataPointByIdentifier(identifier);
      if (!dataPoint) {
        return res.status(404).json({
          success: false,
          error: `数据点 "${identifier}" 不存在`
        });
      }
      updatedTaskInfo.identifier = identifier;
    }
    if (value !== undefined) updatedTaskInfo.value = value;
    if (bitPosition !== undefined) updatedTaskInfo.bitPosition = bitPosition;
    
    // 更新时间戳
    updatedTaskInfo.updated = new Date().toISOString();
    
    // 如果任务活动状态改变
    if (active !== undefined && active !== updatedTaskInfo.active) {
      updatedTaskInfo.active = active;
      
      // 停止现有任务
      if (scheduledTasks[taskId].cronJob) {
        scheduledTasks[taskId].cronJob.stop();
      }
      
      // 如果需要激活，重新调度
      if (active) {
        const scheduled = scheduleTask(taskId, updatedTaskInfo);
        if (!scheduled) {
          return res.status(500).json({
            success: false,
            error: '重新调度任务失败'
          });
        }
      }
    } else if (active !== false && (cronExpression !== undefined || identifier !== undefined || value !== undefined || bitPosition !== undefined)) {
      // 如果任务保持活动状态但关键参数改变，需要重新调度
      if (scheduledTasks[taskId].cronJob) {
        scheduledTasks[taskId].cronJob.stop();
      }
      
      const scheduled = scheduleTask(taskId, updatedTaskInfo);
      if (!scheduled) {
        return res.status(500).json({
          success: false,
          error: '重新调度任务失败'
        });
      }
    }
    
    // 更新任务存储
    scheduledTasks[taskId] = updatedTaskInfo;
    
    // 保存到文件
    await saveTasks();
    
    // 创建不包含cronJob对象的副本
    const { cronJob, ...taskInfo } = scheduledTasks[taskId];
    
    res.json({
      success: true,
      data: taskInfo
    });
  } catch (error) {
    console.error('更新定时任务失败:', error);
    res.status(500).json({
      success: false,
      error: '更新定时任务失败',
      details: error.message
    });
  }
});

// 删除定时任务
router.delete('/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    
    if (!scheduledTasks[taskId]) {
      return res.status(404).json({
        success: false,
        error: '定时任务不存在'
      });
    }
    
    // 停止任务
    if (scheduledTasks[taskId].cronJob) {
      scheduledTasks[taskId].cronJob.stop();
    }
    
    // 从存储中删除
    delete scheduledTasks[taskId];
    
    // 保存到文件
    await saveTasks();
    
    res.json({
      success: true,
      message: '定时任务已删除'
    });
  } catch (error) {
    console.error('删除定时任务失败:', error);
    res.status(500).json({
      success: false,
      error: '删除定时任务失败',
      details: error.message
    });
  }
});

// 启动任务
router.post('/tasks/:taskId/start', async (req, res) => {
  try {
    const { taskId } = req.params;
    
    if (!scheduledTasks[taskId]) {
      return res.status(404).json({
        success: false,
        error: '定时任务不存在'
      });
    }
    
    // 如果任务已启动
    if (scheduledTasks[taskId].active && scheduledTasks[taskId].cronJob) {
      return res.json({
        success: true,
        message: '任务已经处于运行状态'
      });
    }
    
    // 更新任务状态
    scheduledTasks[taskId].active = true;
    scheduledTasks[taskId].updated = new Date().toISOString();
    
    // 调度任务
    const scheduled = scheduleTask(taskId, scheduledTasks[taskId]);
    if (!scheduled) {
      return res.status(500).json({
        success: false,
        error: '启动任务失败'
      });
    }
    
    // 保存到文件
    await saveTasks();
    
    // 创建不包含cronJob对象的副本
    const { cronJob, ...taskInfo } = scheduledTasks[taskId];
    
    res.json({
      success: true,
      data: taskInfo,
      message: '任务已启动'
    });
  } catch (error) {
    console.error('启动定时任务失败:', error);
    res.status(500).json({
      success: false,
      error: '启动定时任务失败',
      details: error.message
    });
  }
});

// 停止任务
router.post('/tasks/:taskId/stop', async (req, res) => {
  try {
    const { taskId } = req.params;
    
    if (!scheduledTasks[taskId]) {
      return res.status(404).json({
        success: false,
        error: '定时任务不存在'
      });
    }
    
    // 如果任务已停止
    if (!scheduledTasks[taskId].active) {
      return res.json({
        success: true,
        message: '任务已经处于停止状态'
      });
    }
    
    // 停止任务
    if (scheduledTasks[taskId].cronJob) {
      scheduledTasks[taskId].cronJob.stop();
    }
    
    // 更新任务状态
    scheduledTasks[taskId].active = false;
    scheduledTasks[taskId].updated = new Date().toISOString();
    
    // 保存到文件
    await saveTasks();
    
    // 创建不包含cronJob对象的副本
    const { cronJob, ...taskInfo } = scheduledTasks[taskId];
    
    res.json({
      success: true,
      data: taskInfo,
      message: '任务已停止'
    });
  } catch (error) {
    console.error('停止定时任务失败:', error);
    res.status(500).json({
      success: false,
      error: '停止定时任务失败',
      details: error.message
    });
  }
});

// 立即执行任务（一次性）
router.post('/tasks/:taskId/execute', async (req, res) => {
  try {
    const { taskId } = req.params;
    
    if (!scheduledTasks[taskId]) {
      return res.status(404).json({
        success: false,
        error: '定时任务不存在'
      });
    }
    
    const { identifier, value, bitPosition } = scheduledTasks[taskId];
    
    // 执行写入
    console.log(`手动执行定时写入任务 ${taskId}: 数据点=${identifier}, 值=${value}`);
    
    const writeData = {
      identifier,
      value
    };
    
    if (bitPosition !== undefined) {
      writeData.bitPosition = bitPosition;
    }
    
    await modbusService.writeDataPointValue(identifier, value, bitPosition);
    
    // 更新最后执行时间
    scheduledTasks[taskId].lastRun = new Date().toISOString();
    await saveTasks();
    
    res.json({
      success: true,
      message: '任务已执行',
      data: {
        executionTime: scheduledTasks[taskId].lastRun
      }
    });
  } catch (error) {
    console.error('手动执行定时任务失败:', error);
    
    // 更新错误信息
    if (scheduledTasks[req.params.taskId]) {
      scheduledTasks[req.params.taskId].lastError = {
        time: new Date().toISOString(),
        message: error.message
      };
      await saveTasks();
    }
    
    res.status(500).json({
      success: false,
      error: '执行定时任务失败',
      details: error.message
    });
  }
});

// 初始化所有任务
initScheduledTasks();

module.exports = router; 
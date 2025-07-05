/**
 * Dify知识库定时任务管理路由
 * 
 * 提供启动/停止/状态查询等API接口
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const moment = require('moment');

// 创建路由器
const router = express.Router();

// 导入定时任务处理模块
const difyHourlyTask = require('./modbus-data-hourly-task');

// 全局任务状态
let taskStatus = {
  running: false,
  startTime: null,
  lastRunTime: null,
  nextScheduledTime: null,
  taskInstance: null,
  error: null
};

// 日志目录
const LOG_DIR = path.join(__dirname, '..', 'logs', 'dify-sync');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 获取当前定时任务状态
router.get('/status', (req, res) => {
  // 获取最新的日志信息
  let recentLogs = [];
  try {
    const logFile = path.join(LOG_DIR, `dify-sync-${moment().format('YYYY-MM-DD')}.log`);
    if (fs.existsSync(logFile)) {
      const logContent = fs.readFileSync(logFile, 'utf8');
      recentLogs = logContent
        .split('\n')
        .filter(line => line.trim())
        .slice(-20) // 最近20条日志
        .reverse();
    }
  } catch (error) {
    console.error('读取日志失败:', error);
  }
  
  res.json({
    status: taskStatus.running ? 'running' : 'stopped',
    startTime: taskStatus.startTime,
    lastRunTime: taskStatus.lastRunTime,
    nextScheduledTime: taskStatus.nextScheduledTime,
    error: taskStatus.error,
    recentLogs
  });
});

// 启动定时任务
router.post('/start', (req, res) => {
  try {
    if (taskStatus.running) {
      return res.status(400).json({
        success: false,
        message: '定时任务已在运行中'
      });
    }
    
    console.log('启动Dify知识库同步定时任务');
    
    // 设置全局任务状态
    taskStatus = {
      running: true,
      startTime: new Date(),
      lastRunTime: null,
      nextScheduledTime: null,
      taskInstance: null,
      error: null
    };
    
    // 计算下一次执行时间
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(now.getHours() + 1, 0, 0, 0);
    taskStatus.nextScheduledTime = nextHour;
    
    // 启动定时任务（在新进程中）
    const { spawn } = require('child_process');
    const taskProcess = spawn('node', [path.join(__dirname, 'modbus-data-hourly-task.js')], {
      detached: true,
      stdio: 'ignore'
    });
    
    // 保存进程ID
    taskStatus.taskInstance = taskProcess.pid;
    
    // 让子进程独立运行
    taskProcess.unref();
    
    return res.json({
      success: true,
      message: '定时任务已启动',
      status: taskStatus
    });
  } catch (error) {
    console.error('启动定时任务失败:', error);
    taskStatus.error = error.message;
    taskStatus.running = false;
    
    return res.status(500).json({
      success: false,
      message: `启动定时任务失败: ${error.message}`
    });
  }
});

// 停止定时任务
router.post('/stop', (req, res) => {
  try {
    if (!taskStatus.running) {
      return res.status(400).json({
        success: false,
        message: '定时任务未运行'
      });
    }
    
    console.log('停止Dify知识库同步定时任务');
    
    // 如果有进程ID，尝试终止进程
    if (taskStatus.taskInstance) {
      try {
        process.kill(taskStatus.taskInstance);
      } catch (killError) {
        console.warn('终止进程失败:', killError.message);
        // 进程可能已经退出，忽略错误继续执行
      }
    }
    
    // 重置任务状态
    taskStatus = {
      running: false,
      startTime: null,
      lastRunTime: taskStatus.lastRunTime,
      nextScheduledTime: null,
      taskInstance: null,
      error: null
    };
    
    return res.json({
      success: true,
      message: '定时任务已停止',
      status: taskStatus
    });
  } catch (error) {
    console.error('停止定时任务失败:', error);
    
    return res.status(500).json({
      success: false,
      message: `停止定时任务失败: ${error.message}`
    });
  }
});

// 手动触发一次定时任务
router.post('/run-now', async (req, res) => {
  try {
    console.log('手动触发Dify知识库同步任务');
    
    // 更新最后运行时间
    taskStatus.lastRunTime = new Date();
    
    // 执行任务
    await difyHourlyTask.runHourlyTask();
    
    return res.json({
      success: true,
      message: '任务已手动触发并执行完成',
      executionTime: taskStatus.lastRunTime
    });
  } catch (error) {
    console.error('手动触发任务失败:', error);
    taskStatus.error = error.message;
    
    return res.status(500).json({
      success: false,
      message: `手动触发任务失败: ${error.message}`
    });
  }
});

// 手动合并并上传指定日期的数据
router.post('/merge-upload', async (req, res) => {
  try {
    const { date } = req.body;
    
    console.log(`手动合并并上传 ${date || '今天'} 的数据`);
    
    const result = await difyHourlyTask.manualMergeAndUpload(date);
    
    return res.json({
      success: result.success,
      message: result.success ? '数据已成功合并并上传' : `操作失败: ${result.error}`,
      result
    });
  } catch (error) {
    console.error('手动合并上传失败:', error);
    
    return res.status(500).json({
      success: false,
      message: `手动合并上传失败: ${error.message}`
    });
  }
});

// 测试Dify连接
router.get('/test-connection', async (req, res) => {
  try {
    console.log('测试Dify知识库连接');
    
    const result = await difyHourlyTask.testDifyConnection();
    
    return res.json({
      success: result.success,
      message: result.message,
      ...result
    });
  } catch (error) {
    console.error('测试连接失败:', error);
    
    return res.status(500).json({
      success: false,
      message: `测试连接失败: ${error.message}`
    });
  }
});

// 导出路由器
module.exports = router; 
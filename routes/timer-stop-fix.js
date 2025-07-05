/**
 * 计时器停止功能修复
 * 解决重复请求和锁定问题
 */

const express = require('express');
const router = express.Router();
const { fetch } = require('undici');
const os = require('os');

// 获取本地服务器地址
function getLocalServerAddress() {
  // 如果设置了环境变量，优先使用环境变量
  if (process.env.LOCAL_SERVER_URL) {
    return process.env.LOCAL_SERVER_URL;
  }
  
  // 默认服务器地址
  const defaultUrl = 'http://localhost:3000';
  
  // 尝试获取本机IP
  try {
    const interfaces = os.networkInterfaces();
    // 找到非内部的IPv4地址
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        // 跳过内部地址和非IPv4地址
        if (iface.family === 'IPv4' && !iface.internal) {
          console.log(`检测到外部IPv4地址: ${iface.address}`);
          return `http://${iface.address}:3000`; // 假设端口是3000
        }
      }
    }
  } catch (error) {
    console.error('获取网络接口信息失败:', error);
  }
  
  console.log(`未找到外部IP，使用默认服务器地址: ${defaultUrl}`);
  return defaultUrl;
}

// 获取服务器地址
const SERVER_ADDRESS = getLocalServerAddress();

// 按计时器维度的锁
const timerLocks = {};
// 最近处理的请求缓存
const recentRequests = new Map();

// 计时器停止路由
router.post('/fixed-stop-timer', async (req, res) => {
  const { name, id, source } = req.body;
  const timerKey = (name || '') + '_' + (id || '') + '_' + Date.now();
  
  // 记录请求信息
  console.log('=== /fixed-stop-timer 请求信息 ===');
  console.log('请求时间:', new Date().toISOString());
  console.log('请求数据:', JSON.stringify(req.body, null, 2));
  
  try {
    // 检查缓存，判断是否有相同的请求正在处理
    const cacheKey = name || id || '';
    if (cacheKey && recentRequests.has(cacheKey)) {
      const cached = recentRequests.get(cacheKey);
      const now = Date.now();
      
      // 如果请求在1秒内，返回缓存的响应或等待消息
      if (now - cached.timestamp < 1000) {
        console.log(`检测到重复请求: ${cacheKey}, 距上次: ${now - cached.timestamp}ms`);
        
        if (cached.result) {
          console.log('返回缓存的结果');
          return res.status(200).json({
            ...cached.result,
            _cached: true
          });
        } else {
          console.log('请求处理中，返回处理中状态');
          return res.status(200).json({
            success: true,
            code: 202,
            message: '请求正在处理中，请稍候',
            data: null
          });
        }
      }
    }
    
    // 记录新请求
    recentRequests.set(cacheKey, {
      timestamp: Date.now(),
      result: null
    });
    
    // 发送请求到主服务器
    console.log(`发送停止计时器请求到主服务器: ${name || id}`);
    
    const response = await fetch(`${SERVER_ADDRESS}/api/stop-timer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TimerStopFix/1.0'
      },
      body: JSON.stringify({
        name: name,
        id: id
      })
    });
    
    // 处理响应
    let result;
    if (response.ok) {
      result = await response.json();
      console.log('停止计时器成功:', result);
      
      // 存储结果到缓存
      if (cacheKey) {
        recentRequests.set(cacheKey, {
          timestamp: Date.now(),
          result: result
        });
        
        // 30秒后清除缓存
        setTimeout(() => {
          recentRequests.delete(cacheKey);
        }, 30000);
      }
      
      res.status(200).json(result);
    } else {
      const errorText = await response.text();
      console.error(`停止计时器失败: ${response.status}`, errorText);
      
      result = {
        success: false,
        code: response.status,
        message: `停止计时器失败: ${errorText}`,
        data: null
      };
      
      // 存储错误结果到缓存
      if (cacheKey) {
        recentRequests.set(cacheKey, {
          timestamp: Date.now(),
          result: result
        });
      }
      
      res.status(response.status).json(result);
    }
  } catch (error) {
    console.error('停止计时器请求异常:', error);
    res.status(500).json({
      success: false,
      code: 500,
      message: '停止计时器请求异常: ' + error.message,
      data: null
    });
  }
});

// 从更新操作处理停止计时器
router.post('/fixed-update-stop', async (req, res) => {
  const { id, title, name } = req.body;
  const targetName = title || name;
  
  console.log('=== 处理更新停止请求 ===');
  console.log('请求数据:', req.body);
  
  try {
    // 直接向主服务器发送请求
    const response = await fetch(`${SERVER_ADDRESS}/api/stop-timer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'FixedUpdateStop/1.0'
      },
      body: JSON.stringify({
        id: id,
        name: targetName
      })
    });
    
    // 处理响应
    if (response.ok) {
      const result = await response.json();
      console.log('停止计时器成功:', result);
      res.status(200).json(result);
    } else {
      const errorText = await response.text();
      console.error(`停止计时器失败: ${response.status}`, errorText);
      res.status(response.status).json({
        success: false,
        code: response.status,
        message: `停止计时器失败: ${errorText}`,
        data: null
      });
    }
  } catch (error) {
    console.error('停止计时器请求异常:', error);
    res.status(500).json({
      success: false,
      code: 500,
      message: '停止计时器请求异常: ' + error.message,
      data: null
    });
  }
});

module.exports = router; 
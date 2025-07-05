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
console.log(`========= 服务器地址信息 =========`);
console.log(`当前使用的服务器地址: ${SERVER_ADDRESS}`);
console.log(`===================================`);

// 请求锁，防止重复请求
let stopTimerLock = false;
let lastStopTimerRequest = null;
// 添加请求缓存Map，按请求内容缓存
const requestCache = new Map();

/**
 * /api/time 接口
 * 返回当前服务器时间信息
 */
router.get('/time', (req, res) => {
  const now = new Date();
  
  // 记录请求信息
  console.log('=== /api/time 请求信息 ===');
  console.log('请求时间:', now.toISOString());
  console.log('请求IP:', req.ip);
  console.log('请求头:', JSON.stringify(req.headers, null, 2));
  
  // 返回详细的时间信息
  const timeInfo = {
    success: true,
    code: 200,
    message: '获取时间成功',
    data: {
      timestamp: now.getTime(),
      iso: now.toISOString(),
      date: now.toLocaleDateString('zh-CN'),
      time: now.toLocaleTimeString('zh-CN'),
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      hour: now.getHours(),
      minute: now.getMinutes(),
      second: now.getSeconds(),
      dayOfWeek: now.getDay(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timezoneOffset: now.getTimezoneOffset()
    }
  };
  
  res.json(timeInfo);
});

/**
 * /api/change 接口
 * 处理提交的变更请求
 */
router.post('/change', (req, res) => {
  // 获取请求数据
  const { action, data } = req.body;
  
  // 记录请求信息
  console.log('=== /api/change 请求信息 ===');
  console.log('请求时间:', new Date().toISOString());
  console.log('动作类型:', action);
  console.log('请求数据:', JSON.stringify(req.body, null, 2));
    
  // 检查延迟响应
  if (req.body.duration > 500) {
    console.log('响应延迟(3秒)，应发送临时提示');
    console.log('发送临时提示: 计时器正在设置中，请稍候...');
    }
    
  // 直接处理请求体中的数据，无论action是什么值
  const timerData = req.body.data || req.body;
  
  // 将所有请求都视为创建计时器
  handleCreate(req, res, timerData);
});

/**
 * /api/test-timer 接口
 * 用于测试计时器功能
 */
router.get('/test-timer', (req, res) => {
  const now = new Date();
  
  // 记录请求信息
  console.log('=== /api/test-timer 请求信息 ===');
  console.log('请求时间:', now.toISOString());
  console.log('请求IP:', req.ip);
  
  // 创建一个10秒的测试计时器
  const testData = {
    type: 'timer',
    title: '测试计时器',
    duration: 10, // 10秒
    message: '测试计时器已完成'
  };
  
  // 内部调用创建计时器函数
  handleCreate(req, res, testData);
});

/**
 * /api/stop-timer 接口
 * 用于停止指定的计时器
 */
router.post('/stop-timer', (req, res) => {
  const { name, id, _requestId, _preventDuplicate } = req.body;
  
  // 记录请求信息
  console.log('=== /api/stop-timer 接口 ===');
  console.log('请求时间:', new Date().toISOString());
  console.log('请求数据:', JSON.stringify(req.body, null, 2));
  
  // 生成唯一请求标识
  const requestKey = `stop_${id || ''}_${name || ''}`;
  const uniqueId = _requestId || Math.random().toString(36).substring(2, 15);
  console.log(`处理停止请求，唯一标识: ${requestKey}, 请求ID: ${uniqueId}`);
  
  // 检查是否有相同的请求在处理中
  if (_preventDuplicate !== true && requestCache.has(requestKey)) {
    const cachedRequest = requestCache.get(requestKey);
    const currentTime = Date.now();
    const timeSinceLastRequest = currentTime - cachedRequest.timestamp;
    
    // 如果在5秒内有相同的请求，直接返回缓存结果或处理中状态
    if (timeSinceLastRequest < 5000) {
      console.log(`检测到重复请求: ${requestKey}, 距上次: ${timeSinceLastRequest}ms`);
      
      if (cachedRequest.result) {
        console.log('返回缓存的处理结果');
        return res.status(200).json({
          ...cachedRequest.result,
          _cached: true,
          _requestAge: timeSinceLastRequest,
          _originalTimestamp: cachedRequest.timestamp
        });
      } else if (cachedRequest.processing) {
        console.log('请求正在处理中，返回等待状态');
        return res.status(202).json({
          success: true,
          code: 202,
          message: '您的请求正在处理中，请勿重复操作',
          data: { 
            pendingRequest: true,
            requestKey: requestKey,
            requestTime: cachedRequest.timestamp,
            currentTime: currentTime
          }
        });
      }
    }
  }
  
  // 记录新请求
  requestCache.set(requestKey, {
    id: uniqueId,
    timestamp: Date.now(),
    processing: true,
    result: null
  });
  
  // 验证参数
  if (!name && !id) {
    // 更新缓存
    if (requestCache.has(requestKey)) {
      requestCache.get(requestKey).processing = false;
      requestCache.get(requestKey).result = {
        success: false,
        code: 400,
        message: '必须提供计时器名称或ID',
        data: null
      };
    }
    
    return res.status(400).json({
      success: false,
      code: 400,
      message: '必须提供计时器名称或ID',
      data: null
    });
  }
  
  // 构建请求主体
  const requestBody = {
    name: name,
    id: id,
    _requestId: uniqueId
  };
  
  console.log(`执行停止计时器操作: ${name || id}, 请求ID: ${uniqueId}`);
  
  // 转发到主应用的停止计时器API
  fetch(`${SERVER_ADDRESS}/api/stop-timer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': `API-Routes/${uniqueId}`
    },
    body: JSON.stringify(requestBody)
  })
  .then(response => {
    if (!response.ok) {
      console.error(`停止计时器请求失败，状态码: ${response.status}`);
      // 尝试读取错误信息
      return response.text().then(text => {
        throw new Error(`服务器响应状态码: ${response.status}, 响应内容: ${text}`);
      });
    }
    return response.json();
  })
  .then(result => {
    console.log('停止计时器成功，请求ID:', uniqueId, '结果:', result);
    
    // 添加唯一标识到结果
    const enhancedResult = {
      ...result,
      _requestId: uniqueId,
      _processedAt: new Date().toISOString()
    };
    
    // 更新请求缓存
    if (requestCache.has(requestKey)) {
      requestCache.get(requestKey).result = enhancedResult;
      requestCache.get(requestKey).processing = false;
      console.log(`更新请求缓存结果: ${requestKey}`);
      
      // 5分钟后自动清除缓存
      setTimeout(() => {
        if (requestCache.has(requestKey)) {
          requestCache.delete(requestKey);
          console.log(`自动清理请求缓存: ${requestKey}`);
        }
      }, 300000);
    }
    
    // 兼容原有机制
    if (lastStopTimerRequest && lastStopTimerRequest.request && lastStopTimerRequest.request.includes(name || id)) {
      lastStopTimerRequest.result = enhancedResult;
    }
    
    // 立即返回结果
    res.status(enhancedResult.success ? 200 : enhancedResult.code || 404).json(enhancedResult);
  })
  .catch(error => {
    console.error('停止计时器请求失败:', error);
    
    const errorResponse = {
      success: false,
      code: 500,
      message: '停止计时器失败: ' + (error.message || '内部服务器错误'),
      data: null,
      _requestId: uniqueId,
      _processedAt: new Date().toISOString()
    };
    
    // 更新缓存中的错误结果
    if (requestCache.has(requestKey)) {
      requestCache.get(requestKey).result = errorResponse;
      requestCache.get(requestKey).processing = false;
      console.log(`更新请求缓存错误结果: ${requestKey}`);
    }
    
    // 兼容原有机制
    if (lastStopTimerRequest && lastStopTimerRequest.request && lastStopTimerRequest.request.includes(name || id)) {
      lastStopTimerRequest.result = errorResponse;
    }
    
    // 立即返回错误结果
    res.status(500).json(errorResponse);
  });
});

/**
 * /api/test-stop-timer 接口
 * 用于测试停止计时器功能
 */
router.get('/test-stop-timer', (req, res) => {
  const now = new Date();
  const timerName = req.query.name || '测试';
  
  // 记录请求信息
  console.log('=== /api/test-stop-timer 请求信息 ===');
  console.log('请求时间:', now.toISOString());
  console.log('请求IP:', req.ip);
  console.log('计时器名称:', timerName);
  
  // 准备停止计时器请求数据
  const stopData = {
    name: timerName
  };
  
  // 调用停止计时器API
  fetch(`${SERVER_ADDRESS}/api/stop-timer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': req.get('User-Agent') || 'API-Routes Test'
    },
    body: JSON.stringify(stopData)
  })
  .then(response => response.json())
  .then(result => {
    console.log('测试停止计时器结果:', result);
    
    // 返回结果
    res.json({
      success: result.success,
      code: result.code,
      message: result.message,
      testInfo: {
        testedAt: now.toISOString(),
        testName: timerName
      },
      data: result.data
    });
  })
  .catch(error => {
    console.error('测试停止计时器失败:', error);
    res.status(500).json({
      success: false,
      code: 500,
      message: '测试停止计时器失败: ' + (error.message || '内部服务器错误'),
      data: null
    });
  });
});

/**
 * /api/test-connection 接口
 * 测试与主服务器的连接
 */
router.get('/test-connection', async (req, res) => {
  const now = new Date();
  
  console.log('=== /api/test-connection 请求信息 ===');
  console.log('请求时间:', now.toISOString());
  console.log('请求IP:', req.ip);
  console.log('测试服务器地址:', SERVER_ADDRESS);
  
  // 测试的端点列表
  const endpoints = [
    { url: `${SERVER_ADDRESS}/test`, method: 'GET', name: '基本测试端点' },
    { url: `${SERVER_ADDRESS}/api/time`, method: 'GET', name: '时间API' },
    { url: `${SERVER_ADDRESS}/api/test/add-timer`, method: 'GET', name: '计时器API测试' }
  ];
  
  const results = [];
  
  // 测试每个端点
  for (const endpoint of endpoints) {
    try {
      console.log(`测试端点: ${endpoint.name}, URL: ${endpoint.url}`);
      const startTime = Date.now();
      const response = await fetch(endpoint.url, { method: endpoint.method });
      const responseTime = Date.now() - startTime;
      
      const result = {
        name: endpoint.name,
        url: endpoint.url,
        method: endpoint.method,
        status: response.status,
        statusText: response.statusText,
        success: response.ok,
        responseTime: responseTime,
        contentType: response.headers.get('content-type')
      };
      
      if (response.ok && (response.headers.get('content-type') || '').includes('application/json')) {
        try {
          result.body = await response.json();
        } catch (e) {
          result.parseError = e.message;
        }
      } else {
        result.textResponse = await response.text();
      }
      
      results.push(result);
      console.log(`端点测试结果: ${endpoint.name} - ${response.status} ${response.statusText}`);
    } catch (error) {
      results.push({
        name: endpoint.name,
        url: endpoint.url,
        method: endpoint.method,
        error: error.message,
        success: false,
        errorDetail: error.toString()
      });
      console.error(`测试端点失败: ${endpoint.name}`, error);
    }
  }
  
  // 返回测试结果
  res.json({
    success: true,
    code: 200,
    message: '连接测试完成',
    serverAddress: SERVER_ADDRESS,
    testTime: now.toISOString(),
    endpoints: results
  });
});

// 处理创建操作
function handleCreate(req, res, data) {
  // 这里实现创建逻辑
  console.log('处理创建操作:', data);
  
  // 检查是否是创建计时器的请求
  // 我们不再检查data.type，所有通过通用接口的创建请求都被视为计时器
  
  // 验证必要的字段
  if (!data.title || !data.duration || !data.message) {
    return res.status(400).json({
      success: false,
      code: 400,
      message: '创建计时器缺少必要字段(title, duration, message)',
      data: null
    });
  }
  
  // 构建请求URL
  const apiUrl = `${SERVER_ADDRESS}/api/add-timer`;
  console.log('======= 请求调试信息 =======');
  console.log('API请求地址:', apiUrl);
  console.log('请求方法:', 'POST');
  console.log('请求头:', JSON.stringify({
    'Content-Type': 'application/json',
    'User-Agent': req.get('User-Agent') || 'API-Routes'
  }, null, 2));
  console.log('请求体:', JSON.stringify({
    title: data.title,
    duration: data.duration,
    message: data.message,
    voice: 'longxiaochun'
  }, null, 2));
  console.log('===========================');
  
  // 使用完整URL，而不是相对路径
  // 在Node.js环境中，fetch需要完整URL
  fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': req.get('User-Agent') || 'API-Routes'
    },
    body: JSON.stringify({
      title: data.title,
      duration: data.duration,
      message: data.message,
      voice: 'longxiaochun' // 始终使用默认语音
    })
  })
  .then(response => {
    // 打印响应状态和头信息
    console.log('======= 响应调试信息 =======');
    console.log('响应状态:', response.status, response.statusText);
    console.log('响应头:', JSON.stringify(Object.fromEntries([...response.headers.entries()]), null, 2));
    console.log('===========================');
    
    // 检查响应状态
    if (!response.ok) {
      // 如果状态不是2xx，先尝试读取文本
      return response.text().then(text => {
        console.error('计时器创建失败，响应状态:', response.status, '响应内容:', text);
        throw new Error(`请求失败，状态码: ${response.status}, 内容: ${text}`);
      });
    }
    
    // 正常响应，尝试解析JSON
    return response.json();
  })
  .then(result => {
    console.log('计时器创建结果:', result);
    if (result.success) {
      res.json({
        success: true,
        code: 201,
        message: '计时器创建成功',
        data: {
          id: result.data.id,
          title: data.title,
          duration: data.duration,
          message: data.message,
          createdAt: new Date().toISOString(),
          endTime: result.data.endTime,
          status: 'active'
        }
      });
    } else {
      res.status(400).json({
        success: false,
        code: 400,
        message: result.message || '计时器创建失败',
        data: null
      });
    }
  })
  .catch(error => {
    console.error('创建计时器请求失败:', error);
    res.status(500).json({
      success: false,
      code: 500,
      message: '创建计时器失败: ' + (error.message || '内部服务器错误'),
      data: null
    });
  });
}

// 处理更新操作
function handleUpdate(req, res, data) {
  // 这里实现更新逻辑
  console.log('处理更新操作:', data);
  
  // 处理停止计时器请求
  if (data.action === 'stop') {
    console.log('处理停止计时器请求 (锁定版本):', data);
    
    // 生成唯一请求标识
    const requestKey = `stop_${data.id || ''}_${data.title || data.name || ''}`;
    const uniqueRequestId = Math.random().toString(36).substring(2, 15);
    
    // 检查是否有相同的请求在处理中
    if (requestCache.has(requestKey) && requestCache.get(requestKey).processing) {
      console.log(`请求${requestKey}正在处理中，拒绝重复处理`);
      return res.status(202).json({
        success: true,
        code: 202,
        message: '您的请求正在处理中，请勿重复操作',
        data: { 
          pendingRequest: true,
          requestKey: requestKey
        }
      });
    }
    
    // 标记为处理中
    if (requestCache.has(requestKey)) {
      requestCache.get(requestKey).processing = true;
    }
    
    console.log(`执行停止计时器: ${data.title || data.name || data.id}, 请求ID: ${uniqueRequestId}`);
    
    // 直接转发到停止计时器API
    fetch(`${SERVER_ADDRESS}/api/stop-timer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `API-Routes-UpdateHandler/${uniqueRequestId}`
      },
      body: JSON.stringify({
        id: data.id, // 可选
        name: data.title || data.name, // 使用title或name字段进行匹配
        _preventDuplicate: true, // 标记防止重复处理
        _requestId: uniqueRequestId
      })
    })
    .then(response => {
      if (!response.ok) {
        console.error(`停止计时器请求失败，状态码: ${response.status}, 请求ID: ${uniqueRequestId}`);
        // 尝试读取错误信息
        return response.text().then(text => {
          throw new Error(`服务器响应状态码: ${response.status}, 响应内容: ${text}`);
        });
      }
      return response.json();
    })
    .then(result => {
      console.log('停止计时器成功，请求ID:', uniqueRequestId, '结果:', result);
      
      // 增强结果
      const enhancedResult = {
        ...result,
        _requestId: uniqueRequestId,
        _processedAt: new Date().toISOString(),
        _source: 'update_handler'
      };
      
      // 存储结果到缓存
      if (requestCache.has(requestKey)) {
        requestCache.get(requestKey).result = enhancedResult;
        requestCache.get(requestKey).processing = false;
        console.log(`更新请求缓存结果: ${requestKey}`);
      }
      
      // 存储结果用于兼容原有机制
      if (lastStopTimerRequest) {
        lastStopTimerRequest.result = enhancedResult;
      }
      
      // 立即返回结果，不再延迟
      res.status(enhancedResult.success ? 200 : enhancedResult.code || 404).json(enhancedResult);
    })
    .catch(error => {
      console.error('停止计时器请求失败:', error);
      
      const errorResponse = {
        success: false,
        code: 500,
        message: '停止计时器失败: ' + (error.message || '内部服务器错误'),
        data: null,
        _requestId: uniqueRequestId,
        _processedAt: new Date().toISOString(),
        _source: 'update_handler'
      };
      
      // 更新缓存中的错误结果
      if (requestCache.has(requestKey)) {
        requestCache.get(requestKey).result = errorResponse;
        requestCache.get(requestKey).processing = false;
        console.log(`更新请求缓存错误结果: ${requestKey}`);
      }
      
      // 兼容原有机制
      if (lastStopTimerRequest) {
        lastStopTimerRequest.result = errorResponse;
      }
      
      // 立即返回错误结果
      res.status(500).json(errorResponse);
    });
    
    return;
  }
  
  // 其他类型的更新（非停止计时器请求）
  if (!data.id) {
    return res.status(400).json({
      success: false,
      code: 400,
      message: '更新操作缺少ID字段',
      data: null
    });
  }
  
  // 模拟处理
  setTimeout(() => {
    res.json({
      success: true,
      code: 200,
      message: '更新成功',
      data: {
        ...data,
        updatedAt: new Date().toISOString()
      }
    });
  }, 100);
}

// 处理删除操作
function handleDelete(req, res, data) {
  // 这里实现删除逻辑 
  console.log('处理删除操作:', data);
  
  // 调用停止计时器API - 不再检查类型，所有删除请求都被视为计时器删除
  // 首先，准备请求数据
  const requestData = {};
  
  if (data.id) {
    requestData.id = data.id;
  }
  
  if (data.title || data.name) {
    requestData.name = data.title || data.name;
  }
  
  // 如果既没有ID也没有名称，返回错误
  if (!requestData.id && !requestData.name) {
    return res.status(400).json({
      success: false,
      code: 400,
      message: '删除计时器需要提供id或title',
      data: null
    });
  }
  
  // 生成唯一请求标识
  const requestKey = `delete_${requestData.id || ''}_${requestData.name || ''}`;
  const uniqueId = Math.random().toString(36).substring(2, 15);
  console.log(`处理删除请求，唯一标识: ${requestKey}, 请求ID: ${uniqueId}`);
  
  // 检查是否有相同的请求在处理中
  if (requestCache.has(requestKey)) {
    const cachedRequest = requestCache.get(requestKey);
    const currentTime = Date.now();
    const timeSinceLastRequest = currentTime - cachedRequest.timestamp;
    
    // 如果在5秒内有相同的请求，直接返回缓存结果或处理中状态
    if (timeSinceLastRequest < 5000) {
      console.log(`检测到重复请求: ${requestKey}, 距上次: ${timeSinceLastRequest}ms`);
      
      if (cachedRequest.result) {
        console.log('返回缓存的处理结果');
        return res.status(200).json({
          ...cachedRequest.result,
          _cached: true,
          _requestAge: timeSinceLastRequest
        });
      } else if (cachedRequest.processing) {
        console.log('请求正在处理中，返回等待状态');
        return res.status(202).json({
          success: true,
          code: 202,
          message: '您的请求正在处理中，请勿重复操作',
          data: { pendingRequest: true }
        });
      }
    }
  }
  
  // 记录新请求
  requestCache.set(requestKey, {
    id: uniqueId,
    timestamp: Date.now(),
    processing: true,
    result: null
  });
  
  // 添加请求ID
  requestData._requestId = uniqueId;
  requestData._preventDuplicate = true;
  
  // 发送请求停止计时器
  fetch(`${SERVER_ADDRESS}/api/stop-timer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': `API-Routes-Delete/${uniqueId}`
    },
    body: JSON.stringify(requestData)
  })
  .then(response => response.json())
  .then(result => {
    console.log('停止计时器结果:', result);
    
    const responseData = {
      success: result.success,
      code: result.success ? 200 : result.code || 404,
      message: result.success ? '计时器取消成功' : result.message,
      data: result.success ? {
          id: result.data.timer.id,
          title: result.data.timer.title,
          deletedAt: new Date().toISOString()
      } : null,
      _requestId: uniqueId
    };
    
    // 更新请求缓存
    if (requestCache.has(requestKey)) {
      requestCache.get(requestKey).result = responseData;
      requestCache.get(requestKey).processing = false;
      console.log(`更新请求缓存结果: ${requestKey}`);
      
      // 5分钟后自动清除缓存
      setTimeout(() => {
        if (requestCache.has(requestKey)) {
          requestCache.delete(requestKey);
          console.log(`自动清理请求缓存: ${requestKey}`);
        }
      }, 300000);
    }
    
    res.status(responseData.code).json(responseData);
  })
  .catch(error => {
    console.error('取消计时器失败:', error);
    const errorResponse = {
      success: false,
      code: 500,
      message: '取消计时器失败: ' + (error.message || '内部服务器错误'),
      data: null,
      _requestId: uniqueId
    };
    
    // 更新缓存中的错误结果
    if (requestCache.has(requestKey)) {
      requestCache.get(requestKey).result = errorResponse;
      requestCache.get(requestKey).processing = false;
      console.log(`更新请求缓存错误结果: ${requestKey}`);
    }
    
    res.status(500).json(errorResponse);
  });
}

// 处理查询操作
function handleQuery(req, res, data) {
  // 这里实现查询逻辑
  console.log('处理查询操作:', data);
  
  // 检查是否是查询计时器的请求
  if (data.type === 'timer') {
    console.log('查询计时器请求:', data);
    
    // 查询类型
    const queryType = data.queryType || 'active'; // 默认查询活动计时器
    
    if (queryType === 'active') {
      // 查询活动计时器
      fetch(`${SERVER_ADDRESS}/api/timers`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': req.get('User-Agent') || 'API-Routes'
        }
      })
      .then(response => response.json())
      .then(result => {
        console.log(`获取到 ${result.length} 个活动计时器`);
        res.json({
          success: true,
          code: 200,
          message: '查询活动计时器成功',
          data: {
            total: result.length,
            items: result,
            query: data
          }
        });
      })
      .catch(error => {
        console.error('查询计时器失败:', error);
        res.status(500).json({
          success: false,
          code: 500,
          message: '查询活动计时器失败',
          data: null
        });
      });
      return;
    } else if (queryType === 'history') {
      // 使用自定义GET请求从后端获取历史记录数据
      fetch(`${SERVER_ADDRESS}/api/timer-history`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': req.get('User-Agent') || 'API-Routes'
        }
      })
      .then(response => response.json())
      .then(result => {
        if (result.success) {
          console.log(`获取到 ${result.data.length} 条计时器历史记录`);
          res.json({
            success: true,
            code: 200,
            message: '查询计时器历史记录成功',
            data: {
              total: result.data.length,
              items: result.data,
              query: data
            }
          });
        } else {
          res.status(400).json({
            success: false,
            code: 400,
            message: result.message || '查询计时器历史记录失败',
            data: null
          });
        }
      })
      .catch(error => {
        console.error('查询计时器历史记录失败:', error);
        res.status(500).json({
          success: false,
          code: 500,
          message: '查询计时器历史记录失败',
          data: null
        });
      });
      return;
    }
  }
  
  // 模拟查询结果
  const results = [
    { id: '1', name: '示例1', value: 100, createdAt: '2023-01-01T00:00:00Z' },
    { id: '2', name: '示例2', value: 200, createdAt: '2023-01-02T00:00:00Z' },
    { id: '3', name: '示例3', value: 300, createdAt: '2023-01-03T00:00:00Z' }
  ];
  
  // 模拟处理
  setTimeout(() => {
    res.json({
      success: true,
      code: 200,
      message: '查询成功',
      data: {
        total: results.length,
        items: results,
        page: data.page || 1,
        pageSize: data.pageSize || 10,
        query: data
      }
    });
  }, 100);
}

module.exports = router;
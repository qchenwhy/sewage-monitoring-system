require('dotenv').config();

// 简单使用node-fetch，不使用任何代理
const { fetch } = require('undici');

const express = require('express');
const mqtt = require('mqtt');
const mysql = require('mysql2');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { Readable } = require('stream');
const multer = require('multer');
const FormData = require('form-data');
const ffmpeg = require('fluent-ffmpeg');
const { classifyMessage, callDifyAPI, registerTempPromptCallback, registerUpdateResponseCallback } = require('./message-classifier');

// 引入必要的模块
const { Pool } = require('pg');
const { exec } = require('child_process');
const crypto = require('crypto');

// 引入Modbus数据调度器模块
const { initScheduler: initModbusDataScheduler } = require('./modbus/modbus-data-scheduler');

// 引入Dify知识库服务
const difyKnowledgeService = require('./modbus/dify-knowledge-service').getInstance();

// 引入Dify定时任务路由
const difyTaskRoutes = require('./modbus/dify-hourly-routes');

// 在文件开头引入全面修复脚本
const alarmFix = require('./modbus/fix-all-alarms');

// 在合适的位置 (例如其他服务初始化之后) 添加日报服务初始化
const dailyReportService = require('./modbus/daily-report-service').getInstance();

// 创建Express应用
const app = express();

// 启用CORS和JSON解析中间件
app.use(cors());
app.use(express.json());

// 提供静态文件服务
app.use(express.static('public'));
app.use('/audio', express.static('audio')); // 添加音频文件静态服务
app.use('/recordings', express.static('public/recordings')); // 添加录音文件静态服务

// 配置MIME类型，确保ES6模块能正确加载
app.use((req, res, next) => {
  if (req.url.endsWith('.js')) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  } else if (req.url.endsWith('.mjs')) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  }
  next();
});

// 导入数据控制API路由
const dataControlRoutes = require('./routes/data-control-api');

// 导入工作计划API路由
const workPlansRoutes = require('./routes/work-plans-api');

// 导入工作总结API路由
const workSummariesRoutes = require('./routes/work-summaries-api');

// 导入数据写入API路由
const dataWriteRoutes = require('./routes/data-write-api');

// 导入单点报警API路由
const singlePointAlarmRoutes = require('./routes/single-point-alarm');

// 导入数据点批量操作路由
const dataPointBatchRoutes = require('./routes/data-point-batch');

// 注册数据控制API路由
app.use('/api/data-control', dataControlRoutes);

// 注册工作计划API路由
app.use('/api/work-plans', workPlansRoutes);

// 注册工作总结API路由
app.use('/api/work-summaries', workSummariesRoutes);

// 注册数据写入API路由
app.use('/api/data-write', dataWriteRoutes);

// 注册单点报警API路由
app.use('/api/single-point-alarm', singlePointAlarmRoutes);

// 注册数据点批量操作路由
app.use('/api/data-point-batch', dataPointBatchRoutes);

// 添加告警测试API端点
app.post('/api/test-alarm', (req, res) => {
  try {
    const { type, identifier, content } = req.body;
    
    if (!type || !identifier || !content) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: type, identifier, content'
      });
    }
    
    // 获取MQTT服务实例
    const MQTTService = require('./modules/mqtt-service');
    const mqttService = MQTTService.getInstance();
    
    if (type === 'trigger') {
      // 触发告警
      const alarmData = {
        identifier: identifier,
        content: content,
        timestamp: new Date().toISOString(),
        dataPointName: identifier
      };
      
      // 直接发送告警消息到WebSocket客户端
      mqttService.sendToWebSocketClients({
        type: 'alarm',
        data: alarmData
      });
      
      console.log(`[测试API] 触发告警: ${identifier} - ${content}`);
      
      res.json({
        success: true,
        message: '告警已触发',
        data: alarmData
      });
    } else if (type === 'clear') {
      // 解除告警
      const clearData = {
        identifier: identifier,
        content: content,
        timestamp: new Date().toISOString(),
        dataPointName: identifier
      };
      
      // 直接发送告警解除消息到WebSocket客户端
      mqttService.sendToWebSocketClients({
        type: 'alarm_cleared',
        data: clearData
      });
      
      console.log(`[测试API] 解除告警: ${identifier} - ${content}`);
      
      res.json({
        success: true,
        message: '告警已解除',
        data: clearData
      });
    } else {
      res.status(400).json({
        success: false,
        error: '无效的告警类型，支持: trigger, clear'
      });
    }
  } catch (error) {
    console.error('[测试API] 告警测试失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 为测试知识库上传页面添加特定路由
app.get('/test-knowledge', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'test-knowledge-upload.html'));
});

// 添加路由别名，以防用户访问文件名而不是路由
app.get('/test-knowledge-upload.html', (req, res) => {
  res.redirect('/test-knowledge');
});

// 工作任务管理页面路由
app.get('/work-tasks-view', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'work-tasks-view.html'));
});

// 数据控制API测试页面路由
app.get('/test-data-control', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'test-data-control.html'));
});

// 工作计划API测试页面路由
app.get('/test-work-plans', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'test-work-plans.html'));
});

// 工作计划API文档页面路由
app.get('/work-plans-api-docs', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'work-plans-api-docs.html'));
});

// 工作总结页面路由
app.get('/work-summaries', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'work-summaries.html'));
});

// Chat告警功能测试页面路由
app.get('/test-chat-alarm', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'test-chat-alarm.html'));
});

// ==================== Dify知识库API路由 ====================

// === DIFY DEBUG ROUTES ===
// 这些路由仅用于调试Dify API问题
app.get('/api/dify/debug/status', (req, res) => {
  // 返回当前Dify配置和状态的详细信息
  try {
    const status = {
      serverInfo: {
        nodejs: process.version,
        platform: process.platform,
        arch: process.arch,
        memory: process.memoryUsage(),
        uptime: process.uptime()
      },
      config: difyKnowledgeService.getConfig(),
      initialized: difyKnowledgeService.initialized,
      syncActive: !!difyKnowledgeService.syncTimer,
      apiEndpoint: {
        url: difyKnowledgeService.getConfig().apiEndpoint,
        hasApiKey: !!difyKnowledgeService.getConfig().apiKey,
        keyPrefix: difyKnowledgeService.getConfig().apiKey ? 
          difyKnowledgeService.getConfig().apiKey.substring(0, 10) + '...' : 'none'
      }
    };
    
    res.json(status);
  } catch (error) {
    res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
});

// 测试Dify API端点
app.get('/api/dify/debug/test-connection', async (req, res) => {
  try {
    const axios = require('axios');
    const config = difyKnowledgeService.getConfig();
    
    // 测试结果
    const results = {
      tests: [],
      summary: {},
      timestamp: new Date().toISOString()
    };
    
    // 测试1: 基本连接
    try {
      console.log(`测试基本连接: ${config.apiEndpoint}`);
      const baseResponse = await axios.get(config.apiEndpoint, {
        timeout: 10000,
        validateStatus: () => true
      });
      
      results.tests.push({
        name: '基本连接测试',
        url: config.apiEndpoint,
        success: baseResponse.status < 400,
        status: baseResponse.status,
        statusText: baseResponse.statusText,
        headers: baseResponse.headers,
        dataPreview: typeof baseResponse.data === 'object' ? 
          JSON.stringify(baseResponse.data).substring(0, 200) : 
          String(baseResponse.data).substring(0, 200)
      });
    } catch (error) {
      results.tests.push({
        name: '基本连接测试',
        url: config.apiEndpoint,
        success: false,
        error: error.message,
        code: error.code
      });
    }
    
    // 测试2: 知识库列表API
    try {
      console.log(`测试知识库列表API: ${config.apiEndpoint}/datasets`);
      const datasetsResponse = await axios.get(`${config.apiEndpoint}/datasets`, {
        timeout: 10000,
        validateStatus: () => true,
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Accept': 'application/json'
        }
      });
      
      results.tests.push({
        name: '知识库列表API测试',
        url: `${config.apiEndpoint}/datasets`,
        success: datasetsResponse.status < 400,
        status: datasetsResponse.status,
        statusText: datasetsResponse.statusText,
        headers: datasetsResponse.headers,
        dataPreview: typeof datasetsResponse.data === 'object' ? 
          JSON.stringify(datasetsResponse.data).substring(0, 200) : 
          String(datasetsResponse.data).substring(0, 200)
      });
    } catch (error) {
      results.tests.push({
        name: '知识库列表API测试',
        url: `${config.apiEndpoint}/datasets`,
        success: false,
        error: error.message,
        code: error.code
      });
    }
    
    // 测试3: OPTIONS请求
    try {
      console.log(`测试OPTIONS请求: ${config.apiEndpoint}/datasets`);
      const optionsResponse = await axios({
        method: 'OPTIONS',
        url: `${config.apiEndpoint}/datasets`,
        headers: {
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization,content-type'
        },
        validateStatus: () => true
      });
      
      results.tests.push({
        name: 'OPTIONS请求测试',
        url: `${config.apiEndpoint}/datasets`,
        success: true,
        status: optionsResponse.status,
        statusText: optionsResponse.statusText,
        headers: optionsResponse.headers,
        corsSupport: !!optionsResponse.headers['access-control-allow-methods'],
        allowedMethods: optionsResponse.headers['access-control-allow-methods'] || '未返回'
      });
    } catch (error) {
      results.tests.push({
        name: 'OPTIONS请求测试',
        url: `${config.apiEndpoint}/datasets`,
        success: false,
        error: error.message,
        code: error.code
      });
    }
    
    // 计算摘要
    const successTests = results.tests.filter(t => t.success).length;
    results.summary = {
      total: results.tests.length,
      successful: successTests,
      failed: results.tests.length - successTests,
      success_rate: `${Math.round((successTests / results.tests.length) * 100)}%`
    };
    
    // 返回结果
    res.json(results);
  } catch (error) {
    res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
});

// 测试创建知识库
app.post('/api/dify/debug/test-create', async (req, res) => {
  try {
    const axios = require('axios');
    const config = difyKnowledgeService.getConfig();
    
    // 测试数据
    const testName = req.body.name || `测试知识库_${Date.now()}`;
    const testDescription = req.body.description || '这是一个测试知识库';
    
    // 记录信息
    console.log(`测试创建知识库: ${testName}`);
    console.log(`API端点: ${config.apiEndpoint}/datasets`);
    
    // 构建请求数据
    const requestData = {
      name: testName,
      description: testDescription
    };
    
    if (req.body.permission) {
      requestData.permission = req.body.permission;
    }
    
    const requestConfig = {
      method: 'post',
      url: `${config.apiEndpoint}/datasets`,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      data: requestData,
      timeout: 15000,
      validateStatus: () => true
    };
    
    // 记录请求详情
    console.log('请求配置:', {
      ...requestConfig,
      headers: {
        ...requestConfig.headers,
        'Authorization': requestConfig.headers['Authorization'].substring(0, 15) + '...'
      }
    });
    
    // 发送请求
    const response = await axios(requestConfig);
    
    // 记录响应
    console.log(`响应状态: ${response.status}`);
    console.log(`响应头: ${JSON.stringify(response.headers)}`);
    console.log(`响应数据: ${JSON.stringify(response.data)}`);
    
    // 返回结果
    res.json({
      success: response.status < 400,
      request: {
        url: requestConfig.url,
        method: requestConfig.method,
        data: requestData
      },
      response: {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data
      }
    });
  } catch (error) {
    console.error('测试创建知识库失败:', error);
    
    // 返回错误
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
      response: error.response ? {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      } : null
    });
  }
});

// 查看知识库文档的原始响应
app.get('/api/dify/debug/raw-documents', async (req, res) => {
  try {
    const axios = require('axios');
    const config = difyKnowledgeService.getConfig();
    
    if (!config.datasetId) {
      return res.status(400).json({
        error: '未配置知识库ID'
      });
    }
    
    // 发送请求
    const response = await axios.get(
      `${config.apiEndpoint}/datasets/${config.datasetId}/documents`,
      {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Accept': 'application/json'
        },
        validateStatus: () => true
      }
    );
    
    // 返回原始响应
    res.json({
      url: `${config.apiEndpoint}/datasets/${config.datasetId}/documents`,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: response.data
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      stack: error.stack,
      response: error.response ? {
        status: error.response.status,
        data: error.response.data
      } : null
    });
  }
});
// === END DIFY DEBUG ROUTES ===

// 获取Dify知识库状态
app.get('/api/dify/status', async (req, res) => {
  try {
    console.log('处理 /api/dify/status 请求');
    
    if (!difyKnowledgeService) {
      console.error('Dify知识库服务未初始化');
      return res.status(500).json({
        error: 'Dify知识库服务未初始化',
        errorCode: 'DIFY_SERVICE_NOT_INITIALIZED'
      });
    }
    
    // 基本状态信息
    const statusInfo = {
      enabled: difyKnowledgeService.getConfig().enabled,
      initialized: difyKnowledgeService.initialized,
      syncing: !!difyKnowledgeService.syncTimer,
      config: {
        apiEndpoint: difyKnowledgeService.getConfig().apiEndpoint,
        datasetId: difyKnowledgeService.getConfig().datasetId,
        syncInterval: difyKnowledgeService.getConfig().syncInterval,
        documentsPerDay: difyKnowledgeService.getConfig().documentsPerDay
      }
    };
    
    // 尝试获取更多知识库信息，但不要因此失败整个请求
    if (difyKnowledgeService.initialized && difyKnowledgeService.getConfig().datasetId) {
      try {
        const knowledgeInfo = await difyKnowledgeService.getKnowledgeInfo();
        statusInfo.knowledge = knowledgeInfo;
      } catch (error) {
        console.warn('获取知识库详细信息失败，继续返回基本状态:', error.message);
        // 不因此中断，仍然返回基本状态信息
      }
    }
    
    return res.json(statusInfo);
  } catch (error) {
    console.error('处理状态请求错误:', error);
    return res.status(500).json({
      error: error.message
    });
  }
});

// 更新Dify知识库配置
app.post('/api/dify/config', async (req, res) => {
  try {
    console.log('处理 /api/dify/config 请求:', req.body);
    const newConfig = req.body;
    if (!newConfig) {
      return res.status(400).json({ error: '无效的配置' });
    }
    
    const updatedConfig = difyKnowledgeService.updateConfig(newConfig);
    res.json({ success: true, config: updatedConfig });
  } catch (error) {
    console.error('更新Dify配置失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取知识库中的所有文档
app.get('/api/dify/documents', async (req, res) => {
  try {
    // ENHANCED DIFY API DEBUG
    console.log('==================================================');
    console.log('|              获取文档列表API调用                |');
    console.log('==================================================');
    console.log('请求时间:', new Date().toISOString());
    console.log('请求IP:', req.ip);
    console.log('请求方法:', req.method);
    console.log('请求头:', JSON.stringify(req.headers, null, 2));
    console.log('处理 /api/dify/documents 请求');
    if (!difyKnowledgeService.initialized) {
      const initResult = await difyKnowledgeService.initialize();
      if (!initResult) {
        return res.status(500).json({ error: '知识库服务未初始化' });
      }
    }
    
    const documents = await difyKnowledgeService.getDocuments();
    res.json({ success: true, documents });
  } catch (error) {
    console.error('获取知识库文档列表失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取文档内容
app.get('/api/dify/documents/:id', async (req, res) => {
  try {
    console.log(`处理 /api/dify/documents/${req.params.id} 请求`);
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ error: '缺少文档ID' });
    }
    
    if (!difyKnowledgeService.initialized) {
      const initResult = await difyKnowledgeService.initialize();
      if (!initResult) {
        return res.status(500).json({ error: '知识库服务未初始化' });
      }
    }
    
    const document = await difyKnowledgeService.getDocumentById(id);
    res.json({ success: true, document });
  } catch (error) {
    console.error('获取文档内容失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 同步数据到Dify知识库
app.post('/api/dify/sync', async (req, res) => {
  try {
    console.log('处理 /api/dify/sync 请求');
    
    if (!difyKnowledgeService) {
      return res.status(500).json({
        success: false,
        error: 'Dify知识库服务未初始化',
        errorCode: 'DIFY_SERVICE_NOT_INITIALIZED'
      });
    }
    
    // 初始化服务（如果需要）
    if (!difyKnowledgeService.initialized) {
      const initResult = await difyKnowledgeService.initialize();
      if (!initResult) {
        return res.status(500).json({
          success: false,
          error: '无法初始化Dify知识库服务',
          errorCode: 'INITIALIZATION_FAILED'
        });
      }
    }
    
    // 执行同步
    const result = await difyKnowledgeService.syncData();
    console.log('同步结果:', result);
    
    return res.json({
      success: result.success,
      message: result.success ? '数据已成功同步到Dify知识库' : '同步失败',
      error: result.error,
      document: result.success ? {
        id: result.documentId,
        title: result.documentTitle
      } : null
    });
  } catch (error) {
    console.error('同步数据到Dify知识库失败:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 手动同步数据到Dify知识库
app.post('/api/dify/sync/manual', async (req, res) => {
  try {
    console.log('处理 /api/dify/sync/manual 请求');
    
    if (!difyKnowledgeService) {
      return res.status(500).json({
        success: false,
        error: 'Dify知识库服务未初始化',
        errorCode: 'DIFY_SERVICE_NOT_INITIALIZED' 
      });
    }
    
    // 初始化服务（如果需要）
    if (!difyKnowledgeService.initialized) {
      const initResult = await difyKnowledgeService.initialize();
      if (!initResult) {
        return res.status(500).json({
          success: false,
          error: '无法初始化Dify知识库服务',
          errorCode: 'INITIALIZATION_FAILED'
        });
      }
    }
    
    // 执行同步
    const result = await difyKnowledgeService.syncData();
    console.log('手动同步结果:', result);
    
    // 处理特殊情况：索引中的文档
    if (!result.success && result.pendingIndexing) {
      return res.json({
        success: false,
        pendingIndexing: true,
        message: '文档正在索引中，暂时无法添加分段',
        error: result.error,
        documentId: result.documentId
      });
    }
    
    return res.json({
      success: result.success,
      message: result.success ? '数据已成功手动同步到Dify知识库' : '手动同步失败',
      error: result.error,
      document: result.success ? {
        id: result.documentId,
        title: result.documentTitle
      } : null
    });
  } catch (error) {
    console.error('手动同步数据到Dify知识库失败:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 创建新知识库
app.post('/api/dify/knowledge', async (req, res) => {
  try {
    // FIX: 更新知识库创建路由
    console.log('接收到创建知识库请求:', req.body);
    const { name, description } = req.body;
    
    if (!name) {
      console.log('知识库名称为空，返回400错误');
      return res.status(400).json({ error: '知识库名称是必需的' });
    }
    
    console.log(`准备创建知识库: ${name}, 描述: ${description || '(无)'}`);
    
    // 确保Dify服务已初始化
    if (!difyKnowledgeService.initialized) {
      console.log('Dify服务未初始化，尝试初始化...');
      const initialized = await difyKnowledgeService.initialize();
      if (!initialized) {
        console.log('Dify服务初始化失败');
        return res.status(500).json({ success: false, error: '知识库服务未初始化' });
      }
      console.log('Dify服务初始化成功');
    }
    
    // 尝试直接通过axios调用Dify API（绕过服务实现）
    try {
      console.log('尝试直接通过axios创建知识库...');
      
      const config = difyKnowledgeService.getConfig();
      const url = `${config.apiEndpoint}/datasets`;
      const data = { name, description };
      const headers = {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      };
      
      console.log('请求URL:', url);
      console.log('请求数据:', data);
      console.log('请求头:', {...headers, 'Authorization': `Bearer ${config.apiKey.substring(0, 10)}...`});
      
      const response = await axios.post(url, data, { headers });
      
      console.log('直接API调用成功:', response.status);
      console.log('响应数据:', response.data);
      
      // 更新配置中的datasetId
      if (response.data && response.data.id) {
        const newConfig = {...config, datasetId: response.data.id};
        difyKnowledgeService.updateConfig(newConfig);
        console.log(`已更新知识库ID: ${response.data.id}`);
      }
      
      return res.json({ success: true, dataset: response.data });
    } catch (axiosError) {
      console.error('直接API调用失败:', axiosError.message);
      
      if (axiosError.response) {
        console.error('状态码:', axiosError.response.status);
        console.error('响应数据:', axiosError.response.data);
      }
      
      // 失败后尝试原始方法
      console.log('尝试通过服务方法创建知识库...');
    }
    
    console.log('调用createEmptyKnowledge方法...');
    const result = await difyKnowledgeService.createEmptyKnowledge(name, description || '');
    console.log('知识库创建结果:', JSON.stringify(result));
    
    res.json({ success: true, dataset: result });
  } catch (error) {
    console.error('创建知识库失败:', error);
    console.error('详细错误信息:', error.response ? JSON.stringify(error.response.data) : '无详细信息');
    console.error('错误堆栈:', error.stack);
    
    res.status(500).json({ 
      success: false, 
      error: error.message,
      details: error.response ? error.response.data : null
    });
  }
});

// Dify知识库API路由诊断
app.get('/api/dify/routes', (req, res) => {
  try {
    console.log('接收到Dify路由诊断请求');
    
    // 检查difyKnowledgeService是否有效
    const serviceStatus = {
      exists: !!difyKnowledgeService,
      initialized: difyKnowledgeService ? difyKnowledgeService.initialized : false,
      config: difyKnowledgeService ? {
        enabled: difyKnowledgeService.getConfig().enabled,
        hasApiEndpoint: !!difyKnowledgeService.getConfig().apiEndpoint,
        hasApiKey: !!difyKnowledgeService.getConfig().apiKey,
        hasDatasetId: !!difyKnowledgeService.getConfig().datasetId
      } : null
    };
    
    res.json({
      success: true,
      message: 'Dify API路由已正确注册',
      serviceStatus: serviceStatus
    });
  } catch (error) {
    console.error('Dify路由诊断失败:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});
// ==================== Dify知识库API路由结束 ====================

// 注册Dify定时任务路由
app.use('/api/dify/task', difyTaskRoutes);

// 在静态文件路由之前注册定时任务页面路由
app.get('/dify-task-manager', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dify-task-manager.html'));
});

// 导入API路由
const apiRoutes = require('./routes/apiRoutes');

// 导入工作内容管理API路由
const workTaskRoutes = require('./routes/workTaskRoutes');

// 导入定时写入路由
const scheduledWriteRoutes = require('./routes/scheduled-write-routes');

app.use('/api', apiRoutes);

// 注册工作内容管理API路由
app.use('/api/work-tasks', workTaskRoutes);

// 注册定时写入API路由
app.use('/api/scheduled-write', scheduledWriteRoutes);

// 导入Modbus路由
const modbusRoutes = require('./routes/modbus-routes');
// 导入工作内容功能初始化脚本
const initWorkTasks = require('./init-work-tasks');
app.use('/api/modbus', modbusRoutes);

// 导入网页爬取路由
const webScraperRoutes = require('./routes/web-scraper-routes');
app.use('/api/web-scraper', webScraperRoutes);

// 添加根路由，返回HTML页面
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.get('/timer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/timer.html'));
});

app.get('/speech', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/speech-recognition.html'));
});

app.get('/modbus', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/modbus.html'));
});

// 网页爬取管理页面路由
app.get('/web-scraper', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/web-scraper-manager.html'));
});

// 添加可视化大屏的直接路由别名
app.get('/modbus/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

// MQTT服务器设置页面路由
app.get('/mqtt-settings', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/mqtt-settings.html'));
});

// MQTT设置API
app.get('/api/mqtt/settings', (req, res) => {
  try {
    // 尝试从配置文件中读取MQTT设置
    let mqttSettings = {};
    const settingsPath = path.join(__dirname, 'config', 'mqtt-settings.json');
    
    if (fs.existsSync(settingsPath)) {
      const settingsData = fs.readFileSync(settingsPath, 'utf8');
      mqttSettings = JSON.parse(settingsData);
    }
    
    res.json({
      success: true,
      settings: mqttSettings
    });
  } catch (error) {
    console.error('获取MQTT设置失败:', error);
    res.status(500).json({
      success: false,
      error: '获取MQTT设置失败: ' + error.message
    });
  }
});

app.post('/api/mqtt/settings', (req, res) => {
  try {
    const settings = req.body;
    
    // 验证必要的字段
    if (!settings.url) {
      return res.status(400).json({
        success: false,
        error: 'MQTT服务器地址不能为空'
      });
    }
    
    // 保存设置到配置文件
    const configDir = path.join(__dirname, 'config');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    const settingsPath = path.join(configDir, 'mqtt-settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    
    // 如果MQTT客户端已存在，则断开连接
    if (typeof mqttClient !== 'undefined' && mqttClient) {
      mqttClient.end();
    }
    
    // 禁用app.js中的MQTT客户端 - 避免与主MQTT服务 (modules/mqtt-service.js) 冲突
    // 注释掉MQTT客户端连接代码
    /*
    // 如果设置为MQTT数据源，则重新连接MQTT
    if (settings.dataSourceType === 'mqtt') {
      // 创建MQTT客户端
      const mqttOptions = {
        clientId: settings.clientId || `modbus_mqtt_client_${Math.random().toString(16).substring(2, 10)}`,
        username: settings.username,
        password: settings.password,
        clean: settings.clean !== false,
        reconnectPeriod: settings.reconnectPeriod || 5000,
        connectTimeout: settings.connectTimeout || 30000
      };
      
      mqttClient = mqtt.connect(settings.url, mqttOptions);
      
      mqttClient.on('connect', () => {
        console.log('已连接到MQTT服务器');
        
        // 订阅主题
        if (settings.subscribeTopic) {
          mqttClient.subscribe(settings.subscribeTopic, (err) => {
            if (err) {
              console.error('订阅主题失败:', err);
            } else {
              console.log(`已订阅主题: ${settings.subscribeTopic}`);
            }
          });
        }
      });
      
      mqttClient.on('message', (topic, message) => {
        try {
          console.log(`收到MQTT消息，主题: ${topic}`);
          
          let messageData;
          if (settings.dataFormat === 'json') {
            messageData = JSON.parse(message.toString());
          } else {
            messageData = message.toString();
          }
          
          // 发送消息到WebSocket客户端
          const dataToSend = {
            type: 'mqtt_data',
            topic: topic,
            data: messageData,
            timestamp: new Date().toISOString()
          };
          
          clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(dataToSend));
            }
          });
        } catch (error) {
          console.error('处理MQTT消息失败:', error);
        }
      });
      
      mqttClient.on('error', (err) => {
        console.error('MQTT连接错误:', err);
      });
    }
    */
    
    console.log('MQTT设置已保存 - app.js中的MQTT客户端已禁用，使用主MQTT服务');
    
    res.json({
      success: true,
      message: 'MQTT设置已保存'
    });
  } catch (error) {
    console.error('保存MQTT设置失败:', error);
    res.status(500).json({
      success: false,
      error: '保存MQTT设置失败: ' + error.message
    });
  }
});

app.post('/api/mqtt/test-connection', (req, res) => {
  try {
    const { url, clientId, username, password } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'MQTT服务器地址不能为空'
      });
    }
    
    // 创建临时MQTT客户端进行连接测试
    const mqttOptions = {
      clientId: clientId || `test_mqtt_client_${Math.random().toString(16).substring(2, 10)}`,
      username: username,
      password: password,
      clean: true,
      reconnectPeriod: 0, // 不自动重连
      connectTimeout: 5000 // 5秒超时
    };
    
    console.log(`尝试连接到MQTT服务器: ${url}`);
    const testClient = mqtt.connect(url, mqttOptions);
    
    // 设置超时
    const timeout = setTimeout(() => {
      testClient.end(true);
      return res.status(408).json({
        success: false,
        error: '连接超时'
      });
    }, 10000);
    
    testClient.on('connect', () => {
      clearTimeout(timeout);
      testClient.end();
      console.log('MQTT服务器连接测试成功');
      return res.json({
        success: true,
        message: '连接成功'
      });
    });
    
    testClient.on('error', (err) => {
      clearTimeout(timeout);
      testClient.end();
      console.error('MQTT服务器连接测试失败:', err);
      return res.status(500).json({
        success: false,
        error: '连接失败: ' + err.message
      });
    });
  } catch (error) {
    console.error('MQTT连接测试失败:', error);
    return res.status(500).json({
      success: false,
      error: '连接测试失败: ' + error.message
    });
  }
});

// 添加工作内容管理页面路由
app.get('/work-tasks', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/work-tasks.html'));
});

// 添加一个测试路由
app.get('/test', (req, res) => {
  res.send('服务器正常运行');
});

// 创建HTTP服务器
const server = http.createServer(app);

// 创建WebSocket服务器
const wss = new WebSocket.Server({ server });

// WebSocket客户端列表
const clients = new Set();

// WebSocket连接处理
wss.on('connection', (ws) => {
  console.log('WebSocket客户端已连接');
  
  // 添加到客户端列表
  clients.add(ws);
  
  // 当收到MQTT消息时，发送给所有WebSocket客户端
  const sendDataToClients = (data) => {
    // 发送给当前连接
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  };
  
  // 注册临时提示回调
  registerTempPromptCallback((tempResponse) => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log('发送临时提示:', tempResponse.answer);
      ws.send(JSON.stringify({
        type: 'chat_response',
        success: true,
        isTempPrompt: true,
        answer: tempResponse.answer,
        messageType: 'temp_prompt',
        conversation_id: tempResponse.conversation_id
      }));
    }
  });
  
  // 注册更新回调
  registerUpdateResponseCallback((finalResponse) => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log('更新临时提示为实际回复:', finalResponse.answer);
      
      // 判断是否为最终完整响应
      const isCompleteResponse = finalResponse.isComplete === true;
      console.log('发送响应更新，是否为完整响应:', isCompleteResponse);
      
      ws.send(JSON.stringify({
        type: 'chat_response_update',
        success: true,
        answer: finalResponse.answer,
        isUpdate: true,
        isComplete: isCompleteResponse,  // 使用传入的完整响应标记
        conversation_id: finalResponse.conversation_id
      }));
    }
  });
  
  // 处理WebSocket客户端消息
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      // 处理TTS请求
      if (data.type === 'tts_request') {
        console.log('收到TTS请求:', data.text ? data.text.substring(0, 50) + '...' : '无文本');
        
        if (!data.text) {
          ws.send(JSON.stringify({
            type: 'tts_response',
            success: false,
            requestId: data.requestId,
            error: '文本不能为空'
          }));
          return;
        }
        
        try {
          // 创建请求的唯一标识符
          const requestHash = createTextHash(data.text);
          const requestKey = `ws_tts_req_${data.requestId}_${requestHash}`;
          
          // 检查是否在短时间内有相同请求
          if (global[requestKey]) {
            console.log(`检测到WebSocket重复的TTS请求, 距上次请求仅${Date.now() - global[requestKey]}ms, 已阻止`);
            ws.send(JSON.stringify({
              type: 'tts_response',
              success: false,
              requestId: data.requestId,
              error: '短时间内请勿重复请求相同内容'
            }));
            return;
          }
          
          // 标记该请求已处理
          global[requestKey] = Date.now();
          setTimeout(() => {
            delete global[requestKey];
          }, 5000);
          
          // 调用语音合成
          const result = await synthesizeSpeech(data.text, {
            voice: data.voice || 'longxiaochun',
            format: 'mp3',
            sampleRate: 22050,
            requestId: data.requestId // 添加请求ID，用于跟踪
          });
          
          // 确保音频文件可访问
          ensureAudioFileAccessible(result.audioUrl);
          
          // 发送成功响应
          ws.send(JSON.stringify({
            type: 'tts_response',
            success: true,
            requestId: data.requestId,
            audioUrl: result.audioUrl
          }));
        } catch (error) {
          console.error('语音合成失败:', error);
          
          // 发送错误响应
          ws.send(JSON.stringify({
            type: 'tts_response',
            success: false,
            requestId: data.requestId,
            error: error.message
          }));
        }
      }
      
      // 处理聊天请求
      else if (data.type === 'chat_request') {
        console.log('收到聊天请求:', data.message);
        
        // 每次新请求时重置临时提示状态
        global.hasSentTempPrompt = false;
        
        if (!data.message) {
          ws.send(JSON.stringify({
            type: 'chat_response',
            success: false,
            requestId: data.requestId,
            error: '消息不能为空'
          }));
          return;
        }
        
        // 使用消息分类器进行消息分类
        const classResult = classifyMessage(data.message);
        console.log('消息分类结果:', classResult.type);
        
        // 如果是问候语，直接返回响应
        if (classResult.type === '问候语' && classResult.response) {
          ws.send(JSON.stringify({
            type: 'chat_response',
            success: true,
            requestId: data.requestId,
            answer: classResult.response,
            messageType: classResult.type
          }));
          return;
        }
        
        // 对于其他类型，调用相应的API
        try {
          // 保存当前请求ID，用于关联临时提示和最终回复
          const currentRequestId = data.requestId;
          
          // 调用对应的Dify API（这里不再等待result，而是通过回调机制获取结果）
          callDifyAPI(
            classResult.apiUrl, 
            classResult.apiKey, 
            data.message, 
            data.userId || 'default_user'
          ).then(result => {
            // 只有当不是临时提示、或者没有收到过临时提示时，才发送最终结果
            // 如果已发送临时提示，最终结果会通过updateResponseCallback发送
            if (!result.isTemporary && !global.hasSentTempPrompt) {
              // 发送最终结果到客户端
              ws.send(JSON.stringify({
                type: 'chat_response',
                success: true,
                requestId: currentRequestId,
                answer: result.answer || "抱歉，无法获取回答",
                messageType: classResult.type,
                conversation_id: result.conversation_id
              }));
            }
          }).catch(error => {
            console.error('API请求失败:', error);
            ws.send(JSON.stringify({
              type: 'chat_response',
              success: false,
              requestId: currentRequestId,
              error: `请求失败: ${error.message}`
            }));
          });
        } catch (error) {
          console.error('API请求失败:', error);
          ws.send(JSON.stringify({
            type: 'chat_response',
            success: false,
            requestId: data.requestId,
            error: `请求失败: ${error.message}`
          }));
        }
      }
    } catch (error) {
      console.error('处理WebSocket消息失败:', error);
      
      // 发送错误响应
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message
      }));
    }
  });
  
  // 处理WebSocket关闭
  ws.on('close', () => {
    console.log('WebSocket客户端已断开');
    clients.delete(ws); // 从客户端列表移除
  });
});

// 全局函数：将数据发送给所有WebSocket客户端
const sendDataToClients = (data) => {
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
};

// 添加在其他路由之前
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 优化API端点
app.get('/api/data', (req, res) => {
  const limit = parseInt(req.query.limit) || 10; // 允许通过查询参数指定返回数量
  const sql = 'SELECT * FROM sensor_data ORDER BY timestamp DESC LIMIT ?';
  
  connection.query(sql, [limit], (error, results) => {
    if (error) {
      console.error('查询错误:', error);
      res.status(500).json({ error: '数据库查询错误' });
    } else {
      res.json(results);
    }
  });
});

// 添加Dify API配置
const DIFY_API_KEY = process.env.DIFY_API_KEY || 'your-dify-api-key';
const DIFY_API_URL = process.env.DIFY_API_URL || 'https://api.dify.ai/v1';

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

// 将连接池导出，供其他模块使用
global.pool = pool;

// Dify API集成
app.post('/api/chat', async (req, res) => {
  const { query, conversation_id, user, files, round_id } = req.body;
  
  if (!query) {
    return res.status(400).json({ error: '查询内容不能为空' });
  }
  
  if (!user) {
    return res.status(400).json({ error: '用户标识不能为空' });
  }
  
  console.log(`========== 聊天请求开始 ==========`);
  console.log(`查询内容: "${query}"`);
  console.log(`会话ID: "${conversation_id || '无'}" (${conversation_id ? '已提供' : '未提供'})`);
  console.log(`用户标识: "${user}"`);
  console.log(`对话轮次ID: "${round_id || '无'}"`);
  console.log(`附件数量: ${files ? files.length : 0}`);
  
  try {
    // 准备请求数据
    const requestData = {
      inputs: {},
      query: query,
      response_mode: "streaming",
      user: user, // 使用客户端提供的稳定用户标识
      files: files ? files.map(file => ({
        type: file.type || "image",
        transfer_method: file.transfer_method || "remote_url",
        url: file.url
      })) : []
    };
    
    // 只有存在且非空且不是自定义格式时才添加会话ID
    if (conversation_id && !conversation_id.startsWith('chat_session_')) {
      requestData.conversation_id = conversation_id;
    }
    
    console.log(`发送到Dify的完整数据: ${JSON.stringify(requestData)}`);
    console.log(`API端点: ${process.env.DIFY_API_URL}/chat-messages`);
    
    // 发送请求到Dify API
    const response = await fetch(`${process.env.DIFY_API_URL}/chat-messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DIFY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });
    
    // 检查响应状态
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Dify API错误: ${response.status} ${errorText}`);
      
      // 如果是会话不存在错误，返回详细信息给客户端
      if (response.status === 404 && errorText.includes("Conversation Not Exists")) {
        console.error('会话ID不存在，客户端将尝试重置会话ID');
      }
      
      // 返回原始错误给客户端，保留状态码
      return res.status(response.status).json({ 
        error: '聊天服务错误', 
        message: errorText,
        status: response.status
      });
    }
    
    // 检查响应内容类型
    const contentType = response.headers.get('Content-Type');
    
    // 流式响应处理
    if (contentType && contentType.includes('text/event-stream')) {
      // 设置响应头
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      
      // 检查客户端连接状态
      req.on('close', () => {
        console.log('客户端连接已关闭');
        clearInterval(connectionCheck);
      });
      
      // 定期检查连接状态
      const connectionCheck = setInterval(() => {
        if (res.writableEnded) {
          console.log('响应已结束，停止检查');
          clearInterval(connectionCheck);
        } else {
          console.log('连接状态: 正常');
        }
      }, 2000);
      
      // 处理数据流
      const processStream = async () => {
        try {
          console.log('开始处理Dify流式响应，支持文本和语音流');
          
          // 生成本次流处理的唯一轮次ID，使用纯数字时间戳
          const round_id = Date.now().toString();
          console.log(`本次会话轮次ID: ${round_id}`);
          
          // 记录本轮已合成的文本，避免重复合成
          let alreadySynthesizedText = "";
          
          // 获取响应流
          const reader = response.body.getReader();
          
          // 初始化文本处理变量
          let currentText = '';
          let lastSynthesizedLength = 0;
          const minChunkSize = 10; // 最小合成长度，约10个字符
          let textBuffer = '';
          let fullText = '';
          let taskId = null; // 初始化任务ID变量
          
          // 添加全局计数器，跟踪合成次数
          let synthesisCount = 0;
          
          console.log('初始化文本处理变量: currentText="", lastSynthesizedLength=0, minChunkSize=10, textBuffer="", fullText=""');
          
          // 处理数据块
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              console.log(`Dify API流式响应结束`);
              
              // 不在这里处理剩余文本，因为message_end事件应该已经处理过了
              // 如果没有收到message_end事件，再处理剩余文本
              if (textBuffer.length > 0) {
                console.log(`检测到流结束但未收到message_end事件，处理剩余文本: "${textBuffer}"`);
                
                try {
                  // 合成剩余文本
                  const ttsResult = await synthesizeSpeech(textBuffer, {
                    voice: 'longxiaochun',
                    format: 'mp3',
                    sampleRate: 22050
                  });
                  
                  // 确保音频文件可访问
                  ensureAudioFileAccessible(ttsResult.audioUrl);
                  
                    // 发送音频URL到客户端
                    const audioEvent = {
                      event: 'audio',
                    url: ttsResult.audioUrl,
                    text: textBuffer,
                      isFinal: true
                    };
                  
                  console.log(`发送最终音频事件: ${JSON.stringify(audioEvent)}`);
                    res.write(`data: ${JSON.stringify(audioEvent)}\n\n`);
                    if (res.flush) res.flush();
                } catch (ttsError) {
                  console.error('最终语音合成失败:', ttsError);
                }
              }
              
              // 确保发送结束事件
              const endEvent = {
                event: 'message_end',
                roundId: round_id,
                serverProcessed: true
              };
              res.write(`data: ${JSON.stringify(endEvent)}\n\n`);
              res.end();
              break;
            }
            
            // 将二进制数据转换为文本
            const chunkText = new TextDecoder().decode(value);
            console.log(`收到数据块: ${chunkText.length} 字节`);
            
            // 处理SSE格式的数据
            const lines = chunkText.split('\n\n');
            for (const line of lines) {
              if (line.trim().startsWith('data:')) {
                const eventData = line.trim().substring(5).trim();
                if (eventData) {
                  try {
                    // 解析事件数据
                    const eventObj = JSON.parse(eventData);
                    console.log(`收到事件: ${eventObj.event}`);
                    
                    // 捕获任务ID (如果存在且尚未捕获)
                    if (eventObj.task_id && !taskId) {
                      taskId = eventObj.task_id;
                      console.log(`捕获到Dify任务ID: ${taskId}`);
                    }
                    
                    // 如果是消息事件，提取文本并发送到TTS服务
                    if (eventObj.event === 'message' && eventObj.answer) {
                      // 确保消息事件中包含任务ID
                      if (taskId && !eventObj.task_id) {
                        eventObj.task_id = taskId;
                        console.log(`向消息事件添加任务ID: ${taskId}`);
                      }
                      
                      console.log(`收到消息文本: ${eventObj.answer.substring(0, 50)}...`);
                      
                      // 更新当前文本
                      currentText = eventObj.answer;
                      console.log(`当前文本长度: ${currentText.length}, 已合成长度: ${lastSynthesizedLength}`);
                      
                      // 如果返回了会话ID，记录下来
                      if (eventObj.conversation_id) {
                        console.log(`Dify返回的会话ID: ${eventObj.conversation_id} (UUID格式)`);
                      } else {
                        console.log(`Dify未返回会话ID`);
                      }
                      
                      // 只更新文本缓冲区，不进行语音合成
                      textBuffer = currentText;
                      console.log(`更新文本缓冲区: "${textBuffer.substring(0, 50)}..."，等待message_end事件时再合成`);
                    } else if (eventObj.event === 'message_end') {
                      console.log('收到message_end事件，文本流结束');
                      
                      // 添加消息结束ID，确保唯一性
                      const messageEndId = `msg_end_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                      eventObj.messageEndId = messageEndId;
                      console.log(`添加消息结束ID: ${messageEndId}`);
                      
                      // 检查该message_end是否已处理过，避免重复处理
                      if (eventObj.messageEndProcessed) {
                        console.log('该message_end事件已被处理过，跳过重复处理');
                      } else {
                        // 标记为已处理
                        eventObj.messageEndProcessed = true;
                        
                        // 确保结束事件中包含任务ID
                        if (taskId && !eventObj.task_id) {
                          eventObj.task_id = taskId;
                          console.log(`向结束事件添加任务ID: ${taskId}`);
                        }
                        
                        // 处理剩余文本
                        if (textBuffer.length > 0) {
                          try {
                            // 规范化文本，避免因空白字符差异导致重复合成
                            const normalizedText = normalizeText(textBuffer);
                            console.log(`合成剩余文本（规范化后）: "${normalizedText}"`);
                            
                            // 添加轮次ID信息到文本哈希中，增强去重效果
                            const textWithRoundId = round_id ? `${normalizedText}_round_${round_id}` : normalizedText;
                            
                            // 检查文本是否已合成
                            if (isRecentlySynthesized(textWithRoundId)) {
                              console.log('文本已被合成过，跳过重复合成');
                              // 如果文本已被合成过，则跳过重复合成
                              textBuffer = '';
                            } else {
                              // 记录当前合成的轮次ID，用于后续去重
                              global.lastSynthesizedRoundId = round_id;
                              global.lastSynthesizedText = normalizedText;
                              
                              // 合成剩余文本
                              const ttsResult = await synthesizeSpeech(textBuffer, {
                                voice: 'longxiaochun',
                                format: 'mp3',
                                sampleRate: 22050,
                                roundId: round_id // 传递轮次ID
                              });
                              
                              // 确保音频文件可访问
                              ensureAudioFileAccessible(ttsResult.audioUrl);
                              
                              // 发送音频URL到客户端
                              const audioEvent = {
                                event: 'audio',
                                url: ttsResult.audioUrl,
                                text: textBuffer,
                                isFinal: true
                              };
                              
                              console.log(`发送最终音频事件: ${JSON.stringify(audioEvent)}`);
                              res.write(`data: ${JSON.stringify(audioEvent)}\n\n`);
                              if (res.flush) res.flush();
                            }
                          } catch (ttsError) {
                            console.error('最终语音合成失败:', ttsError);
                          }
                        }
                      }
                    }
                    
                    // 最后再次确保所有事件都包含任务ID
                    if (taskId && !eventObj.task_id) {
                      eventObj.task_id = taskId;
                    }
                    
                    // 为终止事件添加轮次ID标记
                    if (eventObj.event === 'message_end') {
                      eventObj.roundId = round_id;
                      eventObj.serverProcessed = true;
                    }
                    
                    // 发送原始数据到客户端
                    const modifiedEventData = JSON.stringify(eventObj);
                    res.write(`data: ${modifiedEventData}\n\n`);
                    // 添加刷新，确保数据立即发送到客户端
                    if (res.flush) {
                      res.flush();
                    }
                  } catch (e) {
                    console.error('解析事件数据失败:', e, eventData);
                    // 尝试发送原始数据
                    res.write(`data: ${eventData}\n\n`);
                    if (res.flush) res.flush();
                  }
                }
              }
            }
          }
        } catch (error) {
          console.error('流处理错误:', error);
          
          // 发送错误事件
          const errorEvent = {
            event: 'error',
            message: error.message,
            status: 500,
            code: 'stream_processing_error'
          };
          res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
          res.end();
        }
      };
      
      // 开始处理流
      processStream();
    } else {
      // 非流式响应
      const data = await response.json();
      console.log('收到Dify API非流式响应');
      res.json(data);
    }
  } catch (error) {
    console.error('聊天请求失败:', error);
    res.status(500).json({ 
      error: '聊天服务错误', 
      message: error.message
    });
  }
});

// 添加停止响应API
app.post('/api/chat/:task_id/stop', async (req, res) => {
  const { task_id } = req.params;
  const { user } = req.body;
  
  if (!task_id) {
    return res.status(400).json({ error: '任务ID不能为空' });
  }
  
  if (!user) {
    return res.status(400).json({ error: '用户标识不能为空' });
  }
  
  try {
    console.log(`停止任务: ${task_id}`);
    
    // 发送请求到Dify API
    const response = await fetch(`${process.env.DIFY_API_URL}/chat-messages/${task_id}/stop`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DIFY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ user })
    });
    
    // 检查响应状态
    if (!response.ok) {
      const errorText = await response.text();
      console.error('停止任务失败:', response.status, errorText);
      return res.status(response.status).json({ 
        error: '停止任务失败', 
        message: errorText
      });
    }
    
    // 返回结果
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('停止任务请求失败:', error);
    res.status(500).json({ 
      error: '停止任务失败', 
      message: error.message
    });
  }
});

// 添加消息反馈API
app.post('/api/messages/:message_id/feedbacks', async (req, res) => {
  const { message_id } = req.params;
  const { rating, user, content } = req.body;
  
  if (!message_id) {
    return res.status(400).json({ error: '消息ID不能为空' });
  }
  
  if (!user) {
    return res.status(400).json({ error: '用户标识不能为空' });
  }
  
  try {
    console.log(`提交消息反馈: ${message_id}, 评分: ${rating}`);
    
    // 发送请求到Dify API
    const response = await fetch(`${process.env.DIFY_API_URL}/messages/${message_id}/feedbacks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DIFY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ rating, user, content })
    });
    
    // 检查响应状态
    if (!response.ok) {
      const errorText = await response.text();
      console.error('提交反馈失败:', response.status, errorText);
      return res.status(response.status).json({ 
        error: '提交反馈失败', 
        message: errorText
      });
    }
    
    // 返回结果
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('提交反馈请求失败:', error);
    res.status(500).json({ 
      error: '提交反馈失败', 
      message: error.message
    });
  }
});

// 获取会话历史消息
app.get('/api/messages', async (req, res) => {
  const { conversation_id, user, first_id, limit } = req.query;
  
  if (!user) {
    return res.status(400).json({ error: '用户标识不能为空' });
  }
  
  try {
    // 构建查询参数
    const params = new URLSearchParams();
    if (conversation_id) params.append('conversation_id', conversation_id);
    params.append('user', user);
    if (first_id) params.append('first_id', first_id);
    if (limit) params.append('limit', limit);
    
    console.log(`获取会话历史消息: ${params.toString()}`);
    
    // 发送请求到Dify API
    const response = await fetch(`${process.env.DIFY_API_URL}/messages?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.DIFY_API_KEY}`
      }
    });
    
    // 检查响应状态
    if (!response.ok) {
      const errorText = await response.text();
      console.error('获取历史消息失败:', response.status, errorText);
      return res.status(response.status).json({ 
        error: '获取历史消息失败', 
        message: errorText
      });
    }
    
    // 返回结果
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('获取历史消息请求失败:', error);
    res.status(500).json({ 
      error: '获取历史消息失败', 
      message: error.message
    });
  }
});

// 获取会话列表
app.get('/api/conversations', async (req, res) => {
  const { user, last_id, limit, sort_by } = req.query;
  
  if (!user) {
    return res.status(400).json({ error: '用户标识不能为空' });
  }
  
  try {
    // 构建查询参数
    const params = new URLSearchParams();
    params.append('user', user);
    if (last_id) params.append('last_id', last_id);
    if (limit) params.append('limit', limit);
    if (sort_by) params.append('sort_by', sort_by);
    
    console.log(`获取会话列表: ${params.toString()}`);
    
    // 发送请求到Dify API
    const response = await fetch(`${process.env.DIFY_API_URL}/conversations?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.DIFY_API_KEY}`
      }
    });
    
    // 检查响应状态
    if (!response.ok) {
      const errorText = await response.text();
      console.error('获取会话列表失败:', response.status, errorText);
      return res.status(response.status).json({ 
        error: '获取会话列表失败', 
        message: errorText
      });
    }
    
    // 返回结果
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('获取会话列表请求失败:', error);
    res.status(500).json({ 
      error: '获取会话列表失败', 
      message: error.message
    });
  }
});

// 删除会话
app.delete('/api/conversations/:conversation_id', async (req, res) => {
  const { conversation_id } = req.params;
  const { user } = req.body;
  
  if (!conversation_id) {
    return res.status(400).json({ error: '会话ID不能为空' });
  }
  
  if (!user) {
    return res.status(400).json({ error: '用户标识不能为空' });
  }
  
  try {
    console.log(`删除会话: ${conversation_id}`);
    
    // 发送请求到Dify API
    const response = await fetch(`${process.env.DIFY_API_URL}/conversations/${conversation_id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${process.env.DIFY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ user })
    });
    
    // 检查响应状态
    if (!response.ok) {
      const errorText = await response.text();
      console.error('删除会话失败:', response.status, errorText);
      return res.status(response.status).json({ 
        error: '删除会话失败', 
        message: errorText
      });
    }
    
    // 返回结果
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('删除会话请求失败:', error);
    res.status(500).json({ 
      error: '删除会话失败', 
      message: error.message
    });
  }
});

// 获取应用参数
app.get('/api/parameters', async (req, res) => {
  try {
    console.log('获取应用参数');
    
    // 发送请求到Dify API
    const response = await fetch(`${process.env.DIFY_API_URL}/parameters`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.DIFY_API_KEY}`
      }
    });
    
    // 检查响应状态
    if (!response.ok) {
      const errorText = await response.text();
      console.error('获取应用参数失败:', response.status, errorText);
      return res.status(response.status).json({ 
        error: '获取应用参数失败', 
        message: errorText
      });
    }
    
    // 返回结果
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('获取应用参数请求失败:', error);
    res.status(500).json({ 
      error: '获取应用参数失败', 
      message: error.message
    });
  }
});

// 添加流式对话API端点
app.post('/api/chat/stream', async (req, res) => {
  const { message, systemPrompt } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: '消息不能为空' });
  }
  
  // 设置响应头，支持流式传输
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // 检查客户端连接状态
  req.on('close', () => {
    console.log('客户端连接已关闭');
    clearInterval(connectionCheck);
  });
  
  // 定期检查连接状态
  const connectionCheck = setInterval(() => {
    if (res.writableEnded) {
      console.log('响应已结束，停止检查');
      clearInterval(connectionCheck);
    } else {
      console.log('连接状态: 正常');
    }
  }, 2000);
  
  try {
    console.log(`开始流式对话合成: "${message.substring(0, 50)}..."`);
    
    // 分割文本为句子
    const sentences = message.match(/[^。！？.!?]+[。！？.!?]+/g) || [message];
    
    const audioUrls = [];
    
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      if (sentence.length === 0) continue;
      
      console.log(`处理第${i+1}/${sentences.length}个句子: "${sentence.substring(0, 50)}..."`);
      
      try {
        // 调用语音合成
        const result = await synthesizeSpeech(sentence, {
          voice: 'longxiaochun',
          format: 'mp3',
          sampleRate: 22050
        });
        
        // 存储音频URL
        audioUrls.push(result.audioUrl);
        
        // 确保音频文件可访问
        ensureAudioFileAccessible(result.audioUrl);
        
        // 发送音频URL到客户端
        const audioEvent = {
          event: 'audio',
          url: result.audioUrl,
          text: sentence,
          index: i,
          total: sentences.length,
          isFinal: i === sentences.length - 1
        };
        
        // 添加调试信息
        console.log(`发送音频事件: ${JSON.stringify(audioEvent)}`);
        
        // 确保数据格式正确
        const eventData = `data: ${JSON.stringify(audioEvent)}\n\n`;
        
        // 使用try-catch包装写入操作
        try {
          res.write(eventData);
          console.log(`成功写入事件数据: ${eventData.length} 字节`);
        } catch (writeError) {
          console.error(`写入事件数据失败: ${writeError.message}`);
        }
        
        // 确保数据被发送出去
        try {
          if (res.flush) {
            res.flush();
            console.log('成功刷新响应缓冲区');
          }
        } catch (flushError) {
          console.error(`刷新响应缓冲区失败: ${flushError.message}`);
        }
        
        // 添加延迟确保客户端有时间处理
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`第${i+1}次语音合成失败:`, error);
      }
    }
    
    // 在最后一个音频发送后，再次发送一个汇总事件
    if (i === sentences.length - 1) {
      const summaryEvent = {
        event: 'audio_summary',
        urls: audioUrls, // 存储所有生成的音频URL
        count: sentences.length
      };
      console.log(`发送音频汇总事件: ${JSON.stringify(summaryEvent)}`);
      
      // 使用try-catch包装写入操作
      try {
        res.write(`data: ${JSON.stringify(summaryEvent)}\n\n`);
        console.log('成功写入音频汇总事件');
        if (res.flush) res.flush();
      } catch (summaryError) {
        console.error(`发送音频汇总事件失败: ${summaryError.message}`);
      }
    }
  } catch (error) {
    console.error('流式对话合成失败:', error);
    
    // 发送错误事件
    const errorEvent = {
      event: 'error',
      message: error.message,
      status: 500,
      code: 'tts_stream_error'
    };
    res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
    res.end();
    clearInterval(connectionCheck);
  }
});

// 添加获取提示词模板API
app.get('/api/prompts', (req, res) => {
  const sql = 'SELECT * FROM prompt_templates ORDER BY name';
  connection.query(sql, (error, results) => {
    if (error) {
      console.error('查询提示词模板失败:', error);
      res.status(500).json({ error: '数据库查询错误' });
    } else {
      res.json(results);
    }
  });
});

// 添加保存提示词模板API
app.post('/api/prompts', (req, res) => {
  const { name, content } = req.body;
  
  if (!name || !content) {
    return res.status(400).json({ error: '名称和内容不能为空' });
  }
  
  const sql = 'INSERT INTO prompt_templates (name, content) VALUES (?, ?)';
  connection.query(sql, [name, content], (error, results) => {
    if (error) {
      console.error('保存提示词模板失败:', error);
      res.status(500).json({ error: '数据库操作错误' });
    } else {
      res.json({ id: results.insertId, name, content });
    }
  });
});

// 添加优雅退出处理
process.on('SIGINT', () => {
  // 添加存在性检查，避免mqttClient未定义导致的错误
  if (typeof mqttClient !== 'undefined' && mqttClient) {
    console.log('正在断开MQTT连接...');
  mqttClient.end();
  }
  
  // 添加存在性检查，避免connection未定义导致的错误
  if (typeof connection !== 'undefined' && connection) {
    console.log('正在关闭数据库连接...');
  connection.end((err) => {
    if (err) {
      console.error('关闭数据库连接时出错:', err);
    }
      console.log('数据库连接已关闭，程序退出');
      process.exit(0);
  });
  } else {
    console.log('无数据库连接需要关闭，程序退出');
    process.exit(0);
  }
});

// 数据模型API
// 获取所有数据模型
app.get('/api/datamodels', (req, res) => {
  const sql = 'SELECT * FROM data_models ORDER BY name';
  connection.query(sql, (error, results) => {
    if (error) {
      console.error('查询数据模型失败:', error);
      res.status(500).json({ error: '数据库查询错误' });
    } else {
      res.json(results);
    }
  });
});

// 创建数据模型
app.post('/api/datamodels', (req, res) => {
  const { name, identifier, type, accessType, isStored, storageType, storageInterval, hasAlarm, alarmCondition, alarmValue } = req.body;
  
  if (!name || !identifier || !type || !accessType) {
    return res.status(400).json({ error: '所有字段都是必填的' });
  }
  
  const sql = 'INSERT INTO data_models (name, identifier, type, accessType, isStored, storageType, storageInterval, hasAlarm, alarmCondition, alarmValue) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  connection.query(sql, [name, identifier, type, accessType, isStored, storageType, storageInterval, hasAlarm, alarmCondition, alarmValue], (error, results) => {
    if (error) {
      console.error('创建数据模型失败:', error);
      res.status(500).json({ error: '数据库操作错误' });
    } else {
      res.status(201).json({ id: results.insertId, name, identifier, type, accessType, isStored, storageType, storageInterval, hasAlarm, alarmCondition, alarmValue });
    }
  });
});

// 更新数据模型
app.put('/api/datamodels/:id', (req, res) => {
  const { id } = req.params;
  const { name, identifier, type, accessType, isStored, storageType, storageInterval, hasAlarm, alarmCondition, alarmValue } = req.body;
  
  if (!name || !identifier || !type || !accessType) {
    return res.status(400).json({ error: '所有字段都是必填的' });
  }
  
  const sql = 'UPDATE data_models SET name = ?, identifier = ?, type = ?, accessType = ?, isStored = ?, storageType = ?, storageInterval = ?, hasAlarm = ?, alarmCondition = ?, alarmValue = ? WHERE id = ?';
  connection.query(sql, [name, identifier, type, accessType, isStored, storageType, storageInterval, hasAlarm, alarmCondition, alarmValue, id], (error, results) => {
    if (error) {
      console.error('更新数据模型失败:', error);
      res.status(500).json({ error: '数据库操作错误' });
    } else if (results.affectedRows === 0) {
      res.status(404).json({ error: '数据模型不存在' });
    } else {
      res.json({ id, name, identifier, type, accessType, isStored, storageType, storageInterval, hasAlarm, alarmCondition, alarmValue });
    }
  });
});

// 删除数据模型
app.delete('/api/datamodels/:id', (req, res) => {
  const { id } = req.params;
  
  const sql = 'DELETE FROM data_models WHERE id = ?';
  connection.query(sql, [id], (error, results) => {
    if (error) {
      console.error('删除数据模型失败:', error);
      res.status(500).json({ error: '数据库操作错误' });
    } else if (results.affectedRows === 0) {
      res.status(404).json({ error: '数据模型不存在' });
    } else {
      res.status(204).send();
    }
  });
});

// 存储所有活动计时器
const activeTimers = new Map();

// 创建计时器API
app.post('/api/timers', (req, res) => {
  const { title, duration, message } = req.body;
  
  if (!title || !duration || !message) {
    return res.status(400).json({ error: '标题、时长和消息都是必填的' });
  }
  
  // 记录请求来源
  console.log('计时器请求来源:', req.get('User-Agent') || '未知');
  
  // 生成唯一ID
  const timerId = Date.now().toString();
  
  // 计算结束时间
  const endTime = Date.now() + (duration * 1000);
  
  // 创建计时器
  const timer = {
    id: timerId,
    title,
    duration,
    message,
    endTime,
    status: 'active'
  };
  
  // 存储计时器
  activeTimers.set(timerId, timer);
  
  // 设置定时器
  setTimeout(() => {
    // 更新状态
    timer.status = 'completed';
    
    // 广播到所有WebSocket客户端
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'timer_completed',
          timer: {
            id: timer.id,
            title: timer.title,
            message: timer.message
          }
        }));
      }
    });
    
    // 记录到数据库
    const sql = 'INSERT INTO timer_history (timer_id, title, message, completed_at) VALUES (?, ?, ?, NOW())';
    
    // 创建新的数据库连接来保存计时器历史记录
    try {
      const db = mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '753456Chen*',
        database: 'mqtt_data'
      });
      
      db.query(sql, [timer.id, timer.title, timer.message], (error) => {
      if (error) {
        console.error('保存计时器历史记录失败:', error);
        } else {
          console.log(`计时器记录已保存到数据库, ID=${timer.id}`);
      }
        // 完成后关闭连接
        db.end();
    });
    } catch (dbError) {
      console.error('创建数据库连接失败:', dbError);
    }
    
    console.log(`计时器 "${timer.title}" 已完成，消息: "${timer.message}"`);
    
  }, duration * 1000);
  
  // 返回计时器信息
  res.status(201).json(timer);
});

// 获取所有活动计时器
app.get('/api/timers', (req, res) => {
  const timers = Array.from(activeTimers.values());
  res.json(timers);
});

// 取消计时器
app.delete('/api/timers/:id', (req, res) => {
  const { id } = req.params;
  
  if (!activeTimers.has(id)) {
    return res.status(404).json({ error: '计时器不存在' });
  }
  
  // 删除计时器
  activeTimers.delete(id);
  
  res.status(204).send();
});

// 阿里云DashScope API Key
const ALIYUN_DASHSCOPE_API_KEY = process.env.ALIYUN_DASHSCOPE_API_KEY || 'your-dashscope-api-key';

// 确保音频目录存在
const audioDir = path.join(__dirname, 'public', 'audio');
const recordingsDir = path.join(__dirname, 'public', 'recordings'); // 新增录音文件目录

if (!fs.existsSync(audioDir)) {
  console.log(`创建音频目录: ${audioDir}`);
  fs.mkdirSync(audioDir, { recursive: true });
}

if (!fs.existsSync(recordingsDir)) {
  console.log(`创建录音目录: ${recordingsDir}`);
  fs.mkdirSync(recordingsDir, { recursive: true });
}

// 创建全局合成记录Map，记录最近合成的文本哈希值和时间
const recentSynthesisMap = new Map();
// 设置去重时间窗口（毫秒）
const SYNTHESIS_DEDUP_WINDOW = 5000; 

// 规范化文本内容，忽略换行符和多余空格等差异
function normalizeText(text) {
  if (!text) return '';
  // 将换行符替换为空格，压缩多个空格为一个，去除首尾空格
  return text.replace(/\s+/g, ' ').trim();
}

// 创建文本哈希值，用于快速比较文本是否相同
function createTextHash(text) {
  const normalized = normalizeText(text);
  
  // 提取轮次ID（如果存在）
  let roundId = '';
  const roundIdMatch = text.match(/round_(\d+)/);
  if (roundIdMatch) {
    roundId = roundIdMatch[1];
  }
  
  // 简单哈希算法，实际应用可考虑使用更复杂的算法
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 转换为32位整数
  }
  
  // 返回包含哈希值、文本长度和轮次ID的组合标识
  return roundId ? 
    `${hash}_${normalized.length}_round_${roundId}` : 
    `${hash}_${normalized.length}`;
}

// 检查是否在短时间内重复合成相同文本
function isRecentlySynthesized(text) {
  const textHash = createTextHash(text);
  const now = Date.now();
  
  // 清理过期记录
  for (const [hash, timestamp] of recentSynthesisMap.entries()) {
    if (now - timestamp > SYNTHESIS_DEDUP_WINDOW) {
      recentSynthesisMap.delete(hash);
    }
  }
  
  // 检查是否有重复
  if (recentSynthesisMap.has(textHash)) {
    console.log(`检测到最近5秒内已合成过相同文本，哈希值: ${textHash}`);
    return true;
  }
  
  // 检查是否有相似文本
  const normalizedText = normalizeText(text);
  
  // 使用简单的相似度检查 - 如果两个文本开头相同或高度相似，视为可能重复
  for (const [hash, timestamp] of recentSynthesisMap.entries()) {
    // 从缓存中提取原始文本(如果存在)
    const cachedText = global[`tts_text_${hash}`];
    if (cachedText) {
      const cachedNormalized = normalizeText(cachedText);
      
      // 检查文本开头是否相同(例如检查前50个字符)
      const checkLength = Math.min(50, normalizedText.length, cachedNormalized.length);
      if (normalizedText.substring(0, checkLength) === cachedNormalized.substring(0, checkLength)) {
        console.log(`检测到相似文本开头，可能是重复请求，已阻止`);
        return true;
      }
      
      // 检查文本长度是否相似且包含关系
      if (Math.abs(normalizedText.length - cachedNormalized.length) < 20) {
        if (normalizedText.includes(cachedNormalized) || cachedNormalized.includes(normalizedText)) {
          console.log(`检测到包含关系的相似文本，可能是重复请求，已阻止`);
          return true;
        }
      }
    }
  }
  
  // 记录当前文本
  recentSynthesisMap.set(textHash, now);
  // 缓存原始文本，用于相似度检查
  global[`tts_text_${textHash}`] = text;
  
  // 设置过期清理
  setTimeout(() => {
    delete global[`tts_text_${textHash}`];
  }, SYNTHESIS_DEDUP_WINDOW);
  
  return false;
}

// 使用WebSocket调用CosyVoice语音合成
async function synthesizeSpeech(text, options = {}) {
  // 获取调用栈信息，用于调试
  const stackTrace = new Error().stack;
  console.log(`============= 语音合成请求 =============`);
  console.log(`调用栈信息: ${stackTrace.split('\n').slice(2, 4).join('\n')}`);
  
  // 规范化文本内容
  const normalizedText = normalizeText(text);
  console.log(`原始文本: "${text}"`);
  console.log(`规范化文本: "${normalizedText}"`);
  
  // 检查是否短时间内有重复合成请求
  if (isRecentlySynthesized(normalizedText)) {
    console.log(`检测到5秒内重复合成相同内容，阻止重复请求`);
    return Promise.reject(new Error('重复的语音合成请求，已阻止'));
  }
  
  return new Promise((resolve, reject) => {
    const taskId = uuidv4();
    const timestamp = Date.now();
    
    // 构建文件名，加入轮次ID（如果存在）
    let fileName = `tts_${timestamp}`;
    if (options.roundId) {
      // 检查轮次ID是否已经包含"round_"前缀，避免重复
      const roundIdStr = options.roundId.toString();
      if (roundIdStr.startsWith('round_')) {
        fileName += `_${roundIdStr}`;
      } else {
        fileName += `_round_${roundIdStr}`;
      }
    }
    fileName += '.mp3';
    
    const filePath = path.join(audioDir, fileName);
    
    // 创建一个空文件
    fs.writeFileSync(filePath, Buffer.alloc(0));
    
    console.log('==================== WebSocket语音合成开始 ====================');
    console.log(`合成文本: "${text}"`);
    console.log(`任务ID: ${taskId}`);
    console.log(`轮次ID: ${options.roundId || '未指定'}`);
    console.log(`输出文件: ${filePath}`);
    
    // 连接WebSocket
    console.log('正在连接WebSocket服务器: wss://dashscope.aliyuncs.com/api-ws/v1/inference');
    const ws = new WebSocket('wss://dashscope.aliyuncs.com/api-ws/v1/inference', {
      headers: {
        'Authorization': `Bearer ${ALIYUN_DASHSCOPE_API_KEY}`
      }
    });
    
    let taskStarted = false;
    let audioReceived = false;
    let audioFrames = []; // 存储音频帧
    
    // 连接打开事件
    ws.on('open', () => {
      console.log('WebSocket连接已建立成功');
      
      // 发送run-task指令
      const runTaskCmd = {
        "header": {
          "action": "run-task",
          "task_id": taskId,
          "streaming": "duplex"
        },
        "payload": {
          "task_group": "audio",
          "task": "tts",
          "function": "SpeechSynthesizer",
          "model": "cosyvoice-v1",
          "parameters": {
            "text_type": "PlainText",
            "voice": options.voice || "longxiaochun",
            "format": options.format || "mp3",
            "sample_rate": options.sampleRate || 22050,
            "volume": options.volume || 50,
            "rate": options.rate || 1,
            "pitch": options.pitch || 1
          },
          "input": {}
        }
      };
      
      console.log('发送run-task指令');
      ws.send(JSON.stringify(runTaskCmd));
    });
    
    // 消息接收事件
    ws.on('message', (data) => {
      // 检查是否为二进制数据
      if (data instanceof Buffer) {
        // 尝试解析为JSON (有时二进制数据实际上是JSON消息)
        try {
          const jsonStr = data.toString('utf8');
          const jsonData = JSON.parse(jsonStr);
          
          
          
          if (jsonData.header && jsonData.header.event) {
            handleJsonMessage(jsonData);
          }
          return;
        } catch (e) {
          // 不是JSON，继续处理为二进制音频数据
        }
        
        console.log(`收到二进制音频数据: ${data.length} 字节`);
        
        // 将二进制数据存储到数组
        audioFrames.push(data);
        
        // 将二进制数据追加到文件
        fs.appendFileSync(filePath, data);
        audioReceived = true;
      } else {
        // 处理文本消息
        try {
          const message = JSON.parse(data.toString());
          console.log('收到文本消息:', JSON.stringify(message, null, 2));
          
          handleJsonMessage(message);
        } catch (error) {
          console.error('解析JSON消息失败:', error);
          console.error('原始消息:', data.toString());
        }
      }
    });
    
    // 处理JSON消息
    function handleJsonMessage(message) {
      if (message.header && message.header.event) {
        switch (message.header.event) {
          case 'task-started':
            console.log('语音合成任务已开始');
            taskStarted = true;
            
            // 发送continue-task指令
            const continueTaskCmd = {
              "header": {
                "action": "continue-task",
                "task_id": taskId,
                "streaming": "duplex"
              },
              "payload": {
                "input": {
                  "text": text
                }
              }
            };
            
            console.log('发送continue-task指令');
            ws.send(JSON.stringify(continueTaskCmd));
            
            // 发送finish-task指令
            const finishTaskCmd = {
              "header": {
                "action": "finish-task",
                "task_id": taskId,
                "streaming": "duplex"
              },
              "payload": {
                "input": {}
              }
            };
            
            console.log('发送finish-task指令');
            ws.send(JSON.stringify(finishTaskCmd));
            break;
            
          case 'task-finished':
            console.log('语音合成任务已完成');
            
            // 检查是否收到了音频数据
            if (audioReceived) {
              console.log('音频合成成功，关闭连接');
              ws.close();
              
              // 检查文件大小
              const fileSize = fs.statSync(filePath).size;
              console.log(`文件大小: ${fileSize} 字节`);
              
              if (fileSize > 0) {
                resolve({
                  success: true,
                  audioUrl: `/audio/${fileName}`,
                  streaming: true,
                  roundId: options.roundId // 返回轮次ID
                });
              } else {
                reject(new Error('生成的文件大小为0'));
              }
            } else {
              console.error('任务完成但未收到音频数据');
              ws.close();
              reject(new Error('任务完成但未收到音频数据'));
            }
            break;
            
          case 'task-failed':
            console.error('语音合成任务失败:', 
              message.header.error_code, 
              message.header.error_message);
            ws.close();
            reject(new Error(message.header.error_message || '语音合成失败'));
            break;
        }
      }
    }
    
    // 错误处理
    ws.on('error', (error) => {
      console.error('WebSocket错误:', error.message);
      reject(error);
    });
    
    // 连接关闭处理
    ws.on('close', (code, reason) => {
      console.log(`WebSocket连接已关闭: 代码=${code}, 原因=${reason || '未提供'}`);
      
      // 如果任务已开始但未完成，检查是否收到了音频数据
      if (taskStarted && audioReceived) {
        console.log('连接关闭但已收到音频数据，尝试返回文件');
        
        // 检查文件大小
        const fileSize = fs.statSync(filePath).size;
        console.log(`文件大小: ${fileSize} 字节`);
        
        if (fileSize > 0) {
          resolve({
            success: true,
            audioUrl: `/audio/${fileName}`,
            streaming: true,
            roundId: options.roundId // 返回轮次ID
          });
          return;
        }
      }
      
      if (!taskStarted) {
        reject(new Error('WebSocket连接已关闭，但任务尚未开始'));
      } else if (!audioReceived) {
        reject(new Error('WebSocket连接已关闭，但未收到音频数据'));
      } else {
        reject(new Error('WebSocket连接已关闭，但未能生成有效的音频文件'));
      }
    });
    
    // 设置任务超时处理
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        console.log('语音合成任务超时，关闭连接');
        ws.close();
        reject(new Error('语音合成任务超时'));
      }
    }, 30000); // 30秒超时
  });
}

// 文件上传处理
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // 确保recordings目录存在
    if (!fs.existsSync(recordingsDir)) {
      fs.mkdirSync(recordingsDir, { recursive: true });
    }
    cb(null, recordingsDir);
  },
  filename: function (req, file, cb) {
    // 使用时间戳和原始文件名，保持原始格式
    const timestamp = Date.now();
    const ext = file.originalname.split('.').pop();
    cb(null, `recording_${timestamp}.${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  // 只接受音频文件
  if (file.mimetype.startsWith('audio/')) {
    cb(null, true);
  } else {
    cb(new Error('只支持音频文件'));
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 15 * 1024 * 1024 // 限制15MB
  }
});

// 确保上传目录存在
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
}

// 文件上传API
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '没有上传文件' });
  }
  
  // 获取文件信息
  const file = req.file;
  
  // 生成公共URL
  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${file.filename}`;
  
  // 返回文件URL
  res.json({
                  success: true,
    url: fileUrl,
    filename: file.filename,
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size
  });
});

// 添加语音转文本API端点
app.post('/api/speech-to-text', upload.single('file'), async (req, res) => {
  let tempPcmFile = null;
  
  try {
    // 检查是否有文件上传
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: '没有上传文件'
      });
    }

    console.log('文件信息:', {
      文件名: req.file.originalname,
      保存路径: req.file.path,
      MIME类型: req.file.mimetype,
      文件大小: req.file.size
    });

    // 用户ID，默认为匿名
    const userId = req.body.user || 'anonymous';
    
    console.log(`处理模式: 完整识别, 用户ID: ${userId}`);

    // 转换音频为PCM格式
    tempPcmFile = path.join(recordingsDir, `temp_${Date.now()}.pcm`);
    
    await new Promise((resolve, reject) => {
      console.log(`开始将音频转换为PCM格式: ${req.file.path} -> ${tempPcmFile}`);
      
      // 首先检测文件格式
      ffmpeg.ffprobe(req.file.path, (err, metadata) => {
        if (err) {
          console.error('音频格式检测失败:', err);
          
          // 尝试用不同参数进行转换，即使格式检测失败
          console.log('尝试使用通用参数转换音频...');
          ffmpeg(req.file.path)
            .inputOptions(['-f', 'webm', '-acodec', 'libopus'])  // 强制指定输入格式和编解码器
            .outputOptions(['-ac', '1', '-ar', '16000'])  // 设置单声道，16kHz 采样率
            .format('s16le')  // PCM 16-bit little-endian
            .on('error', (convErr) => {
              console.error('备选方法音频转换失败:', convErr);
              
              // 最后尝试，使用更通用的方法
              ffmpeg(req.file.path)
                .inputOptions(['-f', 'lavfi', '-i', 'anullsrc=channel_layout=mono:sample_rate=16000'])
                .inputOptions(['-t', '0.01'])  // 创建一个短的空白音频
                .outputOptions(['-ac', '1', '-ar', '16000'])
                .format('s16le')
                .on('error', (finalErr) => {
                  console.error('所有转换方法均失败:', finalErr);
                  reject(finalErr);
                })
                .on('end', () => {
                  console.log('创建了空白PCM文件作为替代');
                  resolve();
                })
                .save(tempPcmFile);
            })
            .on('progress', (progress) => {
              console.log(`备选转换进度: ${progress.percent || 0}% 完成`);
            })
            .on('end', () => {
              console.log(`备选方法音频转换完成: ${tempPcmFile}`);
              
              // 验证文件是否存在
              if (fs.existsSync(tempPcmFile)) {
                const stats = fs.statSync(tempPcmFile);
                console.log(`PCM文件大小: ${stats.size} 字节`);
                if (stats.size === 0) {
                  reject(new Error('PCM文件大小为0字节'));
                  return;
                }
              } else {
                reject(new Error('PCM文件不存在'));
                return;
              }
              
              resolve();
            })
            .save(tempPcmFile);
          
          return;
        }
        
        // 如果成功探测到文件格式
        console.log('文件格式探测结果:', metadata.format.format_name);
        
        // 根据探测到的格式选择合适的转换参数
        let ffmpegCommand = ffmpeg(req.file.path);
        
        if (metadata.format.format_name.includes('webm')) {
          console.log('检测到WebM格式，使用特定参数');
          ffmpegCommand.inputOptions(['-acodec', 'libopus']);
        } else if (metadata.format.format_name.includes('ogg')) {
          console.log('检测到Ogg格式，使用特定参数');
          ffmpegCommand.inputOptions(['-acodec', 'libvorbis']);
        } else if (metadata.format.format_name.includes('mp3')) {
          console.log('检测到MP3格式，使用特定参数');
          ffmpegCommand.inputOptions(['-acodec', 'mp3']);
        } else if (metadata.format.format_name.includes('wav')) {
          console.log('检测到WAV格式，使用特定参数');
          ffmpegCommand.inputOptions(['-acodec', 'pcm_s16le']);
        }
        
        // 通用输出参数
        ffmpegCommand
          .toFormat('s16le') // PCM 16-bit little-endian
          .audioChannels(1) // 单声道
          .audioFrequency(16000) // 16kHz 采样率
          .on('error', (err) => {
            console.error('音频转换失败:', err);
            reject(err);
          })
          .on('progress', (progress) => {
            console.log(`转换进度: ${progress.percent || 0}% 完成`);
          })
          .on('end', () => {
            console.log(`音频转换完成: ${tempPcmFile}`);
            
            // 验证文件是否存在
            if (fs.existsSync(tempPcmFile)) {
              const stats = fs.statSync(tempPcmFile);
              console.log(`PCM文件大小: ${stats.size} 字节`);
              if (stats.size === 0) {
                reject(new Error('PCM文件大小为0字节'));
                return;
              }
            } else {
              reject(new Error('PCM文件不存在'));
              return;
            }
            
            resolve();
          })
          .save(tempPcmFile);
      });
    });

    // 使用Promise封装WebSocket语音识别过程
    const recognizeAudio = () => {
      return new Promise((resolve, reject) => {
        const taskId = uuidv4();
        let recognizedText = '';
        let recognizedSentences = []; // 存储识别出的所有句子
    let taskStarted = false;
        let hasReceivedResult = false;
        let reconnectAttempt = 0;
        const maxReconnectAttempts = 2;
        
        // 创建连接和启动任务的函数
        const createConnection = () => {
          console.log(`创建WebSocket连接，尝试次数: ${reconnectAttempt + 1}`);
          
          const ws = new WebSocket('wss://dashscope.aliyuncs.com/api-ws/v1/inference', {
            headers: {
              'Authorization': `Bearer ${ALIYUN_DASHSCOPE_API_KEY}`
            }
          });
    
    ws.on('open', () => {
      console.log('WebSocket连接已建立');
      
      const runTaskCmd = {
        header: {
                action: 'run-task',
          task_id: taskId,
                streaming: 'duplex'
        },
        payload: {
                task_group: 'audio',
                task: 'asr',
                function: 'recognition',
                model: 'paraformer-realtime-v2',
          parameters: {
                  sample_rate: 16000,
                  format: 'pcm',  // 明确指定使用PCM格式
                  enable_punctuation: true,
                  enable_timestamps: true,
                  semantic_punctuation_enabled: false,
                  max_sentence_silence: 500
          },
          input: {}
        }
      };
      
            console.log('发送run-task指令:', JSON.stringify(runTaskCmd));
      ws.send(JSON.stringify(runTaskCmd));
    });
    
          ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
              console.log('收到消息:', JSON.stringify(message, null, 2));
          
          if (message.header && message.header.event) {
            switch (message.header.event) {
              case 'task-started':
                    console.log('语音识别任务已开始');
                taskStarted = true;
                
                    try {
                      // 读取转换后的PCM文件
                      if (!fs.existsSync(tempPcmFile)) {
                        throw new Error(`PCM文件不存在: ${tempPcmFile}`);
                      }
                      
                      const fileBuffer = fs.readFileSync(tempPcmFile);
                      console.log(`读取PCM文件成功，大小: ${fileBuffer.length} 字节`);
                      
                      if (fileBuffer.length === 0) {
                        throw new Error('PCM文件大小为0字节');
                      }
                      
                      // 分批发送音频数据
                      const chunkSize = 16 * 1024; // 16KB分片
                      for (let i = 0; i < fileBuffer.length; i += chunkSize) {
                        if (ws.readyState !== WebSocket.OPEN) {
                          console.error('WebSocket连接已关闭，停止发送音频数据');
                          break;
                        }
                        
                        const chunk = fileBuffer.slice(i, Math.min(i + chunkSize, fileBuffer.length));
                        console.log(`发送音频数据分片: ${i}-${i + chunk.length}, ${chunk.length} 字节`);
                        ws.send(chunk);
                        
                        // 短暂停顿，避免发送过快
                        await new Promise(resolve => setTimeout(resolve, 10));
                      }
                      
                      if (ws.readyState === WebSocket.OPEN) {
                        console.log('音频文件发送完成');
                        
                        const finishTaskCmd = {
                  header: {
                            action: 'finish-task',
                    task_id: taskId,
                            streaming: 'duplex'
                  },
                  payload: {
                    input: {}
                  }
                        };
                        console.log('发送finish-task指令:', JSON.stringify(finishTaskCmd));
                        ws.send(JSON.stringify(finishTaskCmd));
                      }
                    } catch (fileError) {
                      console.error('读取或发送音频文件失败:', fileError);
                      ws.close();
                      reject(fileError);
                    }
                break;
                
                  case 'result-generated':
                    if (message.payload && message.payload.output && message.payload.output.sentence) {
                      hasReceivedResult = true;
                      const sentence = message.payload.output.sentence;
                      recognizedText = sentence.text || '';
                      console.log('当前识别文本:', recognizedText);
                      
                      // 向客户端发送实时识别结果
                      sendDataToClients({
                        type: 'asr_result',
                        text: recognizedText,
                        isFinal: sentence.sentence_end === true,
                        sentenceId: sentence.sentence_id
                      });
                      
                      // 如果是句子结束，添加到识别句子列表中
                      if (sentence.sentence_end === true) {
                        recognizedSentences.push(recognizedText);
                        console.log('收到最终识别结果');
                      }
                    }
                    break;

                  case 'task-finished':
                    console.log('语音识别任务完成');
                    if (!hasReceivedResult) {
                      console.warn('任务完成但未收到识别结果');
                      
                      if (reconnectAttempt < maxReconnectAttempts) {
                        reconnectAttempt++;
                        console.log(`尝试重新连接，次数: ${reconnectAttempt}`);
                        ws.close();
                        setTimeout(createConnection, 1000);
                        return;
          } else {
                        resolve({text: "", isFinal: true});
          }
        } else {
                      // 当任务完成时，将所有句子合并为完整结果
                      const fullText = recognizedSentences.join(' ');
                      
                      // 发送最终结果给客户端
                      sendDataToClients({
                        type: 'asr_complete',
                        text: fullText
                      });
                      
                      resolve({text: fullText, isFinal: true});
                    }
                    ws.close();
                    break;

                  case 'task-failed':
                    console.error('语音识别任务失败:', 
                      message.header.error_code,
                      message.header.error_message);
                    
                    if (message.header.error_code === 'UNSUPPORTED_FORMAT' && reconnectAttempt < maxReconnectAttempts) {
                      reconnectAttempt++;
                      console.log(`因格式错误重新尝试，尝试次数: ${reconnectAttempt}`);
                      ws.close();
                      setTimeout(createConnection, 1000);
                      return;
                    }
                    
                    reject(new Error(message.header.error_message || '语音识别失败'));
                    ws.close();
                    break;
                }
              }
            } catch (error) {
              console.error('处理WebSocket消息失败:', error);
            }
          });

          // 设置超时时间
          const timeoutDuration = 30000;
          setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
              console.log(`语音识别任务超时 (${timeoutDuration}ms)`);
              ws.close(1000);
              
              if (hasReceivedResult) {
                // 如果有部分结果，则返回所有识别的句子
                const fullText = recognizedSentences.join(' ');
                resolve({text: fullText, isFinal: true});
              } else {
                reject(new Error('语音识别任务超时'));
              }
            }
          }, timeoutDuration);
        };
        
        createConnection();
      });
    };

    try {
      // 执行语音识别
      const result = await recognizeAudio();
      console.log('识别结果:', result);
      
      // 返回识别结果
      if (!res.headersSent) {
        if (result.text && result.text.length > 0) {
          // 返回识别结果
          res.json({
            success: true,
            text: result.text,
            isFinal: true,
            language: 'zh'
          });
        } else {
          // 识别成功但没有文本内容
          res.json({
      success: true,
            text: "",
            message: "未能识别出语音内容，可能是因为音频质量不佳或无语音内容",
            isFinal: true,
            language: 'zh'
          });
        }
      }
    } catch (recognizeError) {
      console.error('语音识别失败:', recognizeError);
      
      // 确保只响应一次
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: '语音转文本失败',
          message: recognizeError.message
        });
      }
    }

  } catch (error) {
    console.error('处理请求失败:', error);
    
    // 确保只响应一次
    if (!res.headersSent) {
    res.status(500).json({ 
        success: false,
        error: '语音转文本失败',
        message: error.message
      });
    }
  } finally {
    // 清理临时文件
    try {
      if (req.file && req.file.path) {
        fs.unlinkSync(req.file.path);
        console.log('临时文件已删除:', req.file.path);
      }
      if (tempPcmFile && fs.existsSync(tempPcmFile)) {
        fs.unlinkSync(tempPcmFile);
        console.log('临时PCM文件已删除:', tempPcmFile);
      }
    } catch (error) {
      console.error('删除临时文件失败:', error);
    }
  }
});

// 提供上传文件的静态访问
app.use('/uploads', express.static('uploads'));

// 添加流式TTS API端点
app.post('/api/tts/stream', async (req, res) => {
  const { text, voice } = req.body;
  
  if (!text) {
    return res.status(400).json({ error: '文本不能为空' });
  }
  
  // 设置响应头，支持流式传输
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // 检查客户端连接状态
  req.on('close', () => {
    console.log('客户端连接已关闭');
    clearInterval(connectionCheck);
  });
  
  // 处理异常中断
  req.on('error', (error) => {
    console.error('请求发生错误:', error);
    clearInterval(connectionCheck);
  });
  
  // 定期检查连接状态
  const connectionCheck = setInterval(() => {
    if (res.writableEnded) {
      console.log('响应已结束，停止检查');
      clearInterval(connectionCheck);
    } else {
      console.log('连接状态: 正常');
    }
  }, 2000);
  
  try {
    console.log(`开始流式语音合成: "${text.substring(0, 50)}..."`);
    
    // 分割文本为句子
    const sentences = text.match(/[^。！？.!?]+[。！？.!?]+/g) || [text];
    
    const audioUrls = [];
    
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      if (sentence.length === 0) continue;
      
      console.log(`处理第${i+1}/${sentences.length}个句子: "${sentence.substring(0, 50)}..."`);
      
      try {
        // 调用语音合成
        const result = await synthesizeSpeech(sentence, {
          voice: voice || 'longxiaochun',
          format: 'mp3',
          sampleRate: 22050
        });
        
        // 存储音频URL
        audioUrls.push(result.audioUrl);
        
        // 确保音频文件可访问
        ensureAudioFileAccessible(result.audioUrl);
        
        // 发送音频URL到客户端
        const audioEvent = {
          event: 'audio',
          url: result.audioUrl,
          text: sentence,
          index: i,
          total: sentences.length,
          isFinal: i === sentences.length - 1
        };
        
        // 添加调试信息
        console.log(`发送音频事件: ${JSON.stringify(audioEvent)}`);
        
        // 确保数据格式正确
        const eventData = `data: ${JSON.stringify(audioEvent)}\n\n`;
        
        // 使用try-catch包装写入操作
        try {
          res.write(eventData);
          console.log(`成功写入事件数据: ${eventData.length} 字节`);
        } catch (writeError) {
          console.error(`写入事件数据失败: ${writeError.message}`);
        }
        
        // 确保数据被发送出去
        try {
          if (res.flush) {
            res.flush();
            console.log('成功刷新响应缓冲区');
          }
        } catch (flushError) {
          console.error(`刷新响应缓冲区失败: ${flushError.message}`);
        }
        
        // 添加延迟确保客户端有时间处理
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`第${i+1}次语音合成失败:`, error);
      }
    }
    
    // 在最后一个音频发送后，发送一个汇总事件
      const summaryEvent = {
        event: 'audio_summary',
        urls: audioUrls, // 存储所有生成的音频URL
      count: audioUrls.length
      };
      console.log(`发送音频汇总事件: ${JSON.stringify(summaryEvent)}`);
      
      // 使用try-catch包装写入操作
      try {
        res.write(`data: ${JSON.stringify(summaryEvent)}\n\n`);
        console.log('成功写入音频汇总事件');
        if (res.flush) res.flush();
      } catch (summaryError) {
        console.error(`发送音频汇总事件失败: ${summaryError.message}`);
      }
    
    // 发送结束事件
    const endEvent = {
      event: 'end',
      message: '语音合成完成'
    };
    res.write(`data: ${JSON.stringify(endEvent)}\n\n`);
    
    // 结束响应
    res.end();
    clearInterval(connectionCheck);
  } catch (error) {
    console.error('流式语音合成失败:', error);
    
    // 发送错误事件
    const errorEvent = {
      event: 'error',
      message: error.message,
      status: 500,
      code: 'tts_stream_error'
    };
    res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
    res.end();
    clearInterval(connectionCheck);
  }
});

// 添加API端点，获取音频文件列表
app.get('/api/audio/list', (req, res) => {
  try {
    // 检查public/audio目录
    const publicAudioDir = path.join(__dirname, 'public', 'audio');
    let files = [];
    
    if (fs.existsSync(publicAudioDir)) {
      files = fs.readdirSync(publicAudioDir)
        .filter(file => file.endsWith('.mp3'));
    }
    
    res.json({
      success: true,
      files: files
    });
  } catch (error) {
    console.error('获取音频文件列表失败:', error);
    res.status(500).json({
      success: false,
      error: '获取音频文件列表失败',
      message: error.message
    });
  }
});

// 添加API端点，删除单个音频文件
app.delete('/api/audio/delete/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    
    // 安全检查：确保文件名是有效的音频文件
    if (!filename || !filename.startsWith('tts_') || !filename.endsWith('.mp3')) {
      return res.status(400).json({
        success: false,
        error: '无效的文件名',
        message: '只能删除tts_开头的mp3文件'
      });
    }
    
    // 确定文件路径
    const publicAudioPath = path.join(__dirname, 'public', 'audio', filename);
    const audioPath = path.join(__dirname, 'audio', filename);
    
    let deleted = false;
    
    // 尝试从public/audio目录中删除
    if (fs.existsSync(publicAudioPath)) {
      fs.unlinkSync(publicAudioPath);
      console.log(`已从public目录删除音频文件: ${filename}`);
      deleted = true;
    }
    
    // 如果public目录中不存在，尝试从audio目录中删除
    if (!deleted && fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
      console.log(`已从audio目录删除音频文件: ${filename}`);
      deleted = true;
    }
    
    if (deleted) {
      res.json({
        success: true,
        message: `文件 ${filename} 已成功删除`
      });
    } else {
      res.status(404).json({
        success: false,
        error: '文件不存在',
        message: `未找到文件 ${filename}`
      });
    }
  } catch (error) {
    console.error('删除音频文件失败:', error);
    res.status(500).json({
      success: false,
      error: '删除音频文件失败',
      message: error.message
    });
  }
});

// 添加API端点，批量清理旧音频文件
app.post('/api/audio/cleanup', (req, res) => {
  try {
    const { sessionStartTime } = req.body;
    const startTime = sessionStartTime ? parseInt(sessionStartTime) : Date.now();
    
    // 创建存储目录列表
    const directories = [
      path.join(__dirname, 'public', 'audio'),
      path.join(__dirname, 'audio')
    ];
    
    let totalDeleted = 0;
    let deletedFiles = [];
    
    // 遍历每个目录
    directories.forEach(directory => {
      if (fs.existsSync(directory)) {
        const files = fs.readdirSync(directory)
          .filter(file => file.startsWith('tts_') && file.endsWith('.mp3'));
        
        // 删除旧文件（时间戳小于会话开始时间的文件）
        files.forEach(file => {
          try {
            // 从文件名提取时间戳
            const match = file.match(/tts_(\d+)\.mp3$/);
            if (match) {
              const fileTimestamp = parseInt(match[1]);
              
              // 只删除比会话开始时间早的文件
              if (fileTimestamp < startTime) {
                const filePath = path.join(directory, file);
                fs.unlinkSync(filePath);
                console.log(`已清理旧音频文件: ${filePath}`);
                deletedFiles.push(file);
                totalDeleted++;
              }
            }
          } catch (fileError) {
            console.error(`清理文件 ${file} 失败:`, fileError);
          }
        });
      }
    });
    
    res.json({
      success: true,
      deletedCount: totalDeleted,
      message: `已清理 ${totalDeleted} 个旧音频文件`,
      deletedFiles: deletedFiles
    });
  } catch (error) {
    console.error('清理音频文件失败:', error);
    res.status(500).json({
      success: false,
      error: '清理音频文件失败',
      message: error.message
    });
  }
});

// 添加timer.html使用的/api/tts接口（非流式返回）
app.post('/api/tts', async (req, res) => {
  const { text, voice, roundId } = req.body;
  
  if (!text) {
    return res.status(400).json({ error: '文本不能为空' });
  }
  
  console.log(`开始语音合成（非流式）: "${text.substring(0, 50)}...", 轮次ID: ${roundId || '未指定'}`);
  
  try {
    // 创建请求的唯一标识符，组合轮次ID和文本hash
    const requestHash = createTextHash(text);
    const requestKey = `tts_req_${roundId}_${requestHash}`;
    
    // 检查是否在短时间内有相同请求
    if (global[requestKey]) {
      console.log(`检测到重复的TTS请求, 距上次请求仅${Date.now() - global[requestKey]}ms, 已阻止`);
      return res.status(429).json({
        success: false,
        error: '重复的语音合成请求，已阻止',
        message: '短时间内请勿重复请求相同内容'
      });
    }
    
    // 标记该请求已处理，记录时间戳，5秒后自动清除
    global[requestKey] = Date.now();
    setTimeout(() => {
      delete global[requestKey];
    }, 5000);
    
    // 使用文本标点符号进行分段处理
    const segments = optimizeTextSegmentation(text);
    
    // 如果只有一个分段或分段太短，则直接整体合成
    if (segments.length <= 1 || text.length < 50) {
      // 调用语音合成服务
      const result = await synthesizeSpeech(text, {
        voice: voice || 'longxiaochun',
        format: 'mp3',
        sampleRate: 22050,
        roundId: roundId // 传递轮次ID
      });
      
      // 确保音频文件可访问
      ensureAudioFileAccessible(result.audioUrl);
      
      // 返回音频URL
      res.json({
        success: true,
        audioUrl: result.audioUrl,
        text: text,
        streaming: false,
        roundId: result.roundId // 返回轮次ID
      });
    } else {
      // 对于长文本，只合成第一段先返回给用户，确保快速响应
      console.log(`文本较长，分为${segments.length}段，先合成第一段`);
      
      // 合成第一段
      const firstSegment = segments[0];
      const result = await synthesizeSpeech(firstSegment, {
        voice: voice || 'longxiaochun',
        format: 'mp3',
        sampleRate: 22050,
        roundId: roundId // 传递轮次ID
      });
      
      // 确保音频文件可访问
      ensureAudioFileAccessible(result.audioUrl);
      
      // 启动后台任务，合成剩余段落
      if (segments.length > 1) {
        processSpeechSegmentsInBackground(segments.slice(1), voice || 'longxiaochun', roundId);
      }
      
      // 返回第一段的音频URL
      res.json({
        success: true,
        audioUrl: result.audioUrl,
        text: firstSegment,
        streaming: true,
        totalSegments: segments.length,
        roundId: result.roundId // 返回轮次ID
      });
    }
  } catch (error) {
    console.error('语音合成失败:', error);
    res.status(500).json({
      success: false,
      error: '语音合成失败',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * 后台处理语音段落合成
 * @param {Array<string>} segments 要合成的文本段落
 * @param {string} voice 语音角色
 * @param {string} roundId 对话轮次ID
 */
async function processSpeechSegmentsInBackground(segments, voice, roundId) {
  console.log(`后台开始处理${segments.length}个语音段落, 轮次ID: ${roundId || '未指定'}`);
  
  // 记录当前轮次的处理状态，避免重复处理
  const roundKey = `processing_round_${roundId}`;
  if (global[roundKey]) {
    console.log(`检测到轮次 ${roundId} 正在处理中，跳过重复处理`);
    return;
  }
  
  // 标记当前轮次为处理中
  global[roundKey] = true;
  
  // 为每个段落生成唯一标识，用于广播给客户端
  const segmentTasks = segments.map((segment, index) => ({
    id: `segment_${Date.now()}_${index}`,
    text: segment,
    index: index + 1, // 从1开始计数，因为第0段已经单独处理
    status: 'pending',
    audioUrl: null,
    roundId: roundId // 添加轮次ID
  }));
  
  try {
    // 串行处理每个段落，确保顺序合成
    for (const task of segmentTasks) {
      try {
        task.status = 'processing';
        
        // 检查文本是否已合成，避免重复合成
        const normalizedText = normalizeText(task.text);
        if (isRecentlySynthesized(normalizedText)) {
          console.log(`段落${task.index}的文本已被合成过，跳过: "${task.text.substring(0, 30)}..."`);
          continue;
        }
        
        // 合成语音
        const result = await synthesizeSpeech(task.text, {
          voice: voice,
          format: 'mp3',
          sampleRate: 22050,
          roundId: roundId // 传递轮次ID
        });
        
        // 确保音频文件可访问
        ensureAudioFileAccessible(result.audioUrl);
        
        // 更新任务状态
        task.status = 'completed';
        task.audioUrl = result.audioUrl;
        task.roundId = result.roundId; // 更新轮次ID
        
        // 广播给所有WebSocket客户端
        sendAudioUpdateToClients(task);
        
        // 短暂延迟，避免服务器负载过高
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`段落${task.index}语音合成失败:`, error);
        
        // 更新任务状态
        task.status = 'failed';
        task.error = error.message;
        
        // 广播错误信息给客户端
        sendAudioUpdateToClients(task);
      }
    }
  } finally {
    // 处理完成后，清除轮次处理标记
    delete global[roundKey];
    console.log(`后台语音段落处理完成，共${segmentTasks.length}个段落`);
  }
}

/**
 * 发送音频更新给WebSocket客户端
 * @param {Object} task 语音合成任务
 */
function sendAudioUpdateToClients(task) {
  // 只给活跃的WebSocket客户端发送
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'tts_segment_update',
        task: {
          id: task.id,
          index: task.index,
          status: task.status,
          audioUrl: task.audioUrl,
          text: task.text,
          error: task.error,
          roundId: task.roundId // 包含轮次ID
        }
      }));
    }
  });
}

// 优化文本分段函数，提供更合理的分段长度
function optimizeTextSegmentation(text) {
  if (!text || text.length === 0) return [text];
  
  // 定义中文和英文的标点符号
  const endPunctuations = ['。', '！', '？', '.', '!', '?']; // 句末标点
  const midPunctuations = ['；', '，', '、', '：', ';', ',', ':', '、']; // 句中标点
  
  // 长度配置
  const minLength = 15;   // 最小分段长度
  const idealLength = 50; // 理想分段长度
  const maxLength = 100;  // 最大分段长度
  
  const segments = [];
  let currentSegment = '';
  
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    currentSegment += char;
    
    // 分段条件判断
    const isEndPunctuation = endPunctuations.includes(char);
    const isMidPunctuation = midPunctuations.includes(char);
    
    // 分段策略：
    // 1. 句号等结束标点，且长度超过最小值，必定分段
    // 2. 逗号等中间标点，且长度超过理想值，进行分段
    // 3. 无标点但长度超过最大值，强制分段
    if ((isEndPunctuation && currentSegment.length >= minLength) || 
        (isMidPunctuation && currentSegment.length >= idealLength) ||
        (currentSegment.length >= maxLength)) {
      segments.push(currentSegment);
      currentSegment = '';
    }
  }
  
  // 处理剩余文本
  if (currentSegment.length > 0) {
    // 如果剩余文本很短且有前一个段落，合并到最后一个段落
    if (segments.length > 0 && currentSegment.length < minLength / 2) {
      segments[segments.length - 1] += currentSegment;
    } else {
      segments.push(currentSegment);
    }
  }
  
  // 如果没有分段，返回原文本作为一个段落
  if (segments.length === 0 && text.length > 0) {
    segments.push(text);
  }
  
  return segments;
}

// 获取计时器历史记录API
app.get('/api/timer-history', (req, res) => {
  console.log('=== 计时器历史记录API调试信息开始 ===');
  console.log('请求方法:', req.method);
  console.log('请求路径:', req.path);
  console.log('请求URL:', req.url);
  console.log('请求IP:', req.ip);
  console.log('请求头:', JSON.stringify(req.headers, null, 2));
  console.log('查询参数:', JSON.stringify(req.query, null, 2));
  console.log('=== 计时器历史记录API调试信息结束 ===');
  
  // 检查timer_history表是否存在
  connection.query("SHOW TABLES LIKE 'timer_history'", (tableError, tableResults) => {
    if (tableError) {
      console.error('检查timer_history表是否存在失败:', tableError);
      return res.status(500).json({
        success: false,
        message: '数据库错误',
        error: tableError.message,
        code: 500
      });
    }
    
    console.log('检查表结果:', JSON.stringify(tableResults));
    
    // 如果表不存在，尝试创建它
    if (tableResults.length === 0) {
      console.log('timer_history表不存在，尝试创建...');
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS timer_history (
          id INT AUTO_INCREMENT PRIMARY KEY,
          timer_id VARCHAR(255) NOT NULL,
          title VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          completed_at DATETIME NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;
      
      connection.query(createTableSQL, (createError) => {
        if (createError) {
          console.error('创建timer_history表失败:', createError);
          return res.status(500).json({
            success: false,
            message: '创建表失败',
            error: createError.message,
            code: 500
          });
        }
        
        console.log('timer_history表创建成功，现在查询数据');
        // 表已创建，继续查询（虽然表是空的）
        queryTimerHistory();
      });
    } else {
      // 表已存在，直接查询
      console.log('timer_history表已存在，直接查询数据');
      queryTimerHistory();
    }
  });
  
  function queryTimerHistory() {
    // 从数据库查询所有计时器历史记录
    const sql = 'SELECT id, timer_id, title, message, completed_at, created_at FROM timer_history ORDER BY created_at DESC';
    console.log('执行SQL查询:', sql);
    
    connection.query(sql, (error, results) => {
      if (error) {
        console.error('查询计时器历史记录失败:', error);
        return res.status(500).json({
          success: false,
          message: '获取计时器历史记录失败',
          error: error.message,
          code: 500
        });
      }
      
      console.log(`成功获取到 ${results.length} 条计时器历史记录`);
      if (results.length > 0) {
        console.log('第一条记录示例:', JSON.stringify(results[0], null, 2));
      } else {
        console.log('结果集为空');
      }
      
      // 返回查询结果
      const responseData = {
        success: true,
        message: '成功获取计时器历史记录',
        code: 200,
        data: results.map(record => ({
          id: record.id,
          timer_id: record.timer_id,
          title: record.title,
          message: record.message,
          completed_at: record.completed_at,
          created_at: record.created_at
        }))
      };
      
      console.log('响应状态码:', 200);
      console.log('响应数据长度:', responseData.data.length);
      res.status(200).json(responseData);
    });
  }
});

// API错误处理中间件
app.use((err, req, res, next) => {
  console.error('API错误:', err);
  res.status(err.status || 500).json({
    success: false,
    code: err.status || 500,
    message: err.message || '服务器内部错误',
    data: null
  });
});

// 添加一个API测试路由，用于验证add-timer API是否可用
app.get('/api/test/add-timer', (req, res) => {
  console.log('测试add-timer API可用性');
  res.json({
    api: '/api/add-timer',
    exists: true,
    status: 'available',
    method: 'POST',
    testTime: new Date().toISOString()
  });
});

// 添加计时项目的API接口
app.post('/api/add-timer', (req, res) => {
  const { title, duration, message, voice } = req.body;
  
  console.log('收到添加计时项目请求:', req.body);
  
  // 参数验证
  if (!title || !duration || !message) {
    return res.status(400).json({ 
      success: false,
      code: 400,
      message: '标题、时长和消息都是必填的',
      data: null
    });
  }
  
  // 记录请求来源
  console.log('计时器请求来源:', req.get('User-Agent') || '未知');
  
  // 生成唯一ID
  const timerId = Date.now().toString();
  
  // 计算结束时间
  const endTime = Date.now() + (Number(duration) * 1000);
  
  // 创建计时器
  const timer = {
    id: timerId,
    title,
    duration: Number(duration),
    message,
    voice: voice || 'longxiaochun', // 默认语音
    endTime,
    status: 'active'
  };
  
  // 存储计时器
  activeTimers.set(timerId, timer);
  
  console.log(`已添加计时项目: ID=${timerId}, 标题="${title}", 时长=${duration}秒, 消息="${message}", 语音="${timer.voice}"`);
  
  // 设置定时器
  setTimeout(async () => {
    try {
      // 更新状态
      timer.status = 'completed';
      
      console.log(`计时器 "${timer.title}" 已完成，开始合成语音消息: "${timer.message}"`);
      
      // 合成语音
      const speechResult = await synthesizeSpeech(timer.message, {
        voice: timer.voice
      });
      
      console.log(`语音合成成功，音频URL: ${speechResult.audioUrl}`);
      
      // 广播到所有WebSocket客户端
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'timer_completed',
            timer: {
              id: timer.id,
              title: timer.title,
              message: timer.message,
              audioUrl: speechResult.audioUrl
            }
          }));
        }
      });
      
      // 记录到数据库
      const sql = 'INSERT INTO timer_history (timer_id, title, message, completed_at) VALUES (?, ?, ?, NOW())';
      
      // 创建新的数据库连接来保存计时器历史记录
      try {
        const db = mysql.createConnection({
          host: 'localhost',
          user: 'root',
          password: '753456Chen*',
          database: 'mqtt_data'
        });
        
        db.query(sql, [timer.id, timer.title, timer.message], (error) => {
        if (error) {
          console.error('保存计时器历史记录失败:', error);
        } else {
          console.log(`计时器记录已保存到数据库, ID=${timer.id}`);
        }
          // 完成后关闭连接
          db.end();
      });
      } catch (dbError) {
        console.error('创建数据库连接失败:', dbError);
      }
    } catch (error) {
      console.error(`计时器处理失败:`, error);
      
      // 即使语音合成失败，仍然通知前端计时器完成
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'timer_completed',
            timer: {
              id: timer.id,
              title: timer.title,
              message: timer.message,
              error: error.message
            }
          }));
        }
      });
    }
  }, Number(duration) * 1000);
  
  // 返回计时器信息
  res.status(201).json({
    success: true,
    code: 201,
    message: '计时项目添加成功',
    data: timer
  });
});

// 添加API诊断路由
app.get('/api/debug/routes', (req, res) => {
  const routes = [];
  
  // 获取Express应用中所有已注册的路由
  app._router.stack.forEach(middleware => {
    if (middleware.route) {
      // 这是一个路由中间件
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods).map(m => m.toUpperCase()).join(', '),
        type: 'route'
      });
    } else if (middleware.name === 'router' && middleware.handle.stack) {
      // 这是一个路由器中间件
      const path = middleware.regexp.toString()
        .replace('\\/?(?=\\/|$)', '')
        .replace(/^\^\\\//, '/')
        .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '');
      
      middleware.handle.stack.forEach(handler => {
        if (handler.route) {
          const subPath = path.replace(/\\\//g, '/') + handler.route.path;
          routes.push({
            path: subPath.replace(/\/\//g, '/'), // 规范化路径
            methods: Object.keys(handler.route.methods).map(m => m.toUpperCase()).join(', '),
            type: 'subroute'
          });
        }
      });
    }
  });
  
  // 获取已注册的API路由
  const apiRoutes = routes.filter(route => route.path.startsWith('/api'));
  
  // 获取当前正在运行的服务器信息
  const serverInfo = {
    port: port,
    pid: process.pid,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    nodeVersion: process.version,
    platform: process.platform
  };
  
  res.json({
    server: serverInfo,
    registeredRoutes: routes.sort((a, b) => a.path.localeCompare(b.path)),
    apiRoutes: apiRoutes.sort((a, b) => a.path.localeCompare(b.path)),
    middlewares: app._router.stack.map(m => ({
      name: m.name,
      type: m.name === 'router' ? 'router' : (m.route ? 'route' : 'middleware')
    }))
  });
});
// 添加静态文件路由
app.use(express.static(path.join(__dirname, 'public')));



// 设置端口
const port = process.env.PORT || 3000; // 修改默认端口为3000
// 初始化工作内容功能
initWorkTasks(app).then(success => {
  console.log('工作内容功能初始化' + (success ? '成功' : '失败'));
}).catch(err => {
  console.error('工作内容功能初始化出错:', err);
});


// 应用启动时初始化Dify知识库服务并启动定时任务
/* 注释掉此处的initServices，使用下面server.listen中的初始化代码
(async function initServices() {
  try {
    console.log('初始化服务...');
    
    // 强制执行数据库迁移
    try {
      console.log('强制执行modbus_data_latest表结构迁移...');
      const { migrateDatabase } = require('./modbus/db-migration');
      const migrationResult = await migrateDatabase();
      console.log('数据库迁移结果:', migrationResult ? '成功' : '失败');
    } catch (migrationError) {
      console.error('执行数据库迁移失败:', migrationError);
    }
    
    // 初始化Dify知识库服务
    if (difyKnowledgeService) {
      const difyInitialized = await difyKnowledgeService.initialize();
      console.log(`Dify知识库服务初始化${difyInitialized ? '成功' : '失败'}`);
    }
    
    // 初始化Modbus数据定时任务调度器
    try {
      console.log('初始化Modbus数据定时任务调度器...');
      initModbusDataScheduler();
    } catch (schedulerError) {
      console.error('初始化Modbus数据定时任务调度器失败:', schedulerError);
    }
    
    // 初始化ModbusDbService并启动自动存储功能
    try {
      console.log('初始化ModbusDbService...');
      const modbusDbService = require('./modbus/modbus-db-service');
      const mysql = require('mysql2/promise');
      
      if (!modbusDbService.initialized) {
        await modbusDbService.initialize(mysql);
        console.log('ModbusDbService初始化成功');
        
        // 启动自动数据存储功能（每5分钟存储一次数据）
        modbusDbService.startAutoStorage(300000);
        console.log('已启动Modbus数据自动存储功能，间隔: 5分钟');
      }
    } catch (dbServiceError) {
      console.error('初始化ModbusDbService失败:', dbServiceError);
    }
    
    // 初始化ModbusService并尝试连接
    try {
      console.log('初始化ModbusService并尝试连接...');
      const modbusService = require('./modbus/modbus-service').getInstance();
      
      // 获取连接配置
      const config = modbusService.getConnectionConfigFromManager();
      console.log('Modbus连接配置:', config);
      
      // 尝试连接
      if (config.autoConnect) {
        console.log('尝试连接到Modbus服务器...');
        const connectResult = await modbusService.connect(config);
        console.log('Modbus连接结果:', connectResult);
        
        if (connectResult.success) {
          console.log(`已成功连接到Modbus服务器 ${config.host}:${config.port}`);
        } else {
          console.warn(`无法连接到Modbus服务器: ${connectResult.error}`);
        }
      } else {
        console.log('Modbus自动连接已禁用，跳过连接步骤');
      }
    } catch (serviceError) {
      console.error('初始化ModbusService失败:', serviceError);
    }
    
    // 执行Modbus告警系统修复
    console.log('执行Modbus告警系统全面修复...');
    try {
      const result = await alarmFix.runFullFix();
      console.log('Modbus告警系统修复完成，结果:', result);
    } catch (error) {
      console.error('Modbus告警系统修复失败:', error);
    }
    
  } catch (error) {
    console.error('服务初始化失败:', error);
  }
})();
*/

// 添加一个函数，确保音频文件在正确的位置
function ensureAudioFileAccessible(audioUrl) {
  try {
    // 从URL中提取文件名
    const fileName = audioUrl.split('/').pop();
    
    // 检查文件是否已经在public/audio目录
    const publicAudioPath = path.join(__dirname, 'public', 'audio', fileName);
    if (fs.existsSync(publicAudioPath)) {
      console.log(`音频文件已存在于public目录: ${publicAudioPath}`);
      
      // 检查文件是否可读
      try {
        fs.accessSync(publicAudioPath, fs.constants.R_OK);
        console.log(`音频文件可访问: ${publicAudioPath}`);
        return true;
      } catch (err) {
        console.error(`音频文件不可读: ${publicAudioPath}`, err);
      }
    }
    
    // 检查文件是否在audio目录
    const audioPath = path.join(__dirname, 'audio', fileName);
    if (fs.existsSync(audioPath)) {
      console.log(`发现音频文件在非public目录: ${audioPath}`);
      
      // 检查文件是否可读
      try {
        fs.accessSync(audioPath, fs.constants.R_OK);
      } catch (err) {
        console.error(`源音频文件不可读: ${audioPath}`, err);
        return false;
      }
      
      // 确保目标目录存在
      const publicAudioDir = path.join(__dirname, 'public', 'audio');
      if (!fs.existsSync(publicAudioDir)) {
        console.log(`创建public音频目录: ${publicAudioDir}`);
        fs.mkdirSync(publicAudioDir, { recursive: true });
      }
      
      // 复制文件到public目录
      fs.copyFileSync(audioPath, publicAudioPath);
      console.log(`已复制音频文件到public目录: ${publicAudioPath}`);
      return true;
    } else {
      console.log(`未找到音频文件: ${fileName}`);
      return false;
    }
  } catch (error) {
    console.error(`确保音频文件可访问时出错:`, error);
    return false;
  }
}

// 导入MQTT服务
const MQTTService = require('./modules/mqtt-service');
const mqttRoutes = require('./modules/mqtt-routes');

// 注册MQTT API路由
app.use('/api/mqtt', mqttRoutes);

// 添加静态文件路由
app.use(express.static(path.join(__dirname, 'public')));

// 仅保留一个HTTP服务器监听
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
  
  // 初始化MQTT服务
  try {
    console.log('初始化MQTT服务...');
    const mqttService = MQTTService.getInstance();
    mqttService.initialize(clients);
    console.log('MQTT服务初始化完成');
  } catch (error) {
    console.error('MQTT服务初始化失败:', error);
  }
  
  // 运行initServices函数，但不包括启动服务器部分
  (async function() {
    try {
      console.log('初始化服务...');
      
      // ===== 统一数据库初始化（优先执行） =====
      try {
        console.log('执行统一数据库初始化...');
        const { initializeDatabase } = require('./init-database');
        const dbInitResult = await initializeDatabase();
        console.log(`统一数据库初始化结果: ${dbInitResult ? '成功' : '失败'}`);
        
        if (!dbInitResult) {
          console.warn('统一数据库初始化失败，但继续启动其他服务...');
        }
      } catch (dbInitError) {
        console.error('统一数据库初始化过程中出错:', dbInitError);
        console.warn('数据库初始化失败，但继续启动其他服务...');
      }
      
      // 强制执行数据库迁移
      try {
        console.log('强制执行modbus_data_latest表结构迁移...');
        const { migrateDatabase } = require('./modbus/db-migration');
        const migrationResult = await migrateDatabase();
        console.log('数据库迁移结果:', migrationResult ? '成功' : '失败');
      } catch (migrationError) {
        console.error('执行数据库迁移失败:', migrationError);
      }
      
      // 初始化Dify知识库服务
      if (difyKnowledgeService) {
        const difyInitialized = await difyKnowledgeService.initialize();
        console.log(`Dify知识库服务初始化${difyInitialized ? '成功' : '失败'}`);
      }
      
      // 初始化Modbus数据定时任务调度器
      try {
        console.log('初始化Modbus数据定时任务调度器...');
        initModbusDataScheduler();
      } catch (schedulerError) {
        console.error('初始化Modbus数据定时任务调度器失败:', schedulerError);
      }
      
      // 初始化ModbusDbService并启动自动存储功能
      try {
        console.log('初始化ModbusDbService...');
        const modbusDbService = require('./modbus/modbus-db-service');
        const mysql = require('mysql2/promise');
        
        if (!modbusDbService.initialized) {
          await modbusDbService.initialize(mysql);
          console.log('ModbusDbService初始化成功');
          
          // 启动自动数据存储功能（每5分钟存储一次数据）
          modbusDbService.startAutoStorage(300000);
          console.log('已启动Modbus数据自动存储功能，间隔: 5分钟');
        }
      } catch (dbServiceError) {
        console.error('初始化ModbusDbService失败:', dbServiceError);
      }
      
      // 初始化ModbusService并尝试连接
      try {
        console.log('初始化ModbusService并尝试连接...');
        const modbusService = require('./modbus/modbus-service').getInstance();
        
        // 获取连接配置
        const config = modbusService.getConnectionConfigFromManager();
        console.log('Modbus连接配置:', config);
        
        // 尝试连接
        if (config.autoConnect) {
          console.log('尝试连接到Modbus服务器...');
          const connectResult = await modbusService.connect(config);
          console.log('Modbus连接结果:', connectResult);
          
          if (connectResult.success) {
            console.log(`已成功连接到Modbus服务器 ${config.host}:${config.port}`);
          } else {
            console.warn(`无法连接到Modbus服务器: ${connectResult.error}`);
          }
        } else {
          console.log('Modbus自动连接已禁用，跳过连接步骤');
        }
      } catch (serviceError) {
        console.error('初始化ModbusService失败:', serviceError);
      }
      
      // 执行Modbus告警系统修复
      console.log('执行Modbus告警系统全面修复...');
      try {
        const result = await alarmFix.runFullFix();
        console.log('Modbus告警系统修复完成，结果:', result);
      } catch (error) {
        console.error('Modbus告警系统修复失败:', error);
      }
      
    } catch (error) {
      console.error('服务初始化失败:', error);
    }
  })();
  
  // 初始化其他模块
  try {
    console.log('初始化Modbus数据调度器...');
    initModbusDataScheduler();
    console.log('Modbus数据调度器初始化完成');
  } catch (error) {
    console.error('Modbus数据调度器初始化失败:', error);
  }
  
  // 初始化工作内容管理
  try {
    console.log('初始化工作内容管理...');
    initWorkTasks();
    console.log('工作内容管理初始化完成');
  } catch (error) {
    console.error('工作内容管理初始化失败:', error);
  }
});

// 优雅退出处理
process.on('SIGINT', () => {
  // 断开MQTT连接
  try {
    const mqttService = MQTTService.getInstance();
    mqttService.disconnect();
  } catch (error) {
    console.error('断开MQTT连接失败:', error);
  }
  
  // 关闭数据库连接
  if (typeof connection !== 'undefined' && connection) {
    console.log('正在关闭数据库连接...');
    connection.end((err) => {
      if (err) {
        console.error('关闭数据库连接时出错:', err);
      }
      console.log('数据库连接已关闭，程序退出');
      process.exit(0);
    });
  } else {
    console.log('无数据库连接需要关闭，程序退出');
    process.exit(0);
  }
});


// ========== 多条件告警规则API ==========
// 存储多条件告警规则的文件路径
const multiConditionAlarmRulesFile = path.join(__dirname, 'data', 'multi-condition-alarm-rules.json');

// 确保数据目录存在
if (!fs.existsSync(path.dirname(multiConditionAlarmRulesFile))) {
  fs.mkdirSync(path.dirname(multiConditionAlarmRulesFile), { recursive: true });
}

// 读取多条件告警规则
function readMultiConditionAlarmRules() {
  try {
    if (fs.existsSync(multiConditionAlarmRulesFile)) {
      const data = fs.readFileSync(multiConditionAlarmRulesFile, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('读取多条件告警规则失败:', error);
    return [];
  }
}

// 写入多条件告警规则
function writeMultiConditionAlarmRules(rules) {
  try {
    fs.writeFileSync(multiConditionAlarmRulesFile, JSON.stringify(rules, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('写入多条件告警规则失败:', error);
    return false;
  }
}

// 获取所有多条件告警规则
app.get('/api/multi-condition-alarm-rules', (req, res) => {
  try {
    const rules = readMultiConditionAlarmRules();
    res.json(rules);
  } catch (error) {
    console.error('获取多条件告警规则失败:', error);
    res.status(500).json({ error: '获取多条件告警规则失败', details: error.message });
  }
});

// 创建新的多条件告警规则
app.post('/api/multi-condition-alarm-rules', (req, res) => {
  try {
    const newRule = req.body;
    
    // 验证必要字段
    if (!newRule.name || !newRule.category || !newRule.conditions || !Array.isArray(newRule.conditions)) {
      return res.status(400).json({ error: '缺少必要字段：name, category, conditions' });
    }
    
    if (newRule.conditions.length === 0) {
      return res.status(400).json({ error: '至少需要一个告警条件' });
    }
    
    // 验证每个条件
    for (let i = 0; i < newRule.conditions.length; i++) {
      const condition = newRule.conditions[i];
      if (!condition.datapoint || !condition.operator || condition.value === undefined || condition.value === '') {
        return res.status(400).json({ error: `条件 ${i + 1} 缺少必要字段：datapoint, operator, value` });
      }
    }
    
    const rules = readMultiConditionAlarmRules();
    
    // 生成唯一ID
    newRule.id = Date.now();
    newRule.createdAt = new Date().toISOString();
    
    rules.push(newRule);
    
    if (writeMultiConditionAlarmRules(rules)) {
      console.log('多条件告警规则创建成功:', newRule.name);
      res.status(201).json({ success: true, rule: newRule });
    } else {
      res.status(500).json({ error: '保存多条件告警规则失败' });
    }
  } catch (error) {
    console.error('创建多条件告警规则失败:', error);
    res.status(500).json({ error: '创建多条件告警规则失败', details: error.message });
  }
});

// 获取特定的多条件告警规则
app.get('/api/multi-condition-alarm-rules/:id', (req, res) => {
  try {
    const ruleId = parseInt(req.params.id);
    const rules = readMultiConditionAlarmRules();
    const rule = rules.find(r => r.id === ruleId);
    
    if (!rule) {
      return res.status(404).json({ error: '未找到指定的多条件告警规则' });
    }
    
    res.json(rule);
  } catch (error) {
    console.error('获取多条件告警规则失败:', error);
    res.status(500).json({ error: '获取多条件告警规则失败', details: error.message });
  }
});

// 更新多条件告警规则
app.put('/api/multi-condition-alarm-rules/:id', (req, res) => {
  try {
    const ruleId = parseInt(req.params.id);
    const updatedRule = req.body;
    const rules = readMultiConditionAlarmRules();
    const ruleIndex = rules.findIndex(r => r.id === ruleId);
    
    if (ruleIndex === -1) {
      return res.status(404).json({ error: '未找到指定的多条件告警规则' });
    }
    
    // 验证必要字段
    if (!updatedRule.name || !updatedRule.category || !updatedRule.conditions || !Array.isArray(updatedRule.conditions)) {
      return res.status(400).json({ error: '缺少必要字段：name, category, conditions' });
    }
    
    // 保持原有的ID和创建时间
    updatedRule.id = ruleId;
    updatedRule.createdAt = rules[ruleIndex].createdAt;
    updatedRule.updatedAt = new Date().toISOString();
    
    rules[ruleIndex] = updatedRule;
    
    if (writeMultiConditionAlarmRules(rules)) {
      console.log('多条件告警规则更新成功:', updatedRule.name);
      res.json({ success: true, rule: updatedRule });
    } else {
      res.status(500).json({ error: '保存多条件告警规则失败' });
    }
  } catch (error) {
    console.error('更新多条件告警规则失败:', error);
    res.status(500).json({ error: '更新多条件告警规则失败', details: error.message });
  }
});

// 删除多条件告警规则
app.delete('/api/multi-condition-alarm-rules/:id', (req, res) => {
  try {
    const ruleId = parseInt(req.params.id);
    const rules = readMultiConditionAlarmRules();
    const ruleIndex = rules.findIndex(r => r.id === ruleId);
    
    if (ruleIndex === -1) {
      return res.status(404).json({ error: '未找到指定的多条件告警规则' });
    }
    
    const deletedRule = rules[ruleIndex];
    rules.splice(ruleIndex, 1);
    
    if (writeMultiConditionAlarmRules(rules)) {
      console.log('多条件告警规则删除成功:', deletedRule.name);
      res.json({ success: true, deletedRule: deletedRule });
    } else {
      res.status(500).json({ error: '保存多条件告警规则失败' });
    }
  } catch (error) {
    console.error('删除多条件告警规则失败:', error);
    res.status(500).json({ error: '删除多条件告警规则失败', details: error.message });
  }
});

// 切换多条件告警规则启用状态
app.patch('/api/multi-condition-alarm-rules/:id/toggle', (req, res) => {
  try {
    const ruleId = parseInt(req.params.id);
    const rules = readMultiConditionAlarmRules();
    const ruleIndex = rules.findIndex(r => r.id === ruleId);
    
    if (ruleIndex === -1) {
      return res.status(404).json({ error: '未找到指定的多条件告警规则' });
    }
    
    rules[ruleIndex].enabled = !rules[ruleIndex].enabled;
    rules[ruleIndex].updatedAt = new Date().toISOString();
    
    if (writeMultiConditionAlarmRules(rules)) {
      console.log(`多条件告警规则 "${rules[ruleIndex].name}" 状态切换为:`, rules[ruleIndex].enabled ? '启用' : '禁用');
      res.json({ success: true, rule: rules[ruleIndex] });
    } else {
      res.status(500).json({ error: '保存多条件告警规则失败' });
    }
  } catch (error) {
    console.error('切换多条件告警规则状态失败:', error);
    res.status(500).json({ error: '切换多条件告警规则状态失败', details: error.message });
  }
});

// 添加API诊断路由

// 【新增】清空所有对话ID的API
app.post('/api/chat/clear-conversations', (req, res) => {
  try {
    console.log('收到清空所有对话ID的请求');
    
    // 调用message-classifier模块的清空函数
    const messageClassifier = require('./message-classifier');
    const result = messageClassifier.clearAllConversations();
    
    console.log('清空对话ID结果:', result);
    res.json(result);
  } catch (error) {
    console.error('清空对话ID失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '清空对话ID失败',
      error: error.message 
    });
  }
});


// 导入3D可视化路由
const threeDVisualizationRoutes = require('./routes/3d-visualization');
app.use('/3d-visualization', threeDVisualizationRoutes);



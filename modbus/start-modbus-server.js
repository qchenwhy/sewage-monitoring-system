/**
 * Modbus服务启动脚本
 * 
 * 此脚本用于启动Modbus服务并提供API访问
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const modbusRoutes = require('../routes/modbus-routes');
const ModbusTCP = require('./modbus-tcp');
const ConfigManager = require('./config-manager');
const modbusService = require('./modbus-service').getInstance();
const difyKnowledgeService = require('./dify-knowledge-service').getInstance();

const app = express();
const port = 3002;

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 静态文件
app.use(express.static(path.join(__dirname, '..', 'public')));

// 添加响应头以禁用缓存
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// 路由
app.use('/api/modbus', modbusRoutes);

// Dify知识库API路由
app.get('/api/dify/status', async (req, res) => {
  const status = {
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
  
  // 如果已初始化，获取知识库信息
  if (difyKnowledgeService.initialized) {
    try {
      const knowledgeInfo = await difyKnowledgeService.getKnowledgeInfo();
      status.knowledge = {
        name: knowledgeInfo.name,
        documentCount: knowledgeInfo.document_count || 0,
        updatedAt: knowledgeInfo.updated_at
      };
    } catch (error) {
      status.error = error.message;
    }
  }
  
  res.json(status);
});

// 更新Dify知识库配置
app.post('/api/dify/config', async (req, res) => {
  try {
    const newConfig = req.body;
    if (!newConfig) {
      return res.status(400).json({ error: '无效的配置' });
    }
    
    const updatedConfig = difyKnowledgeService.updateConfig(newConfig);
    res.json({ success: true, config: updatedConfig });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取知识库中的所有文档
app.get('/api/dify/documents', async (req, res) => {
  try {
    if (!difyKnowledgeService.initialized) {
      const initResult = await difyKnowledgeService.initialize();
      if (!initResult) {
        return res.status(500).json({ error: '知识库服务未初始化' });
      }
    }
    
    const documents = await difyKnowledgeService.getDocuments();
    res.json({ success: true, documents });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取文档内容
app.get('/api/dify/documents/:id', async (req, res) => {
  try {
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
    res.status(500).json({ error: error.message });
  }
});

// 启动/停止同步
app.post('/api/dify/sync', async (req, res) => {
  try {
    const { action } = req.body;
    
    if (action === 'start') {
      // 如果未初始化，先初始化
      if (!difyKnowledgeService.initialized) {
        const initResult = await difyKnowledgeService.initialize();
        if (!initResult) {
          return res.status(500).json({ error: '服务初始化失败' });
        }
      }
      
      const result = difyKnowledgeService.startSync();
      res.json({ success: result, status: 'started' });
    } else if (action === 'stop') {
      difyKnowledgeService.stopSync();
      res.json({ success: true, status: 'stopped' });
    } else {
      res.status(400).json({ error: '无效的操作' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 手动触发同步
app.post('/api/dify/sync/manual', async (req, res) => {
  try {
    // 如果未初始化，先初始化
    if (!difyKnowledgeService.initialized) {
      const initResult = await difyKnowledgeService.initialize();
      if (!initResult) {
        return res.status(500).json({ error: '服务初始化失败' });
      }
    }
    
    const result = await difyKnowledgeService.syncData();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 创建新知识库
app.post('/api/dify/knowledge', async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: '知识库名称是必需的' });
    }
    
    const result = await difyKnowledgeService.createEmptyKnowledge(name, description || '');
    res.json({ success: true, dataset: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 状态检查
app.get('/api/status', (req, res) => {
  res.json({
    status: 'running',
    time: new Date().toISOString(),
    nodejs: process.version
  });
});

// 检查配置
console.log('正在加载Modbus配置...');
const configManager = new ConfigManager();
const config = configManager.getConnectionConfig();

console.log('Modbus配置:');
console.log(JSON.stringify(config, null, 2));

// 测试Modbus连接
console.log('测试Modbus连接...');
const testConnection = async () => {
  try {
    const client = new ModbusTCP({
      host: config.host,
      port: config.port,
      unitId: config.unitId,
      timeout: config.timeout,
      autoReconnect: false
    });
    
    console.log(`正在连接到Modbus服务器 ${config.host}:${config.port}...`);
    
    const connected = await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log('连接超时');
        resolve(false);
      }, 5000);
      
      client.on('connected', () => {
        clearTimeout(timeout);
        console.log('连接成功');
        resolve(true);
      });
      
      client.on('error', (err) => {
        clearTimeout(timeout);
        console.error(`连接错误: ${err.message}`);
        resolve(false);
      });
      
      client.connect();
    });
    
    if (connected) {
      // 尝试读取寄存器
      console.log(`测试读取寄存器地址 ${config.keepAliveAddress}...`);
      
      const readResult = await new Promise((resolve, reject) => {
        const tid = client.readHoldingRegisters(config.keepAliveAddress, 1);
        
        const timeout = setTimeout(() => {
          reject(new Error('读取操作超时'));
        }, 5000);
        
        const dataHandler = (data) => {
          if (data.transactionId === tid) {
            clearTimeout(timeout);
            client.removeListener('data', dataHandler);
            client.removeListener('error', errorHandler);
            resolve(data);
          }
        };
        
        const errorHandler = (error) => {
          if (error.transactionId === tid) {
            clearTimeout(timeout);
            client.removeListener('data', dataHandler);
            client.removeListener('error', errorHandler);
            reject(error);
          }
        };
        
        client.on('data', dataHandler);
        client.on('error', errorHandler);
      });
      
      console.log(`读取结果: ${JSON.stringify(readResult)}`);
      
      // 尝试断开连接
      await client.disconnect();
      console.log('已断开连接');
      
      return true;
    } else {
      console.error('无法连接到Modbus服务器');
      return false;
    }
  } catch (error) {
    console.error(`测试连接失败: ${error.message}`);
    return false;
  }
};

// 启动服务器
app.listen(port, async () => {
  console.log(`服务器已在端口 ${port} 上启动`);
  
  // 测试Modbus连接
  const testResult = await testConnection();
  
  if (testResult) {
    console.log('Modbus连接测试成功，服务已准备好接受请求');
  } else {
    console.warn('Modbus连接测试失败，请检查Modbus从站是否运行并配置正确');
    console.warn('服务器仍将继续运行，但Modbus操作可能会失败');
  }
  
  console.log('API地址:');
  console.log(`- 状态检查: http://localhost:${port}/api/status`);
  console.log(`- Modbus状态: http://localhost:${port}/api/modbus/status`);
  console.log(`- 数据点列表: http://localhost:${port}/api/modbus/datapoints`);
  console.log(`- Web界面: http://localhost:${port}/modbus.html`);

  // 初始化Dify知识库服务
  const difyConfig = new ConfigManager().getDifyConfig();
  if (difyConfig.enabled) {
    try {
      console.log('正在初始化Dify知识库服务...');
      const initialized = await difyKnowledgeService.initialize();
      
      if (initialized) {
        console.log('Dify知识库服务初始化成功，正在启动自动同步...');
        difyKnowledgeService.startSync();
      } else {
        console.warn('Dify知识库服务初始化失败，请检查配置');
      }
    } catch (error) {
      console.error('Dify知识库服务初始化出错:', error);
    }
  } else {
    console.log('Dify知识库服务已禁用，不进行初始化');
  }
}); 
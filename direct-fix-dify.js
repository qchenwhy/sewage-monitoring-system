/**
 * Dify路由问题直接修复
 * 直接修改app.js文件，将Dify API路由定义放在404中间件之前
 */

const fs = require('fs');
const path = require('path');

console.log('=== 开始修复Dify路由问题 ===');

// 1. 启用Dify服务配置
try {
  // 修改modbus目录下的config.json
  const configPath = path.join(__dirname, 'modbus', 'config.json');
  console.log(`检查配置文件: ${configPath}`);
  
  let config = {
    dify: {
      enabled: true,
      apiEndpoint: 'https://api.dify.ai/v1',
      apiKey: '',
      datasetId: '',
      syncInterval: 3600000,
      documentsPerDay: 24
    }
  };
  
  if (fs.existsSync(configPath)) {
    try {
      console.log('配置文件已存在，正在读取...');
      const existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      // 合并配置，保留现有的API密钥等信息
      if (existingConfig.dify) {
        config.dify = {
          ...config.dify,
          ...existingConfig.dify,
          enabled: true // 强制启用
        };
      }
    } catch (readError) {
      console.error('读取配置文件失败，将使用默认配置:', readError.message);
    }
  } else {
    console.log('配置文件不存在，将创建新文件');
  }
  
  // 保存配置
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  console.log('已更新配置文件，Dify服务已启用');
} catch (configError) {
  console.error('更新配置失败:', configError);
}

// 2. 直接修改app.js文件，确保API路由定义在404中间件之前
try {
  const appPath = path.join(__dirname, 'app.js');
  console.log(`正在修改app.js文件: ${appPath}`);
  
  if (!fs.existsSync(appPath)) {
    console.error('app.js文件不存在!');
    process.exit(1);
  }
  
  let appContent = fs.readFileSync(appPath, 'utf8');
  
  // 定义要添加的Dify知识库路由代码
  const difyRoutesCode = `
// ==================== Dify知识库API路由 ====================
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
    
    console.log('返回Dify知识库状态:', JSON.stringify(status));
    res.json(status);
  } catch (error) {
    console.error('获取Dify知识库状态失败:', error);
    res.status(500).json({ 
      error: \`获取Dify知识库状态失败: \${error.message}\`,
      stack: error.stack
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
    console.log(\`处理 /api/dify/documents/\${req.params.id} 请求\`);
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

// 启动/停止同步
app.post('/api/dify/sync', async (req, res) => {
  try {
    console.log('处理 /api/dify/sync 请求:', req.body);
    const { action } = req.body;
    
    if (action === 'start') {
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
    console.error('同步操作失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 手动触发同步
app.post('/api/dify/sync/manual', async (req, res) => {
  try {
    console.log('处理 /api/dify/sync/manual 请求');
    if (!difyKnowledgeService.initialized) {
      const initResult = await difyKnowledgeService.initialize();
      if (!initResult) {
        return res.status(500).json({ error: '服务初始化失败' });
      }
    }
    
    const result = await difyKnowledgeService.syncData();
    res.json(result);
  } catch (error) {
    console.error('手动同步失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 创建新知识库
app.post('/api/dify/knowledge', async (req, res) => {
  try {
    console.log('接收到创建知识库请求:', req.body);
    const { name, description } = req.body;
    
    if (!name) {
      console.log('知识库名称为空，返回400错误');
      return res.status(400).json({ error: '知识库名称是必需的' });
    }
    
    console.log(\`准备创建知识库: \${name}, 描述: \${description || '(无)'}\`);
    console.log('Dify服务初始化状态:', difyKnowledgeService.initialized);
    console.log('Dify配置:', JSON.stringify({
      apiEndpoint: difyKnowledgeService.getConfig().apiEndpoint,
      hasApiKey: !!difyKnowledgeService.getConfig().apiKey,
      datasetId: difyKnowledgeService.getConfig().datasetId
    }));

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
`;

  // 查找404中间件的位置
  const notFoundMiddleware = '// 在所有路由之后，添加404错误处理中间件';
  const notFoundMiddlewarePos = appContent.indexOf(notFoundMiddleware);
  
  if (notFoundMiddlewarePos === -1) {
    console.error('无法找到404中间件位置，中止修复');
    process.exit(1);
  }
  
  // 检查app.js中是否已经导入了difyKnowledgeService
  if (!appContent.includes('const difyKnowledgeService = require(\'./modbus/dify-knowledge-service\').getInstance()')) {
    // 查找适合的导入位置（在其他模块导入之后）
    const importPos = appContent.indexOf('// 引入Modbus数据调度器模块') - 1;
    
    if (importPos === -2) {
      console.error('无法找到合适的导入位置');
    } else {
      // 在此位置插入导入语句
      const importStatement = '\n// 引入Dify知识库服务\nconst difyKnowledgeService = require(\'./modbus/dify-knowledge-service\').getInstance();\n';
      appContent = appContent.slice(0, importPos) + importStatement + appContent.slice(importPos);
      console.log('已添加difyKnowledgeService导入语句');
    }
  } else {
    console.log('difyKnowledgeService已正确导入');
  }
  
  // 先检查是否已有/api/dify/status路由
  if (appContent.includes('app.get(\'/api/dify/status\'')) {
    // 如果已有路由定义，则移除重复定义
    // 这里我们需要移除现有的Dify路由部分，避免路由冲突
    
    console.log('检测到现有的Dify API路由定义，将替换现有定义');
    
    // 查找Dify API路由部分的开始和结束位置
    const routesStartMarker = '// ==================== Dify知识库API路由 ====================';
    const routesEndMarker = '// ==================== 原有代码继续 ====================';
    
    const routesStartPos = appContent.indexOf(routesStartMarker);
    let routesEndPos = appContent.indexOf(routesEndMarker);
    
    if (routesEndPos === -1) {
      // 如果找不到结束标记，搜索下一个// =========开头的行
      const nextSectionPos = appContent.indexOf('// =====', routesStartPos + routesStartMarker.length);
      if (nextSectionPos !== -1) {
        routesEndPos = nextSectionPos;
      }
    }
    
    if (routesStartPos !== -1 && routesEndPos !== -1) {
      // 移除现有的Dify API路由部分
      appContent = appContent.slice(0, routesStartPos) + appContent.slice(routesEndPos);
      console.log('已移除现有的Dify API路由定义');
    }
  }
  
  // 找一个合适的位置添加API路由（在404中间件之前，建议在主要路由定义之后）
  // 例如在静态文件服务之后
  const staticServePart = 'app.use(express.static(\'public\'));';
  const insertPos = appContent.indexOf(staticServePart);
  
  if (insertPos !== -1) {
    // 在静态文件服务后插入Dify API路由
    const tempContent = appContent.slice(0, insertPos + staticServePart.length)
      + difyRoutesCode
      + appContent.slice(insertPos + staticServePart.length);
    
    appContent = tempContent;
    console.log('已在静态文件服务后插入Dify API路由');
  } else {
    // 如果找不到静态文件服务位置，尝试在其他位置插入
    // 在404中间件之前直接插入
    appContent = appContent.slice(0, notFoundMiddlewarePos)
      + difyRoutesCode
      + appContent.slice(notFoundMiddlewarePos);
    
    console.log('已在404中间件之前插入Dify API路由');
  }
  
  // 保存修改后的文件
  const backupPath = path.join(__dirname, 'app.js.bak-' + Date.now());
  fs.writeFileSync(backupPath, fs.readFileSync(appPath, 'utf8')); // 先创建备份
  fs.writeFileSync(appPath, appContent);
  
  console.log(`已保存修改后的app.js文件，原文件备份为: ${backupPath}`);
} catch (appError) {
  console.error('修改app.js文件失败:', appError);
}

console.log('=== 修复完成 ===');
console.log('请重启服务器以应用更改'); 
/**
 * Dify路由修复工具
 * 此脚本用于修复Dify知识库API路由问题
 */

const fs = require('fs');
const path = require('path');

// 启用Dify知识库服务 
function enableDifyService() {
  try {
    console.log('正在启用Dify知识库服务...');
    
    // 1. 修改modbus-config.json中的配置
    const configPath = path.join(__dirname, 'config', 'modbus-config.json');
    let config = {};
    
    try {
      // 如果配置文件存在，读取它
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        console.log('已读取现有配置文件');
      } else {
        console.log('配置文件不存在，将创建新配置');
      }
      
      // 确保dify部分存在
      if (!config.dify) {
        config.dify = {};
      }
      
      // 启用Dify服务
      config.dify.enabled = true;
      
      // 确保有默认值
      if (!config.dify.apiEndpoint) {
        config.dify.apiEndpoint = 'https://api.dify.ai/v1';
      }
      
      if (!config.dify.syncInterval) {
        config.dify.syncInterval = 3600000; // 1小时
      }
      
      if (!config.dify.documentsPerDay) {
        config.dify.documentsPerDay = 24;
      }
      
      // 确保目录存在
      const dir = path.dirname(configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // 保存配置
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      console.log('已更新配置文件，Dify服务已启用');
    } catch (err) {
      console.error('更新配置文件失败:', err);
    }
    
    // 2. 检查并修复dify-knowledge-service.js中的问题
    checkDifyService();
    
    return true;
  } catch (error) {
    console.error('启用Dify服务失败:', error);
    return false;
  }
}

// 检查Dify知识库服务模块
function checkDifyService() {
  try {
    console.log('检查Dify知识库服务模块...');
    
    const servicePath = path.join(__dirname, 'modbus', 'dify-knowledge-service.js');
    
    if (fs.existsSync(servicePath)) {
      console.log('Dify知识库服务模块存在');
      
      // 在这里添加对服务模块的检查
      // 例如，检查构造函数是否正确初始化配置
      const fileContent = fs.readFileSync(servicePath, 'utf8');
      
      // 检查关键方法是否存在
      if (!fileContent.includes('initialize()') || 
          !fileContent.includes('getConfig()') || 
          !fileContent.includes('updateConfig(')) {
        console.warn('警告：Dify知识库服务可能缺少必要的方法');
      }
      
      // 检查实例化方式
      if (!fileContent.includes('getInstance()') || 
          !fileContent.includes('let instance = null')) {
        console.warn('警告：Dify知识库服务可能没有正确实现单例模式');
      }
    } else {
      console.error('错误：Dify知识库服务模块不存在!');
    }
  } catch (error) {
    console.error('检查Dify服务模块失败:', error);
  }
}

// 修复app.js中的API路由问题
function fixAppRoutes() {
  try {
    console.log('开始修复API路由问题...');
    
    const appPath = path.join(__dirname, 'app.js');
    
    if (!fs.existsSync(appPath)) {
      console.error('错误：app.js不存在!');
      return false;
    }
    
    let appContent = fs.readFileSync(appPath, 'utf8');
    
    // 检查是否已经导入difyKnowledgeService
    if (!appContent.includes('difyKnowledgeService')) {
      console.error('错误：app.js中未导入difyKnowledgeService');
    }
    
    // 检查是否存在Dify知识库API路由
    const apiRoutes = [
      'app.get(\'/api/dify/status\'',
      'app.post(\'/api/dify/config\'',
      'app.get(\'/api/dify/documents\'',
      'app.get(\'/api/dify/documents/:id\'',
      'app.post(\'/api/dify/sync\'',
      'app.post(\'/api/dify/sync/manual\'',
      'app.post(\'/api/dify/knowledge\''
    ];
    
    // 计算已存在的路由数
    let existingRoutes = 0;
    for (const route of apiRoutes) {
      if (appContent.includes(route)) {
        existingRoutes++;
      }
    }
    
    console.log(`当前app.js中的Dify API路由数: ${existingRoutes}/${apiRoutes.length}`);
    
    // 检查404中间件的位置
    const notFoundMiddleware = '// 在所有路由之后，添加404错误处理中间件';
    const notFoundMiddlewarePos = appContent.indexOf(notFoundMiddleware);
    
    if (notFoundMiddlewarePos === -1) {
      console.error('警告：未找到404错误处理中间件');
    } else {
      console.log(`404错误处理中间件位于字符位置 ${notFoundMiddlewarePos}`);
      
      // 检查404中间件在Dify路由之前还是之后
      let beforeMiddleware = true;
      for (const route of apiRoutes) {
        const routePos = appContent.indexOf(route);
        if (routePos !== -1 && routePos > notFoundMiddlewarePos) {
          beforeMiddleware = false;
          break;
        }
      }
      
      if (!beforeMiddleware) {
        console.error('警告：部分Dify API路由定义在404中间件之后，这会导致路由无法访问');
      }
    }
    
    console.log('API路由检查完成，请根据输出信息修复问题');
    return true;
  } catch (error) {
    console.error('修复API路由失败:', error);
    return false;
  }
}

// 执行修复
console.log('=== Dify知识库服务修复工具 ===');
enableDifyService();
fixAppRoutes();
console.log('=== 修复完成 ==='); 
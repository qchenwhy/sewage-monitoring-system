const fs = require('fs');
const path = require('path');

// 增强dify-knowledge-service.js中的调试信息
function enhanceDifyService() {
  try {
    const filePath = path.join(__dirname, 'dify-knowledge-service.js');
    let content = fs.readFileSync(filePath, 'utf8');
    
    // 检查是否已经添加了增强调试
    if (content.includes('// ENHANCED DEBUG')) {
      console.log('Dify知识库服务已经包含增强调试功能');
      return;
    }
    
    // 1. 为createEmptyKnowledge方法添加更多调试信息
    const createKnowledgeMethod = content.match(/async createEmptyKnowledge\([^)]*\) {[\s\S]*?try {[\s\S]*?}/);
    if (createKnowledgeMethod) {
      const debugCode = `
    try {
      // ENHANCED DEBUG
      console.log('========== 创建知识库请求详情 ==========');
      console.log('请求URL:', \`\${this.config.apiEndpoint}/datasets\`);
      console.log('请求头:', JSON.stringify({
        'Authorization': \`Bearer \${this.config.apiKey.substring(0, 10)}...\`,
        'Content-Type': 'application/json'
      }));
      console.log('请求数据:', JSON.stringify(requestData, null, 2));
      
      const axiosConfig = {
        method: 'post',
        url: \`\${this.config.apiEndpoint}/datasets\`,
        headers: {
          'Authorization': \`Bearer \${this.config.apiKey}\`,
          'Content-Type': 'application/json'
        },
        data: requestData
      };
      
      console.log('axios配置:', JSON.stringify(
        {...axiosConfig, headers: {...axiosConfig.headers, 'Authorization': axiosConfig.headers['Authorization'].substring(0, 20)+'...'}}
      ));
      
      // 测试端点是否可达
      try {
        console.log('测试API端点是否可达...');
        const testResponse = await axios.get(
          this.config.apiEndpoint,
          { 
            timeout: 5000,
            validateStatus: () => true 
          }
        );
        console.log(\`API端点测试结果: 状态码 \${testResponse.status}\`);
        if (testResponse.status >= 400) {
          console.log('API端点测试失败，响应内容:', testResponse.data);
        }
      } catch (testError) {
        console.error('API端点测试失败:', testError.message);
      }
      
      // 发送请求
      const response = await axios(axiosConfig);
      `;
      
      content = content.replace(/async createEmptyKnowledge\([^)]*\) {[\s\S]*?try {/, debugCode);
    }
    
    // 2. 增强错误处理
    const errorHandling = content.match(/} catch \(error\) {[\s\S]*?console\.error\('创建知识库失败:'[\s\S]*?if \(error\.response\) {[\s\S]*?}/);
    if (errorHandling) {
      const enhancedErrorHandling = `} catch (error) {
      // ENHANCED DEBUG
      console.error('创建知识库失败:', error.message);
      
      // 详细的错误信息
      console.error('========== 详细错误信息 ==========');
      console.error('错误名称:', error.name);
      console.error('错误消息:', error.message);
      console.error('错误堆栈:', error.stack);
      
      if (error.code) {
        console.error('网络错误代码:', error.code);
      }
      
      if (error.response) {
        console.error('HTTP状态码:', error.response.status);
        console.error('响应头:', JSON.stringify(error.response.headers));
        console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
        
        // 针对405错误的特别处理
        if (error.response.status === 405) {
          console.error('收到405错误(方法不允许)，这通常意味着API端点接受的HTTP方法与您发送的不同');
          console.error('尝试的HTTP方法: POST');
          console.error('服务器可能期望的方法:', error.response.headers['allow'] || '未知');
          console.error('这可能是API端点URL配置错误或API版本不匹配导致的');
          console.error('当前API端点:', this.config.apiEndpoint);
          console.error('建议: 检查API端点URL是否正确，是否需要更改URL路径');
        }`;
      
      content = content.replace(/} catch \(error\) {[\s\S]*?console\.error\('创建知识库失败:'[\s\S]*?if \(error\.response\) {/, enhancedErrorHandling);
    }
    
    // 3. 为getDocuments方法添加调试信息
    if (content.includes('async getDocuments()')) {
      const getDocumentsMethod = content.match(/async getDocuments\(\) {[\s\S]*?try {[\s\S]*?}/);
      if (getDocumentsMethod) {
        const debugGetDocuments = `
    try {
      // ENHANCED DEBUG
      console.log('========== 获取文档列表请求详情 ==========');
      console.log('请求URL:', \`\${this.config.apiEndpoint}/datasets/\${this.config.datasetId}/documents\`);
      console.log('请求头:', JSON.stringify({
        'Authorization': \`Bearer \${this.config.apiKey.substring(0, 10)}...\`
      }));
      
      if (!this.config.datasetId) {
        throw new Error('未配置知识库ID');
      }
      `;
        
        content = content.replace(/async getDocuments\(\) {[\s\S]*?try {/, `async getDocuments() {${debugGetDocuments}`);
      }
    }
    
    // 保存修改后的文件
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('已成功增强Dify知识库服务的调试功能');
  } catch (error) {
    console.error('增强Dify调试功能失败:', error);
  }
}

// 修复API路由中的调试信息
function enhanceDifyApiRoutes() {
  try {
    const filePath = path.join(__dirname, '..', 'app.js');
    let content = fs.readFileSync(filePath, 'utf8');
    
    // 检查是否已添加调试
    if (content.includes('// ENHANCED DIFY API DEBUG')) {
      console.log('Dify API路由已包含增强调试');
      return;
    }
    
    // 为创建知识库路由添加调试
    const createKnowledgeRoute = content.match(/app\.post\('\/api\/dify\/knowledge'[\s\S]*?try {[\s\S]*?}/);
    if (createKnowledgeRoute) {
      const enhancedRoute = `app.post('/api/dify/knowledge', async (req, res) => {
  try {
    // ENHANCED DIFY API DEBUG
    console.log('==================================================');
    console.log('|              创建知识库API调用                  |');
    console.log('==================================================');
    console.log('请求时间:', new Date().toISOString());
    console.log('请求IP:', req.ip);
    console.log('请求方法:', req.method);
    console.log('请求头:', JSON.stringify(req.headers, null, 2));
    console.log('请求体:', JSON.stringify(req.body, null, 2));
    
    // 检测API配置
    console.log('当前Dify配置:');
    console.log('- API端点:', difyKnowledgeService.getConfig().apiEndpoint);
    console.log('- API密钥:', difyKnowledgeService.getConfig().apiKey ? 
      \`\${difyKnowledgeService.getConfig().apiKey.substring(0, 10)}...\` : '未设置');
    console.log('- 知识库ID:', difyKnowledgeService.getConfig().datasetId || '未设置');
    console.log('- 启用状态:', difyKnowledgeService.getConfig().enabled);
    console.log('- 初始化状态:', difyKnowledgeService.initialized);`;
      
      content = content.replace(/app\.post\('\/api\/dify\/knowledge'[\s\S]*?try {/, enhancedRoute);
    }
    
    // 为获取文档路由添加调试 
    const getDocumentsRoute = content.match(/app\.get\('\/api\/dify\/documents'[\s\S]*?try {[\s\S]*?}/);
    if (getDocumentsRoute) {
      const enhancedDocsRoute = `app.get('/api/dify/documents', async (req, res) => {
  try {
    // ENHANCED DIFY API DEBUG
    console.log('==================================================');
    console.log('|              获取文档列表API调用                |');
    console.log('==================================================');
    console.log('请求时间:', new Date().toISOString());
    console.log('请求IP:', req.ip);
    console.log('请求方法:', req.method);
    console.log('请求头:', JSON.stringify(req.headers, null, 2));`;
      
      content = content.replace(/app\.get\('\/api\/dify\/documents'[\s\S]*?try {/, enhancedDocsRoute);
    }
    
    // 修改文件
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('已成功增强Dify API路由的调试功能');
  } catch (error) {
    console.error('增强Dify API路由调试功能失败:', error);
  }
}

// 创建一个测试脚本
function createTestScript() {
  try {
    const filePath = path.join(__dirname, 'test-dify-connection.js');
    const testScript = `/**
 * Dify API连接测试脚本
 * 用于测试Dify API端点的连接性和配置
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 加载配置文件
function loadConfig() {
  try {
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return config.dify || {};
    }
  } catch (error) {
    console.error('加载配置失败:', error);
  }
  return {};
}

// 测试API端点连接
async function testApiEndpoint(url) {
  console.log(\`测试API端点: \${url}\`);
  try {
    const response = await axios.get(url, { 
      timeout: 10000,
      validateStatus: () => true,
      headers: {
        'Accept': 'application/json'
      }
    });
    
    console.log(\`状态码: \${response.status}\`);
    console.log(\`响应头: \${JSON.stringify(response.headers)}\`);
    
    if (response.data) {
      console.log(\`响应体: \${typeof response.data === 'object' ? JSON.stringify(response.data, null, 2) : response.data.toString().substring(0, 200)}\`);
    }
    
    return {
      success: response.status < 400,
      status: response.status,
      headers: response.headers,
      data: response.data
    };
  } catch (error) {
    console.error(\`测试失败: \${error.message}\`);
    return {
      success: false,
      error: error.message
    };
  }
}

// 测试知识库API
async function testDatasetsApi(config) {
  console.log('测试知识库API...');
  try {
    const url = \`\${config.apiEndpoint}/datasets\`;
    console.log(\`请求URL: \${url}\`);
    
    const response = await axios.get(url, {
      timeout: 10000,
      validateStatus: () => true,
      headers: {
        'Authorization': \`Bearer \${config.apiKey}\`,
        'Accept': 'application/json'
      }
    });
    
    console.log(\`状态码: \${response.status}\`);
    console.log(\`响应头: \${JSON.stringify(response.headers)}\`);
    
    if (response.data) {
      console.log(\`响应体: \${JSON.stringify(response.data, null, 2).substring(0, 500)}...\`);
    }
    
    return {
      success: response.status < 400,
      status: response.status,
      data: response.data
    };
  } catch (error) {
    console.error(\`知识库API测试失败: \${error.message}\`);
    return {
      success: false,
      error: error.message
    };
  }
}

// 测试创建知识库API
async function testCreateDataset(config) {
  console.log('测试创建知识库API...');
  try {
    const url = \`\${config.apiEndpoint}/datasets\`;
    console.log(\`请求URL: \${url}\`);
    
    // 测试数据
    const testData = {
      name: \`测试知识库_\${Date.now()}\`,
      description: '这是一个测试知识库'
    };
    
    console.log(\`请求数据: \${JSON.stringify(testData)}\`);
    
    // 先测试OPTIONS请求
    try {
      console.log('发送OPTIONS请求检查跨域和允许的方法...');
      const optionsResponse = await axios({
        method: 'OPTIONS',
        url: url,
        headers: {
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization,content-type'
        }
      });
      
      console.log(\`OPTIONS请求结果: \${optionsResponse.status}\`);
      console.log(\`允许的方法: \${optionsResponse.headers['access-control-allow-methods'] || '未返回'}\`);
    } catch (optionsError) {
      console.log(\`OPTIONS请求失败: \${optionsError.message}\`);
    }
    
    // 发送POST请求
    const response = await axios.post(url, testData, {
      timeout: 15000,
      validateStatus: () => true,
      headers: {
        'Authorization': \`Bearer \${config.apiKey}\`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    
    console.log(\`状态码: \${response.status}\`);
    console.log(\`响应头: \${JSON.stringify(response.headers)}\`);
    console.log(\`响应体: \${typeof response.data === 'object' ? JSON.stringify(response.data, null, 2) : response.data.toString().substring(0, 500)}\`);
    
    return {
      success: response.status < 400,
      status: response.status,
      data: response.data
    };
  } catch (error) {
    console.error(\`创建知识库API测试失败: \${error.message}\`);
    if (error.response) {
      console.error(\`错误状态码: \${error.response.status}\`);
      console.error(\`错误响应: \${JSON.stringify(error.response.data)}\`);
    }
    return {
      success: false,
      error: error.message,
      response: error.response ? {
        status: error.response.status,
        data: error.response.data
      } : null
    };
  }
}

// 主函数
async function main() {
  console.log('===== Dify API连接测试工具 =====');
  
  // 加载配置
  const config = loadConfig();
  console.log(\`当前配置:
- API端点: \${config.apiEndpoint}
- API密钥: \${config.apiKey ? config.apiKey.substring(0, 10) + '...' : '未设置'}
- 知识库ID: \${config.datasetId || '未设置'}
- 启用状态: \${config.enabled}
\`);

  // 测试基本端点连接
  console.log('\\n1. 测试API端点连接...');
  await testApiEndpoint(config.apiEndpoint);
  
  // 测试知识库列表API
  console.log('\\n2. 测试知识库列表API...');
  await testDatasetsApi(config);
  
  // 测试创建知识库API
  console.log('\\n3. 测试创建知识库API...');
  await testCreateDataset(config);
  
  console.log('\\n===== 测试完成 =====');
}

// 运行测试
main().catch(error => {
  console.error('测试过程中发生错误:', error);
});
`;
    
    fs.writeFileSync(filePath, testScript, 'utf8');
    console.log('已创建Dify连接测试脚本');
  } catch (error) {
    console.error('创建测试脚本失败:', error);
  }
}

// 运行所有增强
enhanceDifyService();
enhanceDifyApiRoutes();
createTestScript();

console.log('所有Dify调试增强已完成，现在可以重启服务器并运行测试脚本');
console.log('运行测试脚本: node modbus/test-dify-connection.js'); 
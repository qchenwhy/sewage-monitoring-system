/**
 * 本地API调试和修复工具
 * 
 * 为本地Dify API端点http://localhost/v1提供调试和修复功能
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// 确保正确的API端点
async function ensureLocalEndpoint() {
  try {
    const configPath = path.join(__dirname, 'config.json');
    
    // 确认文件存在
    if (!fs.existsSync(configPath)) {
      console.error('配置文件不存在:', configPath);
      return false;
    }
    
    console.log('检查API端点配置...');
    
    // 读取配置
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // 检查Dify配置
    if (!config.dify) {
      config.dify = {
        enabled: true,
        apiEndpoint: "http://localhost/v1",
        apiKey: "dataset-CBdZ3tu2yaTpd1mpjGhsLhaR",
        datasetId: "a085d987-4fe8-497d-9c91-74450ccce956",
        syncInterval: 3600000,
        documentsPerDay: 24,
        debug: true
      };
      console.log('配置文件中不存在Dify配置，已创建默认配置');
    } else if (config.dify.apiEndpoint !== 'http://localhost/v1') {
      // 修复API端点
      console.log(`将API端点从 ${config.dify.apiEndpoint} 恢复为 http://localhost/v1`);
      config.dify.apiEndpoint = "http://localhost/v1";
      
      // 确保其他配置项存在
      config.dify.enabled = typeof config.dify.enabled === 'boolean' ? config.dify.enabled : true;
      config.dify.syncInterval = config.dify.syncInterval || 3600000;
      config.dify.documentsPerDay = config.dify.documentsPerDay || 24;
      config.dify.debug = true;
    } else {
      console.log('API端点配置正确: http://localhost/v1');
    }
    
    // 保存配置
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    
    console.log('配置文件已检查/更新');
    console.log('当前配置:');
    console.log('- API端点:', config.dify.apiEndpoint);
    console.log('- API密钥:', config.dify.apiKey ? config.dify.apiKey.substring(0, 10) + '...' : '未设置');
    console.log('- 知识库ID:', config.dify.datasetId || '未设置');
    console.log('- 启用状态:', config.dify.enabled);
    
    return true;
  } catch (error) {
    console.error('检查/更新配置文件失败:', error);
    return false;
  }
}

// 测试本地API端点连接
async function testLocalEndpoint() {
  try {
    console.log('\n测试本地API端点连接...');
    const response = await axios.get('http://localhost/v1', {
      timeout: 5000,
      validateStatus: () => true
    });
    
    console.log(`状态码: ${response.status}`);
    console.log('响应头:', JSON.stringify(response.headers));
    
    if (response.data) {
      console.log('响应体:', JSON.stringify(response.data, null, 2));
    }
    
    if (response.status >= 200 && response.status < 300) {
      console.log('✅ 本地API端点连接正常');
      return true;
    } else {
      console.error(`❌ 本地API端点连接异常，状态码: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.error('❌ 本地API端点连接失败:', error.message);
    return false;
  }
}

// 检查可能的网络和服务问题
async function checkNetworkIssues() {
  console.log('\n检查可能的网络和服务问题...');
  
  // 检查localhost能否解析
  try {
    console.log('测试localhost解析...');
    const localhost = await axios.get('http://localhost', { 
      timeout: 3000, 
      validateStatus: () => true 
    });
    console.log(`✅ localhost可以访问，状态码: ${localhost.status}`);
  } catch (error) {
    console.error(`❌ 访问localhost失败: ${error.message}`);
    console.log('建议检查本地HTTP服务是否正常运行');
  }
  
  // 检查其他本地端口
  try {
    console.log('测试其他本地端口 (3000)...');
    const port3000 = await axios.get('http://localhost:3000', { 
      timeout: 3000, 
      validateStatus: () => true 
    });
    console.log(`✅ 端口3000可以访问，状态码: ${port3000.status}`);
  } catch (error) {
    console.error(`❌ 访问端口3000失败: ${error.message}`);
  }
  
  // 检查外部连接
  try {
    console.log('测试外部连接...');
    const external = await axios.get('https://api.dify.ai/v1', { 
      timeout: 5000, 
      validateStatus: () => true 
    });
    console.log(`✅ 外部API可以访问，状态码: ${external.status}`);
  } catch (error) {
    console.error(`❌ 访问外部API失败: ${error.message}`);
    console.log('建议检查网络连接');
  }
}

// 创建本地API请求代理
function createLocalApiProxy() {
  const localProxyPath = path.join(__dirname, '..', 'app.js');
  let content = fs.readFileSync(localProxyPath, 'utf8');
  
  // 检查是否已经添加了代理
  if (content.includes('// === LOCAL API PROXY ===')) {
    console.log('本地API代理已存在');
    return;
  }
  
  console.log('\n添加本地API代理...');
  
  // 添加代理代码
  const proxyCode = `

// === LOCAL API PROXY ===
// 这是一个简单的代理，将Dify API请求转发到本地服务
app.use('/v1/*', async (req, res) => {
  try {
    console.log('代理本地API请求:', req.method, req.originalUrl);
    
    // 转发请求
    const response = await axios({
      method: req.method,
      url: \`http://localhost\${req.originalUrl}\`,
      headers: {
        ...req.headers,
        host: 'localhost'
      },
      data: req.body,
      validateStatus: () => true
    });
    
    // 返回响应
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('本地API代理错误:', error.message);
    res.status(500).json({
      error: '本地API代理错误',
      message: error.message
    });
  }
});
// === END LOCAL API PROXY ===

`;
  
  // 找到应用程序侦听部分
  const listenMatch = content.match(/app\.listen\(\d+/);
  if (listenMatch) {
    // 在侦听之前插入代理代码
    content = content.replace(listenMatch[0], proxyCode + listenMatch[0]);
    fs.writeFileSync(localProxyPath, content, 'utf8');
    console.log('✅ 已添加本地API代理');
  } else {
    console.error('❌ 无法找到应用程序侦听部分，代理添加失败');
  }
}

// 添加调试报告页面
function createDebugReport() {
  const debugHtmlPath = path.join(__dirname, '..', 'public', 'local-api-debug.html');
  
  const debugHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>本地API调试报告</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    pre { background-color: #f8f9fa; padding: 1rem; border-radius: 0.25rem; }
    .result-box { max-height: 500px; overflow-y: auto; }
  </style>
</head>
<body>
  <div class="container py-4">
    <h1>本地API调试报告</h1>
    <p class="lead">用于调试本地API端点 http://localhost/v1</p>
    
    <div class="row mt-4">
      <div class="col-md-4">
        <div class="card mb-4">
          <div class="card-header">基本连接测试</div>
          <div class="card-body">
            <button id="test-connection" class="btn btn-primary">测试连接</button>
          </div>
        </div>
        
        <div class="card mb-4">
          <div class="card-header">代理测试</div>
          <div class="card-body">
            <button id="test-proxy" class="btn btn-primary">测试代理</button>
          </div>
        </div>
        
        <div class="card mb-4">
          <div class="card-header">系统信息</div>
          <div class="card-body">
            <button id="system-info" class="btn btn-secondary">获取系统信息</button>
          </div>
        </div>
      </div>
      
      <div class="col-md-8">
        <div class="card">
          <div class="card-header">测试结果</div>
          <div class="card-body">
            <div id="results-container" class="result-box">
              <div class="alert alert-info">点击左侧按钮开始测试</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  
  <script>
    // 显示结果
    function showResult(title, data, isError = false) {
      const container = document.getElementById('results-container');
      
      const resultElement = document.createElement('div');
      resultElement.className = \`mb-4 \${isError ? 'border-danger' : 'border-success'} border\`;
      
      const titleElement = document.createElement('h5');
      titleElement.className = \`p-2 m-0 \${isError ? 'bg-danger' : 'bg-success'} text-white\`;
      titleElement.textContent = title;
      
      const bodyElement = document.createElement('div');
      bodyElement.className = 'p-2';
      
      const pre = document.createElement('pre');
      pre.textContent = typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
      
      bodyElement.appendChild(pre);
      resultElement.appendChild(titleElement);
      resultElement.appendChild(bodyElement);
      
      container.insertBefore(resultElement, container.firstChild);
    }
    
    // 测试本地API连接
    document.getElementById('test-connection').addEventListener('click', async () => {
      try {
        const response = await fetch('http://localhost/v1');
        const data = await response.json();
        showResult('本地API连接测试成功', data);
      } catch (error) {
        showResult('本地API连接测试失败', error.message, true);
      }
    });
    
    // 测试代理
    document.getElementById('test-proxy').addEventListener('click', async () => {
      try {
        const response = await fetch('/v1');
        const data = await response.json();
        showResult('API代理测试成功', data);
      } catch (error) {
        showResult('API代理测试失败', error.message, true);
      }
    });
    
    // 获取系统信息
    document.getElementById('system-info').addEventListener('click', async () => {
      try {
        const response = await fetch('/api/time');
        const data = await response.json();
        showResult('系统信息', data);
      } catch (error) {
        showResult('获取系统信息失败', error.message, true);
      }
    });
  </script>
</body>
</html>`;
  
  fs.writeFileSync(debugHtmlPath, debugHtml, 'utf8');
  console.log(`\n✅ 已创建调试报告页面: http://localhost:3000/local-api-debug.html`);
}

// 创建解决方案文档
function createSolutionDocs() {
  const docsPath = path.join(__dirname, '..', 'docs');
  const solutionPath = path.join(docsPath, 'local-api-solution.md');
  
  // 确保目录存在
  if (!fs.existsSync(docsPath)) {
    fs.mkdirSync(docsPath, { recursive: true });
  }
  
  const solutionDoc = `# 本地API解决方案

## 问题描述

系统尝试连接本地Dify API端点 \`http://localhost/v1\`，但连接失败，导致无法创建知识库和获取文档列表。

## 可能的原因

1. 本地没有运行Dify API服务
2. 本地Dify API服务运行在不同端口
3. API密钥格式不正确
4. 网络或防火墙问题
5. 404/405错误可能表明API路径不正确

## 解决方案

### 1. 确认本地API服务

确保本地Dify API服务正在运行，可以通过以下命令检查:

\`\`\`bash
curl http://localhost/v1
\`\`\`

如果服务正常，应该返回类似以下内容:

\`\`\`json
{
  "welcome": "Dify OpenAPI",
  "api_version": "v1",
  "server_version": "1.x.x"
}
\`\`\`

### 2. 检查API密钥

确保API密钥格式正确，不应包含前缀如"BEAR"，正确格式应为:

\`\`\`
dataset-CBdZ3tu2yaTpd1mpjGhsLhaR
\`\`\`

### 3. 本地代理解决方案

如果本地API服务运行在其他端口，可以使用以下方法:

1. 修改配置文件中的API端点指向正确端口
2. 使用代理转发请求

### 4. 访问调试工具

我们提供了以下调试工具帮助确认问题:

- API测试页面: http://localhost:3000/dify-test.html
- 本地API调试: http://localhost:3000/local-api-debug.html

### 5. 配置文件默认设置

确认配置文件(modbus/config.json)中保持以下设置:

\`\`\`json
{
  "dify": {
    "enabled": true,
    "apiEndpoint": "http://localhost/v1",
    "apiKey": "dataset-CBdZ3tu2yaTpd1mpjGhsLhaR",
    "datasetId": "a085d987-4fe8-497d-9c91-74450ccce956", 
    "syncInterval": 3600000,
    "documentsPerDay": 24,
    "debug": true
  }
}
\`\`\`

## 定时任务

定时任务脚本位于 \`modbus/modbus-data-to-dify.js\`，启动方式:

\`\`\`bash
node modbus/modbus-data-to-dify.js
\`\`\`

该脚本会每小时从modbus_data_latest表中获取数据并同步到Dify知识库。
`;
  
  fs.writeFileSync(solutionPath, solutionDoc, 'utf8');
  console.log(`\n✅ 已创建解决方案文档: docs/local-api-solution.md`);
}

// 主函数
async function main() {
  console.log('==================================================');
  console.log('|         本地API调试与修复工具                   |');
  console.log('==================================================');
  
  // 确保正确的API端点
  await ensureLocalEndpoint();
  
  // 测试本地端点连接
  const endpointOk = await testLocalEndpoint();
  
  if (!endpointOk) {
    // 检查网络问题
    await checkNetworkIssues();
    
    // 添加本地API代理
    createLocalApiProxy();
  }
  
  // 创建调试报告页面
  createDebugReport();
  
  // 创建解决方案文档
  createSolutionDocs();
  
  console.log('\n==================================================');
  console.log('调试和修复工具执行完成，请按照以下步骤操作:');
  console.log('1. 重启服务器');
  console.log('2. 访问调试页面: http://localhost:3000/local-api-debug.html');
  console.log('3. 参考解决方案文档: docs/local-api-solution.md');
  console.log('==================================================');
}

// 执行主函数
main().catch(error => {
  console.error('执行过程出错:', error);
}); 
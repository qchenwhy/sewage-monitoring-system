/**
 * Dify调试路由
 * 
 * 这个脚本添加了专门用于调试Dify API的路由
 */

const fs = require('fs');
const path = require('path');

// 添加Dify调试路由到app.js
function addDifyDebugRoutes() {
  try {
    const filePath = path.join(__dirname, '..', 'app.js');
    let content = fs.readFileSync(filePath, 'utf8');
    
    // 检查是否已添加调试路由
    if (content.includes('// === DIFY DEBUG ROUTES ===')) {
      console.log('Dify调试路由已存在');
      return;
    }
    
    // 找到路由定义部分
    const routeSection = content.match(/\/\/ ==================== Dify知识库API路由 ====================/);
    if (!routeSection) {
      console.log('找不到Dify API路由部分');
      return;
    }
    
    // 添加调试路由
    const debugRoutes = `

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
      console.log(\`测试基本连接: \${config.apiEndpoint}\`);
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
      console.log(\`测试知识库列表API: \${config.apiEndpoint}/datasets\`);
      const datasetsResponse = await axios.get(\`\${config.apiEndpoint}/datasets\`, {
        timeout: 10000,
        validateStatus: () => true,
        headers: {
          'Authorization': \`Bearer \${config.apiKey}\`,
          'Accept': 'application/json'
        }
      });
      
      results.tests.push({
        name: '知识库列表API测试',
        url: \`\${config.apiEndpoint}/datasets\`,
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
        url: \`\${config.apiEndpoint}/datasets\`,
        success: false,
        error: error.message,
        code: error.code
      });
    }
    
    // 测试3: OPTIONS请求
    try {
      console.log(\`测试OPTIONS请求: \${config.apiEndpoint}/datasets\`);
      const optionsResponse = await axios({
        method: 'OPTIONS',
        url: \`\${config.apiEndpoint}/datasets\`,
        headers: {
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization,content-type'
        },
        validateStatus: () => true
      });
      
      results.tests.push({
        name: 'OPTIONS请求测试',
        url: \`\${config.apiEndpoint}/datasets\`,
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
        url: \`\${config.apiEndpoint}/datasets\`,
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
      success_rate: \`\${Math.round((successTests / results.tests.length) * 100)}%\`
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
    const testName = req.body.name || \`测试知识库_\${Date.now()}\`;
    const testDescription = req.body.description || '这是一个测试知识库';
    
    // 记录信息
    console.log(\`测试创建知识库: \${testName}\`);
    console.log(\`API端点: \${config.apiEndpoint}/datasets\`);
    
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
      url: \`\${config.apiEndpoint}/datasets\`,
      headers: {
        'Authorization': \`Bearer \${config.apiKey}\`,
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
    console.log(\`响应状态: \${response.status}\`);
    console.log(\`响应头: \${JSON.stringify(response.headers)}\`);
    console.log(\`响应数据: \${JSON.stringify(response.data)}\`);
    
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
      \`\${config.apiEndpoint}/datasets/\${config.datasetId}/documents\`,
      {
        headers: {
          'Authorization': \`Bearer \${config.apiKey}\`,
          'Accept': 'application/json'
        },
        validateStatus: () => true
      }
    );
    
    // 返回原始响应
    res.json({
      url: \`\${config.apiEndpoint}/datasets/\${config.datasetId}/documents\`,
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
`;
    
    // 插入调试路由
    content = content.replace(/\/\/ ==================== Dify知识库API路由 ====================/, 
      '// ==================== Dify知识库API路由 ====================' + debugRoutes);
    
    // 保存文件
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('已添加Dify调试路由');
  } catch (error) {
    console.error('添加Dify调试路由失败:', error);
  }
}

// 修改前端页面，添加调试选项
function updateFrontendPage() {
  try {
    const filePath = path.join(__dirname, '..', 'public', 'dify-knowledge.html');
    let content = fs.readFileSync(filePath, 'utf8');
    
    // 检查是否已添加调试界面
    if (content.includes('<!-- DIFY DEBUG INTERFACE -->')) {
      console.log('Dify调试界面已存在');
      return;
    }
    
    // 找到合适的位置添加调试界面
    const tabsSection = content.match(/<ul class="nav nav-tabs"[^>]*>[^<]*<li class="nav-item">[^<]*<a class="nav-link active"/);
    if (!tabsSection) {
      console.log('找不到合适的位置添加调试界面');
      return;
    }
    
    // 添加调试选项卡
    const debugTab = `<ul class="nav nav-tabs" id="myTab" role="tablist">
                <li class="nav-item" role="presentation">
                    <a class="nav-link active"`;
    
    const newTabSection = `<ul class="nav nav-tabs" id="myTab" role="tablist">
                <li class="nav-item" role="presentation">
                    <a class="nav-link active" id="home-tab" data-bs-toggle="tab" href="#home" role="tab" aria-controls="home" aria-selected="true">基本设置</a>
                </li>
                <li class="nav-item" role="presentation">
                    <a class="nav-link" id="documents-tab" data-bs-toggle="tab" href="#documents" role="tab" aria-controls="documents" aria-selected="false">文档列表</a>
                </li>
                <li class="nav-item" role="presentation">
                    <a class="nav-link" id="logs-tab" data-bs-toggle="tab" href="#logs" role="tab" aria-controls="logs" aria-selected="false">日志</a>
                </li>
                <li class="nav-item" role="presentation">
                    <a class="nav-link" id="debug-tab" data-bs-toggle="tab" href="#debug" role="tab" aria-controls="debug" aria-selected="false">调试工具</a>
                </li>`;
    
    content = content.replace(debugTab, newTabSection);
    
    // 添加调试界面
    const contentSection = content.match(/<div class="tab-pane fade" id="logs" role="tabpanel" aria-labelledby="logs-tab">[^<]*<div class="card">[^<]*<div class="card-header">[^<]*日志[^<]*<\/div>[^<]*<div class="card-body">[^<]*<div id="logs-container"[^>]*>/);
    if (contentSection) {
      const debugInterface = `
            <!-- DIFY DEBUG INTERFACE -->
            <div class="tab-pane fade" id="debug" role="tabpanel" aria-labelledby="debug-tab">
                <div class="card">
                    <div class="card-header">
                        Dify API调试工具
                    </div>
                    <div class="card-body">
                        <h5>API连接测试</h5>
                        <button id="test-connection-btn" class="btn btn-primary mb-3">测试API连接</button>
                        
                        <div id="connection-results" style="display: none">
                            <h6>测试结果:</h6>
                            <div class="mb-3">
                                <div id="test-summary" class="alert alert-info"></div>
                                <div id="test-details"></div>
                            </div>
                        </div>
                        
                        <hr>
                        
                        <h5>测试创建知识库</h5>
                        <form id="test-create-form" class="mb-3">
                            <div class="mb-3">
                                <label for="test-name" class="form-label">知识库名称</label>
                                <input type="text" class="form-control" id="test-name" name="name" value="测试知识库">
                            </div>
                            <div class="mb-3">
                                <label for="test-description" class="form-label">描述</label>
                                <input type="text" class="form-control" id="test-description" name="description" value="调试用测试知识库">
                            </div>
                            <button type="submit" class="btn btn-primary">测试创建</button>
                        </form>
                        
                        <div id="create-results" style="display: none">
                            <h6>创建结果:</h6>
                            <pre id="create-results-data" class="bg-light p-3" style="max-height: 300px; overflow: auto;"></pre>
                        </div>
                        
                        <hr>
                        
                        <h5>原始文档数据</h5>
                        <button id="raw-documents-btn" class="btn btn-secondary mb-3">获取原始文档响应</button>
                        
                        <div id="raw-documents-results" style="display: none">
                            <h6>原始响应:</h6>
                            <pre id="raw-documents-data" class="bg-light p-3" style="max-height: 300px; overflow: auto;"></pre>
                        </div>
                    </div>
                </div>
            </div>`;
      
      content = content.replace(/<div class="tab-pane fade" id="logs" role="tabpanel" aria-labelledby="logs-tab">[^<]*<div class="card">[^<]*<div class="card-header">[^<]*日志[^<]*<\/div>[^<]*<div class="card-body">[^<]*<div id="logs-container"[^>]*>/, 
        debugInterface + contentSection[0]);
    }
    
    // 添加JS功能
    const scriptSection = content.match(/<\/script>[^<]*<\/body>/);
    if (scriptSection) {
      const debugScripts = `
        // === 调试功能JS ===
        // 测试API连接
        document.getElementById('test-connection-btn').addEventListener('click', async function() {
            try {
                addLog('开始测试API连接...');
                document.getElementById('test-connection-btn').disabled = true;
                document.getElementById('connection-results').style.display = 'none';
                
                const response = await fetch('/api/dify/debug/test-connection');
                const data = await response.json();
                
                document.getElementById('connection-results').style.display = 'block';
                
                // 显示摘要
                const summaryEl = document.getElementById('test-summary');
                summaryEl.innerHTML = \`
                    <strong>测试完成</strong><br>
                    总测试: \${data.summary.total} | 
                    成功: \${data.summary.successful} | 
                    失败: \${data.summary.failed} | 
                    成功率: \${data.summary.success_rate}
                \`;
                
                // 显示详情
                const detailsEl = document.getElementById('test-details');
                detailsEl.innerHTML = '';
                
                data.tests.forEach((test, index) => {
                    const card = document.createElement('div');
                    card.className = \`card mb-2 \${test.success ? 'border-success' : 'border-danger'}\`;
                    
                    const header = document.createElement('div');
                    header.className = \`card-header \${test.success ? 'bg-success text-white' : 'bg-danger text-white'}\`;
                    header.innerHTML = \`<strong>\${index + 1}. \${test.name}</strong> - \${test.success ? '成功' : '失败'}\`;
                    
                    const body = document.createElement('div');
                    body.className = 'card-body';
                    
                    if (test.success) {
                        body.innerHTML = \`
                            <p><strong>URL:</strong> \${test.url}</p>
                            <p><strong>状态码:</strong> \${test.status} \${test.statusText || ''}</p>
                            \${test.corsSupport !== undefined ? \`<p><strong>CORS支持:</strong> \${test.corsSupport ? '是' : '否'}</p>\` : ''}
                            \${test.allowedMethods ? \`<p><strong>允许的方法:</strong> \${test.allowedMethods}</p>\` : ''}
                            \${test.dataPreview ? \`<p><strong>数据预览:</strong> <pre class="bg-light p-2">\${test.dataPreview}</pre></p>\` : ''}
                        \`;
                    } else {
                        body.innerHTML = \`
                            <p><strong>URL:</strong> \${test.url}</p>
                            <p><strong>错误:</strong> \${test.error}</p>
                            \${test.code ? \`<p><strong>错误代码:</strong> \${test.code}</p>\` : ''}
                        \`;
                    }
                    
                    card.appendChild(header);
                    card.appendChild(body);
                    detailsEl.appendChild(card);
                });
                
                addLog('API连接测试完成');
            } catch (error) {
                addLog(\`API连接测试失败: \${error.message}\`, 'error');
            } finally {
                document.getElementById('test-connection-btn').disabled = false;
            }
        });
        
        // 测试创建知识库
        document.getElementById('test-create-form').addEventListener('submit', async function(event) {
            event.preventDefault();
            
            try {
                const form = document.getElementById('test-create-form');
                const formData = new FormData(form);
                const testData = {
                    name: formData.get('name'),
                    description: formData.get('description')
                };
                
                if (!testData.name) {
                    addLog('测试知识库名称不能为空', 'error');
                    return;
                }
                
                addLog(\`开始测试创建知识库: \${testData.name}...\`);
                document.querySelectorAll('#test-create-form button').forEach(btn => btn.disabled = true);
                document.getElementById('create-results').style.display = 'none';
                
                const response = await fetch('/api/dify/debug/test-create', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(testData)
                });
                
                const data = await response.json();
                
                document.getElementById('create-results').style.display = 'block';
                document.getElementById('create-results-data').textContent = JSON.stringify(data, null, 2);
                
                if (data.success) {
                    addLog('测试创建知识库成功', 'success');
                } else {
                    addLog(\`测试创建知识库失败: \${data.error || '未知错误'}\`, 'error');
                }
            } catch (error) {
                addLog(\`测试创建知识库失败: \${error.message}\`, 'error');
            } finally {
                document.querySelectorAll('#test-create-form button').forEach(btn => btn.disabled = false);
            }
        });
        
        // 获取原始文档数据
        document.getElementById('raw-documents-btn').addEventListener('click', async function() {
            try {
                addLog('获取原始文档数据...');
                document.getElementById('raw-documents-btn').disabled = true;
                document.getElementById('raw-documents-results').style.display = 'none';
                
                const response = await fetch('/api/dify/debug/raw-documents');
                const data = await response.json();
                
                document.getElementById('raw-documents-results').style.display = 'block';
                document.getElementById('raw-documents-data').textContent = JSON.stringify(data, null, 2);
                
                addLog('原始文档数据获取成功');
            } catch (error) {
                addLog(\`获取原始文档数据失败: \${error.message}\`, 'error');
            } finally {
                document.getElementById('raw-documents-btn').disabled = false;
            }
        });
    </script>
    </body>`;
      
      content = content.replace(/<\/script>[^<]*<\/body>/, debugScripts);
    }
    
    // 保存文件
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('已更新前端页面，添加调试界面');
  } catch (error) {
    console.error('更新前端页面失败:', error);
  }
}

// 执行添加调试工具的操作
addDifyDebugRoutes();
updateFrontendPage();

console.log('Dify调试工具已添加，请重启服务以应用更改'); 
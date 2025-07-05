/**
 * Dify集成问题完整修复脚本
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// 全局错误处理器
process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
});

// 修复配置文件
async function fixConfig() {
  try {
    const configPath = path.join(__dirname, 'config.json');
    
    // 确认文件存在
    if (!fs.existsSync(configPath)) {
      console.error('配置文件不存在:', configPath);
      return false;
    }
    
    console.log('正在修复配置文件...');
    
    // 读取配置
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // 检查Dify配置
    if (!config.dify) {
      config.dify = {
        enabled: true,
        apiEndpoint: "https://api.dify.ai/v1",
        apiKey: "dataset-CBdZ3tu2yaTpd1mpjGhsLhaR",
        datasetId: "",
        syncInterval: 3600000,
        documentsPerDay: 24,
        debug: true
      };
    } else {
      // 修复API端点
      if (!config.dify.apiEndpoint || config.dify.apiEndpoint === 'http://localhost/v1') {
        config.dify.apiEndpoint = "https://api.dify.ai/v1";
      }
      
      // 修复API密钥，移除前缀
      if (config.dify.apiKey && config.dify.apiKey.startsWith('BEAR ')) {
        config.dify.apiKey = config.dify.apiKey.replace('BEAR ', '');
      }
      
      // 确保其他配置项存在
      config.dify.enabled = typeof config.dify.enabled === 'boolean' ? config.dify.enabled : true;
      config.dify.syncInterval = config.dify.syncInterval || 3600000;
      config.dify.documentsPerDay = config.dify.documentsPerDay || 24;
      config.dify.debug = true;
    }
    
    // 保存配置
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    
    console.log('配置文件已修复');
    console.log('新的配置:');
    console.log('- API端点:', config.dify.apiEndpoint);
    console.log('- API密钥:', config.dify.apiKey ? config.dify.apiKey.substring(0, 10) + '...' : '未设置');
    console.log('- 知识库ID:', config.dify.datasetId || '未设置');
    console.log('- 启用状态:', config.dify.enabled);
    
    return true;
  } catch (error) {
    console.error('修复配置文件失败:', error);
    return false;
  }
}

// 创建简单的测试页面
function createTestPage() {
  try {
    const testPagePath = path.join(__dirname, '..', 'public', 'dify-test.html');
    
    const testPage = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dify API测试</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        pre { background-color: #f8f9fa; padding: 1rem; border-radius: 0.25rem; }
        .result-box { max-height: 500px; overflow-y: auto; }
    </style>
</head>
<body>
    <div class="container py-4">
        <h1>Dify API测试工具</h1>
        <p class="lead">用于测试Dify API连接和功能</p>
        
        <div class="row mt-4">
            <div class="col-md-4">
                <div class="card mb-4">
                    <div class="card-header">测试API连接</div>
                    <div class="card-body">
                        <button id="test-connection" class="btn btn-primary">测试连接</button>
                    </div>
                </div>
                
                <div class="card mb-4">
                    <div class="card-header">获取知识库列表</div>
                    <div class="card-body">
                        <button id="get-datasets" class="btn btn-primary">获取列表</button>
                    </div>
                </div>
                
                <div class="card mb-4">
                    <div class="card-header">创建知识库</div>
                    <div class="card-body">
                        <form id="create-dataset-form">
                            <div class="mb-3">
                                <label for="dataset-name" class="form-label">知识库名称</label>
                                <input type="text" class="form-control" id="dataset-name" value="测试知识库">
                            </div>
                            <div class="mb-3">
                                <label for="dataset-desc" class="form-label">描述</label>
                                <input type="text" class="form-control" id="dataset-desc" value="这是一个测试知识库">
                            </div>
                            <button type="submit" class="btn btn-primary">创建</button>
                        </form>
                    </div>
                </div>
                
                <div class="card mb-4">
                    <div class="card-header">获取当前配置</div>
                    <div class="card-body">
                        <button id="get-config" class="btn btn-secondary">获取配置</button>
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
        
        // 测试API连接
        document.getElementById('test-connection').addEventListener('click', async () => {
            try {
                const response = await fetch('/api/dify/debug/test-connection');
                const data = await response.json();
                showResult('API连接测试结果', data);
            } catch (error) {
                showResult('API连接测试失败', error.message, true);
            }
        });
        
        // 获取知识库列表
        document.getElementById('get-datasets').addEventListener('click', async () => {
            try {
                const response = await fetch('/api/dify/debug/raw-documents');
                const data = await response.json();
                showResult('获取知识库列表结果', data);
            } catch (error) {
                showResult('获取知识库列表失败', error.message, true);
            }
        });
        
        // 创建知识库
        document.getElementById('create-dataset-form').addEventListener('submit', async (event) => {
            event.preventDefault();
            
            const name = document.getElementById('dataset-name').value;
            const description = document.getElementById('dataset-desc').value;
            
            if (!name) {
                showResult('创建知识库失败', '知识库名称不能为空', true);
                return;
            }
            
            try {
                const response = await fetch('/api/dify/debug/test-create', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ name, description })
                });
                
                const data = await response.json();
                showResult('创建知识库结果', data);
            } catch (error) {
                showResult('创建知识库失败', error.message, true);
            }
        });
        
        // 获取配置
        document.getElementById('get-config').addEventListener('click', async () => {
            try {
                const response = await fetch('/api/dify/debug/status');
                const data = await response.json();
                showResult('当前配置', data);
            } catch (error) {
                showResult('获取配置失败', error.message, true);
            }
        });
    </script>
</body>
</html>`;
    
    fs.writeFileSync(testPagePath, testPage, 'utf8');
    console.log('测试页面已创建:', testPagePath);
    console.log('测试页面访问地址: http://localhost:3000/dify-test.html');
    
    return true;
  } catch (error) {
    console.error('创建测试页面失败:', error);
    return false;
  }
}

// 修复知识库创建路由
function fixCreateKnowledgeRoute() {
  try {
    const filePath = path.join(__dirname, '..', 'app.js');
    let content = fs.readFileSync(filePath, 'utf8');
    
    // 检查是否已修复
    if (content.includes('// FIX: 更新知识库创建路由')) {
      console.log('知识库创建路由已修复');
      return true;
    }
    
    console.log('正在修复知识库创建路由...');
    
    // 查找createEmptyKnowledge方法调用
    const routeMatch = content.match(/app\.post\('\/api\/dify\/knowledge'[\s\S]*?try[\s\S]*?const result = await difyKnowledgeService\.createEmptyKnowledge\(name, description[^)]*\);/);
    
    if (routeMatch) {
      // 替换为更强大的错误处理和调试
      const newRouteCode = `app.post('/api/dify/knowledge', async (req, res) => {
  try {
    // FIX: 更新知识库创建路由
    console.log('接收到创建知识库请求:', req.body);
    const { name, description } = req.body;
    
    if (!name) {
      console.log('知识库名称为空，返回400错误');
      return res.status(400).json({ error: '知识库名称是必需的' });
    }
    
    console.log(\`准备创建知识库: \${name}, 描述: \${description || '(无)'}\`);
    
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
      const url = \`\${config.apiEndpoint}/datasets\`;
      const data = { name, description };
      const headers = {
        'Authorization': \`Bearer \${config.apiKey}\`,
        'Content-Type': 'application/json'
      };
      
      console.log('请求URL:', url);
      console.log('请求数据:', data);
      console.log('请求头:', {...headers, 'Authorization': \`Bearer \${config.apiKey.substring(0, 10)}...\`});
      
      const response = await axios.post(url, data, { headers });
      
      console.log('直接API调用成功:', response.status);
      console.log('响应数据:', response.data);
      
      // 更新配置中的datasetId
      if (response.data && response.data.id) {
        const newConfig = {...config, datasetId: response.data.id};
        difyKnowledgeService.updateConfig(newConfig);
        console.log(\`已更新知识库ID: \${response.data.id}\`);
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
    const result = await difyKnowledgeService.createEmptyKnowledge(name, description || '');`;
      
      content = content.replace(/app\.post\('\/api\/dify\/knowledge'[\s\S]*?try[\s\S]*?const result = await difyKnowledgeService\.createEmptyKnowledge\(name, description[^)]*\);/, newRouteCode);
      
      // 保存文件
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('知识库创建路由已修复');
      return true;
    } else {
      console.log('找不到知识库创建路由，无法修复');
      return false;
    }
  } catch (error) {
    console.error('修复知识库创建路由失败:', error);
    return false;
  }
}

// 创建定时任务
async function createTimerTask() {
  try {
    const filePath = path.join(__dirname, 'modbus-data-to-dify.js');
    
    // 检查文件是否存在
    if (fs.existsSync(filePath)) {
      console.log('定时任务脚本已存在');
      return true;
    }
    
    console.log('创建定时任务脚本...');
    
    const script = `/**
 * Modbus数据同步到Dify知识库的定时任务
 * 
 * 该脚本实现每小时将modbus_data_latest表中的数据存入Dify知识库
 * 每天24小时的数据将存入一个文档，使用清晰的命名以便后期准确召回
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const axios = require('axios');
const FormData = require('form-data');
const moment = require('moment');

// 数据库配置
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'password',
  database: 'modbus_db'
};

// Dify知识库服务
const DifyService = require('./dify-knowledge-service');
const difyService = DifyService.getInstance();

// 日志目录
const LOG_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 日志文件
const LOG_FILE = path.join(LOG_DIR, \`dify-sync-\${moment().format('YYYY-MM-DD')}.log\`);

// 写入日志
function log(message) {
  const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
  const logMessage = \`[\${timestamp}] \${message}\\n\`;
  
  console.log(logMessage.trim());
  fs.appendFileSync(LOG_FILE, logMessage);
}

// 获取modbus_data_latest表数据
async function getModbusLatestData() {
  let connection;
  
  try {
    log('连接数据库...');
    connection = await mysql.createConnection(dbConfig);
    
    log('查询modbus_data_latest表数据...');
    const [rows] = await connection.execute('SELECT * FROM modbus_data_latest');
    
    log(\`获取到 \${rows.length} 条数据\`);
    return rows;
  } catch (error) {
    log(\`获取数据失败: \${error.message}\`);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// 格式化数据为文档内容
function formatDataToDocument(data, timestamp) {
  // 标题使用当前日期
  const title = \`Modbus数据_\${moment(timestamp).format('YYYY-MM-DD')}\`;
  
  // 使用当前小时作为章节标题
  const hour = moment(timestamp).format('HH');
  
  // 构建内容
  let content = \`# \${title}\\n\\n## \${hour}时数据\\n\\n\`;
  
  // 添加表格标题
  content += \`| 数据点ID | 标识符 | 名称 | 原始值 | 处理后的值 | 格式化值 | 数据质量 | 数据类型 | 更新时间 |\\n\`;
  content += \`| -------- | ------ | ---- | ------ | ---------- | -------- | -------- | -------- | -------- |\\n\`;
  
  // 添加数据行
  data.forEach(item => {
    const updateTime = item.update_time ? moment(item.update_time).format('YYYY-MM-DD HH:mm:ss') : '';
    
    content += \`| \${item.id || ''} | \${item.identifier || ''} | \${item.name || ''} | \`;
    content += \`\${item.raw_value || ''} | \${item.processed_value || ''} | \${item.formatted_value || ''} | \`;
    content += \`\${item.quality || ''} | \${item.data_type || ''} | \${updateTime} |\\n\`;
  });
  
  return {
    title,
    content
  };
}

// 将数据上传到Dify知识库
async function uploadToDify(documentData) {
  // 确保Dify服务已初始化
  if (!difyService.initialized) {
    log('初始化Dify服务...');
    await difyService.initialize();
  }
  
  const config = difyService.getConfig();
  
  if (!config.enabled) {
    log('Dify服务已禁用，无法上传数据');
    return false;
  }
  
  if (!config.datasetId) {
    log('未配置知识库ID，无法上传数据');
    return false;
  }
  
  try {
    log(\`准备上传文档: \${documentData.title}\`);
    
    // 创建临时文件
    const tempDir = path.join(__dirname, '..', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const tempFile = path.join(tempDir, \`\${documentData.title.replace(/[\\/:*?"<>|]/g, '_')}.md\`);
    fs.writeFileSync(tempFile, documentData.content, 'utf8');
    
    log(\`已创建临时文件: \${tempFile}\`);
    
    // 创建FormData
    const formData = new FormData();
    formData.append('file', fs.createReadStream(tempFile));
    formData.append('name', documentData.title);
    formData.append('data_source_type', 'upload');
    
    // 上传到Dify
    const response = await axios.post(
      \`\${config.apiEndpoint}/datasets/\${config.datasetId}/documents\`,
      formData,
      {
        headers: {
          'Authorization': \`Bearer \${config.apiKey}\`,
          ...formData.getHeaders()
        }
      }
    );
    
    log(\`文档上传成功，ID: \${response.data.id}\`);
    
    // 删除临时文件
    fs.unlinkSync(tempFile);
    
    return {
      success: true,
      documentId: response.data.id
    };
  } catch (error) {
    log(\`上传文档失败: \${error.message}\`);
    
    if (error.response) {
      log(\`错误状态码: \${error.response.status}\`);
      log(\`错误信息: \${JSON.stringify(error.response.data)}\`);
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

// 主函数 - 执行数据同步
async function syncData() {
  try {
    log('======== 开始Modbus数据同步到Dify ========');
    
    // 获取最新数据
    const latestData = await getModbusLatestData();
    
    if (!latestData || latestData.length === 0) {
      log('没有可同步的数据');
      return;
    }
    
    // 格式化为文档
    const timestamp = new Date();
    const document = formatDataToDocument(latestData, timestamp);
    
    // 上传到Dify
    const result = await uploadToDify(document);
    
    if (result.success) {
      log(\`同步完成! 文档ID: \${result.documentId}\`);
    } else {
      log(\`同步失败: \${result.error}\`);
    }
    
    log('======== Modbus数据同步到Dify结束 ========');
  } catch (error) {
    log(\`同步过程出错: \${error.message}\`);
    log(error.stack);
  }
}

// 启动定时任务
function startSchedule() {
  // 加载配置
  const config = difyService.getConfig();
  const interval = config.syncInterval || 3600000; // 默认1小时
  
  log(\`启动定时任务，同步间隔: \${interval}毫秒 (\${interval / 60000} 分钟)\`);
  
  // 立即执行一次
  syncData();
  
  // 设置定时器
  setInterval(syncData, interval);
}

// 启动程序
log('启动Modbus数据同步到Dify知识库服务');
startSchedule();
`;
    
    fs.writeFileSync(filePath, script, 'utf8');
    console.log('定时任务脚本已创建:', filePath);
    
    return true;
  } catch (error) {
    console.error('创建定时任务脚本失败:', error);
    return false;
  }
}

// 主函数
async function main() {
  console.log('===== Dify集成问题完整修复工具 =====');
  
  // 修复配置
  await fixConfig();
  
  // 修复路由
  fixCreateKnowledgeRoute();
  
  // 创建测试页面
  createTestPage();
  
  // 创建定时任务
  await createTimerTask();
  
  console.log('===== 修复完成 =====');
  console.log('请按照以下步骤操作:');
  console.log('1. 重启服务器');
  console.log('2. 访问测试页面: http://localhost:3000/dify-test.html');
  console.log('3. 测试Dify API连接');
  console.log('4. 创建新知识库');
  console.log('5. 启动定时任务: node modbus/modbus-data-to-dify.js');
}

// 执行主函数
main().catch(error => {
  console.error('修复过程出错:', error);
}); 
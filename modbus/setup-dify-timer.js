/**
 * Dify知识库定时同步设置工具
 * 
 * 设置定时任务，每小时将modbus_data_latest表中的数据存入Dify知识库。
 * 该脚本会自动创建数据同步脚本和配置定时任务。
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const axios = require('axios');
const cron = require('node-cron');

// 数据库配置
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'password',
  database: 'modbus_db'
};

// 日志目录
const LOG_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 日志文件
const LOG_FILE = path.join(LOG_DIR, `dify-sync-setup-${new Date().toISOString().split('T')[0]}.log`);

// 写入日志
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  
  console.log(message);
  fs.appendFileSync(LOG_FILE, logMessage);
}

// 测试数据库连接
async function testDbConnection() {
  let connection;
  try {
    log('测试数据库连接...');
    connection = await mysql.createConnection(dbConfig);
    log('✅ 数据库连接成功');
    
    // 检查modbus_data_latest表是否存在
    log('检查modbus_data_latest表...');
    const [tables] = await connection.execute("SHOW TABLES LIKE 'modbus_data_latest'");
    
    if (tables.length === 0) {
      log('❌ modbus_data_latest表不存在');
      return false;
    }
    
    // 获取表结构
    const [columns] = await connection.execute("DESCRIBE modbus_data_latest");
    log(`✅ modbus_data_latest表存在，包含 ${columns.length} 个字段`);
    
    // 列出字段
    const fieldNames = columns.map(col => col.Field).join(', ');
    log(`表字段: ${fieldNames}`);
    
    // 检查数据量
    const [countResult] = await connection.execute("SELECT COUNT(*) as count FROM modbus_data_latest");
    const count = countResult[0].count;
    log(`表中有 ${count} 条数据`);
    
    return true;
  } catch (error) {
    log(`❌ 数据库测试失败: ${error.message}`);
    return false;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// 测试Dify API连接
async function testDifyConnection() {
  try {
    log('测试Dify API连接...');
    
    // 读取配置文件
    const configPath = path.join(__dirname, 'config.json');
    if (!fs.existsSync(configPath)) {
      log('❌ 配置文件不存在');
      return false;
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!config.dify) {
      log('❌ 配置文件中不存在Dify配置');
      return false;
    }
    
    const { apiEndpoint, apiKey } = config.dify;
    
    if (!apiEndpoint || !apiKey) {
      log('❌ API端点或API密钥未配置');
      return false;
    }
    
    log(`API端点: ${apiEndpoint}`);
    log(`API密钥: ${apiKey.substring(0, 10)}...`);
    
    // 测试API连接
    const response = await axios.get(apiEndpoint, {
      timeout: 5000,
      validateStatus: () => true
    });
    
    log(`状态码: ${response.status}`);
    
    if (response.status >= 200 && response.status < 300) {
      log('✅ API端点连接正常');
      
      // 测试知识库列表API
      try {
        const datasetsResponse = await axios.get(`${apiEndpoint}/datasets`, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json'
          },
          timeout: 5000,
          validateStatus: () => true
        });
        
        if (datasetsResponse.status === 200) {
          log('✅ 知识库列表API测试成功');
          return true;
        } else {
          log(`❌ 知识库列表API测试失败，状态码: ${datasetsResponse.status}`);
          if (datasetsResponse.data) {
            log(`响应: ${JSON.stringify(datasetsResponse.data)}`);
          }
          return false;
        }
      } catch (apiError) {
        log(`❌ 知识库列表API测试失败: ${apiError.message}`);
        return false;
      }
    } else {
      log(`❌ API端点连接异常，状态码: ${response.status}`);
      return false;
    }
  } catch (error) {
    log(`❌ Dify API测试失败: ${error.message}`);
    return false;
  }
}

// 创建定时同步脚本
function createSyncScript() {
  try {
    log('创建定时同步脚本...');
    const scriptPath = path.join(__dirname, 'modbus-data-to-dify.js');
    
    // 检查文件是否已存在
    if (fs.existsSync(scriptPath)) {
      log('同步脚本已存在，跳过创建');
      return true;
    }
    
    const syncScript = `/**
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
const LOG_FILE = path.join(LOG_DIR, \`dify-sync-\${new Date().toISOString().split('T')[0]}.log\`);

// 写入日志
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = \`[\${timestamp}] \${message}\\n\`;
  
  console.log(message);
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
  const title = \`Modbus数据_\${timestamp.toISOString().split('T')[0]}\`;
  
  // 使用当前小时作为章节标题
  const hour = timestamp.getHours().toString().padStart(2, '0');
  
  // 构建内容
  let content = \`# \${title}\\n\\n## \${hour}时数据\\n\\n\`;
  
  // 添加表格标题
  content += \`| 数据点ID | 标识符 | 名称 | 原始值 | 处理后的值 | 格式化值 | 数据质量 | 数据类型 | 更新时间 |\\n\`;
  content += \`| -------- | ------ | ---- | ------ | ---------- | -------- | -------- | -------- | -------- |\\n\`;
  
  // 添加数据行
  data.forEach(item => {
    const updateTime = item.update_time ? new Date(item.update_time).toISOString() : '';
    
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
    return { success: false, error: 'Dify服务已禁用' };
  }
  
  if (!config.datasetId) {
    log('未配置知识库ID，无法上传数据');
    return { success: false, error: '未配置知识库ID' };
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

// 立即执行一次
syncData();

// 设置每小时执行一次
const interval = 60 * 60 * 1000; // 1小时
setInterval(syncData, interval);

log(\`已设置定时同步任务，每 \${interval/60000} 分钟执行一次\`);
`;
    
    fs.writeFileSync(scriptPath, syncScript, 'utf8');
    log(`✅ 同步脚本已创建: ${scriptPath}`);
    return true;
  } catch (error) {
    log(`❌ 创建同步脚本失败: ${error.message}`);
    return false;
  }
}

// 创建启动脚本
function createStartupScript() {
  try {
    log('创建启动脚本...');
    const startupPath = path.join(__dirname, 'start-dify-sync.js');
    
    // 检查文件是否已存在
    if (fs.existsSync(startupPath)) {
      log('启动脚本已存在，跳过创建');
      return true;
    }
    
    const startupScript = `/**
 * Dify知识库同步启动脚本
 * 
 * 该脚本使用node-cron启动定时任务，每小时运行一次
 */

const cron = require('node-cron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// 日志目录
const LOG_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 日志文件
const LOG_FILE = path.join(LOG_DIR, \`dify-sync-cron-\${new Date().toISOString().split('T')[0]}.log\`);

// 写入日志
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = \`[\${timestamp}] \${message}\\n\`;
  
  console.log(message);
  fs.appendFileSync(LOG_FILE, logMessage);
}

// 同步脚本路径
const syncScriptPath = path.join(__dirname, 'modbus-data-to-dify.js');

// 检查脚本是否存在
if (!fs.existsSync(syncScriptPath)) {
  log(\`❌ 同步脚本不存在: \${syncScriptPath}\`);
  process.exit(1);
}

// 运行同步脚本
function runSyncScript() {
  log('运行同步脚本...');
  
  exec(\`node "\${syncScriptPath}"\`, (error, stdout, stderr) => {
    if (error) {
      log(\`❌ 执行出错: \${error.message}\`);
      return;
    }
    
    if (stderr) {
      log(\`⚠️ 错误输出: \${stderr}\`);
    }
    
    log(\`✅ 脚本输出: \${stdout}\`);
  });
}

// 立即运行一次
log('立即执行同步任务...');
runSyncScript();

// 设置每小时运行一次 (分钟设为0表示每小时的第0分钟)
log('设置定时任务: 每小时运行一次');
cron.schedule('0 * * * *', () => {
  log(\`定时任务触发: \${new Date().toISOString()}\`);
  runSyncScript();
});

log('定时任务已启动，每小时自动同步一次数据到Dify知识库');
log('按 Ctrl+C 停止服务');
`;
    
    fs.writeFileSync(startupPath, startupScript, 'utf8');
    log(`✅ 启动脚本已创建: ${startupPath}`);
    return true;
  } catch (error) {
    log(`❌ 创建启动脚本失败: ${error.message}`);
    return false;
  }
}

// 创建定时任务配置说明
function createTimerDocs() {
  try {
    log('创建定时任务文档...');
    const docsPath = path.join(__dirname, '..', 'docs');
    const docFilePath = path.join(docsPath, 'dify-timer-tasks.md');
    
    // 确保目录存在
    if (!fs.existsSync(docsPath)) {
      fs.mkdirSync(docsPath, { recursive: true });
    }
    
    const timerDocs = `# Dify知识库定时同步任务

## 概述

为了实现每小时将modbus_data_latest表中的数据存入Dify知识库，系统提供了以下两种方式：

1. 直接运行同步脚本（一次性）
2. 启动定时任务服务（持续运行）

## 方式一：直接运行同步脚本

同步脚本位于 \`modbus/modbus-data-to-dify.js\`，可以直接运行：

\`\`\`bash
node modbus/modbus-data-to-dify.js
\`\`\`

该脚本会执行以下操作：
- 立即执行一次数据同步
- 设置一个每小时执行一次的定时器
- 该脚本必须保持运行状态才能定时执行

## 方式二：启动定时任务服务（推荐）

定时任务启动脚本位于 \`modbus/start-dify-sync.js\`，使用 node-cron 提供更可靠的定时执行：

\`\`\`bash
node modbus/start-dify-sync.js
\`\`\`

该脚本会：
- 立即执行一次数据同步
- 设置每小时整点（如 9:00, 10:00）执行一次同步
- 提供更可靠的定时执行机制
- 必须保持运行状态才能定时执行

## 自动启动配置

### Windows系统

可以创建一个批处理文件，然后添加到Windows启动项：

1. 创建批处理文件 \`start-dify-sync.bat\`：

\`\`\`batch
@echo off
cd /d %~dp0
node modbus/start-dify-sync.js
\`\`\`

2. 将批处理文件添加到启动项：
   - 按 Win+R，输入 \`shell:startup\`
   - 复制批处理文件到打开的文件夹

### Linux系统

可以创建一个systemd服务：

1. 创建服务文件 \`/etc/systemd/system/dify-sync.service\`：

\`\`\`ini
[Unit]
Description=Dify Knowledge Base Sync Service
After=network.target

[Service]
Type=simple
User=your_username
WorkingDirectory=/path/to/your/project
ExecStart=/usr/bin/node /path/to/your/project/modbus/start-dify-sync.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
\`\`\`

2. 启用并启动服务：

\`\`\`bash
sudo systemctl enable dify-sync
sudo systemctl start dify-sync
\`\`\`

## 日志查看

同步服务的日志位于 \`logs/\` 目录：

- \`dify-sync-YYYY-MM-DD.log\`: 直接运行脚本产生的日志
- \`dify-sync-cron-YYYY-MM-DD.log\`: 定时任务服务产生的日志

## 配置修改

定时同步的配置参数位于 \`modbus/config.json\` 文件中：

\`\`\`json
{
  "dify": {
    "enabled": true,
    "apiEndpoint": "http://localhost/v1",
    "apiKey": "你的API密钥",
    "datasetId": "知识库ID",
    "syncInterval": 3600000,  // 同步间隔，毫秒（1小时）
    "documentsPerDay": 24     // 每天保存的文档数量
  }
}
\`\`\`
`;
    
    fs.writeFileSync(docFilePath, timerDocs, 'utf8');
    log(`✅ 定时任务文档已创建: ${docFilePath}`);
    return true;
  } catch (error) {
    log(`❌ 创建定时任务文档失败: ${error.message}`);
    return false;
  }
}

// 安装必要的依赖
async function installDependencies() {
  try {
    log('检查并安装必要的依赖...');
    
    // 创建package.json
    const packagePath = path.join(__dirname, '..', 'package.json');
    
    // 读取现有package.json
    if (fs.existsSync(packagePath)) {
      log('✅ package.json已存在');
      
      try {
        const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        const dependencies = packageJson.dependencies || {};
        
        // 检查必要的依赖
        const requiredDeps = {
          'mysql2': '^2.3.3',
          'axios': '^0.27.2',
          'form-data': '^4.0.0',
          'node-cron': '^3.0.2'
        };
        
        let missingDeps = [];
        
        for (const [dep, version] of Object.entries(requiredDeps)) {
          if (!dependencies[dep]) {
            missingDeps.push(dep);
          }
        }
        
        if (missingDeps.length > 0) {
          log(`⚠️ 缺少以下依赖: ${missingDeps.join(', ')}`);
          log('请手动安装这些依赖:');
          log(`npm install ${missingDeps.join(' ')}`);
        } else {
          log('✅ 所有必要的依赖已安装');
        }
      } catch (error) {
        log(`❌ 解析package.json失败: ${error.message}`);
      }
    } else {
      log('⚠️ package.json不存在，请确保安装以下依赖:');
      log('npm install mysql2 axios form-data node-cron');
    }
    
    return true;
  } catch (error) {
    log(`❌ 检查依赖失败: ${error.message}`);
    return false;
  }
}

// 主函数
async function main() {
  log('==================================================');
  log('|        Dify知识库定时同步设置工具              |');
  log('==================================================');
  
  // 检查依赖
  await installDependencies();
  
  // 测试数据库连接
  const dbOk = await testDbConnection();
  
  // 测试Dify API连接
  const difyOk = await testDifyConnection();
  
  // 创建同步脚本
  createSyncScript();
  
  // 创建启动脚本
  createStartupScript();
  
  // 创建文档
  createTimerDocs();
  
  // 总结
  log('\n==================================================');
  log('设置总结:');
  log(`- 数据库连接: ${dbOk ? '✅ 正常' : '❌ 异常'}`);
  log(`- Dify API连接: ${difyOk ? '✅ 正常' : '❌ 异常'}`);
  log('- 创建的文件:');
  log('  * modbus/modbus-data-to-dify.js (同步脚本)');
  log('  * modbus/start-dify-sync.js (定时任务启动脚本)');
  log('  * docs/dify-timer-tasks.md (定时任务文档)');
  
  log('\n启动定时任务的两种方式:');
  log('1. 直接运行同步脚本（立即同步并设置每小时执行一次）:');
  log('   node modbus/modbus-data-to-dify.js');
  log('2. 启动cron定时任务服务（推荐，更可靠）:');
  log('   node modbus/start-dify-sync.js');
  log('==================================================');
}

// 执行主函数
main().catch(error => {
  log(`❌ 执行过程出错: ${error.message}`);
}); 
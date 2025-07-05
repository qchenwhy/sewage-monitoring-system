/**
 * 工作内容功能安装脚本
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql');
const readlineSync = require('readline-sync');

// 主函数
async function main() {
  console.log('=== 工作内容管理功能安装程序 ===');
  
  try {
    // 1. 检查文件是否存在
    checkFiles();
    
    // 2. 执行SQL文件
    const dbConfigured = await configureDatabaseIfNeeded();
    if (dbConfigured) {
      await executeSqlFile();
    }
    
    // 3. 注册路由
    registerRoutes();
    
    console.log('\n安装完成！请重启应用以应用更改。');
    console.log('安装后可以访问: http://服务器地址:端口/work-tasks');
  } catch (error) {
    console.error('\n安装过程中出错:', error.message);
    console.error('安装失败，请检查错误并重试。');
  }
}

// 检查必要的文件是否存在
function checkFiles() {
  console.log('\n检查文件...');
  
  const requiredFiles = [
    { path: './sql/work_tasks.sql', name: 'SQL定义文件' },
    { path: './routes/workTaskRoutes.js', name: '路由文件' },
    { path: './public/work-tasks.html', name: '前端HTML文件' },
    { path: './register-work-routes.js', name: '路由注册脚本' }
  ];
  
  let allFilesExist = true;
  
  for (const file of requiredFiles) {
    if (fs.existsSync(file.path)) {
      console.log(`✅ ${file.name}存在: ${file.path}`);
    } else {
      console.log(`❌ ${file.name}不存在: ${file.path}`);
      allFilesExist = false;
    }
  }
  
  if (!allFilesExist) {
    throw new Error('缺少必要的文件，请确保所有文件已创建');
  }
}

// 配置数据库连接
async function configureDatabaseIfNeeded() {
  console.log('\n配置数据库连接...');
  
  // 默认配置
  let dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'password',
    database: 'mqtt_data'
  };
  
  // 检查是否已存在.env文件
  if (fs.existsSync('./.env')) {
    console.log('检测到.env文件，将使用其中的数据库配置');
    return true;
  }
  
  // 询问是否需要配置数据库
  const needConfig = readlineSync.keyInYN('是否需要配置数据库连接信息?');
  if (!needConfig) {
    console.log('将使用默认配置:', JSON.stringify(dbConfig, null, 2));
    return true;
  }
  
  // 手动配置数据库
  dbConfig.host = readlineSync.question('数据库主机 (默认: localhost): ', { defaultInput: dbConfig.host });
  dbConfig.user = readlineSync.question('数据库用户名 (默认: root): ', { defaultInput: dbConfig.user });
  dbConfig.password = readlineSync.question('数据库密码: ', { hideEchoBack: true, defaultInput: dbConfig.password });
  dbConfig.database = readlineSync.question('数据库名称 (默认: mqtt_data): ', { defaultInput: dbConfig.database });
  
  // 测试连接
  try {
    console.log('测试数据库连接...');
    const conn = mysql.createConnection(dbConfig);
    await new Promise((resolve, reject) => {
      conn.connect(err => {
        if (err) {
          reject(err);
        } else {
          console.log('数据库连接成功!');
          conn.end();
          resolve();
        }
      });
    });
    
    // 保存配置到.env文件
    const saveConfig = readlineSync.keyInYN('是否将配置保存到.env文件?');
    if (saveConfig) {
      const envContent = `DB_HOST=${dbConfig.host}
DB_USER=${dbConfig.user}
DB_PASSWORD=${dbConfig.password}
DB_NAME=${dbConfig.database}`;
      
      fs.writeFileSync('./.env', envContent, 'utf8');
      console.log('.env文件已创建');
    }
    
    return true;
  } catch (error) {
    console.error('数据库连接失败:', error.message);
    const retry = readlineSync.keyInYN('是否重试配置?');
    if (retry) {
      return await configureDatabaseIfNeeded();
    }
    return false;
  }
}

// 执行SQL文件
async function executeSqlFile() {
  console.log('\n创建数据库表...');
  
  // 读取SQL文件
  const sqlContent = fs.readFileSync('./sql/work_tasks.sql', 'utf8');
  
  // 配置数据库连接
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'mqtt_data',
    multipleStatements: true
  };
  
  // 创建连接
  const conn = mysql.createConnection(dbConfig);
  
  // 执行SQL
  return new Promise((resolve, reject) => {
    conn.connect(err => {
      if (err) {
        return reject(new Error(`数据库连接失败: ${err.message}`));
      }
      
      conn.query(sqlContent, (error, results) => {
        conn.end();
        
        if (error) {
          return reject(new Error(`SQL执行失败: ${error.message}`));
        }
        
        console.log('数据库表创建成功!');
        resolve(results);
      });
    });
  });
}

// 注册路由
function registerRoutes() {
  console.log('\n注册路由和页面...');
  
  // 检查app.js文件
  const appJsPath = './app.js';
  if (!fs.existsSync(appJsPath)) {
    throw new Error('找不到app.js文件，无法注册路由');
  }
  
  // 读取app.js内容
  let appContent = fs.readFileSync(appJsPath, 'utf8');
  
  // 检查是否已经注册了工作内容管理路由
  if (appContent.includes('registerWorkRoutes') || appContent.includes('/work-tasks')) {
    console.log('工作内容管理路由已注册，跳过此步骤');
    return;
  }
  
  // 备份app.js
  const backupPath = `${appJsPath}.${Date.now()}.bak`;
  fs.writeFileSync(backupPath, appContent, 'utf8');
  console.log(`已备份app.js到: ${backupPath}`);
  
  // 寻找合适的位置添加路由注册代码
  const lines = appContent.split('\n');
  
  // 查找最后一个require语句的位置
  let lastRequireIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('require(') && !lines[i].includes('//')) {
      lastRequireIndex = i;
    }
  }
  
  // 查找server.listen或app.listen的位置
  let listenIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i].includes('server.listen(') || lines[i].includes('app.listen(')) && !lines[i].includes('//')) {
      listenIndex = i;
      break;
    }
  }
  
  if (lastRequireIndex === -1 || listenIndex === -1) {
    console.log('无法找到合适的位置注册路由，请手动修改app.js文件');
    console.log(`
// 在require语句部分添加:
const registerWorkRoutes = require('./register-work-routes');

// 在服务器启动前添加:
// 注册工作内容管理路由和页面
registerWorkRoutes(app);
`);
    return;
  }
  
  // 添加require语句
  lines.splice(lastRequireIndex + 1, 0, '', '// 导入工作内容管理路由注册模块', 'const registerWorkRoutes = require(\'./register-work-routes\');');
  
  // 添加路由注册代码
  lines.splice(listenIndex, 0, '', '// 注册工作内容管理路由和页面', 'registerWorkRoutes(app);', '');
  
  // 写回文件
  fs.writeFileSync(appJsPath, lines.join('\n'), 'utf8');
  console.log('已成功在app.js中注册工作内容管理路由');
}

// 运行主函数
main().catch(console.error); 
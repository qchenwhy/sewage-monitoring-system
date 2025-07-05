/**
 * 工作内容功能初始化模块
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

/**
 * 初始化工作内容功能
 * @param {Object} app Express应用实例
 * @returns {Promise<boolean>} 初始化是否成功
 */
async function initWorkTasks(app) {
  console.log('开始初始化工作内容功能...');
  
  try {
    // 检查必要文件
    const requiredFiles = [
      { path: './sql/work_tasks.sql', name: 'SQL定义文件' },
      { path: './routes/workTaskRoutes.js', name: '路由文件' },
      { path: './public/work-tasks.html', name: '前端HTML页面' },
      { path: './public/work-tasks.js', name: '前端JavaScript文件' }
    ];

    for (const file of requiredFiles) {
      if (!fs.existsSync(file.path)) {
        console.error(`缺少必要文件: ${file.name} (${file.path})`);
        return false;
      }
    }
    
    console.log('所有必要文件检查通过');

    // 检查app.js中的路由是否已注册（通过检查已运行的app实例）
    const hasRoutes = app._router.stack.some(layer => 
      layer.name === 'router' && 
      layer.regexp && 
      layer.regexp.toString().includes('api\\/work-tasks')
    );

    if (!hasRoutes) {
      console.error('工作内容API路由未在app.js中注册');
      return false;
    }
    
    console.log('API路由检查通过');

    // 检查数据库表结构
    await checkAndCreateDatabaseTables();
    
    return true;
  } catch (error) {
    console.error('初始化工作内容功能失败:', error);
    return false;
  }
}

/**
 * 检查并创建数据库表结构
 */
async function checkAndCreateDatabaseTables() {
  let connection;
  
  try {
    // 创建数据库连接
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '753456Chen*',
      database: process.env.DB_NAME || 'mqtt_data',
      multipleStatements: true // 允许执行多条SQL语句
    });
    
    console.log('数据库连接成功');
    
    // 检查regular_work_tasks表是否存在
    const [tables] = await connection.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE() 
      AND table_name IN ('regular_work_tasks', 'temporary_work_tasks')
    `);
    
    // 如果表不存在，则创建表
    if (tables.length < 2) {
      console.log('数据库表不完整，开始创建表结构...');
      
      // 读取SQL文件
      const sqlFilePath = path.join(__dirname, 'sql', 'work_tasks.sql');
      const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
      
      // 执行SQL语句
      await connection.query(sqlContent);
      console.log('数据库表结构创建成功');
    } else {
      console.log('数据库表已存在，无需创建');
    }
    
    // 检查视图是否存在
    const [views] = await connection.query(`
      SELECT table_name 
      FROM information_schema.views 
      WHERE table_schema = DATABASE() 
      AND table_name = 'daily_work_plan'
    `);
    
    if (views.length === 0) {
      console.log('daily_work_plan视图不存在，创建视图...');
      
      // 读取视图创建部分的SQL
      const sqlFilePath = path.join(__dirname, 'sql', 'work_tasks.sql');
      const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
      
      // 提取视图创建语句
      const viewCreatePattern = /CREATE OR REPLACE VIEW daily_work_plan([\s\S]*?);/;
      const viewMatch = sqlContent.match(viewCreatePattern);
      
      if (viewMatch && viewMatch[0]) {
        await connection.query(viewMatch[0]);
        console.log('daily_work_plan视图创建成功');
      } else {
        console.error('无法在SQL文件中找到视图创建语句');
      }
    } else {
      console.log('daily_work_plan视图已存在');
    }
    
  } catch (error) {
    console.error('检查数据库表结构失败:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      console.log('数据库连接已关闭');
    }
  }
}

module.exports = initWorkTasks;

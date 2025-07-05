const mysql = require('mysql2/promise');

async function checkTables() {
  try {
    // 创建数据库连接池
    const pool = await mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '753456Chen*',
      database: process.env.DB_NAME || 'mqtt_data',
      waitForConnections: true,
      connectionLimit: 2,
      queueLimit: 0
    });
    
    // 检查临时工作表
    console.log('检查临时工作表结构...');
    try {
      const [tempResult] = await pool.query('DESCRIBE temporary_work_tasks');
      console.log('临时工作表列:', tempResult.map(row => row.Field).join(', '));
    } catch(err) {
      console.log('临时工作表不存在或查询出错:', err.message);
    }
    
    // 检查常规工作表
    console.log('\n检查常规工作表结构...');
    try {
      const [regularResult] = await pool.query('DESCRIBE regular_work_tasks');
      console.log('常规工作表列:', regularResult.map(row => row.Field).join(', '));
    } catch(err) {
      console.log('常规工作表不存在或查询出错:', err.message);
    }
    
    // 检查视图
    console.log('\n检查日常工作计划视图...');
    try {
      const [viewResult] = await pool.query('SHOW CREATE VIEW daily_work_plan');
      console.log('视图存在');
    } catch(err) {
      console.log('日常工作计划视图不存在或查询出错:', err.message);
    }
    
    pool.end();
  } catch (err) {
    console.error('检查表结构出错:', err);
  }
}

checkTables(); 
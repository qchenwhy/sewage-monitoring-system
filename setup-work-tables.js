/**
 * 设置工作计划和记录相关的数据库表
 */
const mysql = require('mysql2/promise');

async function setupWorkTables() {
  let connection;

  try {
    // 创建数据库连接
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '753456Chen*',
      database: process.env.DB_NAME || 'mqtt_data'
    });
    
    console.log('数据库连接成功');
    
    // 创建临时工作任务表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS temporary_work_tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        scheduled_date DATE NOT NULL,
        start_time TIME NOT NULL,
        duration INT DEFAULT 60,
        status ENUM('pending', 'completed', 'cancelled') DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_date (scheduled_date),
        INDEX idx_status (status)
      )
    `);
    console.log('临时工作任务表已创建或已存在');
    
    // 创建工作记录表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS work_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('工作记录表已创建或已存在');
    
    // 添加测试数据
    const [existingTasks] = await connection.query('SELECT COUNT(*) as count FROM temporary_work_tasks');
    
    if (existingTasks[0].count === 0) {
      // 添加一些测试数据
      await connection.query(`
        INSERT INTO temporary_work_tasks 
        (title, description, scheduled_date, start_time, duration, status) 
        VALUES 
        ('检查生产线运行状态', '检查所有生产线的运行状态并记录', CURDATE(), '09:00:00', 60, 'pending'),
        ('设备维护保养', '对主要设备进行日常维护和保养', CURDATE(), '14:00:00', 120, 'pending'),
        ('数据备份', '备份系统数据和日志', DATE_ADD(CURDATE(), INTERVAL 1 DAY), '10:00:00', 45, 'pending')
      `);
      console.log('已添加测试任务数据');
    } else {
      console.log('已存在任务数据，跳过添加测试数据');
    }
    
    console.log('数据库表设置完成');
  } catch (error) {
    console.error('设置数据库表时出错:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('数据库连接已关闭');
    }
  }
}

// 执行设置
setupWorkTables()
  .then(() => {
    console.log('工作计划相关表设置完成');
    process.exit(0);
  })
  .catch(err => {
    console.error('设置工作计划相关表失败:', err);
    process.exit(1);
  }); 
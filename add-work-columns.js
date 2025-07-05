/**
 * 强制添加工作内容相关字段到modbus_data_latest表
 */
const mysql = require('mysql2/promise');

async function addWorkColumns() {
  let connection = null;
  
  try {
    // 创建数据库连接
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '753456Chen*',
      database: process.env.DB_NAME || 'mqtt_data'
    });
    
    console.log('数据库连接成功');
    
    // 检查表是否存在
    const [tables] = await connection.query(`
      SHOW TABLES LIKE 'modbus_data_latest'
    `);
    
    if (tables.length === 0) {
      console.error('modbus_data_latest表不存在，请先创建表');
      return false;
    }
    
    console.log('modbus_data_latest表存在，开始添加工作内容相关字段...');
    
    // 添加work_content字段
    try {
      await connection.execute(`
        ALTER TABLE modbus_data_latest 
        ADD COLUMN IF NOT EXISTS work_content TEXT NULL AFTER data_type
      `);
      console.log('work_content字段添加成功');
    } catch (error) {
      console.error('添加work_content字段失败:', error.message);
      // 尝试使用不同的语法
      try {
        const [columns] = await connection.query(`SHOW COLUMNS FROM modbus_data_latest LIKE 'work_content'`);
        if (columns.length === 0) {
          await connection.execute(`
            ALTER TABLE modbus_data_latest 
            ADD COLUMN work_content TEXT NULL AFTER data_type
          `);
          console.log('work_content字段添加成功（使用备选方法）');
        } else {
          console.log('work_content字段已存在，跳过');
        }
      } catch (fallbackError) {
        console.error('备选方法添加work_content字段失败:', fallbackError.message);
      }
    }
    
    // 添加work_type字段
    try {
      await connection.execute(`
        ALTER TABLE modbus_data_latest 
        ADD COLUMN IF NOT EXISTS work_type ENUM('regular', 'temporary', 'none') DEFAULT 'none' AFTER work_content
      `);
      console.log('work_type字段添加成功');
    } catch (error) {
      console.error('添加work_type字段失败:', error.message);
      // 尝试使用不同的语法
      try {
        const [columns] = await connection.query(`SHOW COLUMNS FROM modbus_data_latest LIKE 'work_type'`);
        if (columns.length === 0) {
          await connection.execute(`
            ALTER TABLE modbus_data_latest 
            ADD COLUMN work_type ENUM('regular', 'temporary', 'none') DEFAULT 'none' AFTER work_content
          `);
          console.log('work_type字段添加成功（使用备选方法）');
        } else {
          console.log('work_type字段已存在，跳过');
        }
      } catch (fallbackError) {
        console.error('备选方法添加work_type字段失败:', fallbackError.message);
      }
    }
    
    // 添加work_status字段
    try {
      await connection.execute(`
        ALTER TABLE modbus_data_latest 
        ADD COLUMN IF NOT EXISTS work_status ENUM('pending', 'completed', 'cancelled') DEFAULT 'pending' AFTER work_type
      `);
      console.log('work_status字段添加成功');
    } catch (error) {
      console.error('添加work_status字段失败:', error.message);
      // 尝试使用不同的语法
      try {
        const [columns] = await connection.query(`SHOW COLUMNS FROM modbus_data_latest LIKE 'work_status'`);
        if (columns.length === 0) {
          await connection.execute(`
            ALTER TABLE modbus_data_latest 
            ADD COLUMN work_status ENUM('pending', 'completed', 'cancelled') DEFAULT 'pending' AFTER work_type
          `);
          console.log('work_status字段添加成功（使用备选方法）');
        } else {
          console.log('work_status字段已存在，跳过');
        }
      } catch (fallbackError) {
        console.error('备选方法添加work_status字段失败:', fallbackError.message);
      }
    }
    
    // 添加task_id字段
    try {
      await connection.execute(`
        ALTER TABLE modbus_data_latest 
        ADD COLUMN IF NOT EXISTS task_id INT NULL AFTER work_status
      `);
      console.log('task_id字段添加成功');
    } catch (error) {
      console.error('添加task_id字段失败:', error.message);
      // 尝试使用不同的语法
      try {
        const [columns] = await connection.query(`SHOW COLUMNS FROM modbus_data_latest LIKE 'task_id'`);
        if (columns.length === 0) {
          await connection.execute(`
            ALTER TABLE modbus_data_latest 
            ADD COLUMN task_id INT NULL AFTER work_status
          `);
          console.log('task_id字段添加成功（使用备选方法）');
        } else {
          console.log('task_id字段已存在，跳过');
        }
      } catch (fallbackError) {
        console.error('备选方法添加task_id字段失败:', fallbackError.message);
      }
    }
    
    console.log('字段添加操作完成，检查添加结果...');
    
    // 检查字段是否添加成功
    const [columns] = await connection.query(`DESCRIBE modbus_data_latest`);
    const columnNames = columns.map(col => col.Field);
    
    console.log('当前表的所有字段:', columnNames.join(', '));
    console.log('工作内容相关字段检查:');
    console.log('- work_content:', columnNames.includes('work_content') ? '已添加' : '未添加');
    console.log('- work_type:', columnNames.includes('work_type') ? '已添加' : '未添加');
    console.log('- work_status:', columnNames.includes('work_status') ? '已添加' : '未添加');
    console.log('- task_id:', columnNames.includes('task_id') ? '已添加' : '未添加');
    
    return true;
  } catch (error) {
    console.error('操作失败:', error);
    return false;
  } finally {
    if (connection) {
      await connection.end();
      console.log('数据库连接已关闭');
    }
  }
}

// 执行添加字段操作
addWorkColumns()
  .then(result => {
    console.log('操作结果:', result ? '成功' : '失败');
    process.exit(result ? 0 : 1);
  })
  .catch(err => {
    console.error('操作异常:', err);
    process.exit(1);
  }); 
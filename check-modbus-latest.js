const mysql = require('mysql2/promise');

async function checkModbusLatestTable() {
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
    
    console.log('检查modbus_data_latest表结构...');
    try {
      const [columns] = await pool.query('DESCRIBE modbus_data_latest');
      console.log('modbus_data_latest表列:');
      columns.forEach(col => {
        console.log(`${col.Field}: ${col.Type} ${col.Null === 'YES' ? '可为空' : '不可为空'} ${col.Default ? `默认值=${col.Default}` : '无默认值'}`);
      });
      
      // 检查工作内容相关列是否存在
      const hasWorkContent = columns.some(col => col.Field === 'work_content');
      const hasWorkType = columns.some(col => col.Field === 'work_type');
      const hasWorkStatus = columns.some(col => col.Field === 'work_status');
      const hasTaskId = columns.some(col => col.Field === 'task_id');
      
      console.log('\n工作内容字段检查结果:');
      console.log(`work_content: ${hasWorkContent ? '存在' : '不存在'}`);
      console.log(`work_type: ${hasWorkType ? '存在' : '不存在'}`);
      console.log(`work_status: ${hasWorkStatus ? '存在' : '不存在'}`);
      console.log(`task_id: ${hasTaskId ? '存在' : '不存在'}`);
    } catch(err) {
      console.log('modbus_data_latest表不存在或查询出错:', err.message);
    }
    
    // 关闭连接池
    await pool.end();
  } catch (err) {
    console.error('检查表结构出错:', err);
  }
}

checkModbusLatestTable(); 
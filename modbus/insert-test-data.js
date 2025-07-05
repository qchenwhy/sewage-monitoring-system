/**
 * Modbus 测试数据插入工具
 * 
 * 向数据库中插入测试数据，用于验证数据获取API
 */

const mysql = require('mysql2/promise');

// 数据库配置 - 与应用程序中使用的相同配置
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '753456Chen*',  // 注意：实际应用中应从环境变量或配置文件获取
  database: 'mqtt_data',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0
};

console.log('========================================');
console.log('   Modbus 测试数据插入工具');
console.log('========================================');

// 测试数据点
const testDataPoints = [
  {
    id: 'test1',
    identifier: 'TEST_DP1',
    name: '测试数据点1',
    format: 'INT16',
    value: 42,
    formatted_value: '42 °C',
    quality: 'GOOD'
  },
  {
    id: 'test2',
    identifier: 'TEST_DP2',
    name: '测试数据点2',
    format: 'FLOAT32',
    value: 3.14159,
    formatted_value: '3.14 V',
    quality: 'GOOD'
  },
  {
    id: 'test3',
    identifier: 'TEST_DP3',
    name: '测试数据点3',
    format: 'UINT16',
    value: 65000,
    formatted_value: '65000 rpm',
    quality: 'UNCERTAIN'
  }
];

// 插入测试数据
async function insertTestData() {
  console.log('尝试连接到数据库...');
  let connection;
  
  try {
    // 创建数据库连接
    connection = await mysql.createConnection(dbConfig);
    
    console.log('连接成功，准备插入测试数据...');
    
    // 确保表存在
    console.log('检查并创建表结构...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS modbus_data_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        data_point_id VARCHAR(255) NOT NULL,
        data_point_identifier VARCHAR(255) NOT NULL,
        data_point_name VARCHAR(255) NOT NULL,
        raw_value JSON NULL,
        value FLOAT NULL,
        formatted_value VARCHAR(255) NULL,
        quality VARCHAR(50) DEFAULT 'GOOD',
        read_time_ms INT DEFAULT 0,
        data_type VARCHAR(50) NULL,
        timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_identifier (data_point_identifier),
        INDEX idx_timestamp (timestamp)
      )
    `);
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS modbus_data_latest (
        id INT AUTO_INCREMENT PRIMARY KEY,
        data_point_id VARCHAR(255) NOT NULL UNIQUE,
        data_point_identifier VARCHAR(255) NOT NULL UNIQUE,
        data_point_name VARCHAR(255) NOT NULL,
        raw_value JSON NULL,
        value FLOAT NULL,
        formatted_value VARCHAR(255) NULL,
        quality VARCHAR(50) DEFAULT 'GOOD',
        data_type VARCHAR(50) NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE INDEX idx_identifier (data_point_identifier)
      )
    `);
    
    // 清除现有测试数据
    console.log('清除现有测试数据...');
    await connection.query('DELETE FROM modbus_data_latest WHERE data_point_id LIKE "test%"');
    
    // 插入最新值记录
    console.log('插入最新值测试数据...');
    for (const dp of testDataPoints) {
      const query = `
        INSERT INTO modbus_data_latest 
        (data_point_id, data_point_identifier, data_point_name, raw_value, value, formatted_value, quality, data_type) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
        data_point_name = VALUES(data_point_name),
        raw_value = VALUES(raw_value),
        value = VALUES(value),
        formatted_value = VALUES(formatted_value),
        quality = VALUES(quality),
        data_type = VALUES(data_type),
        updated_at = NOW()
      `;
      
      await connection.query(query, [
        dp.id,
        dp.identifier,
        dp.name,
        JSON.stringify({value: dp.value}),
        dp.value,
        dp.formatted_value,
        dp.quality,
        dp.format
      ]);
    }
    
    // 插入一些历史记录
    console.log('插入历史数据测试记录...');
    for (const dp of testDataPoints) {
      // 为每个数据点创建24小时内的5条历史记录
      const now = new Date();
      for (let i = 0; i < 5; i++) {
        const timestamp = new Date(now.getTime() - i * 3600000); // 每小时一条记录
        const value = dp.value + (Math.random() * 10 - 5); // 随机波动值
        
        const query = `
          INSERT INTO modbus_data_history 
          (data_point_id, data_point_identifier, data_point_name, raw_value, value, formatted_value, quality, data_type, timestamp) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        await connection.query(query, [
          dp.id,
          dp.identifier,
          dp.name,
          JSON.stringify({value: value}),
          value,
          `${value.toFixed(2)} ${dp.formatted_value.split(' ')[1]}`,
          dp.quality,
          dp.format,
          timestamp
        ]);
      }
    }
    
    console.log('测试数据插入成功！');
    
    // 查询并显示插入的最新值数据
    console.log('\n最新值表中的测试数据:');
    const [latestRows] = await connection.query('SELECT * FROM modbus_data_latest WHERE data_point_id LIKE "test%"');
    console.table(latestRows.map(row => ({
      id: row.id,
      data_point_id: row.data_point_id,
      identifier: row.data_point_identifier,
      name: row.data_point_name,
      value: row.value,
      formatted: row.formatted_value,
      quality: row.quality,
      updated_at: row.updated_at
    })));
    
    // 查询并显示插入的历史数据
    console.log('\n历史数据表中的测试数据 (仅显示每个数据点的最新记录):');
    const [historyRows] = await connection.query(`
      SELECT a.* 
      FROM modbus_data_history a
      INNER JOIN (
        SELECT data_point_id, MAX(timestamp) as max_timestamp
        FROM modbus_data_history
        WHERE data_point_id LIKE "test%"
        GROUP BY data_point_id
      ) b ON a.data_point_id = b.data_point_id AND a.timestamp = b.max_timestamp
    `);
    
    console.table(historyRows.map(row => ({
      id: row.id,
      data_point_id: row.data_point_id,
      value: row.value,
      formatted: row.formatted_value,
      quality: row.quality,
      timestamp: row.timestamp
    })));
    
    console.log('\n现在可以测试以下API路由:');
    console.log('- GET /api/modbus/values/latest');
    console.log('- GET /api/modbus/latest-values');
    console.log('- GET /api/modbus/values/history?identifier=TEST_DP1&startTime=<24小时前>&endTime=<现在>');
    console.log('- GET /api/modbus/history/TEST_DP1?startTime=<24小时前>&endTime=<现在>');
    
  } catch (error) {
    console.error('插入测试数据时出错:', error);
  } finally {
    if (connection) {
      try {
        console.log('关闭数据库连接...');
        await connection.end();
      } catch (err) {
        console.error('关闭数据库连接失败:', err);
      }
    }
  }
}

// 运行插入
insertTestData().catch(console.error); 
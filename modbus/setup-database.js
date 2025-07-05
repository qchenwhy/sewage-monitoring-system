/**
 * 设置Modbus数据库表和测试数据
 */

const mysql = require('mysql2/promise');

// 优先加载项目的数据库配置
let dbConfig;
try {
  dbConfig = require('./db-config');
  console.log('已加载数据库配置文件');
} catch (err) {
  console.error('无法加载数据库配置文件:', err.message);
  process.exit(1);
}

// 创建modbus_data_latest表的SQL
const createTableSQL = `
CREATE TABLE IF NOT EXISTS modbus_data_latest (
  id INT AUTO_INCREMENT PRIMARY KEY,
  data_point_id VARCHAR(50) NOT NULL,
  data_point_identifier VARCHAR(100) NOT NULL,
  data_point_name VARCHAR(255) NOT NULL,
  value DOUBLE DEFAULT 0,
  formatted_value VARCHAR(100),
  quality VARCHAR(50) DEFAULT 'GOOD',
  data_type VARCHAR(50) DEFAULT 'FLOAT',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_data_point (data_point_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

// 插入测试数据的SQL
const insertTestDataSQL = `
INSERT INTO modbus_data_latest 
  (data_point_id, data_point_identifier, data_point_name, value, formatted_value, quality, data_type)
VALUES
  (?, ?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE
  value = VALUES(value),
  formatted_value = VALUES(formatted_value),
  quality = VALUES(quality),
  updated_at = CURRENT_TIMESTAMP;
`;

// 测试数据
const testDataPoints = [
  {
    id: 'DP001',
    identifier: 'temperature_sensor_1',
    name: '温度传感器1',
    value: 25.8,
    formatted: '25.8°C',
    quality: 'GOOD',
    type: 'FLOAT'
  },
  {
    id: 'DP002',
    identifier: 'humidity_sensor_1',
    name: '湿度传感器1',
    value: 65.2,
    formatted: '65.2%',
    quality: 'GOOD',
    type: 'FLOAT'
  },
  {
    id: 'DP003',
    identifier: 'pressure_sensor_1',
    name: '压力传感器1',
    value: 101.3,
    formatted: '101.3kPa',
    quality: 'GOOD',
    type: 'FLOAT'
  },
  {
    id: 'DP004',
    identifier: 'switch_status_1',
    name: '开关状态1',
    value: 1,
    formatted: '开启',
    quality: 'GOOD',
    type: 'BOOLEAN'
  },
  {
    id: 'DP005',
    identifier: 'counter_1',
    name: '计数器1',
    value: 1587,
    formatted: '1587',
    quality: 'GOOD',
    type: 'INT'
  }
];

// 主函数
async function setupDatabase() {
  console.log('==========================================');
  console.log('开始设置Modbus数据库...');
  
  let connection;
  try {
    // 使用配置文件中提供的方法获取连接
    connection = await dbConfig.getConnection();
    
    console.log(`已连接到数据库 ${dbConfig.getDatabaseName()}`);
    
    // 创建表
    await connection.query(createTableSQL);
    console.log('modbus_data_latest表已创建/确认存在');
    
    // 插入测试数据
    for (const dataPoint of testDataPoints) {
      await connection.query(insertTestDataSQL, [
        dataPoint.id,
        dataPoint.identifier,
        dataPoint.name,
        dataPoint.value,
        dataPoint.formatted,
        dataPoint.quality,
        dataPoint.type
      ]);
      console.log(`已插入/更新数据点: ${dataPoint.name}`);
    }
    
    console.log('测试数据已成功添加到数据库');
    console.log('Modbus数据库设置完成');
    
  } catch (error) {
    console.error('设置数据库失败:', error);
  } finally {
    // 关闭数据库连接
    if (connection) {
      await connection.end();
      console.log('数据库连接已关闭');
    }
    console.log('==========================================');
  }
}

// 直接执行
if (require.main === module) {
  setupDatabase()
    .then(() => console.log('数据库设置脚本执行完成'))
    .catch(err => console.error('数据库设置脚本执行失败:', err));
}

module.exports = {
  setupDatabase
}; 
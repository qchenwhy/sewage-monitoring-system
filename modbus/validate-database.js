/**
 * Modbus数据库验证和迁移工具
 * 
 * 此脚本检查数据库结构，确保所有必需的表和列存在
 * 如果发现缺少表或列，将自动创建它们
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// 数据库配置
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '753456Chen*',  // 应该从环境变量或配置文件中获取密码
  database: 'mqtt_data',     // 数据库名称
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0
};

// SQL文件路径
const sqlFilePath = path.join(__dirname, '..', 'data', 'modbus_history.sql');

async function validateDatabase() {
  // 记录开始
  console.log('====== Modbus 数据库验证工具 ======');
  console.log('开始验证数据库结构...');
  
  let connection;
  try {
    // 创建数据库连接
    console.log('正在连接到数据库...');
    connection = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password
    });
    
    // 检查数据库是否存在
    console.log(`检查数据库 ${dbConfig.database} 是否存在...`);
    const [databases] = await connection.query(
      'SHOW DATABASES LIKE ?', 
      [dbConfig.database]
    );
    
    if (databases.length === 0) {
      console.log(`数据库 ${dbConfig.database} 不存在，正在创建...`);
      await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database}`);
      console.log(`数据库 ${dbConfig.database} 创建成功`);
    } else {
      console.log(`数据库 ${dbConfig.database} 已存在`);
    }
    
    // 切换到指定数据库
    await connection.query(`USE ${dbConfig.database}`);
    
    // 检查必需的表是否存在
    console.log('检查必需的表是否存在...');
    const [tables] = await connection.query('SHOW TABLES');
    
    const tableList = tables.map(row => Object.values(row)[0]);
    console.log('现有表:', tableList.join(', ') || '无');
    
    const requiredTables = ['modbus_data_history', 'modbus_data_latest'];
    const missingTables = requiredTables.filter(table => !tableList.includes(table));
    
    if (missingTables.length > 0) {
      console.log('缺少必需的表:', missingTables.join(', '));
      
      // 如果SQL文件存在，执行SQL文件创建表
      if (fs.existsSync(sqlFilePath)) {
        console.log('找到SQL文件，正在执行...');
        const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
        const sqlStatements = sqlContent.split(';')
          .map(statement => statement.trim())
          .filter(statement => statement.length > 0);
        
        for (const sql of sqlStatements) {
          await connection.query(sql);
        }
        
        console.log('SQL文件执行成功，表已创建');
      } else {
        console.log('SQL文件不存在，正在手动创建表...');
        
        // 创建历史数据表
        if (!tableList.includes('modbus_data_history')) {
          await connection.query(`
            CREATE TABLE modbus_data_history (
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
          console.log('历史数据表 modbus_data_history 创建成功');
        }
        
        // 创建最新值表
        if (!tableList.includes('modbus_data_latest')) {
          await connection.query(`
            CREATE TABLE modbus_data_latest (
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
          console.log('最新值表 modbus_data_latest 创建成功');
        }
      }
    } else {
      console.log('所有必需的表都已存在');
    }
    
    // 验证表结构
    console.log('验证表结构...');
    for (const table of requiredTables) {
      if (tableList.includes(table)) {
        const [columns] = await connection.query(`SHOW COLUMNS FROM ${table}`);
        const columnNames = columns.map(column => column.Field);
        
        console.log(`表 ${table} 的列:`, columnNames.join(', '));
        
        // 检查是否有必需的列
        const requiredColumns = [
          'data_point_id', 'data_point_identifier', 'data_point_name',
          'raw_value', 'value', 'formatted_value', 'quality'
        ];
        
        const missingColumns = requiredColumns.filter(column => !columnNames.includes(column));
        
        if (missingColumns.length > 0) {
          console.warn(`表 ${table} 缺少必需的列:`, missingColumns.join(', '));
          console.warn('需要手动添加这些列或重新创建表');
        } else {
          console.log(`表 ${table} 的结构符合要求`);
        }
      }
    }
    
    // 检查 JSON 列是否可用
    console.log('检查JSON数据类型支持...');
    try {
      await connection.query(`
        INSERT INTO modbus_data_history 
        (data_point_id, data_point_identifier, data_point_name, raw_value, value, formatted_value, quality) 
        VALUES ('test_id', 'test_identifier', 'Test Point', '{"test": true}', 1.23, '1.23 V', 'GOOD')
      `);
      
      // 删除测试数据
      await connection.query(`
        DELETE FROM modbus_data_history 
        WHERE data_point_id = 'test_id' AND data_point_identifier = 'test_identifier'
      `);
      
      console.log('JSON数据类型测试成功');
    } catch (error) {
      console.error('JSON数据类型测试失败:', error.message);
      console.warn('您的MySQL版本可能不支持JSON数据类型，请考虑升级到MySQL 5.7.8+');
    }
    
    console.log('====== 数据库验证完成 ======');
    console.log('数据库结构验证和迁移已完成');
    
  } catch (error) {
    console.error('数据库验证过程中发生错误:', error);
  } finally {
    // 关闭连接
    if (connection) {
      try {
        await connection.end();
        console.log('数据库连接已关闭');
      } catch (err) {
        console.error('关闭数据库连接时出错:', err);
      }
    }
  }
}

// 如果直接运行此脚本，执行验证
if (require.main === module) {
  validateDatabase().catch(console.error);
} else {
  // 作为模块导出
  module.exports = { validateDatabase };
} 
/**
 * Modbus 数据迁移工具
 * 
 * 此脚本将旧的 JSON 格式存储的数据迁移到 MySQL 数据库
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { validateDatabase } = require('./validate-database');

// 数据库配置
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '753456Chen*',  // 应该从环境变量或配置文件中获取密码
  database: 'mqtt_data',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0
};

// 旧数据文件路径
const oldDataFilePath = path.join(__dirname, '..', 'data', 'values.json');

async function migrateData() {
  console.log('====== Modbus 数据迁移工具 ======');
  
  // 首先确保数据库结构正确
  console.log('确保数据库结构正确...');
  await validateDatabase();
  
  // 检查旧数据文件是否存在
  if (!fs.existsSync(oldDataFilePath)) {
    console.error(`旧数据文件不存在: ${oldDataFilePath}`);
    console.log('没有数据需要迁移');
    return;
  }
  
  console.log(`找到旧数据文件: ${oldDataFilePath}`);
  
  // 读取旧数据文件
  let oldData;
  try {
    const fileContent = fs.readFileSync(oldDataFilePath, 'utf8');
    oldData = JSON.parse(fileContent);
    console.log(`成功读取旧数据文件，共有 ${oldData.length} 条记录`);
  } catch (error) {
    console.error('读取或解析旧数据文件失败:', error);
    return;
  }
  
  // 建立数据库连接
  console.log('连接到数据库...');
  let connection;
  try {
    connection = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database
    });
    
    console.log('数据库连接成功');
  } catch (error) {
    console.error('连接到数据库失败:', error);
    return;
  }
  
  try {
    // 准备批量插入历史数据
    console.log('开始迁移数据到历史表...');
    
    // 为了处理大量数据，将数据分批处理
    const batchSize = 100;
    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;
    
    // 获取每个数据点的最新值（用于填充最新值表）
    const latestValues = new Map();
    
    // 按批次处理数据
    for (let i = 0; i < oldData.length; i += batchSize) {
      const batch = oldData.slice(i, i + batchSize);
      
      // 构建SQL语句
      const placeHolders = batch.map(() => 
        '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).join(', ');
      
      const query = `
        INSERT INTO modbus_data_history
        (data_point_id, data_point_identifier, data_point_name, raw_value, value, 
         formatted_value, quality, read_time_ms, data_type, timestamp) 
        VALUES ${placeHolders}
      `;
      
      // 准备参数
      const params = [];
      
      for (const record of batch) {
        // 从老数据格式中提取必要的信息
        const identifier = record.identifier;
        const value = record.value;
        const timestamp = record.timestamp ? new Date(record.timestamp) : new Date();
        
        // 加入参数列表
        params.push(
          identifier,                     // data_point_id
          identifier,                     // data_point_identifier
          identifier,                     // data_point_name (可以后面更新)
          JSON.stringify({value}),        // raw_value
          typeof value === 'number' ? value : null,  // value
          String(value) + (record.unit ? ' ' + record.unit : ''),  // formatted_value
          record.quality || 'GOOD',       // quality
          0,                              // read_time_ms
          typeof value === 'number' ? 'FLOAT32' : 'STRING',  // data_type
          timestamp                       // timestamp
        );
        
        // 更新最新值映射
        if (!latestValues.has(identifier) || new Date(latestValues.get(identifier).timestamp) < timestamp) {
          latestValues.set(identifier, record);
        }
      }
      
      // 执行批量插入
      try {
        await connection.query(query, params);
        successCount += batch.length;
      } catch (error) {
        console.error(`插入批次 ${i / batchSize + 1} 失败:`, error);
        errorCount += batch.length;
      }
      
      processedCount += batch.length;
      
      // 显示进度
      console.log(`已处理: ${processedCount}/${oldData.length} 条记录 (${Math.round(processedCount / oldData.length * 100)}%)`);
    }
    
    console.log('历史数据迁移完成');
    console.log(`成功: ${successCount} 条记录, 失败: ${errorCount} 条记录`);
    
    // 插入最新值表
    console.log('开始迁移数据到最新值表...');
    
    // 清空最新值表
    await connection.query('TRUNCATE TABLE modbus_data_latest');
    
    // 逐条插入最新值表
    let latestSuccessCount = 0;
    let latestErrorCount = 0;
    
    for (const [identifier, record] of latestValues.entries()) {
      const value = record.value;
      
      try {
        await connection.query(`
          INSERT INTO modbus_data_latest
          (data_point_id, data_point_identifier, data_point_name, raw_value, value, 
           formatted_value, quality, data_type) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          identifier,                     // data_point_id
          identifier,                     // data_point_identifier
          identifier,                     // data_point_name
          JSON.stringify({value}),        // raw_value
          typeof value === 'number' ? value : null,  // value
          String(value) + (record.unit ? ' ' + record.unit : ''),  // formatted_value
          record.quality || 'GOOD',       // quality
          typeof value === 'number' ? 'FLOAT32' : 'STRING'  // data_type
        ]);
        
        latestSuccessCount++;
      } catch (error) {
        console.error(`插入最新值 ${identifier} 失败:`, error);
        latestErrorCount++;
      }
    }
    
    console.log('最新值数据迁移完成');
    console.log(`成功: ${latestSuccessCount} 条记录, 失败: ${latestErrorCount} 条记录`);
    
    // 备份旧数据文件
    const backupPath = oldDataFilePath + '.bak';
    fs.copyFileSync(oldDataFilePath, backupPath);
    console.log(`已备份旧数据文件到: ${backupPath}`);
    
    console.log('====== 数据迁移完成 ======');
    console.log('您现在可以使用MySQL数据库来存储和查询Modbus数据');
    
  } catch (error) {
    console.error('数据迁移过程中发生错误:', error);
  } finally {
    // 关闭数据库连接
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

// 如果直接运行此脚本，执行迁移
if (require.main === module) {
  migrateData().catch(console.error);
} else {
  // 作为模块导出
  module.exports = { migrateData };
} 
/**
 * Modbus 数据库配置文件
 * 
 * 统一管理数据库连接配置，供所有模块使用
 */

// 环境变量支持
const getEnv = (key, defaultValue) => {
  return process.env[key] || defaultValue;
};

// 数据库配置
const dbConfig = {
  host: getEnv('DB_HOST', 'localhost'),
  user: getEnv('DB_USER', 'root'),
  password: getEnv('DB_PASSWORD', '753456Chen*'),  // 生产环境中建议使用环境变量
  database: getEnv('DB_NAME', 'mqtt_data'),
  waitForConnections: true,
  connectionLimit: parseInt(getEnv('DB_CONNECTION_LIMIT', '10')),
  queueLimit: 0
};

// 创建连接池工厂函数
const createConnectionPool = async (mysql) => {
  if (!mysql) {
    try {
      mysql = require('mysql2/promise');
    } catch (error) {
      throw new Error('无法加载 mysql2/promise 模块，请确保已安装: npm install mysql2');
    }
  }
  
  // 创建连接池
  const pool = mysql.createPool(dbConfig);
  
  // 测试连接
  try {
    const [result] = await pool.query('SELECT 1 as test');
    if (result[0].test === 1) {
      console.log('✓ 数据库连接成功');
      return pool;
    } else {
      throw new Error('数据库连接测试失败');
    }
  } catch (error) {
    console.error('数据库连接失败:', error.message);
    throw error;
  }
};

// 导出配置和工具函数
module.exports = {
  dbConfig,
  createConnectionPool,
  // 提供直接获取连接的便捷函数
  getConnection: async () => {
    const mysql = require('mysql2/promise');
    return await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database
    });
  },
  // 获取数据库名称
  getDatabaseName: () => dbConfig.database
}; 
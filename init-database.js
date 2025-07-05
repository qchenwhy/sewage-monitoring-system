/**
 * 统一数据库初始化脚本
 * 
 * 该脚本会检查并创建项目中所有需要的表格
 * 根据现有表格结构，自动初始化缺失的表格
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// 环境变量支持
const getEnv = (key, defaultValue) => {
  return process.env[key] || defaultValue;
};

// 数据库配置
const dbConfig = {
  host: getEnv('DB_HOST', 'localhost'),
  user: getEnv('DB_USER', 'root'),
  password: getEnv('DB_PASSWORD', '753456Chen*'),
  database: getEnv('DB_NAME', 'mqtt_data'),
  waitForConnections: true,
  connectionLimit: parseInt(getEnv('DB_CONNECTION_LIMIT', '10')),
  queueLimit: 0
};

// 所有表格的定义
const tableDefinitions = {
  // 1. Modbus数据相关表
  modbus_data_history: `
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
      change_description VARCHAR(255) NULL,
      timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_identifier (data_point_identifier),
      INDEX idx_timestamp (timestamp)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Modbus数据历史记录表'
  `,
  
  modbus_data_latest: `
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
      unit VARCHAR(50) NULL COMMENT '数据点单位',
      description TEXT NULL COMMENT '数据点描述',
      work_content TEXT NULL,
      work_type ENUM('regular', 'temporary', 'none') DEFAULT 'none',
      work_status ENUM('pending', 'completed', 'cancelled') DEFAULT 'pending',
      task_id INT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE INDEX idx_identifier (data_point_identifier)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Modbus数据点最新值表'
  `,

  // 2. 工作任务相关表
  regular_work_tasks: `
    CREATE TABLE IF NOT EXISTS regular_work_tasks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL COMMENT '工作标题',
      description TEXT COMMENT '工作描述',
      cycle_type ENUM('daily', 'weekly', 'monthly', 'custom') NOT NULL COMMENT '周期类型：每日、每周、每月、自定义',
      cycle_value VARCHAR(100) COMMENT '周期值，如weekly时可为1-7表示周一到周日，monthly时可为1-31',
      weekday_mask INT DEFAULT 127,
      start_time TIME COMMENT '开始时间',
      duration INT DEFAULT 60 COMMENT '持续时间(分钟)',
      status ENUM('active', 'inactive') DEFAULT 'active' COMMENT '状态：活跃、非活跃',
      priority INT DEFAULT 0 COMMENT '优先级，数字越大优先级越高',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      INDEX idx_status (status),
      INDEX idx_cycle (cycle_type, cycle_value)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='常规工作内容表'
  `,

  temporary_work_tasks: `
    CREATE TABLE IF NOT EXISTS temporary_work_tasks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL COMMENT '工作标题',
      description TEXT COMMENT '工作描述',
      scheduled_date DATE NOT NULL COMMENT '工作日期',
      start_time TIME COMMENT '开始时间',
      duration INT DEFAULT 60 COMMENT '持续时间(分钟)',
      status ENUM('pending', 'in_progress', 'completed', 'cancelled') DEFAULT 'pending' COMMENT '状态：待处理、进行中、已完成、已取消',
      priority INT DEFAULT 0 COMMENT '优先级，数字越大优先级越高',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      INDEX idx_date (scheduled_date),
      INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='临时工作内容表'
  `,

  work_records: `
    CREATE TABLE IF NOT EXISTS work_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工作记录表'
  `,

  daily_work_plans: `
    CREATE TABLE IF NOT EXISTS daily_work_plans (
      id INT AUTO_INCREMENT PRIMARY KEY,
      data_point_id VARCHAR(255) NULL,
      data_point_identifier VARCHAR(255) NULL,
      data_point_name VARCHAR(255) NULL,
      work_content TEXT NOT NULL,
      work_type ENUM('regular', 'temporary') NOT NULL,
      work_status ENUM('pending', 'completed', 'cancelled') DEFAULT 'pending',
      task_id INT NOT NULL,
      plan_date DATE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_date (plan_date),
      INDEX idx_status (work_status),
      INDEX idx_task (task_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='日常工作计划表'
  `,

  work_summaries: `
    CREATE TABLE IF NOT EXISTS work_summaries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      summary_date DATE NOT NULL,
      total_tasks INT NOT NULL DEFAULT 0,
      completed_tasks INT NOT NULL DEFAULT 0,
      pending_tasks INT NOT NULL DEFAULT 0,
      cancelled_tasks INT NOT NULL DEFAULT 0,
      task_details TEXT NULL,
      summary_content TEXT NULL,
      dify_response TEXT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_date (summary_date),
      UNIQUE KEY uk_date (summary_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工作总结表'
  `,

  // 3. 告警相关表
  modbus_alarms: `
    CREATE TABLE IF NOT EXISTS modbus_alarms (
      id INT AUTO_INCREMENT PRIMARY KEY,
      alarm_identifier VARCHAR(255) NOT NULL,
      alarm_content VARCHAR(255) NOT NULL,
      triggered_time DATETIME NOT NULL,
      cleared_time DATETIME NULL,
      status ENUM('active', 'cleared') DEFAULT 'active' COMMENT '告警状态',
      data_point_id VARCHAR(255) NULL,
      data_point_name VARCHAR(255) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_identifier (alarm_identifier),
      INDEX idx_status (status),
      INDEX idx_time (triggered_time, cleared_time)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Modbus告警记录表'
  `,

  // 4. 报告相关表
  modbus_daily_reports: `
    CREATE TABLE IF NOT EXISTS modbus_daily_reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      report_date DATE NOT NULL COMMENT '报告日期',
      report_type ENUM('daily', 'weekly', 'monthly') DEFAULT 'daily' COMMENT '报告类型',
      generated_at DATETIME NOT NULL COMMENT '生成时间',
      report_content TEXT NOT NULL COMMENT '报告内容(文本)',
      raw_data JSON NOT NULL COMMENT '原始数据(JSON)',
      status ENUM('success', 'failed') DEFAULT 'success' COMMENT '生成状态',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_report_date (report_date),
      INDEX idx_report_type (report_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Modbus日报表'
  `,

  // 5. 计时器相关表
  timer_history: `
    CREATE TABLE IF NOT EXISTS timer_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      timer_id VARCHAR(255) NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      completed_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='计时器历史记录表'
  `,

  // 6. 数据模型表
  data_models: `
    CREATE TABLE IF NOT EXISTS data_models (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      identifier VARCHAR(255) NOT NULL UNIQUE,
      type ENUM('Float', 'Int', 'String', 'Boolean') NOT NULL DEFAULT 'Float',
      accessType ENUM('ReadWrite', 'ReadOnly', 'WriteOnly') NOT NULL DEFAULT 'ReadWrite',
      isStored ENUM('true', 'false') NOT NULL DEFAULT 'true',
      storageType ENUM('timed', 'change', 'immediate') DEFAULT 'timed',
      storageInterval INT DEFAULT 60,
      hasAlarm ENUM('true', 'false') NOT NULL DEFAULT 'false',
      alarmCondition ENUM('gt', 'lt', 'eq', 'neq') DEFAULT NULL,
      alarmValue VARCHAR(255) DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='数据模型表'
  `,

  // 7. 传感器数据表
  sensor_data: `
    CREATE TABLE IF NOT EXISTS sensor_data (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      value JSON NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='传感器数据表'
  `,

  // 8. 聊天相关表
  chat_history: `
    CREATE TABLE IF NOT EXISTS chat_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_message TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      ai_reply TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='对话历史表'
  `,

  prompt_templates: `
    CREATE TABLE IF NOT EXISTS prompt_templates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='提示词模板表'
  `
};

// 视图定义
const viewDefinitions = {
  daily_work_plan: `
    CREATE OR REPLACE VIEW daily_work_plan AS
    SELECT 
      'regular' AS task_type,
      r.id,
      r.title,
      r.description,
      r.start_time,
      r.duration,
      r.priority,
      CASE r.status
        WHEN 'active' THEN 'pending'
        ELSE 'cancelled'
      END AS status
    FROM 
      regular_work_tasks r
    WHERE 
      r.status = 'active' AND
      (
        (r.cycle_type = 'daily') OR
        (r.cycle_type = 'weekly' AND r.cycle_value = WEEKDAY(CURDATE()) + 1) OR
        (r.cycle_type = 'monthly' AND r.cycle_value = DAY(CURDATE())) OR
        (r.cycle_type = 'custom' AND FIND_IN_SET(DATE_FORMAT(CURDATE(), '%Y-%m-%d'), r.cycle_value) > 0)
      )
    UNION ALL
    SELECT 
      'temporary' AS task_type,
      t.id,
      t.title,
      t.description,
      t.start_time,
      t.duration,
      t.priority,
      t.status
    FROM 
      temporary_work_tasks t
    WHERE 
      t.scheduled_date = CURDATE() AND
      t.status != 'cancelled'
    ORDER BY 
      start_time ASC
  `
};

// 默认数据插入
const defaultData = {
  prompt_templates: [
    { name: '通用助手', content: '你是一个有用的助手，请用简洁明了的中文回答问题。' },
    { name: '代码专家', content: '你是一个编程专家，擅长解决各种编程问题。请提供详细的代码示例和解释。' },
    { name: '数据分析师', content: '你是一个数据分析专家，擅长解释数据趋势和提供数据分析建议。' }
  ],
  data_models: [
    { name: 'COD浓度值', identifier: 'CODPLC', type: 'Float', accessType: 'ReadWrite' },
    { name: '氨氮浓度值', identifier: 'NH3', type: 'Float', accessType: 'ReadWrite' },
    { name: '小时流量', identifier: 'XsLi', type: 'Float', accessType: 'ReadWrite' },
    { name: '日流量', identifier: 'DayLi', type: 'Float', accessType: 'ReadWrite' },
    { name: '周流量', identifier: 'WkLi', type: 'Float', accessType: 'ReadWrite' },
    { name: '硝化回流1号电流值', identifier: 'XhDi1', type: 'Float', accessType: 'ReadWrite' },
    { name: '硝化回流2号电流值', identifier: 'XhDi2', type: 'Float', accessType: 'ReadWrite' },
    { name: '调节池1号电流值', identifier: 'TjDi1', type: 'Float', accessType: 'ReadWrite' },
    { name: '调节池2号电流值', identifier: 'TjDi2', type: 'Float', accessType: 'ReadWrite' },
    { name: '污泥回流1号电流值', identifier: 'WhDi1', type: 'Float', accessType: 'ReadWrite' },
    { name: '污泥回流2号电流值', identifier: 'WhDi2', type: 'Float', accessType: 'ReadWrite' },
    { name: '潜水搅拌机电流值', identifier: 'QjDi', type: 'Float', accessType: 'ReadWrite' },
    { name: '调节池运行时间', identifier: 'TjYS', type: 'Int', accessType: 'ReadWrite' }
  ]
};

/**
 * 初始化数据库
 * @returns {Promise<boolean>} 初始化是否成功
 */
async function initializeDatabase() {
  let connection;
  
  console.log('='.repeat(60));
  console.log('📊 统一数据库初始化脚本');
  console.log('='.repeat(60));
  console.log(`数据库配置: ${dbConfig.user}@${dbConfig.host}/${dbConfig.database}`);
  console.log('');

  try {
    // 创建数据库连接（不指定数据库）
    console.log('🔗 连接MySQL服务器...');
    connection = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password
    });
    
    // 检查并创建数据库
    console.log(`📁 检查数据库 ${dbConfig.database} 是否存在...`);
    const [databases] = await connection.query(
      'SHOW DATABASES LIKE ?', 
      [dbConfig.database]
    );
    
    if (databases.length === 0) {
      console.log(`✨ 创建数据库 ${dbConfig.database}...`);
      await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      console.log(`✅ 数据库 ${dbConfig.database} 创建成功`);
    } else {
      console.log(`✅ 数据库 ${dbConfig.database} 已存在`);
    }
    
    // 切换到指定数据库
    await connection.query(`USE ${dbConfig.database}`);
    
    // 获取现有表列表
    console.log('\n📋 检查现有表...');
    const [tables] = await connection.query('SHOW TABLES');
    const existingTables = tables.map(row => Object.values(row)[0]);
    console.log(`已存在的表: ${existingTables.length > 0 ? existingTables.join(', ') : '无'}`);
    
    // 创建表
    console.log('\n🔨 创建缺失的表...');
    let createdTables = 0;
    let skippedTables = 0;
    
    for (const [tableName, tableSQL] of Object.entries(tableDefinitions)) {
      if (existingTables.includes(tableName)) {
        console.log(`⏭️  表 ${tableName} 已存在，跳过`);
        skippedTables++;
      } else {
        console.log(`🔧 创建表 ${tableName}...`);
        await connection.query(tableSQL);
        console.log(`✅ 表 ${tableName} 创建成功`);
        createdTables++;
      }
    }
    
    // 创建视图
    console.log('\n👁️  创建视图...');
    let createdViews = 0;
    
    for (const [viewName, viewSQL] of Object.entries(viewDefinitions)) {
      try {
        console.log(`🔧 创建视图 ${viewName}...`);
        await connection.query(viewSQL);
        console.log(`✅ 视图 ${viewName} 创建成功`);
        createdViews++;
      } catch (error) {
        if (error.code === 'ER_TABLE_EXISTS_ERROR') {
          console.log(`⏭️  视图 ${viewName} 已存在，跳过`);
        } else {
          console.error(`❌ 创建视图 ${viewName} 失败:`, error.message);
        }
      }
    }
    
    // 插入默认数据
    console.log('\n💾 插入默认数据...');
    
    for (const [tableName, dataArray] of Object.entries(defaultData)) {
      try {
        // 检查表是否有数据
        const [existingData] = await connection.query(`SELECT COUNT(*) as count FROM ${tableName}`);
        const count = existingData[0].count;
        
        if (count === 0) {
          console.log(`📝 向表 ${tableName} 插入默认数据...`);
          
          for (const data of dataArray) {
            const columns = Object.keys(data).join(', ');
            const values = Object.values(data);
            const placeholders = values.map(() => '?').join(', ');
            
            await connection.query(
              `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})`,
              values
            );
          }
          
          console.log(`✅ 表 ${tableName} 默认数据插入成功 (${dataArray.length} 条记录)`);
        } else {
          console.log(`⏭️  表 ${tableName} 已有数据 (${count} 条记录)，跳过默认数据插入`);
        }
      } catch (error) {
        console.error(`❌ 插入表 ${tableName} 默认数据失败:`, error.message);
      }
    }
    
    // 验证表结构
    console.log('\n🔍 验证表结构...');
    const totalTables = Object.keys(tableDefinitions).length;
    const [finalTables] = await connection.query('SHOW TABLES');
    const finalTableCount = finalTables.length;
    
    console.log(`\n📊 初始化统计:`);
    console.log(`   • 预期表数量: ${totalTables}`);
    console.log(`   • 实际表数量: ${finalTableCount}`);
    console.log(`   • 新创建表数: ${createdTables}`);
    console.log(`   • 跳过表数量: ${skippedTables}`);
    console.log(`   • 创建视图数: ${createdViews}`);
    
    // 生成初始化报告
    const report = {
      timestamp: new Date().toISOString(),
      database: dbConfig.database,
      totalTables: totalTables,
      actualTables: finalTableCount,
      createdTables: createdTables,
      skippedTables: skippedTables,
      createdViews: createdViews,
      success: true
    };
    
    // 保存报告
    const reportPath = path.join(__dirname, 'database-init-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 初始化报告已保存到: ${reportPath}`);
    
    console.log('\n🎉 数据库初始化完成!');
    console.log('='.repeat(60));
    
    return true;
    
  } catch (error) {
    console.error('\n❌ 数据库初始化失败:', error.message);
    console.error('错误详情:', error);
    
    // 保存错误报告
    const errorReport = {
      timestamp: new Date().toISOString(),
      database: dbConfig.database,
      error: error.message,
      stack: error.stack,
      success: false
    };
    
    const errorReportPath = path.join(__dirname, 'database-init-error.json');
    fs.writeFileSync(errorReportPath, JSON.stringify(errorReport, null, 2));
    console.log(`\n📄 错误报告已保存到: ${errorReportPath}`);
    
    return false;
    
  } finally {
    if (connection) {
      try {
        await connection.end();
        console.log('\n🔚 数据库连接已关闭');
      } catch (err) {
        console.error('关闭数据库连接时出错:', err);
      }
    }
  }
}

/**
 * 检查表是否存在
 * @param {string} tableName 表名
 * @returns {Promise<boolean>} 表是否存在
 */
async function checkTableExists(tableName) {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    const [tables] = await connection.query(
      'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
      [dbConfig.database, tableName]
    );
    return tables.length > 0;
  } catch (error) {
    console.error(`检查表 ${tableName} 是否存在时出错:`, error);
    return false;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

/**
 * 获取数据库状态
 * @returns {Promise<Object>} 数据库状态信息
 */
async function getDatabaseStatus() {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    
    // 获取表信息
    const [tables] = await connection.query('SHOW TABLES');
    const tableNames = tables.map(row => Object.values(row)[0]);
    
    // 获取每个表的记录数
    const tableInfo = {};
    for (const tableName of tableNames) {
      try {
        const [countResult] = await connection.query(`SELECT COUNT(*) as count FROM ${tableName}`);
        tableInfo[tableName] = {
          exists: true,
          recordCount: countResult[0].count
        };
      } catch (error) {
        tableInfo[tableName] = {
          exists: true,
          recordCount: 'N/A',
          error: error.message
        };
      }
    }
    
    return {
      database: dbConfig.database,
      tableCount: tableNames.length,
      tables: tableInfo,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    return {
      database: dbConfig.database,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// 导出函数
module.exports = {
  initializeDatabase,
  checkTableExists,
  getDatabaseStatus,
  dbConfig,
  tableDefinitions
};

// 如果直接运行此脚本，执行初始化
if (require.main === module) {
  console.log('启动数据库初始化...\n');
  
  initializeDatabase()
    .then(result => {
      if (result) {
        console.log('\n✅ 数据库初始化成功完成!');
        process.exit(0);
      } else {
        console.log('\n❌ 数据库初始化失败!');
        process.exit(1);
      }
    })
    .catch(err => {
      console.error('\n💥 数据库初始化过程中发生未捕获的错误:', err);
      process.exit(1);
    });
} 
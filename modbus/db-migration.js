/**
 * Modbus数据库迁移脚本
 * 用于更新数据库结构，添加工作内容相关字段
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// 获取数据库配置
let dbConfig;
try {
  dbConfig = require('./db-config').dbConfig;
} catch (error) {
  console.error('加载数据库配置失败:', error.message);
  process.exit(1);
}

async function migrateDatabase() {
  console.log('开始执行数据库迁移...');
  
  let connection = null;
  
  try {
    // 创建数据库连接
    connection = await mysql.createConnection(dbConfig);
    console.log('数据库连接已建立');
    
    // 检查字段是否已存在
    console.log('检查工作内容相关字段是否已存在...');
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME IN ('work_content', 'work_type', 'work_status', 'task_id', 'unit', 'description')
    `, [dbConfig.database, 'modbus_data_latest']);
    
    const existingColumns = columns.map(col => col.COLUMN_NAME);
    console.log('已存在的列:', existingColumns);
    
    // 添加unit字段
    if (!existingColumns.includes('unit')) {
      console.log('添加unit字段...');
      await connection.execute(`
        ALTER TABLE modbus_data_latest 
        ADD COLUMN unit VARCHAR(50) NULL COMMENT '数据点单位' AFTER data_type
      `);
      console.log('unit字段添加成功');
    } else {
      console.log('unit字段已存在，跳过');
    }
    
    // 添加description字段
    if (!existingColumns.includes('description')) {
      console.log('添加description字段...');
      await connection.execute(`
        ALTER TABLE modbus_data_latest 
        ADD COLUMN description TEXT NULL COMMENT '数据点描述' AFTER unit
      `);
      console.log('description字段添加成功');
    } else {
      console.log('description字段已存在，跳过');
    }
    
    // 添加work_content字段
    if (!existingColumns.includes('work_content')) {
      console.log('添加work_content字段...');
      await connection.execute(`
        ALTER TABLE modbus_data_latest 
        ADD COLUMN work_content TEXT NULL AFTER description
      `);
      console.log('work_content字段添加成功');
    } else {
      console.log('work_content字段已存在，跳过');
    }
    
    // 添加work_type字段
    if (!existingColumns.includes('work_type')) {
      console.log('添加work_type字段...');
      await connection.execute(`
        ALTER TABLE modbus_data_latest 
        ADD COLUMN work_type ENUM('regular', 'temporary', 'none') DEFAULT 'none' AFTER work_content
      `);
      console.log('work_type字段添加成功');
    } else {
      console.log('work_type字段已存在，跳过');
    }
    
    // 添加work_status字段
    if (!existingColumns.includes('work_status')) {
      console.log('添加work_status字段...');
      await connection.execute(`
        ALTER TABLE modbus_data_latest 
        ADD COLUMN work_status ENUM('pending', 'completed', 'cancelled') DEFAULT 'pending' AFTER work_type
      `);
      console.log('work_status字段添加成功');
    } else {
      console.log('work_status字段已存在，跳过');
    }
    
    // 添加task_id字段
    if (!existingColumns.includes('task_id')) {
      console.log('添加task_id字段...');
      await connection.execute(`
        ALTER TABLE modbus_data_latest 
        ADD COLUMN task_id INT NULL AFTER work_status
      `);
      console.log('task_id字段添加成功');
    } else {
      console.log('task_id字段已存在，跳过');
    }
    
    // 创建daily_work_plans表
    console.log('检查daily_work_plans表是否存在...');
    const [tableExists] = await connection.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'daily_work_plans'
    `, [dbConfig.database]);
    
    if (tableExists.length === 0) {
      console.log('创建daily_work_plans表...');
      await connection.execute(`
        CREATE TABLE daily_work_plans (
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
        )
      `);
      console.log('daily_work_plans表创建成功');
    } else {
      console.log('daily_work_plans表已存在，跳过');
    }
    
    // 创建work_summaries表
    console.log('检查work_summaries表是否存在...');
    const [summaryTableExists] = await connection.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'work_summaries'
    `, [dbConfig.database]);
    
    if (summaryTableExists.length === 0) {
      console.log('创建work_summaries表...');
      await connection.execute(`
        CREATE TABLE work_summaries (
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
        )
      `);
      console.log('work_summaries表创建成功');
    } else {
      console.log('work_summaries表已存在，跳过');
    }
    
    console.log('数据库迁移完成!');
    
    // 记录迁移历史
    const migrationInfo = {
      date: new Date().toISOString(),
      description: '添加unit、description和工作内容相关字段到modbus_data_latest表并创建daily_work_plans表',
      status: 'success'
    };
    
    const migrationLogPath = path.join(__dirname, 'migration-log.json');
    let migrationLog = [];
    
    if (fs.existsSync(migrationLogPath)) {
      try {
        migrationLog = JSON.parse(fs.readFileSync(migrationLogPath, 'utf8'));
      } catch (err) {
        console.warn('读取迁移日志失败，创建新日志');
      }
    }
    
    migrationLog.push(migrationInfo);
    fs.writeFileSync(migrationLogPath, JSON.stringify(migrationLog, null, 2));
    
    return true;
  } catch (error) {
    console.error('数据库迁移失败:', error.message);
    console.error('错误详情:', error);
    return false;
  } finally {
    if (connection) {
      await connection.end();
      console.log('数据库连接已关闭');
    }
  }
}

// 执行迁移
if (require.main === module) {
  migrateDatabase()
    .then(result => {
      if (result) {
        console.log('迁移成功完成');
        process.exit(0);
      } else {
        console.error('迁移失败');
        process.exit(1);
      }
    })
    .catch(err => {
      console.error('迁移过程中发生未捕获的错误:', err);
      process.exit(1);
    });
} else {
  module.exports = { migrateDatabase };
} 
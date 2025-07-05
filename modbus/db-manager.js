/**
 * Modbus 数据库管理器
 * 
 * 负责数据库的初始化、表检查和管理数据库操作
 */

const fs = require('fs');
const path = require('path');
const dbConfig = require('./db-config');

class DbManager {
  constructor() {
    this.pool = null;
    this.initialized = false;
    this.sqlFilePath = path.join(__dirname, '..', 'data', 'modbus_history.sql');
    // 添加最新值内存缓存，用于检测数据变化
    this.latestValues = new Map();
    
    // 数据变化检测配置 - 增强配置选项
    this.changeDetectionConfig = {
      enabled: true,                    // 是否启用数据变化检测
      absoluteTolerance: 0.001,         // 数值比较的绝对容差
      relativeTolerance: 0.001,         // 数值比较的相对容差（0.1%）
      compareFormattedValues: true,     // 是否比较格式化后的值
      forceInsertInterval: 3600000,     // 强制插入间隔（毫秒）：1小时
      logLevel: 'info',                 // 日志级别：debug, info, warn, error
      enableStatistics: true            // 启用统计信息
    };
    
    // 添加统计信息
    this.statistics = {
      totalProcessed: 0,
      totalInserted: 0,
      totalSkipped: 0,
      totalErrors: 0,
      lastResetTime: new Date(),
      detectionStartTime: new Date()
    };
    
    console.log('数据库管理器已创建，数据变化检测已启用');
  }

  /**
   * 初始化数据库管理器
   * @param {Object} mysql MySQL模块实例
   * @returns {Promise<boolean>} 初始化是否成功
   */
  async initialize(mysql) {
    if (this.initialized) {
      console.log('数据库管理器已经初始化，跳过');
      return true;
    }

    try {
      console.log('初始化数据库管理器...');
      console.log('数据库配置:', JSON.stringify({
        host: dbConfig.dbConfig.host,
        user: dbConfig.dbConfig.user,
        database: dbConfig.dbConfig.database,
        connectionLimit: dbConfig.dbConfig.connectionLimit
      }, null, 2));
      
      // 检查MySQL模块
      if (!mysql) {
        console.log('未提供MySQL模块，尝试自动加载...');
        try {
          mysql = require('mysql2/promise');
          console.log('成功加载MySQL模块');
        } catch (moduleError) {
          console.error('无法加载MySQL模块:', moduleError);
          throw new Error('MySQL模块未提供且无法自动加载');
        }
      }
      
      // 创建连接池
      console.log('开始创建数据库连接池...');
      this.pool = await dbConfig.createConnectionPool(mysql);
      console.log('数据库连接池创建成功');
      
      // 测试连接池
      console.log('测试数据库连接...');
      const [testResult] = await this.pool.query('SELECT 1 as test');
      if (testResult[0].test === 1) {
        console.log('数据库连接测试成功');
      } else {
        throw new Error('数据库连接测试结果不符合预期');
      }
      
      // 检查并创建表结构
      console.log('开始检查数据库表结构...');
      await this.ensureTablesExist();
      
      this.initialized = true;
      console.log('数据库管理器初始化完成');
      return true;
    } catch (error) {
      console.error('数据库管理器初始化失败:', error);
      console.error('错误类型:', error.constructor.name);
      console.error('错误消息:', error.message);
      console.error('错误堆栈:', error.stack);
      console.error('错误码:', error.code);
      console.error('SQL状态:', error.sqlState);
      console.error('SQL错误号:', error.errno);
      
      // 尝试特定诊断
      if (error.code === 'ECONNREFUSED') {
        console.error('诊断: 无法连接到MySQL服务器，请确保MySQL服务正在运行且端口可访问');
      } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
        console.error('诊断: 数据库访问被拒绝，请检查用户名和密码');
      } else if (error.code === 'ER_BAD_DB_ERROR') {
        console.error('诊断: 数据库不存在，需要创建数据库或检查数据库名称');
      }
      
      return false;
    }
  }

  /**
   * 确保数据库表存在
   * @returns {Promise<void>}
   */
  async ensureTablesExist() {
    if (!this.pool) throw new Error('数据库连接池未初始化');

    try {
      console.log('检查数据库表结构...');
      
      // 获取现有表列表
      const [tables] = await this.pool.query('SHOW TABLES');
      const tableList = tables.map(row => Object.values(row)[0]);
      console.log('已存在的表:', tableList.join(', ') || '无');
      
      // 检查是否存在所需表
      const requiredTables = ['modbus_data_history', 'modbus_data_latest'];
      const missingTables = requiredTables.filter(table => !tableList.includes(table));
      
      if (missingTables.length > 0) {
        console.log('缺少必需的表:', missingTables.join(', '));
        
        // 通过SQL文件创建表
        if (fs.existsSync(this.sqlFilePath)) {
          console.log('找到SQL文件，执行创建表操作...');
          const sqlContent = fs.readFileSync(this.sqlFilePath, 'utf8');
          const sqlStatements = sqlContent.split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0);
          
          for (const sql of sqlStatements) {
            await this.pool.query(sql);
          }
          console.log('表创建完成');
        } else {
          console.log('SQL文件不存在，手动创建表...');
          await this.createTables();
        }
      } else {
        console.log('所有必需的表已存在');
      }
      
      // 检查历史表中是否存在change_description字段
      try {
        console.log('检查modbus_data_history表是否包含change_description字段...');
        const [columns] = await this.pool.query('SHOW COLUMNS FROM modbus_data_history');
        
        // 提取列名
        const columnNames = columns.map(col => col.Field);
        
        // 检查是否存在change_description字段
        if (!columnNames.includes('change_description')) {
          console.log('modbus_data_history表缺少change_description字段，正在添加...');
          
          // 添加change_description字段
          await this.pool.query(`
            ALTER TABLE modbus_data_history 
            ADD COLUMN change_description VARCHAR(255) NULL AFTER data_type
          `);
          
          console.log('成功添加change_description字段到modbus_data_history表');
        } else {
          console.log('modbus_data_history表已包含change_description字段');
        }
      } catch (error) {
        console.error('检查或更新表字段时出错:', error);
        throw error;
      }
    } catch (error) {
      console.error('检查或创建表时出错:', error);
      throw error;
    }
  }

  /**
   * 手动创建数据库表
   * @returns {Promise<void>}
   */
  async createTables() {
    // 创建历史数据表
    await this.pool.query(`
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
      )
    `);
    console.log('历史数据表 modbus_data_history 创建成功');
    
    // 创建最新值表（包含unit和description字段）
    await this.pool.query(`
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
      )
    `);
    console.log('最新值表 modbus_data_latest 创建成功（包含unit和description字段）');
    
    // 检查并添加unit和description字段（如果表已存在但缺少这些字段）
    try {
      // 先检查字段是否存在
      const [columns] = await this.pool.query('DESCRIBE modbus_data_latest');
      const existingColumns = columns.map(col => col.Field);
      
      // 添加unit字段（如果不存在）
      if (!existingColumns.includes('unit')) {
        await this.pool.query(`
          ALTER TABLE modbus_data_latest 
          ADD COLUMN unit VARCHAR(50) NULL COMMENT '数据点单位' AFTER data_type
        `);
        console.log('✓ unit字段添加成功');
      } else {
        console.log('✓ unit字段已存在');
      }
      
      // 添加description字段（如果不存在）
      if (!existingColumns.includes('description')) {
        await this.pool.query(`
          ALTER TABLE modbus_data_latest 
          ADD COLUMN description TEXT NULL COMMENT '数据点描述' AFTER unit
        `);
        console.log('✓ description字段添加成功');
      } else {
        console.log('✓ description字段已存在');
      }
      
      console.log('unit和description字段检查完成');
    } catch (alterError) {
      // 字段可能已存在，忽略错误
      console.log('字段添加过程中的错误（可能已存在）:', alterError.message);
    }
  }

  /**
   * 存储数据点的最新值
   * @param {Array} dataPoints 数据点列表
   * @param {Object} values 数据点值
   * @returns {Promise<Object>} 存储结果
   */
  async storeLatestValues(dataPoints, values) {
    if (!this.pool) throw new Error('数据库连接池未初始化');
    if (!values || Object.keys(values).length === 0) {
      throw new Error('无可用数据');
    }

    const results = {
      success: true,
      insertedCount: 0,
      updatedCount: 0,
      historyInsertedCount: 0,
      unchangedCount: 0,
      errors: [],
      statistics: {
        processedDataPoints: 0,
        changedDataPoints: 0,
        unchangedDataPoints: 0,
        firstTimeDataPoints: 0
      }
    };

    // 开启事务
    const conn = await this.pool.getConnection();
    await conn.beginTransaction();

    try {
      const currentTime = new Date();
      
      for (const dataPoint of dataPoints) {
        const dpKey = dataPoint.identifier;
        results.statistics.processedDataPoints++;
        
        if (this.changeDetectionConfig.logLevel === 'debug') {
          console.log(`查找数据点值: 键=${dpKey}, 可用键=${Object.keys(values).join(', ')}`);
        }
        
        if (values[dpKey]) {
          const value = values[dpKey];
          
          // 添加调试信息
          if (this.changeDetectionConfig.logLevel === 'debug') {
            console.log(`处理数据点: ${dataPoint.name} (${dpKey}), 值: ${JSON.stringify(value)}`);
          }
          
          // 准备当前值用于比较
          const currentValue = value.value;
          const currentFormattedValue = value.formattedValue;
          
          // 从内存缓存中获取上次的值
          const cachedValue = this.latestValues.get(dataPoint.identifier);
          
          // 判断是否需要插入历史数据
          let needInsertHistory = true;
          let changeDescription = null;
          let changeReason = 'unknown';
          
          // 如果禁用数据变化检测，则总是插入历史记录
          if (!this.changeDetectionConfig.enabled) {
            changeDescription = `数据更新: ${currentFormattedValue || currentValue}`;
            changeReason = '检测已禁用';
            console.log(`数据变化检测已禁用，将插入历史记录`);
          } else if (cachedValue) {
            // 检查强制插入间隔
            const timeSinceLastInsert = currentTime - new Date(cachedValue.lastInsertTime || 0);
            const shouldForceInsert = timeSinceLastInsert > this.changeDetectionConfig.forceInsertInterval;
            
            if (this.changeDetectionConfig.logLevel === 'debug') {
              console.log(`比较值: 旧值=${cachedValue.value} (${typeof cachedValue.value}), 新值=${currentValue} (${typeof currentValue})`);
              console.log(`比较格式化值: 旧值="${cachedValue.formattedValue}", 新值="${currentFormattedValue}"`);
              console.log(`距离上次插入时间: ${Math.round(timeSinceLastInsert / 1000)}秒, 强制插入阈值: ${Math.round(this.changeDetectionConfig.forceInsertInterval / 1000)}秒`);
            }
            
            // 检查类型并进行适当的比较
            let valueEqual = false;
            
            // 如果两者都是数字类型，进行数值比较
            if (typeof currentValue === 'number' && !isNaN(parseFloat(cachedValue.value))) {
              // 使用相对容差和绝对容差的组合进行更精确的比较
              const currentNum = parseFloat(currentValue);
              const cachedNum = parseFloat(cachedValue.value);
              const absoluteTolerance = this.changeDetectionConfig.absoluteTolerance;
              const relativeTolerance = this.changeDetectionConfig.relativeTolerance;
              
              const absoluteDiff = Math.abs(currentNum - cachedNum);
              const relativeDiff = Math.abs(currentNum - cachedNum) / Math.max(Math.abs(currentNum), Math.abs(cachedNum), 1);
              
              // 如果绝对差异小于绝对容差，或相对差异小于相对容差，则认为相等
              valueEqual = absoluteDiff < absoluteTolerance || relativeDiff < relativeTolerance;
              
              if (this.changeDetectionConfig.logLevel === 'debug') {
                console.log(`数值比较: ${currentNum} vs ${cachedNum}, 绝对差异=${absoluteDiff.toFixed(6)}, 相对差异=${(relativeDiff * 100).toFixed(4)}%, 相等: ${valueEqual}`);
              }
            } else {
              // 否则进行严格比较
              valueEqual = String(currentValue) === String(cachedValue.value);
              if (this.changeDetectionConfig.logLevel === 'debug') {
                console.log(`严格比较: ${currentValue} (${typeof currentValue}) vs ${cachedValue.value} (${typeof cachedValue.value}), 相等: ${valueEqual}`);
              }
            }
            
            // 比较格式化值（字符串比较）
            let formattedEqual = true;
            if (this.changeDetectionConfig.compareFormattedValues) {
              formattedEqual = currentFormattedValue === cachedValue.formattedValue;
              if (this.changeDetectionConfig.logLevel === 'debug') {
                console.log(`格式化值比较: "${currentFormattedValue}" vs "${cachedValue.formattedValue}", 相等: ${formattedEqual}`);
              }
            }
            
            // 如果值没有变化但需要强制插入
            if (valueEqual && formattedEqual && shouldForceInsert) {
              changeDescription = `定时强制插入: ${currentFormattedValue || currentValue}`;
              changeReason = '强制插入';
              console.log(`距离上次插入超过${Math.round(this.changeDetectionConfig.forceInsertInterval/60000)}分钟，执行强制插入`);
            }
            // 如果值没有变化，则不插入历史记录
            else if (valueEqual && formattedEqual) {
              needInsertHistory = false;
              changeReason = '数据未变化';
              results.unchangedCount++;
              results.statistics.unchangedDataPoints++;
              if (this.changeDetectionConfig.logLevel === 'info') {
                console.log(`数据未变化，跳过历史记录插入: ${dataPoint.name}`);
              }
            } else {
              // 生成变化描述
              changeReason = '数据变化';
              results.statistics.changedDataPoints++;
              if (this.changeDetectionConfig.logLevel === 'info') {
                console.log(`检测到数据变化，将插入历史记录: ${dataPoint.name}`);
              }
              if (cachedValue.value !== null && currentValue !== null) {
                changeDescription = `从 ${cachedValue.formattedValue || cachedValue.value} 变化到 ${currentFormattedValue || currentValue}`;
              } else if (cachedValue.value === null && currentValue !== null) {
                changeDescription = `从 无数据 变化到 ${currentFormattedValue || currentValue}`;
              } else if (cachedValue.value !== null && currentValue === null) {
                changeDescription = `从 ${cachedValue.formattedValue || cachedValue.value} 变化到 无数据`;
              }
              if (this.changeDetectionConfig.logLevel === 'debug') {
                console.log(`变化描述: ${changeDescription}`);
              }
            }
          } else {
            // 第一次添加数据
            changeDescription = `初始数据: ${currentFormattedValue || currentValue}`;
            changeReason = '初始数据';
            results.statistics.firstTimeDataPoints++;
            if (this.changeDetectionConfig.logLevel === 'info') {
              console.log(`初始数据，变化描述: ${changeDescription}`);
            }
          }
          
          // 更新内存缓存
          this.latestValues.set(dataPoint.identifier, {
            value: currentValue,
            formattedValue: currentFormattedValue,
            quality: value.quality || 'GOOD',
            dataType: dataPoint.format,
            lastInsertTime: needInsertHistory ? currentTime : (cachedValue?.lastInsertTime || currentTime),
            lastUpdateTime: currentTime
          });
          
          // 只有数据变化时才插入历史记录
          if (needInsertHistory) {
            if (this.changeDetectionConfig.logLevel === 'info') {
              console.log(`插入历史记录: ${dataPoint.name}, 原因: ${changeReason}`);
            }
            // 插入历史数据
            await conn.query(
              `INSERT INTO modbus_data_history 
              (data_point_id, data_point_identifier, data_point_name, 
                raw_value, value, formatted_value, quality, data_type, read_time_ms, change_description) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                dataPoint.id,
                dataPoint.identifier,
                dataPoint.name,
                JSON.stringify(value.rawValue || null),
                value.value,
                value.formattedValue,
                value.quality || 'GOOD',
                dataPoint.format,
                value.readTime || 0,
                changeDescription
              ]
            );
            results.historyInsertedCount++;
            if (this.changeDetectionConfig.logLevel === 'debug') {
              console.log(`历史记录插入成功`);
            }
          } else {
            if (this.changeDetectionConfig.logLevel === 'debug') {
              console.log(`数据未变化，跳过历史记录插入: ${dataPoint.name}`);
            }
          }
          
          // 无论数据是否变化，都需要确保最新值表有记录（用于初始化或保持连接状态）
          if (this.changeDetectionConfig.logLevel === 'debug') {
            console.log(`更新最新值表: ${dataPoint.name}`);
          }
          const insertSQL = `INSERT INTO modbus_data_latest 
            (data_point_id, data_point_identifier, data_point_name, 
             raw_value, value, formatted_value, quality, data_type) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
            raw_value = VALUES(raw_value),
            value = VALUES(value),
            formatted_value = VALUES(formatted_value),
            quality = VALUES(quality),
            data_type = VALUES(data_type),
            updated_at = CURRENT_TIMESTAMP`;
          
          const [latestResult] = await conn.query(
            insertSQL,
            [
              dataPoint.id,
              dataPoint.identifier,
              dataPoint.name,
              JSON.stringify(value.rawValue || null),
              value.value,
              value.formattedValue,
              value.quality || 'GOOD',
              dataPoint.format
            ]
          );
          
          if (latestResult.affectedRows === 1 && latestResult.insertId > 0) {
            results.insertedCount++;
            if (this.changeDetectionConfig.logLevel === 'debug') {
              console.log(`最新值表插入新记录`);
            }
          } else if (latestResult.affectedRows > 0) {
            results.updatedCount++;
            if (this.changeDetectionConfig.logLevel === 'debug') {
              console.log(`最新值表更新现有记录`);
            }
          }
        } else {
          console.warn(`未找到数据点 ${dataPoint.name} (${dpKey}) 的值`);
        }
      }
      
      // 更新统计信息
      if (this.changeDetectionConfig.enableStatistics) {
        this.statistics.totalProcessed += results.statistics.processedDataPoints;
        this.statistics.totalInserted += results.historyInsertedCount;
        this.statistics.totalSkipped += results.unchangedCount;
      }
      
      // 提交事务
      await conn.commit();
      
      // 输出统计信息
      if (this.changeDetectionConfig.logLevel === 'info' && this.changeDetectionConfig.enableStatistics) {
        console.log(`📊 数据变化检测统计: 处理${results.statistics.processedDataPoints}个, 变化${results.statistics.changedDataPoints}个, 未变化${results.statistics.unchangedDataPoints}个, 初始${results.statistics.firstTimeDataPoints}个`);
        console.log(`💾 存储结果: 历史记录插入${results.historyInsertedCount}条, 最新值插入${results.insertedCount}条/更新${results.updatedCount}条`);
      }
      
      if (this.changeDetectionConfig.logLevel === 'debug') {
        console.log(`事务提交成功，结果:`, results);
      }
      
    } catch (error) {
      // 回滚事务
      await conn.rollback();
      results.success = false;
      results.error = error.message;
      results.errors.push(error.message);
      
      // 更新错误统计
      if (this.changeDetectionConfig.enableStatistics) {
        this.statistics.totalErrors++;
      }
      
      console.error('存储数据失败:', error);
    } finally {
      conn.release();
    }
    
    return results;
  }

  /**
   * 获取数据点的最新值
   * @returns {Promise<Array>} 数据点的最新值列表
   */
  async getLatestValues() {
    if (!this.pool) throw new Error('数据库连接池未初始化');
    
    try {
      const [rows] = await this.pool.query(
        'SELECT * FROM modbus_data_latest ORDER BY updated_at DESC'
      );
      
      return rows.map(row => ({
        id: row.id,
        dataPointId: row.data_point_id,
        identifier: row.data_point_identifier,
        name: row.data_point_name,
        value: row.value,
        formattedValue: row.formatted_value,
        quality: row.quality,
        dataType: row.data_type,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      console.error('获取最新值失败:', error);
      throw error;
    }
  }

  /**
   * 获取指定数据点的历史数据
   * @param {string} identifier 数据点标识符
   * @param {Date} startTime 开始时间
   * @param {Date} endTime 结束时间
   * @param {number} limit 限制记录数
   * @returns {Promise<Array>} 历史数据列表
   */
  async getHistoryValues(identifier, startTime, endTime, limit = 100) {
    if (!this.pool) throw new Error('数据库连接池未初始化');
    
    try {
      let query = 'SELECT * FROM modbus_data_history WHERE data_point_identifier = ?';
      const params = [identifier];
      
      if (startTime) {
        query += ' AND timestamp >= ?';
        params.push(startTime);
      }
      
      if (endTime) {
        query += ' AND timestamp <= ?';
        params.push(endTime);
      }
      
      query += ' ORDER BY timestamp DESC LIMIT ?';
      params.push(limit);
      
      const [rows] = await this.pool.query(query, params);
      
      return rows.map(row => ({
        id: row.id,
        dataPointId: row.data_point_id,
        identifier: row.data_point_identifier,
        name: row.data_point_name,
        value: row.value,
        formattedValue: row.formatted_value,
        quality: row.quality,
        dataType: row.data_type,
        timestamp: row.timestamp,
        changeDescription: row.change_description
      }));
    } catch (error) {
      console.error('获取历史数据失败:', error);
      throw error;
    }
  }

  /**
   * 配置数据变化检测参数
   * @param {Object} config 配置参数
   */
  configureChangeDetection(config) {
    console.log('🔧 更新数据变化检测配置...');
    console.log('原配置:', this.changeDetectionConfig);
    
    this.changeDetectionConfig = { ...this.changeDetectionConfig, ...config };
    
    console.log('新配置:', this.changeDetectionConfig);
    console.log('✅ 数据变化检测配置已更新');
  }

  /**
   * 获取数据变化检测配置
   * @returns {Object} 当前配置
   */
  getChangeDetectionConfig() {
    return { ...this.changeDetectionConfig };
  }

  /**
   * 获取数据变化检测统计信息
   * @returns {Object} 统计信息
   */
  getChangeDetectionStatistics() {
    const runningTime = new Date() - this.statistics.detectionStartTime;
    const avgProcessingRate = this.statistics.totalProcessed / (runningTime / 1000); // 每秒处理数
    
    return {
      ...this.statistics,
      runningTimeMs: runningTime,
      avgProcessingRate: avgProcessingRate.toFixed(2),
      changeRate: this.statistics.totalProcessed > 0 ? 
        ((this.statistics.totalInserted / this.statistics.totalProcessed) * 100).toFixed(2) + '%' : '0%',
      errorRate: this.statistics.totalProcessed > 0 ? 
        ((this.statistics.totalErrors / this.statistics.totalProcessed) * 100).toFixed(2) + '%' : '0%'
    };
  }

  /**
   * 重置数据变化检测统计信息
   */
  resetChangeDetectionStatistics() {
    console.log('🔄 重置数据变化检测统计信息');
    this.statistics = {
      totalProcessed: 0,
      totalInserted: 0,
      totalSkipped: 0,
      totalErrors: 0,
      lastResetTime: new Date(),
      detectionStartTime: new Date()
    };
  }

  /**
   * 清空数据变化检测缓存
   */
  clearChangeDetectionCache() {
    console.log('🧹 清空数据变化检测缓存');
    this.latestValues.clear();
    console.log('缓存已清空');
  }

  /**
   * 关闭数据库连接
   * @returns {Promise<void>}
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.initialized = false;
      console.log('数据库连接池已关闭');
    }
  }
}

// 创建单例实例
const dbManager = new DbManager();

module.exports = dbManager; 
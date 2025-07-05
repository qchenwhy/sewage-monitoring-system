/**
 * Modbus告警数据库服务
 * 用于存储和检索Modbus系统的告警信息
 */

const dbManager = require('./db-manager');

class AlarmDbService {
  constructor() {
    this.initialized = false;
  }

  /**
   * 初始化服务
   * @returns {Promise<boolean>} 初始化是否成功
   */
  async initialize() {
    if (this.initialized) {
      console.log('告警数据库服务已初始化');
      return true;
    }

    try {
      console.log('初始化告警数据库服务...');
      
      // 检查数据库管理器是否已初始化
      if (!dbManager.initialized) {
        console.log('数据库管理器尚未初始化，正在初始化...');
        await dbManager.initialize();
      }
      
      // 确保告警表存在
      await this.ensureTableExists();
      
      this.initialized = true;
      console.log('告警数据库服务初始化完成');
      return true;
    } catch (error) {
      console.error('初始化告警数据库服务失败:', error);
      return false;
    }
  }

  /**
   * 确保告警表存在
   * @returns {Promise<void>}
   */
  async ensureTableExists() {
    try {
      console.log('检查并创建告警表...');
      
      if (!dbManager.pool) {
        throw new Error('数据库连接池不可用');
      }
      
      // 创建告警表
      await dbManager.pool.query(`
        CREATE TABLE IF NOT EXISTS modbus_alarms (
          id INT AUTO_INCREMENT PRIMARY KEY,
          alarm_identifier VARCHAR(255) NOT NULL,
          alarm_content VARCHAR(255) NOT NULL,
          triggered_time DATETIME NOT NULL,
          cleared_time DATETIME NULL,
          status ENUM('active', 'cleared') DEFAULT 'active' COMMENT '告警状态，只能通过更新active状态来实现cleared状态，不应直接创建cleared状态记录',
          data_point_id VARCHAR(255) NULL,
          data_point_name VARCHAR(255) NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_identifier (alarm_identifier),
          INDEX idx_status (status),
          INDEX idx_time (triggered_time, cleared_time)
        )
      `);
      
      console.log('告警表确认存在');
    } catch (error) {
      console.error('创建告警表失败:', error);
      throw error;
    }
  }

  /**
   * 存储新触发的告警
   * @param {Object} alarm 告警信息对象
   * @param {string} alarm.identifier 告警标识符
   * @param {string} alarm.content 告警内容
   * @param {string} alarm.triggerTime 触发时间（ISO格式）
   * @param {string} [alarm.dataPointId] 数据点ID（可选）
   * @param {string} [alarm.dataPointName] 数据点名称（可选）
   * @returns {Promise<Object>} 插入的告警记录
   */
  async storeAlarm(alarm) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      console.log(`存储告警: ${alarm.identifier}, 内容: ${alarm.content}`);
      
      const triggerTime = new Date(alarm.triggerTime);
      
      // 检查是否已存在活跃告警记录
      console.log(`检查是否存在相同标识符的活跃告警记录: ${alarm.identifier}`);
      const [existingAlarms] = await dbManager.pool.query(
        'SELECT * FROM modbus_alarms WHERE alarm_identifier = ? AND status = "active" LIMIT 1',
        [alarm.identifier]
      );
      
      // 如果已存在活跃告警，则不创建新记录
      if (existingAlarms && existingAlarms.length > 0) {
        console.log(`已存在活跃告警记录，ID: ${existingAlarms[0].id}，不创建新记录`);
        console.log(`现有活跃告警详情: ID=${existingAlarms[0].id}, 标识符=${existingAlarms[0].alarm_identifier}, 内容=${existingAlarms[0].alarm_content}, 触发时间=${existingAlarms[0].triggered_time}, 状态=${existingAlarms[0].status}`);
        return existingAlarms[0];
      }
      
      // 不存在活跃告警，创建新记录
      console.log(`不存在活跃告警记录，创建新记录，状态为active`);
      
      const [insertResult] = await dbManager.pool.query(
        `INSERT INTO modbus_alarms 
         (alarm_identifier, alarm_content, triggered_time, data_point_id, data_point_name, status) 
         VALUES (?, ?, ?, ?, ?, 'active')`,
        [
          alarm.identifier,
          alarm.content,
          triggerTime,
          alarm.dataPointId || null,
          alarm.dataPointName || null
        ]
      );
      
      console.log(`告警存储成功，ID: ${insertResult.insertId}`);
      
      // 返回插入的告警记录
      const [newAlarm] = await dbManager.pool.query(
        'SELECT * FROM modbus_alarms WHERE id = ?',
        [insertResult.insertId]
      );
      
      console.log(`新增告警记录详情: ID=${newAlarm[0].id}, 标识符=${newAlarm[0].alarm_identifier}, 内容=${newAlarm[0].alarm_content}, 状态=${newAlarm[0].status}`);
      return newAlarm[0];
    } catch (error) {
      console.error('存储告警失败:', error);
      throw error;
    }
  }

  /**
   * 更新告警解除状态
   * @param {Object} alarm 告警信息对象
   * @param {string} alarm.identifier 告警标识符
   * @param {string} [alarm.clearedTime] 解除时间（ISO格式），如果不提供则使用当前时间
   * @returns {Promise<Object>} 更新的告警记录
   */
  async clearAlarm(alarm) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      console.log(`更新告警解除状态: ${alarm.identifier}`);
      
      const clearedTime = alarm.clearedTime ? new Date(alarm.clearedTime) : new Date();
      console.log(`解除时间: ${clearedTime.toISOString()}`);
      
      // 先查询所有相关的告警记录进行调试
      console.log(`=== 调试：查询所有包含标识符 ${alarm.identifier} 的告警记录 ===`);
      const [allRelatedAlarms] = await dbManager.pool.query(
        'SELECT id, alarm_identifier, status, triggered_time, cleared_time, alarm_content FROM modbus_alarms WHERE alarm_identifier = ? ORDER BY triggered_time DESC',
        [alarm.identifier]
      );
      console.log(`找到 ${allRelatedAlarms.length} 条相关告警记录:`);
      allRelatedAlarms.forEach((record, index) => {
        console.log(`  ${index + 1}. ID=${record.id}, 状态="${record.status}", 触发时间=${record.triggered_time}, 解除时间=${record.cleared_time}`);
        console.log(`     内容: ${record.alarm_content?.substring(0, 100)}...`);
      });
      
      // 查询所有活跃告警进行调试
      console.log(`=== 调试：查询所有活跃告警记录 ===`);
      const [allActiveAlarms] = await dbManager.pool.query(
        'SELECT id, alarm_identifier, status, triggered_time FROM modbus_alarms WHERE status = "active" ORDER BY triggered_time DESC'
      );
      console.log(`找到 ${allActiveAlarms.length} 条活跃告警记录:`);
      allActiveAlarms.forEach((record, index) => {
        console.log(`  ${index + 1}. ID=${record.id}, 标识符="${record.alarm_identifier}", 状态="${record.status}", 触发时间=${record.triggered_time}`);
      });
      
      // 查找最新的活跃告警
      console.log(`查找标识符为 ${alarm.identifier} 的活跃告警记录`);
      const [activeAlarms] = await dbManager.pool.query(
        'SELECT * FROM modbus_alarms WHERE alarm_identifier = ? AND status = "active" ORDER BY triggered_time DESC LIMIT 1',
        [alarm.identifier]
      );
      
      console.log(`=== 调试：活跃告警查询结果 ===`);
      console.log(`查询SQL: SELECT * FROM modbus_alarms WHERE alarm_identifier = ? AND status = "active" ORDER BY triggered_time DESC LIMIT 1`);
      console.log(`查询参数: ["${alarm.identifier}"]`);
      console.log(`查询结果数量: ${activeAlarms.length}`);
      
      if (!activeAlarms || activeAlarms.length === 0) {
        console.log(`未找到标识符为 ${alarm.identifier} 的活跃告警记录`);
        
        // 额外调试：检查是否有状态不是"active"但应该是活跃的告警
        console.log(`=== 额外调试：检查可能的状态问题 ===`);
        const [statusDebug] = await dbManager.pool.query(
          'SELECT DISTINCT status FROM modbus_alarms WHERE alarm_identifier = ?',
          [alarm.identifier]
        );
        console.log(`标识符 ${alarm.identifier} 的所有状态值:`, statusDebug.map(row => `"${row.status}"`));
        
        // 检查最近的告警记录（不限状态）
        const [recentAlarms] = await dbManager.pool.query(
          'SELECT * FROM modbus_alarms WHERE alarm_identifier = ? ORDER BY triggered_time DESC LIMIT 3',
          [alarm.identifier]
        );
        console.log(`最近的 ${recentAlarms.length} 条告警记录（不限状态）:`);
        recentAlarms.forEach((record, index) => {
          console.log(`  ${index + 1}. ID=${record.id}, 状态="${record.status}", 触发时间=${record.triggered_time}, 解除时间=${record.cleared_time}`);
        });
        
        console.log(`未找到活跃告警记录，不执行任何操作`);
        return null;
      }
      
      const activeAlarm = activeAlarms[0];
      console.log(`找到活跃告警 ID: ${activeAlarm.id}, 内容: ${activeAlarm.alarm_content}, 触发时间: ${activeAlarm.triggered_time}`);
      console.log(`更新为已解除状态，解除时间: ${clearedTime.toISOString()}`);
      
      try {
        // 使用事务确保数据一致性
        await dbManager.pool.query('START TRANSACTION');
        
        // 更新告警状态为已解除
        const [updateResult] = await dbManager.pool.query(
          'UPDATE modbus_alarms SET cleared_time = ?, status = "cleared" WHERE id = ?',
          [clearedTime, activeAlarm.id]
        );
        
        console.log(`更新结果: 影响行数=${updateResult.affectedRows}, 更改行数=${updateResult.changedRows}`);
        
        // 提交事务
        await dbManager.pool.query('COMMIT');
        
        // 返回更新后的告警记录
        const [updatedAlarm] = await dbManager.pool.query(
          'SELECT * FROM modbus_alarms WHERE id = ?',
          [activeAlarm.id]
        );
        
        console.log(`更新后的告警记录: ID=${updatedAlarm[0].id}, 状态=${updatedAlarm[0].status}, 解除时间=${updatedAlarm[0].cleared_time}`);
        return updatedAlarm[0];
      } catch (txError) {
        // 发生错误，回滚事务
        console.error('更新告警记录时发生错误，回滚事务:', txError);
        await dbManager.pool.query('ROLLBACK');
        throw txError;
      }
    } catch (error) {
      console.error('更新告警解除状态失败:', error);
      
      // 捕获错误但不中断进程
      return {
        error: error.message,
        identifier: alarm.identifier,
        status: 'error'
      };
    }
  }

  /**
   * 获取所有活跃的告警
   * @returns {Promise<Array>} 活跃告警数组
   */
  async getActiveAlarms() {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      console.log('查询所有活跃告警');
      
      // 查询所有状态为active的告警
      const [alarms] = await dbManager.pool.query(
        'SELECT * FROM modbus_alarms WHERE status = "active" ORDER BY triggered_time DESC'
      );
      
      console.log(`查询结果: 找到 ${alarms.length} 条活跃告警`);
      return alarms;
    } catch (error) {
      console.error('获取活跃告警失败:', error);
      throw error;
    }
  }

  /**
   * 获取告警历史记录
   * @param {Object} options 查询选项
   * @param {string} [options.startTime] 开始时间（ISO格式）
   * @param {string} [options.endTime] 结束时间（ISO格式）
   * @param {string} [options.status] 告警状态 ("active", "cleared" 或不指定表示所有)
   * @param {number} [options.limit] 返回记录数量限制
   * @param {number} [options.offset] 分页偏移量
   * @returns {Promise<Array>} 告警历史记录列表
   */
  async getAlarmHistory(options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      let query = 'SELECT * FROM modbus_alarms WHERE 1=1';
      const params = [];
      
      // 添加时间范围筛选
      if (options.startTime) {
        query += ' AND triggered_time >= ?';
        params.push(new Date(options.startTime));
      }
      
      if (options.endTime) {
        query += ' AND triggered_time <= ?';
        params.push(new Date(options.endTime));
      }
      
      // 添加状态筛选
      if (options.status) {
        query += ' AND status = ?';
        params.push(options.status);
      }
      
      // 排序
      query += ' ORDER BY triggered_time DESC';
      
      // 添加分页
      if (options.limit) {
        query += ' LIMIT ?';
        params.push(parseInt(options.limit));
        
        if (options.offset) {
          query += ' OFFSET ?';
          params.push(parseInt(options.offset));
        }
      }
      
      const [alarms] = await dbManager.pool.query(query, params);
      
      return alarms;
    } catch (error) {
      console.error('获取告警历史记录失败:', error);
      throw error;
    }
  }
}

// 单例模式
let instance = null;

module.exports = {
  getInstance: () => {
    if (!instance) {
      instance = new AlarmDbService();
    }
    return instance;
  }
}; 
/**
 * 工作任务同步服务
 * 负责定时将常规工作任务和临时工作任务同步到daily_work_plans表
 */

const mysql = require('mysql2/promise');
const moment = require('moment');
const fs = require('fs');
const path = require('path');
const dbConfig = require('./db-config').dbConfig;

class WorkTaskSyncService {
  constructor() {
    this.initialized = false;
    this.syncTimer = null;
    this.pool = null;
    this.syncInterval = 3600000; // 默认每小时同步一次
    this.syncHour = 0; // 默认每天0点同步
    this.syncMinute = 0; // 默认每天0分同步
    this.lastSyncDate = null; // 上次同步日期
  }

  /**
   * 初始化服务
   * @returns {Promise<boolean>} 初始化是否成功
   */
  async initialize() {
    if (this.initialized) {
      console.log('工作任务同步服务已初始化');
      return true;
    }

    try {
      console.log('初始化工作任务同步服务...');
      
      // 创建数据库连接池
      this.pool = await mysql.createPool({
        ...dbConfig,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
      });
      
      // 测试数据库连接
      const [result] = await this.pool.execute('SELECT 1 as test');
      if (result[0].test !== 1) {
        throw new Error('数据库连接测试失败');
      }
      
      // 检查表是否存在
      await this.checkTables();
      
      this.initialized = true;
      console.log('工作任务同步服务初始化成功');
      return true;
    } catch (error) {
      console.error('初始化工作任务同步服务失败:', error);
      return false;
    }
  }

  /**
   * 检查表是否存在
   * @returns {Promise<void>}
   */
  async checkTables() {
    try {
      const tables = ['regular_work_tasks', 'temporary_work_tasks', 'daily_work_plans'];
      
      for (const table of tables) {
        const [result] = await this.pool.execute(`SHOW TABLES LIKE '${table}'`);
        
        if (result.length === 0) {
          console.warn(`表 ${table} 不存在，同步服务可能无法正常工作`);
        } else {
          console.log(`表 ${table} 存在`);
        }
      }
    } catch (error) {
      console.error('检查表失败:', error);
      throw error;
    }
  }

  /**
   * 启动定时同步
   * @param {Object} options 同步选项 {hour, minute, interval}
   * @returns {boolean} 是否成功启动
   */
  startSync(options = {}) {
    if (this.syncTimer) {
      console.log('同步任务已在运行中');
      return false;
    }
    
    // 更新配置
    if (options.hour !== undefined) this.syncHour = options.hour;
    if (options.minute !== undefined) this.syncMinute = options.minute;
    if (options.interval) this.syncInterval = options.interval;
    
    console.log(`启动工作任务定时同步，每天 ${this.syncHour}:${this.syncMinute} 执行`);
    
    // 立即执行一次
    this.syncWorkTasks()
      .then(result => {
        console.log('初始工作任务同步结果:', result);
      })
      .catch(error => {
        console.error('初始工作任务同步失败:', error);
      });
    
    // 设置定时器，每分钟检查一次是否需要执行
    this.syncTimer = setInterval(() => {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentDate = moment().format('YYYY-MM-DD');
      
      // 如果当前时间是配置的同步时间，且今天还没有同步过，则执行同步
      if (currentHour === this.syncHour && currentMinute === this.syncMinute && this.lastSyncDate !== currentDate) {
        console.log(`[${currentDate} ${currentHour}:${currentMinute}] 开始执行定时工作任务同步...`);
        
        this.syncWorkTasks()
          .then(result => {
            this.lastSyncDate = currentDate;
            console.log(`[${currentDate}] 工作任务同步完成:`, result);
          })
          .catch(error => {
            console.error(`[${currentDate}] 工作任务同步失败:`, error);
          });
      }
    }, 60000); // 每分钟检查一次
    
    return true;
  }

  /**
   * 停止定时同步
   * @returns {boolean} 是否成功停止
   */
  stopSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
      console.log('工作任务定时同步已停止');
      return true;
    }
    
    console.log('没有正在运行的同步任务');
    return false;
  }

  /**
   * 同步工作任务到daily_work_plans表
   * @returns {Promise<Object>} 同步结果
   */
  async syncWorkTasks() {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      console.log('开始同步工作任务到daily_work_plans表...');
      
      const today = moment().format('YYYY-MM-DD');
      const todayWeekday = moment().weekday(); // 0-6, 0=Sunday
      const todayDay = moment().date(); // 1-31
      
      const connection = await this.pool.getConnection();
      
      try {
        // 开启事务
        await connection.beginTransaction();
        
        // 查询常规工作任务
        console.log('查询今日适用的常规工作任务...');
        const [regularTasks] = await connection.execute(`
          SELECT 
            id,
            title,
            description,
            cycle_type,
            cycle_value,
            weekday_mask,
            start_time,
            duration,
            status
          FROM 
            regular_work_tasks
          WHERE 
            status = 'active' AND
            (
              (cycle_type = 'daily') OR
              (cycle_type = 'weekly' AND (weekday_mask & POW(2, ?)) > 0) OR
              (cycle_type = 'monthly' AND DAY(?) % cycle_value = 0) OR
              (cycle_type = 'custom' AND DATEDIFF(?, created_at) % cycle_value = 0)
            )
        `, [todayWeekday, today, today]);
        
        // 查询临时工作任务
        console.log('查询今日临时工作任务...');
        const [tempTasks] = await connection.execute(`
          SELECT 
            id,
            title,
            description,
            scheduled_date,
            start_time,
            duration,
            status
          FROM 
            temporary_work_tasks
          WHERE 
            scheduled_date = ? AND
            status = 'pending'
        `, [today]);
        
        console.log(`找到 ${regularTasks.length} 个常规工作任务和 ${tempTasks.length} 个临时工作任务`);
        
        // 清除今日的工作计划记录
        console.log('清除今日工作计划记录...');
        await connection.execute(`
          DELETE FROM daily_work_plans 
          WHERE plan_date = ?
        `, [today]);
        
        // 获取modbus_data_latest表中的数据点信息，以便关联
        console.log('获取Modbus数据点信息...');
        const [dataPoints] = await connection.execute(`
          SELECT 
            id,
            data_point_id,
            data_point_identifier,
            data_point_name
          FROM 
            modbus_data_latest
          ORDER BY
            id ASC
        `);
        
        console.log(`获取到 ${dataPoints.length} 个数据点信息`);
        
        // 将常规工作任务添加到daily_work_plans表
        const regularTaskResults = [];
        
        if (regularTasks.length > 0) {
          console.log('开始添加常规工作任务到daily_work_plans表...');
          
          for (let i = 0; i < regularTasks.length; i++) {
            const task = regularTasks[i];
            
            // 如果有数据点，则关联数据点信息
            let dataPoint = null;
            if (dataPoints.length > 0) {
              dataPoint = dataPoints[i % dataPoints.length];
            }
            
            console.log(`添加常规工作 "${task.title}" 到daily_work_plans表`);
            
            // 插入到daily_work_plans表
            const [result] = await connection.execute(`
              INSERT INTO daily_work_plans (
                data_point_id,
                data_point_identifier,
                data_point_name,
                work_content,
                work_type,
                work_status,
                task_id,
                plan_date
              ) VALUES (?, ?, ?, ?, 'regular', 'pending', ?, ?)
            `, [
              dataPoint ? dataPoint.data_point_id : null,
              dataPoint ? dataPoint.data_point_identifier : null,
              dataPoint ? dataPoint.data_point_name : null,
              task.description || task.title,
              task.id,
              today
            ]);
            
            regularTaskResults.push({
              taskId: task.id,
              taskTitle: task.title,
              planId: result.insertId,
              dataPointId: dataPoint ? dataPoint.data_point_id : null,
              dataPointName: dataPoint ? dataPoint.data_point_name : null
            });
          }
        }
        
        // 将临时工作任务添加到daily_work_plans表
        const tempTaskResults = [];
        
        if (tempTasks.length > 0) {
          console.log('开始添加临时工作任务到daily_work_plans表...');
          
          // 计算起始数据点索引，避免和常规任务重叠
          const startIndex = regularTasks.length % (dataPoints.length || 1);
          
          for (let i = 0; i < tempTasks.length; i++) {
            const task = tempTasks[i];
            
            // 如果有数据点，则关联数据点信息
            let dataPoint = null;
            if (dataPoints.length > 0) {
              const dataPointIndex = (startIndex + i) % dataPoints.length;
              dataPoint = dataPoints[dataPointIndex];
            }
            
            console.log(`添加临时工作 "${task.title}" 到daily_work_plans表`);
            
            // 插入到daily_work_plans表
            const [result] = await connection.execute(`
              INSERT INTO daily_work_plans (
                data_point_id,
                data_point_identifier,
                data_point_name,
                work_content,
                work_type,
                work_status,
                task_id,
                plan_date
              ) VALUES (?, ?, ?, ?, 'temporary', ?, ?, ?)
            `, [
              dataPoint ? dataPoint.data_point_id : null,
              dataPoint ? dataPoint.data_point_identifier : null,
              dataPoint ? dataPoint.data_point_name : null,
              task.description || task.title,
              task.status,
              task.id,
              today
            ]);
            
            tempTaskResults.push({
              taskId: task.id,
              taskTitle: task.title,
              planId: result.insertId,
              dataPointId: dataPoint ? dataPoint.data_point_id : null,
              dataPointName: dataPoint ? dataPoint.data_point_name : null
            });
          }
        }
        
        // 提交事务
        await connection.commit();
        
        // 记录同步日志
        const logDir = path.join(__dirname, 'logs');
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }
        
        const logPath = path.join(logDir, `work-task-sync-${today}.json`);
        const logData = {
          date: today,
          timestamp: new Date().toISOString(),
          regularTasks: {
            count: regularTasks.length,
            assignments: regularTaskResults
          },
          tempTasks: {
            count: tempTasks.length,
            assignments: tempTaskResults
          }
        };
        
        fs.writeFileSync(logPath, JSON.stringify(logData, null, 2));
        
        console.log('工作任务同步完成，日志已保存到:', logPath);
        
        return {
          success: true,
          date: today,
          regularTasksCount: regularTasks.length,
          tempTasksCount: tempTasks.length,
          regularTaskResults,
          tempTaskResults
        };
      } catch (error) {
        // 回滚事务
        await connection.rollback();
        throw error;
      } finally {
        // 释放连接
        connection.release();
      }
    } catch (error) {
      console.error('同步工作任务失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * 手动同步工作任务
   * @returns {Promise<Object>} 同步结果
   */
  async manualSync() {
    try {
      console.log('开始手动同步工作任务...');
      const result = await this.syncWorkTasks();
      console.log('手动同步完成:', result);
      return result;
    } catch (error) {
      console.error('手动同步失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// 创建单例实例
const workTaskSyncService = new WorkTaskSyncService();

module.exports = workTaskSyncService; 
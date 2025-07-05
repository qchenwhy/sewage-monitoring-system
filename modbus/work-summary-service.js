/**
 * 工作总结服务
 * 负责生成工作总结、与Dify交互、将结果存入数据库，并提供查询功能
 */

const mysql = require('mysql2/promise');
const moment = require('moment');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const dbConfig = require('./db-config').dbConfig;

class WorkSummaryService {
  constructor() {
    this.initialized = false;
    this.pool = null;
    this.difyConfig = {
      apiUrl: 'http://localhost/v1/workflows/run',
      apiKey: 'app-G7EAgcu6iGsKhhCYziT4PcZc',
      mode: 'blocking'
    };
  }

  /**
   * 初始化服务
   * @returns {Promise<boolean>} 初始化是否成功
   */
  async initialize() {
    if (this.initialized) {
      console.log('工作总结服务已初始化');
      return true;
    }

    try {
      console.log('初始化工作总结服务...');
      
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
      
      this.initialized = true;
      console.log('工作总结服务初始化成功');
      return true;
    } catch (error) {
      console.error('初始化工作总结服务失败:', error);
      return false;
    }
  }

  /**
   * 生成指定日期的工作总结
   * @param {string} date 日期，格式为YYYY-MM-DD
   * @returns {Promise<Object>} 生成结果
   */
  async generateSummary(date) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      console.log(`开始生成 ${date} 的工作总结...`);
      
      // 获取当日工作任务数据
      const workPlans = await this.getDailyWorkPlans(date);
      
      if (workPlans.length === 0) {
        return {
          success: false,
          message: `${date} 没有工作计划数据`
        };
      }
      
      // 统计任务完成情况
      const stats = this.calculateWorkStats(workPlans);
      
      // 构建任务详情文本
      const taskDetails = this.buildTaskDetailsText(workPlans);
      
      // 构建提交给Dify的内容
      const summaryContent = this.buildSummaryContent(date, workPlans, stats);
      
      // 调用Dify API生成总结
      const difyResponse = await this.callDifyAPI(summaryContent);
      
      // 保存总结到数据库
      const summaryId = await this.saveSummary({
        date,
        stats,
        taskDetails,
        summaryContent,
        difyResponse
      });
      
      return {
        success: true,
        message: `${date} 的工作总结已生成`,
        summaryId,
        stats,
        difyResponse
      };
    } catch (error) {
      console.error(`生成 ${date} 的工作总结失败:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取当日工作计划数据
   * @param {string} date 日期
   * @returns {Promise<Array>} 工作计划数据列表
   */
  async getDailyWorkPlans(date) {
    try {
      const [rows] = await this.pool.execute(`
        SELECT 
          id, 
          data_point_id, 
          data_point_identifier, 
          data_point_name, 
          work_content, 
          work_type, 
          work_status, 
          task_id,
          plan_date,
          created_at,
          updated_at
        FROM 
          daily_work_plans
        WHERE 
          plan_date = ?
        ORDER BY
          work_type, work_status
      `, [date]);
      
      return rows;
    } catch (error) {
      console.error(`获取 ${date} 的工作计划数据失败:`, error);
      throw error;
    }
  }

  /**
   * 计算工作任务统计信息
   * @param {Array} workPlans 工作计划数据列表
   * @returns {Object} 统计信息
   */
  calculateWorkStats(workPlans) {
    const stats = {
      total: workPlans.length,
      completed: 0,
      pending: 0,
      cancelled: 0,
      regularTotal: 0,
      temporaryTotal: 0,
      regularCompleted: 0,
      temporaryCompleted: 0
    };
    
    workPlans.forEach(plan => {
      // 按状态统计
      if (plan.work_status === 'completed') {
        stats.completed++;
      } else if (plan.work_status === 'pending') {
        stats.pending++;
      } else if (plan.work_status === 'cancelled') {
        stats.cancelled++;
      }
      
      // 按类型统计
      if (plan.work_type === 'regular') {
        stats.regularTotal++;
        if (plan.work_status === 'completed') {
          stats.regularCompleted++;
        }
      } else if (plan.work_type === 'temporary') {
        stats.temporaryTotal++;
        if (plan.work_status === 'completed') {
          stats.temporaryCompleted++;
        }
      }
    });
    
    return stats;
  }

  /**
   * 构建任务详情文本
   * @param {Array} workPlans 工作计划数据列表
   * @returns {string} 任务详情文本
   */
  buildTaskDetailsText(workPlans) {
    let details = '';
    
    // 分类整理任务
    const regularTasks = workPlans.filter(plan => plan.work_type === 'regular');
    const temporaryTasks = workPlans.filter(plan => plan.work_type === 'temporary');
    
    // 添加常规任务
    if (regularTasks.length > 0) {
      details += '【常规工作】\n';
      regularTasks.forEach((task, index) => {
        details += `${index + 1}. ${task.work_content} - ${this.getStatusText(task.work_status)}\n`;
      });
      details += '\n';
    }
    
    // 添加临时任务
    if (temporaryTasks.length > 0) {
      details += '【临时工作】\n';
      temporaryTasks.forEach((task, index) => {
        details += `${index + 1}. ${task.work_content} - ${this.getStatusText(task.work_status)}\n`;
      });
      details += '\n';
    }
    
    return details;
  }

  /**
   * 获取状态文本
   * @param {string} status 状态代码
   * @returns {string} 状态文本
   */
  getStatusText(status) {
    switch (status) {
      case 'pending':
        return '待处理';
      case 'completed':
        return '已完成';
      case 'cancelled':
        return '已取消';
      default:
        return status;
    }
  }

  /**
   * 构建提交给Dify的内容
   * @param {string} date 日期
   * @param {Array} workPlans 工作计划数据列表
   * @param {Object} stats 统计信息
   * @returns {string} 提交内容
   */
  buildSummaryContent(date, workPlans, stats) {
    const dateStr = moment(date).format('YYYY年MM月DD日');
    
    let content = `以下是${dateStr}的工作总结：\n\n`;
    
    // 添加统计信息
    content += `今日工作任务总计 ${stats.total} 项，其中已完成 ${stats.completed} 项，待处理 ${stats.pending} 项，已取消 ${stats.cancelled} 项。\n`;
    content += `常规工作 ${stats.regularTotal} 项，已完成 ${stats.regularCompleted} 项。\n`;
    content += `临时工作 ${stats.temporaryTotal} 项，已完成 ${stats.temporaryCompleted} 项。\n\n`;
    
    // 添加任务详情
    content += this.buildTaskDetailsText(workPlans);
    
    // 添加生成要求提示
    content += '请根据以上信息，生成一个简短但全面的工作总结报告，包括工作完成情况、主要工作内容和工作成效。';
    
    return content;
  }

  /**
   * 调用Dify API生成总结
   * @param {string} content 提交内容
   * @returns {Promise<string>} API响应
   */
  async callDifyAPI(content) {
    try {
      console.log('调用Dify API生成工作总结...');
      
      const response = await axios.post(this.difyConfig.apiUrl, {
        inputs: {
          query: content,
          workPlan: content,  // 将整个内容作为workPlan变量
          workReport: content // 将整个内容作为workReport变量
        },
        user: "system", // 添加用户标识
        stream: false,  // 不使用流式响应
        response_mode: this.difyConfig.mode
      }, {
        headers: {
          'Authorization': `Bearer ${this.difyConfig.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      // 检查响应格式
      console.log('Dify API响应结构:', JSON.stringify(response.data, null, 2).substring(0, 200) + '...');
      
      // 尝试从多种可能的响应路径中获取输出
      let output = null;
      
      if (response.data && response.data.output) {
        // 原始预期路径
        output = response.data.output;
      } else if (response.data && response.data.data && response.data.data.outputs && response.data.data.outputs.text) {
        // Workflow API响应路径
        output = response.data.data.outputs.text;
      } else if (response.data && response.data.answer) {
        // 另一种可能的响应格式
        output = response.data.answer;
      } else if (response.data && response.data.text) {
        // 简单文本响应格式
        output = response.data.text;
      }
      
      if (output) {
        return output;
      } else {
        console.error('Dify API响应格式不正确:', response.data);
        return '无法从Dify获取有效响应，请检查API配置和响应格式';
      }
    } catch (error) {
      console.error('调用Dify API失败:', error);
      
      // 构建错误信息
      let errorMessage = '调用Dify API失败';
      
      if (error.response) {
        // 服务器响应了，但状态码不在2xx范围内
        errorMessage += `: ${error.response.status} - ${error.response.statusText}`;
        if (error.response.data) {
          errorMessage += `\n详情: ${JSON.stringify(error.response.data)}`;
        }
      } else if (error.request) {
        // 请求已发送但没有收到响应
        errorMessage += ': 未收到响应，服务器可能未运行';
      } else {
        // 设置请求时发生错误
        errorMessage += `: ${error.message}`;
      }
      
      return errorMessage;
    }
  }

  /**
   * 保存总结到数据库
   * @param {Object} data 总结数据
   * @returns {Promise<number>} 总结ID
   */
  async saveSummary(data) {
    try {
      // 检查当日是否已有总结
      const [existing] = await this.pool.execute(
        'SELECT id FROM work_summaries WHERE summary_date = ?',
        [data.date]
      );
      
      let summaryId = null;
      
      if (existing.length > 0) {
        // 更新现有总结
        summaryId = existing[0].id;
        await this.pool.execute(`
          UPDATE work_summaries
          SET 
            total_tasks = ?,
            completed_tasks = ?,
            pending_tasks = ?,
            cancelled_tasks = ?,
            task_details = ?,
            summary_content = ?,
            dify_response = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [
          data.stats.total,
          data.stats.completed,
          data.stats.pending,
          data.stats.cancelled,
          data.taskDetails,
          data.summaryContent,
          data.difyResponse,
          summaryId
        ]);
        
        console.log(`更新了 ${data.date} 的工作总结 (ID: ${summaryId})`);
      } else {
        // 插入新总结
        const [result] = await this.pool.execute(`
          INSERT INTO work_summaries (
            summary_date,
            total_tasks,
            completed_tasks,
            pending_tasks,
            cancelled_tasks,
            task_details,
            summary_content,
            dify_response
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          data.date,
          data.stats.total,
          data.stats.completed,
          data.stats.pending,
          data.stats.cancelled,
          data.taskDetails,
          data.summaryContent,
          data.difyResponse
        ]);
        
        summaryId = result.insertId;
        console.log(`创建了 ${data.date} 的工作总结 (ID: ${summaryId})`);
      }
      
      return summaryId;
    } catch (error) {
      console.error('保存工作总结失败:', error);
      throw error;
    }
  }

  /**
   * 获取工作总结列表
   * @param {Object} options 查询选项 {limit, offset, startDate, endDate}
   * @returns {Promise<Object>} 查询结果
   */
  async getSummaryList(options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const limit = options.limit || 10;
      const offset = options.offset || 0;
      
      // 构建查询条件
      let conditions = [];
      let params = [];
      
      if (options.startDate) {
        conditions.push('summary_date >= ?');
        params.push(options.startDate);
      }
      
      if (options.endDate) {
        conditions.push('summary_date <= ?');
        params.push(options.endDate);
      }
      
      const whereClause = conditions.length > 0 
        ? `WHERE ${conditions.join(' AND ')}` 
        : '';
      
      // 查询总数
      const [countResult] = await this.pool.execute(
        `SELECT COUNT(*) as total FROM work_summaries ${whereClause}`,
        params
      );
      
      const total = countResult[0].total;
      
      // 查询数据
      const [rows] = await this.pool.execute(
        `SELECT 
          id, 
          summary_date, 
          total_tasks,
          completed_tasks,
          pending_tasks,
          cancelled_tasks,
          created_at,
          updated_at
        FROM 
          work_summaries
        ${whereClause}
        ORDER BY 
          summary_date DESC
        LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      
      return {
        total,
        summaries: rows
      };
    } catch (error) {
      console.error('获取工作总结列表失败:', error);
      throw error;
    }
  }

  /**
   * 获取工作总结详情
   * @param {number} id 总结ID
   * @returns {Promise<Object>} 总结详情
   */
  async getSummaryById(id) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const [rows] = await this.pool.execute(
        `SELECT 
          id, 
          summary_date, 
          total_tasks,
          completed_tasks,
          pending_tasks,
          cancelled_tasks,
          task_details,
          summary_content,
          dify_response,
          created_at,
          updated_at
        FROM 
          work_summaries
        WHERE 
          id = ?`,
        [id]
      );
      
      if (rows.length === 0) {
        throw new Error(`未找到ID为 ${id} 的工作总结`);
      }
      
      return rows[0];
    } catch (error) {
      console.error('获取工作总结详情失败:', error);
      throw error;
    }
  }

  /**
   * 按日期获取工作总结详情
   * @param {string} date 日期，格式为YYYY-MM-DD
   * @returns {Promise<Object>} 总结详情
   */
  async getSummaryByDate(date) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const [rows] = await this.pool.execute(
        `SELECT 
          id, 
          summary_date, 
          total_tasks,
          completed_tasks,
          pending_tasks,
          cancelled_tasks,
          task_details,
          summary_content,
          dify_response,
          created_at,
          updated_at
        FROM 
          work_summaries
        WHERE 
          summary_date = ?`,
        [date]
      );
      
      if (rows.length === 0) {
        return null;
      }
      
      return rows[0];
    } catch (error) {
      console.error(`获取 ${date} 的工作总结详情失败:`, error);
      throw error;
    }
  }

  /**
   * 删除工作总结
   * @param {number} id 总结ID
   * @returns {Promise<boolean>} 是否成功
   */
  async deleteSummary(id) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const [result] = await this.pool.execute(
        'DELETE FROM work_summaries WHERE id = ?',
        [id]
      );
      
      if (result.affectedRows === 0) {
        throw new Error(`未找到ID为 ${id} 的工作总结`);
      }
      
      console.log(`已删除ID为 ${id} 的工作总结`);
      return true;
    } catch (error) {
      console.error('删除工作总结失败:', error);
      throw error;
    }
  }
}

// 创建单例实例
const workSummaryService = new WorkSummaryService();

module.exports = workSummaryService; 
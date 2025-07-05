/**
 * Modbus日报生成服务
 * 用于定期生成系统运行日报
 */

const dbManager = require('./db-manager');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const schedule = require('node-schedule');

class DailyReportService {
  constructor() {
    this.initialized = false;
    this.config = {
      reportTime: '00:30:00', // 默认在每天00:30生成前一天的日报
      difyApiKey: '',
      difyApiUrl: 'https://api.dify.ai/v1/chat-messages',
      difyApplicationId: ''
    };
  }

  /**
   * 初始化服务
   * @returns {Promise<boolean>} 初始化是否成功
   */
  async initialize() {
    if (this.initialized) {
      console.log('日报生成服务已初始化');
      return true;
    }

    try {
      console.log('初始化日报生成服务...');
      
      // 检查数据库管理器是否已初始化
      if (!dbManager.initialized) {
        console.log('数据库管理器尚未初始化，正在初始化...');
        await dbManager.initialize();
      }
      
      // 加载配置
      await this.loadConfig();
      
      // 确保日报表存在
      await this.ensureTableExists();
      
      // 设置定时任务
      this.scheduleReportGeneration();
      
      this.initialized = true;
      console.log('日报生成服务初始化完成');
      return true;
    } catch (error) {
      console.error('初始化日报生成服务失败:', error);
      return false;
    }
  }

  /**
   * 加载配置
   */
  async loadConfig() {
    try {
      // 检查配置文件是否存在
      const configPath = path.join(__dirname, 'report-config.json');
      if (fs.existsSync(configPath)) {
        const configData = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configData);
        
        // 合并配置
        this.config = { ...this.config, ...config };
        console.log('已加载日报配置:', this.config);
      } else {
        // 创建默认配置文件
        fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2), 'utf8');
        console.log('已创建默认日报配置文件');
      }
    } catch (error) {
      console.error('加载日报配置失败:', error);
    }
  }

  /**
   * 确保日报表存在
   * @returns {Promise<void>}
   */
  async ensureTableExists() {
    try {
      console.log('检查并创建日报表...');
      
      if (!dbManager.pool) {
        throw new Error('数据库连接池不可用');
      }
      
      // 创建日报表
      await dbManager.pool.query(`
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
        )
      `);
      
      console.log('日报表确认存在');
    } catch (error) {
      console.error('创建日报表失败:', error);
      throw error;
    }
  }

  /**
   * 设置定时任务
   */
  scheduleReportGeneration() {
    try {
      // 解析配置的时间
      const [hour, minute, second] = this.config.reportTime.split(':').map(Number);
      
      // 创建定时任务 - 在每天指定时间运行
      const job = schedule.scheduleJob({ hour, minute, second }, async () => {
        console.log(`定时任务触发：生成日报 ${new Date().toISOString()}`);
        await this.generateDailyReport();
      });
      
      console.log(`已设置日报生成定时任务，将在每天 ${this.config.reportTime} 执行`);
      return true;
    } catch (error) {
      console.error('设置日报生成定时任务失败:', error);
      return false;
    }
  }

  /**
   * 计算昨天的日期范围
   * @returns {{startDate: string, endDate: string}} 日期范围（YYYY-MM-DD格式）
   */
  getYesterdayDateRange() {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // 格式化为YYYY-MM-DD
    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    const yesterdayStr = formatDate(yesterday);
    
    return {
      startDate: yesterdayStr,
      endDate: yesterdayStr,
      dateObj: yesterday
    };
  }

  /**
   * 从数据库获取指定日期的历史数据
   * @param {string} startDate 开始日期 (YYYY-MM-DD)
   * @param {string} endDate 结束日期 (YYYY-MM-DD)
   * @returns {Promise<Object>} 历史数据
   */
  async getHistoricalData(startDate, endDate) {
    try {
      console.log(`获取日期范围 ${startDate} 到 ${endDate} 的历史数据`);
      
      // 构建查询 - 按数据点分组获取数据
      const query = `
        SELECT 
          data_point_id, 
          data_point_name,
          MIN(value) as min_value,
          MAX(value) as max_value,
          AVG(value) as avg_value,
          COUNT(*) as count,
          DATE(timestamp) as date
        FROM 
          modbus_data_history
        WHERE 
          DATE(timestamp) BETWEEN ? AND ?
        GROUP BY 
          data_point_id, data_point_name, DATE(timestamp)
        ORDER BY 
          data_point_id, date
      `;
      
      const [historyResults] = await dbManager.pool.query(query, [startDate, endDate]);
      console.log(`查询到 ${historyResults.length} 条历史数据记录`);
      
      // 获取告警数据
      const alarmQuery = `
        SELECT 
          alarm_identifier,
          alarm_content,
          status,
          COUNT(*) as count,
          GROUP_CONCAT(triggered_time ORDER BY triggered_time SEPARATOR ', ') as trigger_times
        FROM 
          modbus_alarms
        WHERE 
          DATE(triggered_time) BETWEEN ? AND ?
        GROUP BY 
          alarm_identifier, alarm_content, status
        ORDER BY 
          COUNT(*) DESC
      `;
      
      const [alarmResults] = await dbManager.pool.query(alarmQuery, [startDate, endDate]);
      console.log(`查询到 ${alarmResults.length} 条告警汇总记录`);
      
      // 组合数据
      const reportData = {
        timeRange: {
          startDate,
          endDate,
        },
        dataPoints: {},
        alarms: {
          total: alarmResults.reduce((sum, alarm) => sum + alarm.count, 0),
          active: alarmResults.filter(a => a.status === 'active').length,
          cleared: alarmResults.filter(a => a.status === 'cleared').length,
          details: alarmResults.map(alarm => ({
            identifier: alarm.alarm_identifier,
            content: alarm.alarm_content,
            status: alarm.status,
            count: alarm.count,
            triggerTimes: alarm.trigger_times
          }))
        },
        summary: {
          dataPointCount: new Set(historyResults.map(r => r.data_point_id)).size,
          recordCount: historyResults.reduce((sum, record) => sum + record.count, 0)
        }
      };
      
      // 按数据点组织数据
      historyResults.forEach(record => {
        const dpId = record.data_point_id;
        
        if (!reportData.dataPoints[dpId]) {
          reportData.dataPoints[dpId] = {
            id: dpId,
            name: record.data_point_name,
            dateRecords: []
          };
        }
        
        reportData.dataPoints[dpId].dateRecords.push({
          date: record.date,
          minValue: record.min_value,
          maxValue: record.max_value,
          avgValue: record.avg_value,
          count: record.count
        });
      });
      
      return reportData;
    } catch (error) {
      console.error('获取历史数据失败:', error);
      throw error;
    }
  }

  /**
   * 发送数据到Dify平台生成报告
   * @param {Object} data 需要生成报告的数据
   * @returns {Promise<string>} 生成的报告内容
   */
  async generateReportWithDify(data) {
    try {
      console.log('发送数据到Dify平台生成报告');
      
      if (!this.config.difyApiKey || !this.config.difyApiUrl) {
        throw new Error('Dify API配置不完整，请检查配置文件');
      }
      
      // 准备请求体
      const requestBody = {
        inputs: { 
          data: JSON.stringify(data)
        },
        response_mode: "blocking",
        user: "modbus_system"
      };
      
      console.log('发送请求到Dify Workflow API:', this.config.difyApiUrl);
      
      // 调用Dify API
      const response = await axios.post(this.config.difyApiUrl, requestBody, {
        headers: {
          'Authorization': `Bearer ${this.config.difyApiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      // 处理多种可能的响应格式
      if (response.data && response.data.answer) {
        // 旧版Dify Chat API格式
        console.log('成功从Dify Chat API获取报告内容');
        return response.data.answer;
      } else if (response.data && response.data.data && response.data.data.outputs) {
        // 新版Workflow API格式
        console.log('成功从Dify Workflow获取报告内容');
        
        // Workflow API可能有多种输出字段
        const outputs = response.data.data.outputs;
        if (outputs.report) {
          return outputs.report;
        } else if (outputs.text) {
          return outputs.text;
        } else {
          // 尝试找到任何可能的文本字段
          for (const key in outputs) {
            if (typeof outputs[key] === 'string') {
              return outputs[key];
            }
          }
        }
        
        console.error('无法从outputs中找到有效的文本内容:', outputs);
        throw new Error('生成报告失败，未找到有效的报告内容');
      } else {
        console.error('从Dify获取报告失败，响应格式不正确:', response.data);
        throw new Error('生成报告失败，响应格式不正确');
      }
    } catch (error) {
      console.error('调用Dify API生成报告失败:', error.message);
      if (error.response) {
        console.error('Dify API响应:', error.response.data);
      }
      throw error;
    }
  }

  /**
   * 保存生成的日报到数据库
   * @param {string} reportDate 报告日期 (YYYY-MM-DD)
   * @param {string} reportContent 报告内容
   * @param {Object} rawData 原始数据
   * @returns {Promise<Object>} 保存的报告记录
   */
  async saveReport(reportDate, reportContent, rawData) {
    try {
      console.log(`保存 ${reportDate} 的日报`);
      
      const [insertResult] = await dbManager.pool.query(`
        INSERT INTO modbus_daily_reports 
        (report_date, report_type, generated_at, report_content, raw_data, status) 
        VALUES (?, 'daily', NOW(), ?, ?, 'success')
      `, [
        reportDate,
        reportContent,
        JSON.stringify(rawData)
      ]);
      
      console.log(`日报保存成功，ID: ${insertResult.insertId}`);
      
      // 返回插入的报告记录
      const [newReport] = await dbManager.pool.query(
        'SELECT * FROM modbus_daily_reports WHERE id = ?',
        [insertResult.insertId]
      );
      
      return newReport[0];
    } catch (error) {
      console.error('保存日报失败:', error);
      throw error;
    }
  }

  /**
   * 生成日报
   * @param {string} [targetDate] 可选的目标日期，默认为昨天
   * @returns {Promise<Object>} 生成的日报
   */
  async generateDailyReport(targetDate = null) {
    try {
      console.log('开始生成日报...');
      
      // 获取日期范围
      let dateRange;
      if (targetDate) {
        const date = new Date(targetDate);
        const dateStr = date.toISOString().split('T')[0];
        dateRange = {
          startDate: dateStr,
          endDate: dateStr,
          dateObj: date
        };
      } else {
        dateRange = this.getYesterdayDateRange();
      }
      
      console.log(`生成 ${dateRange.startDate} 的日报`);
      
      // 查询是否已存在该日期的日报
      const [existingReports] = await dbManager.pool.query(
        'SELECT id FROM modbus_daily_reports WHERE report_date = ? AND report_type = "daily"',
        [dateRange.startDate]
      );
      
      if (existingReports && existingReports.length > 0) {
        console.log(`${dateRange.startDate} 的日报已经存在，ID: ${existingReports[0].id}`);
        return {
          success: false,
          message: `${dateRange.startDate} 的日报已经存在`,
          reportId: existingReports[0].id
        };
      }
      
      // 获取历史数据
      const historicalData = await this.getHistoricalData(dateRange.startDate, dateRange.endDate);
      
      // 如果没有数据，创建一个简单的报告
      if (Object.keys(historicalData.dataPoints).length === 0 && historicalData.alarms.total === 0) {
        console.log(`${dateRange.startDate} 没有Modbus历史数据和告警，生成简单报告`);
        
        const simpleContent = `# Modbus系统日报\n\n**日期**: ${dateRange.startDate}\n\n**概述**: 当天系统无数据记录，也无告警产生。系统可能处于关闭状态或数据采集服务异常。建议检查系统运行状态和数据采集服务。`;
        
        // 保存简单报告
        const savedReport = await this.saveReport(
          dateRange.startDate, 
          simpleContent, 
          historicalData
        );
        
        return {
          success: true,
          message: `${dateRange.startDate} 的简单日报已生成`,
          reportId: savedReport.id,
          content: simpleContent
        };
      }
      
      // 使用Dify生成报告内容
      let reportContent;
      try {
        reportContent = await this.generateReportWithDify(historicalData);
      } catch (difyError) {
        console.error('使用Dify生成报告失败:', difyError);
        // 生成备用报告
        reportContent = this.generateFallbackReport(dateRange.startDate, historicalData);
      }
      
      // 保存报告
      const savedReport = await this.saveReport(
        dateRange.startDate, 
        reportContent, 
        historicalData
      );
      
      console.log(`${dateRange.startDate} 的日报已成功生成，ID: ${savedReport.id}`);
      
      return {
        success: true,
        message: `${dateRange.startDate} 的日报已成功生成`,
        reportId: savedReport.id,
        content: reportContent
      };
    } catch (error) {
      console.error('生成日报失败:', error);
      return {
        success: false,
        message: `生成日报失败: ${error.message}`
      };
    }
  }

  /**
   * 当Dify调用失败时生成备用报告
   * @param {string} reportDate 报告日期
   * @param {Object} data 历史数据
   * @returns {string} 生成的备用报告内容
   */
  generateFallbackReport(reportDate, data) {
    const { dataPoints, alarms, summary } = data;
    
    // 格式化日期
    const formatDate = (dateStr) => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('zh-CN');
    };
    
    // 生成标题和日期
    let report = `# Modbus系统日报（自动生成）\n\n`;
    report += `**日期**: ${formatDate(reportDate)}\n\n`;
    
    // 生成概述
    report += `## 系统运行概况\n\n`;
    report += `- 监控数据点数量: ${summary.dataPointCount}\n`;
    report += `- 记录数据总量: ${summary.recordCount}\n`;
    report += `- 告警总数: ${alarms.total}\n`;
    report += `- 活跃告警: ${alarms.active}\n`;
    report += `- 已解除告警: ${alarms.cleared}\n\n`;
    
    // 生成告警分析
    if (alarms.total > 0) {
      report += `## 告警分析\n\n`;
      report += `系统当天共产生 ${alarms.total} 个告警，其中 ${alarms.active} 个告警仍处于活跃状态，${alarms.cleared} 个告警已解除。\n\n`;
      
      // 添加告警详情表格
      report += `### 告警详情\n\n`;
      report += `| 告警内容 | 状态 | 触发次数 |\n`;
      report += `| -------- | ---- | -------- |\n`;
      
      // 只显示前5个最频繁的告警
      const topAlarms = alarms.details.slice(0, 5);
      topAlarms.forEach(alarm => {
        const status = alarm.status === 'active' ? '未解除' : '已解除';
        report += `| ${alarm.content} | ${status} | ${alarm.count} |\n`;
      });
      
      if (alarms.details.length > 5) {
        report += `\n*注: 仅显示前5个最频繁的告警*\n`;
      }
      
      report += `\n`;
    } else {
      report += `## 告警分析\n\n`;
      report += `系统当天未产生告警，运行状态正常。\n\n`;
    }
    
    // 生成数据点状态
    if (Object.keys(dataPoints).length > 0) {
      report += `## 数据点状态\n\n`;
      
      // 只显示前5个数据点
      const topDataPoints = Object.values(dataPoints).slice(0, 5);
      topDataPoints.forEach(dp => {
        report += `### ${dp.name}\n\n`;
        report += `| 日期 | 最小值 | 最大值 | 平均值 | 记录数 |\n`;
        report += `| ---- | ------ | ------ | ------ | ------ |\n`;
        
        dp.dateRecords.forEach(record => {
          const dateStr = formatDate(record.date);
          const avgValue = parseFloat(record.avgValue).toFixed(2);
          report += `| ${dateStr} | ${record.minValue} | ${record.maxValue} | ${avgValue} | ${record.count} |\n`;
        });
        
        report += `\n`;
      });
      
      if (Object.keys(dataPoints).length > 5) {
        report += `*注: 仅显示前5个数据点*\n\n`;
      }
    }
    
    // 生成建议
    report += `## 运行建议\n\n`;
    
    if (alarms.active > 0) {
      report += `1. 系统存在未解除的告警，建议及时处理。\n`;
    }
    
    if (summary.recordCount === 0) {
      report += `1. 系统当天无数据记录，建议检查数据采集服务是否正常运行。\n`;
    }
    
    report += `2. 定期检查设备运行状态和数据采集质量。\n`;
    report += `3. 维持系统各项指标在正常范围内。\n\n`;
    
    // 添加结尾
    report += `*本报告由系统自动生成，如有疑问请联系管理员。*`;
    
    return report;
  }

  /**
   * 获取日报列表
   * @param {Object} options 查询选项
   * @param {number} [options.limit=10] 返回记录数量限制
   * @param {number} [options.offset=0] 分页偏移量
   * @param {string} [options.startDate] 开始日期 (YYYY-MM-DD)
   * @param {string} [options.endDate] 结束日期 (YYYY-MM-DD)
   * @returns {Promise<{reports: Array, total: number}>} 日报列表和总数
   */
  async getReportList(options = {}) {
    try {
      const limit = options.limit || 10;
      const offset = options.offset || 0;
      
      let query = 'SELECT id, report_date, report_type, generated_at, status FROM modbus_daily_reports WHERE 1=1';
      const params = [];
      
      // 添加日期范围筛选
      if (options.startDate) {
        query += ' AND report_date >= ?';
        params.push(options.startDate);
      }
      
      if (options.endDate) {
        query += ' AND report_date <= ?';
        params.push(options.endDate);
      }
      
      // 添加类型筛选
      if (options.type) {
        query += ' AND report_type = ?';
        params.push(options.type);
      }
      
      // 获取总数
      const [countResult] = await dbManager.pool.query(
        query.replace('SELECT id, report_date, report_type, generated_at, status', 'SELECT COUNT(*) as total'), 
        params
      );
      const total = countResult[0].total;
      
      // 添加排序和分页
      query += ' ORDER BY report_date DESC, generated_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset));
      
      // 执行查询
      const [reports] = await dbManager.pool.query(query, params);
      
      return {
        reports,
        total
      };
    } catch (error) {
      console.error('获取日报列表失败:', error);
      throw error;
    }
  }

  /**
   * 获取单个日报详情
   * @param {number} reportId 日报ID
   * @returns {Promise<Object>} 日报详情
   */
  async getReportById(reportId) {
    try {
      const [reports] = await dbManager.pool.query(
        'SELECT * FROM modbus_daily_reports WHERE id = ?',
        [reportId]
      );
      
      if (!reports || reports.length === 0) {
        throw new Error(`未找到ID为 ${reportId} 的日报`);
      }
      
      return reports[0];
    } catch (error) {
      console.error('获取日报详情失败:', error);
      throw error;
    }
  }

  /**
   * 手动触发生成日报
   * @param {string} targetDate 目标日期 (YYYY-MM-DD)
   * @returns {Promise<Object>} 生成结果
   */
  async triggerReportGeneration(targetDate) {
    return this.generateDailyReport(targetDate);
  }

  /**
   * 删除指定日报
   * @param {number} reportId 日报ID
   * @returns {Promise<boolean>} 删除是否成功
   */
  async deleteReport(reportId) {
    try {
      console.log(`正在删除ID为 ${reportId} 的日报`);
      
      // 检查日报是否存在
      const [reports] = await dbManager.pool.query(
        'SELECT id FROM modbus_daily_reports WHERE id = ?',
        [reportId]
      );
      
      if (!reports || reports.length === 0) {
        throw new Error(`未找到ID为 ${reportId} 的日报`);
      }
      
      // 执行删除操作
      const [deleteResult] = await dbManager.pool.query(
        'DELETE FROM modbus_daily_reports WHERE id = ?',
        [reportId]
      );
      
      console.log(`成功删除ID为 ${reportId} 的日报，影响行数: ${deleteResult.affectedRows}`);
      return true;
    } catch (error) {
      console.error(`删除ID为 ${reportId} 的日报失败:`, error);
      throw error;
    }
  }
}

// 单例模式
let instance = null;

module.exports = {
  getInstance: () => {
    if (!instance) {
      instance = new DailyReportService();
    }
    return instance;
  }
}; 
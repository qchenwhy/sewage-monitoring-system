/**
 * 工作计划API路由
 * 用于从daily_work_plans表中提取工作计划数据
 */

const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const moment = require('moment');

// 创建数据库连接池
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '753456Chen*',
  database: process.env.DB_NAME || 'mqtt_data',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

/**
 * 获取待处理的工作计划
 * GET /api/work-plans/pending
 */
router.get('/pending', async (req, res) => {
  try {
    console.log('获取待处理的工作计划...');
    
    // 获取今天的日期
    const today = moment().format('YYYY-MM-DD');
    
    // 查询work_type为regular或temporary，且work_status为pending的记录
    const [rows] = await pool.query(`
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
        updated_at
      FROM 
        daily_work_plans
      WHERE 
        work_status = 'pending'
        AND plan_date = ?
    `, [today]);
    
    console.log(`找到 ${rows.length} 条待处理的工作计划`);
    
    // 将结果转换为更易于前端使用的格式
    const formattedResults = rows.map(row => ({
      id: row.id,
      dataPointId: row.data_point_id,
      identifier: row.data_point_identifier,
      name: row.data_point_name,
      content: row.work_content,
      type: row.work_type,
      status: row.work_status,
      taskId: row.task_id,
      planDate: row.plan_date,
      updatedAt: row.updated_at
    }));
    
    res.json({
      success: true,
      count: formattedResults.length,
      data: formattedResults
    });
    
  } catch (error) {
    console.error('获取待处理工作计划失败:', error);
    res.status(500).json({
      success: false,
      error: '获取工作计划失败',
      message: error.message
    });
  }
});

/**
 * 获取指定日期的工作计划
 * GET /api/work-plans/date/:date
 */
router.get('/date/:date', async (req, res) => {
  try {
    const { date } = req.params;
    
    // 验证日期格式
    if (!moment(date, 'YYYY-MM-DD', true).isValid()) {
      return res.status(400).json({
        success: false,
        error: '日期格式无效，请使用YYYY-MM-DD格式'
      });
    }
    
    console.log(`获取 ${date} 的工作计划...`);
    
    // 查询指定日期的工作计划
    const [rows] = await pool.query(`
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
        updated_at
      FROM 
        daily_work_plans
      WHERE 
        plan_date = ?
      ORDER BY
        work_status, work_type
    `, [date]);
    
    console.log(`找到 ${rows.length} 条工作计划`);
    
    // 将结果转换为更易于前端使用的格式
    const formattedResults = rows.map(row => ({
      id: row.id,
      dataPointId: row.data_point_id,
      identifier: row.data_point_identifier,
      name: row.data_point_name,
      content: row.work_content,
      type: row.work_type,
      status: row.work_status,
      taskId: row.task_id,
      planDate: row.plan_date,
      updatedAt: row.updated_at
    }));
    
    res.json({
      success: true,
      date: date,
      count: formattedResults.length,
      data: formattedResults
    });
    
  } catch (error) {
    console.error('获取指定日期工作计划失败:', error);
    res.status(500).json({
      success: false,
      error: '获取工作计划失败',
      message: error.message
    });
  }
});

/**
 * 标记工作计划为已完成
 * POST /api/work-plans/:id/complete
 */
router.post('/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: '缺少工作计划ID'
      });
    }
    
    // 更新记录状态为已完成
    const [result] = await pool.query(`
      UPDATE daily_work_plans
      SET work_status = 'completed'
      WHERE id = ?
    `, [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: '未找到指定的工作计划'
      });
    }
    
    console.log(`已将工作计划(ID: ${id})标记为已完成`);
    
    res.json({
      success: true,
      message: '工作计划已标记为已完成'
    });
    
  } catch (error) {
    console.error('标记工作计划完成失败:', error);
    res.status(500).json({
      success: false,
      error: '标记工作计划完成失败',
      message: error.message
    });
  }
});

module.exports = router; 
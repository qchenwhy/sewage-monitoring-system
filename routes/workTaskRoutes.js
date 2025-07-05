const express = require('express');
const router = express.Router();
const mysql = require('mysql2');
const util = require('util');

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

// 把基于回调的查询转换为基于 Promise 的查询
const query = util.promisify(pool.query).bind(pool);

/**
 * 确保工作内容相关表存在
 */
async function ensureTablesExist() {
  const sql = `
    -- 常规工作内容表
    CREATE TABLE IF NOT EXISTS regular_work_tasks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      cycle_type ENUM('daily', 'weekly', 'monthly', 'custom') NOT NULL,
      cycle_value INT DEFAULT 1,
      weekday_mask INT DEFAULT 127,
      start_time TIME NOT NULL,
      duration INT DEFAULT 60,
      status ENUM('active', 'inactive') DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_status (status),
      INDEX idx_cycle (cycle_type, cycle_value)
    );

    -- 临时工作内容表
    CREATE TABLE IF NOT EXISTS temporary_work_tasks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      scheduled_date DATE NOT NULL,
      start_time TIME NOT NULL,
      duration INT DEFAULT 60,
      status ENUM('pending', 'completed', 'cancelled') DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_date (scheduled_date),
      INDEX idx_status (status)
    );
  `;

  try {
    await query(sql);
    console.log('工作内容表检查完成');
  } catch (error) {
    console.error('确保工作内容表存在失败:', error);
  }
}

// 启动时确保表存在
ensureTablesExist();

/**
 * 获取今日工作计划
 * GET /api/work-tasks/today
 */
router.get('/today', (req, res) => {
  const today = moment().format('YYYY-MM-DD');
  const todayWeekday = moment().weekday(); // 0-6, 0=Sunday
  const todayDay = moment().date(); // 1-31

  // 1. 获取今日适用的常规工作内容
  const regularTasksSql = `
    SELECT 
      'regular' AS task_type,
      id,
      title,
      description,
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
  `;

  // 2. 获取今日的临时工作内容
  const tempTasksSql = `
    SELECT 
      'temporary' AS task_type,
      id,
      title,
      description,
      start_time,
      duration,
      status
    FROM 
      temporary_work_tasks
    WHERE 
      scheduled_date = ? AND
      status = 'pending'
  `;

  // 并行查询两种任务
  pool.getConnection((err, connection) => {
    if (err) {
      console.error('获取连接失败:', err);
      return res.status(500).json({
        success: false,
        message: '服务器错误',
        error: err.message
      });
    }

    // 查询常规任务
    connection.query(regularTasksSql, [todayWeekday, today, today], (err1, regularTasks) => {
      if (err1) {
        connection.release();
        console.error('查询常规任务失败:', err1);
        return res.status(500).json({
          success: false, 
          message: '查询常规任务失败',
          error: err1.message
        });
      }

      // 查询临时任务
      connection.query(tempTasksSql, [today], (err2, tempTasks) => {
        connection.release();
        
        if (err2) {
          console.error('查询临时任务失败:', err2);
          return res.status(500).json({
            success: false,
            message: '查询临时任务失败',
            error: err2.message
          });
        }

        // 合并并按开始时间排序
        const allTasks = [...regularTasks, ...tempTasks].sort((a, b) => {
          return moment(a.start_time, 'HH:mm:ss').diff(moment(b.start_time, 'HH:mm:ss'));
        });

        // 返回结果
        res.json({
          success: true,
          date: today,
          message: '获取今日工作计划成功',
          data: {
            total: allTasks.length,
            regularTasksCount: regularTasks.length,
            tempTasksCount: tempTasks.length,
            tasks: allTasks
          }
        });
      });
    });
  });
});

/**
 * 获取指定日期的工作计划
 * GET /api/work-tasks/date/:date
 */
router.get('/date/:date', (req, res) => {
  const date = req.params.date;
  
  // 验证日期格式
  if (!moment(date, 'YYYY-MM-DD', true).isValid()) {
    return res.status(400).json({
      success: false,
      message: '日期格式无效，请使用YYYY-MM-DD格式'
    });
  }

  const dateObj = moment(date);
  const weekday = dateObj.weekday(); // 0-6, 0=Sunday

  // 常规任务查询
  const regularTasksSql = `
    SELECT 
      'regular' AS task_type,
      id,
      title,
      description,
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
  `;

  // 临时任务查询
  const tempTasksSql = `
    SELECT 
      'temporary' AS task_type,
      id,
      title,
      description,
      start_time,
      duration,
      status
    FROM 
      temporary_work_tasks
    WHERE 
      scheduled_date = ? AND
      status != 'cancelled'
  `;

  // 并行查询
  pool.getConnection((err, connection) => {
    if (err) {
      console.error('获取连接失败:', err);
      return res.status(500).json({
        success: false,
        message: '服务器错误',
        error: err.message
      });
    }

    // 查询常规任务
    connection.query(regularTasksSql, [weekday, date, date], (err1, regularTasks) => {
      if (err1) {
        connection.release();
        console.error('查询常规任务失败:', err1);
        return res.status(500).json({
          success: false, 
          message: '查询常规任务失败',
          error: err1.message
        });
      }

      // 查询临时任务
      connection.query(tempTasksSql, [date], (err2, tempTasks) => {
        connection.release();
        
        if (err2) {
          console.error('查询临时任务失败:', err2);
          return res.status(500).json({
            success: false,
            message: '查询临时任务失败',
            error: err2.message
          });
        }

        // 合并并按开始时间排序
        const allTasks = [...regularTasks, ...tempTasks].sort((a, b) => {
          return moment(a.start_time, 'HH:mm:ss').diff(moment(b.start_time, 'HH:mm:ss'));
        });

        // 返回结果
        res.json({
          success: true,
          date: date,
          message: '获取指定日期工作计划成功',
          data: {
            total: allTasks.length,
            regularTasksCount: regularTasks.length,
            tempTasksCount: tempTasks.length,
            tasks: allTasks
          }
        });
      });
    });
  });
});

/**
 * 获取所有常规工作内容
 * GET /api/work-tasks/regular
 */
router.get('/regular', async (req, res) => {
  try {
    const regularTasks = await query('SELECT * FROM regular_work_tasks');
    res.json({ success: true, data: regularTasks });
  } catch (error) {
    console.error('获取常规工作内容失败:', error);
    res.status(500).json({ success: false, message: '获取常规工作内容失败', error: error.message });
  }
});

/**
 * 获取所有临时工作内容（支持日期范围过滤）
 * GET /api/work-tasks/temporary?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
router.get('/temporary', async (req, res) => {
  try {
    const { date } = req.query;
    let sql = 'SELECT * FROM temporary_work_tasks';
    const params = [];
    
    if (date) {
      sql += ' WHERE task_date = ?';
      params.push(date);
    }
    
    const temporaryTasks = await query(sql, params);
    res.json({ success: true, data: temporaryTasks });
  } catch (error) {
    console.error('获取临时工作内容失败:', error);
    res.status(500).json({ success: false, message: '获取临时工作内容失败', error: error.message });
  }
});

/**
 * 添加常规工作内容
 * POST /api/work-tasks/regular
 */
router.post('/regular', async (req, res) => {
  try {
    const { title, description, cycle_type, cycle_value, start_time, duration, priority = 0 } = req.body;
    
    if (!title || !cycle_type) {
      return res.status(400).json({ success: false, message: '标题和周期类型为必填项' });
    }
    
    const result = await query(
      'INSERT INTO regular_work_tasks (title, description, cycle_type, cycle_value, start_time, duration, priority) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [title, description, cycle_type, cycle_value, start_time, duration, priority]
    );
    
    res.status(201).json({ 
      success: true, 
      message: '常规工作内容添加成功', 
      data: { id: result.insertId, title, description, cycle_type, cycle_value, start_time, duration, priority } 
    });
  } catch (error) {
    console.error('添加常规工作内容失败:', error);
    res.status(500).json({ success: false, message: '添加常规工作内容失败', error: error.message });
  }
});

/**
 * 添加临时工作内容
 * POST /api/work-tasks/temporary
 */
router.post('/temporary', async (req, res) => {
  try {
    const { title, description, scheduled_date, start_time, duration, priority = 0 } = req.body;
    
    if (!title || !scheduled_date) {
      return res.status(400).json({ success: false, message: '标题和日期为必填项' });
    }
    
    const result = await query(
      'INSERT INTO temporary_work_tasks (title, description, scheduled_date, start_time, duration, priority) VALUES (?, ?, ?, ?, ?, ?)',
      [title, description, scheduled_date, start_time, duration, priority]
    );
    
    res.status(201).json({ 
      success: true, 
      message: '临时工作内容添加成功', 
      data: { id: result.insertId, title, description, scheduled_date, start_time, duration, priority } 
    });
  } catch (error) {
    console.error('添加临时工作内容失败:', error);
    res.status(500).json({ success: false, message: '添加临时工作内容失败', error: error.message });
  }
});

/**
 * 更新常规工作内容
 * PUT /api/work-tasks/regular/:id
 */
router.put('/regular/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, cycle_type, cycle_value, start_time, duration, priority, status } = req.body;
    
    if (!title || !cycle_type) {
      return res.status(400).json({ success: false, message: '标题和周期类型为必填项' });
    }
    
    const result = await query(
      'UPDATE regular_work_tasks SET title = ?, description = ?, cycle_type = ?, cycle_value = ?, start_time = ?, duration = ?, priority = ?, status = ? WHERE id = ?',
      [title, description, cycle_type, cycle_value, start_time, duration, priority, status, id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: '未找到指定的常规工作内容' });
    }
    
    res.json({ 
      success: true, 
      message: '常规工作内容更新成功', 
      data: { id, title, description, cycle_type, cycle_value, start_time, duration, priority, status } 
    });
  } catch (error) {
    console.error('更新常规工作内容失败:', error);
    res.status(500).json({ success: false, message: '更新常规工作内容失败', error: error.message });
  }
});

/**
 * 更新临时工作内容
 * PUT /api/work-tasks/temporary/:id
 */
router.put('/temporary/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, scheduled_date, start_time, duration, status, priority } = req.body;
    
    if (!title || !scheduled_date) {
      return res.status(400).json({ success: false, message: '标题和日期为必填项' });
    }
    
    const result = await query(
      'UPDATE temporary_work_tasks SET title = ?, description = ?, scheduled_date = ?, start_time = ?, duration = ?, status = ?, priority = ? WHERE id = ?',
      [title, description, scheduled_date, start_time, duration, status, priority, id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: '未找到指定的临时工作内容' });
    }
    
    res.json({ 
      success: true, 
      message: '临时工作内容更新成功', 
      data: { id, title, description, scheduled_date, start_time, duration, status, priority }
    });
  } catch (error) {
    console.error('更新临时工作内容失败:', error);
    res.status(500).json({ success: false, message: '更新临时工作内容失败', error: error.message });
  }
});

/**
 * 删除常规工作内容
 * DELETE /api/work-tasks/regular/:id
 */
router.delete('/regular/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await query('DELETE FROM regular_work_tasks WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: '未找到指定的常规工作内容' });
    }
    
    res.json({ success: true, message: '常规工作内容删除成功' });
  } catch (error) {
    console.error('删除常规工作内容失败:', error);
    res.status(500).json({ success: false, message: '删除常规工作内容失败', error: error.message });
  }
});

/**
 * 删除临时工作内容
 * DELETE /api/work-tasks/temporary/:id
 */
router.delete('/temporary/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await query('DELETE FROM temporary_work_tasks WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: '未找到指定的临时工作内容' });
    }
    
    res.json({ success: true, message: '临时工作内容删除成功' });
  } catch (error) {
    console.error('删除临时工作内容失败:', error);
    res.status(500).json({ success: false, message: '删除临时工作内容失败', error: error.message });
  }
});

/**
 * 更新临时工作内容状态（完成或取消）
 * PATCH /api/work-tasks/temporary/:id/status
 */
router.patch('/temporary/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status || !['pending', 'in_progress', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, message: '状态值无效' });
    }
    
    const result = await query(
      'UPDATE temporary_work_tasks SET status = ? WHERE id = ?',
      [status, id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: '未找到指定的临时工作内容' });
    }
    
    res.json({ 
      success: true, 
      message: '临时工作内容状态更新成功', 
      data: { id, status } 
    });
  } catch (error) {
    console.error('更新临时工作内容状态失败:', error);
    res.status(500).json({ success: false, message: '更新临时工作内容状态失败', error: error.message });
  }
});

/**
 * 获取今日工作计划
 * GET /api/work-tasks/daily-plan
 */
router.get('/daily-plan', async (req, res) => {
  try {
    const { date } = req.query;
    let sql = '';
    
    if (date) {
      // 自定义日期的工作计划
      sql = `
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
            (r.cycle_type = 'weekly' AND r.cycle_value = WEEKDAY(?) + 1) OR
            (r.cycle_type = 'monthly' AND r.cycle_value = DAY(?)) OR
            (r.cycle_type = 'custom' AND FIND_IN_SET(DATE_FORMAT(?, '%Y-%m-%d'), r.cycle_value) > 0)
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
          t.scheduled_date = ? AND
          t.status != 'cancelled'
        ORDER BY 
          start_time ASC
      `;
      
      const dailyPlan = await query(sql, [date, date, date, date]);
      res.json({ success: true, data: dailyPlan });
    } else {
      // 今日工作计划
      const dailyPlan = await query('SELECT * FROM daily_work_plan');
      res.json({ success: true, data: dailyPlan });
    }
  } catch (error) {
    console.error('获取日常工作计划失败:', error);
    res.status(500).json({ success: false, message: '获取日常工作计划失败', error: error.message });
  }
});

/**
 * 获取单个常规工作内容
 * GET /api/work-tasks/regular/:id
 */
router.get('/regular/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [task] = await query('SELECT * FROM regular_work_tasks WHERE id = ?', [id]);
    
    if (!task) {
      return res.status(404).json({ success: false, message: '未找到指定的常规工作内容' });
    }
    
    res.json({ success: true, data: task });
  } catch (error) {
    console.error('获取常规工作内容详情失败:', error);
    res.status(500).json({ success: false, message: '获取常规工作内容详情失败', error: error.message });
  }
});

/**
 * 获取单个临时工作内容
 * GET /api/work-tasks/temporary/:id
 */
router.get('/temporary/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [task] = await query('SELECT * FROM temporary_work_tasks WHERE id = ?', [id]);
    
    if (!task) {
      return res.status(404).json({ success: false, message: '未找到指定的临时工作内容' });
    }
    
    res.json({ success: true, data: task });
  } catch (error) {
    console.error('获取临时工作内容详情失败:', error);
    res.status(500).json({ success: false, message: '获取临时工作内容详情失败', error: error.message });
  }
});

module.exports = router; 
const mysql = require('mysql2/promise');

async function fixRegularTable() {
  try {
    // 创建数据库连接池
    const pool = await mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '753456Chen*',
      database: process.env.DB_NAME || 'mqtt_data',
      waitForConnections: true,
      connectionLimit: 2,
      queueLimit: 0
    });
    
    // 删除并重新创建常规工作表
    console.log('删除并重新创建常规工作表...');
    await pool.query('DROP TABLE IF EXISTS regular_work_tasks');
    
    // 创建常规工作表
    const createTableSQL = `
      CREATE TABLE regular_work_tasks (
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
    `;
    
    await pool.query(createTableSQL);
    console.log('常规工作表创建成功！');
    
    // 删除并重新创建视图
    console.log('删除并重新创建日常工作计划视图...');
    await pool.query('DROP VIEW IF EXISTS daily_work_plan');
    
    // 创建视图
    const createViewSQL = `
      CREATE VIEW daily_work_plan AS
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
    `;
    
    await pool.query(createViewSQL);
    console.log('日常工作计划视图创建成功！');
    
    // 确认表和视图创建成功
    const [regularResult] = await pool.query('DESCRIBE regular_work_tasks');
    console.log('常规工作表列:', regularResult.map(row => row.Field).join(', '));
    
    const [viewResult] = await pool.query('SHOW CREATE VIEW daily_work_plan');
    console.log('视图创建成功');
    
    pool.end();
    console.log('修复完成！');
  } catch (err) {
    console.error('修复常规工作表出错:', err);
  }
}

fixRegularTable(); 
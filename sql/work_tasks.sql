-- 创建常规工作内容表
CREATE TABLE IF NOT EXISTS regular_work_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,                        -- 自增主键
  title VARCHAR(255) NOT NULL COMMENT '工作标题',              -- 工作标题
  description TEXT COMMENT '工作描述',                          -- 工作描述
  cycle_type ENUM('daily', 'weekly', 'monthly', 'custom') NOT NULL COMMENT '周期类型：每日、每周、每月、自定义',  -- 周期类型：每日、每周、每月、自定义
  cycle_value VARCHAR(100) COMMENT '周期值，如weekly时可为1-7表示周一到周日，monthly时可为1-31',  -- 周期值，如weekly时可为1-7表示周一到周日，monthly时可为1-31
  weekday_mask INT DEFAULT 127,                             -- 周几掩码（7位二进制，从右至左分别代表周日到周六，1表示启用）
  start_time TIME COMMENT '开始时间',                             -- 开始时间
  duration INT DEFAULT 60 COMMENT '持续时间(分钟)',                        -- 持续时间（分钟）
  status ENUM('active', 'inactive') DEFAULT 'active' COMMENT '状态：活跃、非活跃',       -- 状态
  priority INT DEFAULT 0 COMMENT '优先级，数字越大优先级越高',  -- 优先级，数字越大优先级越高
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',            -- 创建时间
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', -- 更新时间
  INDEX idx_status (status),                                -- 状态索引
  INDEX idx_cycle (cycle_type, cycle_value)                 -- 周期索引
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='常规工作内容表';

-- 删除并重新创建临时工作内容表
DROP TABLE IF EXISTS temporary_work_tasks;
CREATE TABLE temporary_work_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,                        -- 自增主键
  title VARCHAR(255) NOT NULL COMMENT '工作标题',              -- 工作标题
  description TEXT COMMENT '工作描述',                          -- 工作描述
  scheduled_date DATE NOT NULL COMMENT '工作日期',                             -- 计划日期
  start_time TIME COMMENT '开始时间',                             -- 开始时间
  duration INT DEFAULT 60 COMMENT '持续时间(分钟)',                        -- 持续时间（分钟）
  status ENUM('pending', 'in_progress', 'completed', 'cancelled') DEFAULT 'pending' COMMENT '状态：待处理、进行中、已完成、已取消', -- 状态
  priority INT DEFAULT 0 COMMENT '优先级，数字越大优先级越高',  -- 优先级，数字越大优先级越高
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',            -- 创建时间
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', -- 更新时间
  INDEX idx_date (scheduled_date),                          -- 日期索引
  INDEX idx_status (status)                                 -- 状态索引
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='临时工作内容表';

-- 创建日常工作计划视图(合并当天的常规和临时工作)
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
  start_time ASC; 
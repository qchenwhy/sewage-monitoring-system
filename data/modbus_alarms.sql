-- Modbus告警记录表
CREATE TABLE IF NOT EXISTS modbus_alarms (
  id INT AUTO_INCREMENT PRIMARY KEY,                  -- 自增主键
  alarm_identifier VARCHAR(255) NOT NULL,             -- 告警标识符
  alarm_content VARCHAR(255) NOT NULL,                -- 告警内容
  triggered_time DATETIME NOT NULL,                   -- 触发时间
  cleared_time DATETIME NULL,                         -- 解除时间（如果为NULL表示告警仍然活跃）
  status ENUM('active', 'cleared') DEFAULT 'active',  -- 告警状态
  data_point_id VARCHAR(255) NULL,                    -- 关联的数据点ID
  data_point_name VARCHAR(255) NULL,                  -- 关联的数据点名称
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,      -- 记录创建时间
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, -- 记录更新时间
  INDEX idx_identifier (alarm_identifier),            -- 添加告警标识符索引
  INDEX idx_status (status),                          -- 添加状态索引
  INDEX idx_time (triggered_time, cleared_time)       -- 添加时间索引用于范围查询
); 
-- 使用mqtt_data数据库
USE mqtt_data;

-- 创建告警记录表
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

-- 确保Modbus数据历史记录表存在
CREATE TABLE IF NOT EXISTS modbus_data_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  data_point_id VARCHAR(255) NOT NULL,             -- 数据点ID
  data_point_identifier VARCHAR(255) NOT NULL,     -- 数据点标识符
  data_point_name VARCHAR(255) NOT NULL,           -- 数据点名称
  raw_value JSON NULL,                             -- 原始值
  value FLOAT NULL,                                -- 处理后的值
  formatted_value VARCHAR(255) NULL,               -- 格式化后的值（包含单位）
  quality VARCHAR(50) DEFAULT 'GOOD',              -- 数据质量
  read_time_ms INT DEFAULT 0,                      -- 读取耗时（毫秒）
  data_type VARCHAR(50) NULL,                      -- 数据类型
  change_description VARCHAR(255) NULL,            -- 数据变化描述
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, -- 时间戳
  INDEX idx_identifier (data_point_identifier),    -- 添加标识符索引用于查询
  INDEX idx_timestamp (timestamp)                  -- 添加时间戳索引用于时间范围查询
);

-- 确保Modbus数据点最新值表存在
CREATE TABLE IF NOT EXISTS modbus_data_latest (
  id INT AUTO_INCREMENT PRIMARY KEY,
  data_point_id VARCHAR(255) NOT NULL UNIQUE,      -- 数据点ID (唯一约束)
  data_point_identifier VARCHAR(255) NOT NULL UNIQUE, -- 数据点标识符 (唯一约束)
  data_point_name VARCHAR(255) NOT NULL,           -- 数据点名称
  raw_value JSON NULL,                             -- 原始值
  value FLOAT NULL,                                -- 处理后的值
  formatted_value VARCHAR(255) NULL,               -- 格式化后的值（包含单位）
  quality VARCHAR(50) DEFAULT 'GOOD',              -- 数据质量
  data_type VARCHAR(50) NULL,                      -- 数据类型
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, -- 更新时间
  UNIQUE INDEX idx_identifier (data_point_identifier)  -- 添加唯一索引确保每个数据点只有一条最新记录
); 
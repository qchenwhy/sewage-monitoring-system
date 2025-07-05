-- Modbus数据历史记录表
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

-- Modbus数据点最新值表
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
-- 创建数据模型表
CREATE TABLE IF NOT EXISTS data_models (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  identifier VARCHAR(255) NOT NULL UNIQUE,
  type ENUM('Float', 'Int', 'String', 'Boolean') NOT NULL DEFAULT 'Float',
  accessType ENUM('ReadWrite', 'ReadOnly', 'WriteOnly') NOT NULL DEFAULT 'ReadWrite',
  isStored ENUM('true', 'false') NOT NULL DEFAULT 'true',
  storageType ENUM('timed', 'change', 'immediate') DEFAULT 'timed',
  storageInterval INT DEFAULT 60,
  hasAlarm ENUM('true', 'false') NOT NULL DEFAULT 'false',
  alarmCondition ENUM('gt', 'lt', 'eq', 'neq') DEFAULT NULL,
  alarmValue VARCHAR(255) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 插入一些示例数据
INSERT INTO data_models (name, identifier, type, accessType) VALUES 
('COD浓度值', 'CODPLC', 'Float', 'ReadWrite'),
('氨氮浓度值', 'NH3', 'Float', 'ReadWrite'),
('小时流量', 'XsLi', 'Float', 'ReadWrite'),
('日流量', 'DayLi', 'Float', 'ReadWrite'),
('周流量', 'WkLi', 'Float', 'ReadWrite'),
('硝化回流1号电流值', 'XhDi1', 'Float', 'ReadWrite'),
('硝化回流2号电流值', 'XhDi2', 'Float', 'ReadWrite'),
('调节池1号电流值', 'TjDi1', 'Float', 'ReadWrite'),
('调节池2号电流值', 'TjDi2', 'Float', 'ReadWrite'),
('污泥回流1号电流值', 'WhDi1', 'Float', 'ReadWrite'),
('污泥回流2号电流值', 'WhDi2', 'Float', 'ReadWrite'),
('潜水搅拌机电流值', 'QjDi', 'Float', 'ReadWrite'),
('调节池运行时间', 'TjYS', 'Int', 'ReadWrite'); 
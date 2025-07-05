-- 创建数据库
CREATE DATABASE IF NOT EXISTS mqtt_data;

-- 使用数据库
USE mqtt_data;

-- 创建传感器数据表
CREATE TABLE IF NOT EXISTS sensor_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    value JSON NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
); 
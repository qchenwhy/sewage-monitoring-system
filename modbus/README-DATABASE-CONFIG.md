# Modbus数据库配置系统

## 概述

Modbus数据库配置系统是一套用于统一管理Modbus应用中数据库连接和操作的工具集。它提供了配置集中化、连接池管理、表结构自动化以及数据读写的便捷接口。

## 主要组件

### 1. 数据库配置模块 (`db-config.js`)

该模块负责维护数据库连接参数，并提供连接池创建功能。

**主要功能：**
- 通过环境变量或默认值获取数据库连接参数
- 创建和管理MySQL连接池
- 提供便捷的连接获取方法

**使用方法：**
```javascript
const dbConfig = require('./modbus/db-config');

// 获取数据库配置
const config = dbConfig.dbConfig;
console.log(`数据库: ${config.host}:${config.database}`);

// 创建连接池
const mysql = require('mysql2/promise');
const pool = await dbConfig.createConnectionPool(mysql);

// 获取单个连接
const connection = await dbConfig.getConnection();
```

### 2. 数据库管理器 (`db-manager.js`)

数据库管理器负责数据库的初始化、表结构维护和数据操作功能。

**主要功能：**
- 自动检查和创建必要的数据库表
- 提供数据点值的存储和读取功能
- 管理历史数据和最新值数据

**使用方法：**
```javascript
const dbManager = require('./modbus/db-manager');
const mysql = require('mysql2/promise');

// 初始化数据库管理器
await dbManager.initialize(mysql);

// 存储数据点值
const result = await dbManager.storeLatestValues(dataPoints, values);

// 获取最新值
const latestValues = await dbManager.getLatestValues();

// 获取历史数据
const historyValues = await dbManager.getHistoryValues(identifier, startTime, endTime, limit);
```

### 3. Modbus数据库服务 (`modbus-db-service.js`)

该服务将Modbus服务与数据库管理结合，提供自动数据存储和读取功能。

**主要功能：**
- 自动初始化数据库连接
- 监听Modbus数据更新事件
- 提供定时自动存储功能
- 封装数据查询和存储操作

**使用方法：**
```javascript
const modbusDbService = require('./modbus/modbus-db-service');
const mysql = require('mysql2/promise');

// 初始化服务
await modbusDbService.initialize(mysql);

// 启动自动存储（每分钟存储一次）
modbusDbService.startAutoStorage(60000);

// 手动存储当前值
const result = await modbusDbService.storeCurrentValues();

// 查询数据
const latestValues = await modbusDbService.getLatestValues();
const historyValues = await modbusDbService.getHistoryValues(identifier, startTime, endTime);
```

## 表结构

系统使用两个主要表来存储Modbus数据：

### 1. modbus_data_history

存储所有数据点的历史值记录。

| 列名 | 类型 | 描述 |
|------|------|------|
| id | INT | 自增主键 |
| data_point_id | VARCHAR(255) | 数据点ID |
| data_point_identifier | VARCHAR(255) | 数据点标识符 |
| data_point_name | VARCHAR(255) | 数据点名称 |
| raw_value | JSON | 原始值 |
| value | FLOAT | 数值 |
| formatted_value | VARCHAR(255) | 带单位的格式化值 |
| quality | VARCHAR(50) | 数据质量标志 |
| read_time_ms | INT | 读取耗时(毫秒) |
| data_type | VARCHAR(50) | 数据类型 |
| timestamp | DATETIME | 时间戳 |

### 2. modbus_data_latest

存储每个数据点的最新值。

| 列名 | 类型 | 描述 |
|------|------|------|
| id | INT | 自增主键 |
| data_point_id | VARCHAR(255) | 数据点ID (唯一) |
| data_point_identifier | VARCHAR(255) | 数据点标识符 (唯一) |
| data_point_name | VARCHAR(255) | 数据点名称 |
| raw_value | JSON | 原始值 |
| value | FLOAT | 数值 |
| formatted_value | VARCHAR(255) | 带单位的格式化值 |
| quality | VARCHAR(50) | 数据质量标志 |
| data_type | VARCHAR(50) | 数据类型 |
| updated_at | DATETIME | 更新时间 |

## 环境变量配置

可以通过环境变量配置数据库连接参数：

- `DB_HOST`: 数据库主机地址（默认: localhost）
- `DB_USER`: 数据库用户名（默认: root）
- `DB_PASSWORD`: 数据库密码
- `DB_NAME`: 数据库名称（默认: mqtt_data）
- `DB_CONNECTION_LIMIT`: 连接池大小（默认: 10）

## 测试工具

系统提供了几个测试工具来验证配置和功能：

- `test-db-config.js`: 测试数据库配置
- `test-modbus-db-service.js`: 测试Modbus数据库服务功能

## 示例

**API路由集成：**

```javascript
const express = require('express');
const router = express.Router();
const modbusDbService = require('../modbus/modbus-db-service');
const mysql = require('mysql2/promise');

// 初始化中间件
router.use(async (req, res, next) => {
  if (!modbusDbService.initialized) {
    await modbusDbService.initialize(mysql);
    modbusDbService.startAutoStorage(300000); // 每5分钟
  }
  next();
});

// 存储当前值
router.post('/store-values', async (req, res) => {
  const result = await modbusDbService.storeCurrentValues();
  res.json({ success: result.success });
});

// 获取最新值
router.get('/latest-values', async (req, res) => {
  const values = await modbusDbService.getLatestValues();
  res.json({ data: values });
});

// 获取历史数据
router.get('/history/:id', async (req, res) => {
  const values = await modbusDbService.getHistoryValues(
    req.params.id,
    req.query.start,
    req.query.end
  );
  res.json({ data: values });
});
```

## 注意事项

1. 确保MySQL服务器已安装并正常运行
2. MySQL版本要求5.7.8+（支持JSON数据类型）
3. 首次使用前需要创建数据库（数据库名默认为mqtt_data）
4. 表结构会在初始化时自动创建
5. 生产环境中建议将数据库密码通过环境变量提供，而不是硬编码 
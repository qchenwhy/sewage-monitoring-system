# Modbus 数据存储 MySQL 迁移指南

## 概述

Modbus模块的数据存储已经从基于文件的JSON存储迁移到MySQL数据库。这种变化带来以下优势：

- 更好的数据持久性和可靠性
- 更高效的查询和过滤能力
- 支持更大的数据集
- 方便与其他系统集成

## 数据库表结构

系统使用两个主要表来存储Modbus数据：

### modbus_data_history

存储所有数据点的历史值，记录每个读取或写入操作。

| 列名 | 类型 | 描述 |
|------|------|------|
| id | INT | 自增主键 |
| data_point_id | VARCHAR(255) | 数据点ID |
| data_point_identifier | VARCHAR(255) | 数据点唯一标识符 |
| data_point_name | VARCHAR(255) | 数据点显示名称 |
| raw_value | JSON | 原始值（JSON格式） |
| value | FLOAT | 转换后的数值 |
| formatted_value | VARCHAR(255) | 格式化后的值（包含单位） |
| quality | VARCHAR(50) | 数据质量标志 |
| read_time_ms | INT | 读取耗时（毫秒） |
| data_type | VARCHAR(50) | 数据类型 |
| timestamp | DATETIME | 时间戳 |

### modbus_data_latest

存储每个数据点的最新值，用于快速查询当前状态。

| 列名 | 类型 | 描述 |
|------|------|------|
| id | INT | 自增主键 |
| data_point_id | VARCHAR(255) | 数据点ID（唯一） |
| data_point_identifier | VARCHAR(255) | 数据点唯一标识符（唯一） |
| data_point_name | VARCHAR(255) | 数据点显示名称 |
| raw_value | JSON | 原始值（JSON格式） |
| value | FLOAT | 转换后的数值 |
| formatted_value | VARCHAR(255) | 格式化后的值（包含单位） |
| quality | VARCHAR(50) | 数据质量标志 |
| data_type | VARCHAR(50) | 数据类型 |
| updated_at | DATETIME | 最后更新时间 |

## 数据库设置

系统使用以下配置来连接到MySQL数据库：

```javascript
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '*******',  // 生产环境中使用安全的密码管理
  database: 'mqtt_data',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
}).promise();
```

## API端点变更

以下API端点已更新为使用MySQL数据库：

### 获取最新值

```
GET /api/modbus/latest-values
```

返回所有数据点的最新值，从`modbus_data_latest`表中获取。

### 获取历史数据

```
GET /api/modbus/history/:identifier
```

参数：
- `identifier`: 数据点标识符
- `startTime`: 开始时间（可选，格式：YYYY-MM-DD HH:MM:SS）
- `endTime`: 结束时间（可选，格式：YYYY-MM-DD HH:MM:SS）
- `limit`: 最大记录数（可选，默认100）

返回指定数据点的历史数据，从`modbus_data_history`表中获取。

### 存储当前值

```
POST /api/modbus/store-latest-values
```

将当前所有数据点的值保存到数据库中，同时更新`modbus_data_latest`和`modbus_data_history`表。

## 数据库验证与迁移

系统提供了一个验证和迁移工具，用于确保数据库结构正确设置：

```
node modbus/validate-database.js
```

此工具会：
1. 检查数据库是否存在，如果不存在则创建
2. 验证必要的表是否存在，如果不存在则创建
3. 检查表结构是否符合要求
4. 测试JSON数据类型支持

## 从旧存储迁移

如果您有旧的`values.json`文件数据，可以使用以下步骤迁移到MySQL：

1. 确保MySQL数据库已正确设置
2. 运行迁移工具（根据实际需要创建）：
   ```
   node modbus/migrate-data.js
   ```
3. 迁移完成后，可以验证数据是否正确导入

## 注意事项

- MySQL 5.7.8+版本支持JSON数据类型，建议使用此版本或更高版本
- 为了提高性能，添加了适当的索引
- 历史数据表可能会随着时间增长，建议定期归档或清理旧数据 
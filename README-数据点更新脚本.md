# 数据点更新脚本使用说明

这是一个独立的数据点更新脚本系统，用于更新数据库中的数据点值，不会修改主程序的任何代码。

## 文件说明

### 1. `update-datapoints-script.js`
主要的数据点更新脚本，包含以下功能：
- 读取数据点配置文件 (`data/data-points.json`)
- 生成模拟数据点值（支持各种数据格式）
- 更新 `modbus_data_latest` 表格
- 插入历史记录到 `modbus_data_history` 表格

### 2. `update-datapoints.bat`
Windows批处理文件，提供交互式界面来运行更新脚本。

### 3. `datapoints-scheduler.js`
定时任务调度器，可以定期自动更新数据点。

### 4. `README-数据点更新脚本.md`
本说明文档。

## 使用方法

### 方法一：手动运行（推荐新手使用）

1. 双击运行 `update-datapoints.bat`
2. 选择操作：
   - 选择 `1` - 更新所有数据点
   - 选择 `2` - 更新指定数据点（需要输入数据点标识符）
   - 选择 `3` - 退出

### 方法二：命令行运行

```bash
# 更新所有数据点
node update-datapoints-script.js

# 更新指定数据点
node update-datapoints-script.js ZHSC0 ZHSC1 ZHSR0

# 更新单个数据点
node update-datapoints-script.js XHY2GZ1
```

### 方法三：定时自动更新

```bash
# 启动定时调度器（每30秒更新一次）
node datapoints-scheduler.js
```

## 配置说明

### 数据库配置

在 `update-datapoints-script.js` 中修改数据库连接配置：

```javascript
const dbConfig = {
  host: 'localhost',        // 数据库主机
  user: 'root',            // 数据库用户名
  password: '123456',      // 数据库密码
  database: 'mqtt_data',   // 数据库名称
  port: 3306              // 数据库端口
};
```

### 定时器配置

在 `datapoints-scheduler.js` 中修改定时器配置：

```javascript
const config = {
  updateInterval: 30000,    // 更新间隔（毫秒）
  updateAll: true,         // 是否更新所有数据点
  specificDataPoints: [    // 指定要更新的数据点（当updateAll为false时）
    'ZHSC0', 'ZHSC1', 'ZHSC2'
  ],
  runImmediately: true,    // 启动时立即执行一次
  logLevel: 'info'         // 日志级别
};
```

## 支持的数据格式

脚本支持以下数据格式的模拟数据生成：

- **BIT**: 位数据（0或1）
- **POINT**: 点位数据（基于其他数据点的位解析）
- **UINT16**: 无符号16位整数（0-65535）
- **INT16**: 有符号16位整数（-32767到32767）
- **UINT32**: 无符号32位整数
- **INT32**: 有符号32位整数
- **FLOAT32/FLOAT64**: 浮点数
- **STRING**: 字符串数据

## 数据库表结构

### modbus_data_latest（最新值表）
存储每个数据点的最新值：
- `data_point_id`: 数据点ID
- `data_point_identifier`: 数据点标识符
- `data_point_name`: 数据点名称
- `raw_value`: 原始值（JSON格式）
- `value`: 数值
- `formatted_value`: 格式化值（包含单位）
- `quality`: 数据质量
- `data_type`: 数据类型
- `updated_at`: 更新时间

### modbus_data_history（历史记录表）
存储所有数据点的历史记录，字段与最新值表类似，另外包含：
- `timestamp`: 记录时间戳

## 运行示例

### 更新所有数据点
```
[2025-01-27T10:30:00.000Z] 开始数据点更新任务...
[2025-01-27T10:30:00.100Z] 成功加载 156 个数据点配置
[2025-01-27T10:30:00.200Z] 连接数据库...
[2025-01-27T10:30:00.300Z] 开始更新 156 个数据点...
[2025-01-27T10:30:00.400Z] ✓ XHY2GZ1 (消化液回流泵2号故障一): 1
[2025-01-27T10:30:00.500Z] ✓ WNHL1 (污泥回流泵1号): 0
[2025-01-27T10:30:00.600Z] ✓ ZHSC0 (综合输出数据点): 42567
...
[2025-01-27T10:30:05.000Z] ==================================================
[2025-01-27T10:30:05.000Z] 数据点更新完成！
[2025-01-27T10:30:05.000Z] 成功: 156 个
[2025-01-27T10:30:05.000Z] 失败: 0 个
```

### 定时调度器运行
```
[2025-01-27T10:30:00.000Z] [INFO] 数据点定时更新调度器启动
[2025-01-27T10:30:00.000Z] [INFO] 更新间隔: 30000ms (30秒)
[2025-01-27T10:30:00.000Z] [INFO] 更新模式: 所有数据点
[2025-01-27T10:30:00.000Z] [INFO] 调度器已启动，按 Ctrl+C 停止
```

## 注意事项

1. **数据库连接**: 确保数据库配置正确，数据库服务正在运行
2. **数据点配置**: 确保 `data/data-points.json` 文件存在且格式正确
3. **权限**: 确保数据库用户有读写权限
4. **依赖**: 需要安装 `mysql2` 包：`npm install mysql2`
5. **模拟数据**: 当前脚本生成模拟数据，实际使用时需要替换为真实数据源

## 故障排除

### 常见错误

1. **数据库连接失败**
   - 检查数据库配置
   - 确认数据库服务运行状态
   - 验证用户名密码

2. **数据点配置文件不存在**
   - 确认 `data/data-points.json` 文件存在
   - 检查文件路径和权限

3. **表不存在**
   - 运行数据库初始化脚本
   - 检查表结构是否正确

### 调试模式

可以修改日志级别来获取更详细的信息：
```javascript
// 在脚本中设置更详细的日志
console.log('调试信息:', JSON.stringify(dataPoint, null, 2));
```

## 扩展功能

### 添加真实数据源

要替换模拟数据为真实数据，修改 `generateDataPointValue` 函数：

```javascript
function generateDataPointValue(dataPoint) {
  // 替换为真实的数据获取逻辑
  // 例如：从MQTT、Modbus、HTTP API等获取数据
  
  if (dataPoint.dataSourceType === 'mqtt') {
    // 从MQTT获取数据
    return getMQTTValue(dataPoint.mqttTopic);
  } else if (dataPoint.dataSourceType === 'modbus') {
    // 从Modbus获取数据
    return getModbusValue(dataPoint.address);
  }
  
  // 默认返回模拟数据
  return generateSimulatedValue(dataPoint);
}
```

### 添加告警处理

可以在数据更新时检查告警条件：

```javascript
function checkAlarms(dataPoint, newValue, oldValue) {
  if (dataPoint.alarmEnabled) {
    // 检查告警条件
    // 触发告警通知
  }
}
```

## 技术支持

如有问题，请检查：
1. 日志输出中的错误信息
2. 数据库连接状态
3. 数据点配置文件格式
4. 系统资源使用情况 
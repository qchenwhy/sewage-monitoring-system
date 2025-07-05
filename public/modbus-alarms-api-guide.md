# Modbus告警API指南

本文档介绍了Modbus系统中与告警相关的API接口，包括数据库存储和查询功能。

## 1. 告警数据API概述

系统现在支持将告警信息存储到数据库中，并提供了一系列API来访问这些数据。主要功能包括：

- 自动将触发的告警信息存储到数据库
- 自动记录告警解除信息
- 查询当前活跃的告警列表
- 查询历史告警记录，支持时间范围和状态筛选

## 2. 告警数据表结构

告警数据存储在`modbus_alarms`表中，主要字段包括：

| 字段名 | 类型 | 描述 |
|-------|------|------|
| id | INT | 自增主键 |
| alarm_identifier | VARCHAR(255) | 告警标识符 |
| alarm_content | VARCHAR(255) | 告警内容 |
| triggered_time | DATETIME | 触发时间 |
| cleared_time | DATETIME | 解除时间（NULL表示尚未解除） |
| status | ENUM | 状态：'active'或'cleared' |
| data_point_id | VARCHAR(255) | 关联的数据点ID（可选） |
| data_point_name | VARCHAR(255) | 关联的数据点名称（可选） |
| created_at | DATETIME | 记录创建时间 |
| updated_at | DATETIME | 记录更新时间 |

## 3. API接口列表

### 3.1 获取当前活跃告警列表

从数据库中获取当前所有状态为`active`的告警。

**请求方式：** GET

**URL：** `/api/modbus/alarms/active-db`

**参数：** 无

**返回示例：**

```json
{
  "success": true,
  "alarms": [
    {
      "id": 1,
      "alarm_identifier": "pressure_high",
      "alarm_content": "压力过高告警",
      "triggered_time": "2023-05-01T08:30:45.000Z",
      "cleared_time": null,
      "status": "active",
      "data_point_id": "dp123",
      "data_point_name": "压力传感器",
      "created_at": "2023-05-01T08:30:45.000Z",
      "updated_at": "2023-05-01T08:30:45.000Z"
    }
  ],
  "count": 1
}
```

### 3.2 获取告警历史记录

从数据库中获取告警历史记录，支持时间范围和状态筛选。

**请求方式：** GET

**URL：** `/api/modbus/alarms/history`

**参数：**

| 参数名 | 类型 | 必填 | 描述 |
|-------|------|------|------|
| startTime | String | 否 | 开始时间（ISO格式） |
| endTime | String | 否 | 结束时间（ISO格式） |
| status | String | 否 | 告警状态：'active'或'cleared' |
| limit | Number | 否 | 返回记录数量限制，默认100 |
| offset | Number | 否 | 分页偏移量，默认0 |

**返回示例：**

```json
{
  "success": true,
  "alarms": [
    {
      "id": 2,
      "alarm_identifier": "temp_high",
      "alarm_content": "温度过高告警",
      "triggered_time": "2023-05-01T10:15:30.000Z",
      "cleared_time": "2023-05-01T10:30:45.000Z",
      "status": "cleared",
      "data_point_id": "dp456",
      "data_point_name": "温度传感器",
      "created_at": "2023-05-01T10:15:30.000Z",
      "updated_at": "2023-05-01T10:30:45.000Z"
    },
    {
      "id": 1,
      "alarm_identifier": "pressure_high",
      "alarm_content": "压力过高告警",
      "triggered_time": "2023-05-01T08:30:45.000Z",
      "cleared_time": null,
      "status": "active",
      "data_point_id": "dp123",
      "data_point_name": "压力传感器",
      "created_at": "2023-05-01T08:30:45.000Z",
      "updated_at": "2023-05-01T08:30:45.000Z"
    }
  ],
  "count": 2,
  "pagination": {
    "limit": 100,
    "offset": 0
  }
}
```

### 3.3 触发告警（自动存储到数据库）

触发新告警，同时存储到数据库中。

**请求方式：** POST

**URL：** `/api/modbus/alarms/update`

**请求体：**

```json
{
  "identifier": "pressure_high",
  "content": "压力过高告警",
  "triggerTime": "2023-05-01T08:30:45.000Z"
}
```

**返回示例：**

```json
{
  "success": true,
  "message": "告警状态已更新",
  "alarm": {
    "identifier": "pressure_high",
    "content": "压力过高告警",
    "triggerTime": "2023-05-01T08:30:45.000Z"
  }
}
```

### 3.4 清除告警（自动更新数据库）

清除告警，同时更新数据库中的告警记录状态。

**请求方式：** POST

**URL：** `/api/modbus/alarms/clear`

**请求体：**

```json
{
  "identifier": "pressure_high",
  "content": "压力过高告警",
  "clearedTime": "2023-05-01T09:45:30.000Z"
}
```

**返回示例：**

```json
{
  "success": true,
  "message": "告警已清除",
  "alarm": {
    "identifier": "pressure_high",
    "content": "压力过高告警",
    "clearedTime": "2023-05-01T09:45:30.000Z"
  }
}
```

## 4. 使用示例

### 4.1 JavaScript示例

```javascript
// 获取活跃告警列表（从数据库）
async function fetchActiveAlarmsFromDB() {
  try {
    const response = await fetch('/api/modbus/alarms/active-db');
    const data = await response.json();
    
    if (data.success) {
      console.log(`获取到 ${data.count} 个活跃告警:`, data.alarms);
      return data.alarms;
    } else {
      console.error('获取活跃告警失败:', data.error);
      return [];
    }
  } catch (error) {
    console.error('请求失败:', error);
    return [];
  }
}

// 获取过去24小时的告警历史
async function fetchAlarmHistory() {
  try {
    // 计算24小时前的时间
    const endTime = new Date().toISOString();
    const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const url = `/api/modbus/alarms/history?startTime=${startTime}&endTime=${endTime}&limit=50`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.success) {
      console.log(`获取到 ${data.count} 条告警历史:`, data.alarms);
      return data.alarms;
    } else {
      console.error('获取告警历史失败:', data.error);
      return [];
    }
  } catch (error) {
    console.error('请求失败:', error);
    return [];
  }
}
```

### 4.2 Python示例

```python
import requests
from datetime import datetime, timedelta

# 获取活跃告警列表
def get_active_alarms():
    try:
        response = requests.get('http://localhost:3000/api/modbus/alarms/active-db')
        if response.status_code == 200:
            data = response.json()
            print(f"获取到 {data['count']} 个活跃告警")
            return data['alarms']
        else:
            print(f"请求失败: {response.status_code}")
            return []
    except Exception as e:
        print(f"发生错误: {str(e)}")
        return []

# 获取过去7天的已解除告警
def get_cleared_alarms():
    try:
        # 计算7天前的时间
        end_time = datetime.now().isoformat()
        start_time = (datetime.now() - timedelta(days=7)).isoformat()
        
        params = {
            'startTime': start_time,
            'endTime': end_time,
            'status': 'cleared',
            'limit': 100
        }
        
        response = requests.get('http://localhost:3000/api/modbus/alarms/history', params=params)
        if response.status_code == 200:
            data = response.json()
            print(f"获取到 {data['count']} 条已解除告警")
            return data['alarms']
        else:
            print(f"请求失败: {response.status_code}")
            return []
    except Exception as e:
        print(f"发生错误: {str(e)}")
        return []
```

## 5. 注意事项

1. 所有时间都使用ISO 8601格式（例如：`2023-05-01T08:30:45.000Z`）
2. 告警数据默认按触发时间降序排序（最新的告警优先显示）
3. 当未提供时间参数时，告警历史查询默认返回所有历史记录
4. 触发和清除告警操作不需要手动调用数据库API，系统会自动存储相关信息 
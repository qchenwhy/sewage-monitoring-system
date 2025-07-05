# Modbus API 接口说明文档

## 概述

本文档详细说明了Modbus系统提供的API接口，包括数据查询和写入功能。这些API接口可用于与PLC设备进行通信，获取或修改设备状态。

## 目录

- [数据写入接口](#数据写入接口)
- [数据查询接口](#数据查询接口)
- [设备连接管理](#设备连接管理)
- [数据点管理](#数据点管理)
- [位级别操作](#位级别操作)
- [使用示例](#使用示例)

## 数据写入接口

### 通过名称写入数据

该接口支持通过数据点名称进行模糊匹配写入，适合于人工操作或前端界面使用。

```
POST /api/modbus/write-by-name
```

请求体：
```json
{
  "name": "调节池泵2",
  "value": 1
}
```

参数说明：
- `name`: 数据点名称，支持模糊匹配
- `value`: 要写入的值，根据数据点类型自动转换

成功响应：
```json
{
  "success": true,
  "dataName": "调节池提升泵2",
  "usedName": "调节池泵2",
  "value": 1,
  "formattedValue": "1",
  "timestamp": "2023-04-22T08:30:25.123Z"
}
```

**错误响应**:
```json
{
  "success": false,
  "error": "数据点名称不存在",
  "suggestion": "请检查数据点名称是否正确",
  "availablePoints": [
    {"name": "调节池提升泵1", "identifier": "TjT1", "accessMode": "readwrite", "format": "UINT16"},
    {"name": "调节池提升泵2", "identifier": "TjT2", "accessMode": "readwrite", "format": "UINT16"}
  ]
}
```

### 通过标识符写入数据

该接口通过数据点唯一标识符进行写入，适合系统间集成使用。

```
POST /api/modbus/write
```

请求体：
```json
{
  "identifier": "TjT2",
  "value": 1
}
```

参数说明：
- `identifier`: 数据点唯一标识符，需精确匹配
- `value`: 要写入的值，根据数据点类型自动转换

**成功响应**:
```json
{
  "success": true,
  "data": {
    "identifier": "TjT2",
    "value": 1,
    "rawResult": {
      "address": 12,
      "value": 1,
      "formattedValue": "1"
    },
    "timestamp": "2023-04-22T08:30:25.123Z"
  }
}
```

**错误响应**:
```json
{
  "success": false,
  "error": "数据点不存在",
  "details": "数据点 TjT2 不存在"
}
```

### 命令式写入接口

该接口通过URL参数进行写入，适合简单集成或快速测试使用。

```
GET /api/modbus/cmd/write?dataName=调节池泵2&value=1
```

参数说明：
- `dataName`: 数据点名称，支持模糊匹配
- `value`: 要写入的值，根据数据点类型自动转换

**成功响应**:
```json
{
  "success": true,
  "dataName": "调节池提升泵2",
  "usedName": "调节池泵2",
  "value": 1,
  "formattedValue": "1",
  "timestamp": "2023-04-22T08:30:25.123Z"
}
```

**错误响应**:
```json
{
  "success": false,
  "error": "数据点名称不存在",
  "suggestion": "请检查数据点名称是否正确",
  "availablePoints": [
    {"name": "调节池提升泵1", "identifier": "TjT1", "accessMode": "readwrite", "format": "UINT16"},
    {"name": "调节池提升泵2", "identifier": "TjT2", "accessMode": "readwrite", "format": "UINT16"}
  ]
}
```

## 数据查询接口

### 获取所有数据点当前值

获取所有数据点的实时读取值，这些值来自PLC设备的实时读取，未经过存储。

```
GET /api/modbus/values
```

**成功响应**:
```json
{
  "success": true,
  "data": {
    "TjT1": {
      "value": 0,
      "formattedValue": "0",
      "quality": "GOOD",
      "timestamp": "2023-04-22T08:30:25.123Z"
    },
    "TjT2": {
      "value": 1,
      "formattedValue": "1",
      "quality": "GOOD",
      "timestamp": "2023-04-22T08:30:25.123Z"
    }
  }
}
```

### 获取最新存储值

获取存储在数据库中的所有数据点的最新值。这些值是最后一次存储在数据库的数据。

```
GET /api/modbus/latest-values
```
或
```
GET /api/modbus/values/latest
```

**成功响应**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "data_point_id": "123456",
      "data_point_identifier": "TjT2",
      "data_point_name": "调节池提升泵2",
      "value": 1,
      "formatted_value": "1",
      "quality": "GOOD",
      "updated_at": "2023-04-22T08:30:25.123Z"
    }
  ],
  "timestamp": "2023-04-22T08:30:25.123Z"
}
```

### 查询单个数据点历史数据

查询指定数据点的历史记录，可指定时间范围和数量限制。

```
GET /api/modbus/history/TjT2?startTime=2023-04-20T00:00:00Z&endTime=2023-04-22T23:59:59Z&limit=100
```

参数说明：
- `startTime`: 开始时间，ISO格式
- `endTime`: 结束时间，ISO格式
- `limit`: 返回结果数量限制，默认100

**成功响应**:
```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "data_point_id": "123456",
      "data_point_identifier": "TjT2",
      "data_point_name": "调节池提升泵2",
      "value": 1,
      "formatted_value": "1",
      "quality": "GOOD",
      "timestamp": "2023-04-22T08:30:25.123Z"
    },
    {
      "id": 122,
      "data_point_id": "123456",
      "data_point_identifier": "TjT2",
      "data_point_name": "调节池提升泵2",
      "value": 0,
      "formatted_value": "0",
      "quality": "GOOD",
      "timestamp": "2023-04-21T15:45:10.567Z"
    }
  ],
  "count": 2,
  "identifier": "TjT2",
  "query": {
    "startTime": "2023-04-20T00:00:00Z",
    "endTime": "2023-04-22T23:59:59Z",
    "limit": "100"
  }
}
```

### 查询多个数据点历史数据

同时查询多个数据点在指定时间段内的历史数据。

```
POST /api/modbus/history/multi
```

请求体：
```json
{
  "identifiers": ["TjT1", "TjT2"],
  "startTime": "2023-04-20T00:00:00Z",
  "endTime": "2023-04-22T23:59:59Z",
  "limit": 50
}
```

参数说明：
- `identifiers`: 数据点标识符数组
- `startTime`: 开始时间，ISO格式
- `endTime`: 结束时间，ISO格式
- `limit`: 每个数据点的返回结果数量限制，默认100

**成功响应**:
```json
{
  "success": true,
  "results": {
    "TjT1": {
      "name": "调节池提升泵1",
      "data": [
        {
          "id": 125,
          "data_point_identifier": "TjT1",
          "data_point_name": "调节池提升泵1",
          "value": 1,
          "formatted_value": "1",
          "quality": "GOOD",
          "timestamp": "2023-04-22T08:30:25.123Z"
        }
      ],
      "count": 1
    },
    "TjT2": {
      "name": "调节池提升泵2",
      "data": [
        {
          "id": 123,
          "data_point_identifier": "TjT2",
          "data_point_name": "调节池提升泵2",
          "value": 1,
          "formatted_value": "1",
          "quality": "GOOD",
          "timestamp": "2023-04-22T08:30:25.123Z"
        }
      ],
      "count": 1
    }
  },
  "timeRange": {
    "startTime": "2023-04-20T00:00:00Z",
    "endTime": "2023-04-22T23:59:59Z"
  },
  "timestamp": "2023-04-22T08:30:25.123Z"
}
```

### 存储当前数据点值

将当前所有数据点的值存储到数据库中。

```
POST /api/modbus/store-latest-values
```

**成功响应**:
```json
{
  "success": true,
  "data": {
    "totalPoints": 10,
    "storedCount": 10,
    "insertedCount": 2,
    "updatedCount": 8,
    "timestamp": "2023-04-22T08:30:25.123Z"
  }
}
```

## 设备连接管理

### 检查连接状态

检查当前与PLC设备的连接状态。

```
GET /api/modbus/connection
```

**成功响应**:
```json
{
  "success": true,
  "data": {
    "isConnected": true,
    "config": {
      "host": "192.168.1.100",
      "port": 502,
      "unitId": 1
    },
    "details": {
      "connectionTime": "2023-04-22T08:30:25.123Z",
      "reconnectAttempts": 0,
      "lastError": null,
      "pollingActive": true,
      "pollingInterval": 1000
    }
  }
}
```

### 建立连接

建立与PLC设备的连接。

```
POST /api/modbus/connection
```

请求体：
```json
{
  "config": {
    "host": "192.168.1.100",
    "port": 502,
    "unitId": 1,
    "timeout": 5000
  }
}
```

**成功响应**:
```json
{
  "success": true,
  "data": {
    "isConnected": true,
    "config": {
      "host": "192.168.1.100",
      "port": 502,
      "unitId": 1,
      "timeout": 5000
    }
  }
}
```

### 断开连接

断开与PLC设备的连接。

```
DELETE /api/modbus/connection
```

**成功响应**:
```json
{
  "success": true,
  "data": {
    "isConnected": false,
    "config": {
      "host": "192.168.1.100",
      "port": 502,
      "unitId": 1
    }
  }
}
```

## 数据点管理

### 获取所有数据点

获取系统中配置的所有数据点信息。

```
GET /api/modbus/datapoints
```

**成功响应**:
```json
[
  {
    "id": "123456",
    "name": "调节池提升泵2",
    "identifier": "TjT2",
    "address": 12,
    "accessMode": "readwrite",
    "readFunctionCode": 3,
    "writeFunctionCode": 6,
    "format": "UINT16",
    "scale": 1,
    "unit": "",
    "description": "调节池提升泵2启停控制"
  }
]
```

### 添加数据点

添加新的数据点配置。

```
POST /api/modbus/datapoints
```

请求体：
```json
{
  "name": "调节池提升泵3",
  "identifier": "TjT3",
  "address": 16,
  "accessMode": "readwrite",
  "readFunctionCode": 3,
  "writeFunctionCode": 6,
  "format": "UINT16",
  "scale": 1,
  "unit": "",
  "description": "调节池提升泵3启停控制"
}
```

**成功响应**:
```json
{
  "success": true,
  "data": {
    "id": "789012",
    "name": "调节池提升泵3",
    "identifier": "TjT3",
    "address": 16,
    "accessMode": "readwrite",
    "readFunctionCode": 3,
    "writeFunctionCode": 6,
    "format": "UINT16",
    "scale": 1,
    "unit": "",
    "description": "调节池提升泵3启停控制",
    "createdAt": "2023-04-22T08:30:25.123Z"
  }
}
```

### 更新数据点

更新现有数据点的配置。

```
PUT /api/modbus/datapoints/:id
```

### 删除数据点

删除数据点配置。

```
DELETE /api/modbus/datapoints/:id
```

## 位级别操作

### 概述

位级别操作允许在单个寄存器中访问和控制特定的位（bit），这在控制面板的指示灯、开关等场景中非常有用。通过位操作，可以在不影响寄存器其他位的情况下，读取或修改特定位的状态。

### 位级别数据点

位级别数据点是一种特殊类型的数据点，它不仅包含寄存器地址，还包含该寄存器内的特定位位置（0-15）。创建位级别数据点时，需要指定以下参数：

- **名称**: 数据点名称
- **标识符**: 唯一标识符
- **地址**: 寄存器地址
- **bitPosition**: 位位置（0-15，其中0是最低位，15是最高位）
- **访问模式**: 读、写或读写
- **功能码**: 读取和写入功能码

### 读取位值

读取位级别数据点时，系统会执行以下操作：

1. 读取整个寄存器的值
2. 提取指定位置的位值（0或1）
3. 返回该位的值

```
GET /api/modbus/read/{identifier}
```

响应示例：

```json
{
  "success": true,
  "id": "motor1_start_bit",
  "name": "电机1启动位",
  "address": 100,
  "value": 1,
  "formattedValue": "1",
  "quality": "GOOD",
  "timestamp": "2023-05-10T08:30:15.123Z"
}
```

### 写入位值

写入位级别数据点时，系统会执行以下操作：

1. 读取当前寄存器的值
2. 根据写入的值（0或1）修改特定位，同时保持其他位不变
3. 将修改后的整个寄存器值写回设备

```
POST /api/modbus/write
```

请求体：

```json
{
  "identifier": "motor1_start_bit",
  "value": 1
}
```

响应示例：

```json
{
  "success": true,
  "dataPoint": {
    "id": "motor1_start_bit",
    "name": "电机1启动位",
    "address": 100,
    "bitPosition": 2
  },
  "value": 1,
  "originalValue": 1,
  "formattedValue": "1",
  "timestamp": "2023-05-10T08:30:20.456Z"
}
```

### 读取多个位（新增API）

读取指定寄存器地址的多个位或全部位：

```
POST /api/modbus/bits/read
```

请求体：
```json
{
  "address": 100,
  "readAll": true
}
```

或指定特定位置：
```json
{
  "address": 100,
  "bitPositions": [0, 2, 4, 6]
}
```

参数说明：
- `address`: 寄存器地址（必需）
- `readAll`: 是否读取所有位（布尔值，与bitPositions二选一）
- `bitPositions`: 需要读取的位位置数组（与readAll二选一）

响应示例：
```json
{
  "success": true,
  "data": {
    "registerValue": 37,
    "binaryString": "0000000000100101",
    "hexValue": "0x0025",
    "bits": {
      "0": 1,
      "2": 1,
      "5": 1,
      "all": {
        "0": 1,
        "1": 0,
        "2": 1,
        "3": 0,
        "4": 0,
        "5": 1,
        "6": 0,
        "7": 0,
        "8": 0,
        "9": 0,
        "10": 0,
        "11": 0,
        "12": 0,
        "13": 0,
        "14": 0,
        "15": 0
      }
    },
    "timestamp": "2023-05-10T08:30:25.123Z"
  }
}
```

### 写入多个位（新增API）

同时修改寄存器中的多个位：

```
POST /api/modbus/bits/write
```

请求体：
```json
{
  "address": 100,
  "bitValues": [
    {"position": 0, "value": 1},
    {"position": 2, "value": 0},
    {"position": 5, "value": 1}
  ]
}
```

参数说明：
- `address`: 寄存器地址（必需）
- `bitValues`: 要修改的位值数组，每个对象包含位置(position)和值(value)

响应示例：
```json
{
  "success": true,
  "data": {
    "address": 100,
    "originalValue": 4,
    "newValue": 36,
    "originalHex": "0x0004",
    "newHex": "0x0024",
    "originalBinary": "0000000000000100",
    "newBinary": "0000000000100100",
    "modifiedBits": [
      {"position": 0, "value": 0, "newValue": 1},
      {"position": 2, "value": 1, "newValue": 0},
      {"position": 5, "value": 0, "newValue": 1}
    ],
    "timestamp": "2023-05-10T08:30:30.456Z"
  }
}
```

### 直接读写寄存器

除了通过数据点标识符操作位外，系统还提供了直接读写整个寄存器的API：

```
POST /api/modbus/read-register
```

请求体：
```json
{
  "address": 100,
  "functionCode": 3
}
```

```
POST /api/modbus/write-register
```

请求体：
```json
{
  "address": 100,
  "value": 4,
  "functionCode": 6
}
```

### 位操作测试工具

系统提供了位操作的测试工具，可通过以下URL访问：

```
http://localhost:3000/bits-operation.html
```

该工具提供以下功能：

- 添加位级别数据点
- 查看位级别数据点列表
- 直接读写寄存器的特定位
- 寄存器位状态的可视化展示
- 多位选择和批量操作功能

### 注意事项

1. 位位置必须在0-15范围内（16位寄存器）
2. 位值只能是0或1
3. 写入位值时，不会影响同一寄存器中的其他位
4. 位操作通常使用保持寄存器功能码（读取=3，写入=6）
5. 多位操作API可以一次读取或修改多个位，提高操作效率

## 使用示例

### JavaScript (fetch) 示例

```javascript
// 写入数据示例
async function writeDataPoint() {
  try {
    const response = await fetch('/api/modbus/write-by-name', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: '调节池泵2',
        value: 1
      })
    });
    
    const result = await response.json();
    console.log('写入结果:', result);
  } catch (error) {
    console.error('写入失败:', error);
  }
}

// 查询历史数据示例
async function queryHistory() {
  try {
    const response = await fetch('/api/modbus/history/multi', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        identifiers: ['TjT1', 'TjT2'],
        startTime: '2023-04-20T00:00:00Z',
        endTime: '2023-04-22T23:59:59Z',
        limit: 50
      })
    });
    
    const result = await response.json();
    console.log('历史数据:', result);
  } catch (error) {
    console.error('查询失败:', error);
  }
}
```

### 位操作示例

```javascript
// 读取位值
async function readBitValue(identifier) {
  try {
    const response = await fetch(`/api/modbus/read/${identifier}`);
    const data = await response.json();
    
    if (data.success) {
      console.log(`位值: ${data.value}`);
    } else {
      console.error(`读取失败: ${data.error}`);
    }
  } catch (error) {
    console.error('读取错误:', error);
  }
}

// 写入位值
async function writeBitValue(identifier, value) {
  try {
    const response = await fetch('/api/modbus/write', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        identifier,
        value: value === 1 ? 1 : 0
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log(`写入成功，新值: ${data.value}`);
    } else {
      console.error(`写入失败: ${data.error}`);
    }
  } catch (error) {
    console.error('写入错误:', error);
  }
}
```

### Python 示例

```python
import requests
import json
from datetime import datetime, timedelta

# 设置API基础URL
BASE_URL = 'http://localhost:3000/api/modbus'

# 写入数据示例
def write_data_point():
    url = f"{BASE_URL}/write-by-name"
    payload = {
        "name": "调节池泵2",
        "value": 1
    }
    
    response = requests.post(url, json=payload)
    if response.status_code == 200:
        result = response.json()
        print(f"写入成功: {result}")
    else:
        print(f"写入失败: {response.text}")

# 写入位值示例
def write_bit_value(identifier, bit_value):
    url = f"{BASE_URL}/write"
    payload = {
        "identifier": identifier,
        "value": bit_value  # 0或1
    }
    
    response = requests.post(url, json=payload)
    if response.status_code == 200:
        result = response.json()
        print(f"位写入成功: {result}")
    else:
        print(f"位写入失败: {response.text}")
```

### cURL 示例

```bash
# 命令式写入（更简单）- Windows环境
curl -G "http://localhost:3000/api/modbus/cmd/write" ^
  --data-urlencode "dataName=调节池泵2" ^
  --data-urlencode "value=1"

# 位操作 - 读取寄存器值 - Windows环境
curl -X POST http://localhost:3000/api/modbus/read-register ^
  -H "Content-Type: application/json" ^
  -d "{\"address\":100,\"functionCode\":3}"

# 位操作 - 写入寄存器特定位 - Windows环境
curl -X POST http://localhost:3000/api/modbus/write ^
  -H "Content-Type: application/json" ^
  -d "{\"identifier\":\"motor1_start_bit\",\"value\":1}"
```

## 注意事项

- 所有时间格式均使用ISO 8601标准（例如：`2023-04-22T08:30:25.123Z`）
- 数据值类型根据数据点格式自动转换
- 模糊匹配功能会返回最相似的数据点，并在响应中包含`usedName`字段
- 在写入不存在的数据点时，API会返回可用的数据点列表作为参考
- 位级别操作可以独立控制寄存器内的单个位，而不影响其他位
- 位位置（bitPosition）的有效范围是0-15，对应16位寄存器

## 告警控制接口

系统提供了API接口用于控制告警的播放状态，方便在自动化集成或远程控制场景下管理告警。

### 停止所有告警循环

停止当前正在进行的所有告警播放和循环，用于紧急情况下快速消除告警提示音。

```
POST /api/modbus/alarms/stop
```

请求体：
```json
{}
```

**成功响应**:
```json
{
  "success": true,
  "message": "已停止所有告警循环"
}
```

### 切换告警暂停状态

暂停或恢复当前告警的播放状态，允许临时屏蔽告警或恢复已暂停的告警。

```
POST /api/modbus/alarms/toggle-pause
```

请求体：
```json
{}
```

**成功响应** (暂停告警时):
```json
{
  "success": true,
  "message": "已暂停告警",
  "status": "paused"
}
```

**成功响应** (恢复告警时):
```json
{
  "success": true,
  "message": "已恢复告警",
  "status": "playing"
}
```

### 告警控制API使用示例

#### JavaScript示例

```javascript
// 停止所有告警
async function stopAllAlarms() {
  try {
    const response = await fetch('/api/modbus/alarms/stop', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    
    const result = await response.json();
    console.log('停止告警结果:', result);
  } catch (error) {
    console.error('停止告警失败:', error);
  }
}

// 切换告警暂停状态
async function toggleAlarmPause() {
  try {
    const response = await fetch('/api/modbus/alarms/toggle-pause', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    
    const result = await response.json();
    console.log('切换告警状态结果:', result);
    return result.status;  // 返回当前状态: 'paused' 或 'playing'
  } catch (error) {
    console.error('切换告警状态失败:', error);
  }
}
```

#### cURL示例

```bash
# 停止所有告警 - Windows环境
curl -X POST http://localhost:3000/api/modbus/alarms/stop ^
  -H "Content-Type: application/json" ^
  -d "{}"

# 切换告警暂停状态 - Windows环境
curl -X POST http://localhost:3000/api/modbus/alarms/toggle-pause ^
  -H "Content-Type: application/json" ^
  -d "{}"
```

#### Python示例

```python
import requests

# 设置API基础URL
BASE_URL = 'http://localhost:3000/api/modbus'

# 停止所有告警
def stop_all_alarms():
    url = f"{BASE_URL}/alarms/stop"
    response = requests.post(url, json={})
    if response.status_code == 200:
        result = response.json()
        print(f"停止告警成功: {result['message']}")
    else:
        print(f"停止告警失败: {response.text}")

# 切换告警暂停状态
def toggle_alarm_pause():
    url = f"{BASE_URL}/alarms/toggle-pause"
    response = requests.post(url, json={})
    if response.status_code == 200:
        result = response.json()
        print(f"切换告警状态成功: {result['message']}")
        return result['status']  # 返回当前状态: 'paused' 或 'playing'
    else:
        print(f"切换告警状态失败: {response.text}")
```

### 告警控制注意事项

1. 停止告警接口会彻底终止当前所有告警循环，重置告警状态，不会再次循环播放。
2. 暂停告警接口只会暂时停止告警播放，告警状态仍然保留，可以随时恢复。
3. 当有新的告警触发时，如果没有告警正在播放，告警会自动开始播放。
4. 当数据点值从0变为1时会触发新的告警，此时即使之前告警被停止，也会重新播放。
5. 告警控制接口主要用于紧急情况或维护过程中，不应作为日常操作的主要手段。

如有任何问题或建议，请联系系统管理员。 
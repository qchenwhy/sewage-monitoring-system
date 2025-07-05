# Modbus数据写入API文档

本文档详细介绍了Modbus数据写入相关的API接口、参数和使用方法。

## 1. 数据点写入

### 基本信息

- **接口URL**: `/api/modbus/write`
- **请求方法**: POST
- **数据格式**: JSON

### 请求参数

| 参数名 | 类型 | 是否必需 | 描述 |
|-------|------|---------|------|
| identifier | String | 是 | 数据点标识符 |
| value | Number/Boolean | 是 | 要写入的值 |
| bitPosition | Number | 否 | BIT格式数据点的位位置(0-15)，仅当数据点格式为BIT时需要 |

### 响应格式

成功响应：

```json
{
  "success": true,
  "data": {
    "identifier": "数据点标识符",
    "value": 写入的值,
    "timestamp": "2023-08-15T10:30:00.000Z",
    "rawResult": {
      // 原始写入结果，格式根据写入的数据点类型不同而异
    }
  }
}
```

BIT格式的成功响应示例：

```json
{
  "success": true,
  "data": {
    "identifier": "relay1",
    "value": 1,
    "format": "BIT",
    "bitPosition": 3,
    "registerValue": 8,
    "originalRegisterValue": 0,
    "newRegisterValue": 8,
    "binaryString": "0000000000001000",
    "bitValue": 1,
    "timestamp": "2023-08-15T10:30:00.000Z"
  }
}
```

错误响应：

```json
{
  "success": false,
  "error": "错误信息",
  "details": "详细错误描述",
  "dataPoint": {
    "identifier": "数据点标识符",
    "address": "寄存器地址",
    "format": "数据格式"
  }
}
```

### 可能的错误码

| HTTP状态码 | 错误说明 |
|-----------|---------|
| 400 | 请求参数错误，例如值格式不正确、超出范围等 |
| 403 | 数据点为只读，不能写入 |
| 404 | 数据点不存在 |
| 503 | Modbus服务不可用，可能未连接到设备 |
| 504 | 写入操作超时 |

## 2. 位写入（多位同时写入）

### 基本信息

- **接口URL**: `/api/modbus/bits/write`
- **请求方法**: POST
- **数据格式**: JSON

### 请求参数

| 参数名 | 类型 | 是否必需 | 描述 |
|-------|------|---------|------|
| address | Number | 是 | 寄存器地址 |
| bitValues | Array | 是 | 要写入的位值数组 |

bitValues数组格式：

```json
[
  {
    "position": 0,
    "value": 1
  },
  {
    "position": 3,
    "value": 0
  }
]
```

### 响应格式

成功响应：

```json
{
  "success": true,
  "data": {
    "address": 寄存器地址,
    "originalValue": 原寄存器值,
    "newValue": 新寄存器值,
    "originalHex": "0x0000",
    "newHex": "0x0009",
    "originalBinary": "0000000000000000",
    "newBinary": "0000000000001001",
    "modifiedBits": [
      {
        "position": 0,
        "value": 0,
        "newValue": 1
      },
      {
        "position": 3,
        "value": 1,
        "newValue": 0
      }
    ],
    "timestamp": "2023-08-15T10:30:00.000Z"
  }
}
```

## 3. 数据格式说明

Modbus支持以下数据格式：

| 格式 | 描述 | 取值范围 |
|-----|------|---------|
| BIT | 位值，每个寄存器包含16个位(0-15) | 0或1 |
| INT16 | 有符号16位整数 | -32768 ~ 32767 |
| UINT16 | 无符号16位整数 | 0 ~ 65535 |
| INT32 | 有符号32位整数 | -2147483648 ~ 2147483647 |
| UINT32 | 无符号32位整数 | 0 ~ 4294967295 |

## 4. 使用示例

### JavaScript示例 (使用Axios)

```javascript
// 写入普通数值
async function writeValue() {
  try {
    const response = await axios.post('/api/modbus/write', {
      identifier: 'temperature_setpoint',
      value: 25.5
    });
    
    if (response.data.success) {
      console.log('写入成功:', response.data);
    }
  } catch (error) {
    console.error('写入失败:', error.response?.data || error.message);
  }
}

// 写入BIT值
async function writeBitValue() {
  try {
    const response = await axios.post('/api/modbus/write', {
      identifier: 'relay_status',
      value: 1,
      bitPosition: 2  // 第3位 (从0开始计数)
    });
    
    if (response.data.success) {
      console.log('写入位值成功:', response.data);
      console.log('新的寄存器值:', response.data.data.registerValue);
      console.log('二进制表示:', response.data.data.binaryString);
    }
  } catch (error) {
    console.error('写入位值失败:', error.response?.data || error.message);
  }
}

// 多位同时写入
async function writeMultipleBits() {
  try {
    const response = await axios.post('/api/modbus/bits/write', {
      address: 40001,
      bitValues: [
        { position: 0, value: 1 },
        { position: 1, value: 0 },
        { position: 2, value: 1 }
      ]
    });
    
    if (response.data.success) {
      console.log('多位写入成功:', response.data);
    }
  } catch (error) {
    console.error('多位写入失败:', error.response?.data || error.message);
  }
}
```

### Curl示例

```bash
# 写入普通数值
curl -X POST http://localhost:3000/api/modbus/write \
  -H "Content-Type: application/json" \
  -d '{"identifier":"temperature_setpoint","value":25.5}'

# 写入BIT值
curl -X POST http://localhost:3000/api/modbus/write \
  -H "Content-Type: application/json" \
  -d '{"identifier":"relay_status","value":1,"bitPosition":2}'

# 多位同时写入
curl -X POST http://localhost:3000/api/modbus/bits/write \
  -H "Content-Type: application/json" \
  -d '{"address":40001,"bitValues":[{"position":0,"value":1},{"position":1,"value":0},{"position":2,"value":1}]}'
```

## 5. 最佳实践

1. **数据验证**: 在发送值之前，确保数值在对应数据类型的合法范围内
2. **错误处理**: 针对各种错误情况（连接失败、超时、参数错误等）添加适当的错误处理
3. **重试机制**: 对于网络超时类错误，可以添加重试机制
4. **位操作**: 对于BIT类型的数据点，注意位位置的正确性（0-15）
5. **缓存**: 对频繁读取的数据进行适当缓存，减少不必要的通信开销 
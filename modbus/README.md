# Modbus TCP 通信模块

本模块提供了完整的 Modbus TCP 通信功能，支持与 PLC 和其他支持 Modbus TCP 协议的设备进行通信。

## 主要功能

- 建立和管理 Modbus TCP 连接
- 支持读写各种类型的数据点 (INT16, UINT16, INT32, UINT32, FLOAT32)
- 自动化数据轮询
- 保持连接机制
- 数据点管理和配置保存
- 完善的错误处理和诊断功能

## 关键组件

- **ModbusTCP** - TCP通信和Modbus协议实现
- **ModbusService** - 服务层，提供高级API和数据处理
- **ConfigManager** - 配置信息管理
- **DataPointManager** - 数据点定义管理

## 最近优化和改进

1. **Promise支持**
   - 修复了 `writeSingleRegister` 方法，现在正确返回 Promise 对象
   - 所有异步操作（读写）都支持 async/await 语法

2. **增强的数据类型支持**
   - 新增对 INT32, UINT32, FLOAT32 数据类型的完整写入支持
   - 支持自动缩放和格式化

3. **错误处理和诊断**
   - 完善事件监听和异常处理
   - 为写操作增加超时机制
   - 改进的日志记录，包括详细的错误信息

4. **新增诊断工具**
   - `test-connection.js` - Modbus 连接测试工具
   - `register-scan.js` - 寄存器地址扫描工具
   - `write-test.js` - 写入功能测试工具

## 使用示例

### 测试连接

```bash
node modbus/test-connection.js 192.168.1.100 502
```

### 扫描有效寄存器

```bash
node modbus/register-scan.js 192.168.1.100 502 1 0 100
```

### 测试写入功能

```bash
# 写入16位无符号整数
node modbus/write-test.js 192.168.1.100 502 1 100 42 UINT16

# 写入32位浮点数
node modbus/write-test.js 192.168.1.100 502 1 100 3.14 FLOAT32
```

## 配置说明

配置文件位于 `data/modbus-config.json`，主要包含：

- 连接参数：主机地址、端口、单元ID等
- 轮询设置：轮询间隔、启用状态
- 保活设置：保活地址、间隔等

## 数据点配置

数据点定义存储在 `data/data-points.json`，每个数据点包含：

- 名称和标识符
- 寄存器地址和功能码
- 数据格式 (INT16, UINT16, INT32, UINT32, FLOAT32)
- 缩放因子和单位
- 访问模式 (read, write, readwrite)

## 排错建议

1. 使用 `test-connection.js` 验证设备连接是否正常
2. 使用 `register-scan.js` 确认寄存器地址是否有效
3. 检查 ModbusTCP 配置，特别是主机地址、端口和单元ID
4. 查看应用程序日志中的详细错误信息
5. 对于写入问题，使用 `write-test.js` 单独测试 
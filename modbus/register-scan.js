/**
 * Modbus 寄存器扫描工具
 * 用于扫描Modbus从站中有效的寄存器地址，帮助确定保活地址
 * 
 * 使用方法：
 * node modbus/register-scan.js [host] [port] [unitId] [startAddress] [endAddress]
 * 例如: node modbus/register-scan.js 127.0.0.1 502 1 0 10
 */

const net = require('net');

// 从命令行参数获取配置
const host = process.argv[2] || '127.0.0.1';
const port = parseInt(process.argv[3] || '502', 10);
const unitId = parseInt(process.argv[4] || '1', 10);
const startAddress = parseInt(process.argv[5] || '0', 10);
const endAddress = parseInt(process.argv[6] || '10', 10);

console.log('==================================================');
console.log('        Modbus 寄存器扫描工具                     ');
console.log('==================================================');
console.log(`扫描配置:`);
console.log(`  - 主机: ${host}`);
console.log(`  - 端口: ${port}`);
console.log(`  - 单元ID: ${unitId}`);
console.log(`  - 起始地址: ${startAddress}`);
console.log(`  - 结束地址: ${endAddress}`);
console.log('--------------------------------------------------');

// 扫描结果
const results = {
  holdingRegisters: {},  // 保持寄存器 (功能码03)
  inputRegisters: {},    // 输入寄存器 (功能码04)
  coils: {},             // 线圈 (功能码01)
  discreteInputs: {}     // 离散输入 (功能码02)
};

// 创建TCP客户端
const client = new net.Socket();
let currentScanType = null;
let currentAddress = null;
let transactionId = 1;
let scanFinished = false;

// 生成下一个事务ID
function getNextTransactionId() {
  if (transactionId >= 65535) transactionId = 1;
  else transactionId++;
  return transactionId;
}

// 连接事件处理
client.on('connect', () => {
  console.log('\n✓ 已连接到Modbus服务器');
  console.log('--------------------------------------------------');
  console.log('开始扫描保持寄存器 (功能码03)...');
  
  currentScanType = 'holdingRegisters';
  currentAddress = startAddress;
  
  // 发送第一个请求
  scanNextAddress();
});

// 数据接收事件
client.on('data', (data) => {
  if (data.length < 9) {
    console.log(`接收到短响应: ${data.toString('hex')}`);
    scanNextAddress();
    return;
  }
  
  const tid = data.readUInt16BE(0);
  const protocol = data.readUInt16BE(2);
  const length = data.readUInt16BE(4);
  const uid = data.readUInt8(6);
  const functionCode = data.readUInt8(7);
  
  // 检查是否是异常响应
  if (functionCode > 0x80) {
    const exceptionCode = data.readUInt8(8);
    // 非法数据地址不记录，其他异常记录下来
    if (exceptionCode !== 2) {
      results[currentScanType][currentAddress] = {
        error: true,
        code: exceptionCode,
        message: getExceptionMessage(exceptionCode)
      };
    }
  } else {
    // 成功响应
    if (functionCode === 3 || functionCode === 4) { // 读寄存器
      const byteCount = data.readUInt8(8);
      const values = [];
      
      for (let i = 0; i < byteCount / 2; i++) {
        values.push(data.readUInt16BE(9 + i * 2));
      }
      
      results[currentScanType][currentAddress] = {
        error: false,
        value: values[0],
        hex: values[0].toString(16).padStart(4, '0')
      };
      
      // 输出结果
      console.log(`  地址 ${currentAddress.toString().padStart(4, ' ')}: ${values[0]} (0x${values[0].toString(16).padStart(4, '0')})`);
    }
  }
  
  // 继续扫描下一个地址
  scanNextAddress();
});

// 错误处理
client.on('error', (err) => {
  console.log(`\n✗ 连接错误: ${err.message}`);
  console.log('==================================================');
  client.destroy();
  process.exit(1);
});

// 关闭事件
client.on('close', () => {
  if (!scanFinished) {
    console.log('\n✗ 连接已关闭');
    console.log('==================================================');
    process.exit(1);
  }
});

// 扫描下一个地址
function scanNextAddress() {
  // 扫描地址范围
  if (currentAddress > endAddress) {
    if (currentScanType === 'holdingRegisters') {
      // 切换到下一种寄存器类型
      currentScanType = 'inputRegisters';
      currentAddress = startAddress;
      console.log('\n开始扫描输入寄存器 (功能码04)...');
      scanInputRegister();
    } else if (currentScanType === 'inputRegisters') {
      // 扫描完成，显示摘要
      showSummary();
      scanFinished = true;
      client.destroy();
    }
    return;
  }
  
  if (currentScanType === 'holdingRegisters') {
    scanHoldingRegister();
  } else if (currentScanType === 'inputRegisters') {
    scanInputRegister();
  }
}

// 扫描保持寄存器
function scanHoldingRegister() {
  const tid = getNextTransactionId();
  
  // 构建Modbus TCP请求
  const buffer = Buffer.alloc(12);
  buffer.writeUInt16BE(tid, 0);      // 事务ID
  buffer.writeUInt16BE(0, 2);        // 协议ID
  buffer.writeUInt16BE(6, 4);        // 长度
  buffer.writeUInt8(unitId, 6);      // 单元ID
  buffer.writeUInt8(3, 7);           // 功能码 (03 - 读保持寄存器)
  buffer.writeUInt16BE(currentAddress, 8);  // 起始地址
  buffer.writeUInt16BE(1, 10);       // 寄存器数量
  
  // 发送请求
  client.write(buffer);
  
  currentAddress++;
}

// 扫描输入寄存器
function scanInputRegister() {
  const tid = getNextTransactionId();
  
  // 构建Modbus TCP请求
  const buffer = Buffer.alloc(12);
  buffer.writeUInt16BE(tid, 0);      // 事务ID
  buffer.writeUInt16BE(0, 2);        // 协议ID
  buffer.writeUInt16BE(6, 4);        // 长度
  buffer.writeUInt8(unitId, 6);      // 单元ID
  buffer.writeUInt8(4, 7);           // 功能码 (04 - 读输入寄存器)
  buffer.writeUInt16BE(currentAddress, 8);  // 起始地址
  buffer.writeUInt16BE(1, 10);       // 寄存器数量
  
  // 发送请求
  client.write(buffer);
  
  currentAddress++;
}

// 显示扫描结果摘要
function showSummary() {
  console.log('\n==================================================');
  console.log('扫描结果摘要:');
  console.log('--------------------------------------------------');
  
  // 保持寄存器摘要
  const holdingAddresses = Object.keys(results.holdingRegisters).map(Number);
  if (holdingAddresses.length > 0) {
    console.log('\n保持寄存器 (功能码03):');
    holdingAddresses.sort((a, b) => a - b).forEach(addr => {
      const reg = results.holdingRegisters[addr];
      console.log(`  地址 ${addr.toString().padStart(4, ' ')}: ${reg.value} (0x${reg.hex})`);
    });
    
    console.log('\n推荐的保活寄存器地址:');
    console.log(`  地址 ${holdingAddresses[0]} (功能码03)`);
  } else {
    console.log('\n未找到有效的保持寄存器');
  }
  
  // 输入寄存器摘要
  const inputAddresses = Object.keys(results.inputRegisters).map(Number);
  if (inputAddresses.length > 0) {
    console.log('\n输入寄存器 (功能码04):');
    inputAddresses.sort((a, b) => a - b).forEach(addr => {
      const reg = results.inputRegisters[addr];
      console.log(`  地址 ${addr.toString().padStart(4, ' ')}: ${reg.value} (0x${reg.hex})`);
    });
    
    if (holdingAddresses.length === 0) {
      console.log('\n推荐的保活寄存器地址:');
      console.log(`  地址 ${inputAddresses[0]} (功能码04)`);
    }
  } else {
    console.log('\n未找到有效的输入寄存器');
  }
  
  console.log('\n配置建议:');
  if (holdingAddresses.length > 0) {
    console.log(`在配置中设置 keepAliveAddress: ${holdingAddresses[0]}`);
  } else if (inputAddresses.length > 0) {
    console.log(`在配置中设置 keepAliveAddress: ${inputAddresses[0]}`);
    console.log(`并修改保活请求中的功能码为04 (读输入寄存器)`);
  } else {
    console.log('未找到有效的寄存器地址，建议：');
    console.log('1. 检查Modbus从站配置是否正确');
    console.log('2. 确认单元ID (当前: ' + unitId + ') 是否正确');
    console.log('3. 尝试扩大扫描范围');
  }
  
  console.log('==================================================');
}

// 异常码解释
function getExceptionMessage(code) {
  const exceptions = {
    1: '非法功能',
    2: '非法数据地址',
    3: '非法数据值',
    4: '从站设备故障',
    5: '确认',
    6: '从站设备忙',
    8: '存储奇偶性差错',
    10: '网关路径不可用',
    11: '网关目标设备响应失败'
  };
  
  return exceptions[code] || `未知异常(${code})`;
}

// 连接到服务器
console.log(`正在连接到 ${host}:${port}...`);
client.connect(port, host); 
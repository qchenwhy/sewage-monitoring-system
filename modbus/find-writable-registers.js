/**
 * Modbus寄存器写入测试工具
 * 用于扫描哪些寄存器地址可以写入，帮助配置数据点
 * 
 * 使用方法：
 * node modbus/find-writable-registers.js [host] [port] [unitId] [startAddress] [endAddress]
 * 例如: node modbus/find-writable-registers.js 192.168.1.100 502 1 0 100
 */

const net = require('net');

// 从命令行参数获取配置
const host = process.argv[2] || '127.0.0.1';
const port = parseInt(process.argv[3] || '502', 10);
const unitId = parseInt(process.argv[4] || '1', 10);
const startAddress = parseInt(process.argv[5] || '0', 10);
const endAddress = parseInt(process.argv[6] || '50', 10);

// 可写入寄存器列表
const writableRegisters = [];
// 不可写入寄存器列表
const nonWritableRegisters = [];
// 当前测试的地址
let currentAddress = startAddress;
// 事务ID
let transactionId = 1;

console.log('==================================================');
console.log('        Modbus 可写寄存器扫描工具                ');
console.log('==================================================');
console.log(`配置:`);
console.log(`  - 主机: ${host}`);
console.log(`  - 端口: ${port}`);
console.log(`  - 单元ID: ${unitId}`);
console.log(`  - 起始地址: ${startAddress}`);
console.log(`  - 结束地址: ${endAddress}`);
console.log('--------------------------------------------------');

// 创建TCP客户端
const client = new net.Socket();

// 连接事件处理
client.on('connect', () => {
  console.log('\n✓ 已连接到服务器，开始测试可写入寄存器');
  console.log('--------------------------------------------------');
  
  // 开始测试第一个地址
  testNextAddress();
});

// 数据接收事件处理
client.on('data', (data) => {
  if (data.length < 9) {
    console.log(`接收到短响应: ${data.toString('hex')}`);
    nonWritableRegisters.push(currentAddress);
    testNextAddress();
    return;
  }
  
  const tid = data.readUInt16BE(0);
  const functionCode = data.readUInt8(7);
  
  // 检查是否有异常
  if (functionCode > 0x80) {
    const exceptionCode = data.readUInt8(8);
    
    // 记录非法地址和其他错误
    if (exceptionCode === 2) {
      console.log(`  地址 ${currentAddress.toString().padStart(4, ' ')}: ✗ 非法地址`);
      nonWritableRegisters.push(currentAddress);
    } else {
      console.log(`  地址 ${currentAddress.toString().padStart(4, ' ')}: ✗ 错误码 ${exceptionCode}`);
      nonWritableRegisters.push(currentAddress);
    }
  } else {
    // 写入成功
    console.log(`  地址 ${currentAddress.toString().padStart(4, ' ')}: ✓ 可写入`);
    writableRegisters.push(currentAddress);
  }
  
  // 测试下一个地址
  testNextAddress();
});

// 错误处理
client.on('error', (err) => {
  console.error(`\n✗ 连接错误: ${err.message}`);
  console.log('==================================================');
  process.exit(1);
});

// 连接关闭处理
client.on('close', () => {
  if (currentAddress <= endAddress) {
    console.log('\n✗ 连接意外关闭');
    console.log('==================================================');
    process.exit(1);
  }
});

// 测试下一个地址
function testNextAddress() {
  // 检查是否测试完成
  if (currentAddress > endAddress) {
    showSummary();
    client.destroy();
    return;
  }
  
  // 发送写入请求
  writeSingleRegister(currentAddress, 0);
  currentAddress++;
}

// 写入单个寄存器
function writeSingleRegister(address, value) {
  const tid = getNextTransactionId();
  
  // 构建Modbus TCP请求
  const buffer = Buffer.alloc(12);
  buffer.writeUInt16BE(tid, 0);        // 事务ID
  buffer.writeUInt16BE(0, 2);          // 协议ID
  buffer.writeUInt16BE(6, 4);          // 长度
  buffer.writeUInt8(unitId, 6);        // 单元ID
  buffer.writeUInt8(6, 7);             // 功能码 (06 - 写单个寄存器)
  buffer.writeUInt16BE(address, 8);    // 寄存器地址
  buffer.writeUInt16BE(value, 10);     // 寄存器值
  
  // 发送请求
  client.write(buffer);
}

// 生成事务ID
function getNextTransactionId() {
  if (transactionId >= 65535) transactionId = 1;
  else transactionId++;
  return transactionId;
}

// 显示扫描结果摘要
function showSummary() {
  console.log('\n==================================================');
  console.log('扫描结果摘要:');
  console.log('--------------------------------------------------');
  
  console.log(`\n扫描范围: ${startAddress} - ${endAddress}`);
  console.log(`发现 ${writableRegisters.length} 个可写入寄存器`);
  console.log(`发现 ${nonWritableRegisters.length} 个不可写入寄存器`);
  
  if (writableRegisters.length > 0) {
    console.log('\n可写入的寄存器地址:');
    writableRegisters.sort((a, b) => a - b);
    
    // 按行显示，每行10个
    for (let i = 0; i < writableRegisters.length; i += 10) {
      const line = writableRegisters.slice(i, i + 10).map(addr => addr.toString().padStart(4, ' ')).join(', ');
      console.log(`  ${line}`);
    }
  } else {
    console.log('\n❗ 警告: 在扫描范围内未找到可写入的寄存器');
  }
  
  console.log('\n==================================================');
  console.log('数据点配置建议:');
  console.log('--------------------------------------------------');
  
  if (writableRegisters.length > 0) {
    console.log(`推荐使用的写入地址: ${writableRegisters[0]}`);
    console.log(`例如，创建数据点配置:`);
    console.log(`{`);
    console.log(`  "name": "调节池提升泵2",`);
    console.log(`  "identifier": "TjT",`);
    console.log(`  "address": ${writableRegisters[0]},`);
    console.log(`  "accessMode": "readwrite",`);
    console.log(`  "readFunctionCode": 3,`);
    console.log(`  "writeFunctionCode": 6,`);
    console.log(`  "format": "UINT16"`);
    console.log(`}`);
  } else {
    console.log('未发现可写入寄存器，请考虑:');
    console.log('1. 检查设备是否支持写入功能');
    console.log('2. 检查单元ID是否正确');
    console.log('3. 扩大扫描范围');
    console.log('4. 确认设备是否需要特殊访问权限');
  }
  
  console.log('\n==================================================');
  console.log('注意事项:');
  console.log('1. 测试时使用的写入值为0，不会对设备产生实质影响');
  console.log('2. 扫描结果仅表明技术上可写入，请确认寄存器的实际用途');
  console.log('3. 写入未知寄存器可能导致设备异常，请谨慎操作');
  console.log('==================================================');
}

// 连接到服务器
console.log(`正在连接到 ${host}:${port}...`);
client.connect(port, host); 
/**
 * 简单Modbus TCP连接测试工具
 * 
 * 此脚本使用最基本的Socket功能测试Modbus TCP连接，避免使用ModbusTCP类和ModbusService类
 * 用法：node modbus/simple-test-connection.js [host] [port]
 */

const net = require('net');
const os = require('os');

// 从命令行参数获取配置
const host = process.argv[2] || '127.0.0.1';
const port = parseInt(process.argv[3] || '502', 10);
const timeout = parseInt(process.argv[4] || '3000', 10);

console.log('=============================================================');
console.log('               简单Modbus TCP连接测试工具                     ');
console.log('=============================================================');
console.log(`测试参数:`);
console.log(`- 主机: ${host}`);
console.log(`- 端口: ${port}`);
console.log(`- 超时: ${timeout}ms`);
console.log('-------------------------------------------------------------');

// 显示系统信息
console.log('\n系统信息:');
console.log(`- 平台: ${os.platform()}`);
console.log(`- 架构: ${os.arch()}`);
console.log(`- Node.js版本: ${process.version}`);
console.log(`- 主机名: ${os.hostname()}`);

// 显示网络接口信息
console.log('\n网络接口信息:');
const interfaces = os.networkInterfaces();
Object.keys(interfaces).forEach((name) => {
  interfaces[name].forEach((iface) => {
    if (iface.family === 'IPv4' || iface.family === 4) {
      console.log(`- ${name}: ${iface.address} (${iface.internal ? '内部' : '外部'})`);
    }
  });
});

// 测试纯TCP连接
function testTcpConnection() {
  return new Promise((resolve, reject) => {
    console.log(`\n正在测试到 ${host}:${port} 的TCP连接...`);
    
    const socket = new net.Socket();
    let connected = false;
    
    // 设置超时
    socket.setTimeout(timeout);
    
    // 连接事件
    socket.on('connect', () => {
      connected = true;
      console.log(`✅ TCP连接成功建立！`);
      socket.end();
      resolve({success: true, message: 'TCP连接成功'});
    });
    
    // 超时事件
    socket.on('timeout', () => {
      console.error(`❌ TCP连接超时 (${timeout}ms)`);
      socket.destroy();
      reject(new Error(`连接超时 (${timeout}ms)`));
    });
    
    // 错误事件
    socket.on('error', (err) => {
      console.error(`❌ TCP连接错误: ${err.message}`);
      reject(err);
    });
    
    // 关闭事件
    socket.on('close', () => {
      if (!connected) {
        console.log(`TCP连接关闭，未能成功建立`);
      } else {
        console.log(`TCP连接已正常关闭`);
      }
    });
    
    // 尝试连接
    socket.connect(port, host);
  });
}

// 测试简单的Modbus查询
function testModbusQuery() {
  return new Promise((resolve, reject) => {
    console.log(`\n正在测试Modbus协议通信...`);
    
    const socket = new net.Socket();
    let connected = false;
    
    // 设置超时
    socket.setTimeout(timeout);
    
    // 连接事件
    socket.on('connect', () => {
      connected = true;
      console.log(`✅ 连接成功，发送Modbus查询包...`);
      
      // 创建一个简单的Modbus请求 (读取单个保持寄存器)
      const transactionId = Math.floor(Math.random() * 0xFFFF);
      const buffer = Buffer.alloc(12);
      
      // Modbus TCP头
      buffer.writeUInt16BE(transactionId, 0);  // 事务ID
      buffer.writeUInt16BE(0, 2);              // 协议ID (0 for Modbus TCP)
      buffer.writeUInt16BE(6, 4);              // 后续字节长度
      buffer.writeUInt8(1, 6);                 // 单元ID
      
      // PDU (协议数据单元)
      buffer.writeUInt8(3, 7);                 // 功能码 (3 = 读保持寄存器)
      buffer.writeUInt16BE(0, 8);              // 起始地址
      buffer.writeUInt16BE(1, 10);             // 寄存器数量
      
      socket.write(buffer);
    });
    
    // 数据接收事件
    socket.on('data', (data) => {
      console.log(`✅ 收到Modbus响应数据 (${data.length} 字节):`);
      
      // 解析响应
      if (data.length >= 9) {
        const respTransactionId = data.readUInt16BE(0);
        const respProtocolId = data.readUInt16BE(2);
        const respLength = data.readUInt16BE(4);
        const respUnitId = data.readUInt8(6);
        const respFunctionCode = data.readUInt8(7);
        
        console.log(`- 事务ID: ${respTransactionId}`);
        console.log(`- 协议ID: ${respProtocolId}`);
        console.log(`- 长度: ${respLength}`);
        console.log(`- 单元ID: ${respUnitId}`);
        console.log(`- 功能码: ${respFunctionCode}`);
        
        // 检查是否为异常响应
        if (respFunctionCode > 0x80) {
          const exceptionCode = data.readUInt8(8);
          console.log(`❓ 收到Modbus异常响应 (异常码: ${exceptionCode})`);
          switch(exceptionCode) {
            case 1: console.log('  - 异常含义: 非法功能码'); break;
            case 2: console.log('  - 异常含义: 非法数据地址'); break;
            case 3: console.log('  - 异常含义: 非法数据值'); break;
            case 4: console.log('  - 异常含义: 设备故障'); break;
            default: console.log('  - 异常含义: 未知异常');
          }
          // 即使是异常响应，也表明Modbus通信正常工作
          socket.end();
          resolve({
            success: true, 
            message: 'Modbus通信成功（收到异常响应）',
            exception: exceptionCode
          });
        } else {
          console.log(`✅ 收到正常Modbus响应`);
          // 如果是普通读取，解析寄存器值
          if (respFunctionCode === 3 && data.length >= 10) {
            const byteCount = data.readUInt8(8);
            console.log(`- 字节数: ${byteCount}`);
            
            if (byteCount === 2 && data.length >= 11) {
              const value = data.readUInt16BE(9);
              console.log(`- 寄存器值: ${value} (0x${value.toString(16)})`);
            }
          }
          
          socket.end();
          resolve({
            success: true, 
            message: 'Modbus通信成功（收到正常响应）'
          });
        }
      } else {
        console.log(`❓ 收到短响应，无法解析`);
        socket.end();
        resolve({
          success: true, 
          message: 'Modbus通信可能成功，但响应数据太短'
        });
      }
    });
    
    // 超时事件
    socket.on('timeout', () => {
      console.error(`❌ Modbus请求超时 (${timeout}ms)`);
      socket.destroy();
      reject(new Error(`请求超时 (${timeout}ms)`));
    });
    
    // 错误事件
    socket.on('error', (err) => {
      console.error(`❌ Modbus请求错误: ${err.message}`);
      reject(err);
    });
    
    // 关闭事件
    socket.on('close', () => {
      if (!connected) {
        console.log(`连接关闭，未能成功建立`);
      } else {
        console.log(`连接已正常关闭`);
      }
    });
    
    // 尝试连接
    socket.connect(port, host);
  });
}

// 主函数
async function main() {
  console.log('\n=============================================================');
  console.log('开始测试...');
  console.log('=============================================================');
  
  try {
    // 1. 测试纯TCP连接
    await testTcpConnection();
    
    console.log('\n-------------------------------------------------------------');
    
    // 2. 测试Modbus协议通信
    await testModbusQuery();
    
    console.log('\n=============================================================');
    console.log('✅ 测试完成，连接正常！');
    console.log('=============================================================');
    console.log('\n诊断总结:');
    console.log('1. TCP连接成功建立');
    console.log('2. Modbus协议通信正常');
    console.log('\n如果您的应用仍然遇到连接问题，请检查:');
    console.log('- ModbusTCP类中的连接处理逻辑');
    console.log('- ModbusService中的错误处理');
    console.log('- 是否有足够的错误处理和超时设置');
    process.exit(0);
  } catch (error) {
    console.log('\n=============================================================');
    console.log(`❌ 测试失败: ${error.message}`);
    console.log('=============================================================');
    console.log('\n诊断总结:');
    if (error.message.includes('timeout')) {
      console.log('连接超时。可能的原因:');
      console.log('1. Modbus服务器未运行或无法访问');
      console.log('2. 防火墙阻止了连接');
      console.log('3. 主机地址或端口配置错误');
    } else if (error.message.includes('ECONNREFUSED')) {
      console.log('连接被拒绝。可能的原因:');
      console.log('1. 在指定地址和端口上没有服务在运行');
      console.log('2. 主机地址或端口配置错误');
    } else if (error.message.includes('EHOSTUNREACH')) {
      console.log('无法到达主机。可能的原因:');
      console.log('1. 网络配置问题');
      console.log('2. 主机不存在或不在线');
      console.log('3. 路由问题');
    } else {
      console.log(`遇到错误: ${error.message}`);
      console.log('请检查网络配置和Modbus服务器状态');
    }
    process.exit(1);
  }
}

// 运行主函数
main(); 
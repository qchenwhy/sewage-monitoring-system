/**
 * Modbus TCP 直接写入测试工具
 * 
 * 这个工具使用最基本的ModbusTCP类直接写入寄存器，绕过ModbusService的复杂性
 */

const ModbusTCP = require('./modbus-tcp');

// 配置参数
const HOST = '127.0.0.1';
const PORT = 502;
const UNIT_ID = 1;
const ADDRESS = 12; // 要写入的寄存器地址
const VALUE = 2; // 要写入的值

console.log('==================================================');
console.log('        Modbus TCP 直接写入测试工具              ');
console.log('==================================================');
console.log(`配置:`);
console.log(`  - 主机: ${HOST}`);
console.log(`  - 端口: ${PORT}`);
console.log(`  - 单元ID: ${UNIT_ID}`);
console.log(`  - 寄存器地址: ${ADDRESS}`);
console.log(`  - 写入值: ${VALUE}`);
console.log('--------------------------------------------------');

async function run() {
  let client = null;
  
  try {
    console.log('创建ModbusTCP客户端...');
    client = new ModbusTCP({
      host: HOST,
      port: PORT,
      unitId: UNIT_ID,
      timeout: 5000,
      autoReconnect: false
    });
    
    // 设置事件监听器
    client.on('error', (error) => {
      console.error(`ModbusTCP错误: ${error.message}`);
    });
    
    client.on('connectionClosed', () => {
      console.log('连接已关闭');
    });
    
    // 连接到服务器
    console.log(`正在连接到 ${HOST}:${PORT}...`);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('连接超时'));
      }, 5000);
      
      client.on('connected', () => {
        clearTimeout(timeout);
        resolve();
      });
      
      client.connect().catch(err => {
        clearTimeout(timeout);
        reject(err);
      });
    });
    
    console.log('✓ 连接成功');
    
    // 写入单个寄存器
    console.log(`正在写入值 ${VALUE} 到寄存器地址 ${ADDRESS}...`);
    
    const result = await client.writeSingleRegister(ADDRESS, VALUE);
    console.log(`✓ 写入成功: ${JSON.stringify(result)}`);
    
    // 读取刚写入的值进行验证
    console.log(`正在读取寄存器地址 ${ADDRESS} 进行验证...`);
    
    const readResult = await new Promise((resolve, reject) => {
      const tid = client.readHoldingRegisters(ADDRESS, 1);
      
      const timeout = setTimeout(() => {
        reject(new Error('读取操作超时'));
      }, 5000);
      
      const dataHandler = (data) => {
        if (data.transactionId === tid) {
          clearTimeout(timeout);
          client.removeListener('data', dataHandler);
          client.removeListener('error', errorHandler);
          resolve(data);
        }
      };
      
      const errorHandler = (error) => {
        if (error.transactionId === tid) {
          clearTimeout(timeout);
          client.removeListener('data', dataHandler);
          client.removeListener('error', errorHandler);
          reject(error);
        }
      };
      
      client.on('data', dataHandler);
      client.on('error', errorHandler);
    });
    
    console.log(`✓ 读取成功: 值=${readResult.values[0]}`);
    
    if (readResult.values[0] === VALUE) {
      console.log('✅ 验证通过: 读取的值与写入的值匹配');
    } else {
      console.log(`❌ 验证失败: 读取的值(${readResult.values[0]})与写入的值(${VALUE})不匹配`);
    }
  } catch (error) {
    console.error(`\n✗ 操作失败: ${error.message}`);
    if (error.stack) {
      console.error('错误堆栈:');
      console.error(error.stack);
    }
  } finally {
    // 断开连接
    if (client) {
      try {
        console.log('\n正在断开连接...');
        await client.disconnect();
        console.log('已断开连接');
      } catch (err) {
        console.error(`断开连接时出错: ${err.message}`);
      }
    }
  }
}

// 运行测试
run(); 
/**
 * Modbus连接调试工具
 * 
 * 此脚本用于详细诊断Modbus连接问题，显示完整的连接过程和状态变化
 */

const ModbusTCP = require('./modbus-tcp');
const ModbusService = require('./modbus-service').getInstance();
const ConfigManager = require('./config-manager');
const os = require('os');
const net = require('net');
const dns = require('dns').promises;

// 加载配置
const configManager = new ConfigManager();
const config = configManager.getConnectionConfig();

// 彩色日志输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// 日志函数
function log(message, type = 'INFO') {
  const timestamp = new Date().toISOString();
  let color = colors.reset;
  
  switch(type) {
    case 'ERROR':
      color = colors.red;
      break;
    case 'WARN':
      color = colors.yellow;
      break;
    case 'SUCCESS':
      color = colors.green;
      break;
    case 'DEBUG':
      color = colors.cyan;
      break;
    case 'STEP':
      color = colors.magenta;
      break;
    default:
      color = colors.reset;
  }
  
  console.log(`${color}[${timestamp}] [${type}] ${message}${colors.reset}`);
}

// 系统信息
async function getSystemInfo() {
  log('收集系统信息...', 'STEP');
  
  const systemInfo = {
    os: {
      type: os.type(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch()
    },
    hostname: os.hostname(),
    networkInterfaces: []
  };
  
  // 获取网络接口信息
  const interfaces = os.networkInterfaces();
  for (const [name, nets] of Object.entries(interfaces)) {
    for (const net of nets) {
      if (net.family === 'IPv4' && !net.internal) {
        systemInfo.networkInterfaces.push({
          name,
          address: net.address,
          netmask: net.netmask,
          mac: net.mac
        });
      }
    }
  }
  
  log(`操作系统: ${systemInfo.os.type} ${systemInfo.os.release} ${systemInfo.os.arch}`, 'INFO');
  log(`主机名: ${systemInfo.hostname}`, 'INFO');
  log('网络接口:', 'INFO');
  systemInfo.networkInterfaces.forEach(iface => {
    log(`  ${iface.name}: ${iface.address}/${iface.netmask} (${iface.mac})`, 'INFO');
  });
  
  return systemInfo;
}

// Modbus配置测试
async function testModbusConfig() {
  log('测试Modbus配置...', 'STEP');
  
  log(`配置文件位置: ${configManager.configPath}`, 'INFO');
  log('当前Modbus配置:', 'INFO');
  log(`  主机: ${config.host}`, 'INFO');
  log(`  端口: ${config.port}`, 'INFO');
  log(`  单元ID: ${config.unitId}`, 'INFO');
  log(`  超时: ${config.timeout}毫秒`, 'INFO');
  log(`  自动连接: ${config.autoConnect ? '是' : '否'}`, 'INFO');
  log(`  自动重连: ${config.autoReconnect ? '是' : '否'}`, 'INFO');
  log(`  保活地址: ${config.keepAliveAddress}`, 'INFO');
  log(`  保活功能码: ${config.keepAliveFunctionCode}`, 'INFO');

  // 检查配置有效性
  let configValid = true;
  if (!config.host || typeof config.host !== 'string') {
    log('主机地址无效', 'ERROR');
    configValid = false;
  }
  
  if (!config.port || typeof config.port !== 'number' || config.port <= 0 || config.port > 65535) {
    log('端口号无效', 'ERROR');
    configValid = false;
  }
  
  if (configValid) {
    log('配置有效', 'SUCCESS');
  } else {
    log('配置无效', 'ERROR');
  }
  
  // 尝试解析主机名
  try {
    log(`解析主机 '${config.host}'...`, 'INFO');
    if (/^\d+\.\d+\.\d+\.\d+$/.test(config.host)) {
      log(`主机是有效的IPv4地址: ${config.host}`, 'SUCCESS');
    } else {
      const addresses = await dns.resolve4(config.host);
      log(`主机解析成功: ${addresses.join(', ')}`, 'SUCCESS');
    }
  } catch (err) {
    log(`无法解析主机名: ${err.message}`, 'ERROR');
  }
  
  return configValid;
}

// TCP端口测试
async function testTcpConnection() {
  log(`测试TCP端口连接 ${config.host}:${config.port}...`, 'STEP');
  
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let connected = false;
    
    socket.setTimeout(3000);
    
    socket.on('connect', () => {
      log(`成功连接到TCP端口 ${config.host}:${config.port}`, 'SUCCESS');
      connected = true;
      socket.end();
    });
    
    socket.on('timeout', () => {
      log(`连接超时: ${config.host}:${config.port}`, 'ERROR');
      socket.destroy();
      resolve(false);
    });
    
    socket.on('error', (err) => {
      log(`连接错误: ${err.message}`, 'ERROR');
      socket.destroy();
      resolve(false);
    });
    
    socket.on('close', () => {
      resolve(connected);
    });
    
    log(`开始连接到 ${config.host}:${config.port}...`, 'INFO');
    socket.connect(config.port, config.host);
  });
}

// 测试Modbus连接
async function testModbusConnection() {
  log('测试ModbusTCP连接...', 'STEP');
  
  try {
    const modbusTCP = new ModbusTCP({
      host: config.host,
      port: config.port,
      unitId: config.unitId,
      timeout: config.timeout || 5000
    });
    
    let connectionSuccessful = false;
    
    modbusTCP.on('connected', () => {
      log('ModbusTCP连接成功', 'SUCCESS');
      connectionSuccessful = true;
    });
    
    modbusTCP.on('error', (error) => {
      log(`ModbusTCP错误: ${error.message}`, 'ERROR');
    });
    
    log(`尝试连接到Modbus设备: ${config.host}:${config.port}...`, 'INFO');
    
    await modbusTCP.connect();
    
    // 简单测试读取
    if (connectionSuccessful) {
      log(`尝试读取保活地址 ${config.keepAliveAddress}...`, 'INFO');
      
      try {
        // 读取保持寄存器
        const transactionId = modbusTCP.readHoldingRegisters(config.keepAliveAddress, 1);
        log(`已发送读取请求，事务ID: ${transactionId}`, 'INFO');
        
        // 等待响应
        const response = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            modbusTCP.removeListener('data', dataHandler);
            modbusTCP.removeListener('error', errorHandler);
            reject(new Error('读取超时'));
          }, 5000);
          
          const dataHandler = (data) => {
            if (data.transactionId === transactionId) {
              clearTimeout(timeout);
              modbusTCP.removeListener('error', errorHandler);
              resolve(data);
            }
          };
          
          const errorHandler = (error) => {
            if (error.transactionId === transactionId) {
              clearTimeout(timeout);
              modbusTCP.removeListener('data', dataHandler);
              reject(error);
            }
          };
          
          modbusTCP.on('data', dataHandler);
          modbusTCP.on('error', errorHandler);
        });
        
        log(`读取成功: ${JSON.stringify(response)}`, 'SUCCESS');
        
      } catch (err) {
        log(`读取失败: ${err.message}`, 'ERROR');
      }
    }
    
    // 断开连接
    log('断开ModbusTCP连接...', 'INFO');
    await modbusTCP.disconnect();
    log('ModbusTCP连接已断开', 'INFO');
    
    return connectionSuccessful;
  } catch (error) {
    log(`ModbusTCP连接测试失败: ${error.message}`, 'ERROR');
    return false;
  }
}

// 测试ModbusService
async function testModbusService() {
  log('测试ModbusService...', 'STEP');
  
  // 事件监听
  ModbusService.on('connected', () => {
    log('ModbusService发出connected事件', 'SUCCESS');
  });
  
  ModbusService.on('disconnected', (info) => {
    log(`ModbusService发出disconnected事件: ${JSON.stringify(info)}`, 'INFO');
  });
  
  ModbusService.on('error', (error) => {
    log(`ModbusService发出error事件: ${error.message}`, 'ERROR');
  });
  
  try {
    log('开始ModbusService连接...', 'INFO');
    await ModbusService.connect(config);
    
    // 获取连接状态
    const status = ModbusService.getConnectionStatus();
    log(`ModbusService连接状态: ${JSON.stringify(status)}`, 'INFO');
    
    if (status.isConnected) {
      log('ModbusService连接成功', 'SUCCESS');
      
      // 检查连接
      log('执行连接检查...', 'INFO');
      const connectionOk = await ModbusService.checkConnection();
      log(`连接检查结果: ${connectionOk ? '正常' : '异常'}`, connectionOk ? 'SUCCESS' : 'ERROR');
      
      // 断开连接
      log('断开ModbusService连接...', 'INFO');
      await ModbusService.disconnect();
      log('ModbusService连接已断开', 'INFO');
      
      return true;
    } else {
      log('ModbusService连接失败', 'ERROR');
      return false;
    }
  } catch (error) {
    log(`ModbusService连接测试失败: ${error.message}`, 'ERROR');
    return false;
  }
}

// 主函数
async function main() {
  log('==================================================', 'STEP');
  log('Modbus连接调试工具', 'STEP');
  log('==================================================', 'STEP');
  
  // 系统信息
  await getSystemInfo();
  log('--------------------------------------------------', 'STEP');
  
  // 测试配置
  const configValid = await testModbusConfig();
  if (!configValid) {
    log('由于配置无效，终止测试', 'ERROR');
    return;
  }
  log('--------------------------------------------------', 'STEP');
  
  // 测试TCP连接
  const tcpConnected = await testTcpConnection();
  if (!tcpConnected) {
    log('由于TCP连接失败，无法继续测试', 'ERROR');
    log('请检查以下可能的问题:', 'INFO');
    log('1. 检查设备是否开启', 'INFO');
    log('2. 检查网络连接是否正常', 'INFO');
    log('3. 检查IP地址和端口是否正确', 'INFO');
    log('4. 检查防火墙是否允许此连接', 'INFO');
    return;
  }
  log('--------------------------------------------------', 'STEP');
  
  // 测试Modbus连接
  const modbusConnected = await testModbusConnection();
  if (!modbusConnected) {
    log('Modbus连接测试失败', 'ERROR');
    log('请检查以下可能的问题:', 'INFO');
    log('1. 设备是否支持Modbus TCP协议', 'INFO');
    log('2. 单元ID是否正确', 'INFO');
    log('3. 检查Modbus寄存器映射是否正确', 'INFO');
    return;
  }
  log('--------------------------------------------------', 'STEP');
  
  // 测试ModbusService
  const serviceConnected = await testModbusService();
  if (!serviceConnected) {
    log('ModbusService连接测试失败', 'ERROR');
    return;
  }
  
  log('==================================================', 'STEP');
  log('连接诊断完成', 'SUCCESS');
  log('==================================================', 'STEP');
}

// 运行主函数
main().catch(err => {
  log(`程序执行错误: ${err.message}`, 'ERROR');
  if (err.stack) {
    console.error(err.stack);
  }
}); 
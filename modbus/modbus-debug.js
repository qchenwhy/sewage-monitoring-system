/**
 * Modbus全面诊断工具
 * 提供完整的Modbus环境和连接诊断信息
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const dns = require('dns').promises;

// 导入所需模块
const modbusServiceModule = require('./modbus-service');
const ConfigManager = require('./config-manager');
const DataPointManager = require('./data-point-manager');
const ModbusTCP = require('./modbus-tcp');

// 配置
const LOG_FILE = path.join(__dirname, '..', 'logs', 'modbus-debug.log');

// 确保日志目录存在
const logDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 同时输出到控制台和日志文件
function log(message, type = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${type}] ${message}`;
  
  console.log(logMessage);
  
  try {
    fs.appendFileSync(LOG_FILE, logMessage + '\n');
  } catch (err) {
    console.error(`无法写入日志文件: ${err.message}`);
  }
}

// 错误日志
function logError(message, error) {
  log(message, 'ERROR');
  if (error) {
    log(`错误详情: ${error.message}`, 'ERROR');
    if (error.stack) {
      log(`堆栈信息: ${error.stack}`, 'ERROR');
    }
  }
}

// 获取系统信息
async function getSystemInfo() {
  log('====== 系统信息 ======');
  log(`操作系统: ${os.type()} ${os.release()} ${os.arch()}`);
  log(`主机名: ${os.hostname()}`);
  log(`用户: ${os.userInfo().username}`);
  log(`内存: ${Math.round(os.totalmem() / (1024 * 1024))} MB`);
  log(`可用内存: ${Math.round(os.freemem() / (1024 * 1024))} MB`);
  
  // 获取Node.js信息
  log(`Node.js版本: ${process.version}`);
  log(`进程ID: ${process.pid}`);
  log(`当前工作目录: ${process.cwd()}`);
  
  // 获取环境变量
  log('环境变量:');
  log(`  NODE_ENV: ${process.env.NODE_ENV || '未设置'}`);
}

// 获取网络信息
async function getNetworkInfo() {
  log('====== 网络信息 ======');
  
  // 获取网络接口
  const networkInterfaces = os.networkInterfaces();
  log('网络接口:');
  
  Object.keys(networkInterfaces).forEach(interfaceName => {
    const interfaces = networkInterfaces[interfaceName];
    
    interfaces.forEach(iface => {
      if (iface.family === 'IPv4') {
        log(`  ${interfaceName}: ${iface.address} / ${iface.netmask} (${iface.internal ? '内部' : '外部'})`);
      }
    });
  });
}

// 检查Modbus配置
async function checkModbusConfig() {
  log('====== Modbus配置 ======');
  
  try {
    // 1. 检查配置管理器
    const configManager = new ConfigManager();
    const config = configManager.getConnectionConfig();
    
    log('连接配置:');
    log(`  主机: ${config.host}`);
    log(`  端口: ${config.port}`);
    log(`  单元ID: ${config.unitId}`);
    log(`  超时: ${config.timeout}ms`);
    log(`  自动连接: ${config.autoConnect}`);
    log(`  自动重连: ${config.autoReconnect}`);
    log(`  最大重连次数: ${config.maxReconnectAttempts}`);
    log(`  保活地址: ${config.keepAliveAddress}`);
    log(`  保活功能码: ${config.keepAliveFunctionCode}`);
    
    // 2. 检查配置文件是否存在
    const configFilePath = path.join(__dirname, '..', 'data', 'modbus-config.json');
    if (fs.existsSync(configFilePath)) {
      const rawConfig = fs.readFileSync(configFilePath, 'utf8');
      log(`配置文件存在: ${configFilePath}`);
      log(`配置文件内容: ${rawConfig}`);
    } else {
      log(`配置文件不存在: ${configFilePath}`, 'WARNING');
    }
    
    return config;
  } catch (error) {
    logError('获取Modbus配置时出错', error);
    return null;
  }
}

// 检查数据点配置
async function checkDataPoints() {
  log('====== 数据点配置 ======');
  
  try {
    const dataPointManager = new DataPointManager();
    const dataPoints = dataPointManager.getAllDataPoints();
    
    log(`找到 ${dataPoints.length} 个数据点`);
    
    if (dataPoints.length > 0) {
      dataPoints.forEach((dataPoint, index) => {
        log(`数据点 #${index + 1}:`);
        log(`  ID: ${dataPoint.id}`);
        log(`  名称: ${dataPoint.name}`);
        log(`  标识符: ${dataPoint.identifier}`);
        log(`  地址: ${dataPoint.address}`);
        log(`  访问模式: ${dataPoint.accessMode || 'readwrite'}`);
        log(`  读取功能码: ${dataPoint.readFunctionCode}`);
        log(`  写入功能码: ${dataPoint.writeFunctionCode}`);
        log(`  格式: ${dataPoint.format || 'UINT16'}`);
      });
    } else {
      log('没有找到数据点配置', 'WARNING');
    }
    
    // 检查TjT数据点
    const tjtDataPoint = dataPointManager.getDataPointByIdentifier('TjT');
    if (tjtDataPoint) {
      log('找到TjT数据点:');
      log(`  名称: ${tjtDataPoint.name}`);
      log(`  地址: ${tjtDataPoint.address}`);
      log(`  格式: ${tjtDataPoint.format || 'UINT16'}`);
    } else {
      log('未找到TjT数据点', 'WARNING');
    }
    
    return dataPoints;
  } catch (error) {
    logError('获取数据点信息时出错', error);
    return [];
  }
}

// 检查Modbus连接
async function testModbusConnection(host, port) {
  log('====== Modbus连接测试 ======');
  log(`测试连接到 ${host}:${port}`);
  
  // 1. 尝试ping主机
  try {
    log(`执行Ping测试(${host})...`);
    const pingResult = await executeCommand(`ping -n 3 ${host}`);
    log('Ping测试结果: 成功');
  } catch (error) {
    log(`Ping测试失败: ${error.message}`, 'WARNING');
  }
  
  // 2. 尝试直接TCP连接
  try {
    log(`测试TCP连接到 ${host}:${port}...`);
    const client = new ModbusTCP({
      host,
      port,
      unitId: 1,
      timeout: 5000,
      autoReconnect: false
    });
    
    const connected = await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        log('TCP连接超时', 'WARNING');
        resolve(false);
      }, 5000);
      
      client.on('connected', () => {
        clearTimeout(timeout);
        resolve(true);
      });
      
      client.on('error', (err) => {
        clearTimeout(timeout);
        log(`TCP连接错误: ${err.message}`, 'ERROR');
        resolve(false);
      });
      
      client.connect();
    });
    
    if (connected) {
      log('TCP连接成功');
      
      // 尝试读取一个寄存器
      log('尝试读取保持寄存器 0...');
      
      try {
        const result = await new Promise((resolve, reject) => {
          const tid = client.readHoldingRegisters(0, 1);
          
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
        
        log(`读取结果: ${JSON.stringify(result)}`);
      } catch (error) {
        log(`读取操作失败: ${error.message}`, 'WARNING');
      }
      
      // 尝试断开连接
      try {
        await client.disconnect();
        log('TCP连接已断开');
      } catch (err) {
        log(`断开连接时出错: ${err.message}`, 'WARNING');
      }
    } else {
      log('无法建立TCP连接', 'WARNING');
    }
  } catch (error) {
    logError('TCP连接测试出错', error);
  }
}

// 测试ModbusService实例
async function testModbusService() {
  log('====== ModbusService实例测试 ======');
  
  try {
    // 1. 获取实例
    log('获取ModbusService实例...');
    const modbusService = modbusServiceModule.getInstance();
    
    if (!modbusService) {
      log('无法获取ModbusService实例', 'ERROR');
      return;
    }
    
    log('成功获取ModbusService实例');
    
    // 2. 检查当前连接状态
    const status = modbusService.getConnectionStatus();
    log(`当前连接状态: ${JSON.stringify(status)}`);
    
    // 3. 尝试连接
    log('尝试连接到Modbus服务器...');
    try {
      await modbusService.disconnect(); // 先断开现有连接
      log('已断开现有连接');
      
      const config = modbusService.configManager.getConnectionConfig();
      await modbusService.connect(config);
      
      const newStatus = modbusService.getConnectionStatus();
      log(`连接后状态: ${JSON.stringify(newStatus)}`);
      
      if (newStatus.isConnected) {
        log('成功连接到Modbus服务器');
        
        // 检查连接是否确实有效
        try {
          log('执行连接检查...');
          const connectionOk = await modbusService.checkConnection();
          log(`连接检查结果: ${connectionOk ? '正常' : '异常'}`);
        } catch (checkError) {
          logError('连接检查失败', checkError);
        }
        
        // 4. 尝试获取所有数据点值
        try {
          log('获取所有数据值...');
          const values = await modbusService.getAllDataValues();
          log(`获取的数据值: ${JSON.stringify(values)}`);
        } catch (dataError) {
          logError('获取数据值失败', dataError);
        }
        
        // 5. 尝试写入TjT数据点
        try {
          log('尝试写入数据点TjT值为2...');
          const result = await modbusService.writeDataPointValue('TjT', 2);
          log(`写入结果: ${JSON.stringify(result)}`);
          log('写入成功!');
        } catch (writeError) {
          logError('写入数据点失败', writeError);
        }
      } else {
        log('连接失败', 'WARNING');
      }
      
      // 6. 断开连接
      await modbusService.disconnect();
      log('已断开连接');
    } catch (connectionError) {
      logError('连接操作失败', connectionError);
    }
  } catch (error) {
    logError('ModbusService测试失败', error);
  }
}

// 执行命令并返回结果
async function executeCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      
      if (stderr) {
        reject(new Error(stderr));
        return;
      }
      
      resolve(stdout);
    });
  });
}

// 主函数
async function main() {
  log('===================================================');
  log('         Modbus 全面诊断工具 启动                   ');
  log('===================================================');
  
  try {
    await getSystemInfo();
    await getNetworkInfo();
    
    const config = await checkModbusConfig();
    await checkDataPoints();
    
    if (config) {
      await testModbusConnection(config.host, config.port);
    }
    
    await testModbusService();
    
    log('===================================================');
    log('         Modbus 诊断完成                          ');
    log('===================================================');
  } catch (error) {
    logError('诊断过程中发生错误', error);
  }
}

// 运行主函数
main(); 
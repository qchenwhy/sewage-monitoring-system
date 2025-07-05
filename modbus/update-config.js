/**
 * 更新Modbus配置文件
 */

const fs = require('fs');
const path = require('path');

// 配置文件路径
const configPath = path.join(__dirname, '..', 'data', 'modbus-config.json');

// 新的配置
const newConfig = {
  connection: {
    host: '127.0.0.1',
    port: 502,
    unitId: 1,
    timeout: 5000,
    autoConnect: true,
    autoReconnect: true,
    maxReconnectAttempts: 5,
    keepAliveAddress: 12,
    keepAliveFunctionCode: 3
  },
  polling: {
    interval: 1000,
    enabled: false
  }
};

// 确保目录存在
const dir = path.dirname(configPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// 写入配置
try {
  fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf8');
  console.log('配置文件已更新:');
  console.log(configPath);
  console.log('新配置:');
  console.log(JSON.stringify(newConfig, null, 2));
} catch (error) {
  console.error('更新配置失败:', error);
} 
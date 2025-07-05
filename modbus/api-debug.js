/**
 * Modbus HTTP API 测试工具
 * 
 * 这个工具使用HTTP请求直接测试Modbus API接口
 */

const http = require('http');

// 配置参数
const HOST = 'localhost';
const PORT = 3000;
const IDENTIFIER = 'TjT';
const VALUE = 2;

console.log('==================================================');
console.log('        Modbus HTTP API 测试工具                 ');
console.log('==================================================');
console.log(`配置:`);
console.log(`  - 服务器: ${HOST}:${PORT}`);
console.log(`  - 数据点标识符: ${IDENTIFIER}`);
console.log(`  - 写入值: ${VALUE}`);
console.log('--------------------------------------------------');

// 测试服务器状态
function testServerConnection() {
  return new Promise((resolve) => {
    console.log('\n测试服务器连通性...');
    
    const req = http.request({
      hostname: HOST,
      port: PORT,
      path: '/',
      method: 'GET'
    }, (res) => {
      console.log(`服务器连接正常，状态码: ${res.statusCode}`);
      // 消费响应数据
      res.resume();
      resolve(true);
    });
    
    req.on('error', (error) => {
      console.error(`服务器连接失败: ${error.message}`);
      resolve(false);
    });
    
    req.end();
  });
}

// 测试Modbus连接状态
async function testModbusStatus() {
  console.log('\n测试Modbus连接状态...');
  
  try {
    const result = await makeRequest('GET', '/api/modbus/status');
    console.log(`Modbus连接状态: ${result.isConnected ? '已连接' : '未连接'}`);
    console.log(`详细信息: ${JSON.stringify(result)}`);
    return result.isConnected;
  } catch (error) {
    console.error(`Modbus状态检查失败: ${error.message}`);
    if (error.response) {
      console.error(`服务器响应: ${error.response}`);
    }
    return false;
  }
}

// 测试获取数据点
async function testGetDataPoints() {
  console.log('\n获取数据点列表...');
  
  try {
    const result = await makeRequest('GET', '/api/modbus/datapoints');
    console.log(`找到 ${result.length || 0} 个数据点`);
    
    // 查找目标数据点
    const targetPoint = result.find(dp => dp.identifier === IDENTIFIER);
    if (targetPoint) {
      console.log(`找到目标数据点 ${IDENTIFIER}:`);
      console.log(`  - 名称: ${targetPoint.name}`);
      console.log(`  - 地址: ${targetPoint.address}`);
      console.log(`  - 格式: ${targetPoint.format || 'UINT16'}`);
      return targetPoint;
    } else {
      console.error(`未找到目标数据点: ${IDENTIFIER}`);
      return null;
    }
  } catch (error) {
    console.error(`获取数据点失败: ${error.message}`);
    if (error.response) {
      console.error(`服务器响应: ${error.response}`);
    }
    return null;
  }
}

// 测试写入数据点
async function testWriteDataPoint(dataPoint) {
  if (!dataPoint) {
    console.error('未提供数据点信息，无法执行写入测试');
    return false;
  }
  
  console.log('\n测试写入数据点...');
  console.log(`准备写入数据点 ${dataPoint.name} (${dataPoint.identifier}), 值: ${VALUE}`);
  
  const postData = JSON.stringify({
    identifier: dataPoint.identifier,
    value: VALUE
  });
  
  try {
    const result = await makeRequest('POST', '/api/modbus/write', postData, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    });
    
    console.log(`写入结果: ${result.success ? '成功' : '失败'}`);
    console.log(`详细信息: ${JSON.stringify(result)}`);
    return result.success;
  } catch (error) {
    console.error(`写入数据点失败: ${error.message}`);
    if (error.response) {
      console.error(`服务器响应: ${error.response}`);
    }
    return false;
  }
}

// 发送HTTP请求
function makeRequest(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path: path,
      method: method,
      headers: headers
    };
    
    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const result = JSON.parse(responseData);
            resolve(result);
          } catch (error) {
            reject(new Error(`无法解析响应: ${error.message}`));
          }
        } else {
          const error = new Error(`HTTP错误: ${res.statusCode}`);
          error.response = responseData;
          error.statusCode = res.statusCode;
          reject(error);
        }
      });
    });
    
    req.on('error', (error) => {
      reject(new Error(`请求错误: ${error.message}`));
    });
    
    if (data) {
      req.write(data);
    }
    
    req.end();
  });
}

// 主函数
async function main() {
  try {
    // 1. 检查服务器状态
    const serverOk = await testServerConnection();
    if (!serverOk) {
      console.error('\n✗ 服务器状态检查失败，中止测试');
      return;
    }
    
    // 2. 检查Modbus连接状态
    const modbusConnected = await testModbusStatus();
    if (!modbusConnected) {
      console.error('\n✗ Modbus未连接，尝试测试写入可能会失败');
    }
    
    // 3. 获取数据点
    const dataPoint = await testGetDataPoints();
    if (!dataPoint) {
      console.error('\n✗ 无法获取数据点信息，中止测试');
      return;
    }
    
    // 4. 测试写入
    const writeSuccess = await testWriteDataPoint(dataPoint);
    
    if (writeSuccess) {
      console.log('\n✅ API测试完成: 所有操作成功');
    } else {
      console.log('\n❌ API测试完成: 写入操作失败');
    }
  } catch (error) {
    console.error(`\n✗ 测试过程中发生错误: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

// 运行主函数
main(); 
const aedes = require('aedes')();
const server = require('net').createServer(aedes.handle);
const port = 1883;
const wsPort = 8083;
const fs = require('fs');
const path = require('path');
const http = require('http');
const ws = require('websocket-stream');

// 创建HTTP服务器用于WebSocket连接
const httpServer = http.createServer();
ws.createServer({ server: httpServer }, aedes.handle);

// 默认数据点值
let dataPointValues = {};

// 加载数据点配置
function loadDataPoints() {
  try {
    const dataPointsPath = path.join(__dirname, 'data', 'data-points.json');
    if (fs.existsSync(dataPointsPath)) {
      const dataPoints = JSON.parse(fs.readFileSync(dataPointsPath, 'utf8'));
      
      // 初始化数据点值
      dataPoints.forEach(dp => {
        const identifier = dp.identifier || dp.name || `dp_${dp.address}`;
        const defaultValue = dp.format === 'BIT' ? 0 : (dp.format.includes('FLOAT') ? 0.0 : 0);
        
        dataPointValues[identifier] = {
          value: defaultValue,
          formatted: defaultValue.toString(),
          timestamp: new Date().toISOString()
        };
      });
      
      console.log(`已加载 ${dataPoints.length} 个数据点`);
    } else {
      console.log('数据点配置文件不存在');
    }
  } catch (error) {
    console.error('加载数据点配置失败:', error);
  }
}

// 服务器启动事件
server.listen(port, function () {
  console.log(`MQTT服务器已启动，监听端口: ${port}`);
  
  // 加载数据点
  loadDataPoints();
  
  // 启动模拟数据变化 - 已移除自动数据生成功能
  // startDataSimulation();
});

// WebSocket服务器启动
httpServer.listen(wsPort, function () {
  console.log(`MQTT WebSocket服务器已启动，监听端口: ${wsPort}`);
});

// 客户端连接事件
aedes.on('client', function (client) {
  console.log(`客户端已连接: ${client.id}`);
});

// 客户端断开连接事件
aedes.on('clientDisconnect', function (client) {
  console.log(`客户端已断开连接: ${client.id}`);
});

// 发布事件
aedes.on('publish', function (packet, client) {
  if (client) {
    // 确保主题正确解码为UTF-8字符串
    let topic;
    try {
      if (Buffer.isBuffer(packet.topic)) {
        topic = packet.topic.toString('utf8');
      } else {
        topic = String(packet.topic);
      }
      
      // 检查主题是否包含有效字符
      if (topic && topic.length > 0 && !/[\x00-\x1F\x7F-\x9F]/.test(topic)) {
        console.log(`收到来自 ${client.id} 的消息, 主题: ${topic}`);
        
        // 如果需要，也可以记录消息内容（但要小心大消息）
        if (packet.payload && packet.payload.length < 1000) {
          let payload;
          try {
            if (Buffer.isBuffer(packet.payload)) {
              payload = packet.payload.toString('utf8');
            } else {
              payload = String(packet.payload);
            }
            console.log(`消息内容: ${payload}`);
          } catch (payloadError) {
            console.log(`消息内容解码失败: ${payloadError.message}`);
          }
        }
      } else {
        console.log(`收到来自 ${client.id} 的消息, 主题包含无效字符或为空`);
        console.log(`原始主题数据:`, packet.topic);
      }
    } catch (error) {
      console.error(`处理MQTT消息主题时出错: ${error.message}`);
      console.log(`原始主题数据:`, packet.topic);
    }
  }
});

// 订阅事件
aedes.on('subscribe', function (subscriptions, client) {
  try {
    // 安全地处理订阅主题
    const topicList = subscriptions.map(s => {
      let topic;
      if (Buffer.isBuffer(s.topic)) {
        topic = s.topic.toString('utf8');
      } else {
        topic = String(s.topic);
      }
      return topic;
    }).filter(topic => topic && topic.length > 0 && !/[\x00-\x1F\x7F-\x9F]/.test(topic));
    
    console.log(`客户端 ${client.id} 订阅了主题:`, topicList.join(', '));
    
    // 删除自动发送当前值的功能 - 这会造成资源浪费
    // 客户端订阅时不需要自动发送当前值，应该由数据更新时主动推送
    
  } catch (error) {
    console.error(`处理订阅事件时出错: ${error.message}`);
  }
});

// 错误处理
aedes.on('error', function (error) {
  console.error('MQTT服务器错误:', error);
});

// 改进的关闭处理
let isShuttingDown = false;

function gracefulShutdown(signal) {
  if (isShuttingDown) {
    console.log(`已经在关闭过程中，忽略信号: ${signal}`);
    return;
  }
  
  isShuttingDown = true;
  console.log(`收到信号 ${signal}，正在关闭MQTT服务器...`);
  
  // 设置关闭超时，防止无限等待
  const shutdownTimeout = setTimeout(() => {
    console.log('关闭超时，强制退出');
    process.exit(1);
  }, 5000); // 5秒超时
  
  let closedCount = 0;
  const totalServers = 2; // TCP服务器和HTTP服务器
  
  function checkAllClosed() {
    closedCount++;
    if (closedCount >= totalServers) {
      clearTimeout(shutdownTimeout);
      console.log('所有服务器已关闭');
      
      // 关闭aedes实例
      if (aedes && typeof aedes.close === 'function') {
        aedes.close(() => {
          console.log('MQTT broker已关闭');
          process.exit(0);
        });
      } else {
        process.exit(0);
      }
    }
  }
  
  // 关闭TCP服务器
  if (server) {
    server.close((err) => {
      if (err) {
        console.error('关闭TCP服务器时出错:', err);
      } else {
        console.log('TCP服务器已关闭');
      }
      checkAllClosed();
    });
  } else {
    checkAllClosed();
  }
  
  // 关闭HTTP服务器（WebSocket）
  if (httpServer) {
    httpServer.close((err) => {
      if (err) {
        console.error('关闭HTTP服务器时出错:', err);
      } else {
        console.log('HTTP服务器已关闭');
      }
      checkAllClosed();
    });
  } else {
    checkAllClosed();
  }
}

// 监听多种退出信号
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  gracefulShutdown('uncaughtException');
});

// 处理未处理的Promise拒绝
process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
  gracefulShutdown('unhandledRejection');
});

console.log('MQTT服务器初始化完成'); 
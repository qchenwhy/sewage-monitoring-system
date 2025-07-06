/**
 * MQTT服务模块
 * 负责处理MQTT连接、订阅、发布以及消息处理
 */

const mqtt = require('mqtt');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');

class MQTTService extends EventEmitter {
  constructor() {
    super(); // 初始化EventEmitter
    this.client = null;
    this.settings = null;
    this.wsClients = new Set(); // WebSocket客户端列表
    this.configPath = path.join(process.cwd(), 'config', 'mqtt-settings.json');
    this._lastPublishTimes = new Map();
    this._processingQueue = [];
    this._processedMessages = new Set();
    this._isProcessing = false;
    this._alarmStates = {};
    this._multiConditionAlarmStates = {}; // 重置多条件告警状态
    
    // 【新增】每次启动时清空多条件告警状态，确保能重新触发告警
    console.log('[多条件告警检查] 初始化时清空告警状态，确保能重新触发告警');
  }

  /**
   * 初始化MQTT服务
   * @param {Set} wsClients - WebSocket客户端集合
   */
  initialize(wsClients) {
    if (wsClients) {
      this.wsClients = wsClients;
    }
    
    // 确保配置目录存在
    const configDir = path.dirname(this.configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    // 加载配置
    this.loadSettings();
    
    // 如果设置为MQTT数据源且启用，则连接MQTT服务器
    if (this.settings && this.settings.dataSourceType === 'mqtt') {
      this.connect();
    }
    
    return this;
  }

  /**
   * 加载MQTT设置
   */
  loadSettings() {
    try {
      if (fs.existsSync(this.configPath)) {
        const settingsData = fs.readFileSync(this.configPath, 'utf8');
        this.settings = JSON.parse(settingsData);
        console.log('已加载MQTT设置');
      } else {
        // 默认设置
        this.settings = {
          dataSourceType: 'modbus',
          url: 'mqtt://localhost:1883',
          clientId: `modbus_mqtt_client_${Math.random().toString(16).substring(2, 10)}`,
          clean: true,
          reconnectPeriod: 5000,
          connectTimeout: 30000,
          subscribeTopic: 'data/modbus',
          publishTopic: 'data/modbus/',
          globalPublishTopic: 'data/mqtt', // 全局发布主题，用于数据写入
          dataFormat: 'json',
          retain: false,
          enableForwarding: false // 默认禁用转发
        };
        // 保存默认设置
        this.saveSettings(this.settings);
      }
    } catch (error) {
      console.error('加载MQTT设置失败:', error);
      // 使用默认设置
      this.settings = {
        dataSourceType: 'modbus',
        url: 'mqtt://localhost:1883',
        enableForwarding: false // 默认禁用转发
      };
    }
    
    return this.settings;
  }

  /**
   * 保存MQTT设置
   * @param {Object} settings - MQTT设置对象
   */
  saveSettings(settings) {
    try {
      // 确保配置目录存在
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      // 更新当前设置
      this.settings = settings;
      
      // 写入配置文件
      fs.writeFileSync(this.configPath, JSON.stringify(settings, null, 2), 'utf8');
      console.log('已保存MQTT设置');
      
      return true;
    } catch (error) {
      console.error('保存MQTT设置失败:', error);
      return false;
    }
  }

  /**
   * 连接到MQTT服务器
   */
  connect() {
    // 如果已有连接，先断开
    if (this.client) {
      this.client.end(true);
      this.client = null;
    }
    
    // 检查设置是否有效
    if (!this.settings || !this.settings.url) {
      console.error('MQTT设置无效，无法连接');
      return false;
    }
    
    // 创建MQTT客户端连接选项
    const mqttOptions = {
      clientId: this.settings.clientId || `modbus_mqtt_client_${Math.random().toString(16).substring(2, 10)}`,
      username: this.settings.username,
      password: this.settings.password,
      clean: this.settings.clean !== false,
      reconnectPeriod: this.settings.reconnectPeriod || 5000,
      connectTimeout: this.settings.connectTimeout || 30000,
      keepalive: this.settings.keepalive || 60
    };
    
    try {
      console.log(`尝试连接到MQTT服务器: ${this.settings.url}`);
      this.client = mqtt.connect(this.settings.url, mqttOptions);
      
      // 连接事件处理
      this.client.on('connect', () => {
        console.log('已连接到MQTT服务器');
        
        // 订阅主题
        if (this.settings.subscribeTopic) {
          this.client.subscribe(this.settings.subscribeTopic, (err) => {
            if (err) {
              console.error('订阅主题失败:', err);
            } else {
              console.log(`已订阅主题: ${this.settings.subscribeTopic}`);
            }
          });
        }
      });
      
      // 消息事件处理
      this.client.on('message', (topic, message) => {
        this.handleMessage(topic, message);
      });
      
      // 错误事件处理
      this.client.on('error', (err) => {
        console.error('MQTT连接错误:', err);
      });
      
      // 重连事件处理
      this.client.on('reconnect', () => {
        console.log('正在尝试重新连接到MQTT服务器');
      });
      
      // 断开连接事件处理
      this.client.on('close', () => {
        console.log('MQTT连接已关闭');
      });
      
      // 离线事件处理
      this.client.on('offline', () => {
        console.log('MQTT客户端离线');
      });
      
      return true;
    } catch (error) {
      console.error('创建MQTT连接失败:', error);
      return false;
    }
  }

  /**
   * 处理接收到的MQTT消息
   * @param {string} topic - 消息主题
   * @param {Buffer} message - 消息内容
   */
  handleMessage(topic, message) {
    try {
      console.log(`收到MQTT消息，主题: ${topic}`);
      
      // 防止处理自己发布的消息导致循环
      if (this.settings.publishTopic && topic.startsWith(this.settings.publishTopic)) {
        // 检查是否是由本系统发布的消息
        // 如果是本系统最近发布的，跳过处理
        const lastPublishTime = this._getLastPublishTime(topic);
        const now = Date.now();
        if (lastPublishTime && (now - lastPublishTime < 3000)) {  // 3秒内的消息认为是自己发布的
          console.log(`跳过处理可能由本系统发布的消息: ${topic}`);
          return;
        }
      }
      
      // 🔧 修复：改进消息缓冲区和编码处理
      let messageString;
      try {
        // 确保消息是Buffer类型，然后正确转换为字符串
        if (Buffer.isBuffer(message)) {
          // 使用UTF-8编码转换，并去除可能的空字符和控制字符
          messageString = message.toString('utf8').replace(/\0/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
        } else if (typeof message === 'string') {
          // 如果已经是字符串，清理控制字符
          messageString = message.replace(/\0/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
        } else {
          // 其他类型，尝试转换为字符串
          messageString = String(message).replace(/\0/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
        }
        
        // 去除首尾空白字符
        messageString = messageString.trim();
        
        // 检查消息长度
        if (messageString.length === 0) {
          console.warn(`收到空消息，主题: ${topic}`);
          return;
        }
        
        // 检查消息是否过长（可能是数据损坏）
        if (messageString.length > 10000) {
          console.warn(`消息过长，可能存在数据问题，长度: ${messageString.length}，主题: ${topic}`);
          console.log(`消息前100字符: ${messageString.substring(0, 100)}`);
          console.log(`消息后100字符: ${messageString.substring(messageString.length - 100)}`);
        }
        
        console.log(`处理消息，长度: ${messageString.length}，主题: ${topic}`);
        
      } catch (encodingError) {
        console.error(`消息编码处理失败:`, encodingError);
        console.log(`原始消息类型: ${typeof message}, 长度: ${message?.length || 'unknown'}`);
        return;
      }
      
      // 从主题中提取可能的标识符
      let topicIdentifier = '';
      if (topic.includes('/')) {
        const parts = topic.split('/');
        topicIdentifier = parts[parts.length - 1];
      }
      
      // 添加时间戳到消息，确保相同内容的消息也能被系统视为不同消息处理
      const messageTimestamp = new Date().toISOString();
      
      let messageData;
      if (this.settings.dataFormat === 'json') {
        // 🔧 修复：改进JSON解析逻辑
        try {
          // 尝试找到JSON的开始和结束位置
          let jsonStart = messageString.indexOf('{');
          let jsonEnd = messageString.lastIndexOf('}');
          
          if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
            throw new Error('未找到有效的JSON开始或结束标记');
          }
          
          // 提取JSON部分
          const jsonPart = messageString.substring(jsonStart, jsonEnd + 1);
          
          // 如果提取的JSON部分与原始消息不同，说明可能存在乱码
          if (jsonPart.length !== messageString.length) {
            console.warn(`检测到消息中可能存在乱码，原始长度: ${messageString.length}, JSON部分长度: ${jsonPart.length}`);
            console.log(`JSON部分: ${jsonPart}`);
            console.log(`被过滤的部分: "${messageString.replace(jsonPart, '[FILTERED_PART]')}"`);
          }
          
          // 解析清理后的JSON
          messageData = JSON.parse(jsonPart);
          console.log(`✅ 成功解析JSON数据，键数量: ${Object.keys(messageData).length}`);
          
          // 在消息数据中添加时间戳，确保数据唯一性
          if (typeof messageData === 'object' && !Array.isArray(messageData)) {
            messageData._timestamp = messageTimestamp;
          }
          
          // 处理几种常见的JSON格式
          if (typeof messageData === 'object' && !Array.isArray(messageData)) {
            // 情况1: 扁平键值对对象，如 {"XHY2GZ2": 22}
            if (Object.keys(messageData).length > 0) {
              // 检查是否包含value字段
              if (messageData.value !== undefined && Object.keys(messageData).length <= 5) {
                // 情况2: {value: 22, formatted: "22", timestamp: "..."}
                // 这种情况使用主题中的标识符作为数据点标识符
                const dataPoint = {};
                dataPoint[topicIdentifier] = messageData.value;
                console.log(`从主题提取标识符: ${topicIdentifier}，值: ${messageData.value}`);
                this.processDataPoints('modbus', dataPoint);
              } else {
                // 处理扁平键值对
                console.log(`处理扁平键值对，键数量: ${Object.keys(messageData).length}`);
                
                // 1. 首先尝试标准化数据格式
                const normalizedData = {};
                
                // 处理每个键值对
                for (const [key, value] of Object.entries(messageData)) {
                  // 跳过处理我们添加的时间戳字段
                  if (key === '_timestamp') continue;
                  
                  // 如果值是对象并且有value字段
                  if (typeof value === 'object' && value !== null && value.value !== undefined) {
                    // 情况3: {"XHY2GZ2": {value: 22, ...}}
                    normalizedData[key] = value.value;
                    console.log(`提取数据点嵌套值: ${key} = ${value.value}`);
                  } else if (typeof value === 'object' && value !== null && value.formatted !== undefined) {
                    // 情况4: {"XHY2GZ2": {formatted: "22", ...}}
                    const parsedValue = parseFloat(value.formatted);
                    if (!isNaN(parsedValue)) {
                      normalizedData[key] = parsedValue;
                      console.log(`从formatted提取数据点值: ${key} = ${parsedValue}`);
                    } else {
                      normalizedData[key] = value.formatted;
                      console.log(`使用formatted作为字符串值: ${key} = ${value.formatted}`);
                    }
                  } else {
                    // 直接键值对
                    normalizedData[key] = value;
                    console.log(`提取数据点: ${key} = ${value}`);
                  }
                }
                
                // 作为数据点处理
                this.processDataPoints('modbus', normalizedData);
              }
            } else {
              // 空对象，发送原始数据
              this.sendToWebSocketClients({
                type: 'mqtt_data',
                topic: topic,
                data: messageData,
                timestamp: messageTimestamp
              });
            }
          } else {
            // 非对象数据（如数组或原始值），使用主题作为标识符
            if (typeof messageData === 'number' || typeof messageData === 'string') {
              // 情况4: 直接是数值或字符串
              const value = typeof messageData === 'string' ? parseFloat(messageData) || messageData : messageData;
              const dataPoint = {};
              dataPoint[topicIdentifier] = value;
              console.log(`从主题提取标识符: ${topicIdentifier}，值: ${value}`);
              this.processDataPoints('modbus', dataPoint);
            } else {
              // 其他类型，作为普通MQTT数据处理
              this.sendToWebSocketClients({
                type: 'mqtt_data',
                topic: topic,
                data: messageData,
                timestamp: messageTimestamp
              });
            }
          }
        } catch (jsonError) {
          console.error(`❌ JSON解析失败:`, jsonError);
          console.log(`问题消息长度: ${messageString.length}`);
          console.log(`消息前200字符: "${messageString.substring(0, 200)}"`);
          console.log(`消息后200字符: "${messageString.substring(Math.max(0, messageString.length - 200))}"`);
          
          // 尝试修复常见的JSON格式问题
          try {
            console.log(`🔧 尝试修复JSON格式问题...`);
            
            // 1. 移除末尾可能的乱码
            let cleanedMessage = messageString;
            
            // 查找最后一个完整的JSON结束标记
            const lastBraceIndex = cleanedMessage.lastIndexOf('}');
            if (lastBraceIndex > 0 && lastBraceIndex < cleanedMessage.length - 1) {
              const afterBrace = cleanedMessage.substring(lastBraceIndex + 1);
              console.log(`检测到JSON结束后的内容: "${afterBrace}"`);
              cleanedMessage = cleanedMessage.substring(0, lastBraceIndex + 1);
              console.log(`清理后的消息: ${cleanedMessage}`);
            }
            
            // 2. 尝试解析清理后的消息
            const repairedData = JSON.parse(cleanedMessage);
            console.log(`✅ JSON修复成功！数据键数量: ${Object.keys(repairedData).length}`);
            
            // 处理修复后的数据
            this.processDataPoints('modbus', repairedData);
            
          } catch (repairError) {
            console.error(`❌ JSON修复也失败:`, repairError);
            
            // 最后尝试：按纯文本处理
            console.log(`🔄 转为纯文本处理模式...`);
            this.processPlainTextData(topic, messageString);
          }
        }
      } else {
        // 按纯文本处理
        this.processPlainTextData(topic, messageString);
      }
    } catch (error) {
      console.error(`❌ 处理MQTT消息失败:`, error);
      console.log(`错误详情 - 主题: ${topic}, 消息类型: ${typeof message}`);
    }
  }
  
  /**
   * 记录最近发布的主题和时间
   * @private
   */
  _recordPublishTime(topic) {
    if (!this._lastPublishTimes) {
      this._lastPublishTimes = new Map();
    }
    this._lastPublishTimes.set(topic, Date.now());
    
    // 清理超过10分钟的记录
    const tenMinutesAgo = Date.now() - 600000;
    for (const [t, time] of this._lastPublishTimes.entries()) {
      if (time < tenMinutesAgo) {
        this._lastPublishTimes.delete(t);
      }
    }
  }
  
  /**
   * 获取最近发布时间
   * @private
   */
  _getLastPublishTime(topic) {
    if (!this._lastPublishTimes) {
      return null;
    }
    return this._lastPublishTimes.get(topic);
  }
  
  /**
   * 处理Modbus状态数据
   * @param {Object} statusData - Modbus状态数据
   */
  processModbusStatusData(statusData) {
    try {
      // 这里可以添加对Modbus状态数据的特殊处理
      // 例如更新全局状态、触发事件等
      console.log(`处理Modbus状态数据: 连接状态=${statusData.connected}, 消息="${statusData.statusMessage}"`);
      
      // 如果需要，可以将状态数据转发到其他系统或存储到数据库
      this.sendToWebSocketClients({
        type: 'modbus_status',
        data: statusData,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('处理Modbus状态数据失败:', error);
    }
  }
  
  /**
   * 处理数据点信息
   * @param {string} identifier - 数据点标识符
   * @param {Object} dataPoints - 数据点键值对
   */
  processDataPoints(identifier, dataPoints) {
    try {
      console.log(`处理数据点: 标识符=${identifier}, 数据点数量=${Object.keys(dataPoints).length}`);
      
      // 添加时间戳以避免消息被过度去重
      const timestamp = Date.now();
      
      // 创建消息指纹用于去重，但加入时间因素减少去重严格程度
      // 使用10秒时间窗口，同样的消息只会在10秒内被去重
      const timeWindow = Math.floor(timestamp / 10000);
      const messageKey = `${identifier}_${JSON.stringify(dataPoints)}_${timeWindow}`;
      
      // 初始化消息处理队列和去重集合
      if (!this._processingQueue) {
        this._processingQueue = [];
        this._processedMessages = new Set();
        this._isProcessing = false;
      }
      
      // 检查是否已经处理过相同的消息
      if (this._processedMessages.has(messageKey)) {
        console.log(`跳过重复消息处理: ${messageKey.substring(0, 50)}...`);
        
        // 即使消息相同，也向WebSocket客户端发送数据，确保前端能够接收到最新状态
        this.sendToWebSocketClients({
          type: 'data_points',
          identifier: identifier,
          data: dataPoints,
          timestamp: new Date().toISOString()
        });
        
        return;
      }
      
      // 记录此消息已处理
      this._processedMessages.add(messageKey);
      
      // 限制去重集合大小，避免内存泄漏
      if (this._processedMessages.size > 1000) {
        // 转换为数组，删除最早的项目
        const messagesArray = Array.from(this._processedMessages);
        this._processedMessages = new Set(messagesArray.slice(-500)); // 保留最近500条
      }
      
      // 【新增】应用缩放因子处理
      this._applyScaleFactorsToDataPoints(dataPoints).then(scaledDataPoints => {
        // 【修改】处理16位点位解析，使用缩放后的数据
        this._processPointDataPoints(scaledDataPoints).then(pointResults => {
          // 合并原始数据和解析后的POINT数据
          const allDataPoints = { ...scaledDataPoints, ...pointResults };
        
        // 发送数据点到WebSocket客户端，用于前端显示
        this.sendToWebSocketClients({
          type: 'data_points',
          identifier: identifier,
            data: allDataPoints,
          timestamp: new Date().toISOString()
        });
        
        // 同时以每个单独的数据点形式发送，确保前端兼容性
          for (const [key, value] of Object.entries(allDataPoints)) {
          this.sendToWebSocketClients({
            type: 'modbus_data',
            identifier: key,
            data: { [key]: value },
            value: value,
            timestamp: new Date().toISOString()
          });
          
          // 【新增】触发单点报警系统的数据更新事件
          if (this.onDataUpdate && typeof this.onDataUpdate === 'function') {
            try {
              this.onDataUpdate(key, value, new Date());
            } catch (error) {
              console.error(`[单点报警] 数据更新事件处理失败: ${key}`, error);
            }
          }
        }
        
          // 【新增】检查告警状态
          this._checkAlarmStatusForDataPoints(allDataPoints);
          
          // 【新增】检查多条件告警规则
          this._checkMultiConditionAlarmRules(allDataPoints);
          
          // 添加到处理队列
          this._processingQueue.push({
            identifier,
            dataPoints: allDataPoints,
            timestamp: timestamp
          });
          
          // 如果队列正在处理中，直接返回
          if (this._isProcessing) {
            return;
          }
          
          // 开始处理队列
          this._processQueue();
        }).catch(error => {
          console.error('处理POINT数据点解析失败:', error);
          
          // 即使POINT解析失败，也要处理缩放后的数据
          this.sendToWebSocketClients({
            type: 'data_points',
            identifier: identifier,
            data: scaledDataPoints,
            timestamp: new Date().toISOString()
          });
          
          // 同时以每个单独的数据点形式发送，确保前端兼容性
          for (const [key, value] of Object.entries(scaledDataPoints)) {
            this.sendToWebSocketClients({
              type: 'modbus_data',
              identifier: key,
              data: { [key]: value },
              value: value,
              timestamp: new Date().toISOString()
            });
          }
        
        // 添加到处理队列
        this._processingQueue.push({
          identifier,
          dataPoints: scaledDataPoints,
          timestamp: timestamp
        });
        
        // 如果队列正在处理中，直接返回
        if (this._isProcessing) {
          return;
        }
        
        // 开始处理队列
        this._processQueue();
        });
      }).catch(error => {
        console.error('应用缩放因子失败，使用原始数据:', error);
        
        // 如果缩放因子处理失败，回退到原始逻辑
      this._processPointDataPoints(dataPoints).then(pointResults => {
        // 合并原始数据和解析后的POINT数据
        const allDataPoints = { ...dataPoints, ...pointResults };
      
      // 发送数据点到WebSocket客户端，用于前端显示
      this.sendToWebSocketClients({
        type: 'data_points',
        identifier: identifier,
          data: allDataPoints,
        timestamp: new Date().toISOString()
      });
      
      // 同时以每个单独的数据点形式发送，确保前端兼容性
        for (const [key, value] of Object.entries(allDataPoints)) {
        this.sendToWebSocketClients({
          type: 'modbus_data',
          identifier: key,
          data: { [key]: value },
          value: value,
          timestamp: new Date().toISOString()
        });
        
        // 【新增】触发单点报警系统的数据更新事件
        if (this.onDataUpdate && typeof this.onDataUpdate === 'function') {
          try {
            this.onDataUpdate(key, value, new Date());
          } catch (error) {
            console.error(`[单点报警] 数据更新事件处理失败: ${key}`, error);
          }
        }
      }
      
        // 【新增】检查告警状态
        this._checkAlarmStatusForDataPoints(allDataPoints);
        
        // 【新增】检查多条件告警规则
        this._checkMultiConditionAlarmRules(allDataPoints);
        
        // 添加到处理队列
        this._processingQueue.push({
          identifier,
          dataPoints: allDataPoints,
          timestamp: timestamp
        });
        
        // 如果队列正在处理中，直接返回
        if (this._isProcessing) {
          return;
        }
        
        // 开始处理队列
        this._processQueue();
      }).catch(error => {
        console.error('处理POINT数据点解析失败:', error);
        
        // 即使POINT解析失败，也要处理原始数据
        this.sendToWebSocketClients({
          type: 'data_points',
          identifier: identifier,
          data: dataPoints,
          timestamp: new Date().toISOString()
        });
        
        // 同时以每个单独的数据点形式发送，确保前端兼容性
        for (const [key, value] of Object.entries(dataPoints)) {
          this.sendToWebSocketClients({
            type: 'modbus_data',
            identifier: key,
            data: { [key]: value },
            value: value,
            timestamp: new Date().toISOString()
          });
          
          // 【新增】触发单点报警系统的数据更新事件
          if (this.onDataUpdate && typeof this.onDataUpdate === 'function') {
            try {
              this.onDataUpdate(key, value, new Date());
            } catch (error) {
              console.error(`[单点报警] 数据更新事件处理失败: ${key}`, error);
            }
          }
        }
      
      // 添加到处理队列
      this._processingQueue.push({
        identifier,
        dataPoints,
        timestamp: timestamp
      });
      
      // 如果队列正在处理中，直接返回
      if (this._isProcessing) {
        return;
      }
      
      // 开始处理队列
      this._processQueue();
        });
      });
    } catch (error) {
      console.error(`处理数据点失败:`, error);
    }
  }
  
  /**
   * 【新增】应用缩放因子到数据点
   * @param {Object} dataPoints - 原始数据点
   * @returns {Promise<Object>} 应用缩放因子后的数据点
   * @private
   */
  async _applyScaleFactorsToDataPoints(dataPoints) {
    try {
      console.log('[缩放因子] 开始应用缩放因子处理...');
      
      // 加载数据点配置
      const dataPointConfigs = await this._loadDataPointConfigs();
      if (!dataPointConfigs || dataPointConfigs.length === 0) {
        console.log('[缩放因子] 没有数据点配置，跳过缩放因子处理');
        return dataPoints;
      }
      
      // 创建配置映射，便于快速查找
      const configMap = new Map();
      dataPointConfigs.forEach(config => {
        if (config.identifier) {
          configMap.set(config.identifier, config);
        }
        if (config.name && config.name !== config.identifier) {
          configMap.set(config.name, config);
        }
      });
      
      const scaledDataPoints = {};
      let scaledCount = 0;
      
      // 处理每个接收到的数据点
      for (const [key, originalValue] of Object.entries(dataPoints)) {
        // 跳过非数值字段
        if (key === 'timestamp' || key === '_timestamp') {
          scaledDataPoints[key] = originalValue;
          continue;
        }
        
        // 查找对应的数据点配置
        const config = configMap.get(key);
        if (!config) {
          console.log(`[缩放因子] 未找到数据点配置: ${key}，使用原始值`);
          scaledDataPoints[key] = originalValue;
          continue;
        }
        
        // 检查是否需要应用缩放因子
        const scale = parseFloat(config.scale) || 1;
        const format = config.format || 'FLOAT32';
        
        // 对于BIT和POINT格式，不应用缩放因子
        if (format === 'BIT' || format === 'POINT') {
          console.log(`[缩放因子] 数据点 ${key} 格式为 ${format}，跳过缩放因子处理`);
          scaledDataPoints[key] = originalValue;
          continue;
        }
        
        // 转换为数值类型
        let numericValue;
        if (typeof originalValue === 'string') {
          numericValue = parseFloat(originalValue);
          if (isNaN(numericValue)) {
            console.warn(`[缩放因子] 数据点 ${key} 的值 "${originalValue}" 无法转换为数值，使用原始值`);
            scaledDataPoints[key] = originalValue;
            continue;
          }
        } else if (typeof originalValue === 'number') {
          numericValue = originalValue;
        } else {
          console.log(`[缩放因子] 数据点 ${key} 不是数值类型，使用原始值`);
          scaledDataPoints[key] = originalValue;
          continue;
        }
        
        // 应用缩放因子
        if (scale !== 1) {
          const scaledValue = numericValue * scale;
          scaledDataPoints[key] = scaledValue;
          scaledCount++;
          console.log(`[缩放因子] 数据点 ${key}: ${numericValue} × ${scale} = ${scaledValue}`);
        } else {
          scaledDataPoints[key] = numericValue;
          console.log(`[缩放因子] 数据点 ${key}: 缩放因子为1，使用原始值 ${numericValue}`);
        }
      }
      
      console.log(`[缩放因子] 处理完成，共处理 ${Object.keys(dataPoints).length} 个数据点，其中 ${scaledCount} 个应用了缩放因子`);
      return scaledDataPoints;
    } catch (error) {
      console.error('[缩放因子] 应用缩放因子失败:', error);
      return dataPoints; // 出错时返回原始数据
    }
  }

  /**
   * 【新增】加载数据点配置
   * @returns {Promise<Array>} 数据点配置数组
   * @private
   */
  async _loadDataPointConfigs() {
    try {
      // 尝试加载数据点管理器
      let DataPointManager;
      try {
        DataPointManager = require('../modbus/data-point-manager');
      } catch (err) {
        console.error('[后端POINT解析] 无法加载数据点管理器:', err);
        return [];
      }
      
      // 创建数据点管理器实例
      const configPath = require('path').join(__dirname, '..', 'data', 'data-points.json');
      const dataPointManager = new DataPointManager(configPath);
      
      // 获取所有数据点
      const dataPoints = dataPointManager.getAllDataPoints();
      console.log(`[后端POINT解析] 加载了 ${dataPoints.length} 个数据点配置`);
      
      return dataPoints;
    } catch (error) {
      console.error('[后端POINT解析] 加载数据点配置失败:', error);
      return [];
    }
  }
  
  /**
   * 【修改】处理16位点位解析
   * @param {Object} dataPoints - 原始数据点
   * @returns {Promise<Object>} 解析后的POINT数据点
   * @private
   */
  async _processPointDataPoints(dataPoints) {
    try {
      console.log('[后端POINT解析] 开始处理16位点位解析...');
      
      // 加载数据点配置
      const dataPointConfigs = await this._loadDataPointConfigs();
      if (!dataPointConfigs || dataPointConfigs.length === 0) {
        console.log('[后端POINT解析] 没有数据点配置，跳过POINT解析');
        return {};
      }
      
      // 查找所有POINT格式的数据点
      const pointDataPoints = dataPointConfigs.filter(dp => dp.format === 'POINT');
      if (pointDataPoints.length === 0) {
        console.log('[后端POINT解析] 没有POINT格式数据点，跳过解析');
        return {};
      }
      
      console.log(`[后端POINT解析] 找到 ${pointDataPoints.length} 个POINT格式数据点需要处理解析`);
      
      // 创建当前有效数据点标识符的集合，用于快速查找
      const validIdentifiers = new Set(dataPointConfigs.map(dp => dp.identifier).filter(id => id));
      const validNames = new Set(dataPointConfigs.map(dp => dp.name).filter(name => name));
      
      // 收集解析后的POINT数据
      const pointResults = {};
      const newDataPointConfigs = []; // 收集新增的POINT数据点配置
      
      pointDataPoints.forEach(pointDP => {
        console.log(`[后端POINT解析] 检查POINT数据点: ${pointDP.name} (${pointDP.identifier})`);
        
        // 检查源数据点是否在本次数据中有更新
        const sourceIdentifier = pointDP.sourceDataPointIdentifier;
        if (!sourceIdentifier) {
          console.warn(`[后端POINT解析] POINT数据点 ${pointDP.name} 没有配置源数据点标识符，跳过`);
          return;
        }
        
        console.log(`[后端POINT解析] 源数据点标识符: ${sourceIdentifier}, 位位置: ${pointDP.pointBitPosition}`);
        
        // 验证源数据点是否仍然存在于当前配置中
        if (!validIdentifiers.has(sourceIdentifier) && !validNames.has(sourceIdentifier)) {
          console.warn(`[后端POINT解析] POINT数据点 ${pointDP.name} 的源数据点 ${sourceIdentifier} 已不存在，跳过解析`);
          return;
        }
        
        // 检查数据中是否包含源数据点的值
        let sourceValue = null;
        if (dataPoints[sourceIdentifier] !== undefined) {
          sourceValue = dataPoints[sourceIdentifier];
        } else {
          // 尝试通过数据点名称查找
          const sourceDataPoint = dataPointConfigs.find(dp => dp.identifier === sourceIdentifier);
          if (sourceDataPoint && dataPoints[sourceDataPoint.name] !== undefined) {
            sourceValue = dataPoints[sourceDataPoint.name];
          }
        }
        
        if (sourceValue === null || sourceValue === undefined) {
          console.log(`[后端POINT解析] 源数据点 ${sourceIdentifier} 在本次数据中没有更新`);
          return;
        }
        
        console.log(`[后端POINT解析] 处理POINT数据点 ${pointDP.name}，源数据点 ${sourceIdentifier} 值: ${sourceValue}`);
        
        // 执行位运算解析
        const numValue = parseInt(sourceValue);
        if (isNaN(numValue)) {
          console.warn(`[后端POINT解析] 源数据点 ${sourceIdentifier} 的值 ${sourceValue} 不是有效数字，跳过解析`);
          return;
        }
        
        const pointBitPosition = parseInt(pointDP.pointBitPosition);
        if (isNaN(pointBitPosition) || pointBitPosition < 0 || pointBitPosition > 15) {
          console.warn(`[后端POINT解析] POINT数据点 ${pointDP.name} 的位位置 ${pointDP.pointBitPosition} 无效，跳过解析`);
          return;
        }
        
        // 执行位运算：(numValue >> bitPosition) & 1
        const pointValue = (numValue >> pointBitPosition) & 1;
        
        console.log(`[后端POINT解析] POINT解析结果: ${pointDP.name} = ${pointValue} (源值: ${numValue}, 位位置: ${pointBitPosition})`);
        
        // 收集解析后的数据，使用数据点名称作为键
        pointResults[pointDP.name] = pointValue;
        
        // 同时使用标识符作为键，确保兼容性
        if (pointDP.identifier && pointDP.identifier !== pointDP.name) {
          pointResults[pointDP.identifier] = pointValue;
        }
        
        // 创建用于数据库存储的数据点配置
        newDataPointConfigs.push({
          id: pointDP.id,
          identifier: pointDP.identifier,
          name: pointDP.name,
          format: pointDP.format,
          alarmEnabled: pointDP.alarmEnabled,
          alarmContent: pointDP.alarmContent,
          lowLevelAlarm: pointDP.lowLevelAlarm
        });
      });
      
      // 【新增】如果有解析后的POINT数据，将其保存到数据库
      if (Object.keys(pointResults).length > 0 && newDataPointConfigs.length > 0) {
        console.log(`[后端POINT解析] 准备保存 ${Object.keys(pointResults).length} 个POINT数据点到数据库`);
        await this._savePointDataToDatabase(newDataPointConfigs, pointResults);
      }
      
      console.log(`[后端POINT解析] 解析完成，生成了 ${Object.keys(pointResults).length} 个POINT数据点`);
      return pointResults;
    } catch (error) {
      console.error('[后端POINT解析] 处理16位点位解析失败:', error);
      return {};
    }
  }
  
  /**
   * 【新增】保存POINT数据到数据库
   * @param {Array} pointDataConfigs - POINT数据点配置数组
   * @param {Object} pointResults - 解析后的POINT数据
   * @private
   */
  async _savePointDataToDatabase(pointDataConfigs, pointResults) {
    try {
      console.log('[后端POINT解析] 开始保存POINT数据到数据库...');
      
      // 尝试加载数据库管理器
      let dbManager;
      try {
        dbManager = require('../modbus/db-manager');
      } catch (err) {
        console.error('[后端POINT解析] 无法加载数据库管理器:', err);
        return;
      }
      
      // 确保数据库管理器已初始化
      if (!dbManager.initialized) {
        try {
          const mysql = require('mysql2/promise');
          await dbManager.initialize(mysql);
          console.log('[后端POINT解析] 数据库管理器初始化成功');
        } catch (initErr) {
          console.error('[后端POINT解析] 初始化数据库管理器失败:', initErr);
          return;
        }
      }
      
      // 准备用于保存的数据
      const valuesToSave = {};
      
      for (const config of pointDataConfigs) {
        const pointValue = pointResults[config.name] || pointResults[config.identifier];
        if (pointValue !== undefined) {
          valuesToSave[config.name] = {
            value: pointValue,
            formattedValue: String(pointValue),
            quality: 'GOOD',
            timestamp: new Date().toISOString(),
            rawValue: { value: pointValue }
          };
          
          console.log(`[后端POINT解析] 准备保存POINT数据: ${config.name} = ${pointValue}`);
        }
      }
      
      // 保存到数据库
      if (Object.keys(valuesToSave).length > 0) {
        const result = await dbManager.storeLatestValues(pointDataConfigs, valuesToSave);
        console.log('[后端POINT解析] POINT数据保存结果:', result);
      } else {
        console.log('[后端POINT解析] 没有POINT数据需要保存');
      }
    } catch (error) {
      console.error('[后端POINT解析] 保存POINT数据到数据库失败:', error);
    }
  }
  
  /**
   * 【新增】检查数据点告警状态
   * @param {Object} dataPoints - 数据点键值对
   * @private
   */
  async _checkAlarmStatusForDataPoints(dataPoints) {
    try {
      console.log('[后端告警检查] 开始检查数据点告警状态...');
      
      // 加载数据点配置
      const dataPointConfigs = await this._loadDataPointConfigs();
      if (!dataPointConfigs || dataPointConfigs.length === 0) {
        console.log('[后端告警检查] 没有数据点配置，跳过告警检查');
        return;
      }
      
      // 初始化告警状态记录
      if (!this._alarmStates) {
        this._alarmStates = {};
      }
      
      // 遍历所有数据点，检查告警状态
      for (const [dataPointName, value] of Object.entries(dataPoints)) {
        // 查找对应的数据点配置
        const dataPointConfig = dataPointConfigs.find(dp => 
          dp.name === dataPointName || dp.identifier === dataPointName
        );
        
        if (!dataPointConfig || !dataPointConfig.alarmEnabled) {
          continue; // 跳过未启用告警的数据点
        }
        
        console.log(`[后端告警检查] 检查数据点 ${dataPointName} 的告警状态，当前值: ${value}`);
        
        const identifier = dataPointConfig.identifier;
        const lastState = this._alarmStates[identifier] || { value: 0, triggered: false };
        
        // 判断当前值是否触发告警（对BIT和POINT类型特殊处理）
        let currentTriggered = false;
        
        if (dataPointConfig.format === 'BIT' || dataPointConfig.format === 'POINT') {
          // 使用更灵活的比较方式
          const strValue = String(value).toLowerCase();
          currentTriggered = strValue === '1' || strValue === 'true' || value === 1 || value === true;
          
          console.log(`[后端告警检查] ${dataPointConfig.format}类型告警检查 - 数据点: ${dataPointName}, 原始值: ${value}, 是否触发: ${currentTriggered}, 上次状态: ${lastState.triggered}`);
        }
        
        // 根据是否启用低位报警来决定告警触发逻辑
        let isNewAlarm, isAlarmCleared;
        
        if (dataPointConfig.lowLevelAlarm) {
          // 低位报警：从1变为0时触发告警，从0变为1时解除告警
          isNewAlarm = (lastState.triggered && !currentTriggered);
          isAlarmCleared = (!lastState.triggered && currentTriggered);
          console.log(`[后端告警检查] 低位报警模式 - 数据点 ${identifier}: 新告警=${isNewAlarm}, 告警解除=${isAlarmCleared}`);
        } else {
          // 正常报警：从0变为1时触发告警，从1变为0时解除告警
          isNewAlarm = (!lastState.triggered && currentTriggered);
          isAlarmCleared = (lastState.triggered && !currentTriggered);
          console.log(`[后端告警检查] 正常报警模式 - 数据点 ${identifier}: 新告警=${isNewAlarm}, 告警解除=${isAlarmCleared}`);
        }
        
        // 更新状态记录
        this._alarmStates[identifier] = {
          value: value,
          triggered: currentTriggered
        };
        
        // 处理新告警
        if (isNewAlarm) {
          console.log(`[后端告警检查] 检测到新告警: ${identifier}`);
          
          const alarmContent = dataPointConfig.alarmContent || `${dataPointName}告警`;
          const triggerTime = new Date().toISOString();
          
          // 发送告警消息到WebSocket客户端
          this.sendToWebSocketClients({
            type: 'alarm',
            data: {
              identifier: identifier,
              content: alarmContent,
              timestamp: triggerTime,
              dataPointName: dataPointName
            }
          });
          
          console.log(`[后端告警检查] 已发送告警消息到前端: ${alarmContent}`);
          
          // 保存告警到数据库
          this._saveAlarmToDatabase(identifier, alarmContent, triggerTime, dataPointName);
        }
        
        // 处理告警解除
        if (isAlarmCleared) {
          console.log(`[后端告警检查] 检测到告警解除: ${identifier}`);
          
          const alarmContent = dataPointConfig.alarmContent || `${dataPointName}告警`;
          const clearedTime = new Date().toISOString();
          
          // 发送告警解除消息到WebSocket客户端
          this.sendToWebSocketClients({
            type: 'alarm_cleared',
            data: {
              identifier: identifier,
              content: alarmContent,
              clearedTime: clearedTime,
              dataPointName: dataPointName
            }
          });
          
          console.log(`[后端告警检查] 已发送告警解除消息到前端: ${alarmContent}`);
          
          // 更新数据库中的告警状态
          this._clearAlarmInDatabase(identifier, alarmContent, clearedTime);
        }
      }
    } catch (error) {
      console.error('[后端告警检查] 检查告警状态失败:', error);
    }
  }
  
  /**
   * 【新增】保存告警到数据库
   * @param {string} identifier - 告警标识符
   * @param {string} content - 告警内容
   * @param {string} triggerTime - 触发时间
   * @param {string} dataPointName - 数据点名称
   * @private
   */
  async _saveAlarmToDatabase(identifier, content, triggerTime, dataPointName) {
    try {
      // 尝试加载告警数据库服务
      let AlarmDbService;
      try {
        AlarmDbService = require('../modbus/alarm-db-service');
      } catch (err) {
        console.error('[后端告警检查] 无法加载告警数据库服务:', err);
            return;
      }
      
      const alarmDbService = new AlarmDbService();
      await alarmDbService.storeAlarm({
        identifier: identifier,
        content: content,
        triggerTime: triggerTime,
        dataPointName: dataPointName
      });
      
      console.log(`[后端告警检查] 告警已保存到数据库: ${content}`);
    } catch (error) {
      console.error('[后端告警检查] 保存告警到数据库失败:', error);
    }
  }

  /**
   * 【新增】清除数据库中的告警状态
   * @param {string} identifier - 告警标识符
   * @param {string} content - 告警内容
   * @param {string} clearedTime - 解除时间
   * @private
   */
  async _clearAlarmInDatabase(identifier, content, clearedTime) {
    try {
      // 尝试加载告警数据库服务
      let AlarmDbService;
      try {
        AlarmDbService = require('../modbus/alarm-db-service');
      } catch (err) {
        console.error('[后端告警检查] 无法加载告警数据库服务:', err);
        return;
      }
      
      const alarmDbService = new AlarmDbService();
      await alarmDbService.clearAlarm(identifier, clearedTime);
      
      console.log(`[后端告警检查] 告警已在数据库中标记为解除: ${content}`);
    } catch (error) {
      console.error('[后端告警检查] 清除数据库告警状态失败:', error);
    }
  }
  
  /**
   * 处理队列
   * @private
   */
  async _processQueue() {
    if (!this._processingQueue || this._processingQueue.length === 0) {
      this._isProcessing = false;
      return;
    }
    
    this._isProcessing = true;
    
    try {
      // 获取队列中的下一个项目
      const item = this._processingQueue.shift();
      
      // 保存到数据库
      await this._saveDataPointsToDatabase(item.identifier, item.dataPoints);
      
      // 延迟处理下一条，避免数据库压力过大
      setTimeout(() => this._processQueue(), 50);
    } catch (error) {
      console.error('处理队列项目失败:', error);
      // 即使出错也继续处理队列
      setTimeout(() => this._processQueue(), 100);
    }
  }
  
  /**
   * 保存数据点到数据库
   * @param {string} identifier - 数据点标识符
   * @param {Object} dataPoints - 数据点键值对
   * @private
   */
  async _saveDataPointsToDatabase(identifier, dataPoints) {
    try {
      // 动态加载数据库管理器
      let dbManager;
      try {
        // 先尝试从modbus目录加载
        dbManager = require('../modbus/db-manager');
      } catch (err) {
        try {
          // 如果失败，尝试从当前目录加载
          dbManager = require('./db-manager');
        } catch (err2) {
          console.error('无法加载数据库管理器:', err2);
          return;
        }
      }
      
      // 如果成功加载了数据库管理器
      if (dbManager) {
        console.log('准备将MQTT数据保存到数据库...');
        
        // 简化数据保存逻辑，不重新加载数据点配置
        // 直接使用接收到的数据点进行保存
        const dataPointsToSave = [];
        const valuesToSave = {};
        
        // 遍历收到的数据点
        for (const [key, value] of Object.entries(dataPoints)) {
          // 跳过处理时间戳类型的数据点，避免数据截断错误
          if (key === 'timestamp' || key === '_timestamp') {
            console.log(`跳过时间戳数据点处理: ${key}`);
            continue;
          }
          
          // 创建简单的数据点配置
            const tempConfig = {
              id: key,
              identifier: key,
              name: key,
              format: typeof value === 'number' ? 'FLOAT32' : 'STRING'
            };
            
            dataPointsToSave.push(tempConfig);
            
            // 准备值对象
            valuesToSave[key] = {
              value: value,
              formattedValue: String(value),
              quality: 'GOOD',
              timestamp: new Date().toISOString(),
              rawValue: { value }
            };
        }
        
        // 如果有数据点需要保存
        if (dataPointsToSave.length > 0) {
          console.log(`更新 ${dataPointsToSave.length} 个数据点的最新值到数据库...`);
          
          // 确保数据库管理器已初始化
          if (!dbManager.initialized) {
            try {
              // 尝试加载mysql2模块
              const mysql = require('mysql2/promise');
              await dbManager.initialize(mysql);
            } catch (initErr) {
              console.error('初始化数据库管理器失败:', initErr);
              return;
            }
          }
          
          // 使用重试机制保存数据
          let retryCount = 0;
          const maxRetries = 3;
          let result = null;
          
          while (retryCount < maxRetries) {
            try {
              // 调用数据库管理器保存数据
              result = await dbManager.storeLatestValues(dataPointsToSave, valuesToSave);
              // 如果成功，跳出循环
              if (result && result.success !== false) {
                break;
              }
              
              // 如果遇到死锁，等待随机时间后重试
              if (result && result.error && result.error.includes('Deadlock')) {
                retryCount++;
                const waitTime = 100 + Math.random() * 500; // 随机等待100-600毫秒
                console.log(`数据库死锁，等待${waitTime}毫秒后第${retryCount}次重试...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
              } else {
                // 其他错误不重试
                break;
              }
            } catch (saveErr) {
              console.error('保存数据尝试失败:', saveErr);
              retryCount++;
              if (retryCount < maxRetries) {
                const waitTime = 200 * retryCount; // 递增等待时间
                console.log(`保存失败，等待${waitTime}毫秒后重试...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
              }
            }
          }
          
          if (result) {
            console.log('数据库保存结果:', result);
          } else {
            console.log('数据库保存完成，无详细结果');
          }
        }
      }
    } catch (error) {
      console.error('保存数据点到数据库失败:', error);
    }
  }
  
  /**
   * 处理纯文本数据
   * @param {string} topic - 消息主题
   * @param {string} textData - 纯文本数据
   */
  processPlainTextData(topic, textData) {
    try {
      console.log(`处理纯文本数据: 主题=${topic}, 数据="${textData.substring(0, 50)}..."`);
      
      // 尝试将纯文本转换为数值
      const numericValue = parseFloat(textData);
      if (!isNaN(numericValue)) {
        // 如果是有效数字，提取主题中的标识符
        let identifier = topic;
        if (topic.includes('/')) {
          identifier = topic.split('/').pop();
        }
        
        // 创建数据点对象
        const dataPoints = { value: numericValue };
        this.processDataPoints(identifier, dataPoints);
      } else {
        // 不是数字，作为普通消息处理
        this.sendToWebSocketClients({
          type: 'text_message',
          topic: topic,
          data: textData,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('处理纯文本数据失败:', error);
    }
  }

  /**
   * 向所有WebSocket客户端发送数据
   * @param {Object} data - 要发送的数据
   */
  sendToWebSocketClients(data) {
    if (!this.wsClients || this.wsClients.size === 0) {
      console.log('没有活跃的WebSocket客户端，消息未发送');
      return;
    }
    
    try {
      const WebSocket = require('ws');
      const jsonData = JSON.stringify(data);
      
      let sentCount = 0;
      this.wsClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(jsonData);
            sentCount++;
          } catch (clientError) {
            console.error('向WebSocket客户端发送数据失败:', clientError);
          }
        }
      });
      
      console.log(`已向 ${sentCount}/${this.wsClients.size} 个WebSocket客户端发送数据: ${data.type}`);
    } catch (error) {
      console.error('向WebSocket客户端发送数据时发生错误:', error);
    }
  }

  /**
   * 发布消息到MQTT主题
   * @param {string} topic - 主题
   * @param {string|Object} message - 消息内容
   * @param {boolean} retain - 是否保留消息
   * @returns {boolean} - 是否发布成功
   */
  publish(topic, message, retain = null) {
    if (!this.client || !this.client.connected) {
      console.error('MQTT客户端未连接，无法发布消息');
      return false;
    }
    
    try {
      // 如果提供的是对象，转换为JSON字符串
      const messageContent = typeof message === 'object' 
        ? JSON.stringify(message) 
        : message.toString();
      
      // 确定是否使用保留标志
      const useRetain = retain !== null ? retain : (this.settings.retain === true);
      
      // 记录发布时间，防止处理自己发布的消息
      this._recordPublishTime(topic);
      
      // 发布消息
      this.client.publish(topic, messageContent, { retain: useRetain }, (err) => {
        if (err) {
          console.error('发布MQTT消息失败:', err);
          return false;
        } else {
          console.log(`已发布消息到主题: ${topic}`);
          return true;
        }
      });
      
      return true;
    } catch (error) {
      console.error('发布MQTT消息失败:', error);
      return false;
    }
  }

  /**
   * 断开MQTT连接
   */
  disconnect() {
    if (this.client) {
      console.log('正在断开MQTT连接...');
      this.client.end();
      this.client = null;
    }
  }

  /**
   * 测试MQTT连接
   * @param {Object} options - 连接选项
   * @returns {Promise} - 连接测试结果
   */
  testConnection(options) {
    return new Promise((resolve, reject) => {
      try {
        const { url, clientId, username, password } = options;
        
        if (!url) {
          return reject(new Error('MQTT服务器地址不能为空'));
        }
        
        // 创建临时MQTT客户端进行连接测试
        const mqttOptions = {
          clientId: clientId || `test_mqtt_client_${Math.random().toString(16).substring(2, 10)}`,
          username: username,
          password: password,
          clean: true,
          reconnectPeriod: 0, // 不自动重连
          connectTimeout: 5000 // 5秒超时
        };
        
        console.log(`尝试测试连接到MQTT服务器: ${url}`);
        const testClient = mqtt.connect(url, mqttOptions);
        
        // 设置超时
        const timeout = setTimeout(() => {
          testClient.end(true);
          reject(new Error('连接超时'));
        }, 10000);
        
        testClient.on('connect', () => {
          clearTimeout(timeout);
          testClient.end();
          console.log('MQTT服务器连接测试成功');
          resolve({ success: true, message: '连接成功' });
        });
        
        testClient.on('error', (err) => {
          clearTimeout(timeout);
          testClient.end();
          console.error('MQTT服务器连接测试失败:', err);
          reject(new Error('连接失败: ' + err.message));
        });
      } catch (error) {
        console.error('MQTT连接测试失败:', error);
        reject(new Error('连接测试失败: ' + error.message));
      }
    });
  }

  /**
   * 提供一个测试方法，发布测试数据点，用于验证MQTT数据匹配功能
   * @param {string} identifier - 数据点标识符
   * @param {any} value - 数据点值
   */
  publishTestDataPoint(identifier, value) {
    try {
      if (!this.client || !this.client.connected) {
        console.error('MQTT客户端未连接，无法发布测试数据点');
        return false;
      }
      
      // 创建测试数据对象
      const testData = {};
      testData[identifier] = value;
      
      // 发布测试数据
      const testTopic = 'data/modbus';
      this.client.publish(testTopic, JSON.stringify(testData), {
        qos: 0,
        retain: false
      });
      
      console.log(`已发布测试数据点: ${identifier} = ${value} 到主题 ${testTopic}`);
      return true;
    } catch (error) {
      console.error('发布测试数据点失败:', error);
      return false;
    }
  }

  /**
   * 获取单例实例
   * @returns {MQTTService} - MQTT服务实例
   */
  static getInstance() {
    if (!MQTTService.instance) {
      MQTTService.instance = new MQTTService();
    }
    return MQTTService.instance;
  }

  /**
   * 【新增】检查多条件告警规则
   * @param {Object} dataPoints - 当前数据点值
   * @private
   */
  async _checkMultiConditionAlarmRules(dataPoints) {
    try {
      console.log('[多条件告警检查] 开始检查多条件告警规则...');
      
      // 【调试】显示当前告警状态
      console.log('[多条件告警检查] 当前多条件告警状态:', JSON.stringify(this._multiConditionAlarmStates, null, 2));
      
      // 读取多条件告警规则
      const rules = await this._loadMultiConditionAlarmRules();
      if (!rules || rules.length === 0) {
        console.log('[多条件告警检查] 没有多条件告警规则，跳过检查');
        return;
      }
      
      console.log(`[多条件告警检查] 加载了 ${rules.length} 个多条件告警规则`);
      
      // 遍历所有启用的规则
      for (const rule of rules) {
        if (!rule.enabled) {
          continue; // 跳过禁用的规则
        }
        
        console.log(`[多条件告警检查] 检查规则: ${rule.name}`);
        
        // 检查规则的所有条件是否满足
        const conditionResults = [];
        let allConditionsMet = true;
        
        for (const condition of rule.conditions) {
          const dataPointValue = dataPoints[condition.datapoint];
          const targetValue = this._parseValue(condition.value);
          
          console.log(`[多条件告警检查] 检查条件: ${condition.datapoint} ${condition.operator} ${condition.value}, 当前值: ${dataPointValue}`);
          
          let conditionMet = false;
          
          // 根据操作符判断条件是否满足
          switch (condition.operator) {
            case 'equals':
              conditionMet = this._compareValues(dataPointValue, targetValue, '==');
              break;
            case 'not_equals':
              conditionMet = this._compareValues(dataPointValue, targetValue, '!=');
              break;
            case 'greater_than':
              conditionMet = this._compareValues(dataPointValue, targetValue, '>');
              break;
            case 'greater_equal':
              conditionMet = this._compareValues(dataPointValue, targetValue, '>=');
              break;
            case 'less_than':
              conditionMet = this._compareValues(dataPointValue, targetValue, '<');
              break;
            case 'less_equal':
              conditionMet = this._compareValues(dataPointValue, targetValue, '<=');
              break;
            default:
              console.warn(`[多条件告警检查] 未知的操作符: ${condition.operator}`);
              conditionMet = false;
          }
          
          conditionResults.push({
            datapoint: condition.datapoint,
            operator: condition.operator,
            targetValue: condition.value,
            currentValue: dataPointValue,
            met: conditionMet,
            logic: condition.logic
          });
          
          console.log(`[多条件告警检查] 条件结果: ${condition.datapoint} ${condition.operator} ${condition.value} = ${conditionMet}`);
          
          // 根据逻辑关系处理条件结果
          if (condition.logic === 'or' && conditionMet) {
            // OR逻辑：只要有一个条件满足即可
            break;
          } else if (condition.logic === 'and' && !conditionMet) {
            // AND逻辑：所有条件都必须满足
            allConditionsMet = false;
            break;
          }
        }
        
        // 最终判断：对于AND逻辑，需要所有条件都满足；对于OR逻辑，需要至少一个条件满足
        const hasOrCondition = rule.conditions.some(c => c.logic === 'or');
        if (hasOrCondition) {
          // 如果有OR条件，则只要有一个OR条件满足即可
          allConditionsMet = conditionResults.some(r => r.met && r.logic === 'or') || 
                            (conditionResults.filter(r => r.logic === 'and').every(r => r.met));
        } else {
          // 纯AND逻辑，所有条件都必须满足
          allConditionsMet = conditionResults.every(r => r.met);
        }
        
        const ruleId = rule.id.toString();
        const lastState = this._multiConditionAlarmStates[ruleId] || { 
          triggered: false, 
          consecutiveCount: 0,
          lastTriggerTime: null
        };
        
        console.log(`[多条件告警检查] 规则 ${rule.name} 条件检查结果: ${allConditionsMet}, 上次状态: ${lastState.triggered}, 连续触发计数: ${lastState.consecutiveCount}`);
        
        // 获取规则的连续触发次数要求（默认为1，表示满足条件后立即触发）
        const requiredConsecutiveCount = rule.consecutiveCount || 1;
        console.log(`[多条件告警检查] 规则 ${rule.name} 需要连续触发 ${requiredConsecutiveCount} 次`);
        
        // 处理连续触发计数逻辑
        let shouldTriggerAlarm = false;
        let shouldClearAlarm = false;
        let newConsecutiveCount = 0;
        
        if (allConditionsMet) {
          // 条件满足，增加连续触发计数
          newConsecutiveCount = (lastState.consecutiveCount || 0) + 1;
          console.log(`[多条件告警检查] 条件满足，连续触发计数增加到: ${newConsecutiveCount}`);
          
          // 检查是否达到触发阈值
          if (newConsecutiveCount >= requiredConsecutiveCount && !lastState.triggered) {
            shouldTriggerAlarm = true;
            console.log(`[多条件告警检查] 达到连续触发阈值 ${requiredConsecutiveCount}，准备触发报警`);
          }
        } else {
          // 条件不满足，重置连续触发计数
          newConsecutiveCount = 0;
          console.log(`[多条件告警检查] 条件不满足，重置连续触发计数为 0`);
          
          // 如果之前已触发报警，现在需要解除
          if (lastState.triggered) {
            shouldClearAlarm = true;
            console.log(`[多条件告警检查] 条件不满足且之前已触发报警，准备解除报警`);
          }
        }
        
        // 更新状态记录
        this._multiConditionAlarmStates[ruleId] = {
          triggered: shouldTriggerAlarm ? true : (shouldClearAlarm ? false : lastState.triggered),
          consecutiveCount: newConsecutiveCount,
          lastCheckTime: new Date().toISOString(),
          lastTriggerTime: shouldTriggerAlarm ? new Date().toISOString() : lastState.lastTriggerTime,
          conditionResults: conditionResults
        };
        
        // 处理新告警
        if (shouldTriggerAlarm) {
          console.log(`[多条件告警检查] 触发多条件告警: ${rule.name} (连续触发 ${newConsecutiveCount} 次)`);
          
          const alarmContent = rule.content || `多条件告警: ${rule.name}`;
          const triggerTime = new Date().toISOString();
          
          // 发送告警消息到WebSocket客户端
          this.sendToWebSocketClients({
            type: 'multi_condition_alarm',
            data: {
              ruleId: ruleId,
              ruleName: rule.name,
              content: alarmContent,
              timestamp: triggerTime,
              level: rule.level || 'medium',
              conditions: conditionResults,
              consecutiveCount: newConsecutiveCount,
              requiredConsecutiveCount: requiredConsecutiveCount
            }
          });
          
          console.log(`[多条件告警检查] 已发送多条件告警消息到前端: ${alarmContent}`);
          
          // 保存多条件告警到数据库
          this._saveMultiConditionAlarmToDatabase(ruleId, rule.name, alarmContent, triggerTime, conditionResults);
        }
        
        // 处理告警解除
        if (shouldClearAlarm) {
          console.log(`[多条件告警检查] 多条件告警解除: ${rule.name}`);
          
          const alarmContent = rule.content || `多条件告警: ${rule.name}`;
          const clearedTime = new Date().toISOString();
          
          // 发送告警解除消息到WebSocket客户端
          this.sendToWebSocketClients({
            type: 'multi_condition_alarm_cleared',
            data: {
              ruleId: ruleId,
              ruleName: rule.name,
              content: alarmContent,
              clearedTime: clearedTime,
              level: rule.level || 'medium'
            }
          });
          
          console.log(`[多条件告警检查] 已发送多条件告警解除消息到前端: ${alarmContent}`);
          
          // 更新数据库中的多条件告警状态
          this._clearMultiConditionAlarmInDatabase(ruleId, alarmContent, clearedTime);
        }
      }
    } catch (error) {
      console.error('[多条件告警检查] 检查多条件告警规则失败:', error);
    }
  }

  /**
   * 【新增】加载多条件告警规则
   * @returns {Array} 多条件告警规则数组
   * @private
   */
  async _loadMultiConditionAlarmRules() {
    try {
      const fs = require('fs');
      const path = require('path');
      const rulesFile = path.join(__dirname, '..', 'data', 'multi-condition-alarm-rules.json');
      
      if (fs.existsSync(rulesFile)) {
        const data = fs.readFileSync(rulesFile, 'utf8');
        return JSON.parse(data);
      }
      return [];
    } catch (error) {
      console.error('[多条件告警检查] 加载多条件告警规则失败:', error);
      return [];
    }
  }

  /**
   * 【新增】解析值（支持数字和字符串）
   * @param {string} value - 要解析的值
   * @returns {*} 解析后的值
   * @private
   */
  _parseValue(value) {
    if (typeof value === 'number') {
      return value;
    }
    
    const strValue = String(value).trim();
    
    // 尝试解析为数字
    const numValue = parseFloat(strValue);
    if (!isNaN(numValue)) {
      return numValue;
    }
    
    // 处理布尔值
    if (strValue.toLowerCase() === 'true') {
      return true;
    }
    if (strValue.toLowerCase() === 'false') {
      return false;
    }
    
    // 返回原始字符串
    return strValue;
  }

  /**
   * 【新增】比较两个值
   * @param {*} value1 - 值1
   * @param {*} value2 - 值2
   * @param {string} operator - 比较操作符
   * @returns {boolean} 比较结果
   * @private
   */
  _compareValues(value1, value2, operator) {
    // 处理undefined或null值
    if (value1 === undefined || value1 === null) {
      value1 = 0;
    }
    if (value2 === undefined || value2 === null) {
      value2 = 0;
    }
    
    // 如果两个值都是数字或可以转换为数字，进行数值比较
    const num1 = parseFloat(value1);
    const num2 = parseFloat(value2);
    
    if (!isNaN(num1) && !isNaN(num2)) {
      switch (operator) {
        case '==': return Math.abs(num1 - num2) < 0.000001; // 浮点数相等比较
        case '!=': return Math.abs(num1 - num2) >= 0.000001;
        case '>': return num1 > num2;
        case '>=': return num1 >= num2;
        case '<': return num1 < num2;
        case '<=': return num1 <= num2;
        default: return false;
      }
    }
    
    // 字符串比较
    const str1 = String(value1);
    const str2 = String(value2);
    
    switch (operator) {
      case '==': return str1 === str2;
      case '!=': return str1 !== str2;
      case '>': return str1 > str2;
      case '>=': return str1 >= str2;
      case '<': return str1 < str2;
      case '<=': return str1 <= str2;
      default: return false;
    }
  }

  /**
   * 【新增】保存多条件告警到数据库
   * @param {string} ruleId - 规则ID
   * @param {string} ruleName - 规则名称
   * @param {string} content - 告警内容
   * @param {string} triggerTime - 触发时间
   * @param {Array} conditions - 条件结果
   * @private
   */
  async _saveMultiConditionAlarmToDatabase(ruleId, ruleName, content, triggerTime, conditions) {
    try {
      // 尝试加载告警数据库服务
      let AlarmDbService;
      try {
        AlarmDbService = require('../modbus/alarm-db-service');
      } catch (err) {
        console.error('[多条件告警检查] 无法加载告警数据库服务:', err);
        return;
      }
      
      const alarmDbService = new AlarmDbService();
      await alarmDbService.storeAlarm({
        identifier: `multi_condition_${ruleId}`,
        content: content,
        triggerTime: triggerTime,
        dataPointName: ruleName,
        ruleId: ruleId,
        conditions: conditions,
        type: 'multi_condition'
      });
      
      console.log(`[多条件告警检查] 多条件告警已保存到数据库: ${content}`);
    } catch (error) {
      console.error('[多条件告警检查] 保存多条件告警到数据库失败:', error);
    }
  }

  /**
   * 【新增】清除数据库中的多条件告警状态
   * @param {string} ruleId - 规则ID
   * @param {string} content - 告警内容
   * @param {string} clearedTime - 解除时间
   * @private
   */
  async _clearMultiConditionAlarmInDatabase(ruleId, content, clearedTime) {
    try {
      // 尝试加载告警数据库服务
      let AlarmDbService;
      try {
        AlarmDbService = require('../modbus/alarm-db-service');
      } catch (err) {
        console.error('[多条件告警检查] 无法加载告警数据库服务:', err);
        return;
      }
      
      const alarmDbService = new AlarmDbService();
      await alarmDbService.clearAlarm(`multi_condition_${ruleId}`, clearedTime);
      
      console.log(`[多条件告警检查] 多条件告警已在数据库中标记为解除: ${content}`);
    } catch (error) {
      console.error('[多条件告警检查] 清除数据库多条件告警状态失败:', error);
    }
  }

  /**
   * 【新增】重置多条件告警状态（用于测试或重新开始监控）
   */
  resetMultiConditionAlarmStates() {
    console.log('[多条件告警检查] 手动重置多条件告警状态');
    this._multiConditionAlarmStates = {};
    this._alarmStates = {};
    console.log('[多条件告警检查] 告警状态已重置，下次满足条件时将触发新告警');
  }
}

// 创建单例实例
MQTTService.instance = null;

module.exports = MQTTService; 
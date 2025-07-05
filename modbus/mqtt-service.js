const mqtt = require('mqtt');
const EventEmitter = require('events');
const DbManager = require('./db-manager');
const path = require('path');

class MqttService extends EventEmitter {
  constructor() {
    super();
    
    // 设置最大监听器数量，避免内存泄漏警告
    this.setMaxListeners(20);
    
    // MQTT客户端
    this.client = null;
    
    // 连接状态
    this.connected = false;
    
    // 数据点值存储
    this.dataValues = {};
    
    // 订阅的主题
    this.topics = new Map();
    
    // 数据点映射 (标识符 -> 主题)
    this.dataPointTopics = new Map();
    
    // 上次更新时间
    this.lastUpdateTime = {};
    
    // 添加缓存配置，防止内存泄漏
    this.cacheConfig = {
      maxDataValues: 1000,              // 最大数据点数量
      maxUpdateRecords: 500,            // 最大更新记录数量
      cleanupInterval: 5 * 60 * 1000,   // 5分钟清理一次
      maxAge: 30 * 60 * 1000,           // 数据最大保存30分钟
      memoryWarningThreshold: 500       // 内存警告阈值(MB)
    };
    
    // 添加数据库管理器实例
    this.dbManager = null;
    
    // 是否启用数据转发到Modbus数据库
    this.enableForwarding = false;
    
    // 保存配置
    this.config = {
      url: 'mqtt://localhost:1883',
      options: {
        clientId: `mqtt_client_${Math.random().toString(16).substring(2, 10)}`,
        username: '',
        password: '',
        keepalive: 60,
        reconnectPeriod: 5000,
        connectTimeout: 30000,
        clean: true
      }
    };
    
    console.log('MqttService实例已创建');
    
    // 初始化数据库管理器
    this._initDbManager();
    
    // 启动缓存清理机制
    this._setupCacheCleanup();
  }
  
  /**
   * 初始化数据库管理器
   * @private
   */
  async _initDbManager() {
    try {
      // 直接使用导入的dbManager实例
      this.dbManager = DbManager;
      
      // 检查dbManager是否已经初始化
      if (!this.dbManager.initialized) {
        try {
          // 导入mysql2/promise模块并传入
          const mysql = require('mysql2/promise');
          await this.dbManager.initialize(mysql);
          console.log('MQTT服务已成功初始化数据库管理器');
        } catch (dbInitError) {
          console.error('数据库初始化失败，但MQTT服务将继续工作:', dbInitError.message);
        }
      } else {
        console.log('数据库管理器已初始化，MQTT服务将使用现有连接');
      }
    } catch (error) {
      console.error('MQTT服务初始化数据库管理器失败:', error);
      console.log('MQTT服务将在没有数据库支持的情况下继续运行');
    }
  }
  
  /**
   * 连接到MQTT服务器
   * @param {Object} config 连接配置
   * @returns {Promise} 连接结果
   */
  connect(config = {}) {
    return new Promise((resolve, reject) => {
      // 合并配置
      if (config.url) {
        this.config.url = config.url;
      }
      
      if (config.options) {
        this.config.options = {...this.config.options, ...config.options};
      }
      
      console.log(`正在连接到MQTT服务器: ${this.config.url}`);
      
      try {
        // 创建MQTT客户端
        this.client = mqtt.connect(this.config.url, this.config.options);
        
        // 连接事件
        this.client.on('connect', () => {
          console.log('已连接到MQTT服务器');
          this.connected = true;
          
          // 订阅之前配置的主题
          this._resubscribeTopics();
          
          this.emit('connected');
          resolve(true);
        });
        
        // 重连事件
        this.client.on('reconnect', () => {
          console.log('正在尝试重新连接到MQTT服务器');
          this.emit('reconnecting');
        });
        
        // 断开连接事件
        this.client.on('close', () => {
          console.log('与MQTT服务器的连接已关闭');
          this.connected = false;
          this.emit('disconnected');
        });
        
        // 错误事件 - 增强错误处理
        this.client.on('error', (err) => {
          console.error('MQTT连接错误:', err.message);
          
          // 设置连接状态为false
          this.connected = false;
          
          // 发出错误事件，但使用更安全的方式
          try {
          this.emit('error', {
            message: err.message,
              code: err.code,
              timestamp: new Date().toISOString()
          });
          } catch (emitError) {
            console.error('发出MQTT错误事件时出错:', emitError.message);
          }
          
          // 如果还没有连接成功，拒绝Promise
          if (!this.connected) {
            reject(err);
          }
        });
        
        // 离线事件
        this.client.on('offline', () => {
          console.log('MQTT客户端离线');
          this.connected = false;
          this.emit('offline');
        });
        
        // 消息事件 - 增强错误处理
        this.client.on('message', (topic, message) => {
          try {
            // 安全地处理主题字符串
            let safeTopic;
            if (Buffer.isBuffer(topic)) {
              safeTopic = topic.toString('utf8');
            } else {
              safeTopic = String(topic);
            }
            
            // 检查主题是否包含有效字符
            if (!safeTopic || safeTopic.length === 0 || /[\x00-\x1F\x7F-\x9F]/.test(safeTopic)) {
              console.warn('收到包含无效字符的MQTT主题，跳过处理');
              console.log('原始主题数据:', topic);
              return;
            }
            
            // 安全地处理消息内容
            let payload;
            if (Buffer.isBuffer(message)) {
              payload = message.toString('utf8');
            } else {
              payload = String(message);
            }
            
            console.log(`收到MQTT消息: ${safeTopic} => ${payload}`);
            
            // 尝试解析JSON
            let parsedMessage;
            try {
              parsedMessage = JSON.parse(payload);
            } catch (e) {
              // 如果不是JSON，使用原始字符串
              parsedMessage = payload;
            }
            
            // 更新数据点值
            this._updateDataPointValue(safeTopic, parsedMessage);
            
            // 发送消息事件
            this.emit('message', {
              topic: safeTopic,
              payload: parsedMessage
            });
          } catch (err) {
            console.error(`处理MQTT消息时出错:`, err);
            // 发出错误事件但不让程序崩溃
            this.emit('messageError', {
              topic: topic ? (Buffer.isBuffer(topic) ? topic.toString('utf8', 0, Math.min(topic.length, 100)) : String(topic).substring(0, 100)) : 'unknown',
              error: err.message,
              timestamp: new Date().toISOString()
            });
          }
        });
        
        // 设置连接超时
        const connectTimeout = setTimeout(() => {
          if (!this.connected) {
            console.error('MQTT连接超时');
            if (this.client) {
              this.client.end(true);
            }
            reject(new Error('MQTT连接超时'));
          }
        }, this.config.options.connectTimeout || 30000);
        
        // 连接成功后清除超时
        this.client.on('connect', () => {
          clearTimeout(connectTimeout);
        });
        
      } catch (err) {
        console.error('创建MQTT客户端时出错:', err);
        reject(err);
      }
    });
  }
  
  /**
   * 断开与MQTT服务器的连接
   */
  disconnect() {
    if (this.client && this.connected) {
      console.log('正在断开与MQTT服务器的连接');
      this.client.end(true);
      this.connected = false;
    }
  }
  
  /**
   * 订阅主题
   * @param {string} topic 主题
   * @param {Object} options 订阅选项
   * @returns {Promise} 订阅结果
   */
  subscribe(topic, options = {}) {
    return new Promise((resolve, reject) => {
      if (!this.client || !this.connected) {
        const err = new Error('未连接到MQTT服务器');
        console.error(err.message);
        reject(err);
        return;
      }
      
      // 确保主题是有效的UTF-8字符串
      let safeTopic;
      try {
        if (Buffer.isBuffer(topic)) {
          safeTopic = topic.toString('utf8');
        } else {
          safeTopic = String(topic);
        }
        
        // 检查主题是否包含有效字符
        if (!safeTopic || safeTopic.length === 0 || /[\x00-\x1F\x7F-\x9F]/.test(safeTopic)) {
          throw new Error('主题包含无效字符');
        }
      } catch (topicError) {
        const err = new Error(`主题格式无效: ${topicError.message}`);
        console.error(err.message);
        reject(err);
        return;
      }
      
      console.log(`正在订阅主题: ${safeTopic}`);
      
      this.client.subscribe(safeTopic, options, (err, granted) => {
        if (err) {
          console.error(`订阅主题 ${safeTopic} 失败:`, err);
          reject(err);
          return;
        }
        
        console.log(`已成功订阅主题: ${safeTopic}`);
        
        // 记录订阅的主题
        this.topics.set(safeTopic, {
          options,
          subscribed: true
        });
        
        resolve(granted);
      });
    });
  }
  
  /**
   * 取消订阅主题
   * @param {string} topic 主题
   * @returns {Promise} 取消订阅结果
   */
  unsubscribe(topic) {
    return new Promise((resolve, reject) => {
      if (!this.client || !this.connected) {
        const err = new Error('未连接到MQTT服务器');
        console.error(err.message);
        reject(err);
        return;
      }
      
      console.log(`正在取消订阅主题: ${topic}`);
      
      this.client.unsubscribe(topic, (err) => {
        if (err) {
          console.error(`取消订阅主题 ${topic} 失败:`, err);
          reject(err);
          return;
        }
        
        console.log(`已成功取消订阅主题: ${topic}`);
        
        // 更新主题状态
        if (this.topics.has(topic)) {
          const topicData = this.topics.get(topic);
          topicData.subscribed = false;
          this.topics.set(topic, topicData);
        }
        
        resolve(true);
      });
    });
  }
  
  /**
   * 发布消息到主题
   * @param {string} topic 主题
   * @param {string|Object} message 消息内容
   * @param {Object} options 发布选项
   * @returns {Promise} 发布结果
   */
  publish(topic, message, options = {}) {
    return new Promise((resolve, reject) => {
      if (!this.client || !this.connected) {
        const err = new Error('未连接到MQTT服务器');
        console.error(err.message);
        reject(err);
        return;
      }
      
      // 确保主题是有效的UTF-8字符串
      let safeTopic;
      try {
        if (Buffer.isBuffer(topic)) {
          safeTopic = topic.toString('utf8');
        } else {
          safeTopic = String(topic);
        }
        
        // 检查主题是否包含有效字符
        if (!safeTopic || safeTopic.length === 0 || /[\x00-\x1F\x7F-\x9F]/.test(safeTopic)) {
          throw new Error('主题包含无效字符');
        }
      } catch (topicError) {
        const err = new Error(`主题格式无效: ${topicError.message}`);
        console.error(err.message);
        reject(err);
        return;
      }
      
      // 如果消息是对象，转换为JSON字符串
      let payload;
      try {
        if (typeof message === 'object') {
          payload = JSON.stringify(message);
        } else if (Buffer.isBuffer(message)) {
          payload = message.toString('utf8');
        } else {
          payload = String(message);
        }
      } catch (messageError) {
        const err = new Error(`消息格式无效: ${messageError.message}`);
        console.error(err.message);
        reject(err);
        return;
      }
      
      console.log(`正在发布消息到主题: ${safeTopic}`, payload);
      
      this.client.publish(safeTopic, payload, options, (err) => {
        if (err) {
          console.error(`发布消息到主题 ${safeTopic} 失败:`, err);
          reject(err);
          return;
        }
        
        console.log(`已成功发布消息到主题: ${safeTopic}`);
        resolve(true);
      });
    });
  }
  
  /**
   * 重新订阅所有主题（用于重连后）
   * @private
   */
  _resubscribeTopics() {
    if (!this.client || !this.connected) {
      return;
    }
    
    console.log('正在重新订阅主题...');
    
    this.topics.forEach((data, topic) => {
      if (data.subscribed) {
        console.log(`重新订阅主题: ${topic}`);
        this.client.subscribe(topic, data.options, (err) => {
          if (err) {
            console.error(`重新订阅主题 ${topic} 失败:`, err);
          } else {
            console.log(`已成功重新订阅主题: ${topic}`);
          }
        });
      }
    });
  }
  
  /**
   * 更新数据点值
   * @param {string} topic 主题
   * @param {any} value 值
   * @private
   */
  _updateDataPointValue(topic, value) {
    // 查找对应的数据点标识符
    let identifier = null;
    for (const [id, t] of this.dataPointTopics.entries()) {
      if (t === topic || topic.endsWith(id)) {
        identifier = id;
        break;
      }
    }
    
    if (!identifier) {
      // 尝试从主题中提取标识符
      const parts = topic.split('/');
      identifier = parts[parts.length - 1];
    }
    
    if (!identifier) {
      console.warn(`无法为主题 ${topic} 找到对应的数据点标识符`);
      return;
    }
    
    console.log(`更新数据点值: ${identifier} => ${JSON.stringify(value)}`);
    
    const now = new Date();
    
    // 获取实际值
    let actualValue = value;
    let formattedValue = '';
    
    if (typeof value === 'object' && value !== null) {
      // 如果是对象，尝试提取值字段
      if ('value' in value) {
        actualValue = value.value;
      } else if ('val' in value) {
        actualValue = value.val;
      } else if ('data' in value) {
        actualValue = value.data;
      }
      
      // 如果有格式化字段，使用它
      if ('formatted' in value) {
        formattedValue = value.formatted;
      }
    }
    
    // 保存前一个值
    const previousValue = this.dataValues[identifier]?.value;
    const previousTimestamp = this.dataValues[identifier]?.timestamp;
    
    // 如果新值为null或undefined，保留原有值
    const newValue = (actualValue === null || actualValue === undefined) ? previousValue : actualValue;
    
    // 如果没有格式化值，创建一个简单的格式化表示
    if (!formattedValue) {
      if (newValue === null || newValue === undefined) {
        formattedValue = '';
      } else {
        formattedValue = String(newValue);
      }
    }
    
    // 更新数据值
    this.dataValues[identifier] = {
      value: newValue,
      formatted: formattedValue,
      timestamp: now.toISOString(),
      topic,
      previousValue,
      previousTimestamp,
      raw: value
    };
    
    // 更新最后更新时间
    this.lastUpdateTime[identifier] = now.getTime();
    
    // 发出数据更新事件
    this.emit('data-update', {
      identifier,
      value: newValue,
      formatted: formattedValue,
      previousValue,
      previousTimestamp,
      timestamp: now.toISOString(),
      topic
    });
    
    // 检查告警状态
    this._checkAlarmStatus(identifier, newValue, previousValue);
    
    // 如果启用了数据转发到Modbus数据库，则存储数据
    if (this.enableForwarding && this.dbManager) {
      try {
        this._saveToDatabase(identifier, newValue, formattedValue, previousValue, topic);
      } catch (error) {
        console.error(`保存数据到数据库失败，但MQTT服务将继续运行:`, error);
      }
    }
  }
  
  /**
   * 将数据保存到数据库
   * @param {string} identifier 数据点标识符
   * @param {any} value 值
   * @param {string} formattedValue 格式化后的值
   * @param {any} previousValue 前一个值
   * @param {string} topic MQTT主题
   * @private
   */
  async _saveToDatabase(identifier, value, formattedValue, previousValue, topic) {
    if (!this.dbManager || !this.dbManager.initialized) {
      console.warn('数据库管理器未初始化，跳过数据存储');
      return;
    }
    
    try {
      // 查找对应的数据点配置
      const dataPoint = {
        id: identifier,
        identifier: identifier,
        name: identifier, // 使用标识符作为名称，可以根据需要从其他地方获取真实名称
        format: typeof value === 'number' ? 'FLOAT' : 'STRING'
      };
      
      // 准备数据值对象
      const valueObj = {
        value: value,
        formattedValue: formattedValue,
        quality: 'GOOD',
        rawValue: { value, topic },
        readTime: 0
      };
      
      // 准备用于存储的数据点和值
      const dataPoints = [dataPoint];
      const values = {
        [dataPoint.name]: valueObj
      };
      
      // 将数据存储到数据库
      const result = await this.dbManager.storeLatestValues(dataPoints, values);
      console.log(`MQTT数据点保存到数据库结果:`, result);
    } catch (error) {
      console.error(`保存MQTT数据点 ${identifier} 到数据库失败:`, error);
      // 不再抛出错误，确保数据库操作失败不会影响MQTT服务的正常运行
    }
  }
  
  /**
   * 检查告警状态
   * @param {string} identifier 标识符
   * @param {any} newValue 新值
   * @param {any} previousValue 前一个值
   * @private
   */
  _checkAlarmStatus(identifier, newValue, previousValue) {
    // 这里可以实现告警检测逻辑
    // 例如：如果是二进制数据点（0/1值），当值变为1时触发告警
    if (newValue === 1 && previousValue === 0) {
      console.log(`检测到告警触发: ${identifier}`);
      
      // 触发告警事件
      this.emit('alarm', {
        identifier,
        content: `${identifier} 告警`,
        timestamp: new Date().toISOString()
      });
    } else if (newValue === 0 && previousValue === 1) {
      console.log(`检测到告警解除: ${identifier}`);
      
      // 触发告警解除事件
      this.emit('alarmCleared', {
        identifier,
        content: `${identifier} 告警`,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  /**
   * 添加数据点
   * @param {Object} dataPoint 数据点配置
   * @returns {boolean} 是否成功
   */
  addDataPoint(dataPoint) {
    if (!dataPoint || !dataPoint.identifier) {
      console.error('数据点配置无效');
      return false;
    }
    
    const identifier = dataPoint.identifier;
    
    // 构建MQTT主题
    let topic = dataPoint.topic;
    if (!topic) {
      // 如果没有指定主题，使用默认格式
      topic = `data/mqtt/${identifier}`;
    }
    
    console.log(`添加数据点: ${identifier}, 主题: ${topic}`);
    
    // 保存数据点主题映射
    this.dataPointTopics.set(identifier, topic);
    
    // 订阅主题
    if (this.client && this.connected) {
      this.subscribe(topic)
        .then(() => {
          console.log(`已订阅数据点 ${identifier} 的主题: ${topic}`);
        })
        .catch(err => {
          console.error(`订阅数据点 ${identifier} 的主题失败:`, err);
        });
    }
    
    // 初始化数据值
    if (!this.dataValues[identifier]) {
      this.dataValues[identifier] = {
        value: null,
        formatted: '',
        timestamp: null,
        topic
      };
    }
    
    return true;
  }
  
  /**
   * 获取所有数据点值
   * @returns {Object} 数据点值
   */
  getAllDataValues() {
    return this.dataValues;
  }
  
  /**
   * 获取指定数据点的值
   * @param {string} identifier 数据点标识符
   * @returns {Object|null} 数据点值
   */
  getDataValue(identifier) {
    return this.dataValues[identifier] || null;
  }
  
  /**
   * 获取MQTT连接状态
   * @returns {Object} 连接状态
   */
  getConnectionStatus() {
    return {
      connected: this.connected,
      url: this.config.url,
      clientId: this.config.options.clientId
    };
  }
  
  /**
   * 更新连接配置
   * @param {Object} config 新配置
   * @returns {Object} 更新后的配置
   */
  updateConfig(config = {}) {
    // 更新连接配置
    if (config.url) {
      this.config.url = config.url;
    }
    
    if (config.options) {
      this.config.options = {...this.config.options, ...config.options};
    }
    
    console.log('MQTT配置已更新');
    return this.config;
  }
  
  /**
   * 设置缓存清理机制
   * @private
   */
  _setupCacheCleanup() {
    console.log('🧹 启动MQTT缓存清理机制...');
    
    // 定期清理缓存
    setInterval(() => {
      try {
        this._cleanupDataValues();
        this._cleanupUpdateTimes();
        this._cleanupTopicMappings();
        this._reportCacheStatus();
      } catch (error) {
        console.error('MQTT缓存清理过程中发生错误:', error);
      }
    }, this.cacheConfig.cleanupInterval);
    
    console.log(`MQTT缓存清理已设置，间隔: ${this.cacheConfig.cleanupInterval / 1000}秒`);
  }
  
  /**
   * 清理数据值缓存
   * @private
   */
  _cleanupDataValues() {
    const keys = Object.keys(this.dataValues);
    const currentCount = keys.length;
    
    if (currentCount > this.cacheConfig.maxDataValues) {
      console.log(`🧹 数据值缓存超限 (${currentCount}/${this.cacheConfig.maxDataValues})，开始清理...`);
      
      // 按时间戳排序，删除最旧的数据
      const sortedKeys = keys.sort((a, b) => {
        const timeA = this.lastUpdateTime[a] || 0;
        const timeB = this.lastUpdateTime[b] || 0;
        return timeA - timeB;
      });
      
      const toDelete = sortedKeys.slice(0, currentCount - this.cacheConfig.maxDataValues);
      toDelete.forEach(key => {
        delete this.dataValues[key];
        delete this.lastUpdateTime[key];
      });
      
      console.log(`✅ 清理了 ${toDelete.length} 个过期数据点，当前缓存大小: ${Object.keys(this.dataValues).length}`);
    }
  }
  
  /**
   * 清理更新时间记录
   * @private
   */
  _cleanupUpdateTimes() {
    const now = Date.now();
    const maxAge = this.cacheConfig.maxAge;
    let cleanedCount = 0;
    
    Object.keys(this.lastUpdateTime).forEach(key => {
      if (now - this.lastUpdateTime[key] > maxAge) {
        delete this.lastUpdateTime[key];
        delete this.dataValues[key];
        cleanedCount++;
      }
    });
    
    if (cleanedCount > 0) {
      console.log(`🧹 清理了 ${cleanedCount} 个过期的更新时间记录`);
    }
  }
  
  /**
   * 清理主题映射
   * @private
   */
  _cleanupTopicMappings() {
    // 清理未使用的主题映射
    const activeTopics = new Set(this.topics.keys());
    let cleanedCount = 0;
    
    for (const [identifier, topic] of this.dataPointTopics.entries()) {
      if (!activeTopics.has(topic)) {
        this.dataPointTopics.delete(identifier);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 清理了 ${cleanedCount} 个未使用的主题映射`);
    }
  }
  
  /**
   * 报告缓存状态
   * @private
   */
  _reportCacheStatus() {
    const cacheStats = {
      dataValues: Object.keys(this.dataValues).length,
      updateTimes: Object.keys(this.lastUpdateTime).length,
      topics: this.topics.size,
      topicMappings: this.dataPointTopics.size,
      maxDataValues: this.cacheConfig.maxDataValues,
      maxUpdateRecords: this.cacheConfig.maxUpdateRecords
    };
    
    // 只在缓存使用率较高时报告
    const usageRate = cacheStats.dataValues / cacheStats.maxDataValues;
    if (usageRate > 0.8) {
      console.log('📊 MQTT缓存状态报告:', cacheStats);
      console.log(`⚠️ 缓存使用率: ${Math.round(usageRate * 100)}%`);
    }
  }
  
  /**
   * 手动触发缓存清理
   * @public
   */
  triggerCacheCleanup() {
    console.log('🧹 手动触发MQTT缓存清理...');
    
    const beforeStats = {
      dataValues: Object.keys(this.dataValues).length,
      updateTimes: Object.keys(this.lastUpdateTime).length,
      topicMappings: this.dataPointTopics.size
    };
    
    this._cleanupDataValues();
    this._cleanupUpdateTimes();
    this._cleanupTopicMappings();
    
    const afterStats = {
      dataValues: Object.keys(this.dataValues).length,
      updateTimes: Object.keys(this.lastUpdateTime).length,
      topicMappings: this.dataPointTopics.size
    };
    
    console.log('✅ MQTT缓存清理完成:', {
      before: beforeStats,
      after: afterStats,
      cleaned: {
        dataValues: beforeStats.dataValues - afterStats.dataValues,
        updateTimes: beforeStats.updateTimes - afterStats.updateTimes,
        topicMappings: beforeStats.topicMappings - afterStats.topicMappings
      }
    });
  }
  
  /**
   * 获取缓存统计信息
   * @public
   */
  getCacheStats() {
    return {
      dataValues: Object.keys(this.dataValues).length,
      updateTimes: Object.keys(this.lastUpdateTime).length,
      topics: this.topics.size,
      topicMappings: this.dataPointTopics.size,
      config: this.cacheConfig,
      memoryUsage: process.memoryUsage()
    };
  }
  
  /**
   * 获取单例实例
   * @returns {MqttService} 实例
   */
  static getInstance() {
    if (!MqttService.instance) {
      MqttService.instance = new MqttService();
    }
    return MqttService.instance;
  }
}

module.exports = MqttService; 
const EventEmitter = require('events');
const ConfigManager = require('./config-manager');
const DataPointManager = require('./data-point-manager');
const ModbusTCP = require('./modbus-tcp');
const MqttService = require('./mqtt-service'); // 添加MQTT服务
const AlarmDbService = require('./alarm-db-service');

// 尝试导入告警调试工具（如果存在）
let AlarmDebugger;
try {
  AlarmDebugger = require('../utils/alarm-debugger');
} catch (error) {
  console.warn('AlarmDebugger模块不可用:', error.message);
  // 创建一个空的AlarmDebugger实现
  AlarmDebugger = {
    getInstance: () => ({
      log: () => {},
      logAlarmTriggered: () => {},
      logAlarmCleared: () => {},
      logAlarmDbOperation: () => {},
      logError: () => {}
    })
  };
}

/**
 * ModbusService类 - 管理Modbus连接、轮询和数据处理
 * 现在同时支持Modbus和MQTT两种数据获取方式
 */
class ModbusService extends EventEmitter {
  constructor() {
    super();
    
    // 设置最大监听器数量，避免内存泄漏警告
    this.setMaxListeners(20);
    
    this.modbus = null;
    this.dataPointManager = DataPointManager.getInstance();
    this.configManager = ConfigManager.getInstance();
    
    // 添加告警数据库服务
    this.alarmDbService = AlarmDbService.getInstance();
    
    // 初始化内部数据缓存 - 用于存储API写入的数据
    this._dataCache = {};
    console.log('ModbusService - 初始化内部数据缓存');
    
    // 添加告警调试工具
    try {
      this.alarmDebugger = AlarmDebugger.getInstance();
    } catch (error) {
      console.warn('无法获取AlarmDebugger实例，使用空实现:', error.message);
      // 创建一个空的AlarmDebugger实现
      this.alarmDebugger = {
        log: () => {},
        logAlarmTriggered: () => {},
        logAlarmCleared: () => {},
        logAlarmDbOperation: () => {},
        logError: () => {}
      };
    }
    
    // 初始化状态
    this.isConnected = false;
    this.isPolling = false;
    this.reconnectTimer = null;
    this.pollingTimer = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectInterval = 5000; // 5秒
    
    // 初始化通信统计
    this.communicationStats = {
      successfulReads: 0,
      failedReads: 0,
      successfulWrites: 0,
      failedWrites: 0,
      lastSuccessfulRead: null,
      lastSuccessfulWrite: null,
      lastFailedCommunication: null,
      errors: []
    };
    
    // 初始化活跃监听器跟踪
    this._activeListeners = new Map();
    
    // 初始化资源监控和清理定时器
    this._setupResourceMonitoring();
    
    // 初始化配置
    this.config = this.configManager.getConnectionConfig();
    
    // 数据源类型 - 'modbus' 或 'mqtt'
    this.dataSourceType = this.config.dataSourceType || 'modbus';
    
    // 禁用MQTT服务初始化 - 避免与主MQTT服务冲突
    // 注释掉MQTT服务相关代码，使用主MQTT服务 (modules/mqtt-service.js)
    /*
    // 初始化MQTT服务
    this.mqttService = MqttService.getInstance();
    
    // 为MQTT服务添加事件监听器
    this.mqttService.on('connected', () => {
      console.log('MQTT服务已连接');
      this.isConnected = true;
      this.emit('connected');
      
      // 启动数据点订阅
      this._initializeMqttDataPoints();
      
      // 如果配置了自动轮询，启动轮询
      if (this.configManager.getPollingConfig().enabled) {
        this.startPolling();
      }
    });
    
    this.mqttService.on('disconnected', () => {
      console.log('MQTT服务已断开连接');
      this.isConnected = false;
      this.emit('disconnected');
    });
    
    this.mqttService.on('error', (error) => {
      console.error('MQTT服务错误:', error);
      
      // 更新连接状态
      this.isConnected = false;
      
      // 不再发出可能导致未处理错误的事件，而是直接处理
      console.log(`MQTT错误详情: ${error.message || '未知错误'} (代码: ${error.code || 'N/A'})`);
      
      // 如果启用了自动重连，尝试重新连接
      if (this.config?.mqtt?.autoReconnect) {
        console.log('MQTT连接错误，将尝试自动重连...');
        this.scheduleReconnect();
      }
    });
    
    // 添加MQTT离线事件处理
    this.mqttService.on('offline', () => {
      console.log('MQTT服务离线');
      this.isConnected = false;
      this.emit('offline');
    });
    
    // 添加MQTT消息错误处理
    this.mqttService.on('messageError', (errorData) => {
      console.error('MQTT消息处理错误:', errorData);
      this.emit('messageError', errorData);
    });
    
    this.mqttService.on('data-update', (data) => {
      // 转发数据更新事件
      this.emit('data-update', data);
    });
    
    this.mqttService.on('alarm', (alarmData) => {
      // 转发告警事件
      this.emit('alarm', alarmData);
      
      // 记录告警到数据库
      if (this.alarmDbService) {
        this.alarmDbService.addAlarm({
          identifier: alarmData.identifier,
          content: alarmData.content,
          timestamp: alarmData.timestamp,
          status: 'active'
        }).catch(err => {
          console.error('保存告警记录失败:', err);
        });
      }
    });
    
    this.mqttService.on('alarmCleared', (clearData) => {
      // 转发告警解除事件
      this.emit('alarmCleared', clearData);
      
      // 更新告警状态为已解除
      if (this.alarmDbService) {
        this.alarmDbService.updateAlarmStatus(
          clearData.identifier, 
          'cleared', 
          clearData.timestamp
        ).catch(err => {
          console.error('更新告警状态失败:', err);
        });
      }
    });
    */
    
    console.log('ModbusService实例已创建 - MQTT服务已禁用，避免冲突');
    
    // 添加进程级别的错误处理器，防止未处理的错误导致程序崩溃
    this._setupGlobalErrorHandlers();
  }
  
  /**
   * 设置全局错误处理器
   * @private
   */
  _setupGlobalErrorHandlers() {
    // 处理未捕获的异常
    process.on('uncaughtException', (error) => {
      console.error('未捕获的异常:', error);
      console.error('错误堆栈:', error.stack);
      
      // 记录错误但不退出程序
      if (error.code === 'ECONNRESET' || error.code === 'ERR_UNHANDLED_ERROR') {
        console.log('检测到连接重置错误，尝试恢复连接...');
        
        // 重置连接状态
        this.isConnected = false;
        
        // 如果启用了自动重连，尝试重新连接
        if (this.config?.mqtt?.autoReconnect) {
          setTimeout(() => {
            console.log('尝试自动重连...');
            this.scheduleReconnect();
          }, 3000);
        }
      }
    });
    
    // 处理未处理的Promise拒绝
    process.on('unhandledRejection', (reason, promise) => {
      console.error('未处理的Promise拒绝:', reason);
      console.error('Promise:', promise);
      
      // 如果是MQTT相关的错误，尝试恢复
      if (reason && (reason.code === 'ECONNRESET' || reason.message?.includes('MQTT'))) {
        console.log('检测到MQTT相关的Promise拒绝，尝试恢复连接...');
        this.isConnected = false;
        
        if (this.config?.mqtt?.autoReconnect) {
          setTimeout(() => {
            this.scheduleReconnect();
          }, 3000);
        }
      }
    });
  }
  
  /**
   * 从配置管理器获取连接配置
   * @returns {Object} 连接配置
   */
  getConnectionConfigFromManager() {
    const config = this.configManager.getConnectionConfig();
    return {
      ...config,
      dataSourceType: config.dataSourceType || 'modbus'
    };
  }

  /**
   * 连接到Modbus服务器或MQTT服务器
   * @param {Object} config 连接配置
   * @param {boolean} skipPolling 是否跳过轮询启动
   * @returns {Promise} 连接结果
   */
  async connect(config, skipPolling = false) {
    // 如果已经有一个连接请求正在处理中，拒绝新的请求
    if (this._connecting) {
      console.log('已有连接请求正在处理中，忽略当前请求');
      return Promise.reject(new Error('已有连接请求正在处理中'));
    }
    
    this._connecting = true;
    
    try {
      // 获取当前配置
      const currentConfig = config || this.configManager.getConnectionConfig();
      
      // 确定数据源类型
      this.dataSourceType = currentConfig.dataSourceType || 'modbus';
      console.log(`使用数据源类型: ${this.dataSourceType}`);
      
      // 根据数据源类型选择连接方式
      if (this.dataSourceType === 'mqtt') {
        // MQTT连接方式
        return this._connectToMqtt(currentConfig, skipPolling);
      } else {
        // Modbus连接方式
        return this._connectToModbus(currentConfig, skipPolling);
      }
    } finally {
      this._connecting = false;
    }
  }
  
  /**
   * 连接到MQTT服务器
   * @param {Object} config MQTT连接配置
   * @param {boolean} skipPolling 是否跳过轮询启动
   * @returns {Promise} 连接结果
   * @private
   */
  async _connectToMqtt(config, skipPolling = false) {
    console.log('准备连接到MQTT服务器...');
    
    // 如果已经连接，先断开
    if (this.isConnected) {
      await this.disconnect();
    }

    // 准备MQTT配置
    const mqttConfig = {
      url: config.mqtt?.url || 'mqtt://localhost:1883',
      options: {
        ...config.mqtt?.options,
        clientId: config.mqtt?.options?.clientId || `modbus_mqtt_${Math.random().toString(16).substring(2, 10)}`
      }
    };
    
    try {
      // 连接到MQTT服务器
      await this.mqttService.connect(mqttConfig);
      
      // 连接成功
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      console.log('已成功连接到MQTT服务器');
      
      // 初始化数据点
      this._initializeMqttDataPoints();
      
      // 如果不跳过轮询且轮询已启用，则开始轮询
      if (!skipPolling && this.configManager.getPollingConfig().enabled) {
        this.startPolling();
      }
      
      return true;
    } catch (error) {
      console.error('连接到MQTT服务器失败:', error.message);
      
      // 重置连接状态
      this.isConnected = false;
      
      // 增加重连尝试次数
      this.reconnectAttempts++;
      
      // 如果启用了自动重连且未超过最大尝试次数，则安排重连
      if (config.mqtt?.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.scheduleReconnect();
      }
      
      throw error;
    }
  }
  
  /**
   * 连接到Modbus服务器
   * @param {Object} config Modbus连接配置
   * @param {boolean} skipPolling 是否跳过轮询启动
   * @returns {Promise} 连接结果
   * @private
   */
  async _connectToModbus(config, skipPolling = false) {
    console.log('准备连接到Modbus服务器...');
    
    // 如果没有主机或端口，拒绝连接
    if (!config.host || !config.port) {
      return Promise.reject(new Error(`连接参数无效 - 主机: ${config.host}, 端口: ${config.port}`));
    }
    
    // 更新类成员变量中的配置
    this.config = config;
    
    // 如果已连接，先断开
    if (this.isConnected && this.modbusTCP) {
      await this.disconnect();
    }
    
      return new Promise((resolve, reject) => {
      try {
        console.log(`尝试连接到Modbus服务器: ${config.host}:${config.port}`);
        
        // 创建ModbusTCP实例
        this.modbusTCP = new ModbusTCP({
          host: config.host,
          port: config.port,
          unitId: config.unitId || 1,
          timeout: config.timeout || 5000,
          autoConnect: false,
          autoReconnect: config.autoReconnect,
          keepAliveEnabled: config.keepAliveEnabled,
          keepAliveInterval: config.keepAliveInterval,
          keepAliveAddress: config.keepAliveAddress,
          keepAliveFunctionCode: config.keepAliveFunctionCode
        });
        
        // 设置连接成功的处理函数
        const onConnected = () => {
          console.log('已成功连接到Modbus服务器');
          
          // 移除事件监听器，避免多次触发
          this.modbusTCP.removeListener('connected', onConnected);
          this.modbusTCP.removeListener('error', onError);
          
          // 更新状态
          this.isConnected = true;
          this.reconnectAttempts = 0;
          
          // 初始化数据点
          this._initializeDataPoints();
          
          // 设置事件监听器
          this.setupConnectionListeners();
          
          // 发出连接成功事件
          this.emit('connected');
          
          // 如果不跳过轮询且轮询已启用，则开始轮询
          if (!skipPolling && this.configManager.getPollingConfig().enabled) {
            this.startPolling();
          }
          
          resolve(true);
        };
        
        // 设置连接错误的处理函数
        const onError = (err) => {
          console.error('连接到Modbus服务器时出错:', err.message);
          
          // 移除事件监听器，避免多次触发
            this.modbusTCP.removeListener('connected', onConnected);
            this.modbusTCP.removeListener('error', onError);
            
          // 重置连接状态
          this.isConnected = false;
          
          // 增加重连尝试次数
          this.reconnectAttempts++;
          
          // 如果启用了自动重连且未超过最大尝试次数，则安排重连
          if (config.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
          }
          
          reject(err);
        };
        
        // 添加事件监听器
        this.modbusTCP.once('connected', onConnected);
        this.modbusTCP.once('error', onError);

        // 开始连接
        this.modbusTCP.connect().catch(onError);
        
      } catch (err) {
        console.error('创建ModbusTCP实例时出错:', err);
        this.isConnected = false;
        reject(err);
      }
    });
  }

  /**
   * 断开与Modbus或MQTT服务器的连接
   * @returns {Promise} 断开结果
   */
  async disconnect() {
    console.log('正在断开连接...');
    
    // 停止轮询
    this.stopPolling();
    
    // 清理所有定时器
    this._cleanup();
    
    // 根据数据源类型选择断开方式
    if (this.dataSourceType === 'mqtt') {
      // MQTT断开连接
      if (this.mqttService) {
        this.mqttService.disconnect();
      }
    } else {
      // Modbus断开连接
      if (this.modbusTCP) {
        this.modbusTCP.disconnect();
        this.modbusTCP = null;
      }
    }
    
    // 重置状态
      this.isConnected = false;
    
    // 发出断开连接事件
    this.emit('disconnected');
    
      return true;
  }

  /**
   * 更新连接配置
   * @param {Object} updates - 配置更新
   * @returns {Object} 新配置
   */
  updateConnectionConfig(updates) {
    console.log('ModbusService.updateConnectionConfig - 更新配置:', updates);
    
    // 如果已连接，需要断开
    if (this.isConnected) {
      console.log('ModbusService.updateConnectionConfig - 断开当前连接以应用新配置');
      this.disconnect();
    }
    
    // 确保更新内容有效
    if (!updates) {
      console.warn('ModbusService.updateConnectionConfig - 未提供更新内容，保持当前配置');
      return this.configManager.getConnectionConfig();
    }
    
    // 更新配置
    const newConfig = this.configManager.updateConnectionConfig(updates);
    console.log('ModbusService.updateConnectionConfig - 配置已更新:', newConfig);
    
    // 如果配置了自动连接，则重新连接
    if (newConfig.autoConnect) {
      console.log('ModbusService.updateConnectionConfig - 自动连接已启用，将尝试连接');
      this.connect(newConfig);
    }
    
    return newConfig;
  }

  /**
   * 获取连接状态
   * @returns {Object} 连接状态
   */
  getConnectionStatus() {
    return {
      connected: this.isConnected,
      config: this.configManager.getConnectionConfig(),
      connectionTime: this.connectionStartTime,
      lastError: this.lastConnectionError ? {
        message: this.lastConnectionError.message,
        time: this.lastConnectionError.time,
        code: this.lastConnectionError.code
      } : null,
      stats: this.communicationStats,
      reconnectAttempts: this.reconnectAttempts,
      lastConnectionAttempt: this.lastConnectionAttempt
    };
  }

  /**
   * 获取轮询状态
   * @returns {Object} 轮询状态
   */
  getPollingStatus() {
    return this.configManager.getPollingConfig();
  }

  /**
   * 更新轮询配置
   * @param {Object} updates - 配置更新
   * @returns {Object} 新配置
   */
  updatePollingConfig(updates) {
    const newConfig = this.configManager.updatePollingConfig(updates);
    
    // 如果已连接且启用轮询，更新轮询
    if (this.isConnected) {
      if (newConfig.enabled) {
        this.startPolling(newConfig.interval);
      } else {
        this.stopPolling();
      }
    }
    
    return newConfig;
  }

  /**
   * 计算基于数据点数量的最小轮询间隔
   * @private
   * @param {number} dataPointCount 数据点数量
   * @returns {number} 最小建议轮询间隔（毫秒）
   */
  _calculateMinPollingInterval(dataPointCount) {
    // 如果没有数据点，返回默认值
    if (!dataPointCount || dataPointCount <= 0) {
      return 5000; // 默认5秒
    }
    
    // 批处理参数
    const batchSize = 8; // 与readDataPoints中的批处理大小保持一致
    const batchDelay = 200; // 批次间延迟
    const estimatedReadTime = 300; // 每个批次的估计读取时间（毫秒）
    
    // 计算批次数
    const batchCount = Math.ceil(dataPointCount / batchSize);
    
    // 计算总估计处理时间
    // 每个批次的处理时间 + 批次间延迟时间
    const totalProcessingTime = (batchCount * estimatedReadTime) + ((batchCount - 1) * batchDelay);
    
    // 增加50%的缓冲时间，避免下一轮轮询在前一轮完成前开始
    const minInterval = Math.ceil(totalProcessingTime * 1.5);
    
    // 确保最小间隔不低于5000毫秒
    return Math.max(5000, minInterval);
  }

  /**
   * 启动数据点轮询
   * @param {number} interval 轮询间隔(毫秒)
   * @returns {boolean} 成功返回true
   */
  startPolling(interval) {
    console.log(`开始启动数据点轮询...`);
    
    // 如果已经在轮询，先停止
    if (this.isPolling) {
      console.log('已经在轮询中，先停止当前轮询');
      this.stopPolling();
    }
    
    // 获取轮询配置
    const pollingConfig = this.configManager.getPollingConfig();
    const configInterval = pollingConfig.interval || 5000;
    
    // 使用传入的间隔或配置的间隔
    const pollingInterval = interval || configInterval;
    
    console.log(`轮询间隔: ${pollingInterval}ms`);
    
    // 根据数据源类型选择轮询方式
    if (this.dataSourceType === 'mqtt') {
      return this._startMqttPolling(pollingInterval);
    } else {
      return this._startModbusPolling(pollingInterval);
    }
  }
  
  /**
   * 启动MQTT数据源的轮询
   * @param {number} interval 轮询间隔(毫秒)
   * @returns {boolean} 成功返回true
   * @private
   */
  _startMqttPolling(interval) {
    // MQTT模式下，轮询主要用于定期刷新数据点值的展示
    // 实际数据更新由MQTT消息推送驱动
    
    console.log(`启动MQTT数据展示轮询，间隔: ${interval}ms`);
    
    // 设置轮询定时器
    this.pollingTimer = setInterval(() => {
      // 获取最新数据并触发更新事件
      const values = this.mqttService.getAllDataValues();
      
      // 发出数据更新事件，用于界面刷新
      this.emit('data-values-updated', {
        values,
        source: 'mqtt',
        timestamp: new Date().toISOString()
      });
    
      // 简化连接检查，避免频繁重连
      // MQTT连接状态由底层库和事件监听器管理
    }, interval);
    
    // 更新状态
    this.isPolling = true;
    
    // 更新配置
    this.configManager.updatePollingConfig({
      enabled: true,
      interval
    });
    
    // 发出轮询开始事件
    this.emit('polling-started', {
      interval,
      timestamp: new Date().toISOString(),
      source: 'mqtt'
    });
    
    return true;
  }
  
  /**
   * 启动Modbus数据源的轮询
   * @param {number} interval 轮询间隔(毫秒)
   * @returns {boolean} 成功返回true
   * @private
   */
  _startModbusPolling(interval) {
    if (!this.modbusTCP || !this.isConnected) {
      console.error('未连接到Modbus服务器，无法启动轮询');
      return false;
    }
    
    console.log(`启动Modbus数据轮询，间隔: ${interval}ms`);
    
    // 设置ModbusTCP轮询
    const result = this.modbusTCP.startPolling(interval);
    
    if (result) {
      // 更新状态
      this.isPolling = true;
      
      // 更新配置
      this.configManager.updatePollingConfig({
        enabled: true,
        interval
      });
      
      // 发出轮询开始事件
      this.emit('polling-started', {
        interval,
        timestamp: new Date().toISOString(),
        source: 'modbus'
      });
        } else {
      console.error('启动ModbusTCP轮询失败');
        }
    
    return result;
  }

  /**
   * 停止数据点轮询
   * @returns {boolean} 成功返回true
   */
  stopPolling() {
    console.log('停止数据点轮询');
    
    // 根据数据源类型选择停止方式
    if (this.dataSourceType === 'mqtt') {
      // 停止MQTT轮询
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    } else {
      // 停止Modbus轮询
    if (this.modbusTCP) {
      this.modbusTCP.stopPolling();
    }
      
      // 清除本地轮询定时器
      if (this.pollingTimer) {
        clearInterval(this.pollingTimer);
        this.pollingTimer = null;
      }
    }
    
    // 更新状态
    this.isPolling = false;
    
    // 更新配置
    this.configManager.updatePollingConfig({
      enabled: false
    });
    
    // 发出轮询停止事件
    this.emit('polling-stopped', {
      timestamp: new Date().toISOString(),
      source: this.dataSourceType
    });
    
    return true;
  }

  /**
   * 安排自动重新连接
   * @private
   */
  scheduleReconnect() {
    // 如果已经存在重连计时器，则不再创建新的
    if (this.reconnectTimer) {
      console.log('已经存在重连计划，不再创建新的');
      return;
    }

    // 超过最大重试次数，停止重连
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`已达到最大重连尝试次数(${this.maxReconnectAttempts})，停止重连`);
      
      // 修改最后连接错误，标记为连接彻底失败
      this.lastConnectionError = {
        ...this.lastConnectionError,
        finalFailure: true,
        attempts: this.reconnectAttempts,
        time: new Date().toISOString()
      };
      
      // 发送最终重连失败事件
      this.emit('reconnect_failed', {
        type: this.dataSourceType,
        attempts: this.reconnectAttempts,
        time: new Date().toISOString(),
        error: this.lastConnectionError?.message || '连接失败'
      });
      
      return;
    }

    // 重置标志
    this.manualDisconnect = false;

    // 使用指数退避算法：获取重连延迟时间（随重试次数增加而延长）
    const baseDelay = this.config?.reconnectDelay || 5000; // MQTT重连间隔短一些
    const delay = Math.min(baseDelay * Math.pow(1.5, this.reconnectAttempts), 30000); // MQTT最长30秒
    
    console.log(`计划在 ${delay/1000} 秒后进行第 ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts} 次重连尝试 (${this.dataSourceType})`);
    
    // 发出重连事件
    this.emit('reconnecting', {
      type: this.dataSourceType,
      delay: delay,
      time: new Date().toISOString(),
      attempt: this.reconnectAttempts + 1,
      maxAttempts: this.maxReconnectAttempts
    });
    
    // 设置重连计时器
    this.reconnectTimer = setTimeout(async () => {
      // 增加重连次数计数
      this.reconnectAttempts++;
      
      console.log(`尝试重新连接 ${this.dataSourceType} (第 ${this.reconnectAttempts}/${this.maxReconnectAttempts} 次尝试)`);
      
      // 清除计时器引用
      this.reconnectTimer = null;
      
      try {
        // 根据数据源类型选择重连方式
        let result;
        if (this.dataSourceType === 'mqtt') {
          // MQTT重连
          result = await this._reconnectMqtt();
        } else {
          // Modbus重连
          result = await this.connect();
        }
        
        if (result && (result.success !== false)) {
          // 连接成功，重置重连尝试次数
          console.log(`${this.dataSourceType} 重新连接成功`);
          this.reconnectAttempts = 0;
          this.isConnected = true;
          
          // 如果自动轮询设置为启用，则启动轮询
          if (this.config?.autoStartPolling) {
            this.startPolling();
          }
        } else {
          // 连接失败，再次安排重连
          console.error(`${this.dataSourceType} 重新连接失败`);
          this.scheduleReconnect();
        }
      } catch (error) {
        // 连接过程中发生错误，再次安排重连
        console.error(`${this.dataSourceType} 重新连接过程中发生错误:`, error.message);
        this.scheduleReconnect();
      }
    }, delay);
  }
  
  /**
   * MQTT重连方法
   * @returns {Promise<boolean>} 重连结果
   * @private
   */
  async _reconnectMqtt() {
    try {
      console.log('开始MQTT重连...');
      
      // 先断开现有连接
      if (this.mqttService && this.mqttService.connected) {
        await this.mqttService.disconnect();
      }
      
      // 等待一小段时间
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 获取当前配置
      const currentConfig = this.configManager.getConnectionConfig();
      
      // 重新连接
      await this._connectToMqtt(currentConfig, false);
      
      console.log('MQTT重连成功');
      return true;
    } catch (error) {
      console.error('MQTT重连失败:', error.message);
      return false;
    }
  }

  /**
   * 检查连接状态（简化版本）
   * 只检查内部状态标志，不发送实际请求
   * @returns {boolean} 连接状态
   */
  checkConnection() {
    // 根据数据源类型检查连接状态
    if (this.dataSourceType === 'mqtt') {
      return this.mqttService && this.mqttService.connected;
    } else {
      return this.modbusTCP && this.modbusTCP.connected && this.isConnected;
    }
  }

  /**
   * 添加数据点
   * @param {Object} dataPoint - 数据点配置
   * @returns {Object} 新添加的数据点
   */
  addDataPoint(dataPoint) {
    console.log('添加数据点:', dataPoint);
    
    // 确保设置数据源类型
    if (!dataPoint.dataSourceType) {
      dataPoint.dataSourceType = this.dataSourceType || 'modbus';
    }
    
    // 添加到数据点管理器
    const newDataPoint = this.dataPointManager.addDataPoint(dataPoint);
    
    // 根据数据源类型进行处理
    if (dataPoint.dataSourceType === 'mqtt') {
      // MQTT数据点 - 检查是否有MQTT服务并订阅主题
      if (this.mqttService && this.mqttService.isConnected()) {
        console.log(`为MQTT数据点 ${dataPoint.identifier} 订阅主题 ${dataPoint.topic}`);
        this.mqttService.subscribe(dataPoint.topic);
      } else {
        console.warn(`MQTT服务未连接，无法为数据点 ${dataPoint.identifier} 订阅主题`);
      }
    } else {
      // Modbus数据点 - 添加到ModbusTCP客户端
    if (this.modbusTCP && this.isConnected) {
      this.modbusTCP.addDataPoint(newDataPoint);
    }
    }
    
    return newDataPoint;
  }

  /**
   * 更新数据点
   * @param {string} id - 数据点ID
   * @param {Object} updates - 更新内容
   * @returns {Object} 更新后的数据点
   */
  updateDataPoint(id, updates) {
    return this.dataPointManager.updateDataPoint(id, updates);
  }

  /**
   * 删除数据点
   * @param {string} id - 数据点ID
   * @returns {boolean} 是否成功删除
   */
  deleteDataPoint(id) {
    // 获取要删除的数据点信息，用于后续清除告警
    const dataPoint = this.dataPointManager.getDataPointById(id);
    
    // 删除数据点
    const result = this.dataPointManager.deleteDataPoint(id);
    
    // 如果删除成功且数据点存在，清除相关告警
    if (result && dataPoint && this.modbusTCP) {
      console.log(`删除数据点 ${dataPoint.name}，正在清除相关告警...`);
      
      try {
        // 检查ModbusTCP实例是否存在及是否有告警状态
        if (this.modbusTCP.alarmPlayingState) {
          // 获取告警内容
          const alarmContent = dataPoint.alarmContent || dataPoint.name;
          const identifier = dataPoint.identifier || dataPoint.name;
          
          // 调用clearAlarm方法清除告警
          if (this.modbusTCP.clearAlarm) {
            const clearResult = this.modbusTCP.clearAlarm(identifier, alarmContent);
            console.log(`清除已删除数据点 ${dataPoint.name} 的告警结果: ${clearResult ? '成功' : '未找到匹配告警'}`);
          }
          
          // 直接从活动告警列表中移除与该数据点相关的所有告警
          if (this.modbusTCP.alarmPlayingState.activeAlarms && this.modbusTCP.alarmPlayingState.activeAlarms.length > 0) {
            const activeAlarms = [...this.modbusTCP.alarmPlayingState.activeAlarms];
            let removedCount = 0;
            
            // 过滤掉与该数据点相关的告警
            this.modbusTCP.alarmPlayingState.activeAlarms = activeAlarms.filter(alarm => {
              const isRelated = 
                alarm === alarmContent || 
                alarm.includes(dataPoint.name) || 
                (dataPoint.identifier && alarm.includes(dataPoint.identifier));
              
              if (isRelated) {
                removedCount++;
                // 同时清除首次触发时间记录
                if (this.modbusTCP.alarmPlayingState.alarmFirstTriggerTime && 
                    this.modbusTCP.alarmPlayingState.alarmFirstTriggerTime[alarm]) {
                  delete this.modbusTCP.alarmPlayingState.alarmFirstTriggerTime[alarm];
                }
              }
              
              return !isRelated;
            });
            
            console.log(`从活动告警列表中移除了 ${removedCount} 个与数据点 ${dataPoint.name} 相关的告警`);
          }
        }
      } catch (error) {
        console.error(`清除数据点 ${dataPoint.name} 的告警时出错:`, error);
      }
    }
    
    return result;
  }

  /**
   * 获取所有数据点
   * @returns {Array} 数据点列表
   */
  getAllDataPoints() {
    return this.dataPointManager.getAllDataPoints();
  }

  /**
   * 获取所有数据点值
   * @param {boolean} forceRefresh 是否强制刷新
   * @returns {Object} 数据点值对象
   */
  getAllDataValues(forceRefresh = false) {
    console.log(`获取所有数据点值，强制刷新: ${forceRefresh}, 数据源类型: ${this.dataSourceType}`);
    
    let result = {};
    
    // 首先检查内部缓存（这里包含API写入的数据）
    if (this._dataCache && Object.keys(this._dataCache).length > 0) {
      console.log(`从内部缓存获取到 ${Object.keys(this._dataCache).length} 个数据点值`);
      
      // 直接使用内部缓存的数据
      for (const [key, value] of Object.entries(this._dataCache)) {
        result[key] = {
          value: value.value,
          formatted: value.formatted,
          timestamp: value.timestamp,
          quality: value.quality || 'GOOD',
          source: value.source || 'cache'
        };
      }
      
      console.log(`从内部缓存添加了 ${Object.keys(result).length} 个数据点到结果中`);
    }
    
    // 根据数据源类型选择获取方式
    if (this.dataSourceType === 'mqtt') {
      console.log('尝试从MQTT服务获取数据...');
      // 从MQTT服务获取数据
      const mqttResult = this._getAllDataValuesFromMqtt(forceRefresh);
      
      // 合并MQTT数据（但不覆盖缓存数据）
      for (const [key, value] of Object.entries(mqttResult)) {
        if (!result[key]) {
          result[key] = value;
        }
      }
      
      console.log(`MQTT数据源返回了 ${Object.keys(mqttResult).length} 个数据点`);
    } else {
      console.log('从Modbus服务获取数据...');
      // 从Modbus服务获取数据
      const modbusResult = this._getAllDataValuesFromModbus(forceRefresh);
      
      // 合并Modbus数据（但不覆盖缓存数据）
      for (const [key, value] of Object.entries(modbusResult)) {
        if (!result[key]) {
          result[key] = value;
        }
      }
      
      console.log(`Modbus数据源返回了 ${Object.keys(modbusResult).length} 个数据点`);
    }
    
    console.log(`getAllDataValues最终返回 ${Object.keys(result).length} 个数据点值`);
    console.log(`最终结果键名: [${Object.keys(result).join(', ')}]`);
    
    return result;
  }
  
  /**
   * 从MQTT服务获取所有数据点值
   * @param {boolean} forceRefresh 是否强制刷新
   * @returns {Object} 数据点值对象
   * @private
   */
  _getAllDataValuesFromMqtt(forceRefresh = false) {
    console.log('_getAllDataValuesFromMqtt - MQTT服务状态:', this.mqttService ? '可用' : '不可用');
    
    let result = {};
    
    // 首先从内部缓存获取数据（包括API写入的数据）
    if (this._dataCache && Object.keys(this._dataCache).length > 0) {
      console.log(`从内部缓存获取到 ${Object.keys(this._dataCache).length} 个数据点值`);
      
      for (const [key, dataValue] of Object.entries(this._dataCache)) {
        result[key] = {
          value: dataValue.value,
          formatted: dataValue.formatted,
          timestamp: dataValue.timestamp,
          quality: dataValue.quality || 'GOOD',
          source: dataValue.source || 'cache'
        };
      }
      
      console.log(`从内部缓存添加了 ${Object.keys(result).length} 个数据点到结果中`);
    }
    
    // 如果MQTT服务可用，尝试获取MQTT数据
    if (this.mqttService) {
      console.log('从MQTT服务获取数据...');
      
      // 直接从MQTT服务获取数据值
      const mqttValues = this.mqttService.getAllDataValues();
      
      // 转换为前端需要的格式，但不覆盖缓存数据
      for (const [identifier, dataValue] of Object.entries(mqttValues)) {
        // 只有当result中还没有这个数据点时才添加（缓存数据优先）
        if (!result[identifier]) {
          result[identifier] = {
            value: dataValue.value,
            formatted: dataValue.formatted || this._formatValue(dataValue.value, dataValue.format, dataValue.scale, dataValue.unit),
            timestamp: dataValue.timestamp,
            quality: dataValue.quality || 'GOOD',
            source: 'mqtt'
          };
        }
      }
      
      console.log(`从MQTT服务添加了 ${Object.keys(mqttValues).length} 个数据点`);
    } else {
      console.log('MQTT服务不可用，仅使用缓存数据');
    }
    
    console.log(`_getAllDataValuesFromMqtt - 最终返回 ${Object.keys(result).length} 个数据点值`);
    console.log(`最终结果键名:`, Object.keys(result));
    
    return result;
  }
  
  /**
   * 从Modbus服务获取所有数据点值
   * @param {boolean} forceRefresh 是否强制刷新
   * @returns {Object} 数据点值对象
   * @private
   */
  _getAllDataValuesFromModbus(forceRefresh = false) {
    console.log(`_getAllDataValuesFromModbus - 连接状态: ${this.isConnected}, ModbusTCP实例: ${this.modbusTCP ? '存在' : '不存在'}`);
    console.log(`_getAllDataValuesFromModbus - 内部缓存: ${this._dataCache ? '存在' : '不存在'}`);
    
    try {
      let result = {};
      
      // 首先从内部缓存获取数据（包括API写入的数据）
      // 这些数据优先级最高，因为可能包含最新的API写入数据
      if (this._dataCache) {
        console.log(`从内部缓存获取到 ${Object.keys(this._dataCache).length} 个数据点值`);
        console.log(`内部缓存键名:`, Object.keys(this._dataCache));
        
        for (const [name, dataValue] of Object.entries(this._dataCache)) {
          console.log(`处理缓存数据: ${name} = ${dataValue.value}`);
          result[name] = {
            value: dataValue.value,
            formatted: dataValue.formatted,
            timestamp: dataValue.timestamp,
            quality: dataValue.quality || 'GOOD',
            source: dataValue.source || 'cache'
          };
        }
        console.log(`从内部缓存添加了 ${Object.keys(result).length} 个数据点到结果中`);
      } else {
        console.log(`⚠️ 内部缓存不存在或为空`);
      }
      
      // 如果有ModbusTCP实例但未连接，也尝试从其dataValues获取数据
      if (this.modbusTCP && this.modbusTCP.dataValues) {
        console.log(`从ModbusTCP dataValues获取到 ${Object.keys(this.modbusTCP.dataValues).length} 个数据点值`);
        
        for (const [name, dataValue] of Object.entries(this.modbusTCP.dataValues)) {
          // 只有当result中还没有这个数据点时才添加（内部缓存优先）
          if (!result[name]) {
            result[name] = {
              value: dataValue.value,
              formatted: dataValue.formatted,
              timestamp: dataValue.timestamp,
              quality: dataValue.quality || 'GOOD',
              source: dataValue.source || 'modbus_cache'
            };
          }
        }
      }
      
      // 如果有ModbusTCP实例且已连接，获取实时数据
      if (this.modbusTCP && this.isConnected) {
        console.log('从已连接的ModbusTCP获取数据...');
        
        // 如果需要强制刷新，先读取数据点
        if (forceRefresh) {
          console.log('正在强制刷新数据点值...');
          const dataPoints = this.dataPointManager.getAllDataPoints();
          if (dataPoints && dataPoints.length > 0) {
            this.readDataPoints(dataPoints, true)
              .then(() => {
                console.log('数据点强制刷新成功');
              })
              .catch(error => {
                console.error('数据点强制刷新失败:', error);
            });
          }
        }
        
        // 获取ModbusTCP中的所有数据值
        const modbusValues = this.modbusTCP.getAllDataValues();
        console.log(`从ModbusTCP获取到 ${Object.keys(modbusValues).length} 个数据点值`);
        
        // 转换为前端需要的格式，但不覆盖缓存中的数据
        for (const [name, dataValue] of Object.entries(modbusValues)) {
          // 只有当result中还没有这个数据点时才添加（缓存数据优先）
          if (!result[name]) {
            result[name] = {
              value: dataValue.value,
              formatted: dataValue.formatted,
              timestamp: dataValue.timestamp,
              quality: 'GOOD',
              source: 'modbus'
            };
          }
        }
      } else {
        console.log('ModbusTCP未连接，使用缓存数据...');
      }
      
      console.log(`_getAllDataValuesFromModbus - 最终返回 ${Object.keys(result).length} 个数据点值`);
      console.log(`最终结果键名:`, Object.keys(result));
      
      // 如果没有任何数据，返回空对象而不是null
      return result;
      
    } catch (error) {
      console.error('获取数据点值时出错:', error);
      
      // 即使出错，也尝试返回缓存数据
      if (this._dataCache) {
        console.log('出错时从缓存返回数据...');
        const result = {};
        for (const [name, dataValue] of Object.entries(this._dataCache)) {
          result[name] = {
            value: dataValue.value,
            formatted: dataValue.formatted,
            timestamp: dataValue.timestamp,
            quality: dataValue.quality || 'GOOD',
            source: dataValue.source || 'cache'
          };
        }
        return result;
      }
      
      // 如果连缓存都没有，返回空对象
      return {};
    }
  }

  /**
   * 获取数据点当前值
   * @param {string} identifier - 数据点标识符
   * @returns {*} 数据点值
   */
  getDataValue(identifier) {
    if (!this.isConnected || !this.modbusTCP) {
      return null;
    }

    const dataPoint = this.dataPointManager.getDataPointByIdentifier(identifier);
    if (!dataPoint) {
      return null;
    }

    const values = this.modbusTCP.getAllDataValues();
    return values[dataPoint.name] || null;
  }

  /**
   * 写入数据点的值
   * @param {string} identifier 数据点标识符
   * @param {number|string} value 要写入的值
   * @returns {Promise<any>} 写入结果
   */
  async writeDataPointValue(identifier, value) {
    console.log(`===== ModbusService.writeDataPointValue 开始 =====`);
    console.log(`- 数据点ID: ${identifier}`);
    console.log(`- 写入值: ${value}`);
    
    // 获取数据点
    const dataPoint = this.dataPointManager.getDataPointByIdentifier(identifier);
    if (!dataPoint) {
      const errorMsg = `数据点"${identifier}"不存在`;
      console.error(`ModbusService.writeDataPointValue - ${errorMsg}`);
      
      this.communicationStats.failedWrites++;
      this.communicationStats.lastFailedCommunication = new Date().toISOString();
      this.communicationStats.errors.push({
        type: 'write',
        time: this.communicationStats.lastFailedCommunication,
        message: errorMsg,
        dataPoint: identifier
      });
      
      throw new Error(errorMsg);
    }
    
    // 检查数据点是否可写
    if (dataPoint.accessMode === 'read') {
      const errorMsg = `数据点"${identifier}"只读`;
      console.error(`ModbusService.writeDataPointValue - ${errorMsg}`);
      
      this.communicationStats.failedWrites++;
      this.communicationStats.lastFailedCommunication = new Date().toISOString();
      this.communicationStats.errors.push({
        type: 'write',
        time: this.communicationStats.lastFailedCommunication,
        message: errorMsg,
        dataPoint: identifier
      });
      
      throw new Error(errorMsg);
    }
    
    // 检查ModbusTCP实例是否存在
    if (!this.modbusTCP) {
      const errorMsg = `未连接到ModbusTCP实例`;
      console.error(`ModbusService.writeDataPointValue - ${errorMsg}`);
      
      this.communicationStats.failedWrites++;
      this.communicationStats.lastFailedCommunication = new Date().toISOString();
      this.communicationStats.errors.push({
        type: 'write',
        time: this.communicationStats.lastFailedCommunication,
        message: errorMsg,
        dataPoint: identifier
      });
      
      throw new Error(errorMsg);
    }
    
    let result = null;
    let retryCount = 0;
    const maxRetries = 2; // 最多尝试3次（包括第一次）
    let lastError = null;
    
    // 重试循环
    while (retryCount <= maxRetries) {
      try {
        // 根据数据格式选择不同的写入方法
        const format = dataPoint.format || 'UINT16';
        
        if (format === 'BIT') {
          console.log(`ModbusService.writeDataPointValue - 使用BIT格式写入${retryCount > 0 ? ` (重试 ${retryCount}/${maxRetries})` : ''}`);
          
          // 获取位位置
          const bitPosition = dataPoint.bitPosition !== undefined ? dataPoint.bitPosition : 0;
          console.log(`- 位位置: ${bitPosition}`);
          
          // 确保位值为0或1
          const bitValue = value === 1 || value === true || value === '1' ? 1 : 0;
          console.log(`- 写入位值: ${bitValue}`);
          
          // 1. 首先读取当前寄存器值
          console.log(`- 读取当前寄存器值，地址: ${dataPoint.address}`);
          
          // 创建一个临时事务ID用于读取当前寄存器值
          const readTransactionId = await this.modbusTCP.readHoldingRegisters(dataPoint.address, 1);
          console.log(`- 读取寄存器的事务ID: ${readTransactionId}`);
          
          // 创建一个Promise来等待读取结果
          const readResult = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              this.modbusTCP.removeListener('data', dataHandler);
              this.modbusTCP.removeListener('error', errorHandler);
              reject(new Error('读取当前寄存器值超时'));
            }, this.modbusTCP.timeout);
            
            const dataHandler = (response) => {
              if (response.transactionId === readTransactionId) {
                clearTimeout(timeout);
                this.modbusTCP.removeListener('data', dataHandler);
                this.modbusTCP.removeListener('error', errorHandler);
                resolve(response);
              }
            };
            
            const errorHandler = (error) => {
              if (error.transactionId === readTransactionId) {
                clearTimeout(timeout);
                this.modbusTCP.removeListener('data', dataHandler);
                this.modbusTCP.removeListener('error', errorHandler);
                reject(error);
              }
            };
            
            this.modbusTCP.on('data', dataHandler);
            this.modbusTCP.on('error', errorHandler);
          });
          
          if (!readResult || !readResult.values || readResult.values.length === 0) {
            throw new Error('读取当前寄存器值失败: 没有返回数据');
          }
          
          const currentRegisterValue = readResult.values[0];
          console.log(`- 当前寄存器值: ${currentRegisterValue} (0x${currentRegisterValue.toString(16).padStart(4, '0')})`);
          
          if (this.modbusTCP.registerToBinaryString) {
            console.log(`- 二进制表示: ${this.modbusTCP.registerToBinaryString(currentRegisterValue)}`);
          }
          
          // 2. 修改指定位的值
          const newRegisterValue = this.modbusTCP.setBitInRegister(currentRegisterValue, bitPosition, bitValue);
          console.log(`- 修改后的寄存器值: ${newRegisterValue} (0x${newRegisterValue.toString(16).padStart(4, '0')})`);
          
          if (this.modbusTCP.registerToBinaryString) {
            console.log(`- 修改后二进制表示: ${this.modbusTCP.registerToBinaryString(newRegisterValue)}`);
          }
          
          // 3. 写回修改后的寄存器值
          const writeTransactionId = await this.modbusTCP.writeSingleRegister(dataPoint.address, newRegisterValue);
          console.log(`- 写入事务ID: ${writeTransactionId}`);
          
          // 等待写入完成
          const writeResult = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              this.modbusTCP.removeListener('data', dataHandler);
              this.modbusTCP.removeListener('error', errorHandler);
              reject(new Error('写入寄存器值超时'));
            }, this.modbusTCP.timeout);
            
            const dataHandler = (response) => {
              if (response.transactionId === writeTransactionId) {
                clearTimeout(timeout);
                this.modbusTCP.removeListener('data', dataHandler);
                this.modbusTCP.removeListener('error', errorHandler);
                resolve(response);
              }
            };
            
            const errorHandler = (error) => {
              if (error.transactionId === writeTransactionId) {
                clearTimeout(timeout);
                this.modbusTCP.removeListener('data', dataHandler);
                this.modbusTCP.removeListener('error', errorHandler);
                reject(error);
              }
            };
            
            this.modbusTCP.on('data', dataHandler);
            this.modbusTCP.on('error', errorHandler);
          });
          
          console.log(`- 写入结果:`, writeResult);
          
          // 4. 构建完整的返回结果对象
          result = {
            success: true,
            format: 'BIT',
            address: dataPoint.address,
            bitPosition: bitPosition,
            bitValue: bitValue,
            originalRegisterValue: currentRegisterValue,
            newRegisterValue: newRegisterValue,
            registerValue: newRegisterValue, // 兼容旧版本代码
            binaryString: this.modbusTCP.registerToBinaryString ? 
                         this.modbusTCP.registerToBinaryString(newRegisterValue) : null,
            message: `成功写入位值 ${bitValue} 到寄存器 ${dataPoint.address} 的位置 ${bitPosition}`
          };
        }
        else if (format === 'INT32' || format === 'UINT32') {
          console.log(`ModbusService.writeDataPointValue - 使用32位格式写入: ${format}${retryCount > 0 ? ` (重试 ${retryCount}/${maxRetries})` : ''}`);
          result = await this._writeInt32Value(dataPoint.address, value, format);
        } else if (format === 'FLOAT32') {
          console.log(`ModbusService.writeDataPointValue - 使用浮点格式写入${retryCount > 0 ? ` (重试 ${retryCount}/${maxRetries})` : ''}`);
          result = await this._writeFloat32Value(dataPoint.address, value);
        } else {
          // INT16, UINT16或其他16位格式
          console.log(`ModbusService.writeDataPointValue - 使用16位格式写入: ${format}${retryCount > 0 ? ` (重试 ${retryCount}/${maxRetries})` : ''}`);
          result = await this._writeSingleRegisterValue(dataPoint.address, value, format);
        }
        
        console.log(`ModbusService.writeDataPointValue - 写入成功，结果:`, result);
        
        // 更新本地缓存的值
        dataPoint.value = value;
        
        // 记录成功的写入操作
        this.communicationStats.successfulWrites++;
        this.communicationStats.lastSuccessfulWrite = new Date().toISOString();
        
        // 发出写入成功事件
        this.emit('write', {
          dataPoint: identifier,
          value: value,
          result: result,
          timestamp: this.communicationStats.lastSuccessfulWrite
        });
        
        return result;
      } catch (error) {
        lastError = error;
        console.error(`ModbusService.writeDataPointValue - 写入失败(${retryCount + 1}/${maxRetries + 1}): ${error.message}`);
        
        // 如果还有重试次数，继续尝试
        if (retryCount < maxRetries) {
          console.log(`ModbusService.writeDataPointValue - 准备第 ${retryCount + 1} 次重试`);
          retryCount++;
        } else {
          // 记录失败的写入操作
          this.communicationStats.failedWrites++;
          this.communicationStats.lastFailedCommunication = new Date().toISOString();
          this.communicationStats.errors.push({
            type: 'write',
            time: this.communicationStats.lastFailedCommunication,
            message: error.message,
            dataPoint: identifier
          });
          
          // 发出写入失败事件
          this.emit('writeError', {
            dataPoint: identifier,
            value: value,
            error: error.message,
            timestamp: this.communicationStats.lastFailedCommunication
          });
          
          // 所有重试都失败，抛出最后一个错误
          console.error(`ModbusService.writeDataPointValue - 写入失败，已重试 ${maxRetries} 次:`);
          throw lastError;
        }
      }
    }
  }

  /**
   * 写入单个寄存器值
   * @private
   * @param {number} address 寄存器地址
   * @param {number} value 要写入的值
   * @param {string} format 数据格式 (INT16 或 UINT16)
   * @returns {Promise<boolean>} 写入成功返回true
   */
  async _writeSingleRegisterValue(address, value, format) {
    let registerValue;
    
    if (format === 'INT16') {
      // 有符号16位整数
      if (value < -32768 || value > 32767) {
        throw new Error(`数值 ${value} 超出INT16范围 (-32768 到 32767)`);
      }
      registerValue = Math.round(value) & 0xFFFF; // 转为16位无符号表示
    } else {
      // 无符号16位整数或默认格式
      if (value < 0 || value > 65535) {
        throw new Error(`数值 ${value} 超出UINT16范围 (0 到 65535)`);
      }
      registerValue = Math.round(value);
    }
    
    console.log(`写入单个寄存器，地址: ${address}，值: ${registerValue}`);
    await this.modbusTCP.writeSingleRegister(address, registerValue);
    return true;
  }

  /**
   * 写入32位整数值 (需要两个寄存器)
   * @private
   * @param {number} address 起始寄存器地址
   * @param {number} value 要写入的32位整数值
   * @param {string} format 数据格式 (INT32 或 UINT32)
   * @returns {Promise<boolean>} 写入成功返回true
   */
  async _writeInt32Value(address, value, format) {
    // 检查值范围
    if (format === 'INT32') {
      if (value < -2147483648 || value > 2147483647) {
        throw new Error(`数值 ${value} 超出INT32范围 (-2^31 到 2^31-1)`);
      }
    } else { // UINT32
      if (value < 0 || value > 4294967295) {
        throw new Error(`数值 ${value} 超出UINT32范围 (0 到 2^32-1)`);
      }
    }
    
    // 确保值是整数
    value = Math.round(value);
    
    // 将32位值拆分为两个16位寄存器值
    // 高位在前，低位在后 (大端序)
    const highWord = (value >> 16) & 0xFFFF;
    const lowWord = value & 0xFFFF;
    
    console.log(`写入32位整数，地址: ${address}，值: ${value}，高字: ${highWord}，低字: ${lowWord}`);
    
    // 写入两个寄存器
    await this.modbusTCP.writeMultipleRegisters(address, [highWord, lowWord]);
    return true;
  }

  /**
   * 写入32位浮点数值 (需要两个寄存器)
   * @private
   * @param {number} address 起始寄存器地址
   * @param {number} value 要写入的浮点数
   * @returns {Promise<boolean>} 写入成功返回true
   */
  async _writeFloat32Value(address, value) {
    // 创建一个缓冲区以进行IEEE-754格式转换
    const buffer = Buffer.alloc(4);
    buffer.writeFloatBE(value, 0);
    
    // 从缓冲区读取两个16位寄存器值
    const highWord = buffer.readUInt16BE(0);
    const lowWord = buffer.readUInt16BE(2);
    
    console.log(`写入32位浮点数，地址: ${address}，值: ${value}，IEEE-754格式: 高字: ${highWord}，低字: ${lowWord}`);
    
    // 写入两个寄存器
    await this.modbusTCP.writeMultipleRegisters(address, [highWord, lowWord]);
    return true;
  }

  /**
   * 格式化值（添加单位和应用缩放因子）
   * @private
   */
  _formatValue(value, format, scale = 1, unit = '') {
    if (value === null || value === undefined) return '无数据';
    
    // 应用缩放因子
    const scaledValue = value * scale;
    
    // 根据数据类型格式化
    let formattedValue;
    if (format === 'FLOAT32') {
      formattedValue = scaledValue.toFixed(2);
    } else {
      formattedValue = scaledValue.toString();
    }
    
    // 添加单位
    if (unit) {
      formattedValue += ' ' + unit;
    }
    
    return formattedValue;
  }

  /**
   * 批量读取数据点
   * @param {Array} dataPoints 要读取的数据点数组
   * @param {boolean} [forceRefresh=false] 是否强制刷新，即使数据已经存在
   * @returns {Promise<Array>} 读取结果数组
   */
  async readDataPoints(dataPoints, forceRefresh = false) {
    if (!Array.isArray(dataPoints) || dataPoints.length === 0) {
      return [];
    }

    const results = [];
    const errors = [];
    
    // 检查连接状态但不要中断操作
    if (!this.isConnected || !this.modbusTCP) {
      console.warn('ModbusService.readDataPoints - 当前未连接到Modbus服务器，但仍将尝试读取数据');
      // 不抛出错误，继续尝试读取，以便在连接恢复时能继续工作
    }
    
    // 使用批量处理机制，避免同时发出过多请求
    const batchSize = 8; // 每批处理的数据点数量，从3增加到8
    const delay = 200;   // 批次间的延迟时间(毫秒)，从100增加到200
    
    for (let i = 0; i < dataPoints.length; i += batchSize) {
      const batch = dataPoints.slice(i, i + batchSize);
      console.log(`ModbusService.readDataPoints - 处理第${i/batchSize + 1}批数据点，数量: ${batch.length}`);
      
      try {
        // 并行读取当前批次的数据点
        const batchPromises = batch.map(dataPoint => 
          this.readDataPoint(dataPoint)
            .then(result => {
              results.push(result);
              return result;
            })
            .catch(error => {
              console.error(`读取数据点 ${dataPoint.name || dataPoint.id}(${dataPoint.address}) 失败:`, error.message);
              errors.push({
                dataPoint: {
                id: dataPoint.id,
                name: dataPoint.name,
                  address: dataPoint.address
                },
                error: error.message,
                timestamp: new Date().toISOString()
              });
              
              // 返回带有错误标记的结果
              return {
                id: dataPoint.id,
                name: dataPoint.name || `DP_${dataPoint.address}`,
                address: dataPoint.address,
                value: null,
                rawValue: null,
                timestamp: new Date().toISOString(),
                quality: 'BAD',
                error: error.message
              };
            })
        );
      
      // 等待当前批次完成
      const batchResults = await Promise.all(batchPromises);
        
        // 如果不是最后一批，添加延迟
        if (i + batchSize < dataPoints.length) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        // 即使连接断开也继续处理剩余数据点
        /*
        if (!this.isConnected) {
          console.warn('ModbusService.readDataPoints - 批处理期间检测到连接已断开，中止后续读取操作');
          break;
        }
        */
        // 改为仅记录警告但继续执行
        if (!this.isConnected) {
          console.warn('ModbusService.readDataPoints - 批处理期间检测到连接已断开，但将继续尝试读取剩余数据点');
        }
      } catch (batchError) {
        console.error(`ModbusService.readDataPoints - 批处理错误:`, batchError.message);
        // 继续处理下一批，不中断操作
      }
    }
    
    // 如果出现错误，记录并返回成功的结果
    if (errors.length > 0) {
      console.warn(`ModbusService.readDataPoints - 成功读取 ${results.length} 个数据点，失败 ${errors.length} 个`);
      
      // 如果连续失败次数超过阈值，发出警告
      if (errors.length >= Math.ceil(dataPoints.length * 0.5)) { // 50%的错误率触发警告
        console.error(`ModbusService.readDataPoints - 大量数据点读取失败 (${errors.length}/${dataPoints.length})，可能存在连接问题`);
        
        // 增加连接失败计数，但不立即断开
        this.connectionFailureCount = (this.connectionFailureCount || 0) + 1;
        
        // 发出警告事件
        this.emit('batch_read_warning', {
          errorCount: errors.length,
          totalCount: dataPoints.length,
          errors: errors.slice(0, 3) // 只发送前3个错误
        });
      } else {
        // 错误率较低，重置失败计数
        this.connectionFailureCount = 0;
      }
    }
    
    return results.length > 0 ? results : errors;
  }

  /**
   * 读取单个数据点的值
   * @param {Object} dataPoint 数据点对象
   * @returns {Promise<Object>} 读取结果
   */
  async readDataPoint(dataPoint) {
    // 提取数据点属性并设置默认值
    const { 
      id, 
      name, 
      address, 
      type = 'holding', 
      dataType = 'int16', 
      scale = 1, 
      offset = 0,
      size = 1 // 对于32位值，可能需要读取2个寄存器
    } = dataPoint;
    
    const pointInfo = `${name || id}(${address})`;
    
    // 引入重试机制
    let retryCount = 0;
    const maxRetries = 2; // 最多重试2次
    let retryDelay = 200; // 初始重试延迟，每次重试后加倍
    
    while (retryCount <= maxRetries) {
    try {
        console.log(`ModbusService.readDataPoint - 读取数据点: ${pointInfo}, 类型: ${type}, 数据类型: ${dataType}, 大小: ${size}${retryCount > 0 ? `, 重试第${retryCount}次` : ''}`);
      
      let rawValue;
      let value;
      let quantity = size;
      let transactionId;
      
      // 确保quantity至少为1
      if (quantity < 1) quantity = 1;
      
      // 确保32位数据类型读取两个寄存器
      if (dataType === 'int32' || dataType === 'uint32' || dataType === 'float32' || dataType === 'double') {
        quantity = Math.max(quantity, 2);
      }
      
      // 根据寄存器类型选择读取方法
      const startTime = Date.now();
        
        // 检查连接状态
        if (!this.isConnected || !this.modbusTCP) {
          throw new Error('Modbus未连接');
        }
        
      switch (type.toLowerCase()) {
        case 'holding':
          transactionId = await this.modbusTCP.readHoldingRegisters(address, quantity);
          console.log(`ModbusService.readDataPoint - 获取到事务ID: ${transactionId}`);
          
          // 确保将事务ID保存到数据点中
          if (transactionId) {
            console.log(`ModbusService.readDataPoint - 将事务ID ${transactionId} 保存到数据点 ${name}`);
            
            // 更新内存中数据点的lastTransactionId
            dataPoint.lastTransactionId = transactionId;
            
            // 确保对应ModbusTCP中的数据点也更新
            const tcpDataPoint = this.modbusTCP.dataPoints.find(dp => dp.name === name);
            if (tcpDataPoint) {
              console.log(`ModbusService.readDataPoint - 更新ModbusTCP数据点的事务ID: ${transactionId}`);
              tcpDataPoint.lastTransactionId = transactionId;
            } else {
              console.warn(`ModbusService.readDataPoint - 未在ModbusTCP中找到数据点 ${name}`);
            }
          }
          
          // 设置超时等待响应
          await new Promise((resolve, reject) => {
              // 增加超时时间，尤其是在处理大量数据点时
              const timeoutDuration = this.modbusTCP.timeout * 2; // 增加到2倍的超时时间
              
            const timeout = setTimeout(() => {
              reject(new Error(`等待响应超时(${timeoutDuration}ms)`));
              }, timeoutDuration);
            
            // 监听数据事件
            const dataHandler = (response) => {
              if (response.transactionId === transactionId) {
                clearTimeout(timeout);
                this.modbusTCP.removeListener('data', dataHandler);
                this.modbusTCP.removeListener('error', errorHandler);
                rawValue = response.values;
                resolve();
              }
            };
            
            // 监听错误事件
            const errorHandler = (error) => {
              if (error.transactionId === transactionId) {
                clearTimeout(timeout);
                this.modbusTCP.removeListener('data', dataHandler);
                this.modbusTCP.removeListener('error', errorHandler);
                reject(error);
              }
            };
            
            this.modbusTCP.on('data', dataHandler);
            this.modbusTCP.on('error', errorHandler);
          });
          break;
          
        case 'input':
          transactionId = await this.modbusTCP.readInputRegisters(address, quantity);
          console.log(`ModbusService.readDataPoint - 获取到事务ID: ${transactionId}`);
          
          // 确保将事务ID保存到数据点中
          if (transactionId) {
            console.log(`ModbusService.readDataPoint - 将事务ID ${transactionId} 保存到数据点 ${name}`);
            dataPoint.lastTransactionId = transactionId;
            
            // 确保对应ModbusTCP中的数据点也更新
            const tcpDataPoint = this.modbusTCP.dataPoints.find(dp => dp.name === name);
            if (tcpDataPoint) {
              console.log(`ModbusService.readDataPoint - 更新ModbusTCP数据点的事务ID: ${transactionId}`);
              tcpDataPoint.lastTransactionId = transactionId;
            }
          }
          
          // 设置超时等待响应
          await new Promise((resolve, reject) => {
              // 增加超时时间，尤其是在处理大量数据点时
              const timeoutDuration = this.modbusTCP.timeout * 2; // 增加到2倍的超时时间
              
            const timeout = setTimeout(() => {
              reject(new Error(`等待响应超时(${timeoutDuration}ms)`));
              }, timeoutDuration);
            
            // 监听数据事件
            const dataHandler = (response) => {
              if (response.transactionId === transactionId) {
                clearTimeout(timeout);
                this.modbusTCP.removeListener('data', dataHandler);
                this.modbusTCP.removeListener('error', errorHandler);
                rawValue = response.values;
                resolve();
              }
            };
            
            // 监听错误事件
            const errorHandler = (error) => {
              if (error.transactionId === transactionId) {
                clearTimeout(timeout);
                this.modbusTCP.removeListener('data', dataHandler);
                this.modbusTCP.removeListener('error', errorHandler);
                reject(error);
              }
            };
            
            this.modbusTCP.on('data', dataHandler);
            this.modbusTCP.on('error', errorHandler);
          });
          break;
          
        // 其他类型的处理...
        case 'coil':
          rawValue = await this.modbusTCP.readCoil(address, quantity);
          break;
        case 'discrete':
          rawValue = await this.modbusTCP.readDiscreteInput(address, quantity);
          break;
        default:
          throw new Error(`不支持的寄存器类型: ${type}`);
      }
      
      const readTime = Date.now() - startTime;
      
      // 检查返回值是否有效
      if (rawValue === undefined || rawValue === null) {
        throw new Error('Modbus返回空值');
      }
      
      // 根据数据类型进行转换
      try {
        value = this._convertValueByDataType(rawValue, dataType);
      } catch (convertError) {
        console.error(`ModbusService.readDataPoint - 数据类型转换错误: ${convertError.message}`);
        throw new Error(`数据类型转换错误: ${convertError.message}`);
      }
      
      // 应用比例和偏移
      if (dataType !== 'bool' && dataType !== 'string') {
        try {
          value = value * scale + offset;
        } catch (calcError) {
          console.error(`ModbusService.readDataPoint - 应用缩放因子时发生错误: ${calcError.message}`);
          throw new Error(`应用缩放因子错误: ${calcError.message}`);
        }
      }
      
      // 创建结果对象
      const result = {
        id,
        name,
        address,
        value,
        rawValue,
        timestamp: new Date().toISOString(),
        quality: 'GOOD',
        readTimeMs: readTime,
        type: type,
        dataType: dataType,
        transactionId: transactionId // 添加事务ID到结果中
      };
      
      console.log(`ModbusService.readDataPoint - 成功读取数据点 ${pointInfo}, 值: ${value}, 事务ID: ${transactionId}, 耗时: ${readTime}ms`);
      return result;
      
    } catch (error) {
      console.error(`ModbusService.readDataPoint - 读取数据点 ${pointInfo} 失败:`, error.message);
        
        // 如果还有重试次数，则重试
        if (retryCount < maxRetries) {
          retryCount++;
          console.log(`ModbusService.readDataPoint - 将重试读取数据点 ${pointInfo}，第${retryCount}次重试...，延迟${retryDelay}ms`);
          // 使用指数退避算法，延迟后重试
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          // 每次重试后增加延迟时间
          retryDelay *= 2;
          continue;
        }
      
      // 检查是否是连接相关的错误
      if (error.message.includes('连接') || 
          error.message.includes('断开') || 
          error.message.includes('超时') ||
          error.message.includes('connection') ||
          error.message.includes('timeout')) {
        
          // 更新连接状态标记，但不要立即中断所有操作
          // 修改为仅标记问题，而不是立即调用重连和停止轮询
          this._handleConnectionWarning(error);
      }
      
      // 增强错误信息
      let detailedError = new Error(`读取数据点 ${pointInfo} 失败: ${error.message}`);
      detailedError.originalError = error;
      detailedError.dataPoint = {
        id,
        name,
        address,
        type,
        dataType
      };
      
      throw detailedError;
      }
    }
  }
  
  /**
   * 处理连接警告 - 轻量级版本，不会立即停止轮询
   * @private
   */
  _handleConnectionWarning(error) {
    console.warn('ModbusService._handleConnectionWarning - 检测到潜在连接问题:', error.message);
    
    // 记录错误，但不立即中断连接状态
    this.lastConnectionWarning = {
      message: error.message,
      time: new Date().toISOString()
    };
    
    // 增加失败计数，如果连续失败达到阈值，才执行断开操作
    this.connectionFailureCount = (this.connectionFailureCount || 0) + 1;
    
    // 如果连续失败次数超过阈值，则执行断开逻辑
    if (this.connectionFailureCount >= 5) { // 5次连续失败才认为连接真的有问题
      console.error('ModbusService - 连续5次读取失败，执行断开处理');
      this._handleConnectionError(error);
      this.connectionFailureCount = 0; // 重置计数
    }
  }
  
  /**
   * 根据数据类型转换Modbus返回的值
   * @private
   * @param {any} value 原始值
   * @param {string} dataType 数据类型
   * @returns {any} 转换后的值
   */
  _convertValueByDataType(value, dataType) {
    if (value === null || value === undefined) {
      return null;
    }
    
    switch (dataType.toLowerCase()) {
      case 'int16':
        return this._convertToInt16(value);
      case 'uint16':
        return value;
      case 'int32':
        return this._convertToInt32(value);
      case 'uint32':
        return value;
      case 'float':
        return this._convertToFloat(value);
      case 'double':
        return this._convertToDouble(value);
      case 'bool':
        return !!value;
      case 'string':
        return String(value);
      default:
        return value;
    }
  }
  
  /**
   * 将无符号16位转换为有符号整数
   * @private
   */
  _convertToInt16(value) {
    const val = value & 0xFFFF;
    return val > 0x7FFF ? val - 0x10000 : val;
  }
  
  /**
   * 将两个无符号16位转换为有符号32位整数
   * @private
   */
  _convertToInt32(value) {
    if (Array.isArray(value) && value.length >= 2) {
      const val = (value[0] << 16) | (value[1] & 0xFFFF);
      return val > 0x7FFFFFFF ? val - 0x100000000 : val;
    }
    return value;
  }
  
  /**
   * 将两个寄存器值转换为浮点数
   * @private
   */
  _convertToFloat(value) {
    if (Array.isArray(value) && value.length >= 2) {
      const buf = Buffer.alloc(4);
      buf.writeUInt16BE(value[0], 0);
      buf.writeUInt16BE(value[1], 2);
      return buf.readFloatBE(0);
    }
    return value;
  }
  
  /**
   * 将四个寄存器值转换为双精度浮点数
   * @private
   */
  _convertToDouble(value) {
    if (Array.isArray(value) && value.length >= 4) {
      const buf = Buffer.alloc(8);
      buf.writeUInt16BE(value[0], 0);
      buf.writeUInt16BE(value[1], 2);
      buf.writeUInt16BE(value[2], 4);
      buf.writeUInt16BE(value[3], 6);
      return buf.readDoubleBE(0);
    }
    return value;
  }
  
  /**
   * 处理连接错误
   * @private
   */
  _handleConnectionError(error) {
    console.error('ModbusService._handleConnectionError - 检测到连接问题:', error.message);
    
    // 只有在确认连接状态正常时才标记断开
    if (this.isConnected) {
      console.log('ModbusService._handleConnectionError - 当前连接状态为已连接，将标记为断开');
    this.isConnected = false;
    
      // 发送连接断开事件
      this.emit('connection_lost', {
        time: new Date().toISOString(),
        reason: error.message
      });
    } else {
      console.log('ModbusService._handleConnectionError - 当前连接状态已经是断开');
    }
    
    // 只有在需要自动重连且当前没有重连计划时才安排重连
    if (this.config && this.config.autoReconnect) {
      // 检查是否已经有重连计划
      if (this.reconnectTimer) {
        console.log('ModbusService._handleConnectionError - 已经存在重连计划，不再创建新的');
      } else {
      console.log('ModbusService._handleConnectionError - 自动重连已启用，将尝试重新连接');
        
        // 注释掉停止轮询的代码，保持轮询状态
        /* 
        if (this.pollingTimer) {
          console.log('ModbusService._handleConnectionError - 轮询正在进行，将暂停轮询');
          this.stopPolling();
        }
        */
        console.log('ModbusService._handleConnectionError - 轮询将继续进行，即使连接断开');
        
        // 延迟一段时间后再重新连接，避免频繁重连
      this.scheduleReconnect();
    }
    } else {
      console.log('ModbusService._handleConnectionError - 自动重连未启用，不会尝试重新连接');
    }
    
    // 重置连续失败计数
    this.connectionFailureCount = 0;
  }

  /**
   * 设置Modbus TCP连接的事件监听器
   * @private
   */
  setupConnectionListeners() {
    console.log('ModbusService - 设置连接事件监听器');
    
    if (!this.modbusTCP) {
      console.error('ModbusService - 无法设置监听器，ModbusTCP实例不存在');
      return;
    }

    // 清除之前的监听器（如果存在）
    this.modbusTCP.removeAllListeners('connected');
    this.modbusTCP.removeAllListeners('disconnected');
    this.modbusTCP.removeAllListeners('error');
    this.modbusTCP.removeAllListeners('timeout');
    this.modbusTCP.removeAllListeners('data-update');
    this.modbusTCP.removeAllListeners('alarm');
    this.modbusTCP.removeAllListeners('alarmCleared');
    
    // 连接事件
    this.modbusTCP.on('connected', () => {
      console.log('ModbusService - Modbus TCP已连接');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      // 发送连接事件
      this.emit('connected', {
        host: this.modbusTCP.host,
        port: this.modbusTCP.port,
        unitId: this.modbusTCP.unitId,
        time: new Date().toISOString()
        });
      });

    // 断开连接事件
    this.modbusTCP.on('disconnected', () => {
      console.log('ModbusService - Modbus TCP已断开连接');
      this.isConnected = false;
      
      // 发送断开连接事件
      this.emit('disconnected', {
        time: new Date().toISOString()
      });

      // 如果设置了自动重连且不是手动断开，则安排重连
      if (this.config.autoReconnect && !this.manualDisconnect) {
        console.log('ModbusService - 自动重连已启用，安排重新连接');
        this.scheduleReconnect();
      }
    });

    // 错误事件
    this.modbusTCP.on('error', (error) => {
      console.error(`ModbusService - Modbus TCP错误:`, error);
      
      // 使用专门的错误处理函数
      this._handleConnectionError(error);
    });
    
    // 超时事件
    this.modbusTCP.on('timeout', (info) => {
      console.warn(`ModbusService - Modbus TCP超时: ${info.type || 'unknown'}`);
      
      // 对超时情况发出警告事件
      this._handleConnectionWarning({
        message: `通信超时: ${info.type || 'unknown'}`,
        time: new Date().toISOString(),
        code: 'TIMEOUT',
        details: info
      });
    });

    console.log('ModbusService - 已设置连接事件监听器');

    // 监听数据更新
    this.modbusTCP.on('data-update', (data) => {
      // 将modbusTCP的数据更新事件转发出来，以便其他服务(如数据库服务)可以监听
      this.emit('dataUpdate', data.name, {
        value: data.value,
        formattedValue: data.formatted,
        quality: 'GOOD',
        readTime: 0,
        timestamp: data.timestamp,
        rawValue: data.format === 'BIT' ? data.bitData.registerValue : null
      });
      
      console.log(`ModbusService - 发射数据更新事件: ${data.name} = ${data.value}`);
    });
    
    // 监听告警事件
    this.modbusTCP.on('alarm', async (alarmData) => {
      console.log(`ModbusService - 捕获告警事件:`, alarmData);
      
      // 不在事件监听器中存储告警，由API路由处理器负责
      console.log('ModbusService - 只转发告警事件，不执行数据库操作');
      
      // 转发告警事件
      this.emit('alarm', alarmData);
    });
    
    // 监听告警清除事件
    this.modbusTCP.on('alarmCleared', async (alarmData) => {
      console.log(`ModbusService - 捕获告警清除事件:`, alarmData);
      
      // 移除数据库操作代码，只转发事件
      console.log('ModbusService - 只转发告警清除事件，不执行数据库操作');
      
      // 转发告警清除事件
      this.emit('alarmCleared', alarmData);
    });
  }

  /**
   * 获取系统网络接口信息
   * @returns {Object} 网络接口信息
   */
  getNetworkInterfaces() {
    try {
      const os = require('os');
      const interfaces = os.networkInterfaces();
      const result = {};
      
      // 处理每个网络接口
      for (const [name, addresses] of Object.entries(interfaces)) {
        if (!result[name]) {
          result[name] = [];
        }
        
        // 处理每个地址
        for (const address of addresses) {
          // 只保留有用信息
          result[name].push({
            family: address.family,
            address: address.address,
            netmask: address.netmask,
            internal: address.internal,
            cidr: address.cidr
          });
        }
      }
      
      return result;
    } catch (error) {
      console.error('获取网络接口信息失败:', error);
      return { error: error.message };
    }
  }

  /**
   * 获取系统和网络诊断信息
   * @returns {Object} 诊断信息
   */
  getSystemDiagnostics() {
    try {
      const os = require('os');
      return {
        os: {
          platform: process.platform,
          release: os.release(),
          type: os.type(),
          arch: os.arch()
        },
        memory: {
          total: os.totalmem(),
          free: os.freemem(),
          usedPercent: ((1 - os.freemem() / os.totalmem()) * 100).toFixed(2) + '%'
        },
        uptime: {
          system: os.uptime(),
          process: process.uptime()
        },
        network: this.networkInterfaces,
        nodeVersion: process.version,
        modbusConfig: {
          host: this.config.host,
          port: this.config.port,
          unitId: this.config.unitId,
          timeout: this.config.timeout
        }
      };
    } catch (error) {
      console.error('获取系统诊断信息失败:', error);
      return { error: error.message };
    }
  }

  /**
   * 获取当前连接配置
   * @returns {Object} 当前连接配置
   */
  getConnectionConfig() {
    return {
      host: this.config.host,
      port: this.config.port,
      unitId: this.config.unitId,
      timeout: this.config.timeout,
      reconnect: this.config.reconnect,
      reconnectInterval: this.config.reconnectInterval,
      maxReconnectAttempts: this.config.maxReconnectAttempts,
      keepAlive: {
        enabled: this.config.keepAliveEnabled,
        interval: this.config.keepAliveInterval,
        address: this.config.keepAliveAddress,
        functionCode: this.config.keepAliveFunctionCode
      }
    };
  }

  /**
   * 更新保活配置
   * @param {Object} keepAliveConfig 保活配置
   * @param {boolean} [keepAliveConfig.enabled] 是否启用保活
   * @param {number} [keepAliveConfig.interval] 保活间隔(毫秒)
   * @param {number} [keepAliveConfig.address] 保活寄存器地址
   * @param {number} [keepAliveConfig.functionCode] 保活功能码 (3=读保持寄存器, 4=读输入寄存器)
   * @returns {Object} 更新后的保活配置
   */
  updateKeepAliveConfig(keepAliveConfig) {
    this.log('更新保活配置:', keepAliveConfig);
    
    // 更新配置管理器中的保活配置
    this.configManager.updateKeepAliveConfig(keepAliveConfig);
    
    // 更新服务配置
    if (keepAliveConfig.enabled !== undefined) this.config.keepAliveEnabled = keepAliveConfig.enabled;
    if (keepAliveConfig.interval !== undefined) this.config.keepAliveInterval = keepAliveConfig.interval;
    if (keepAliveConfig.address !== undefined) this.config.keepAliveAddress = keepAliveConfig.address;
    if (keepAliveConfig.functionCode !== undefined) this.config.keepAliveFunctionCode = keepAliveConfig.functionCode;
    
    // 如果连接已建立，更新当前连接的保活配置
    if (this.modbus && this.connected) {
      const updatedConfig = this.modbus.updateKeepAliveConfig({
        enabled: this.config.keepAliveEnabled,
        interval: this.config.keepAliveInterval,
        address: this.config.keepAliveAddress,
        functionCode: this.config.keepAliveFunctionCode
      });
      
      this.log('已更新Modbus连接的保活配置:', updatedConfig);
    } else {
      this.log('Modbus连接未建立，保存的保活配置将在下次连接时生效');
    }
    
    return {
      enabled: this.config.keepAliveEnabled,
      interval: this.config.keepAliveInterval,
      address: this.config.keepAliveAddress,
      functionCode: this.config.keepAliveFunctionCode
    };
  }

  /**
   * 获取当前保活配置
   * @returns {Object} 当前保活配置
   */
  getKeepAliveConfig() {
    this.log('获取保活配置');
    
    return {
      enabled: this.config.keepAliveEnabled,
      interval: this.config.keepAliveInterval,
      address: this.config.keepAliveAddress,
      functionCode: this.config.keepAliveFunctionCode,
      status: {
        active: this.modbus ? !!this.modbus.keepAliveTimer : false,
        lastKeepAliveTime: this.lastKeepAliveTime || null,
        lastKeepAliveResult: this.lastKeepAliveResult || null
      }
    };
  }

  /**
   * 手动发送保活请求
   * @returns {Promise<Object>} 保活请求的结果
   */
  async sendKeepAliveRequest() {
    this.log('手动发送保活请求');
    
    if (!this.modbus || !this.connected) {
      const error = new Error('无法发送保活请求：未连接到Modbus服务器');
      this.log(error.message);
      throw error;
    }
    
    try {
      this.log(`发送保活请求到地址 ${this.config.keepAliveAddress}，功能码 ${this.config.keepAliveFunctionCode}`);
      
      let response;
      const startTime = Date.now();
      
      // 根据功能码发送不同类型的保活请求
      if (this.config.keepAliveFunctionCode === 3) {
        // 读保持寄存器
        response = await this.modbus.readHoldingRegisters(this.config.keepAliveAddress, 1);
      } else if (this.config.keepAliveFunctionCode === 4) {
        // 读输入寄存器
        response = await this.modbus.readInputRegisters(this.config.keepAliveAddress, 1);
      } else if (this.config.keepAliveFunctionCode === 1) {
        // 读线圈
        response = await this.modbus.readCoils(this.config.keepAliveAddress, 1);
      } else if (this.config.keepAliveFunctionCode === 2) {
        // 读离散输入
        response = await this.modbus.readDiscreteInputs(this.config.keepAliveAddress, 1);
      } else {
        throw new Error(`不支持的保活功能码: ${this.config.keepAliveFunctionCode}`);
      }
      
      const duration = Date.now() - startTime;
      
      // 保存保活结果
      this.lastKeepAliveTime = new Date().toISOString();
      this.lastKeepAliveResult = {
        success: true,
        duration,
        response
      };
      
      this.log('保活请求成功', this.lastKeepAliveResult);
      
      // 发出保活成功事件
      this.emit('keepAliveSuccess', this.lastKeepAliveResult);
      
      return this.lastKeepAliveResult;
    } catch (error) {
      // 保存保活结果
      this.lastKeepAliveTime = new Date().toISOString();
      this.lastKeepAliveResult = {
        success: false,
        error: error.message,
        details: error
      };
      
      this.log('保活请求失败', error);
      
      // 发出保活失败事件
      this.emit('keepAliveError', error);
      
      // 如果是因为连接问题导致的，可能需要重连
      if (error.message && (
          error.message.includes('超时') || 
          error.message.includes('Timed out') || 
          error.message.includes('连接已关闭') || 
          error.message.includes('Connection closed'))) {
        this._handleConnectionError(error);
      }
      
      throw error;
    }
  }

  /**
   * 连接成功后初始化数据点
   * @private
   */
  _initializeDataPoints() {
    if (!this.isConnected || !this.modbusTCP) {
      console.warn('ModbusService._initializeDataPoints - 未连接到Modbus服务器，无法初始化数据点');
      return;
    }
    
    // 获取所有数据点
    const dataPoints = this.dataPointManager.getAllDataPoints();
    if (!dataPoints || dataPoints.length === 0) {
      console.warn('ModbusService._initializeDataPoints - 没有配置数据点');
      return;
    }
    
    console.log(`ModbusService._initializeDataPoints - 开始初始化 ${dataPoints.length} 个数据点`);
    
    // 临时禁用ModbusTCP中的自动轮询，确保添加数据点不会触发轮询
    const originalAutoStartPolling = this.modbusTCP.autoStartPolling;
    this.modbusTCP.autoStartPolling = false;
    console.log(`ModbusService._initializeDataPoints - 确保ModbusTCP.autoStartPolling = false`);
    
    // 向ModbusTCP添加数据点
    let addedCount = 0;
    dataPoints.forEach((dataPoint) => {
      // 只添加可读数据点
      if (dataPoint.accessMode === 'read' || dataPoint.accessMode === 'readwrite') {
        if (this.modbusTCP.addDataPoint(dataPoint)) {
          addedCount++;
        }
      }
    });
    
    console.log(`ModbusService._initializeDataPoints - 成功初始化 ${addedCount} 个数据点`);
    console.log(`ModbusService._initializeDataPoints - 完成数据点初始化，轮询将由ModbusService.startPolling控制`);
  }

  /**
   * 获取当前告警状态
   * @returns {Object} 当前的告警状态，包含activeAlarms和alarmFirstTriggerTime
   */
  getAlarmState() {
    if (!this.modbusTCP) {
      return { 
        activeAlarms: [], 
        alarmFirstTriggerTime: {},
        isPlaying: false
      };
    }
    
    // 如果modbusTCP有alarmPlayingState属性，直接返回
    if (this.modbusTCP.alarmPlayingState) {
      return this.modbusTCP.alarmPlayingState;
    }
    
    // 如果没有，返回一个默认的告警状态
    return { 
      activeAlarms: [], 
      alarmFirstTriggerTime: {},
      isPlaying: false 
    };
  }

  /**
   * 获取ModbusTCP实例
   * @returns {Object|null} ModbusTCP实例，如果不存在则返回null
   */
  getModbusTCP() {
    return this.modbusTCP || null;
  }

  /**
   * 强制断开当前Modbus连接
   * 不会触发自动重连
   * @returns {Promise<{success: boolean, message: string}>} 操作结果
   */
  async forceDisconnect() {
    console.log('ModbusService - 强制断开连接');
    
    // 标记为手动断开，防止自动重连
    this.manualDisconnect = true;
    
    // 清除重连定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      console.log('ModbusService - 已取消重连计划');
    }
    
    // 直接清除轮询定时器，无论isPolling状态如何
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
      console.log('ModbusService - 已直接清除轮询定时器');
    }
    
    // 停止轮询（更新状态和配置）
    this.isPolling = false;
    this.configManager.updatePollingConfig({ enabled: false });
    console.log('ModbusService - 已停止轮询并更新配置');
    
    // 如果没有ModbusTCP实例或已经断开，直接返回成功
    if (!this.modbusTCP || !this.modbusTCP.connected) {
      console.log('ModbusService - 连接已经断开或不存在');
      return { success: true, message: '连接已经断开或不存在' };
    }
    
    try {
      // 断开连接
      await this.modbusTCP.disconnect();
      console.log('ModbusService - 连接已成功断开');
      
      // 更新连接状态
      this.isConnected = false;
      
      // 发出已断开事件
      this.emit('disconnected', {
        host: this.config.host,
        port: this.config.port,
        time: new Date().toISOString(),
        reason: 'manual'
      });
      
      return { success: true, message: '连接已成功断开' };
    } catch (error) {
      const errorMsg = `强制断开连接时发生错误: ${error.message}`;
      console.error(`ModbusService - ${errorMsg}`);
      
      // 即使发生错误，我们仍将连接标记为已断开
      this.isConnected = false;
      
      // 发出错误事件
      this.emit('error', {
        type: 'disconnect',
        message: errorMsg,
        stack: error.stack,
        time: new Date().toISOString()
      });
      
      return { success: false, message: errorMsg };
    } finally {
      // 清理资源
      this.modbusTCP = null;
    }
  }

  /**
   * 获取最小建议轮询间隔信息
   * @returns {Object} 包含数据点数量和最小建议轮询间隔的对象
   */
  getMinPollingIntervalInfo() {
    // 获取所有数据点
    const dataPoints = this.dataPointManager.getAllDataPoints();
    const dataPointCount = dataPoints ? dataPoints.length : 0;
    
    // 计算最小建议轮询间隔
    const minRecommendedInterval = this._calculateMinPollingInterval(dataPointCount);
    
    // 获取当前配置的轮询间隔
    const currentInterval = this.configManager.getPollingConfig().interval || 5000;
    
    // 判断当前间隔是否合适
    const isCurrentIntervalSufficient = currentInterval >= minRecommendedInterval;
    
    return {
      dataPointCount,
      minRecommendedInterval,
      currentInterval,
      isCurrentIntervalSufficient,
      // 计算200个数据点的情况下的建议间隔，作为参考
      referenceFor200Points: this._calculateMinPollingInterval(200)
    };
  }

  /**
   * 初始化MQTT数据点订阅
   * @private
   */
  _initializeMqttDataPoints() {
    if (!this.mqttService || !this.isConnected) {
      console.log('MQTT服务未连接，无法初始化数据点订阅');
      return;
    }
    
    console.log('初始化MQTT数据点订阅...');
    
    // 获取所有数据点
    const dataPoints = this.dataPointManager.getAllDataPoints();
    
    if (!dataPoints || dataPoints.length === 0) {
      console.log('没有数据点需要订阅');
      return;
    }
    
    console.log(`准备订阅 ${dataPoints.length} 个数据点的MQTT主题`);
    
    // 为每个数据点创建MQTT主题并订阅
    dataPoints.forEach(dataPoint => {
      // 确保有标识符
      if (!dataPoint.identifier) {
        dataPoint.identifier = dataPoint.name || `dp_${dataPoint.address}`;
      }
      
      // 添加到MQTT服务
      this.mqttService.addDataPoint({
        identifier: dataPoint.identifier,
        topic: `data/modbus/${dataPoint.identifier}`,
        format: dataPoint.format,
        scale: dataPoint.scale,
        unit: dataPoint.unit,
        alarmEnabled: dataPoint.alarmEnabled,
        alarmType: dataPoint.alarmType,
        alarmContent: dataPoint.alarmContent
      });
    });
    
    console.log('MQTT数据点订阅初始化完成');
  }

  /**
   * 设置资源监控
   * @private
   */
  _setupResourceMonitoring() {
    // 监控间隔（10分钟）
    const monitorInterval = 10 * 60 * 1000;
    
    // 设置定时器，定期检查和清理资源
    this.resourceMonitorTimer = setInterval(() => {
      try {
        // 记录当前内存使用情况
        const memoryUsage = process.memoryUsage();
        console.log('内存使用情况:', {
          rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
          heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`, 
          heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
          external: `${Math.round(memoryUsage.external / 1024 / 1024)} MB`
        });
        
        // 检查活跃的事件监听器数量
        if (this._activeListeners && this._activeListeners.size > 0) {
          console.log(`活跃的事件监听器数量: ${this._activeListeners.size}`);
        }
        
        // 执行垃圾回收（注意：这只是建议，不是强制的）
        if (global.gc) {
          console.log('执行垃圾回收...');
          global.gc();
        }
      } catch (error) {
        console.error('资源监控过程中发生错误:', error);
      }
    }, monitorInterval);
    
    console.log('资源监控已设置，间隔:', monitorInterval, 'ms');
  }
  
  /**
   * 清理所有定时器和资源
   * @private
   */
  _cleanup() {
    // 清理轮询定时器
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    
    // 清理重连定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // 清理资源监控定时器
    if (this.resourceMonitorTimer) {
      clearInterval(this.resourceMonitorTimer);
      this.resourceMonitorTimer = null;
    }
    
    console.log('ModbusService - 所有定时器已清理');
  }
}

// 单例模式
let instance = null;

module.exports = {
  getInstance: () => {
    if (!instance) {
      instance = new ModbusService();
    }
    return instance;
  }
};
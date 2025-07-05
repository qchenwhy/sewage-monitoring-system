const net = require('net');
const EventEmitter = require('events');

class ModbusTCP extends EventEmitter {
  constructor(hostOrConfig, port, unitId = 1, timeout = 5000, options = {}) {
    super();
    
    // 支持对象形式的参数
    if (typeof hostOrConfig === 'object' && hostOrConfig !== null) {
      // 从对象中解构参数
      const config = hostOrConfig;
      this.host = config.host;
      this.port = config.port;
      this.unitId = config.unitId || 1;
      this.timeout = config.timeout || 10000; // 默认增加到10秒
      options = config; // 将整个config作为options，包含其他额外属性
    } else {
      // 传统的参数形式
      this.host = hostOrConfig; // 第一个参数是host
      this.port = port;
      this.unitId = unitId;
      this.timeout = timeout;
    }
    
    // 设置最大事件监听器数量，避免内存泄漏警告
    this.setMaxListeners(20);
    
    // Socket连接
    this.socket = null;
    this.connected = false;
    
    // 事务ID
    this.transactionId = 1;
    
    // 轮询设置
    this.pollingInterval = options.pollingInterval || 1000; // 默认轮询间隔1秒
    this.pollingTimer = null;
    this.dataPoints = []; // 存储数据点配置
    this.dataValues = {}; // 存储数据点值
    this.autoStartPolling = options.autoStartPolling === true; // 默认禁用自动轮询，除非明确指定为true
    console.log(`ModbusTCP构造函数 - autoStartPolling=${this.autoStartPolling}`);
    
    // 保活设置
    this.keepAliveEnabled = options.keepAliveEnabled !== undefined ? options.keepAliveEnabled : true;
    this.keepAliveTimer = null;
    this.keepAliveTimeout = 5000; // 5s timeout for keep-alive
    this.keepAliveInterval = options.keepAliveInterval || 10000; // 10s
    this.keepAliveAddress = options.keepAliveAddress !== undefined ? options.keepAliveAddress : 0;
    this.keepAliveFunctionCode = options.keepAliveFunctionCode || 3; // 默认使用读保持寄存器
    
    // 重连设置
    this.autoReconnect = options.autoReconnect || false;
    this.reconnectDelay = options.reconnectDelay || 5000;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
    
    // 错误跟踪
    this.lastErrorCode = null;
    this.lastErrorMessage = null;
    this.lastErrorTime = null;
    
    // 状态标志
    this.connecting = false;
    this.polling = false;
    
    // 初始化告警状态对象
    this.alarmPlayingState = {
      isPlaying: false,       // 是否正在播放告警
      activeAlarms: [],       // 当前活动的告警列表
      lastAlarmStates: {},    // 记录上一次告警状态 {identifier: {value: 0/1, triggered: true/false}}
      loopCounter: 0,         // 循环计数
      paused: false,          // 告警是否被暂停
      alarmCount: 0,          // 告警触发次数
      nextAlarmTime: null,    // 下次告警时间
      alarmHistory: [],       // 告警历史记录
      alarmFirstTriggerTime: {} // 记录每个告警首次触发时间
    };
    
    // 添加错误处理器以防止未处理错误导致崩溃
    this.on('error', (err) => {
      console.error('ModbusTCP错误已捕获:', err);
      // 错误已被处理，不会再向上传播
    });

    this.client = null;
    this.pendingRequests = new Map();
    
    if (options.debug) {
      this.on('error', (err) => {
        console.error(`[ModbusTCP] Error event: ${err.message}`);
      });
    }
  }

  /**
   * 连接到Modbus TCP服务器
   * @returns {Promise<boolean>} 连接成功返回 true
   */
  connect() {
    console.log(`===== ModbusTCP.connect开始: ${this.host}:${this.port} =====`);
    
    // 检查必要的连接参数
    if (!this.host || !this.port) {
      const errorMsg = `连接参数无效 - 主机: ${this.host}, 端口: ${this.port}`;
      console.error(`ModbusTCP.connect: ${errorMsg}`);
      return Promise.reject(new Error(errorMsg));
    }
    
    // 如果已连接，先断开
    if (this.connected && this.socket) {
      console.log(`ModbusTCP.connect: 已存在连接，先断开现有连接`);
      this.socket.destroy();
      this.socket = null;
      this.connected = false;
    }

    return new Promise((resolve, reject) => {
      try {
        console.log(`ModbusTCP.connect: 创建新的Socket连接`);
        
        // 创建新Socket
        this.socket = new net.Socket();
        
        // 设置连接超时（仅用于建立连接），后续会禁用Socket自带的超时检测
        this.socket.setTimeout(this.timeout);
        console.log(`ModbusTCP.connect: 设置Socket超时时间: ${this.timeout}ms (仅用于建立连接)`);
        
        // 连接成功的处理函数
        const connectHandler = () => {
          console.log(`ModbusTCP.connect: Socket连接成功`);
          
          // 只能连接一次，所以移除处理函数
          this.socket.removeListener('error', errorHandler);
          
          // 设置状态为已连接
          this.connected = true;
          console.log(`ModbusTCP.connect: 设置connected=true`);
          
          // 初始化最后活动时间
          this.lastActivityTime = Date.now();
          
          // 设置Socket事件处理
          this.setupSocketEventHandlers();
          
          // 发出connected事件
          console.log(`ModbusTCP.connect: 触发connected事件`);
          this.emit('connected');
          
          // 如果配置了保活请求，启动保活
          if (this.keepAliveEnabled) {
            console.log(`ModbusTCP.connect: 启动保活机制`);
            this.startKeepAlive();
          }
          
          // 如果配置了数据点轮询并且允许自动轮询，才启动轮询
          if (this.autoStartPolling && this.pollingInterval > 0) {
            console.log(`ModbusTCP.connect: 启动数据轮询, 间隔: ${this.pollingInterval}ms`);
            this.startPolling(this.pollingInterval);
          } else {
            console.log(`ModbusTCP.connect: 自动轮询已禁用，不启动轮询`);
          }
          
          resolve();
        };
        
        // 连接错误的处理函数
        const errorHandler = (err) => {
          console.error(`ModbusTCP.connect: 连接错误: ${err.message}`);
          
          // 清理
          if (this.socket) {
            this.socket.removeListener('connect', connectHandler);
            this.socket.destroy();
            this.socket = null;
          }
          
          // 设置状态为未连接
          this.connected = false;
          console.log(`ModbusTCP.connect: 因错误设置connected=false`);
          
          // 触发error事件
          this.emit('error', {
            message: `连接到 ${this.host}:${this.port} 失败: ${err.message}`,
            code: err.code
          });
          
          reject(err);
        };
        
        // 设置事件监听
        this.socket.once('connect', connectHandler);
        this.socket.once('error', errorHandler);
        
        // 超时处理函数 - 只用于初始连接阶段
        const initialTimeoutHandler = () => {
          console.error(`ModbusTCP.connect: 连接建立阶段超时`);
          
          // 清理
          if (this.socket) {
            this.socket.removeListener('connect', connectHandler);
            this.socket.removeListener('error', errorHandler);
            
            // 改为延迟销毁Socket，防止竞态条件
            setTimeout(() => {
              if (this.socket) {
                this.socket.destroy();
                this.socket = null;
              }
            }, 100);
          }
          
          // 设置状态为未连接
          this.connected = false;
          console.log(`ModbusTCP.connect: 因连接阶段超时设置connected=false`);
          
          // 触发error事件
          const error = new Error(`连接到 ${this.host}:${this.port} 超时`);
          error.code = 'ETIMEDOUT';
          
          this.emit('error', {
            message: error.message,
            code: error.code
          });
          
          this.emit('timeout');
          
          reject(error);
        };
        
        this.socket.once('timeout', initialTimeoutHandler);
        
        // 开始连接
        const connectionOptions = {
          host: this.host,
          port: this.port
        };
        console.log(`ModbusTCP.connect: 开始连接到 ${this.host}:${this.port}`);
        this.socket.connect(connectionOptions);
        
      } catch (err) {
        console.error(`ModbusTCP.connect: 抛出异常: ${err.message}`);
        this.connected = false;
        this.socket = null;
        reject(err);
      }
    });
  }

  // 启动保持连接的机制
  startKeepAlive() {
    if (!this.keepAliveEnabled) {
      console.log('Keep-alive已在配置中禁用');
      return;
    }
    
    if (!this.socket || !this.connected) {
      console.log('无法启动保活机制: 未连接');
      return;
    }
    
    if (this.keepAliveTimer) {
      console.log('保活机制已经在运行中');
      return;
    }
    
    console.log(`启动保活机制: 间隔${this.keepAliveInterval}ms, 地址${this.keepAliveAddress}, 功能码${this.keepAliveFunctionCode}`);
    
    // 设置最后活动时间为当前时间
    this.lastActivityTime = Date.now();
    
    // 创建一个连续检查定时器，检查最近的活动时间
    this.keepAliveTimer = setInterval(() => {
      // 检查连接状态
      if (!this.socket || !this.connected) {
        console.log('保活检查: 连接已断开，停止保活机制');
        this.stopKeepAlive();
        return;
      }
      
      const now = Date.now();
      const inactiveTime = now - (this.lastActivityTime || now);
      
      // 如果在keepAliveInterval时间内有通信活动，则不需要发送保活请求
      if (inactiveTime < this.keepAliveInterval) {
        console.log(`保活检查: 最近${Math.floor(inactiveTime/1000)}秒内有通信活动，无需发送保活请求`);
        return;
      }
      
      // 判断当前是否有活跃的Modbus请求
      const hasActiveRequests = Array.from(this.activeTransactions?.values() || []).length > 0;
      
      if (hasActiveRequests) {
        console.log(`保活检查: 当前有${Array.from(this.activeTransactions?.values() || []).length}个活跃请求，暂不发送保活请求`);
        return;
      }
      
      console.log(`保活检查: 已有${Math.floor(inactiveTime/1000)}秒无通信活动，发送保活请求`);
      this.sendKeepAliveRequest();
    }, Math.min(10000, this.keepAliveInterval / 2)); // 保活检查间隔增加到至少10秒或保活间隔的一半
  }
  
  // 连接超时处理函数
  _checkConnectionTimeout() {
    if (!this.socket || !this.connected) {
      return;
    }
    
    const now = Date.now();
    const lastActivity = this.lastActivityTime || now;
    const inactiveTime = now - lastActivity;
    
    // 如果非活动时间超过了2倍的保活间隔，认为连接已超时
    if (inactiveTime > this.keepAliveInterval * 2) {
      console.error(`ModbusTCP - 连接超时检测: ${Math.floor(inactiveTime/1000)}秒无通信活动`);
      
      // 尝试重新连接
      this._handleKeepAliveError(new Error('连接太长时间无活动'));
    }
  }
  
  /**
   * 设置Socket事件处理程序
   * 用于处理数据接收、错误、连接关闭等事件
   */
  setupSocketEventHandlers() {
    if (!this.socket) {
      console.warn('ModbusTCP.setupSocketEventHandlers - Socket不存在，无法设置事件处理程序');
      return;
    }
    
    console.log('ModbusTCP - 设置Socket事件处理程序');
    
    // 重要：禁用Socket自动超时
    // 我们将通过保活机制自行管理连接状态，而不依赖Socket的timeout
    console.log(`ModbusTCP - 禁用Socket自动超时检测`);
    this.socket.setTimeout(0);
    
    // 数据接收处理
    this.socket.on('data', (data) => {
      try {
        this.handleModbusResponse(data);
      } catch (error) {
        console.error('处理Modbus响应时出错:', error);
        this.emit('error', { 
          message: '处理Modbus响应时出错: ' + error.message,
          originalError: error
        });
      }
    });
    
    // 错误处理
    this.socket.on('error', (error) => {
      console.error(`ModbusTCP - Socket错误: ${error.message}`);
      this.emit('error', { 
        message: 'Socket错误: ' + error.message,
        code: error.code,
        originalError: error
      });
    });
    
    // 连接关闭处理
    this.socket.on('close', (hadError) => {
      console.log(`ModbusTCP - 连接关闭${hadError ? ' (有错误)' : ''}`);
      this.connected = false;
      this.emit('connectionClosed', hadError);
      
      // 停止保活和轮询
      this.stopKeepAlive();
      this.stopPolling();
    });
    
    // 注意：我们不再使用Socket的timeout事件
    // 我们自己管理超时逻辑通过保活机制
  }
  
  // 停止保活机制
  stopKeepAlive() {
    if (this.keepAliveTimer) {
      console.log('ModbusTCP - 停止保活机制');
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }
  
  // 发送保活请求 (读取第一个保持寄存器)
  sendKeepAliveRequest() {
    if (!this.socket || !this.connected) {
      console.log('无法发送保活请求: 未连接');
      this.stopKeepAlive();
      return;
    }

    try {
      console.log(`发送保活请求: 地址${this.keepAliveAddress}, 功能码${this.keepAliveFunctionCode}`);
      
      // 记录上次保活时间
      this.lastKeepAliveTime = Date.now();
      
      // 检查是否已经有过多的未处理保活请求
      if (this.pendingKeepAliveCount && this.pendingKeepAliveCount > 2) {
        console.warn(`检测到${this.pendingKeepAliveCount}个未处理的保活请求，可能存在连接问题，避免发送新请求`);
        this.pendingKeepAliveCount = 0; // 重置计数
        // 触发错误处理但不断开连接
        setTimeout(() => {
          if (this.connected) {
            this.emit('warning', { 
              message: '多个保活请求未响应，但连接仍然保持',
              code: 'KEEP_ALIVE_PENDING'
            });
          }
        }, 100);
        return;
      }
      
      // 增加挂起的保活请求计数
      this.pendingKeepAliveCount = (this.pendingKeepAliveCount || 0) + 1;
      
      // 根据功能码发送不同类型的保活请求
      if (this.keepAliveFunctionCode === 3) {
        // 读保持寄存器
        const transactionId = this.readHoldingRegisters(this.keepAliveAddress, 1);
        
        // 设置超时处理
        const keepAliveTimeout = setTimeout(() => {
          this.removeListener('data', responseHandler);
          this.removeListener('error', errorHandler);
          console.warn('保活请求超时未响应，可能连接已中断');
          
          // 减少挂起的保活请求计数
          this.pendingKeepAliveCount = Math.max(0, (this.pendingKeepAliveCount || 1) - 1);
          
          // 不立即断开，给一次重试机会
          if (this.keepAliveRetryCount === undefined) {
            this.keepAliveRetryCount = 1;
            console.log(`保活请求失败，尝试重试 (1/2)`);
            this.sendKeepAliveRequest();
          } else {
            console.error(`保活请求重试失败，连接可能已断开`);
            this.keepAliveRetryCount = undefined;
            
            // 检查是否有近期的其他活动，如果有，则可能只是保活请求问题
            const now = Date.now();
            const timeSinceLastActivity = now - (this.lastActivityTime || now);
            
            if (timeSinceLastActivity < this.keepAliveInterval * 1.5) {
              console.log(`最近${Math.floor(timeSinceLastActivity/1000)}秒内有其他通信活动，保活超时可能只是临时问题，暂不断开连接`);
              // 发出警告但不断开连接
              this.emit('warning', {
                message: '保活请求失败，但检测到近期有其他活动，暂不断开连接',
                code: 'KEEP_ALIVE_TIMEOUT_WITH_ACTIVITY'
              });
            } else {
              // 如果长时间没有活动，则认为确实有连接问题
            this._handleKeepAliveError(new Error('保活请求重试超时'));
          }
          }
        }, this.timeout * 1.5); // 增加超时时间以减少误判
        
        // 响应处理器
        const responseHandler = (response) => {
          if (response.transactionId === transactionId) {
            clearTimeout(keepAliveTimeout);
            this.removeListener('data', responseHandler);
            this.removeListener('error', errorHandler);
            this.keepAliveRetryCount = undefined; // 成功后重置重试计数
            
            // 减少挂起的保活请求计数
            this.pendingKeepAliveCount = Math.max(0, (this.pendingKeepAliveCount || 1) - 1);
            
            // 更新最后活动时间
            this.lastActivityTime = Date.now();
            
            console.log('保活请求成功', response);
          }
        };
        
        // 错误处理器
        const errorHandler = (error) => {
          if (error.transactionId === transactionId) {
            clearTimeout(keepAliveTimeout);
            this.removeListener('data', responseHandler);
            this.removeListener('error', errorHandler);
            
            // 减少挂起的保活请求计数
            this.pendingKeepAliveCount = Math.max(0, (this.pendingKeepAliveCount || 1) - 1);
            
            // 检查是否是非致命错误
            if (error.message && (error.message.includes('Illegal data address') || 
                                 error.message.includes('非法数据地址'))) {
              console.log('保活请求返回"非法数据地址"错误，但连接仍然有效');
              
              // 更新最后活动时间，因为我们收到了响应
              this.lastActivityTime = Date.now();
              
              // 尝试使用不同的地址进行后续保活
              this.keepAliveAddress = (this.keepAliveAddress + 1) % 100;
              console.log(`更新保活地址为: ${this.keepAliveAddress}`);
            } else {
              console.error('保活请求错误:', error.message);
              
              // 不立即断开连接，给一次重试机会
              if (this.keepAliveRetryCount === undefined) {
                this.keepAliveRetryCount = 1;
                console.log(`保活请求发生错误，尝试重试 (1/2)`);
                setTimeout(() => this.sendKeepAliveRequest(), 1000);
              } else {
                console.error(`保活请求重试失败: ${error.message}`);
                this.keepAliveRetryCount = undefined;
              this._handleKeepAliveError(error);
              }
            }
          }
        };
        
        // 添加事件监听器
        this.on('data', responseHandler);
        this.on('error', errorHandler);
      }
      else if (this.keepAliveFunctionCode === 4) {
        // 读输入寄存器，使用相同的模式
        const transactionId = this.readInputRegisters(this.keepAliveAddress, 1);
        
        // 设置超时处理
        const keepAliveTimeout = setTimeout(() => {
          this.removeListener('data', responseHandler);
          this.removeListener('error', errorHandler);
          console.warn('保活请求超时未响应，可能连接已中断');
          
          // 不立即断开，给一次重试机会
          if (this.keepAliveRetryCount === undefined) {
            this.keepAliveRetryCount = 1;
            console.log(`保活请求失败，尝试重试 (1/2)`);
            this.sendKeepAliveRequest();
          } else {
            console.error(`保活请求重试失败，连接可能已断开`);
            this.keepAliveRetryCount = undefined;
            this._handleKeepAliveError(new Error('保活请求重试超时'));
          }
        }, this.timeout);
        
        // 响应处理器
        const responseHandler = (response) => {
          if (response.transactionId === transactionId) {
            clearTimeout(keepAliveTimeout);
            this.removeListener('data', responseHandler);
            this.removeListener('error', errorHandler);
            this.keepAliveRetryCount = undefined; // 成功后重置重试计数
            console.log('保活请求成功', response);
          }
        };
        
        // 错误处理器
        const errorHandler = (error) => {
          if (error.transactionId === transactionId) {
            clearTimeout(keepAliveTimeout);
            this.removeListener('data', responseHandler);
            this.removeListener('error', errorHandler);
            
            if (error.message && error.message.includes('Timed out')) {
              console.log('保活请求超时');
              this._handleKeepAliveError(new Error('保活请求超时'));
            } else if (error.message && error.message.includes('Illegal data address')) {
              // 忽略非法数据地址错误，服务器至少有响应
              this.keepAliveRetryCount = undefined; // 成功响应后重置重试计数
              console.log('保活请求返回"非法数据地址"错误，但连接仍然有效');
            } else {
              console.log('保活请求错误:', error);
              this._handleKeepAliveError(error);
            }
          }
        };
        
        // 添加事件监听器
        this.on('data', responseHandler);
        this.on('error', errorHandler);
        
      } else {
        console.log(`不支持的功能码 ${this.keepAliveFunctionCode}，使用默认功能码 3`);
        // 使用默认的功能码3（读取保持寄存器）
        const transactionId = this.readHoldingRegisters(this.keepAliveAddress, 1);
        
        // 设置超时处理
        const keepAliveTimeout = setTimeout(() => {
          this.removeListener('data', responseHandler);
          this.removeListener('error', errorHandler);
          console.warn('保活请求超时未响应，可能连接已中断');
          this._handleKeepAliveError(new Error('保活请求超时'));
        }, this.timeout);
        
        // 响应处理器
        const responseHandler = (response) => {
          if (response.transactionId === transactionId) {
            clearTimeout(keepAliveTimeout);
            this.removeListener('data', responseHandler);
            this.removeListener('error', errorHandler);
            
            if (error.message && error.message.includes('Illegal data address')) {
              // 忽略非法数据地址错误
              console.log('保活请求返回"非法数据地址"错误，但连接仍然有效');
            } else {
              this._handleKeepAliveError(error);
            }
          }
        };
        
        // 错误处理器
        const errorHandler = (error) => {
          if (error.transactionId === transactionId) {
            clearTimeout(keepAliveTimeout);
            this.removeListener('data', responseHandler);
            this.removeListener('error', errorHandler);
            
            if (error.message && error.message.includes('Illegal data address')) {
              // 忽略非法数据地址错误
              console.log('保活请求返回"非法数据地址"错误，但连接仍然有效');
            } else {
              this._handleKeepAliveError(error);
            }
          }
        };
        
        // 添加事件监听器
        this.on('data', responseHandler);
        this.on('error', errorHandler);
      }
    } catch (err) {
      console.error('发送保活请求时发生错误:', err.message);
      
      // 减少挂起的保活请求计数
      this.pendingKeepAliveCount = Math.max(0, (this.pendingKeepAliveCount || 1) - 1);
      
      // 检查是否是致命错误
      if (err.code === 'ECONNRESET' || err.code === 'EPIPE' || 
          err.message.includes('连接已关闭') || err.message.includes('socket closed')) {
        this._handleKeepAliveError(err);
      } else {
        // 非致命错误，仅记录日志
        console.warn('保活请求出错，但不会断开连接:', err.message);
      }
    }
  }

  // 处理保活错误
  _handleKeepAliveError(error) {
    console.log('保活错误:', error.message);
    
    // 如果是连接超时或网络错误，则认为连接已断开
    if (
      error.code === 'ETIMEDOUT' || 
      error.code === 'ECONNREFUSED' || 
      error.code === 'ECONNRESET' || 
      error.code === 'EHOSTUNREACH' ||
      error.message.includes('Timed out') ||
      error.message.includes('保活请求重试超时')
    ) {
      console.log('根据保活请求失败判断连接已断开');
      
      // 设置连接状态标志
      const wasConnected = this.connected;
      this.connected = false;
      
      // 优雅地停止保活和轮询
      this.stopKeepAlive();
      this.stopPolling();
      
      // 如果之前认为是连接状态，发出连接丢失事件
      if (wasConnected) {
        this.emit('connectionLost', {
          message: '保活请求失败: ' + error.message,
          code: error.code || 'KEEP_ALIVE_FAILED',
          time: new Date().toISOString()
        });
      }
      
      // 更新最后错误
      this.lastErrorCode = error.code || 'KEEP_ALIVE_FAILED';
      this.lastErrorMessage = error.message;
      this.lastErrorTime = new Date().toISOString();
      
      // 尝试关闭套接字以防止资源泄漏
      try {
        if (this.socket) {
          console.log('正在关闭现有Socket连接');
          // 使用延迟销毁，避免竞态条件
          setTimeout(() => {
            if (this.socket) {
              this.socket.destroy();
              this.socket = null;
              console.log('Socket已销毁');
            }
          }, 100);
        }
      } catch (e) {
        console.log('销毁Socket时出错:', e.message);
      }
    } else {
      // 其他错误类型，记录但不断开连接
      console.log('保活请求出现非致命错误:', error.message);
      this.emit('error', {
        message: '保活请求错误: ' + error.message,
        code: error.code || 'KEEP_ALIVE_ERROR',
        originalError: error
      });
    }
  }

  // 断开连接
  disconnect() {
    this.stopKeepAlive();
    this.stopPolling();
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
      this.connected = false;
    }
  }

  // 获取新的事务ID
  getNextTransactionId() {
    if (this.transactionId >= 65535) {
      this.transactionId = 1;
    } else {
      this.transactionId++;
    }
    return this.transactionId;
  }

  // 读取保持寄存器
  readHoldingRegisters(address, quantity) {
    if (!this.connected) {
      throw new Error('未连接到Modbus服务器');
    }
    
    console.log(`ModbusTCP.readHoldingRegisters - 读取保持寄存器, 地址: ${address}, 数量: ${quantity}`);
    
    const transactionId = this.getNextTransactionId();
    
    // 创建Modbus TCP ADU
    const buffer = Buffer.alloc(12); // MBAP(7) + PDU(5)
    buffer.writeUInt16BE(transactionId, 0); // 事务ID
    buffer.writeUInt16BE(0, 2); // 协议ID (0表示Modbus)
    buffer.writeUInt16BE(6, 4); // 后续字节长度 (单元ID(1) + 功能码(1) + 起始地址(2) + 寄存器数量(2))
    buffer.writeUInt8(this.unitId, 6); // 单元ID
    buffer.writeUInt8(3, 7); // 功能码 3 (读取保持寄存器)
    buffer.writeUInt16BE(address, 8); // 起始地址
    buffer.writeUInt16BE(quantity, 10); // 寄存器数量
    
    try {
      // 发送请求
      this.socket.write(buffer);
      // 更新最后活动时间
      this.lastActivityTime = Date.now();
      console.log(`ModbusTCP.readHoldingRegisters - 已发送请求, 事务ID: ${transactionId}, 数据: ${buffer.toString('hex')}`);
      return transactionId;
    } catch (error) {
      console.error(`ModbusTCP.readHoldingRegisters - 发送请求失败:`, error);
      throw error;
    }
  }

  // 读取输入寄存器(功能码04)
  readInputRegisters(address, quantity) {
    if (!this.connected || !this.socket) {
      throw new Error('未连接到Modbus服务器');
    }

    const transactionId = this.getNextTransactionId();
    
    // 构建Modbus TCP ADU
    const buffer = Buffer.alloc(12);
    
    // 事务ID (2字节)
    buffer.writeUInt16BE(transactionId, 0);
    
    // 协议ID (2字节, 总是0)
    buffer.writeUInt16BE(0, 2);
    
    // 长度 (2字节, 后面的字节数)
    buffer.writeUInt16BE(6, 4);
    
    // 单元ID (1字节)
    buffer.writeUInt8(this.unitId, 6);
    
    // 功能码 (1字节, 04代表读取输入寄存器)
    buffer.writeUInt8(4, 7);
    
    // 起始地址 (2字节)
    buffer.writeUInt16BE(address, 8);
    
    // 寄存器数量 (2字节)
    buffer.writeUInt16BE(quantity, 10);
    
    // 发送请求
    this.socket.write(buffer);
    
    return transactionId;
  }

  // 写入单个寄存器(功能码06)
  writeSingleRegister(address, value) {
    if (!this.connected || !this.socket) {
      throw new Error('未连接到Modbus服务器');
    }

    const transactionId = this.getNextTransactionId();
    
    // 构建Modbus TCP ADU
    const buffer = Buffer.alloc(12);
    
    // 事务ID (2字节)
    buffer.writeUInt16BE(transactionId, 0);
    
    // 协议ID (2字节, 总是0)
    buffer.writeUInt16BE(0, 2);
    
    // 长度 (2字节, 后面的字节数)
    buffer.writeUInt16BE(6, 4);
    
    // 单元ID (1字节)
    buffer.writeUInt8(this.unitId, 6);
    
    // 功能码 (1字节, 06代表写单个寄存器)
    buffer.writeUInt8(6, 7);
    
    // 寄存器地址 (2字节)
    buffer.writeUInt16BE(address, 8);
    
    // 寄存器值 (2字节)
    buffer.writeUInt16BE(value, 10);
    
    // 发送请求
    try {
      this.socket.write(buffer);
      // 更新最后活动时间
      this.lastActivityTime = Date.now();
      console.log(`ModbusTCP.writeSingleRegister - 已发送请求, 事务ID: ${transactionId}, 地址: ${address}, 值: ${value}, 数据: ${buffer.toString('hex')}`);
      
      // 将事务ID与写入操作关联
      if (!this.transactionToDataPointMap) {
        this.transactionToDataPointMap = new Map();
      }
      
      // 记录这是写入操作的事务ID
      this.transactionToDataPointMap.set(transactionId, {
        name: `write_${address}`,
        address: address,
        value: value,
        isWriteOperation: true,
        timestamp: new Date().toISOString()
      });
      
      return transactionId;
    } catch (error) {
      console.error(`ModbusTCP.writeSingleRegister - 发送请求失败:`, error);
      throw error;
    }
  }

  // 写入多个寄存器(功能码16)
  writeMultipleRegisters(address, values) {
    if (!this.connected || !this.socket) {
      throw new Error('未连接到Modbus服务器');
    }

    const transactionId = this.getNextTransactionId();
    const byteCount = values.length * 2;
    
    // 构建Modbus TCP ADU
    const buffer = Buffer.alloc(13 + byteCount);
    
    // 事务ID (2字节)
    buffer.writeUInt16BE(transactionId, 0);
    
    // 协议ID (2字节, 总是0)
    buffer.writeUInt16BE(0, 2);
    
    // 长度 (2字节, 后面的字节数)
    buffer.writeUInt16BE(7 + byteCount, 4);
    
    // 单元ID (1字节)
    buffer.writeUInt8(this.unitId, 6);
    
    // 功能码 (1字节, 16代表写多个寄存器)
    buffer.writeUInt8(16, 7);
    
    // 起始地址 (2字节)
    buffer.writeUInt16BE(address, 8);
    
    // 寄存器数量 (2字节)
    buffer.writeUInt16BE(values.length, 10);
    
    // 字节数 (1字节)
    buffer.writeUInt8(byteCount, 12);
    
    // 寄存器值 (每个2字节)
    for (let i = 0; i < values.length; i++) {
      buffer.writeUInt16BE(values[i], 13 + i * 2);
    }
    
    // 创建Promise来处理响应
    return new Promise((resolve, reject) => {
      // 创建一个一次性事件监听器来处理此事务的响应
      const onResponse = (data) => {
        if (data.transactionId === transactionId) {
          this.removeListener('data', onResponse);
          this.removeListener('error', onError);
          clearTimeout(timeout);
          resolve(true);
        }
      };
      
      // 创建一个一次性事件监听器来处理错误
      const onError = (error) => {
        if (error.transactionId === transactionId) {
          this.removeListener('data', onResponse);
          this.removeListener('error', onError);
          clearTimeout(timeout);
          // 如果错误是对象且有message属性，创建Error实例
          if (typeof error === 'object' && error.message) {
            const err = new Error(error.message);
            // 保留原始错误代码
            if (error.code) {
              err.code = error.code;
            }
            reject(err);
          } else if (typeof error === 'object' && !error.message) {
            const err = new Error(`Modbus错误，代码: ${error.code || 'unknown'}`);
            if (error.code) {
              err.code = error.code;
            }
            reject(err);
          } else {
            reject(error);
          }
        }
      };
      
      // 添加临时事件监听器
      this.on('data', onResponse);
      this.on('error', onError);
      
      // 设置超时
      const timeout = setTimeout(() => {
        this.removeListener('data', onResponse);
        this.removeListener('error', onError);
        reject(new Error('写入操作超时'));
      }, this.timeout);
      
      // 发送请求
      try {
        this.socket.write(buffer);
      } catch (err) {
        clearTimeout(timeout);
        this.removeListener('data', onResponse);
        this.removeListener('error', onError);
        reject(err);
      }
    });
  }

  // 处理Modbus响应数据
  handleModbusResponse(data) {
    if (data.length < 9) {
      console.error('无效的Modbus响应: 数据长度不足');
      return;
    }
    
    // 收到任何数据都更新最后活动时间
    this.lastActivityTime = Date.now();

    const transactionId = data.readUInt16BE(0);
    const protocolId = data.readUInt16BE(2);
    const length = data.readUInt16BE(4);
    const unitId = data.readUInt8(6);
    const functionCode = data.readUInt8(7);
    
    console.log(`===== ModbusTCP.handleModbusResponse =====`);
    console.log(`- 收到Modbus响应: 事务ID=${transactionId}, 功能码=${functionCode}`);

    // 检查是否有异常
    if (functionCode > 0x80) {
      const exceptionCode = data.readUInt8(8);
      const error = this.getExceptionMessage(exceptionCode);
      
      console.log(`- 响应包含错误: 异常代码=${exceptionCode}, 错误信息=${error}`);
      
      // 创建错误对象
      const errorObj = { 
        transactionId, 
        message: `Modbus错误 (事务ID: ${transactionId}): ${error} - 检查寄存器地址是否存在`, 
        code: exceptionCode 
      };
      
      // 根据异常代码提供更具体的错误信息
      if (exceptionCode === 2) {
        errorObj.message = `Modbus错误 (事务ID: ${transactionId}): 非法数据地址 - 检查寄存器地址是否存在`;
        console.error(errorObj.message);
      } else if (exceptionCode === 3) {
        errorObj.message = `Modbus错误 (事务ID: ${transactionId}): 非法数据值 - 检查写入值是否在允许范围内`;
        console.error(errorObj.message);
      }
      
      // 只在不是保活请求相关的错误或首次出现错误时记录日志
      const isFirstError = !this.lastErrorCode || this.lastErrorCode !== exceptionCode;
      if (isFirstError) {
        // 记录最后一个错误码，用于减少重复记录
        this.lastErrorCode = exceptionCode;
        
        // 发出错误事件 - 这样监听器可以处理特定错误
        this.emit('error', errorObj);
      }
      
      return;
    }

    // 如果成功接收到响应，重置错误计数
    this.lastErrorCode = null;

    // 根据功能码解析数据
    if (functionCode === 3 || functionCode === 4) { // 读寄存器响应
      const byteCount = data.readUInt8(8);
      const values = [];
      
      for (let i = 0; i < byteCount / 2; i++) {
        values.push(data.readUInt16BE(9 + i * 2));
      }
      
      console.log(`- 读寄存器响应: 功能码=${functionCode}, 字节数=${byteCount}, 值=${JSON.stringify(values)}`);
      
      // 查找对应的数据点
      let dataPoint = null;
      
      // 首先通过事务ID映射表查找
      if (this.transactionToDataPointMap && this.transactionToDataPointMap.has(transactionId)) {
        dataPoint = this.transactionToDataPointMap.get(transactionId);
        console.log(`- 通过映射表找到数据点: ${dataPoint.name}`);
        // 操作完成后从映射表中移除，避免内存泄漏
        this.transactionToDataPointMap.delete(transactionId);
      }
      
      // 如果映射表中找不到，再尝试遍历所有数据点
      if (!dataPoint) {
        dataPoint = this.dataPoints.find(dp => dp.lastTransactionId === transactionId);
        if (dataPoint) {
          console.log(`- 通过遍历找到匹配数据点: ${dataPoint.name}, 格式: ${dataPoint.format}`);
        } else {
          console.log(`- 未找到匹配事务ID ${transactionId} 的数据点`);
        }
      }
      
      this.emit('data', {
        transactionId,
        functionCode,
        values
      });
      
      // 更新轮询数据点的值
      this.updateDataPointValues(transactionId, values);
    }
    else if (functionCode === 6) { // 写单个寄存器响应
      // 写单个寄存器的响应包含寄存器地址和写入的值
      const address = data.readUInt16BE(8);
      const value = data.readUInt16BE(10);
      
      console.log(`- 写单寄存器响应: 地址=${address}, 值=${value}`);
      
      this.emit('data', {
        transactionId,
        functionCode,
        address,
        value
      });
    }
    else if (functionCode === 16) { // 写多个寄存器响应
      // 写多个寄存器的响应包含起始地址和寄存器数量
      const address = data.readUInt16BE(8);
      const quantity = data.readUInt16BE(10);
      
      console.log(`- 写多寄存器响应: 起始地址=${address}, 数量=${quantity}`);
      
      this.emit('data', {
        transactionId,
        functionCode,
        address,
        quantity
      });
    }
  }

  // 更新数据点值
  updateDataPointValues(transactionId, values) {
    console.log(`[ModbusTCP] ===== 开始更新数据点值 =====`);
    console.log(`[ModbusTCP] 事务ID: ${transactionId}`);
    console.log(`[ModbusTCP] 原始值: ${JSON.stringify(values)}`);
    
    // 查找与此事务ID匹配的数据点
    let dataPoint = null;
    
    // 首先尝试从映射表中查找
    if (this.transactionToDataPointMap && this.transactionToDataPointMap.has(transactionId)) {
      dataPoint = this.transactionToDataPointMap.get(transactionId);
      console.log(`[ModbusTCP] 通过映射表找到数据点: ${dataPoint.name}, 地址: ${dataPoint.address}, 格式: ${dataPoint.format}`);
      // 使用后从映射表中移除
      this.transactionToDataPointMap.delete(transactionId);
    } else {
      // 如果映射表中找不到，再尝试遍历所有数据点
      dataPoint = this.dataPoints.find(dp => dp.lastTransactionId === transactionId);
      if (dataPoint) {
        console.log(`[ModbusTCP] 通过遍历找到匹配数据点: ${dataPoint.name}, 地址: ${dataPoint.address}, 格式: ${dataPoint.format}`);
      } else {
        console.log(`[ModbusTCP] 未找到匹配事务ID ${transactionId} 的数据点`);
        console.log(`[ModbusTCP] 当前已配置数据点: ${this.dataPoints.length}个`);
        
        // 打印所有数据点的信息以便调试
        console.log(`[ModbusTCP] 所有数据点信息:`);
        this.dataPoints.forEach((dp, index) => {
          console.log(`[ModbusTCP] 数据点 ${index + 1}:`);
          console.log(`  - 名称: ${dp.name}`);
          console.log(`  - 标识符: ${dp.identifier}`);
          console.log(`  - 地址: ${dp.address}`);
          console.log(`  - 格式: ${dp.format}`);
          console.log(`  - 最后事务ID: ${dp.lastTransactionId}`);
          console.log(`  - 告警启用: ${dp.alarmEnabled}`);
          console.log(`  - 告警类型: ${dp.alarmType}`);
          console.log(`  - 告警阈值: ${dp.alarmThreshold}`);
          console.log(`  - 告警内容: ${dp.alarmContent}`);
        });
        
        return;
      }
    }
    
    if (dataPoint) {
      const now = new Date();
      
      // 根据数据格式解析值
      let value = null;
      let binaryString = null;
      let bitValue = null;
      let registerValue = null;

      switch (dataPoint.format) {
        case 'BIT':
          // BIT格式: 从单个寄存器提取指定位的值
          if (values && values.length > 0) {
            registerValue = values[0];
            // 获取指定位位置
            const bitPosition = dataPoint.bitPosition !== undefined ? dataPoint.bitPosition : 0;
            console.log(`[ModbusTCP] 解析BIT值, 寄存器值: ${registerValue}, 位位置: ${bitPosition}`);
            
            // 提取指定位的值
            bitValue = this.getBitFromRegister(registerValue, bitPosition);
            value = bitValue; // 实际值是0或1
            
            // 生成二进制字符串表示，用于前端显示
            binaryString = this.registerToBinaryString(registerValue);
            console.log(`[ModbusTCP] 二进制表示: ${binaryString}, 位值: ${bitValue}`);
            
            // 检查是否是告警数据点 - 只有明确启用告警时才视为告警数据点
            const isAlarmPoint = dataPoint.alarmEnabled === true;
            console.log(`[ModbusTCP] 是否为告警数据点: ${isAlarmPoint}`);
            
            if (isAlarmPoint) {
              console.log(`[ModbusTCP] 告警数据点信息:`);
              console.log(`  - 名称: ${dataPoint.name}`);
              console.log(`  - 标识符: ${dataPoint.identifier}`);
              console.log(`  - 告警启用: ${dataPoint.alarmEnabled}`);
              console.log(`  - 告警类型: ${dataPoint.alarmType}`);
              console.log(`  - 告警阈值: ${dataPoint.alarmThreshold}`);
              console.log(`  - 告警内容: ${dataPoint.alarmContent}`);
            }
          }
          break;
        case 'INT16':
          value = values[0]; // 有符号16位整数
          if (value > 32767) value -= 65536;
          console.log(`- 解析INT16值: ${value}`);
          break;
        case 'UINT16':
          value = values[0]; // 无符号16位整数
          console.log(`- 解析UINT16值: ${value}`);
          break;
        case 'INT32':
          if (values.length >= 2) {
            const high = values[0];
            const low = values[1];
            value = (high << 16) | low;
            if (value > 2147483647) value -= 4294967296;
            console.log(`- 解析INT32值: ${value}, 高位: ${high}, 低位: ${low}`);
          }
          break;
        case 'UINT32':
          if (values.length >= 2) {
            const high = values[0];
            const low = values[1];
            value = (high << 16) | low;
            console.log(`- 解析UINT32值: ${value}, 高位: ${high}, 低位: ${low}`);
          }
          break;
        case 'FLOAT32':
          if (values.length >= 2) {
            const buf = Buffer.alloc(4);
            buf.writeUInt16BE(values[0], 0);
            buf.writeUInt16BE(values[1], 2);
            value = buf.readFloatBE(0);
            console.log(`- 解析FLOAT32值: ${value}, 字节: ${buf.toString('hex')}`);
          }
          break;
        default:
          value = values[0]; // 默认处理为单个寄存器值
          console.log(`- 未知格式 ${dataPoint.format}, 使用默认解析: ${value}`);
      }
      
      // 应用缩放因子和单位
      let formattedValue = this.formatValue(value, dataPoint.format, dataPoint.scale || 1, dataPoint.unit || '');
      
      console.log(`- 数据点 ${dataPoint.name} 更新为: ${value}, 格式化值: ${formattedValue}`);
      
      // 更新内部数据值对象
      if (!this.dataValues[dataPoint.name]) {
        this.dataValues[dataPoint.name] = {};
      }
      
      const previousValue = this.dataValues[dataPoint.name].value;
      const previousTimestamp = this.dataValues[dataPoint.name].timestamp;
      
      // 始终使用新的时间戳和事务ID，确保前端可以检测到更新
      this.dataValues[dataPoint.name] = {
        value: value,
        formatted: formattedValue,
        timestamp: now.toISOString(),
        transactionId: transactionId,
        rawValue: values,
        previousValue: previousValue,
        previousTimestamp: previousTimestamp
      };
      
      // 为BIT格式添加额外的信息
      if (dataPoint.format === 'BIT' && binaryString !== null) {
        this.dataValues[dataPoint.name].binaryString = binaryString;
        this.dataValues[dataPoint.name].bitPosition = dataPoint.bitPosition;
        this.dataValues[dataPoint.name].bitValue = bitValue;
        this.dataValues[dataPoint.name].registerValue = registerValue;
      }
      
      // 发出数据更新事件
      this.emit('data-update', {
        name: dataPoint.name,
        value: value,
        formatted: formattedValue,
        previousValue: previousValue,
        previousTimestamp: previousTimestamp,
        timestamp: now.toISOString(),
        transactionId: transactionId,
        format: dataPoint.format,
        bitData: dataPoint.format === 'BIT' ? {
          binaryString,
          bitPosition: dataPoint.bitPosition,
          bitValue,
          registerValue
        } : null
      });

      // 对于BIT格式，额外发出一个位值变化事件
      if (dataPoint.format === 'BIT' && bitValue !== null) {
        // 检查数据点是否是告警数据点 - 只有明确启用告警时才视为告警数据点
        const isAlarmPoint = dataPoint.alarmEnabled === true;
        
        // 检查是否是从0变为1的变化（告警触发）
        const previousBitValue = this.dataValues[dataPoint.name]?.previousValue === 0 ? 0 : 
                               (this.dataValues[dataPoint.name]?.previousValue === 1 ? 1 : null);
        const isAlarmTriggered = isAlarmPoint && previousBitValue === 0 && bitValue === 1;
        // 检查是否是从1变为0的变化（告警解除）
        const isAlarmCleared = isAlarmPoint && previousBitValue === 1 && bitValue === 0;
        
        console.log(`[ModbusTCP] 位值变化检查:`);
        console.log(`  - 是否为告警数据点: ${isAlarmPoint}`);
        console.log(`  - 告警启用状态: ${dataPoint.alarmEnabled === true ? '已启用' : '未启用'}`);
        console.log(`  - 前一个位值: ${previousBitValue}`);
        console.log(`  - 当前位值: ${bitValue}`);
        console.log(`  - 是否触发告警: ${isAlarmTriggered}`);
        console.log(`  - 是否解除告警: ${isAlarmCleared}`);
        
        if (isAlarmTriggered) {
          console.log(`[ModbusTCP] 检测到告警触发: ${dataPoint.name}, 从 ${previousBitValue} 到 ${bitValue}`);
          
          // 使用告警内容（如果有）或数据点名称
          const alarmContent = dataPoint.alarmContent || dataPoint.name;
          
          // 调用triggerAlarm方法
          const alarmResult = this.triggerAlarm(dataPoint.identifier || dataPoint.name, alarmContent);
          console.log(`[ModbusTCP] 告警触发结果:`, alarmResult);
        } else if (isAlarmCleared) {
          console.log(`[ModbusTCP] 检测到告警解除: ${dataPoint.name}, 从 ${previousBitValue} 到 ${bitValue}`);
          
          // 使用告警内容（如果有）或数据点名称
          const alarmContent = dataPoint.alarmContent || dataPoint.name;
          
          // 调用clearAlarm方法
          const clearResult = this.clearAlarm(dataPoint.identifier || dataPoint.name, alarmContent);
          console.log(`[ModbusTCP] 告警解除结果:`, clearResult);
        }
        
        this.emit('bit-change', {
          name: dataPoint.name,
          address: dataPoint.address,
          bitPosition: dataPoint.bitPosition,
          value: bitValue,
          registerValue: registerValue,
          binaryString: binaryString,
          timestamp: now.toISOString()
        });
      }
    }
  }

  // 格式化值
  formatValue(value, format, scale, unit) {
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

  // 获取异常消息
  getExceptionMessage(code) {
    const exceptions = {
      1: '非法功能',
      2: '非法数据地址',
      3: '非法数据值',
      4: '从站设备故障',
      5: '确认',
      6: '从站设备忙',
      8: '存储奇偶性差错',
      10: '网关路径不可用',
      11: '网关目标设备响应失败'
    };
    
    return exceptions[code] || `未知异常(${code})`;
  }

  // 添加数据点
  addDataPoint(dataPoint) {
    console.log(`ModbusTCP.addDataPoint - 添加数据点: ${dataPoint.name || dataPoint.identifier}, 地址: ${dataPoint.address}`);
    
    if (!dataPoint || !dataPoint.address) {
      console.error('ModbusTCP.addDataPoint - 数据点配置无效');
      return false;
    }
    
    // 确保必要属性存在
    const modbusDataPoint = {
      name: dataPoint.name || dataPoint.identifier,
      identifier: dataPoint.identifier,
      address: parseInt(dataPoint.address, 10),
      functionCode: dataPoint.readFunctionCode || 3, // 默认使用功能码3（读保持寄存器）
      format: dataPoint.format || 'UINT16',
      scale: dataPoint.scale || 1,
      unit: dataPoint.unit || '',
      // 添加告警相关属性
      alarmEnabled: dataPoint.alarmEnabled === true,
      alarmType: dataPoint.alarmType,
      alarmContent: dataPoint.alarmContent
    };
    
    // 如果是BIT格式，保存位位置信息
    if (modbusDataPoint.format === 'BIT' && dataPoint.bitPosition !== undefined) {
      modbusDataPoint.bitPosition = parseInt(dataPoint.bitPosition, 10);
      console.log(`ModbusTCP.addDataPoint - 位数据点，位置: ${modbusDataPoint.bitPosition}`);
    }
    
    // 如果启用了告警，记录日志
    if (modbusDataPoint.alarmEnabled) {
      console.log(`ModbusTCP.addDataPoint - 数据点启用了告警功能:`);
      console.log(`  - 告警类型: ${modbusDataPoint.alarmType || '未指定'}`);
      console.log(`  - 告警内容: ${modbusDataPoint.alarmContent || '未指定'}`);
    }
    
    // 验证功能码
    if (modbusDataPoint.functionCode !== 3 && modbusDataPoint.functionCode !== 4) {
      console.error(`ModbusTCP.addDataPoint - 不支持的功能码: ${modbusDataPoint.functionCode}，仅支持3和4`);
      return false;
    }
    
    // 检查是否已存在同名数据点
    const existingIndex = this.dataPoints.findIndex(dp => dp.name === modbusDataPoint.name);
    if (existingIndex >= 0) {
      console.log(`ModbusTCP.addDataPoint - 更新已存在的数据点: ${modbusDataPoint.name}`);
      this.dataPoints[existingIndex] = modbusDataPoint;
    } else {
      console.log(`ModbusTCP.addDataPoint - 添加新数据点: ${modbusDataPoint.name}`);
      this.dataPoints.push(modbusDataPoint);
    }
    
    // 初始化值记录
    if (!this.dataValues[modbusDataPoint.name]) {
      this.dataValues[modbusDataPoint.name] = {
        value: null,
        timestamp: null,
        quality: 'UNKNOWN'
      };
    }
    
    console.log(`ModbusTCP.addDataPoint - 当前数据点数量: ${this.dataPoints.length}`);
    return true;
  }

  // 移除数据点
  removeDataPoint(index) {
    if (index >= 0 && index < this.dataPoints.length) {
      const name = this.dataPoints[index].name;
      this.dataPoints.splice(index, 1);
      delete this.dataValues[name];
    }
  }

  // 轮询单个数据点
  pollDataPoint(index) {
    if (index < 0 || index >= this.dataPoints.length) {
      console.error(`ModbusTCP.pollDataPoint - 数据点索引无效: ${index}`);
      return;
    }
    
    const dataPoint = this.dataPoints[index];
    console.log(`===== ModbusTCP.pollDataPoint =====`);
    console.log(`- 轮询数据点: ${dataPoint.name}, 地址: ${dataPoint.address}, 功能码: ${dataPoint.functionCode}`);
    console.log(`- 当前事务ID: ${dataPoint.lastTransactionId || '未设置'}`);
    
    let transactionId;
    
    try {
      // 确保地址是数字
      const address = parseInt(dataPoint.address);
      if (isNaN(address)) {
        throw new Error(`数据点地址无效: ${dataPoint.address}`);
      }
      
      // 根据功能码选择读取方法
      if (dataPoint.functionCode === 3) {
        const quantity = dataPoint.format === 'INT32' || dataPoint.format === 'UINT32' || dataPoint.format === 'FLOAT32' ? 2 : 1;
        console.log(`- 读取保持寄存器, 地址: ${address}, 数量: ${quantity}`);
        transactionId = this.readHoldingRegisters(address, quantity);
        console.log(`- 获取到新事务ID: ${transactionId}`);
      } else if (dataPoint.functionCode === 4) {
        const quantity = dataPoint.format === 'INT32' || dataPoint.format === 'UINT32' || dataPoint.format === 'FLOAT32' ? 2 : 1;
        console.log(`- 读取输入寄存器, 地址: ${address}, 数量: ${quantity}`);
        transactionId = this.readInputRegisters(address, quantity);
        console.log(`- 获取到新事务ID: ${transactionId}`);
      } else {
        console.error(`- 不支持的功能码: ${dataPoint.functionCode}`);
        return;
      }
      
      // 保存事务ID，用于更新数据点值
      if (transactionId) {
        console.log(`- 更新事务ID: ${dataPoint.lastTransactionId || '未设置'} -> ${transactionId}`);
        dataPoint.lastTransactionId = transactionId;
        
        // 创建一个映射表，将新的事务ID与数据点关联起来
        if (!this.transactionToDataPointMap) {
          this.transactionToDataPointMap = new Map();
        }
        this.transactionToDataPointMap.set(transactionId, dataPoint);
        console.log(`- 已创建事务ID ${transactionId} 与数据点 ${dataPoint.name} 的映射`);
      } else {
        console.warn(`- 未能获取有效的事务ID`);
      }
    } catch (err) {
      console.error(`- 轮询数据点"${dataPoint.name}"失败:`, err);
    }
  }

  // 开始轮询所有数据点
  startPolling(interval) {
    console.log(`ModbusTCP.startPolling - 开始轮询，间隔: ${interval || this.pollingInterval}ms`);
    
    if (interval) {
      this.pollingInterval = interval;
    }
    
    if (this.pollingTimer) {
      console.log('ModbusTCP.startPolling - 清除现有轮询定时器');
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    
    if (this.dataPoints.length === 0) {
      console.warn('ModbusTCP.startPolling - 没有配置数据点，轮询将无效');
    } else {
      console.log(`ModbusTCP.startPolling - 将轮询 ${this.dataPoints.length} 个数据点`);
      
      // 显示前几个数据点信息
      for (let i = 0; i < Math.min(this.dataPoints.length, 3); i++) {
        const dp = this.dataPoints[i];
        console.log(`  - 数据点 ${i+1}: ${dp.name}, 地址: ${dp.address}, 功能码: ${dp.functionCode}`);
      }
      
      if (this.dataPoints.length > 3) {
        console.log(`  ... 以及其他 ${this.dataPoints.length - 3} 个数据点`);
      }
    }
    
    this.pollingTimer = setInterval(() => {
      console.log(`ModbusTCP.startPolling - 执行轮询周期 (${new Date().toISOString()})`);
      
      if (this.dataPoints.length === 0) {
        console.warn('ModbusTCP.startPolling - 没有数据点需要轮询');
        return;
      }
      
      for (let i = 0; i < this.dataPoints.length; i++) {
        this.pollDataPoint(i);
      }
    }, this.pollingInterval);
    
    return true;
  }

  // 停止轮询
  stopPolling() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  // 获取所有数据点的当前值
  getAllDataValues() {
    console.log(`===== ModbusTCP.getAllDataValues 开始 =====`);
    
    // 为每个数据点添加最新的事务ID信息
    const dataPointsWithTransactionId = {};
    
    // 使用现有的数据值对象
    for (const key in this.dataValues) {
      // 复制原有信息
      dataPointsWithTransactionId[key] = { ...this.dataValues[key] };
      
      // 添加事务ID
      const dataPoint = this.dataPoints.find(dp => dp.name === key);
      if (dataPoint && dataPoint.lastTransactionId) {
        dataPointsWithTransactionId[key].transactionId = dataPoint.lastTransactionId;
        console.log(`- 数据点 ${key}: 添加事务ID ${dataPoint.lastTransactionId}`);
      } else {
        console.log(`- 数据点 ${key}: 未找到事务ID`);
      }
    }
    
    console.log(`- 返回${Object.keys(dataPointsWithTransactionId).length}个数据点值`);
    
    // 检查是否有变化（仅用于日志记录，不再影响返回结果）
    if (this.lastReturnedValues) {
      console.log(`- 与上次返回值比较:`);
      let changesFound = false;
      
      for (const key in dataPointsWithTransactionId) {
        const oldValue = this.lastReturnedValues[key]?.value;
        const newValue = dataPointsWithTransactionId[key]?.value;
        const oldTransactionId = this.lastReturnedValues[key]?.transactionId;
        const newTransactionId = dataPointsWithTransactionId[key]?.transactionId;
        
        if (oldValue !== newValue || oldTransactionId !== newTransactionId) {
          console.log(`  - ${key}: 值 ${oldValue} -> ${newValue}, 事务ID ${oldTransactionId} -> ${newTransactionId} (有变化)`);
          changesFound = true;
        }
      }
      
      if (!changesFound) {
        console.log(`  - 没有检测到任何变化`);
      }
    }
    
    // 保存当前返回值用于下次比较
    this.lastReturnedValues = JSON.parse(JSON.stringify(dataPointsWithTransactionId));
    
    console.log(`===== ModbusTCP.getAllDataValues 结束 =====`);
    return dataPointsWithTransactionId;
  }

  // 获取数据点列表
  getDataPoints() {
    return this.dataPoints.map(dp => ({
      name: dp.name,
      address: dp.address,
      functionCode: dp.functionCode,
      format: dp.format,
      scale: dp.scale,
      unit: dp.unit
    }));
  }

  // 检查连接状态并尝试重连
  checkConnection() {
    return new Promise((resolve, reject) => {
      // 如果客户端不存在，肯定是断开的
      if (!this.socket) {
        this.connected = false;
        reject(new Error('未连接到Modbus服务器'));
        return;
      }
      
      // 如果客户端存在但标记为未连接
      if (!this.connected) {
        reject(new Error('Modbus连接已断开'));
        return;
      }
      
      // 使用keepAliveAddress作为测试地址，默认为0
      const testAddress = (this.keepAliveAddress !== undefined) ? this.keepAliveAddress : 0;
      const testTransactionId = this.getNextTransactionId();
      
      // 简单的ping - 尝试读取指定地址的寄存器
      try {
        console.log(`执行连接检查，使用地址: ${testAddress}`);
        
        // 构建读取单个寄存器的请求帧
        const buffer = Buffer.alloc(12);
        buffer.writeUInt16BE(testTransactionId, 0);  // 事务ID
        buffer.writeUInt16BE(0, 2);                 // 协议ID (总是0)
        buffer.writeUInt16BE(6, 4);                 // 长度
        buffer.writeUInt8(this.unitId, 6);          // 单元ID
        buffer.writeUInt8(3, 7);                    // 功能码 (03 - 读保持寄存器)
        buffer.writeUInt16BE(testAddress, 8);       // 起始地址
        buffer.writeUInt16BE(1, 10);                // 寄存器数量 (1)
        
        // 创建超时计时器
        const timeout = setTimeout(() => {
          this.removeListener('data', responseHandler);
          
          // 连接已断开
          this.connected = false;
          this.emit('disconnected');
          reject(new Error('连接检查超时'));
        }, 2000); // 使用较短的超时时间
        
        // 响应处理函数
        const responseHandler = (response) => {
          if (response.transactionId === testTransactionId) {
            clearTimeout(timeout);
            this.removeListener('data', responseHandler);
            
            // 连接正常，即使返回异常也表示通信正常
            resolve(true);
          }
        };
        
        // 添加一次性监听器
        this.once('data', responseHandler);
        
        // 添加错误监听器，但异常响应不视为连接问题
        this.once('error', (error) => {
          if (error.transactionId === testTransactionId) {
            clearTimeout(timeout);
            this.removeListener('data', responseHandler);
            
            // 如果是错误码2(非法地址)，依然认为连接正常
            if (error.code === 2) {
              console.log("连接检查收到非法地址错误，但通信正常");
              resolve(true);
              return;
            }
            
            reject(error);
          }
        });
        
        // 发送测试请求
        this.socket.write(buffer);
      } catch (err) {
        // 发送失败，说明连接已断开
        this.connected = false;
        this.emit('disconnected');
        reject(err);
      }
    });
  }

  // 更新保活配置
  updateKeepAliveConfig(config) {
    this.log('Updating keep-alive configuration:', config);
    
    const restart = this.keepAliveTimer !== null && config.enabled;
    
    // 如果正在运行，先停止
    if (this.keepAliveTimer) {
      this.stopKeepAlive();
    }
    
    // 更新配置
    this.keepAliveEnabled = config.enabled !== undefined ? config.enabled : this.keepAliveEnabled;
    this.keepAliveInterval = config.interval || this.keepAliveInterval;
    this.keepAliveAddress = config.address !== undefined ? config.address : this.keepAliveAddress;
    this.keepAliveFunctionCode = config.functionCode || this.keepAliveFunctionCode;
    
    // 如果需要，重新启动
    if (restart) {
      this.startKeepAlive();
    }
    
    return {
      enabled: this.keepAliveEnabled,
      interval: this.keepAliveInterval,
      address: this.keepAliveAddress,
      functionCode: this.keepAliveFunctionCode
    };
  }

  /**
   * 将寄存器值转换为二进制字符串，便于位操作和显示
   * @param {number} registerValue - 寄存器值(16位无符号整数)
   * @returns {string} - 16位二进制字符串表示(高位在左)
   */
  registerToBinaryString(registerValue) {
    // 确保值是有效的16位无符号整数
    const value = registerValue & 0xFFFF;
    // 转换为二进制字符串并补齐16位
    return value.toString(2).padStart(16, '0');
  }

  /**
   * 从寄存器值中获取指定位的值
   * @param {number} registerValue - 寄存器值
   * @param {number} bitPosition - 位位置(0-15，0表示最低位)
   * @returns {number} - 位值(0或1)
   */
  getBitFromRegister(registerValue, bitPosition) {
    if (bitPosition < 0 || bitPosition > 15) {
      throw new Error('位位置必须在0到15之间');
    }
    // 按位与操作提取对应位的值
    return (registerValue & (1 << bitPosition)) ? 1 : 0;
  }

  /**
   * 设置寄存器中指定位的值，不影响其他位
   * @param {number} registerValue - 原始寄存器值
   * @param {number} bitPosition - 位位置(0-15，0表示最低位)
   * @param {number} bitValue - 要设置的位值(0或1)
   * @returns {number} - 设置位后的寄存器值
   */
  setBitInRegister(registerValue, bitPosition, bitValue) {
    if (bitPosition < 0 || bitPosition > 15) {
      throw new Error('位位置必须在0到15之间');
    }
    if (bitValue !== 0 && bitValue !== 1) {
      throw new Error('位值必须为0或1');
    }
    
    // 为确保操作的是16位值
    const value = registerValue & 0xFFFF;
    
    // 创建位掩码
    const mask = 1 << bitPosition;
    
    if (bitValue === 1) {
      // 设置位值为1: 按位或操作
      return value | mask;
    } else {
      // 设置位值为0: 按位与操作(取反掩码)
      return value & ~mask;
    }
  }

  /**
   * 获取寄存器中所有位的值
   * @param {number} registerValue - 寄存器值
   * @returns {Array<number>} - 16个位值的数组(索引0是最低位)
   */
  getAllBitsFromRegister(registerValue) {
    const bits = [];
    for (let i = 0; i < 16; i++) {
      bits.push(this.getBitFromRegister(registerValue, i));
    }
    return bits;
  }

  /**
   * 触发告警
   * @param {string} identifier 数据点标识符
   * @param {string} content 告警内容
   */
  triggerAlarm(identifier, content) {
    // 如果告警内容不存在，则不触发
    if (!content) return;
    
    console.log(`[ModbusTCP] 触发告警: ${identifier}, 内容: ${content}`);
    
    // 初始化alarmPlayingState（如果不存在）
    if (!this.alarmPlayingState) {
      console.log('[ModbusTCP] 初始化alarmPlayingState对象');
      this.alarmPlayingState = {
        isPlaying: false,       // 是否正在播放告警
        activeAlarms: [],       // 当前活动的告警列表
        lastAlarmStates: {},    // 记录上一次告警状态 {identifier: {value: 0/1, triggered: true/false}}
        loopCounter: 0,         // 循环计数
        paused: false,          // 告警是否被暂停
        alarmCount: 0,          // 告警触发次数
        nextAlarmTime: null,    // 下次告警时间
        alarmHistory: [],       // 告警历史记录
        alarmFirstTriggerTime: {} // 记录每个告警首次触发时间
      };
    }
    
    // 更新告警状态
    if (this.alarmPlayingState.lastAlarmStates[identifier]) {
      this.alarmPlayingState.lastAlarmStates[identifier] = {
        value: 1,
        triggered: true
      };
      console.log(`[ModbusTCP] 更新告警状态: ${identifier} = 已触发`);
    } else {
      this.alarmPlayingState.lastAlarmStates[identifier] = {
        value: 1,
        triggered: true
      };
      console.log(`[ModbusTCP] 创建告警状态: ${identifier} = 已触发`);
    }
    
    // 检查告警是否已在活动列表中
    const hasExistingAlarm = this.alarmPlayingState.activeAlarms.includes(content);
    console.log(`[ModbusTCP] 告警 "${content}" 是否已在活动列表中: ${hasExistingAlarm}`);
    
    // 生成当前时间戳
    const now = new Date();
    const triggerTime = now.toISOString();
    
    // 如果告警已存在，只更新触发时间，否则记录首次触发时间
    if (hasExistingAlarm) {
      // 不更改首次触发时间，保留原始记录
      console.log(`[ModbusTCP] 告警已存在，保留原始触发时间: ${this.alarmPlayingState.alarmFirstTriggerTime[content]}`);
    } else {
      // 记录首次触发时间
      this.alarmPlayingState.alarmFirstTriggerTime[content] = triggerTime;
      console.log(`[ModbusTCP] 记录首次告警触发时间: ${content} = ${triggerTime}`);
    }
    
    // 清除上次清除时间记录（如果存在）
    if (this.alarmPlayingState.alarmLastClearedTime && 
        this.alarmPlayingState.alarmLastClearedTime[content]) {
      delete this.alarmPlayingState.alarmLastClearedTime[content];
      console.log(`[ModbusTCP] 清除上次告警解除时间记录: ${content}`);
    }
    
    // 更新活动告警列表
    if (!hasExistingAlarm) {
      console.log(`[ModbusTCP] 添加新告警到活动列表: ${content}`);
      this.alarmPlayingState.activeAlarms.push(content);
      
      // 只有新告警才增加计数
      this.alarmPlayingState.alarmCount++;
      console.log(`[ModbusTCP] 增加告警计数: ${this.alarmPlayingState.alarmCount}`);
    } else {
      console.log(`[ModbusTCP] 告警已在活动列表中: ${content}，不增加计数`);
    }
    
    // 发送告警事件
    console.log(`[ModbusTCP] 发送告警事件: ${identifier}, ${content}`);
    this.emit('alarm', {
      identifier: identifier,
      content: content,
      firstTriggerTime: this.alarmPlayingState.alarmFirstTriggerTime[content],
      isNew: !hasExistingAlarm
    });
    
    // 将告警信息存储到localStorage
    try {
      console.log(`[ModbusTCP] 将告警信息存储到localStorage`);
      const alarmState = {
        activeAlarms: this.alarmPlayingState.activeAlarms,
        alarmFirstTriggerTime: this.alarmPlayingState.alarmFirstTriggerTime,
        timestamp: triggerTime
      };
      
      // 使用setTimeout确保在下一个事件循环中触发storage事件
      setTimeout(() => {
        // 检查localStorage是否可用（在Node.js环境中可能不可用）
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('alarmState', JSON.stringify(alarmState));
          console.log(`[ModbusTCP] 告警状态已更新到localStorage:`, alarmState);
        } else {
          console.log(`[ModbusTCP] localStorage不可用，跳过存储告警状态`);
        }
      }, 0);
    } catch (error) {
      console.error(`[ModbusTCP] 存储告警信息到localStorage失败:`, error);
    }
    
    // 返回告警信息
    console.log(`[ModbusTCP] 告警触发完成，返回告警信息`);
    return {
      identifier: identifier,
      content: content,
      firstTriggerTime: this.alarmPlayingState.alarmFirstTriggerTime[content],
      isNew: !hasExistingAlarm
    };
  }

  /**
   * 清除告警
   * @param {string} identifier 数据点标识符
   * @param {string} content 告警内容
   */
  clearAlarm(identifier, content) {
    console.log(`[ModbusTCP] 清除告警: ${identifier}, 内容: ${content}`);
    
    // 如果告警状态对象不存在，则无需处理
    if (!this.alarmPlayingState) {
      console.log('[ModbusTCP] 告警状态对象不存在，无需清除');
      return false;
    }
    
    // 查找匹配的告警内容
    const alarmIndex = this.alarmPlayingState.activeAlarms.findIndex(alarm => {
      // 精确匹配
      if (alarm === content) return true;
      
      // 检查是否为告警解除消息（包含"已解除"字样）
      if (content.includes('已解除')) {
        const baseContent = content.replace(' 已解除', '');
        return alarm === baseContent || alarm.includes(baseContent);
      }
      
      // 检查是否基于标识符匹配
      if (identifier && alarm.includes(identifier)) return true;
      
      return false;
    });
    
    // 如果找到匹配的告警，从活动告警列表中移除
    if (alarmIndex !== -1) {
      const removedAlarm = this.alarmPlayingState.activeAlarms.splice(alarmIndex, 1)[0];
      console.log(`[ModbusTCP] 已从活动告警列表中移除: ${removedAlarm}`);
      
      // 不再删除首次触发时间记录，而是保留它以追踪告警历史
      // 关键修改：记录告警清除时间而不是删除触发时间
      if (!this.alarmPlayingState.alarmLastClearedTime) {
        this.alarmPlayingState.alarmLastClearedTime = {};
      }
      this.alarmPlayingState.alarmLastClearedTime[removedAlarm] = new Date().toISOString();
      console.log(`[ModbusTCP] 记录告警清除时间: ${removedAlarm} = ${this.alarmPlayingState.alarmLastClearedTime[removedAlarm]}`);
      
      // 更新告警状态 - 确保设置为未触发状态
      if (this.alarmPlayingState.lastAlarmStates[identifier]) {
        this.alarmPlayingState.lastAlarmStates[identifier] = {
          value: 0,
          triggered: false
        };
        console.log(`[ModbusTCP] 已重置告警状态: ${identifier} = 未触发`);
      } else {
        // 如果之前没有这个标识符的状态，创建一个
        this.alarmPlayingState.lastAlarmStates[identifier] = {
          value: 0,
          triggered: false
        };
        console.log(`[ModbusTCP] 创建告警状态: ${identifier} = 未触发`);
      }
      
      // 如果没有活跃告警了，停止告警循环
      if (this.alarmPlayingState.activeAlarms.length === 0) {
        this.alarmPlayingState.isPlaying = false;
        console.log('[ModbusTCP] 没有活跃告警，已停止告警循环');
      }
      
      // 发送告警解除事件
      this.emit('alarmCleared', {
        identifier,
        content,
        clearedTime: this.alarmPlayingState.alarmLastClearedTime[removedAlarm]
      });
      
      // 将更新后的告警信息存储到localStorage
      try {
        console.log(`[ModbusTCP] 将更新后的告警信息存储到localStorage`);
        const alarmState = {
          activeAlarms: this.alarmPlayingState.activeAlarms,
          alarmFirstTriggerTime: this.alarmPlayingState.alarmFirstTriggerTime,
          alarmLastClearedTime: this.alarmPlayingState.alarmLastClearedTime,
          timestamp: new Date().toISOString()
        };
        
        // 使用setTimeout确保在下一个事件循环中触发storage事件
        setTimeout(() => {
          localStorage.setItem('alarmState', JSON.stringify(alarmState));
          console.log(`[ModbusTCP] 告警状态已更新到localStorage:`, alarmState);
        }, 0);
      } catch (error) {
        console.error(`[ModbusTCP] 存储告警信息到localStorage失败:`, error);
      }
      
      return true;
    } else {
      console.log(`[ModbusTCP] 未找到匹配的告警: ${content}`);
      return false;
    }
  }
}

module.exports = ModbusTCP; 
/**
 * 告警调试工具 - 用于记录和调试告警相关操作
 */

const fs = require('fs');
const path = require('path');

class AlarmDebugger {
  constructor() {
    this.logDir = path.join(__dirname, '..', 'logs');
    this.logFile = path.join(this.logDir, 'alarm-debug.log');
    this.enabled = true;
    this.maxLogSize = 10 * 1024 * 1024; // 10MB
    
    // 确保日志目录存在
    this._ensureLogDirectory();
    
    console.log('AlarmDebugger实例已创建');
  }
  
  /**
   * 确保日志目录存在
   * @private
   */
  _ensureLogDirectory() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
        console.log(`已创建日志目录: ${this.logDir}`);
      }
    } catch (error) {
      console.error(`创建日志目录失败: ${error.message}`);
    }
  }
  
  /**
   * 记录一般日志
   * @param {string} message 日志消息
   * @param {Object} data 附加数据
   */
  log(message, data = null) {
    if (!this.enabled) return;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'INFO',
      message,
      data
    };
    
    this._writeLog(logEntry);
  }
  
  /**
   * 记录告警触发
   * @param {string} identifier 数据点标识符
   * @param {string} content 告警内容
   * @param {*} value 触发告警的值
   * @param {*} threshold 告警阈值
   */
  logAlarmTriggered(identifier, content, value, threshold) {
    if (!this.enabled) return;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'ALARM_TRIGGERED',
      identifier,
      content,
      value,
      threshold
    };
    
    this._writeLog(logEntry);
  }
  
  /**
   * 记录告警解除
   * @param {string} identifier 数据点标识符
   * @param {string} content 告警内容
   * @param {*} value 当前值
   */
  logAlarmCleared(identifier, content, value) {
    if (!this.enabled) return;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'ALARM_CLEARED',
      identifier,
      content,
      value
    };
    
    this._writeLog(logEntry);
  }
  
  /**
   * 记录告警数据库操作
   * @param {string} operation 操作类型
   * @param {Object} data 操作数据
   * @param {string} result 操作结果
   */
  logAlarmDbOperation(operation, data, result) {
    if (!this.enabled) return;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'ALARM_DB_OPERATION',
      operation,
      data,
      result
    };
    
    this._writeLog(logEntry);
  }
  
  /**
   * 记录错误
   * @param {string} message 错误消息
   * @param {Error} error 错误对象
   */
  logError(message, error) {
    if (!this.enabled) return;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'ERROR',
      message,
      error: error ? {
        message: error.message,
        stack: error.stack
      } : null
    };
    
    this._writeLog(logEntry);
  }
  
  /**
   * 写入日志
   * @param {Object} logEntry 日志条目
   * @private
   */
  _writeLog(logEntry) {
    try {
      // 检查日志文件大小
      this._checkLogFileSize();
      
      // 将日志条目转换为字符串
      const logString = JSON.stringify(logEntry) + '\n';
      
      // 追加到日志文件
      fs.appendFileSync(this.logFile, logString, 'utf8');
    } catch (error) {
      console.error(`写入日志失败: ${error.message}`);
    }
  }
  
  /**
   * 检查日志文件大小，如果超过最大大小则进行轮转
   * @private
   */
  _checkLogFileSize() {
    try {
      if (fs.existsSync(this.logFile)) {
        const stats = fs.statSync(this.logFile);
        
        if (stats.size >= this.maxLogSize) {
          // 创建备份文件名
          const backupFile = `${this.logFile}.${Date.now()}.bak`;
          
          // 重命名当前日志文件
          fs.renameSync(this.logFile, backupFile);
          
          console.log(`日志文件已轮转: ${this.logFile} -> ${backupFile}`);
        }
      }
    } catch (error) {
      console.error(`检查日志文件大小失败: ${error.message}`);
    }
  }
  
  /**
   * 启用日志记录
   */
  enable() {
    this.enabled = true;
    this.log('告警调试日志已启用');
  }
  
  /**
   * 禁用日志记录
   */
  disable() {
    this.log('告警调试日志已禁用');
    this.enabled = false;
  }
  
  /**
   * 获取单例实例
   * @returns {AlarmDebugger} 实例
   */
  static getInstance() {
    if (!AlarmDebugger.instance) {
      AlarmDebugger.instance = new AlarmDebugger();
    }
    return AlarmDebugger.instance;
  }
}

module.exports = AlarmDebugger; 
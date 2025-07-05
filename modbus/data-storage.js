/**
 * Modbus 数据存储模块
 * 
 * 已弃用：此模块已被MySQL数据库替代
 * 保留此模块仅为兼容性目的，新代码应直接使用MySQL数据库
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const debug = require('debug')('modbus:data-storage');

class DataStorage {
  constructor() {
    this.dataDir = path.join(__dirname, '../data');
    this.valuesFile = path.join(this.dataDir, 'values.json');
    this.initialized = false;
    this.values = [];
    
    console.warn('警告: DataStorage模块已弃用，请使用MySQL数据库代替');
    
    // 确保数据目录存在
    this._ensureDataDir();
    // 初始化存储
    this._initStorage();
  }
  
  /**
   * 确保数据目录存在
   * @private
   */
  _ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      try {
        fs.mkdirSync(this.dataDir, { recursive: true });
        debug('已创建数据目录:', this.dataDir);
      } catch (error) {
        console.error('创建数据目录失败:', error);
        throw new Error(`无法创建数据目录: ${error.message}`);
      }
    }
  }
  
  /**
   * 初始化存储
   * @private
   */
  _initStorage() {
    try {
      if (fs.existsSync(this.valuesFile)) {
        const data = fs.readFileSync(this.valuesFile, 'utf8');
        this.values = JSON.parse(data);
        debug(`已加载 ${this.values.length} 条数据记录`);
      } else {
        debug('数据文件不存在，将创建新文件');
        this.values = [];
        this._saveValues();
      }
      this.initialized = true;
    } catch (error) {
      console.error('初始化数据存储失败:', error);
      this.values = [];
      this._saveValues();
    }
  }
  
  /**
   * 保存值到文件
   * @private
   */
  _saveValues() {
    try {
      fs.writeFileSync(this.valuesFile, JSON.stringify(this.values, null, 2), 'utf8');
      debug(`已将 ${this.values.length} 条记录保存到文件`);
    } catch (error) {
      console.error('保存数据失败:', error);
      throw new Error(`保存数据失败: ${error.message}`);
    }
  }
  
  /**
   * 存储数据点值
   * @param {Array} values 要存储的数据点值数组
   * @returns {Object} 存储结果
   * @deprecated 已弃用，请使用MySQL数据库代替
   */
  async storeValues(values) {
    console.warn('DataStorage.storeValues() 已弃用，请使用MySQL数据库代替');
    
    if (!this.initialized) {
      await this._initStorage();
    }
    
    const timestamp = new Date().toISOString();
    const storedValues = values.map(v => ({
      id: uuidv4(),
      timestamp,
      identifier: v.identifier,
      value: v.value,
      quality: v.quality || 'GOOD',
      unit: v.unit || ''
    }));
    
    this.values = [...this.values, ...storedValues];
    
    // 如果记录过多，可以移除最旧的记录以保持性能
    const maxRecords = 10000; // 最大记录数
    if (this.values.length > maxRecords) {
      this.values = this.values.slice(-maxRecords);
      debug(`数据记录超过限制，已删除旧记录，当前记录数: ${this.values.length}`);
    }
    
    this._saveValues();
    
    return {
      success: true,
      count: storedValues.length,
      timestamp
    };
  }
  
  /**
   * 获取最新存储的值
   * @returns {Array} 最新的数据点值数组
   * @deprecated 已弃用，请使用MySQL数据库代替
   */
  async getLatestValues() {
    console.warn('DataStorage.getLatestValues() 已弃用，请使用MySQL数据库代替');
    
    if (!this.initialized) {
      await this._initStorage();
    }
    
    // 获取每个数据点的最新值
    const latestMap = new Map();
    
    // 反向遍历以便更快找到最新值
    for (let i = this.values.length - 1; i >= 0; i--) {
      const item = this.values[i];
      if (!latestMap.has(item.identifier)) {
        latestMap.set(item.identifier, item);
      }
    }
    
    return Array.from(latestMap.values());
  }
  
  /**
   * 获取数据点的历史值
   * @param {string} identifier 数据点标识符
   * @param {Date} startTime 开始时间
   * @param {Date} endTime 结束时间
   * @returns {Array} 指定时间范围内的历史数据
   * @deprecated 已弃用，请使用MySQL数据库代替
   */
  async getHistoryValues(identifier, startTime, endTime) {
    console.warn('DataStorage.getHistoryValues() 已弃用，请使用MySQL数据库代替');
    
    if (!this.initialized) {
      await this._initStorage();
    }
    
    const startTimeStr = startTime.toISOString();
    const endTimeStr = endTime.toISOString();
    
    debug(`查询历史数据: ${identifier}, 从 ${startTimeStr} 到 ${endTimeStr}`);
    
    // 过滤出符合条件的历史记录
    return this.values.filter(item => 
      item.identifier === identifier && 
      item.timestamp >= startTimeStr && 
      item.timestamp <= endTimeStr
    ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }
}

// 创建单例实例
const dataStorage = new DataStorage();

module.exports = dataStorage; 
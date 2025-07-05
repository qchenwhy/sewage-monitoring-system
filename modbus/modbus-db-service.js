/**
 * Modbus数据库服务
 * 
 * 将Modbus服务与数据库管理器集成，提供数据存储和检索功能
 */

const dbManager = require('./db-manager');
// 移除对 modbus-service 的直接引用，避免循环依赖
// const modbusService = require('./modbus-service').getInstance();

class ModbusDbService {
  constructor() {
    this.initialized = false;
    this.storageInterval = null;
    this.storageIntervalMs = 60000; // 默认每分钟存储一次数据
    this.lastValues = new Map(); // 存储上一次的数据值，用于检测变化
    this.modbusService = null; // 将在初始化时设置
  }

  /**
   * 初始化数据库服务
   * @param {Object} mysql MySQL模块实例
   * @returns {Promise<boolean>} 初始化是否成功
   */
  async initialize(mysql) {
    if (this.initialized) return true;

    try {
      console.log('初始化Modbus数据库服务...');
      
      // 初始化数据库管理器
      const dbInitResult = await dbManager.initialize(mysql);
      if (!dbInitResult) {
        throw new Error('数据库管理器初始化失败');
      }
      
      // 延迟获取 modbusService 实例以避免循环依赖
      try {
        const modbusServiceModule = require('./modbus-service');
        this.modbusService = modbusServiceModule.getInstance();
        
        // 监听Modbus数据更新事件
        if (this.modbusService) {
          this._setupDataListeners();
        } else {
          console.warn('无法获取Modbus服务实例，部分功能可能不可用');
        }
      } catch (err) {
        console.warn('获取Modbus服务实例失败:', err.message);
      }
      
      this.initialized = true;
      console.log('Modbus数据库服务初始化成功');
      return true;
    } catch (error) {
      console.error('Modbus数据库服务初始化失败:', error);
      return false;
    }
  }

  /**
   * 设置数据监听器
   * @private
   */
  _setupDataListeners() {
    if (!this.modbusService) {
      console.warn('Modbus服务实例不可用，无法设置数据监听器');
      return;
    }
    
    // 监听数据更新事件，触发数据变化检测和存储
    this.modbusService.on('dataUpdate', async (dataPointName, newValue) => {
      console.log(`[数据库服务] 数据点 ${dataPointName} 更新为 ${JSON.stringify(newValue)}`);
      
      try {
        // 获取该数据点的旧值
        const oldValue = this.lastValues.get(dataPointName);
        
        // 检查数据是否发生变化
        const hasChanged = this._checkValueChanged(oldValue, newValue);
        
        if (hasChanged) {
          console.log(`[数据库服务] 数据点 ${dataPointName} 发生变化，旧值: ${JSON.stringify(oldValue)}, 新值: ${JSON.stringify(newValue)}`);
          
          // 更新缓存的值
          this.lastValues.set(dataPointName, {...newValue});
          
          // 立即存储变化的数据点
          await this._storeChangedDataPoint(dataPointName, oldValue, newValue);
        } else {
          // 如果值未变化，仅更新缓存
          this.lastValues.set(dataPointName, {...newValue});
          console.log(`[数据库服务] 数据点 ${dataPointName} 值未变化，不存储`);
        }
      } catch (error) {
        console.error(`[数据库服务] 处理数据点 ${dataPointName} 变化时出错:`, error);
      }
    });
    
    // 初始化时加载所有数据点的当前值
    this._loadInitialValues();
  }
  
  /**
   * 加载所有数据点的初始值
   * @private
   */
  async _loadInitialValues() {
    if (!this.modbusService) {
      console.warn('Modbus服务实例不可用，无法加载初始值');
      return;
    }
    
    try {
      // 获取所有数据点的当前值
      const values = this.modbusService.getAllDataValues();
      
      if (values) {
        // 初始化缓存
        Object.entries(values).forEach(([name, value]) => {
          this.lastValues.set(name, {...value});
        });
        
        console.log(`[数据库服务] 已加载 ${this.lastValues.size} 个数据点的初始值`);
      }
    } catch (error) {
      console.error('[数据库服务] 加载初始值失败:', error);
    }
  }
  
  /**
   * 检查值是否发生变化
   * @param {Object} oldValue 旧的数据值
   * @param {Object} newValue 新的数据值
   * @returns {boolean} 是否发生变化
   * @private
   */
  _checkValueChanged(oldValue, newValue) {
    // 如果旧值不存在，认为是初始数据
    if (!oldValue) return true;
    
    // 检查值是否变化
    // 对于数字类型，使用一定的容差值
    if (typeof newValue.value === 'number' && typeof oldValue.value === 'number') {
      const tolerance = 0.000001; // 微小容差
      return Math.abs(newValue.value - oldValue.value) > tolerance;
    }
    
    // 其他类型使用严格相等比较
    return String(newValue.value) !== String(oldValue.value);
  }
  
  /**
   * 存储变化的数据点
   * @param {string} dataPointName 数据点名称
   * @param {Object} oldValue 旧的数据值
   * @param {Object} newValue 新的数据值
   * @returns {Promise<void>}
   * @private
   */
  async _storeChangedDataPoint(dataPointName, oldValue, newValue) {
    if (!this.modbusService) {
      console.warn('Modbus服务实例不可用，无法存储数据点变化');
      return;
    }
    
    try {
      // 获取数据点对象
      const dataPoints = this.modbusService.getAllDataPoints();
      const dataPoint = dataPoints.find(dp => dp.name === dataPointName);
      
      if (!dataPoint) {
        throw new Error(`未找到数据点: ${dataPointName}`);
      }
      
      // 创建变化描述
      let changeDescription = '';
      if (oldValue) {
        changeDescription = `从 ${oldValue.value} 变化到 ${newValue.value}`;
      } else {
        changeDescription = `初始值 ${newValue.value}`;
      }
      
      // 创建只包含变化数据点的数据对象
      const dataPointsToStore = [dataPoint];
      const valuesToStore = { [dataPointName]: { ...newValue, changeDescription } };
      
      // 调用数据库管理器的存储方法，传入变化描述
      const result = await dbManager.storeLatestValues(dataPointsToStore, valuesToStore);
      
      if (result.success) {
        console.log(`[数据库服务] 成功存储数据点 ${dataPointName} 的变化: ${changeDescription}`);
      } else {
        console.error(`[数据库服务] 存储数据点 ${dataPointName} 的变化失败:`, result.error);
      }
    } catch (error) {
      console.error(`[数据库服务] 存储数据点 ${dataPointName} 时出错:`, error);
    }
  }

  /**
   * 启动自动数据存储
   * @param {number} intervalMs 存储间隔（毫秒）
   * @returns {boolean} 是否成功启动
   */
  startAutoStorage(intervalMs = 60000) {
    if (!this.initialized) {
      console.error('数据库服务未初始化，无法启动自动存储');
      return false;
    }
    
    if (this.storageInterval) {
      clearInterval(this.storageInterval);
    }
    
    this.storageIntervalMs = intervalMs;
    console.log(`启动自动数据存储，间隔: ${intervalMs}ms`);
    
    this.storageInterval = setInterval(async () => {
      try {
        await this.storeCurrentValues();
      } catch (error) {
        console.error('自动存储数据时出错:', error);
      }
    }, intervalMs);
    
    return true;
  }

  /**
   * 停止自动数据存储
   */
  stopAutoStorage() {
    if (this.storageInterval) {
      clearInterval(this.storageInterval);
      this.storageInterval = null;
      console.log('自动数据存储已停止');
    }
  }

  /**
   * 存储当前所有数据点的值
   * @returns {Promise<Object>} 存储结果
   */
  async storeCurrentValues() {
    if (!this.initialized) {
      throw new Error('数据库服务未初始化，无法存储数据');
    }
    
    if (!this.modbusService) {
      throw new Error('Modbus服务实例不可用，无法获取数据点值');
    }
    
    // 获取当前所有数据点和值
    const dataPoints = this.modbusService.getAllDataPoints();
    const values = this.modbusService.getAllDataValues();
    
    if (!values || Object.keys(values).length === 0) {
      console.warn('没有可用的数据点值，跳过存储');
      return {
        success: false,
        error: '没有可用的数据点值'
      };
    }
    
    console.log(`准备存储 ${Object.keys(values).length} 个数据点的值...`);
    
    // 调用数据库管理器存储值
    const result = await dbManager.storeLatestValues(dataPoints, values);
    
    if (result.success) {
      console.log(`数据存储成功: ${result.historyInsertedCount} 条历史记录, ${result.insertedCount + result.updatedCount} 条最新值, ${result.unchangedCount} 条数据未变化`);
    } else {
      console.error(`数据存储失败: ${result.error}`);
    }
    
    return result;
  }

  /**
   * 设置Modbus服务实例
   * 这个方法允许外部设置modbusService，用于解决循环依赖问题
   * @param {Object} service Modbus服务实例
   */
  setModbusService(service) {
    this.modbusService = service;
    if (this.initialized && this.modbusService) {
      this._setupDataListeners();
    }
  }

  /**
   * 获取所有数据点的最新值
   * @returns {Promise<Array>} 数据点最新值列表
   */
  async getLatestValues() {
    if (!this.initialized) {
      throw new Error('数据库服务未初始化，无法获取数据');
    }
    
    return await dbManager.getLatestValues();
  }

  /**
   * 获取指定数据点的历史数据
   * @param {string} identifier 数据点标识符
   * @param {string|Date} startTime 开始时间
   * @param {string|Date} endTime 结束时间
   * @param {number} limit 限制记录数
   * @returns {Promise<Array>} 历史数据列表
   */
  async getHistoryValues(identifier, startTime, endTime, limit = 100) {
    if (!this.initialized) {
      throw new Error('数据库服务未初始化，无法获取数据');
    }
    
    // 格式化日期参数
    let formattedStartTime = startTime;
    let formattedEndTime = endTime;
    
    if (startTime && typeof startTime === 'string') {
      formattedStartTime = new Date(startTime);
    }
    
    if (endTime && typeof endTime === 'string') {
      formattedEndTime = new Date(endTime);
    }
    
    const historyData = await dbManager.getHistoryValues(
      identifier, 
      formattedStartTime, 
      formattedEndTime, 
      limit
    );
    
    return historyData.map(item => ({
      ...item,
      changeDescription: item.changeDescription || '无变化描述'
    }));
  }

  /**
   * 获取数据库池（用于直接执行SQL查询）
   * @returns {Object} 数据库连接池
   */
  getPool() {
    if (!this.initialized || !dbManager.pool) {
      throw new Error('数据库服务未初始化或连接池不可用');
    }
    return dbManager.pool;
  }

  /**
   * 关闭数据库服务
   * @returns {Promise<void>}
   */
  async close() {
    this.stopAutoStorage();
    
    if (this.initialized) {
      await dbManager.close();
      this.initialized = false;
      console.log('Modbus数据库服务已关闭');
    }
  }
}

// 创建单例实例
let instance = null;

// 修改为单例模式的导出方式
module.exports = {
  getInstance: () => {
    if (!instance) {
      instance = new ModbusDbService();
    }
    return instance;
  }
}; 
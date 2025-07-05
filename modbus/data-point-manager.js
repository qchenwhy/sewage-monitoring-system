const fs = require('fs');
const path = require('path');

class DataPointManager {
  constructor(configPath) {
    this.configPath = configPath || path.join(__dirname, '..', 'data', 'data-points.json');
    this.dataPoints = [];
    this.loadConfig();
  }

  // 加载配置文件
  loadConfig() {
    try {
      // 确保目录存在
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 如果配置文件不存在，创建空配置
      if (!fs.existsSync(this.configPath)) {
        this.saveConfig();
        return;
      }

      // 读取配置
      const data = fs.readFileSync(this.configPath, 'utf8');
      this.dataPoints = JSON.parse(data);
    } catch (err) {
      console.error('加载数据点配置失败:', err);
      this.dataPoints = [];
    }
  }

  // 保存配置文件
  saveConfig() {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(this.configPath, JSON.stringify(this.dataPoints, null, 2), 'utf8');
    } catch (err) {
      console.error('保存数据点配置失败:', err);
    }
  }

  // 获取所有数据点
  getAllDataPoints() {
    return [...this.dataPoints];
  }

  // 添加数据点
  addDataPoint(dataPoint) {
    // 验证数据点名称唯一性
    if (this.dataPoints.some(dp => dp.name === dataPoint.name)) {
      throw new Error(`数据点名称"${dataPoint.name}"已存在`);
    }

    // 验证标识符唯一性
    if (dataPoint.identifier && this.dataPoints.some(dp => dp.identifier === dataPoint.identifier)) {
      throw new Error(`数据点标识符"${dataPoint.identifier}"已存在`);
    }

    // 验证必要字段 - 地址现在是可选的
    if (!dataPoint.name || !dataPoint.identifier) {
      throw new Error('数据点名称和标识符是必填项');
    }

    // 验证功能码
    const accessMode = dataPoint.accessMode || 'read';
    if (accessMode === 'read' && !dataPoint.readFunctionCode) {
      throw new Error('读取模式下必须指定读取功能码');
    }
    if (accessMode === 'write' && !dataPoint.writeFunctionCode) {
      throw new Error('写入模式下必须指定写入功能码');
    }
    if (accessMode === 'readwrite' && (!dataPoint.readFunctionCode || !dataPoint.writeFunctionCode)) {
      throw new Error('读写模式下必须同时指定读取和写入功能码');
    }

    // 验证位位置（如果提供）
    if (dataPoint.bitPosition !== undefined) {
      const bitPos = parseInt(dataPoint.bitPosition, 10);
      if (isNaN(bitPos) || bitPos < 0 || bitPos > 15) {
        throw new Error('位位置必须是0到15之间的整数');
      }
    }

    // 验证POINT格式的特殊字段
    if (dataPoint.format === 'POINT') {
      // 验证源数据点标识符
      if (!dataPoint.sourceDataPointIdentifier) {
        throw new Error('POINT格式数据点必须指定源数据点标识符');
      }
      
      // 验证源数据点是否存在且为16位格式
      const sourceDataPoint = this.dataPoints.find(dp => dp.identifier === dataPoint.sourceDataPointIdentifier);
      if (!sourceDataPoint) {
        throw new Error(`源数据点标识符"${dataPoint.sourceDataPointIdentifier}"不存在`);
      }
      
      if (!['UINT16', 'INT16'].includes(sourceDataPoint.format)) {
        throw new Error('源数据点必须是UINT16或INT16格式');
      }
      
      // 验证点位位置
      if (dataPoint.pointBitPosition === undefined || dataPoint.pointBitPosition === null) {
        throw new Error('POINT格式数据点必须指定点位位置');
      }
      
      const pointBitPos = parseInt(dataPoint.pointBitPosition, 10);
      if (isNaN(pointBitPos) || pointBitPos < 0 || pointBitPos > 15) {
        throw new Error('点位位置必须是0到15之间的整数');
      }
    }

    // 添加数据点
    const newDataPoint = {
      id: Date.now().toString(),
      name: dataPoint.name,
      identifier: dataPoint.identifier,
      address: dataPoint.address,
      accessMode: accessMode,
      readFunctionCode: dataPoint.readFunctionCode,
      writeFunctionCode: dataPoint.writeFunctionCode,
      format: dataPoint.format || 'UINT16',
      scale: dataPoint.scale || 1,
      unit: dataPoint.unit || '',
      description: dataPoint.description || '',
      createdAt: new Date().toISOString()
    };
    
    // 如果提供了位位置，添加到数据点配置中
    if (dataPoint.bitPosition !== undefined) {
      newDataPoint.bitPosition = parseInt(dataPoint.bitPosition, 10);
    }

    // 如果是POINT格式，添加相关配置
    if (dataPoint.format === 'POINT') {
      newDataPoint.sourceDataPointIdentifier = dataPoint.sourceDataPointIdentifier;
      newDataPoint.pointBitPosition = parseInt(dataPoint.pointBitPosition, 10);
    }

    // 添加告警相关设置
    if (dataPoint.alarmEnabled) {
      newDataPoint.alarmEnabled = true;
      newDataPoint.alarmContent = dataPoint.alarmContent || '';
      
      // 如果是BIT或POINT类型且提供了告警类型，添加告警类型
      if ((dataPoint.format === 'BIT' || dataPoint.format === 'POINT') && dataPoint.alarmType) {
        newDataPoint.alarmType = dataPoint.alarmType;
      }
      
      // 保存低位报警设置
      if (dataPoint.lowLevelAlarm) {
        newDataPoint.lowLevelAlarm = true;
      }
    }

    this.dataPoints.push(newDataPoint);
    this.saveConfig();
    
    // 尝试在数据库中创建初始记录
    this._createInitialDbRecord(newDataPoint);
    
    return newDataPoint;
  }

  // 更新数据点
  updateDataPoint(id, updates) {
    const index = this.dataPoints.findIndex(dp => dp.id === id);
    if (index === -1) {
      throw new Error(`数据点ID"${id}"不存在`);
    }

    // 如果更新名称，检查唯一性
    if (updates.name && updates.name !== this.dataPoints[index].name) {
      if (this.dataPoints.some(dp => dp.id !== id && dp.name === updates.name)) {
        throw new Error(`数据点名称"${updates.name}"已存在`);
      }
    }

    // 如果更新标识符，检查唯一性
    if (updates.identifier && updates.identifier !== this.dataPoints[index].identifier) {
      if (this.dataPoints.some(dp => dp.id !== id && dp.identifier === updates.identifier)) {
        throw new Error(`数据点标识符"${updates.identifier}"已存在`);
      }
    }

    // 验证功能码
    const accessMode = updates.accessMode || this.dataPoints[index].accessMode;
    const readFunctionCode = updates.readFunctionCode || this.dataPoints[index].readFunctionCode;
    const writeFunctionCode = updates.writeFunctionCode || this.dataPoints[index].writeFunctionCode;

    if (accessMode === 'read' && !readFunctionCode) {
      throw new Error('读取模式下必须指定读取功能码');
    }
    if (accessMode === 'write' && !writeFunctionCode) {
      throw new Error('写入模式下必须指定写入功能码');
    }
    if (accessMode === 'readwrite' && (!readFunctionCode || !writeFunctionCode)) {
      throw new Error('读写模式下必须同时指定读取和写入功能码');
    }
    
    // 验证位位置（如果提供）
    if (updates.bitPosition !== undefined) {
      const bitPos = parseInt(updates.bitPosition, 10);
      if (isNaN(bitPos) || bitPos < 0 || bitPos > 15) {
        throw new Error('位位置必须是0到15之间的整数');
      }
    }

    // 验证POINT格式的特殊字段
    const finalFormat = updates.format || this.dataPoints[index].format;
    if (finalFormat === 'POINT') {
      const sourceDataPointIdentifier = updates.sourceDataPointIdentifier || this.dataPoints[index].sourceDataPointIdentifier;
      const pointBitPosition = updates.pointBitPosition !== undefined ? updates.pointBitPosition : this.dataPoints[index].pointBitPosition;
      
      // 验证源数据点标识符
      if (!sourceDataPointIdentifier) {
        throw new Error('POINT格式数据点必须指定源数据点标识符');
      }
      
      // 验证源数据点是否存在且为16位格式
      const sourceDataPoint = this.dataPoints.find(dp => dp.identifier === sourceDataPointIdentifier && dp.id !== id);
      if (!sourceDataPoint) {
        throw new Error(`源数据点标识符"${sourceDataPointIdentifier}"不存在`);
      }
      
      if (!['UINT16', 'INT16'].includes(sourceDataPoint.format)) {
        throw new Error('源数据点必须是UINT16或INT16格式');
      }
      
      // 验证点位位置
      if (pointBitPosition === undefined || pointBitPosition === null) {
        throw new Error('POINT格式数据点必须指定点位位置');
      }
      
      const pointBitPos = parseInt(pointBitPosition, 10);
      if (isNaN(pointBitPos) || pointBitPos < 0 || pointBitPos > 15) {
        throw new Error('点位位置必须是0到15之间的整数');
      }
    }

    // 更新数据点
    this.dataPoints[index] = {
      ...this.dataPoints[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    // 特殊处理告警启用状态
    // 如果告警被禁用，明确设置为false并清理告警相关属性
    if (updates.alarmEnabled === false) {
      this.dataPoints[index].alarmEnabled = false;
      delete this.dataPoints[index].alarmContent;
      delete this.dataPoints[index].alarmType;
      delete this.dataPoints[index].lowLevelAlarm;
    }
    // 如果告警被启用但原来没有启用，确保有告警标志
    else if (updates.alarmEnabled === true && !this.dataPoints[index].alarmEnabled) {
      this.dataPoints[index].alarmEnabled = true;
    }

    this.saveConfig();
    return this.dataPoints[index];
  }

  // 删除数据点
  deleteDataPoint(id) {
    const index = this.dataPoints.findIndex(dp => dp.id === id);
    if (index === -1) {
      throw new Error(`数据点ID"${id}"不存在`);
    }

    this.dataPoints.splice(index, 1);
    this.saveConfig();
    return true;
  }

  // 根据ID获取数据点
  getDataPointById(id) {
    return this.dataPoints.find(dp => dp.id === id);
  }

  // 根据标识符获取数据点
  getDataPointByIdentifier(identifier) {
    return this.dataPoints.find(dp => dp.identifier === identifier);
  }

  // 根据名称获取数据点
  getDataPointByName(name) {
    return this.dataPoints.find(dp => dp.name === name);
  }
  
  /**
   * 获取单例实例
   * @returns {DataPointManager} 实例
   */
  static getInstance() {
    if (!DataPointManager.instance) {
      DataPointManager.instance = new DataPointManager();
    }
    return DataPointManager.instance;
  }

  /**
   * 在数据库中为新数据点创建初始记录
   * @private
   * @param {Object} dataPoint - 数据点对象
   */
  _createInitialDbRecord(dataPoint) {
    try {
      // 尝试动态加载DbManager
      let dbManager;
      try {
        dbManager = require('./db-manager');
      } catch (err) {
        try {
          dbManager = require('../modbus/db-manager');
        } catch (err2) {
          console.error('无法加载数据库管理器，跳过创建初始记录:', err2.message);
          return;
        }
      }
      
      if (!dbManager || !dbManager.initialized) {
        console.log('数据库管理器未初始化，稍后将通过定时任务创建初始记录');
        return;
      }
      
      console.log(`为数据点 ${dataPoint.identifier} 创建数据库初始记录...`);
      
      // 准备要保存的数据点和初始值
      const dataPoints = [dataPoint];
      const values = {
        [dataPoint.name]: {
          value: null,
          formattedValue: '',
          quality: 'UNKNOWN',
          rawValue: null
        }
      };
      
      // 调用数据库管理器存储初始值
      dbManager.storeLatestValues(dataPoints, values)
        .then(result => {
          console.log(`数据点 ${dataPoint.identifier} 初始记录创建结果:`, result);
        })
        .catch(error => {
          console.error(`为数据点 ${dataPoint.identifier} 创建初始记录失败:`, error);
        });
        
    } catch (error) {
      console.error('创建数据点初始记录时发生错误:', error);
    }
  }
}

module.exports = DataPointManager; 
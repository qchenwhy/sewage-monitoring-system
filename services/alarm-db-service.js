/**
 * 告警数据库服务 - 处理告警的存储和检索
 */

class AlarmDbService {
  constructor() {
    // 内存中存储告警数据
    this.alarms = [];
    this.initialized = false;
    
    console.log('AlarmDbService实例已创建');
  }
  
  /**
   * 初始化服务
   * @returns {Promise<boolean>} 初始化结果
   */
  async initialize() {
    if (this.initialized) {
      return true;
    }
    
    try {
      console.log('初始化告警数据库服务');
      // 这里可以添加数据库连接和表创建逻辑
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('初始化告警数据库服务失败:', error);
      return false;
    }
  }
  
  /**
   * 添加告警
   * @param {Object} alarm 告警对象
   * @param {string} alarm.identifier 数据点标识符
   * @param {string} alarm.content 告警内容
   * @param {string} alarm.timestamp 告警时间戳
   * @param {string} alarm.status 告警状态（'active'或'cleared'）
   * @returns {Promise<Object>} 添加的告警对象
   */
  async addAlarm(alarm) {
    try {
      // 确保初始化
      if (!this.initialized) {
        await this.initialize();
      }
      
      // 添加ID和时间戳
      const newAlarm = {
        ...alarm,
        id: Date.now().toString(),
        createdAt: alarm.timestamp || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      // 存储告警
      this.alarms.push(newAlarm);
      
      console.log(`添加告警: ${newAlarm.content}, 状态: ${newAlarm.status}`);
      return newAlarm;
    } catch (error) {
      console.error('添加告警失败:', error);
      throw error;
    }
  }
  
  /**
   * 更新告警状态
   * @param {string} identifier 数据点标识符
   * @param {string} status 新状态
   * @param {string} timestamp 更新时间戳
   * @returns {Promise<boolean>} 更新结果
   */
  async updateAlarmStatus(identifier, status, timestamp) {
    try {
      // 确保初始化
      if (!this.initialized) {
        await this.initialize();
      }
      
      // 查找匹配的告警
      const alarm = this.alarms.find(a => 
        a.identifier === identifier && a.status === 'active'
      );
      
      if (!alarm) {
        console.warn(`未找到数据点 ${identifier} 的活动告警`);
        return false;
      }
      
      // 更新状态
      alarm.status = status;
      alarm.updatedAt = timestamp || new Date().toISOString();
      
      console.log(`更新告警状态: ${identifier}, 新状态: ${status}`);
      return true;
    } catch (error) {
      console.error('更新告警状态失败:', error);
      throw error;
    }
  }
  
  /**
   * 获取所有告警
   * @param {Object} filters 过滤条件
   * @returns {Promise<Array>} 告警列表
   */
  async getAlarms(filters = {}) {
    try {
      // 确保初始化
      if (!this.initialized) {
        await this.initialize();
      }
      
      // 应用过滤器
      let filteredAlarms = [...this.alarms];
      
      if (filters.status) {
        filteredAlarms = filteredAlarms.filter(a => a.status === filters.status);
      }
      
      if (filters.identifier) {
        filteredAlarms = filteredAlarms.filter(a => a.identifier === filters.identifier);
      }
      
      if (filters.fromDate) {
        const fromDate = new Date(filters.fromDate).getTime();
        filteredAlarms = filteredAlarms.filter(a => new Date(a.createdAt).getTime() >= fromDate);
      }
      
      if (filters.toDate) {
        const toDate = new Date(filters.toDate).getTime();
        filteredAlarms = filteredAlarms.filter(a => new Date(a.createdAt).getTime() <= toDate);
      }
      
      // 排序
      filteredAlarms.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      return filteredAlarms;
    } catch (error) {
      console.error('获取告警失败:', error);
      throw error;
    }
  }
  
  /**
   * 清除告警
   * @param {string} id 告警ID
   * @returns {Promise<boolean>} 清除结果
   */
  async clearAlarm(id) {
    try {
      // 确保初始化
      if (!this.initialized) {
        await this.initialize();
      }
      
      // 查找告警
      const index = this.alarms.findIndex(a => a.id === id);
      
      if (index === -1) {
        console.warn(`未找到ID为 ${id} 的告警`);
        return false;
      }
      
      // 更新状态
      this.alarms[index].status = 'cleared';
      this.alarms[index].updatedAt = new Date().toISOString();
      
      console.log(`清除告警: ${id}`);
      return true;
    } catch (error) {
      console.error('清除告警失败:', error);
      throw error;
    }
  }
  
  /**
   * 删除告警
   * @param {string} id 告警ID
   * @returns {Promise<boolean>} 删除结果
   */
  async deleteAlarm(id) {
    try {
      // 确保初始化
      if (!this.initialized) {
        await this.initialize();
      }
      
      // 查找并删除告警
      const initialCount = this.alarms.length;
      this.alarms = this.alarms.filter(a => a.id !== id);
      
      const deleted = initialCount > this.alarms.length;
      
      if (deleted) {
        console.log(`删除告警: ${id}`);
      } else {
        console.warn(`未找到ID为 ${id} 的告警`);
      }
      
      return deleted;
    } catch (error) {
      console.error('删除告警失败:', error);
      throw error;
    }
  }
  
  /**
   * 获取单例实例
   * @returns {AlarmDbService} 实例
   */
  static getInstance() {
    if (!AlarmDbService.instance) {
      AlarmDbService.instance = new AlarmDbService();
    }
    return AlarmDbService.instance;
  }
}

module.exports = AlarmDbService; 
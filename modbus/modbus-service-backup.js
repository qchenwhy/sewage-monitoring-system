/**
 * 连接到Modbus服务器
 * @param {Object} config 连接配置
 * @returns {Promise<boolean>} 连接成功返回true
 */
async connect(config) {
  try {
    // 如果未提供配置，尝试从配置管理器获取
    if (!config) {
      console.log('ModbusService.connect - 未提供配置，尝试从配置管理器获取');
      config = this.getConnectionConfigFromManager();
      
      if (!config || !config.host) {
        const error = new Error('未提供Modbus连接配置');
        console.error('ModbusService.connect - 配置错误:', error.message);
        this.connectionStatus = {
          isConnected: false,
          lastError: {
            message: error.message,
            time: new Date().toISOString()
          },
          connecting: false,
          lastAttempt: new Date().toISOString()
        };
        throw error;
      }
      
      console.log('ModbusService.connect - 已从配置管理器获取配置:', JSON.stringify(config));
    }
  } catch (error) {
    console.error('ModbusService.connect - 连接错误:', error.message);
    throw error;
  }
}

/**
 * 从配置管理器获取连接配置
 * @returns {Object} 连接配置
 */
getConnectionConfigFromManager() {
  return this.configManager.getConnectionConfig();
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
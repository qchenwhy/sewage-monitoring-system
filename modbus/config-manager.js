const fs = require('fs');
const path = require('path');

class ConfigManager {
  constructor(configPath) {
    this.configPath = configPath || path.join(__dirname, '..', 'config', 'modbus-config.json');
    this.dbConfigPath = path.join(__dirname, '..', 'config', 'database-config.json');
    this.config = {
      connection: {
        host: '127.0.0.1',
        port: 502,
        unitId: 1,
        timeout: 10000,       // 增加到10秒，提高容错性
        autoConnect: false,
        autoReconnect: true,
        maxReconnectAttempts: 5,
        keepAliveEnabled: true,
        keepAliveInterval: 20000,  // 保活间隔增加到20秒，降低频率
        keepAliveAddress: 12,      
        keepAliveFunctionCode: 3   // 功能码3 (读保持寄存器)
      },
      polling: {
        interval: 5000, // 轮询间隔调整为5秒
        enabled: true   // 默认启用轮询
      },
      mqtt: {
        url: 'mqtt://localhost:1883',
        options: {
          clientId: `modbus_mqtt_${Math.random().toString(16).substring(2, 10)}`,
          username: '',
          password: '',
          keepalive: 60,
          reconnectPeriod: 5000,
          connectTimeout: 30000,
          clean: true
        },
        autoReconnect: true,
        maxReconnectAttempts: 5
      },
      dataSourceType: 'modbus', // 'modbus' 或 'mqtt'
      dify: {
        enabled: false,
        apiEndpoint: 'https://api.dify.ai/v1',
        apiKey: '',
        conversationId: '',
        feedbackEnabled: false
      },
      database: {
        host: 'localhost',
        user: 'root',
        password: '753456Chen*',
        database: 'mqtt_data',
        connectionLimit: 10
      }
    };
    this.loadConfig();
    this.loadDatabaseConfig();
  }

  // 静态方法 - 获取单例实例
  static getInstance() {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  // 加载配置文件
  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const fileContent = fs.readFileSync(this.configPath, 'utf8');
        const loadedConfig = JSON.parse(fileContent);
        
        // 合并配置，保留默认值
        if (loadedConfig.connection) {
          this.config.connection = { ...this.config.connection, ...loadedConfig.connection };
        }
        
        if (loadedConfig.polling) {
          this.config.polling = { ...this.config.polling, ...loadedConfig.polling };
        }
        
        if (loadedConfig.mqtt) {
          this.config.mqtt = { ...this.config.mqtt, ...loadedConfig.mqtt };
        }
        
        if (loadedConfig.dataSourceType) {
          this.config.dataSourceType = loadedConfig.dataSourceType;
        }
        
        if (loadedConfig.dify) {
          this.config.dify = { ...this.config.dify, ...loadedConfig.dify };
        }
        
        console.log('配置已加载');
      } else {
        console.log('配置文件不存在，使用默认配置');
        this.saveConfig();
      }
    } catch (error) {
      console.error('加载配置文件失败:', error);
      console.log('使用默认配置');
      this.saveConfig();
    }
  }

  // 保存配置到文件
  saveConfig() {
    try {
      // 确保目录存在
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
      console.log('配置已保存');
    } catch (error) {
      console.error('保存配置文件失败:', error);
    }
  }

  // 获取连接配置
  getConnectionConfig() {
    return {
      ...this.config.connection,
      dataSourceType: this.config.dataSourceType,
      mqtt: this.config.mqtt
    };
  }

  // 更新连接配置
  updateConnectionConfig(updates) {
    if (!updates) return this.getConnectionConfig();
    
    // 更新连接配置
    this.config.connection = { ...this.config.connection, ...updates };
    
    // 如果更新包含数据源类型，也更新它
    if (updates.dataSourceType) {
      this.config.dataSourceType = updates.dataSourceType;
    }
    
    // 如果更新包含MQTT配置，也更新它
    if (updates.mqtt) {
      this.config.mqtt = { ...this.config.mqtt, ...updates.mqtt };
    }
    
    this.saveConfig();
    return this.getConnectionConfig();
  }

  // 获取MQTT配置
  getMqttConfig() {
    return this.config.mqtt;
  }

  // 更新MQTT配置
  updateMqttConfig(updates) {
    if (!updates) return this.getMqttConfig();
    
    this.config.mqtt = { ...this.config.mqtt, ...updates };
    this.saveConfig();
    return this.getMqttConfig();
  }

  // 获取轮询配置
  getPollingConfig() {
    return this.config.polling;
  }

  // 更新轮询配置
  updatePollingConfig(updates) {
    if (!updates) return this.getPollingConfig();
    
    this.config.polling = { ...this.config.polling, ...updates };
    this.saveConfig();
    return this.getPollingConfig();
  }

  // 获取Dify配置
  getDifyConfig() {
    return this.config.dify;
  }

  // 更新Dify配置
  updateDifyConfig(updates) {
    if (!updates) return this.getDifyConfig();
    
    this.config.dify = { ...this.config.dify, ...updates };
    this.saveConfig();
    return this.getDifyConfig();
  }

  // 获取数据源类型
  getDataSourceType() {
    return this.config.dataSourceType;
  }

  // 设置数据源类型
  setDataSourceType(type) {
    if (type !== 'modbus' && type !== 'mqtt') {
      throw new Error('不支持的数据源类型，只能是 "modbus" 或 "mqtt"');
    }
    
    this.config.dataSourceType = type;
    this.saveConfig();
    return this.config.dataSourceType;
  }

  // 获取完整配置
  getFullConfig() {
    return JSON.parse(JSON.stringify(this.config));
  }

  loadDefaultConfig() {
    const defaultConfig = {
      connection: {
        host: '127.0.0.1',
        port: 502,
        unitId: 1,
        timeout: 15000,         // 增加超时时间到15秒
        autoReconnect: true,
        reconnectInterval: 10000, // 重连间隔增加到10秒
        maxReconnectAttempts: 5,
        autoStartPolling: true,
        // 保活配置
        keepAliveEnabled: true,
        keepAliveInterval: 30000,  // 保活间隔增加到30秒
        keepAliveAddress: 0,     
        keepAliveFunctionCode: 3 // 3=读保持寄存器，4=读输入寄存器
      },
      polling: {
        enabled: false,
        interval: 3000      // 轮询间隔增加到3秒
      },
      dify: {
        enabled: false,
        apiEndpoint: 'https://api.dify.ai/v1',
        apiKey: '',
        datasetId: '',
        syncInterval: 3600000, // 每小时同步一次
        documentsPerDay: 24    // 每天存储24小时的数据
      },
      database: {
        host: 'localhost',
        user: 'root',
        password: '753456Chen*',
        database: 'mqtt_data',
        connectionLimit: 10
      }
    };
    return defaultConfig;
  }

  // 添加一个方法用于更新保活配置
  updateKeepAliveConfig(updates) {
    if (!updates) return this.config.connection;
    
    // 更新配置
    this.config.connection.keepAliveEnabled = 
      updates.keepAliveEnabled !== undefined ? updates.keepAliveEnabled : this.config.connection.keepAliveEnabled;
    
    this.config.connection.keepAliveInterval = 
      updates.keepAliveInterval || this.config.connection.keepAliveInterval;
    
    this.config.connection.keepAliveAddress = 
      updates.keepAliveAddress !== undefined ? updates.keepAliveAddress : this.config.connection.keepAliveAddress;
    
    this.config.connection.keepAliveFunctionCode = 
      updates.keepAliveFunctionCode || this.config.connection.keepAliveFunctionCode;
    
    // 保存到文件
    this.saveConfig();
    
    return this.config.connection;
  }

  // 获取保活配置
  getKeepAliveConfig() {
    return {
      enabled: this.config.connection.keepAliveEnabled,
      interval: this.config.connection.keepAliveInterval,
      address: this.config.connection.keepAliveAddress,
      functionCode: this.config.connection.keepAliveFunctionCode
    };
  }

  // 加载数据库配置文件
  loadDatabaseConfig() {
    try {
      // 确保目录存在
      const dir = path.dirname(this.dbConfigPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 如果配置文件不存在，创建默认配置
      if (!fs.existsSync(this.dbConfigPath)) {
        this.saveDatabaseConfig();
        return;
      }

      // 读取配置
      const data = fs.readFileSync(this.dbConfigPath, 'utf8');
      const savedConfig = JSON.parse(data);
      
      if (savedConfig.database) {
        // 合并配置
        this.config.database = {
          ...this.config.database,
          ...savedConfig.database
        };
        console.log('已加载数据库配置文件');
      }
    } catch (err) {
      console.error('加载数据库配置失败:', err);
      // 保持默认配置
    }
  }

  // 保存数据库配置文件
  saveDatabaseConfig() {
    try {
      const dir = path.dirname(this.dbConfigPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(this.dbConfigPath, JSON.stringify({ database: this.config.database }, null, 2), 'utf8');
      console.log('已保存数据库配置文件');
    } catch (err) {
      console.error('保存数据库配置失败:', err);
    }
  }

  // 获取数据库配置
  getDatabaseConfig() {
    return { ...this.config.database };
  }

  // 更新数据库配置
  updateDatabaseConfig(updates) {
    this.config.database = {
      ...this.config.database,
      ...updates
    };
    this.saveDatabaseConfig();
    return this.config.database;
  }
}

module.exports = ConfigManager; 
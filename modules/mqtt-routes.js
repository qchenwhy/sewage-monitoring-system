/**
 * MQTT路由模块
 * 包含所有MQTT相关的API路由
 */

const express = require('express');
const router = express.Router();
const MQTTService = require('./mqtt-service');

// 获取MQTT服务实例
const mqttService = MQTTService.getInstance();

// 获取MQTT设置
router.get('/settings', (req, res) => {
  try {
    const mqttService = MQTTService.getInstance();
    const settings = mqttService.settings;
    
    // 隐藏敏感信息
    const safeSettings = { ...settings };
    if (safeSettings.password) {
      safeSettings.password = '********';
    }
    
    res.json({
      success: true,
      settings: safeSettings
    });
  } catch (error) {
    console.error('获取MQTT设置失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 保存MQTT设置
router.post('/settings', (req, res) => {
  try {
    const settings = req.body;
    
    // 验证必要的字段
    if (!settings.url) {
      return res.status(400).json({
        success: false,
        error: 'MQTT服务器地址不能为空'
      });
    }
    
    // 保存设置
    const saved = mqttService.saveSettings(settings);
    
    // 如果设置为MQTT数据源，则重新连接MQTT
    if (saved && settings.dataSourceType === 'mqtt') {
      mqttService.connect();
    } else if (settings.dataSourceType !== 'mqtt') {
      // 如果不是MQTT数据源，则断开连接
      mqttService.disconnect();
    }
    
    res.json({
      success: true,
      message: 'MQTT设置已保存'
    });
  } catch (error) {
    console.error('保存MQTT设置失败:', error);
    res.status(500).json({
      success: false,
      error: '保存MQTT设置失败: ' + error.message
    });
  }
});

// 测试MQTT连接
router.post('/test-connection', async (req, res) => {
  try {
    const { url, clientId, username, password } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'MQTT服务器地址不能为空'
      });
    }
    
    // 测试连接
    try {
      const result = await mqttService.testConnection({
        url, clientId, username, password
      });
      
      return res.json({
        success: true,
        message: result.message || '连接成功'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  } catch (error) {
    console.error('MQTT连接测试失败:', error);
    return res.status(500).json({
      success: false,
      error: '连接测试失败: ' + error.message
    });
  }
});

// 发布MQTT消息
router.post('/publish', (req, res) => {
  try {
    const { topic, message, retain } = req.body;
    
    if (!topic) {
      return res.status(400).json({
        success: false,
        error: '主题不能为空'
      });
    }
    
    if (message === undefined || message === null) {
      return res.status(400).json({
        success: false,
        error: '消息内容不能为空'
      });
    }
    
    // 发布消息
    const published = mqttService.publish(topic, message, retain);
    
    if (published) {
      res.json({
        success: true,
        message: '消息已发布',
        topic: topic
      });
    } else {
      res.status(500).json({
        success: false,
        error: '发布消息失败'
      });
    }
  } catch (error) {
    console.error('发布MQTT消息失败:', error);
    res.status(500).json({
      success: false,
      error: '发布消息失败: ' + error.message
    });
  }
});

// 获取MQTT状态
router.get('/status', (req, res) => {
  try {
    const status = {
      connected: mqttService.client && mqttService.client.connected,
      url: mqttService.settings ? mqttService.settings.url : null,
      clientId: mqttService.settings ? mqttService.settings.clientId : null,
      dataSourceType: mqttService.settings ? mqttService.settings.dataSourceType : null
    };
    
    res.json({
      success: true,
      status: status
    });
  } catch (error) {
    console.error('获取MQTT状态失败:', error);
    res.status(500).json({
      success: false,
      error: '获取状态失败: ' + error.message
    });
  }
});

// 测试数据点路由
router.post('/test-datapoint', (req, res) => {
  try {
    // 获取请求参数
    const { identifier, value } = req.body;
    
    if (!identifier) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: identifier'
      });
    }
    
    // 获取MQTT服务实例
    const mqttService = MQTTService.getInstance();
    
    // 发布测试数据点
    const result = mqttService.publishTestDataPoint(identifier, value);
    
    res.json({
      success: result,
      message: result ? `测试数据点已发布: ${identifier} = ${value}` : '测试数据点发布失败'
    });
  } catch (error) {
    console.error('发布测试数据点失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router; 
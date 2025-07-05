// 重置告警状态脚本
console.log('正在重置告警状态...');

// 尝试获取MQTT服务实例并重置状态
try {
  const MQTTService = require('./modules/mqtt-service');
  const mqttService = MQTTService.getInstance();
  
  // 重置告警状态
  mqttService.resetMultiConditionAlarmStates();
  
  console.log('✓ 告警状态已重置');
  console.log('现在可以重新测试多条件告警功能');
} catch (error) {
  console.error('✗ 重置告警状态失败:', error);
  console.log('建议重启服务器来重置状态');
}

process.exit(0); 
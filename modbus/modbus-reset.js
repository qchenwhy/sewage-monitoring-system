/**
 * Modbus告警状态重置工具
 * 用于修复告警状态对象和时间显示问题
 */

const fs = require('fs');
const path = require('path');

// 导入modbus-tcp模块
const ModbusTCP = require('./modbus-tcp');

// 获取当前ModbusTCP实例
function getModbusInstance() {
  try {
    // 尝试从全局变量获取ModbusTCP实例
    const modbusInstance = global.modbusInstance;
    if (modbusInstance && modbusInstance instanceof ModbusTCP) {
      console.log('[Modbus重置] 已获取到ModbusTCP实例');
      return modbusInstance;
    } else {
      console.log('[Modbus重置] 未找到全局ModbusTCP实例');
      return null;
    }
  } catch (error) {
    console.error('[Modbus重置] 获取ModbusTCP实例出错:', error);
    return null;
  }
}

// 重置alarmPlayingState
function resetAlarmState(modbusInstance) {
  try {
    if (!modbusInstance) {
      console.log('[Modbus重置] 未提供ModbusTCP实例，尝试获取...');
      modbusInstance = getModbusInstance();
      if (!modbusInstance) {
        console.error('[Modbus重置] 无法获取ModbusTCP实例，无法重置告警状态');
        return false;
      }
    }
    
    console.log('[Modbus重置] 重置前的告警状态:', JSON.stringify(modbusInstance.alarmPlayingState));
    
    // 初始化新的告警状态对象
    modbusInstance.alarmPlayingState = {
      isPlaying: false,       // 是否正在播放告警
      activeAlarms: [],       // 当前活动的告警列表
      lastAlarmStates: {},    // 记录上一次告警状态
      loopCounter: 0,         // 循环计数
      paused: false,          // 告警是否被暂停
      alarmCount: 0,          // 告警触发次数
      nextAlarmTime: null,    // 下次告警时间
      alarmHistory: [],       // 告警历史记录
      alarmFirstTriggerTime: {} // 记录每个告警首次触发时间
    };
    
    console.log('[Modbus重置] 告警状态已重置:', JSON.stringify(modbusInstance.alarmPlayingState));
    
    // 如果浏览器环境可用，也更新localStorage
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('alarmState', JSON.stringify({
          activeAlarms: [],
          alarmFirstTriggerTime: {},
          timestamp: new Date().toISOString()
        }));
        console.log('[Modbus重置] localStorage中的告警状态已重置');
      }
    } catch (e) {
      console.log('[Modbus重置] 浏览器环境不可用，跳过localStorage重置');
    }
    
    return true;
  } catch (error) {
    console.error('[Modbus重置] 重置告警状态出错:', error);
    return false;
  }
}

// 修复告警状态并发送测试告警
function fixAndTestAlarm(modbusInstance) {
  try {
    // 先重置告警状态
    const resetResult = resetAlarmState(modbusInstance);
    if (!resetResult) {
      console.error('[Modbus重置] 无法重置告警状态，测试终止');
      return false;
    }
    
    // 发送测试告警
    const testAlarmName = '测试告警 - ' + new Date().toLocaleTimeString();
    const alarmResult = modbusInstance.triggerAlarm('test-alarm-id', testAlarmName);
    
    console.log('[Modbus重置] 测试告警已触发:', alarmResult);
    console.log('[Modbus重置] 当前告警状态:', JSON.stringify(modbusInstance.alarmPlayingState));
    
    return alarmResult;
  } catch (error) {
    console.error('[Modbus重置] 测试告警出错:', error);
    return false;
  }
}

// 直接执行
if (require.main === module) {
  console.log('[Modbus重置] 开始执行重置和测试...');
  
  // 获取ModbusTCP实例
  const modbusInstance = getModbusInstance();
  
  if (modbusInstance) {
    console.log('[Modbus重置] 成功获取ModbusTCP实例，准备重置告警状态');
    
    // 重置告警状态
    const resetResult = resetAlarmState(modbusInstance);
    console.log('[Modbus重置] 重置结果:', resetResult);
    
    // 如果重置成功，发送测试告警
    if (resetResult) {
      console.log('[Modbus重置] 执行测试告警...');
      fixAndTestAlarm(modbusInstance);
    }
  } else {
    console.error('[Modbus重置] 无法获取ModbusTCP实例，无法执行重置和测试');
  }
} else {
  console.log('[Modbus重置] 作为模块加载，提供resetAlarmState和fixAndTestAlarm函数');
}

// 导出函数
module.exports = {
  resetAlarmState,
  fixAndTestAlarm,
  getModbusInstance
}; 
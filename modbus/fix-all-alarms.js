/**
 * 全面修复Modbus告警系统脚本
 * 解决告警时间显示和传递问题
 */

const fs = require('fs');
const path = require('path');

// 导入重置工具
const resetTool = require('./modbus-reset');

// 导入Modbus-TCP模块
const ModbusTCP = require('./modbus-tcp');

// 确保全局的ModbusTCP实例可以被其他模块访问
function ensureGlobalModbusTCP() {
  try {
    // 检查全局实例
    if (!global.modbusInstance || !(global.modbusInstance instanceof ModbusTCP)) {
      console.log('[全面修复] 全局ModbusTCP实例不存在，尝试创建...');
      
      // 创建新实例
      const newInstance = new ModbusTCP({
        host: '127.0.0.1',
        port: 502,
        unitId: 1,
        frequency: 1000,
        autoReconnect: true
      });
      
      // 设置全局变量
      global.modbusInstance = newInstance;
      console.log('[全面修复] 已创建并设置全局ModbusTCP实例');
    } else {
      console.log('[全面修复] 全局ModbusTCP实例已存在');
    }
    
    return global.modbusInstance;
  } catch (error) {
    console.error('[全面修复] 确保全局ModbusTCP实例时出错:', error);
    return null;
  }
}

// 修补ModbusTCP.prototype.triggerAlarm方法
function patchTriggerAlarmMethod() {
  try {
    const originalTriggerAlarm = ModbusTCP.prototype.triggerAlarm;
    
    // 如果已经被修补过，直接返回
    if (originalTriggerAlarm.patched) {
      console.log('[全面修复] triggerAlarm方法已被修补过，跳过');
      return true;
    }
    
    // 替换原方法
    ModbusTCP.prototype.triggerAlarm = function(identifier, content) {
      console.log(`[ModbusTCP-修补] 触发告警: ${identifier}, 内容: ${content}`);
      
      // 确保内容存在
      if (!content) return null;
      
      // 初始化alarmPlayingState（如果不存在）
      if (!this.alarmPlayingState) {
        console.log('[ModbusTCP-修补] 初始化alarmPlayingState对象');
        this.alarmPlayingState = {
          isPlaying: false,
          activeAlarms: [],
          lastAlarmStates: {},
          loopCounter: 0,
          paused: false,
          alarmCount: 0,
          nextAlarmTime: null,
          alarmHistory: [],
          alarmFirstTriggerTime: {}
        };
      }
      
      // 检查是否已有触发时间
      const hasExistingTriggerTime = !!this.alarmPlayingState.alarmFirstTriggerTime[content];
      console.log(`[ModbusTCP-修补] 告警 "${content}" 是否已有触发时间: ${hasExistingTriggerTime}`);
      
      if (!hasExistingTriggerTime) {
        // 记录告警首次触发时间
        const now = new Date();
        const triggerTime = now.toISOString();
        
        this.alarmPlayingState.alarmFirstTriggerTime[content] = triggerTime;
        console.log(`[ModbusTCP-修补] 记录告警首次触发时间: ${content} = ${triggerTime}`);
      }
      
      // 更新活动告警列表
      if (!this.alarmPlayingState.activeAlarms.includes(content)) {
        this.alarmPlayingState.activeAlarms.push(content);
        console.log(`[ModbusTCP-修补] 添加新告警到活动列表: ${content}`);
      }
      
      // 更新告警计数
      this.alarmPlayingState.alarmCount++;
      
      // 发送告警事件
      this.emit('alarm', {
        identifier: identifier,
        content: content,
        firstTriggerTime: this.alarmPlayingState.alarmFirstTriggerTime[content]
      });
      
      // 将告警信息存储到localStorage
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('alarmState', JSON.stringify({
            activeAlarms: this.alarmPlayingState.activeAlarms,
            alarmFirstTriggerTime: this.alarmPlayingState.alarmFirstTriggerTime,
            timestamp: new Date().toISOString()
          }));
          console.log(`[ModbusTCP-修补] 已将告警信息存储到localStorage`);
        } else {
          console.log(`[ModbusTCP-修补] 非浏览器环境，尝试在全局对象中存储告警状态`);
          global.alarmState = {
            activeAlarms: this.alarmPlayingState.activeAlarms,
            alarmFirstTriggerTime: this.alarmPlayingState.alarmFirstTriggerTime,
            timestamp: new Date().toISOString()
          };
        }
      } catch (error) {
        console.error(`[ModbusTCP-修补] 存储告警信息失败:`, error);
      }
      
      // 返回告警信息
      return {
        identifier: identifier,
        content: content,
        firstTriggerTime: this.alarmPlayingState.alarmFirstTriggerTime[content]
      };
    };
    
    // 标记已修补
    ModbusTCP.prototype.triggerAlarm.patched = true;
    
    console.log('[全面修复] triggerAlarm方法已成功修补');
    return true;
  } catch (error) {
    console.error('[全面修复] 修补triggerAlarm方法出错:', error);
    return false;
  }
}

// 修补BitChange事件处理
function patchBitChangeEventHandling() {
  try {
    // 获取原始更新数据点值方法
    const originalUpdateDataPointValues = ModbusTCP.prototype.updateDataPointValues;
    
    // 如果已经被修补过，直接返回
    if (originalUpdateDataPointValues.patched) {
      console.log('[全面修复] updateDataPointValues方法已被修补过，跳过');
      return true;
    }
    
    // 替换原方法
    ModbusTCP.prototype.updateDataPointValues = function(transactionId, registerValues) {
      // 调用原始方法
      const result = originalUpdateDataPointValues.call(this, transactionId, registerValues);
      
      // 添加额外的告警处理逻辑
      // 修复：确保dataPoints是数组，并且只在存在时进行遍历
      if (this.dataPoints && Array.isArray(this.dataPoints)) {
        // 找到与当前事务ID匹配的数据点
        const dataPoint = this.dataPoints.find(dp => dp.lastTransactionId === transactionId);
        
        if (dataPoint) {
          // 只处理BIT格式
          if (dataPoint.format === 'BIT') {
            // 获取当前值
            const currentValue = this.dataValues[dataPoint.name]?.value;
            
            // 获取上一个值
            const previousValue = this.dataValues[dataPoint.name]?.previousValue;
            
            // 检查是否是告警数据点 - 只有明确启用告警时才视为告警数据点
            const isAlarmPoint = dataPoint.alarmEnabled === true;
            
            console.log(`[ModbusTCP-修补] 检查告警状态: ${dataPoint.name}, 当前值=${currentValue}, 上一个值=${previousValue}, 是告警点=${isAlarmPoint}`);
            
            // 如果是告警数据点，检查值变化
            if (isAlarmPoint) {
              // 如果值从0变为1，触发告警
              if (previousValue === 0 && currentValue === 1) {
                console.log(`[ModbusTCP-修补] 检测到告警触发: ${dataPoint.name}, 从 ${previousValue} 到 ${currentValue}`);
                
                // 触发告警
                this.triggerAlarm(dataPoint.identifier || dataPoint.name, dataPoint.name);
              }
              // 如果值从1变为0，清除告警
              else if (previousValue === 1 && currentValue === 0) {
                console.log(`[ModbusTCP-修补] 检测到告警解除: ${dataPoint.name}, 从 ${previousValue} 到 ${currentValue}`);
                
                // 如果clearAlarm方法存在，调用它来清除告警
                if (typeof this.clearAlarm === 'function') {
                  const alarmContent = `${dataPoint.name}`;
                  console.log(`[ModbusTCP-修补] 调用clearAlarm: ${dataPoint.identifier || dataPoint.name}, ${alarmContent}`);
                  this.clearAlarm(dataPoint.identifier || dataPoint.name, alarmContent);
                } else {
                  console.log(`[ModbusTCP-修补] clearAlarm方法不存在，无法清除告警`);
                }
              }
            }
          }
        }
      }
      
      return result;
    };
    
    // 标记已修补
    ModbusTCP.prototype.updateDataPointValues.patched = true;
    
    console.log('[全面修复] updateDataPointValues方法已成功修补');
    return true;
  } catch (error) {
    console.error('[全面修复] 修补updateDataPointValues方法出错:', error);
    return false;
  }
}

// 执行全面修复
async function runFullFix() {
  console.log('[全面修复] 开始执行全面修复流程...');
  
  // 确保全局ModbusTCP实例
  const modbusInstance = ensureGlobalModbusTCP();
  if (!modbusInstance) {
    console.error('[全面修复] 无法确保全局ModbusTCP实例，修复终止');
    return false;
  }
  
  // 修补triggerAlarm方法
  const patchTriggerResult = patchTriggerAlarmMethod();
  if (!patchTriggerResult) {
    console.error('[全面修复] 修补triggerAlarm方法失败，继续执行其他修复');
  }
  
  // 修补BitChange事件处理
  const patchBitChangeResult = patchBitChangeEventHandling();
  if (!patchBitChangeResult) {
    console.error('[全面修复] 修补BitChange事件处理失败，继续执行其他修复');
  }
  
  // 重置告警状态
  const resetResult = resetTool.resetAlarmState(modbusInstance);
  if (!resetResult) {
    console.error('[全面修复] 重置告警状态失败，修复可能不完整');
  }
  
  // 测试告警触发
  console.log('[全面修复] 执行测试告警触发...');
  const testResult = await testAlarmTrigger();
  
  console.log('[全面修复] 全面修复完成');
  
  return {
    patchTriggerResult,
    patchBitChangeResult,
    resetResult,
    testResult
  };
}

// 测试告警触发
async function testAlarmTrigger() {
  try {
    console.log('[全面修复] 开始测试告警触发...');
    
    // 获取ModbusTCP实例
    const modbusInstance = global.modbusInstance;
    if (!modbusInstance) {
      console.error('[全面修复] 无法获取ModbusTCP实例，测试终止');
      return false;
    }
    
    // 创建测试告警
    const testAlarmName = '测试告警 - ' + new Date().toLocaleTimeString();
    console.log(`[全面修复] 触发测试告警: ${testAlarmName}`);
    
    // 调用修补后的triggerAlarm方法
    const alarmResult = modbusInstance.triggerAlarm('test-alarm-id', testAlarmName);
    
    console.log('[全面修复] 测试告警触发结果:', alarmResult);
    console.log('[全面修复] 当前告警状态:', JSON.stringify(modbusInstance.alarmPlayingState));
    
    return true;
  } catch (error) {
    console.error('[全面修复] 测试告警触发出错:', error);
    return false;
  }
}

// 直接执行脚本
if (require.main === module) {
  console.log('[全面修复] 脚本直接执行，开始全面修复...');
  
  runFullFix()
    .then(result => {
      console.log('[全面修复] 全面修复完成，结果:', result);
    })
    .catch(error => {
      console.error('[全面修复] 全面修复失败:', error);
    });
} else {
  console.log('[全面修复] 作为模块加载，提供runFullFix函数');
}

// 导出函数
module.exports = {
  runFullFix,
  patchTriggerAlarmMethod,
  patchBitChangeEventHandling,
  testAlarmTrigger,
  ensureGlobalModbusTCP
}; 
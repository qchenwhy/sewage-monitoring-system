/**
 * Modbus.js 修复脚本
 * 修复两个主要问题：
 * 1. checkAlarmStatus 函数中尝试访问未初始化的 window.alarmPlayingState.processingAlarms
 * 2. writeDataPointValue 函数中使用未定义的 startTime 变量
 * 3. 修复数据采集中自动关闭自动轮询的问题
 */

(function() {
  console.log('加载 Modbus.js 修复脚本...');
  
  // 等待页面加载完成
  document.addEventListener('DOMContentLoaded', function() {
    console.log('开始应用 Modbus.js 修复...');
    
    // 确保 window.alarmPlayingState 和 processingAlarms 对象存在
    if (!window.alarmPlayingState) {
      console.log('初始化 window.alarmPlayingState 对象');
      window.alarmPlayingState = {
        activeAlarms: [],
        processingAlarms: {},
        alarmFirstTriggerTime: {},
        isPaused: false,
        isPlaying: false,
        currentPlayingQueue: []
      };
    } else if (!window.alarmPlayingState.processingAlarms) {
      console.log('初始化 window.alarmPlayingState.processingAlarms 对象');
      window.alarmPlayingState.processingAlarms = {};
    }
    
    // 修复 checkAlarmStatus 函数中的对象访问
    const originalCheckAlarmStatus = window.checkAlarmStatus;
    if (originalCheckAlarmStatus) {
      console.log('修补 checkAlarmStatus 函数');
      window.checkAlarmStatus = function(values) {
        // 确保每次调用前 processingAlarms 对象存在
        if (!window.alarmPlayingState) {
          window.alarmPlayingState = {
            activeAlarms: [],
            processingAlarms: {},
            alarmFirstTriggerTime: {},
            isPaused: false,
            isPlaying: false,
            currentPlayingQueue: []
          };
        } else if (!window.alarmPlayingState.processingAlarms) {
          window.alarmPlayingState.processingAlarms = {};
        }
        
        try {
          return originalCheckAlarmStatus.apply(this, arguments);
        } catch (error) {
          console.error('执行 checkAlarmStatus 时出错 (已捕获):', error);
          // 尝试安全地更新告警状态显示
          try {
            updateAlarmStatusDisplay();
          } catch (displayError) {
            console.error('更新告警状态显示失败:', displayError);
          }
        }
      };
    }
    
    // 修复 writeDataPointValue 函数中的 startTime 未定义问题
    const originalWriteDataPointValue = window.writeDataPointValue;
    if (originalWriteDataPointValue) {
      console.log('修补 writeDataPointValue 函数');
      window.writeDataPointValue = async function() {
        try {
          // 在函数开始时添加 startTime 变量
          const startTime = Date.now();
          
          // 获取identifier和value，用于错误处理
          let identifier = '';
          let parsedValue = '';
          let dataPoint = null;
          
          try {
            identifier = document.getElementById('writeDataPointIdentifier').value;
            const valueInput = document.getElementById('newValueInput');
            parsedValue = valueInput ? valueInput.value : '';
            
            // 获取数据点信息
            if (window.dataPoints) {
              dataPoint = window.dataPoints.find(dp => dp.identifier === identifier);
            }
          } catch (preError) {
            console.error('获取写入参数出错:', preError);
          }
          
          try {
            // 调用原始函数
            return await originalWriteDataPointValue.apply(this, arguments);
          } catch (error) {
            console.error('执行 writeDataPointValue 时出错:', error);
            
            // 如果错误与 startTime 相关，使用我们定义的 startTime
            if (error.message && error.message.includes('startTime is not defined')) {
              // 计算响应时间
              const responseTime = Date.now() - startTime;
              
              // 处理错误情况
              const errorMessage = error.message || '写入失败';
              showError(`写入数据点 "${dataPoint ? dataPoint.name : identifier}" 失败: ${errorMessage}`);
              
              // 更新状态显示
              const statusElement = document.getElementById('writeStatus');
              if (statusElement) {
                statusElement.innerHTML = `<span class="text-danger"><i class="bi bi-exclamation-triangle"></i> 写入失败: ${errorMessage}</span>`;
                statusElement.classList.remove('alert-info');
                statusElement.classList.add('alert-danger');
              }
              
              // 尝试添加到写入历史记录
              try {
                if (window.addWriteHistory) {
                  window.addWriteHistory({
                    dataPoint: dataPoint ? dataPoint.name : identifier,
                    identifier: identifier,
                    value: parsedValue,
                    timestamp: new Date().toISOString(),
                    responseTime: responseTime,
                    success: false,
                    error: errorMessage
                  });
                }
              } catch (historyError) {
                console.error('添加写入历史记录失败:', historyError);
              }
              
              // 隐藏加载指示器
              if (window.hideLoader) {
                window.hideLoader();
              }
            } else {
              // 其他类型的错误，重新抛出
              throw error;
            }
          }
        } catch (outerError) {
          console.error('writeDataPointValue 修复函数外层错误:', outerError);
          showError('处理写入请求时出错: ' + outerError.message);
          if (window.hideLoader) {
            window.hideLoader();
          }
        }
      };
    }
    
    // 修复 loadDataValues 函数中自动停止轮询的问题
    const originalLoadDataValues = window.loadDataValues;
    if (originalLoadDataValues) {
      console.log('修补 loadDataValues 函数，防止自动停止轮询');
      window.loadDataValues = async function(forceLoad = false) {
        try {
          // 调用原始函数
          return await originalLoadDataValues.apply(this, arguments);
        } catch (error) {
          console.error('执行 loadDataValues 时出错 (已捕获):', error);
          
          // 这里不再执行停止轮询的操作，即使连接失败
          console.log('捕获到数据加载错误，但保持轮询状态不变');
          
          // 只记录错误，不执行任何可能停止轮询的动作
          if (error.message && (
              error.message.includes('Failed to fetch') || 
              error.message.includes('NetworkError'))) {
            console.warn('网络连接问题，但轮询将继续');
          }
        }
      };
    }
    
    // 修复 setupDataRefresh 函数，防止轮询自动停止
    const originalSetupDataRefresh = window.setupDataRefresh;
    if (originalSetupDataRefresh) {
      console.log('修补 setupDataRefresh 函数，添加更好的错误处理');
      window.setupDataRefresh = function(interval = 1000) {
        // 调用原始函数
        const result = originalSetupDataRefresh.apply(this, arguments);
        
        // 重置错误计数
        window.dataRefreshErrorCount = 0;
        
        console.log(`已设置数据刷新定时器，间隔: ${Math.max(500, interval)}ms，包含连接状态检查`);
        return result;
      };
    }
    
    // 添加定期检查轮询状态的功能，但不会无限重启
    let pollingCheckCount = 0;
    const maxPollingChecks = 10; // 最多检查10次
    
    const pollingChecker = setInterval(() => {
      try {
        pollingCheckCount++;
        
        // 超过最大检查次数后停止检查
        if (pollingCheckCount > maxPollingChecks) {
          console.log('轮询状态检查已达到最大次数，停止检查');
          clearInterval(pollingChecker);
          return;
        }
        
        // 检查是否应该正在轮询但实际上轮询定时器不存在
        if (window.isPolling && window.isPolling() && !window.dataRefreshTimer) {
          console.log('检测到轮询应该开启但定时器不存在，重新启动轮询');
          // 获取当前轮询间隔或使用默认值
          const currentInterval = document.getElementById('pollingIntervalInput')?.value || 1000;
          window.setupDataRefresh(parseInt(currentInterval));
        }
      } catch (error) {
        console.error('轮询状态检查错误:', error);
      }
    }, 10000); // 每10秒检查一次，而不是5秒
    
    console.log('Modbus.js 修复脚本应用完成');
  });
})(); 
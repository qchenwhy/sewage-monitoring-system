// API基础URL
const API_BASE_URL = '/api/modbus';
// 状态更新和数据刷新间隔
const STATUS_UPDATE_INTERVAL = 10000; // 状态更新间隔 (10秒)
const VALUES_UPDATE_INTERVAL = 1000;  // 值更新间隔 (1秒)

// 全局定时器管理器
window.TimerManager = {
  timers: new Map(),
  
  // 设置定时器
  setTimer: function(name, callback, interval, immediate = false) {
    // 清除同名的现有定时器
    this.clearTimer(name);
    
    console.log(`[定时器管理] 设置定时器: ${name}, 间隔: ${interval}ms`);
    
    if (immediate) {
      callback();
    }
    
    const timerId = setInterval(callback, interval);
    this.timers.set(name, {
      id: timerId,
      interval: interval,
      callback: callback,
      created: Date.now()
    });
    
    return timerId;
  },
  
  // 清除指定定时器
  clearTimer: function(name) {
    const timer = this.timers.get(name);
    if (timer) {
      clearInterval(timer.id);
      this.timers.delete(name);
      console.log(`[定时器管理] 已清除定时器: ${name}`);
      return true;
    }
    return false;
  },
  
  // 清除所有定时器
  clearAllTimers: function() {
    console.log(`[定时器管理] 清除所有定时器 (共${this.timers.size}个)`);
    this.timers.forEach((timer, name) => {
      clearInterval(timer.id);
      console.log(`[定时器管理] 已清除: ${name}`);
    });
    this.timers.clear();
  },
  
  // 获取定时器状态
  getTimerStatus: function() {
    const status = {};
    this.timers.forEach((timer, name) => {
      status[name] = {
        interval: timer.interval,
        running: Date.now() - timer.created,
        created: new Date(timer.created).toISOString()
      };
    });
    return status;
  },
  
  // 暂停所有定时器
  pauseAllTimers: function() {
    console.log(`[定时器管理] 暂停所有定时器`);
    this.timers.forEach((timer, name) => {
      clearInterval(timer.id);
    });
  },
  
  // 恢复所有定时器
  resumeAllTimers: function() {
    console.log(`[定时器管理] 恢复所有定时器`);
    this.timers.forEach((timer, name) => {
      timer.id = setInterval(timer.callback, timer.interval);
    });
  }
};

// 页面卸载时清理所有定时器
window.addEventListener('beforeunload', function() {
  console.log('[定时器管理] 页面卸载，清理所有定时器');
  window.TimerManager.clearAllTimers();
});

// 模态框对象
let settingsModal = null;
let dataPointModal = null;
let writeValueModal = null;

// 数据轮询定时器
let dataPollingTimer = null;

// 弹窗模式标志
let isEditMode = false;

// 当前数据点列表
let currentDataPoints = [];

// 写入历史存储
let writeHistory = [];
const MAX_HISTORY_LENGTH = 50;

// 全局变量
window.currentDataValues = {}; // 存储当前数据点值
window.dataPoints = []; // 存储数据点配置
window.alarmLoopTimer = null; // 告警循环定时器
window.alarmPlayingState = {
  isPlaying: false,       // 是否正在播放告警
  activeAlarms: [],       // 当前活动的告警列表
  lastAlarmStates: {},    // 记录上一次告警状态 {identifier: {value: 0/1, triggered: true/false}}
  loopCounter: 0,         // 循环计数
  paused: false,          // 告警是否被暂停
  alarmCount: 0,          // 告警触发次数
  nextAlarmTime: null,    // 下次告警时间
  alarmHistory: [],       // 告警历史记录
  alarmFirstTriggerTime: {} // 记录每个告警首次触发时间
};

// 当前数据源类型
let currentDataSourceType = 'modbus';

// 加载数据源类型
async function loadDataSourceType() {
  try {
    const response = await axios.get(`${API_BASE_URL}/connection/config`);
    if (response.data.success) {
      const config = response.data.data;
      currentDataSourceType = config.dataSourceType || 'modbus';
      console.log(`当前数据源类型: ${currentDataSourceType}`);
    }
  } catch (error) {
    console.error('加载数据源类型出错:', error);
    showToast('加载数据源类型出错', 'error');
  }
  return currentDataSourceType;
}

// 在页面加载后的初始化函数
document.addEventListener('DOMContentLoaded', async function() {
  // 初始化bootstrap提示框
  var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.map(function (tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl);
  });
  
  // 切换视图
  const viewLinks = document.querySelectorAll('.sidebar-nav-link[data-view]');
  viewLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const viewId = this.dataset.view;
      document.querySelectorAll('.view-container').forEach(view => {
        view.classList.remove('active');
      });
      document.getElementById(viewId).classList.add('active');
      viewLinks.forEach(l => l.classList.remove('active'));
      this.classList.add('active');
    });
  });

  // 初始化Bootstrap模态框
  settingsModal = new bootstrap.Modal(document.getElementById('settingsModal'));
  dataPointModal = new bootstrap.Modal(document.getElementById('dataPointModal'));
  writeValueModal = new bootstrap.Modal(document.getElementById('writeValueModal'));
  
  // 设置缩放因子默认值
  document.getElementById('scaleInput').value = '1';
  
  // 跟踪API连接失败次数
  let connectionCheckFailCount = 0;
  
  // 初次尝试加载数据
  try {
    await initializeModbusData();
    
    // 连接检查成功，重置失败计数
    connectionCheckFailCount = 0;
  } catch (error) {
    console.error('初始化数据加载失败:', error);
    
    // 加载数据源类型
    await loadDataSourceType();
    
    // 如果是MQTT数据源，不显示连接失败警告
    if (currentDataSourceType !== 'mqtt') {
    showWarning('连接到服务器失败，将继续尝试重连...');
    }
    connectionCheckFailCount++;
  }
  
  // 加载写入历史记录
  loadWriteHistory();
  

  
  // 初始化历史数据功能和加载写入历史
  loadWriteHistory();
  
  // 设置默认时间范围（过去24小时）
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  
  document.getElementById('endTimeInput').value = formatDateTimeForInput(now);
  document.getElementById('startTimeInput').value = formatDateTimeForInput(yesterday);
  
  // 填充数据点选择下拉框
  populateDataPointSelect();
  
  // 定时更新连接状态 - 使用全局常量，添加错误处理和自动恢复
  const updateConnectionInterval = setInterval(async () => {
    try {
      await loadConnectionStatus();
      // 连接检查成功，重置失败计数
      connectionCheckFailCount = 0;
    } catch (error) {
      console.error('连接状态检查失败:', error);
      connectionCheckFailCount++;
      
      // 如果是MQTT数据源，不显示连接错误
      if (currentDataSourceType === 'mqtt') {
        console.log('MQTT数据源模式，跳过连接错误显示');
        return;
      }
      
      // 更新UI显示连接状态
      updateConnectionStatus(false, '连接检查失败', 'warning');
      
      // 如果连续失败超过3次，显示更明确的错误
      if (connectionCheckFailCount >= 3) {
        showError(`服务器连接持续失败 (${connectionCheckFailCount}次)。服务器可能已关闭或重启。`);
        
        // 尝试重新初始化连接
        if (connectionCheckFailCount % 5 === 0) {
          try {
            console.log(`尝试重新初始化连接 (失败计数: ${connectionCheckFailCount})`);
            // 使用默认配置尝试重新连接
            const defaultConfig = {
              host: '127.0.0.1',
              port: 502,
              unitId: 1,
              timeout: 5000,
              autoConnect: true,
              autoReconnect: true
            };
            
            // 发送连接请求 - 静默失败，不显示错误
            await fetch('/api/modbus/connection', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ config: defaultConfig })
            }).catch(() => {});
          } catch (reconnectError) {
            console.error('重连尝试失败:', reconnectError);
          }
        }
      }
    }
  }, STATUS_UPDATE_INTERVAL);
  
  const updatePollingInterval = setInterval(async () => {
    try {
      await loadPollingStatus();
    } catch (error) {
      console.error('轮询状态检查失败:', error);
      // 静默失败，UI已经在loadPollingStatus函数中更新
    }
  }, STATUS_UPDATE_INTERVAL);
  
  // 初始化告警状态更新定时器
  initAlarmStatusUpdater();
});

// 初始化Modbus数据
async function initializeModbusData() {
  console.log('初始化Modbus数据...');
  
  try {
    // 初始化全局数据
    window.dataPoints = [];
    window.dataValues = {};
    
    // 重置错误计数
    window.dataRefreshErrorCount = 0;
    
    // 初始化告警状态
    window.alarmPlayingState = {
      isPlaying: false,       // 是否正在播放告警
      activeAlarms: [],       // 当前活动的告警列表
      lastAlarmStates: {},    // 记录上一次告警状态 {identifier: {value: 0/1, triggered: true/false}}
      loopCounter: 0,         // 循环计数
      paused: false,          // 告警是否被暂停
      alarmCount: 0,          // 告警触发次数
      nextAlarmTime: null,    // 下次告警时间
      alarmHistory: [],       // 告警历史记录
      alarmFirstTriggerTime: {} // 记录每个告警首次触发时间
    };
    
    console.log('[告警调试] 初始化告警状态对象:', window.alarmPlayingState);
    
  // 加载连接状态
  await loadConnectionStatus();
  
  // 加载轮询状态
  await loadPollingStatus();
  
    // 加载数据点
  await loadDataPoints();
  
    // 加载数据值
    await loadDataValues();
    
    // 只有在连接且轮询开启时才设置数据刷新定时器
    const connected = isConnected();
    const polling = isPolling();
    
    console.log(`[初始化] 连接状态: ${connected}, 轮询状态: ${polling}`);
    
    if (connected && polling) {
      console.log('[初始化] 设置数据刷新定时器');
    setupDataRefresh(1000); // 每秒刷新一次
    } else {
      console.log('[初始化] 跳过设置数据刷新定时器 - 连接或轮询未开启');
    }
    
    // 加载写入历史
    loadWriteHistory();
    
    // 初始化告警状态更新器
    initAlarmStatusUpdater();
  
  console.log('Modbus数据初始化完成');
  } catch (error) {
    console.error('初始化Modbus数据时发生错误:', error);
    showError('初始化数据失败: ' + error.message);
  }
}

// 检查API可用性
async function checkAPIAvailability() {
  try {
    console.log('[调试] 检查API路由可用性...');
    const response = await axios.get('/api/modbus/debug/routes');
    console.log('[调试] API路由信息:', response.data);
    
    // 检查特定路径是否存在
    const pathExists = response.data.data.pathExists;
    
    if (pathExists) {
      // 检查数据存储路径
      const latestValuesAvailable = pathExists['/values/latest'] || pathExists['/latest-values'];
      const historyAvailable = response.data.data.routes.some(r => 
        r.path === '/history/:identifier' || r.path === '/values/history'
      );
      const storeAvailable = response.data.data.routes.some(r => 
        r.path === '/store-latest-values' || r.path === '/values/store'
      );
      
      console.log('[调试] 路径检查结果:');
      console.log(`- 最新值获取: ${latestValuesAvailable ? '可用' : '不可用'}`);
      console.log(`- 历史数据: ${historyAvailable ? '可用' : '不可用'}`);
      console.log(`- 数据存储: ${storeAvailable ? '可用' : '不可用'}`);
      
      // 检查兼容性路径和新路径
      if (!pathExists['/values/latest'] && !pathExists['/latest-values']) {
        showWarning('警告: 获取最新存储值的API路由不可用，数据加载可能会失败');
      } 
      
      if (!(pathExists['/values/latest'] || pathExists['/latest-values']) && 
          !(historyAvailable) && 
          !(storeAvailable)) {
        showError('严重警告: 多个关键API路由不可用，这可能表明服务器配置有问题');
      } else {
        console.log('[调试] API路由检查通过，基本功能可用');
      }
    } else {
      console.warn('[调试] 无法获取路径存在信息');
    }
    
    return response.data;
  } catch (error) {
    console.error('[调试] API路由检查失败:', error);
    showWarning('无法验证API路由可用性，某些功能可能不可用');
    return null;
  }
}

// 更新功能码选项
function updateFunctionCodeOptions() {
  // 设置固定的功能码值
  // 读取功能码固定为3（读保持寄存器）
  // 写入功能码固定为6（写单个寄存器）
  
  const readFunctionCodeSelect = document.getElementById('readFunctionCodeSelect');
  const writeFunctionCodeSelect = document.getElementById('writeFunctionCodeSelect');
  const functionCodeSelect = document.getElementById('functionCodeSelect');
  const accessMode = document.getElementById('accessModeSelect').value;
  
  // 设置读写功能码的默认值
  if (readFunctionCodeSelect) {
    readFunctionCodeSelect.value = '3';
  }
  
  if (writeFunctionCodeSelect) {
    writeFunctionCodeSelect.value = '6';
  }
  
  // 设置单一功能码的值
  if (functionCodeSelect) {
    if (accessMode === 'read') {
      functionCodeSelect.value = '3';
    } else if (accessMode === 'write') {
      functionCodeSelect.value = '6';
    }
  }
  
  // 记录功能码设置
  console.log(`功能码已设置 - 访问模式: ${accessMode}, 读功能码: 3, 写功能码: 6`);
}

// 显示加载器
function showLoader() {
  document.getElementById('loaderContainer').style.display = 'flex';
}

// 隐藏加载器
function hideLoader() {
  document.getElementById('loaderContainer').style.display = 'none';
}

/**
 * 显示错误消息
 * @param {string} message 错误消息
 * @param {number} duration 显示持续时间（毫秒），0表示不自动隐藏
 */
function showError(message, duration = 10000) {
  // 先记录到控制台，确保错误信息不会丢失
  console.error('错误:', message);
  
  // 安全地获取DOM元素
  const container = document.getElementById('errorContainer');
  const messageEl = document.getElementById('errorMessage');
  
  // 如果DOM元素不存在，仅记录到控制台后返回
  if (!container || !messageEl) {
    console.warn('无法显示错误消息：错误容器元素不存在');
    return;
  }
  
  // 确保清除任何先前的隐藏定时器
  if (window.errorTimeout) {
    clearTimeout(window.errorTimeout);
    window.errorTimeout = null;
  }
  
  // 设置消息和显示容器
  messageEl.innerHTML = message;
  container.style.display = 'block';
  
  // 添加进入动画
  container.classList.add('animate__animated', 'animate__fadeInDown');
  
  // 如果持续时间不为0，设置自动隐藏定时器
  if (duration > 0) {
    window.errorTimeout = setTimeout(() => {
      hideError();
    }, duration);
  }
}

/**
 * 隐藏错误消息
 */
function hideError() {
  const container = document.getElementById('errorContainer');
  
  // 如果DOM元素不存在，直接返回
  if (!container) {
    return;
  }
  
  // 如果错误容器正在显示，添加淡出动画
  if (container.style.display !== 'none') {
    container.classList.add('animate__fadeOutUp');
    
    // 动画结束后隐藏
    setTimeout(() => {
      container.style.display = 'none';
      container.classList.remove('animate__animated', 'animate__fadeInDown', 'animate__fadeOutUp');
    }, 500);
  }
  
  // 清除任何已有定时器
  if (window.errorTimeout) {
    clearTimeout(window.errorTimeout);
    window.errorTimeout = null;
  }
}

// 判断是否已连接
function isConnected() {
  // 如果有全局状态，优先使用
  if (typeof window.modbusConnected !== 'undefined') {
    return window.modbusConnected;
  }
  
  // 尝试获取元素
  const statusElement = document.getElementById('connectionStatus');
  const badgeElement = document.getElementById('connection-badge');
  
  if (statusElement) {
    return statusElement.innerText.trim() === '已连接';
  } else if (badgeElement) {
    return badgeElement.classList.contains('bg-success');
  }
  
  // 默认假定未连接
  return false;
}

// 判断是否已开启轮询
function isPolling() {
  // 如果有全局状态，优先使用
  if (typeof window.modbusPolling !== 'undefined') {
    return window.modbusPolling;
  }
  
  // 尝试获取元素
  const statusElement = document.getElementById('pollingStatus');
  
  if (statusElement) {
    return statusElement.innerText.trim() === '已开启';
  }
  
  // 默认假定未开启轮询
  return false;
}

/**
 * 更新连接状态显示
 * @param {boolean} connected 是否已连接
 * @param {string} statusMessage 状态消息
 * @param {string} severityLevel 严重程度 ('success', 'warning', 'error')
 */
function updateConnectionStatus(connected, statusMessage = '', severityLevel = 'success') {
  console.log(`更新连接状态为: ${connected ? '已连接' : '未连接'}, 消息: ${statusMessage}, 级别: ${severityLevel}`);
  
  // 更新全局连接状态
  window.modbusConnected = connected;
  
  // 获取所有可能的状态显示元素
  const badges = document.querySelectorAll("#connection-badge");
  const connectBtns = document.querySelectorAll("#connectBtn, #toggle-connection-btn");
  const statusElements = document.querySelectorAll(".connection-status");
  
  // 更新所有状态标签
  badges.forEach(badge => {
    if (badge) {
      badge.innerHTML = connected ? (statusMessage || '已连接') : (statusMessage || '未连接');
      
      // 清除所有现有类
      badge.className = 'badge';
      
      if (connected) {
        badge.classList.add('bg-success');
        // 清除任何先前的动画
        badge.style.animation = '';
      } else {
        // 根据严重程度设置不同的样式
        if (severityLevel === 'warning') {
          badge.classList.add('bg-warning', 'text-dark');
          // 添加缓慢闪烁动画
          badge.style.animation = 'pulse 2s infinite';
        } else if (severityLevel === 'error') {
          badge.classList.add('bg-danger');
          // 添加快速闪烁动画
          badge.style.animation = 'pulse 1s infinite';
        } else {
          badge.classList.add('bg-secondary');
          badge.style.animation = '';
        }
      }
    }
  });
  
  // 更新所有连接按钮
  connectBtns.forEach(btn => {
    if (btn) {
      if (connected) {
        btn.innerHTML = '<i class="bi bi-plug-fill"></i> 断开连接';
        btn.className = 'btn btn-sm btn-outline-danger';
      } else {
        btn.innerHTML = '<i class="bi bi-plug"></i> 连接';
        btn.className = 'btn btn-sm btn-outline-success';
      }
      
      // 确保按钮是启用状态
      btn.disabled = false;
    }
  });
  
  // 更新所有状态文本元素
  statusElements.forEach(el => {
    if (el) {
      // 检查是否是轮询状态元素
      if (el.id === 'pollingStatus') return;
      
      el.textContent = connected ? '已连接' : '未连接';
      el.className = connected ? 
        'connection-status status-connected' : 
        'connection-status status-disconnected';
    }
  });
  
  // 更新轮询按钮状态
  const pollBtns = document.querySelectorAll("#pollBtn");
  pollBtns.forEach(btn => {
    if (btn) {
      btn.disabled = !connected;
    }
  });
}

// 更新轮询状态显示
function updatePollingStatus(polling, interval) {
  console.log(`更新轮询状态为: ${polling ? '已开启' : '未开启'}, 间隔: ${interval}ms`);
  
  // 更新全局轮询状态
  window.modbusPolling = !!polling;
  
  // 获取所有轮询状态元素
  const statusElements = document.querySelectorAll('#pollingStatus');
  const intervalElements = document.querySelectorAll('#pollingInterval');
  const pollBtns = document.querySelectorAll('#pollBtn');
  
  // 更新所有状态元素
  statusElements.forEach(el => {
    if (el) {
      el.innerText = polling ? '已开启' : '未开启';
      el.className = polling ? 'connection-status status-connected' : 'connection-status status-disconnected';
    }
  });
  
  // 更新所有间隔元素
  intervalElements.forEach(el => {
    if (el && interval) {
      el.innerText = polling ? `(${interval}ms)` : '';
    }
  });
  
  // 更新所有轮询按钮 - 仅当已连接时才启用
  pollBtns.forEach(btn => {
    if (btn) {
      btn.innerText = polling ? '停止轮询' : '开始轮询';
      btn.className = polling ? 'btn btn-outline-danger btn-sm' : 'btn btn-outline-secondary btn-sm';
      btn.innerHTML = polling ? 
        '<i class="bi bi-stop-fill"></i> 停止轮询' : 
        '<i class="bi bi-arrow-repeat"></i> 开始轮询';
      
      // 只有在已连接状态下才能启用轮询按钮
      btn.disabled = !isConnected();
    }
  });
}

/**
 * 加载连接状态
 */
function loadConnectionStatus() {
  console.log('正在加载连接状态...');
  
  // 获取所有状态显示元素
  const badges = document.querySelectorAll("#connection-badge");
  badges.forEach(badge => {
    if (badge) {
      badge.innerHTML = '检查中...';
      badge.className = 'badge bg-secondary';
    }
  });
  
  return new Promise(async (resolve, reject) => {
    try {
      // 首先获取数据源类型
      await loadDataSourceType();
      
      // 如果是MQTT数据源，显示MQTT连接状态而不是Modbus连接状态
      if (currentDataSourceType === 'mqtt') {
        console.log('当前数据源为MQTT，显示MQTT连接状态');
        updateConnectionStatus(true, 'MQTT数据源已启用', 'success');
        resolve({ connected: true, dataSourceType: 'mqtt' });
        return;
      }
      
      // 只有当数据源为modbus时才检查modbus连接状态
    fetch('/api/modbus/connection')
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP错误: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log('获取到连接状态:', data);
        
        // 从不同可能的响应格式中提取连接状态
        let isConnected = false;
        let statusMessage = '';
        let severityLevel = 'success';
        
        // 提取连接状态 - 支持多种API响应格式
        if (data.data && typeof data.data.isConnected === 'boolean') {
          isConnected = data.data.isConnected;
        } else if (typeof data.connected === 'boolean') {
          isConnected = data.connected;
        } else if (data.success && data.data && typeof data.data.connected === 'boolean') {
          isConnected = data.data.connected;
        }
        
        // 提取状态消息和严重程度
        if (data.message) {
          statusMessage = data.message;
        }
        
        if (isConnected) {
          // 连接成功
          updateConnectionStatus(true, statusMessage || '已连接', 'success');
        } else {
            // 连接失败 - 但不显示错误，因为可能使用MQTT数据源
            console.log('Modbus连接失败，但可能使用其他数据源');
            updateConnectionStatus(false, 'Modbus未连接', 'warning');
        }
        
        resolve(data);
      })
      .catch(error => {
        console.error('加载连接状态失败:', error);
          // 如果是MQTT数据源，不显示连接错误
          if (currentDataSourceType === 'mqtt') {
            updateConnectionStatus(true, 'MQTT数据源', 'success');
          } else {
        updateConnectionStatus(false, '连接状态检查失败', 'error');
          }
        reject(error);
      });
    } catch (error) {
      console.error('加载数据源类型失败:', error);
      updateConnectionStatus(false, '连接状态检查失败', 'error');
      reject(error);
    }
  });
}

// 加载轮询状态
async function loadPollingStatus() {
  console.log('正在加载轮询状态...');
  try {
    const response = await fetch(`${API_BASE_URL}/polling`);
    
    if (!response.ok) {
      throw new Error(`HTTP错误: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('获取到轮询状态:', data);
    
    if (data && data.success) {
      const status = data.data || {};
      const enabled = !!status.enabled;
      const interval = status.interval || 1000;
      
      // 更新轮询状态显示
      updatePollingStatus(enabled, interval);
      
      // 更新设置表单
      const intervalInput = document.getElementById('pollingIntervalInput');
      const autoPollingCheck = document.getElementById('autoPollingCheck');
      
      if (intervalInput) {
        intervalInput.value = interval;
      }
      
      if (autoPollingCheck) {
        autoPollingCheck.checked = enabled;
      }
      
      return { enabled, interval };
    } else {
      console.warn('无法获取轮询状态:', data);
      updatePollingStatus(false, 1000);
    }
  } catch (error) {
    console.error('加载轮询状态失败:', error);
    // 默认禁用轮询
    updatePollingStatus(false, 1000);
  }
}

// 加载数据点列表
async function loadDataPoints() {
  try {
    const response = await fetch('/api/modbus/data-points');
    if (!response.ok) {
      console.error('获取数据点失败:', response.statusText);
      return;
    }
    
    const data = await response.json();
    if (!data.success) {
      console.error('获取数据点失败:', data.error);
      return;
    }
    
    console.log(`加载了 ${data.dataPoints.length} 个数据点`);
    
    // 保存到全局变量中
    window.dataPoints = data.dataPoints;
    currentDataPoints = data.dataPoints;
    
    // 渲染数据点到表格
    renderDataPoints();
    
    // 清理已删除数据点的告警
    if (typeof cleanDeletedDataPointAlarms === 'function') {
      console.log('加载数据点后清理已删除数据点的告警');
      cleanDeletedDataPointAlarms();
    }
    
    return data.dataPoints;
  } catch (error) {
    console.error('加载数据点时出错:', error);
    return [];
  }
}

/**
 * 加载数据点值
 * @param {boolean} forceLoad 是否强制加载，即使不需要更新
 */
async function loadDataValues(forceLoad = false) {
  // 添加请求频率限制
  const now = Date.now();
  const lastRequestTime = window.lastDataValuesRequestTime || 0;
  const minInterval = 500; // 最小请求间隔500ms
  
  if (!forceLoad && (now - lastRequestTime) < minInterval) {
    console.log(`[数据加载] 请求过于频繁，跳过 (距离上次请求仅${now - lastRequestTime}ms)`);
    return;
  }
  
  window.lastDataValuesRequestTime = now;
  
  // 不强制加载且已有定时器，跳过
  if (!forceLoad && window.dataRefreshTimer) {
    return;
  }
  
  // 如果没有连接，跳过
  if (!isConnected()) {
    console.log('未连接到Modbus服务器，跳过数据加载');
    return;
  }
  
  try {
    console.log('[数据刷新] 开始获取数据点值');
    
    // 添加forceRefresh参数，确保获取最新数据
    const url = '/api/modbus/values' + (forceLoad ? '?forceRefresh=true' : '');
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`加载数据点值失败: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log(`[数据刷新] 获取到 ${Object.keys(result.data).length} 个数据点值`);
    
    // 更新全局数据
    const values = result.data;
    
    // 检查是否有新数据
    if (!forceLoad && window.currentDataValues) {
      let hasChanges = false;
      
      // 检查每个数据点是否有变化
      for (const key in values) {
        const newValue = values[key];
        const oldValue = window.currentDataValues[key];
        
        // 如果是新数据点，或者事务ID不同，则认为有变化
        if (!oldValue || newValue.transactionId !== oldValue.transactionId) {
          hasChanges = true;
          console.log(`[数据刷新] 检测到数据点 ${key} 有变化: ${oldValue?.value} -> ${newValue.value}`);
          break;
        }
        
        // 对于BIT格式，特别检查寄存器值和位值
        if (newValue.bitValue !== undefined && 
            (newValue.bitValue !== oldValue.bitValue || 
             newValue.registerValue !== oldValue.registerValue)) {
          hasChanges = true;
          console.log(`[数据刷新] 检测到BIT数据点 ${key} 有变化: 
            位值: ${oldValue?.bitValue} -> ${newValue.bitValue}, 
            寄存器: ${oldValue?.registerValue} -> ${newValue.registerValue}`);
          break;
        }
      }
      
      // 没有变化，不更新UI，但仍然更新全局数据
      if (!hasChanges && !forceLoad) {
        console.log('[数据刷新] 没有检测到数据变化，更新全局数据但跳过UI更新');
        window.currentDataValues = values;
        // 重置错误计数
        window.dataRefreshErrorCount = 0;
        return;
      }
    }
    
    // 更新数据显示
    updateDataValues(values);
    
    // 重置错误计数
    window.dataRefreshErrorCount = 0;
    
  } catch (error) {
    console.error('加载数据点值失败:', error);
    
    // 增加错误计数
    window.dataRefreshErrorCount = (window.dataRefreshErrorCount || 0) + 1;
    
    // 如果是连接错误，自动尝试重连
    if (error.message.includes('Failed to fetch') || 
        error.message.includes('NetworkError') || 
        !isConnected()) {
      
      console.log('检测到连接问题，尝试重新检查连接状态');
      await loadConnectionStatus();
      
      if (!isConnected()) {
        console.log('确认已断开连接，停止数据刷新');
        // 停止数据刷新
        if (window.dataRefreshTimer) {
          clearInterval(window.dataRefreshTimer);
          window.dataRefreshTimer = null;
        }
      }
    }
  }
}

// 强制加载数据点值
async function forceLoadDataValues() {
  console.log('强制加载数据点值...');
  try {
    // 添加forceRefresh参数，确保获取最新数据
    const response = await fetch('/api/modbus/values?forceRefresh=true');
    
    if (!response.ok) {
      throw new Error(`强制加载数据点值失败: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    if (result.success) {
      const dataValues = result.data;
      console.log(`成功加载 ${Object.keys(dataValues).length} 个数据点值:`, dataValues);
      
      // 更新全局数据
      window.currentDataValues = dataValues;
      
      // 直接调用updateDataValues更新数据点值
      updateDataValues(dataValues);
      
      return true;
    } else {
      console.error('强制加载数据点值失败:', result.error);
      return false;
    }
  } catch (error) {
    console.error('强制加载数据点值时出错:', error);
    return false;
  }
}

// 更新最后更新时间
function updateLastUpdateTime() {
  const lastUpdateElement = document.getElementById('lastUpdateTime');
  if (lastUpdateElement) {
    const now = new Date();
    lastUpdateElement.innerText = `最后更新: ${formatDateTime(now)}`;
  }
}

// 渲染数据点列表
function renderDataPoints() {
  // 渲染数据展示视图的表格
  renderDataDisplayTable();
  
  // 渲染数据管理视图的表格
  renderDataManageTable();
}

// 渲染数据展示视图的表格
function renderDataDisplayTable(firstRender = false) {
  const tableBody = document.getElementById('dataPointsTableBody');
  const noDataPoints = document.getElementById('noDataPoints');
  
  if (!tableBody) return;
  
  tableBody.innerHTML = '';
  
  if (!currentDataPoints || currentDataPoints.length === 0) {
    if (noDataPoints) noDataPoints.style.display = 'block';
    return;
  }
  
  if (noDataPoints) noDataPoints.style.display = 'none';
  
  // 添加调试日志 - 记录所有数据点和值
  console.log('[告警调试] 当前所有数据点:', currentDataPoints);
  console.log('[告警调试] 当前所有数据值:', window.currentDataValues);
  console.log('[告警调试] 开始渲染数据表，首次渲染?', firstRender);
  
  // 确保告警状态对象存在
  if (!window.alarmPlayingState) {
    window.alarmPlayingState = {
      isPlaying: false,
      activeAlarms: [],
      lastAlarmStates: {},
      loopCounter: 0,
      paused: false
    };
  }
  
  if (!window.alarmPlayingState.lastAlarmStates) {
    window.alarmPlayingState.lastAlarmStates = {};
  }
  
  // 按名称排序
  const sortedDataPoints = [...currentDataPoints].sort((a, b) => a.name.localeCompare(b.name));
  
  for (const dataPoint of sortedDataPoints) {
    const name = dataPoint.name;
    const identifier = dataPoint.identifier;
    
    // 尝试通过标识符和名称两种方式查找数据
    const value = window.currentDataValues[identifier] || 
                 window.currentDataValues[name] || 
                 { value: null, formatted: '无数据', timestamp: null };
    
    // 添加详细的调试日志
    console.log(`[告警调试] 渲染数据点: ${name}, 标识符: ${identifier || '无'}, 格式: ${dataPoint.format}, 告警已启用: ${!!dataPoint.alarmEnabled}, 当前值:`, value);
    
    // 检查是否是告警数据点
    let alarmStatus = '';
    let alarmTriggered = false;
    
    if (dataPoint.alarmEnabled && value.value !== null && value.value !== undefined) {
      // 获取数据点的当前告警状态（从lastAlarmStates中读取而非重新判断）
      const dataKey = identifier || name;
      const alarmState = window.alarmPlayingState.lastAlarmStates[dataKey] || { triggered: false };
      
      // 如果当前状态是告警触发，则显示告警UI
      if (alarmState.triggered) {
        alarmTriggered = true;
        const alarmContent = dataPoint.alarmContent || '告警触发';
        
        console.log(`[告警调试] 显示已触发的告警UI: ${name}, 内容: ${alarmContent}`);
        
        alarmStatus = `
          <div class="alarm-alert mt-1">
            <span class="badge bg-danger" data-bs-toggle="tooltip" 
                  title="${alarmContent.replace(/"/g, '&quot;')}">
              <i class="bi bi-bell-fill me-1"></i>告警
            </span>
          </div>
        `;
      }
    } else {
      if (dataPoint.alarmEnabled) {
        console.log(`[告警调试] 数据点有告警配置但未触发 - ${name}, 原因: 值为空或未定义`, value.value);
      }
    }
    
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        ${name}
        ${dataPoint.alarmEnabled ? '<i class="bi bi-bell-fill text-warning ms-1" data-bs-toggle="tooltip" title="已启用告警监控"></i>' : ''}
      </td>
      <td>${identifier || '-'}</td>
      <td>
        <div>
          <span class="fw-bold" id="value-${dataPoint.id}">
            ${getFormattedValueDisplay(value, dataPoint)}
          </span>
          ${dataPoint.unit ? ` <span class="text-muted">${dataPoint.unit}</span>` : ''}
        </div>
        ${alarmStatus}
      </td>
      <td>
        <small class="timestamp" id="timestamp-${dataPoint.id}">
          ${value.timestamp ? formatDateTime(new Date(value.timestamp)) : ''}
        </small>
      </td>
      <td class="text-end">
        ${dataPoint.accessMode !== 'read' ? `
          <button class="btn btn-outline-primary btn-sm" onclick="showWriteValueModal('${dataPoint.id}')">
            <i class="bi bi-pencil-square"></i> 写入
          </button>
        ` : ''}
      </td>
    `;
    tableBody.appendChild(row);
    
    if (alarmTriggered) {
      // 给触发告警的行添加高亮样式
      row.classList.add('alarm-row');
    }
  }
  
  // 初始化提示工具
  var tooltipTriggerList = [].slice.call(tableBody.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.map(function (tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl);
  });
}

// 渲染数据管理视图的表格
function renderDataManageTable() {
  const tableBody = document.getElementById('dataPointsManageTableBody');
  const noDataPoints = document.getElementById('noDataPointsManage');
  
  if (!tableBody) return; // 如果元素不存在则退出
  
  // 清空现有内容
  tableBody.innerHTML = '';
  
  // 如果没有数据点，显示提示信息
  if (currentDataPoints.length === 0) {
    if (noDataPoints) noDataPoints.style.display = 'block';
    return;
  }
  
  // 有数据点，隐藏提示信息
  if (noDataPoints) noDataPoints.style.display = 'none';
  
  // 添加数据点到表格 - 完整信息
  currentDataPoints.forEach(dp => {
    const row = document.createElement('tr');
    
    // 确定数据源类型
    const dataSourceType = dp.dataSourceType || 'modbus';
    
    // 确定访问模式和功能码
    let accessModeText = '';
    let functionCodeText = '';
    let addressOrTopicText = '';
    
    if (dataSourceType === 'mqtt') {
      // MQTT数据点
      accessModeText = '<span class="badge bg-info">订阅</span>';
      functionCodeText = 'MQTT';
      addressOrTopicText = dp.topic || `data/modbus/${dp.identifier}`;
    } else {
      // Modbus数据点
    if (dp.accessMode === 'read') {
      accessModeText = '<span class="badge bg-info">只读</span>';
      functionCodeText = getFunctionCodeText(dp.readFunctionCode);
    } else if (dp.accessMode === 'write') {
      accessModeText = '<span class="badge bg-warning">只写</span>';
      functionCodeText = getFunctionCodeText(dp.writeFunctionCode);
    } else if (dp.accessMode === 'readwrite') {
      accessModeText = '<span class="badge bg-success">读写</span>';
      functionCodeText = `读: ${getFunctionCodeText(dp.readFunctionCode)}, 写: ${getFunctionCodeText(dp.writeFunctionCode)}`;
    } else {
      accessModeText = dp.accessMode || 'read';
      }
      addressOrTopicText = dp.address || '';
    }
    
    // 根据数据格式添加位位置信息
    let formatDisplay = dp.format;
    if (dp.format === 'BIT' && dp.bitPosition !== undefined) {
      formatDisplay = `BIT(位${dp.bitPosition})`;
    } else if (dp.format === 'POINT') {
      // 为POINT格式显示源数据点和位位置信息
      const sourceInfo = dp.sourceDataPointIdentifier ? `源:${dp.sourceDataPointIdentifier}` : '';
      const bitInfo = dp.pointBitPosition !== undefined ? `位${dp.pointBitPosition}` : '';
      formatDisplay = `POINT(${sourceInfo}${sourceInfo && bitInfo ? ', ' : ''}${bitInfo})`;
    }
    
    row.innerHTML = `
      <td>${dp.name}</td>
      <td>${dp.identifier}</td>
      <td>${addressOrTopicText}</td>
      <td>${functionCodeText}</td>
      <td>${accessModeText}</td>
      <td>${formatDisplay}</td>
      <td>
        <div class="btn-group btn-group-sm" role="group">
          <button type="button" class="btn btn-outline-primary" onclick="showEditDataPointModal('${dp.id}')">
            <i class="bi bi-pencil"></i> 编辑
          </button>
          <button type="button" class="btn btn-outline-danger" onclick="confirmDeleteDataPoint('${dp.id}')">
            <i class="bi bi-trash"></i> 删除
          </button>
        </div>
      </td>
    `;
    tableBody.appendChild(row);
  });
}

// 获取功能码文本
function getFunctionCodeText(code) {
  switch (parseInt(code)) {
    case 3:
      return '3 - 读保持寄存器';
    case 4:
      return '4 - 读输入寄存器';
    case 6:
      return '6 - 写单个寄存器';
    case 16:
      return '16 - 写多个寄存器';
    default:
      return code ? `${code}` : '';
  }
}

// 更新数据值显示
function updateDataValues(values) {
  console.log('更新数据值:', values);
  
  // 防止没有值时的处理
  if (!values || Object.keys(values).length === 0) {
    console.log('没有数据值可更新');
    return;
  }
  
  // 更新全局数据值变量
  window.currentDataValues = values;
  
  currentDataPoints.forEach(dp => {
    const valueElement = document.getElementById(`value-${dp.id}`);
    const timestampElement = document.getElementById(`timestamp-${dp.id}`);
    
    if (!valueElement || !timestampElement) {
      console.log(`找不到数据点 ${dp.name} 的显示元素`);
      return;
    }
    
    if (values[dp.name]) {
      const dataValue = values[dp.name];
      console.log(`更新数据点: ${dp.name}, 原始值:`, dataValue);
      
      let newContent = '';
      let oldContent = valueElement.innerHTML;
      
      // 检查是否有错误
      if (dataValue.error) {
        newContent = `<span class="text-danger">${dataValue.formatted}</span>`;
      } else {
        // 对于位值，用特殊样式显示
        if (dp.format === 'BIT') {
          const bitValue = dataValue.value === 1 || dataValue.value === true;
          newContent = `<span class="badge ${bitValue ? 'bg-success' : 'bg-secondary'}">${bitValue ? '1' : '0'}</span>`;
        } else if (dp.format === 'POINT') {
          // 对于点位格式，显示解析后的位值
          const pointValue = dataValue.value === 1 || dataValue.value === true;
          newContent = `<span class="badge ${pointValue ? 'bg-success' : 'bg-secondary'}">${pointValue ? '1' : '0'}</span>`;
        } else {
          // 普通值 - 优先使用formatted，如果没有则显示原始值
          newContent = dataValue.formatted || 
                      (dataValue.value !== undefined ? String(dataValue.value) : '无数据');
        }
      }
      
      // 输出调试信息
      console.log(`${dp.name}: 旧值="${oldContent}", 新值="${newContent}"`);
      
      // 只有当内容真正改变时才更新DOM
      if (oldContent !== newContent) {
        valueElement.innerHTML = newContent;
        
        // 添加更新动画效果
        valueElement.classList.add('updated');
        setTimeout(() => {
          valueElement.classList.remove('updated');
        }, 1500);
      }
      
      // 更新时间戳
      if (dataValue.timestamp) {
        const formattedTime = formatDateTime(new Date(dataValue.timestamp));
        const oldTimestamp = timestampElement.innerText;
        
        if (oldTimestamp !== formattedTime) {
          timestampElement.innerText = formattedTime;
          
          // 添加更新动画效果
          timestampElement.classList.add('updated');
          setTimeout(() => {
            timestampElement.classList.remove('updated');
          }, 1500);
        }
      }
    }
  });
  
  // 处理POINT格式数据点的实时解析
  processPointDataPoints(values);
  
  // 检查告警状态
  checkAlarmStatus(values);
}

// 处理POINT格式数据点的实时解析
function processPointDataPoints(values) {
  // 查找所有POINT格式的数据点
  const pointDataPoints = currentDataPoints.filter(dp => dp.format === 'POINT');
  
  if (pointDataPoints.length === 0) {
    return;
  }
  
  console.log(`处理 ${pointDataPoints.length} 个POINT格式数据点的实时解析`);
  
  pointDataPoints.forEach(pointDP => {
    // 检查源数据点是否有更新
    const sourceDataPoint = currentDataPoints.find(dp => dp.identifier === pointDP.sourceDataPointIdentifier);
    if (!sourceDataPoint) {
      console.warn(`POINT数据点 ${pointDP.name} 的源数据点 ${pointDP.sourceDataPointIdentifier} 不存在`);
      return;
    }
    
    // 检查源数据点是否有新值
    const sourceValue = values[sourceDataPoint.name];
    if (!sourceValue || sourceValue.value === undefined || sourceValue.value === null) {
      return;
    }
    
    console.log(`解析POINT数据点 ${pointDP.name}, 源数据点: ${sourceDataPoint.name}, 源值: ${sourceValue.value}, 位位置: ${pointDP.pointBitPosition}`);
    
    // 解析点位值
    const numValue = parseInt(sourceValue.value, 10);
    if (isNaN(numValue)) {
      console.warn(`源数据点 ${sourceDataPoint.name} 的值 ${sourceValue.value} 不是有效数字`);
      return;
    }
    
    // 提取指定位的值
    const bitValue = (numValue >> pointDP.pointBitPosition) & 1;
    
    console.log(`POINT数据点 ${pointDP.name} 解析结果: 源值=${numValue}, 位位置=${pointDP.pointBitPosition}, 位值=${bitValue}`);
    
    // 创建解析后的数据值对象
    const pointValue = {
      value: bitValue,
      formatted: bitValue.toString(),
      timestamp: sourceValue.timestamp || new Date().toISOString(),
      quality: 'GOOD',
      source: 'point_parsing'
    };
    
    // 更新values对象，这样后续的UI更新会包含这个解析后的值
    if (!values[pointDP.name]) {
      values[pointDP.name] = pointValue;
    } else {
      // 只更新值，保留其他属性
      values[pointDP.name].value = bitValue;
      values[pointDP.name].formatted = bitValue.toString();
      values[pointDP.name].timestamp = pointValue.timestamp;
    }
    
    // 立即更新UI显示
    const valueElement = document.getElementById(`value-${pointDP.id}`);
    const timestampElement = document.getElementById(`timestamp-${pointDP.id}`);
    
    if (valueElement) {
      const newContent = `<span class="badge ${bitValue ? 'bg-success' : 'bg-secondary'}">${bitValue ? '1' : '0'}</span>`;
      const oldContent = valueElement.innerHTML;
      
      if (oldContent !== newContent) {
        valueElement.innerHTML = newContent;
        
        // 添加更新动画效果
        valueElement.classList.add('updated');
        setTimeout(() => {
          valueElement.classList.remove('updated');
        }, 1500);
      }
    }
    
    if (timestampElement && pointValue.timestamp) {
      const formattedTime = formatDateTime(new Date(pointValue.timestamp));
      const oldTimestamp = timestampElement.innerText;
      
      if (oldTimestamp !== formattedTime) {
        timestampElement.innerText = formattedTime;
        
        // 添加更新动画效果
        timestampElement.classList.add('updated');
        setTimeout(() => {
          timestampElement.classList.remove('updated');
        }, 1500);
      }
    }
  });
}

// 添加告警检查函数
function checkAlarmStatus(values) {
  // 如果没有初始化告警状态，先初始化
  if (!window.alarmPlayingState) {
    console.log('[告警调试] 初始化告警状态对象');
    window.alarmPlayingState = {
      isPlaying: false,
      activeAlarms: [],
      lastAlarmStates: {},
      loopCounter: 0,
      paused: false,
      alarmCount: 0,
      nextAlarmTime: null,
      alarmHistory: [],
      alarmFirstTriggerTime: {},
      processingAlarms: {} // 新增：记录正在处理的告警，防止重复触发
    };
  }

  console.log('[告警调试] 【告警检测唯一入口】开始检查告警状态');
  console.log('[告警调试] 传入的数据:', values);
  console.log('[告警调试] 数据点数量:', Object.keys(values).length);

  // 清理已删除数据点的告警
  cleanDeletedDataPointAlarms();
  
  // 遍历所有数据点，检查告警状态
  Object.entries(values).forEach(([name, value]) => {
    console.log(`[告警调试] 处理数据点: ${name}, 值:`, value);
    
    // 使用window.dataPoints或currentDataPoints来查找数据点
    const allDataPoints = window.dataPoints || currentDataPoints || [];
    console.log(`[告警调试] 可用数据点总数: ${allDataPoints.length}`);
    
    if (!allDataPoints.some(dp => dp.name === name)) {
      console.log(`[告警调试] 数据点 ${name} 已删除，从告警状态中移除`);
      delete window.alarmPlayingState.lastAlarmStates[name];
      delete window.alarmPlayingState.alarmFirstTriggerTime[name];
      return;
    }
    
    // 获取当前数据点配置
    const dataPoint = allDataPoints.find(dp => dp.name === name);
    console.log(`[告警调试] 找到数据点配置:`, dataPoint ? {
      name: dataPoint.name,
      identifier: dataPoint.identifier,
      format: dataPoint.format,
      alarmEnabled: dataPoint.alarmEnabled,
      alarmContent: dataPoint.alarmContent,
      lowLevelAlarm: dataPoint.lowLevelAlarm
    } : '未找到');
    
    if (!dataPoint || !dataPoint.alarmEnabled) {
      console.log(`[告警调试] 数据点 ${name} 未启用告警或配置不存在，跳过检查`);
      return;
    }
    
    const identifier = dataPoint.identifier;
    if (!identifier) return;
    
    // 获取上一次的告警状态
    const lastState = window.alarmPlayingState.lastAlarmStates[identifier] || { value: 0, triggered: false };
    
    // 判断当前值是否触发告警（对BIT和POINT类型特殊处理）
    let currentTriggered = false;
    const currentValue = value.value;
    
    if (dataPoint.format === 'BIT' || dataPoint.format === 'POINT') {
      // 使用更灵活的比较方式，转换为字符串后比较
      const strValue = String(currentValue).toLowerCase();
      // 改进的告警触发判断逻辑，支持多种"1"的表示方式
      currentTriggered = strValue === '1' || strValue === 'true' || currentValue === 1 || currentValue === true;
      
      console.log(`[告警调试] ${dataPoint.format}类型告警检查 - 数据点: ${name}, 原始值:`, currentValue, 
                 `, 类型:`, typeof currentValue, `, 字符串值:`, strValue, 
                 `, 是否触发:`, currentTriggered, 
                 `, 上次状态:`, lastState.triggered);
    }
    // 可以在这里添加其他类型的告警判断逻辑
    
    // 简化值为标准数值形式
    const normalizedValue = currentTriggered ? 1 : 0;
    const lastValue = lastState.triggered ? 1 : 0;
    
    // 根据是否启用低位报警来决定告警触发逻辑
    let isNewAlarm, isAlarmCleared;
    
    if (dataPoint.lowLevelAlarm) {
      // 低位报警：从1变为0时触发告警，从0变为1时解除告警
      isNewAlarm = (lastState.triggered && !currentTriggered);
      isAlarmCleared = (!lastState.triggered && currentTriggered);
      console.log(`[告警调试] 低位报警模式 - 数据点 ${identifier}: 当前值=${normalizedValue}, 上次值=${lastValue}, 新告警=${isNewAlarm}, 告警解除=${isAlarmCleared}`);
    } else {
      // 正常报警：从0变为1时触发告警，从1变为0时解除告警
      isNewAlarm = (!lastState.triggered && currentTriggered);
      isAlarmCleared = (lastState.triggered && !currentTriggered);
      console.log(`[告警调试] 正常报警模式 - 数据点 ${identifier}: 当前值=${normalizedValue}, 上次值=${lastValue}, 新告警=${isNewAlarm}, 告警解除=${isAlarmCleared}`);
    }
    
    console.log(`[告警调试] 检查数据点 ${identifier}: 当前值=${normalizedValue}, 上次值=${lastValue}, 新告警=${isNewAlarm}, 告警解除=${isAlarmCleared}`);
    
    // 更新状态记录，不管是否有变化都更新，确保状态一致
    window.alarmPlayingState.lastAlarmStates[identifier] = {
      value: currentValue,
      triggered: currentTriggered
    };
    
    // 处理新告警
    if (isNewAlarm) {
      console.log(`[告警调试] 检测到新告警: ${identifier}`);
      
      // 获取告警内容
      const alarmContent = dataPoint.alarmContent || `${name}告警`;
      
      // 检查是否在处理中，防止重复触发
      const alarmKey = `${identifier}:${alarmContent}`;
      const now = Date.now();
      const processingTimeout = 5000; // 5秒内不重复处理同一告警
      
      if (window.alarmPlayingState.processingAlarms[alarmKey] && 
          (now - window.alarmPlayingState.processingAlarms[alarmKey]) < processingTimeout) {
        console.log(`[告警调试] 告警 ${alarmKey} 正在处理中，跳过重复触发`);
        return;
      }
      
      // 标记为正在处理
      window.alarmPlayingState.processingAlarms[alarmKey] = now;
      
      // 始终生成新的触发时间
      const triggerTime = new Date().toISOString();
      
      console.log(`[告警调试] 触发告警: ${alarmContent}, 时间: ${triggerTime}`);
      
      // 发送告警到后端
      sendAlarmToBackend(identifier, alarmContent, triggerTime);
      
      // 更新前端告警状态
      if (!window.alarmPlayingState.activeAlarms.includes(alarmContent)) {
        window.alarmPlayingState.activeAlarms.push(alarmContent);
      }
      
      // 更新告警首次触发时间 - 始终使用最新时间
      window.alarmPlayingState.alarmFirstTriggerTime[alarmContent] = triggerTime;
      
      // 播放告警声音
      playAlarmSound([alarmContent]);
      
      // 【新增】更新前端告警显示组件
      console.log(`[告警调试] 调用前端告警显示组件更新`);
      
      // 构造告警数据对象，用于前端显示
      const alarmDisplayData = {
        identifier: identifier,
        content: alarmContent,
        timestamp: triggerTime,
        dataPointName: dataPoint.name || name,
        value: currentValue,
        format: dataPoint.format
      };
      
      console.log(`[告警调试] 告警显示数据:`, alarmDisplayData);
      
      // 调用前端显示函数（如果存在）
      if (typeof processAlarmMessage === 'function') {
        console.log(`[告警调试] 调用processAlarmMessage更新前端显示`);
        processAlarmMessage(alarmDisplayData);
      } else if (typeof window.processAlarmMessage === 'function') {
        console.log(`[告警调试] 调用window.processAlarmMessage更新前端显示`);
        window.processAlarmMessage(alarmDisplayData);
      } else {
        console.warn(`[告警调试] 未找到processAlarmMessage函数，无法更新前端显示`);
        
        // 尝试直接操作DOM元素
        try {
          const newAlarmsList = document.getElementById('newAlarmsList');
          const newNoAlarms = document.getElementById('newNoAlarms');
          
          if (newAlarmsList && newNoAlarms) {
            console.log(`[告警调试] 直接操作DOM更新告警显示`);
            
            // 隐藏"无告警"提示
            newNoAlarms.style.display = 'none';
            
            // 检查是否已存在该告警
            const existingAlarm = document.getElementById(`new-alarm-${identifier}`);
            if (!existingAlarm) {
              // 创建新的告警元素
              const newAlarmElement = document.createElement('div');
              newAlarmElement.className = 'new-alarm-item';
              newAlarmElement.id = `new-alarm-${identifier}`;
              
              // 格式化时间
              const displayTime = new Date(triggerTime).toLocaleString();
              
              // 设置告警内容
              newAlarmElement.innerHTML = `
                <div class="new-alarm-title" style="font-weight: bold; color: #dc3545; margin-bottom: 8px;">
                  <i class="bi bi-exclamation-triangle-fill text-danger me-2"></i>
                  ${dataPoint.name || identifier}
                </div>
                <div class="new-alarm-desc" style="color: #666; font-size: 0.9em; margin-bottom: 8px;">
                  ${alarmContent}
                </div>
                <div class="new-alarm-time" style="color: #999; font-size: 0.8em; margin-bottom: 8px;">
                  触发时间: ${displayTime}
                </div>
                <div class="mt-2">
                  <span class="new-alarm-alert" style="display: inline-block; padding: 4px 8px; border-radius: 3px; background-color: rgba(220, 53, 69, 0.1); color: #dc3545;">
                    <i class="bi bi-bell-fill me-1"></i> 告警中
                  </span>
                </div>
              `;
              
              // 设置样式
              newAlarmElement.style.cssText = `
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                position: relative !important;
                padding: 15px !important;
                margin-bottom: 10px !important;
                border-radius: 5px !important;
                background-color: #fff !important;
                border-left: 4px solid #dc3545 !important;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1) !important;
              `;
              
              // 添加到告警列表
              newAlarmsList.appendChild(newAlarmElement);
              console.log(`[告警调试] 已添加告警到前端显示: ${identifier}`);
              
              // 确保实时告警视图可见
              const realTimeAlarmsView = document.getElementById('real-time-alarms');
              if (realTimeAlarmsView && !realTimeAlarmsView.classList.contains('active')) {
                // 切换到实时告警视图
                document.querySelectorAll('.view-container').forEach(container => {
                  container.classList.remove('active');
                });
                realTimeAlarmsView.classList.add('active');
                
                // 更新侧边栏导航
                document.querySelectorAll('.sidebar-nav-link').forEach(link => {
                  link.classList.remove('active');
                  if (link.getAttribute('data-view') === 'real-time-alarms') {
                    link.classList.add('active');
                  }
                });
                
                console.log(`[告警调试] 已切换到实时告警视图`);
              }
            } else {
              console.log(`[告警调试] 告警 ${identifier} 已存在于前端显示中`);
            }
          } else {
            console.warn(`[告警调试] 未找到告警显示DOM元素`);
          }
        } catch (error) {
          console.error(`[告警调试] 直接操作DOM更新告警显示失败:`, error);
        }
      }
      
      console.log(`[告警调试] 告警状态已更新: ${alarmContent}, 触发时间: ${triggerTime}`);
      
      // 5秒后自动清除处理状态
      setTimeout(() => {
        delete window.alarmPlayingState.processingAlarms[alarmKey];
        console.log(`[告警调试] 告警 ${alarmKey} 处理状态已清除`);
      }, processingTimeout);
    }
    
    // 处理告警解除
    if (isAlarmCleared) {
      console.log(`[告警调试] 检测到告警解除: ${identifier}`);
      
      // 获取告警内容
      const alarmContent = dataPoint.alarmContent || `${name}告警`;
      
      // 检查是否在处理中，防止重复触发
      const alarmKey = `${identifier}:${alarmContent}:clear`;
      const now = Date.now();
      const processingTimeout = 5000; // 5秒内不重复处理同一告警解除
      
      if (window.alarmPlayingState.processingAlarms[alarmKey] && 
          (now - window.alarmPlayingState.processingAlarms[alarmKey]) < processingTimeout) {
        console.log(`[告警调试] 告警解除 ${alarmKey} 正在处理中，跳过重复触发`);
        return;
      }
      
      // 标记为正在处理
      window.alarmPlayingState.processingAlarms[alarmKey] = now;
      
      // 从活动告警列表中移除
      const index = window.alarmPlayingState.activeAlarms.indexOf(alarmContent);
      if (index !== -1) {
        window.alarmPlayingState.activeAlarms.splice(index, 1);
        console.log(`[告警调试] 已从活动告警列表中移除: ${alarmContent}`);
        
        // 记录告警解除时间
        const clearedTime = new Date().toISOString();
        
        // 发送告警解除到后端
        sendAlarmClearToBackend(identifier, alarmContent, clearedTime);
        
        // 【新增】更新前端告警显示组件 - 移除告警
        console.log(`[告警调试] 从前端显示中移除告警: ${identifier}`);
        
        // 构造告警解除数据对象
        const alarmClearData = {
          identifier: identifier,
          content: alarmContent,
          timestamp: clearedTime,
          dataPointName: dataPoint.name || name,
          value: currentValue,
          format: dataPoint.format
        };
        
        console.log(`[告警调试] 告警解除数据:`, alarmClearData);
        
        // 调用前端显示函数（如果存在）
        if (typeof processAlarmClearedMessage === 'function') {
          console.log(`[告警调试] 调用processAlarmClearedMessage更新前端显示`);
          processAlarmClearedMessage(alarmClearData);
        } else if (typeof window.processAlarmClearedMessage === 'function') {
          console.log(`[告警调试] 调用window.processAlarmClearedMessage更新前端显示`);
          window.processAlarmClearedMessage(alarmClearData);
        } else {
          console.warn(`[告警调试] 未找到processAlarmClearedMessage函数，直接操作DOM移除告警`);
          
          // 尝试直接操作DOM元素移除告警
          try {
            const alarmElement = document.getElementById(`new-alarm-${identifier}`);
            if (alarmElement) {
              console.log(`[告警调试] 找到告警元素，准备移除: new-alarm-${identifier}`);
              alarmElement.parentNode.removeChild(alarmElement);
              console.log(`[告警调试] 已从前端显示中移除告警: ${identifier}`);
              
              // 检查是否还有其他告警
              const newAlarmsList = document.getElementById('newAlarmsList');
              const newNoAlarms = document.getElementById('newNoAlarms');
              
              if (newAlarmsList && newNoAlarms && newAlarmsList.children.length === 0) {
                newNoAlarms.style.display = 'block';
                console.log(`[告警调试] 无更多告警，显示"无告警"提示`);
              }
            } else {
              console.warn(`[告警调试] 未找到对应的告警元素: new-alarm-${identifier}`);
            }
          } catch (error) {
            console.error(`[告警调试] 直接操作DOM移除告警失败:`, error);
          }
        }
      }
      
      // 5秒后自动清除处理状态
      setTimeout(() => {
        delete window.alarmPlayingState.processingAlarms[alarmKey];
        console.log(`[告警调试] 告警解除 ${alarmKey} 处理状态已清除`);
      }, processingTimeout);
    }
  });
  
  // 完成检查后更新告警状态显示
  updateAlarmStatusDisplay();
}

// 添加一个新函数，用于向后端发送告警信息
function sendAlarmToBackend(identifier, content, triggerTime, retryCount = 0) {
  try {
    // 确保使用最新的触发时间
    const now = new Date();
    const currentTriggerTime = now.toISOString();
    
    console.log(`[告警调试] 开始向后端发送告警: ${identifier}, ${content}`);
    console.log(`[告警调试] - 原始触发时间: ${triggerTime}`);
    console.log(`[告警调试] - 使用最新时间: ${currentTriggerTime}`);
    console.log(`[告警调试] - 当前时间戳: ${now.getTime()}`);
    console.log(`[告警调试] - 重试次数: ${retryCount}`);
    
    // 最大重试次数
    const maxRetries = 2;
    
    // 使用fetch API向后端发送告警信息
    fetch('/api/modbus/alarms/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        identifier: identifier,
        content: content,
        triggerTime: currentTriggerTime
      })
    })
    .then(response => {
      console.log(`[告警调试] 告警发送请求状态: ${response.status} ${response.statusText}`);
      
      // 如果响应不成功，且未超过最大重试次数，则重试
      if (!response.ok) {
        if (retryCount < maxRetries) {
          console.log(`[告警调试] 发送告警失败，将在2秒后重试，当前重试次数: ${retryCount}`);
          // 延迟2秒后重试
          setTimeout(() => {
            sendAlarmToBackend(identifier, content, currentTriggerTime, retryCount + 1);
          }, 2000);
          return { error: '响应不成功，将重试' };
        } else {
          console.error(`[告警调试] 发送告警失败，已达到最大重试次数: ${maxRetries}`);
          return { error: '达到最大重试次数' };
        }
      }
      
      return response.json();
    })
    .then(data => {
      // 如果包含错误信息，说明是重试逻辑返回的对象，不继续处理
      if (data && data.error) {
        console.log(`[告警调试] 等待重试: ${data.error}`);
        return;
      }
      
      console.log('[告警调试] 告警信息已发送到后端，响应:', data);
      
      // 检查响应中的触发时间是否与我们发送的一致
      if (data && data.alarm && data.alarm.triggerTime) {
        console.log(`[告警调试] 服务器记录的触发时间: ${data.alarm.triggerTime}`);
        
        // 更新本地存储的触发时间
        if (window.alarmPlayingState && window.alarmPlayingState.alarmFirstTriggerTime) {
          window.alarmPlayingState.alarmFirstTriggerTime[content] = data.alarm.triggerTime;
          console.log(`[告警调试] 已更新本地触发时间记录: ${content} = ${data.alarm.triggerTime}`);
        }
      }
    })
    .catch(error => {
      console.error('[告警调试] 向后端发送告警信息失败:', error);
      
      // 如果发生错误且未超过最大重试次数，则重试
      if (retryCount < maxRetries) {
        console.log(`[告警调试] 发送告警出错，将在3秒后重试，当前重试次数: ${retryCount}`);
        // 延迟3秒后重试
        setTimeout(() => {
          sendAlarmToBackend(identifier, content, currentTriggerTime, retryCount + 1);
        }, 3000);
      } else {
        console.error(`[告警调试] 发送告警最终失败，已达到最大重试次数: ${maxRetries}`);
      }
    });
  } catch (error) {
    console.error('[告警调试] 准备告警数据时出错:', error);
  }
}

// 格式化日期时间
function formatDateTime(date) {
  try {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = padZero(d.getMonth() + 1);
    const day = padZero(d.getDate());
    const hour = padZero(d.getHours());
    const minute = padZero(d.getMinutes());
    const second = padZero(d.getSeconds());
    
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  } catch (e) {
    console.error('[告警调试] 格式化时间失败:', e, '原始值:', date);
    return date || '无效日期';
  }
}

// 数字补零
function padZero(num) {
  return String(num).padStart(2, '0');
}

// 切换连接状态
async function toggleConnection() {
  try {
    showLoader();
    
    const connected = isConnected();
    console.log('toggleConnection: 当前连接状态=', connected);
    
    if (connected) {
      // 断开连接
      console.log('toggleConnection: 开始断开连接...');
      const response = await fetch('/api/modbus/connection', {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('断开连接失败');
      }
      
      // 更新连接状态
      updateConnectionStatus(false, '已断开连接');
      
      // 清除数据刷新定时器
      if (window.dataRefreshTimer) {
        clearInterval(window.dataRefreshTimer);
        window.dataRefreshTimer = null;
      }
      
      // 清空数据点值
      updateDataValues({});
      
    } else {
      // 获取连接配置
      const hostInput = document.getElementById('hostInput');
      const portInput = document.getElementById('portInput');
      const unitIdInput = document.getElementById('unitIdInput');
      const timeoutInput = document.getElementById('timeoutInput');
      
      // 准备连接配置
      const config = {
        host: hostInput?.value || '127.0.0.1',
        port: parseInt(portInput?.value || '502'),
        unitId: parseInt(unitIdInput?.value || '1'),
        timeout: parseInt(timeoutInput?.value || '5000'),
        autoConnect: false,
        autoReconnect: true
      };
      
      console.log('toggleConnection: 开始连接，skipPolling=true, 配置:', config);
      
      // 发送连接请求，明确添加skipPolling=true参数
      const response = await fetch('/api/modbus/connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          config,
          skipPolling: true  // 关键：设置skipPolling为true，禁止自动启动轮询
        })
      });
      
      if (!response.ok) {
        throw new Error('连接失败');
      }
      
      const result = await response.json();
      console.log('toggleConnection: 连接成功，响应:', result);
      
      // 更新连接状态
      updateConnectionStatus(true, '已连接');
      
      // 连接成功后，执行一次性轮询读取数据
      console.log('toggleConnection: 连接成功后执行一次性轮询...');
      try {
        // 发送一次性轮询请求
        const pollResponse = await fetch('/api/modbus/poll-once', {
          method: 'POST'
        });
        
        if (pollResponse.ok) {
          const pollResult = await pollResponse.json();
          console.log('一次性轮询成功，数据:', pollResult);
          
          // 加载并显示数据
          await loadDataValues(true);
          
          // 更新最后更新时间
          updateLastUpdateTime();
          
          showSuccess('已成功读取最新数据');
        } else {
          console.warn('一次性轮询请求失败');
        }
      } catch (pollError) {
        console.error('执行一次性轮询时出错:', pollError);
      }
    }
    
  } catch (error) {
    console.error('连接操作失败:', error);
    showError(error.message);
    updateConnectionStatus(false, error.message, 'error');
  } finally {
    hideLoader();
  }
}

// 切换轮询状态
async function togglePolling() {
  showLoader();
  
  try {
    const polling = isPolling();
    
    if (polling) {
      // 停止轮询
      const response = await fetch(`${API_BASE_URL}/polling/stop`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error(`停止轮询失败: ${response.status}`);
      }
      
      // 更新轮询状态
      updatePollingStatus(false);
      
      // 使用定时器管理器清除数据刷新定时器
      window.TimerManager.clearTimer('dataRefresh');
      
      // 清除旧的全局定时器变量（兼容性）
      if (window.dataRefreshTimer) {
        clearInterval(window.dataRefreshTimer);
        window.dataRefreshTimer = null;
      }
      
    } else {
      // 启动轮询
      const response = await fetch(`${API_BASE_URL}/polling/start`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error(`启动轮询失败: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        const pollingData = result.data || {};
        
        // 更新轮询状态显示
        updatePollingStatus(true, pollingData.interval || 1000);
        
        // 立即加载一次数据
        await loadDataValues(true);
        
        // 设置定期刷新
        setupDataRefresh(pollingData.interval || 1000);
      } else {
        throw new Error(result.error || '启动轮询失败');
      }
    }
  } catch (error) {
    console.error('轮询操作失败:', error);
    showError(error.message);
  } finally {
    hideLoader();
  }
}

// 设置数据自动刷新
function setupDataRefresh(interval = 1000) {
  // 使用定时器管理器清除现有的数据刷新定时器
  window.TimerManager.clearTimer('dataRefresh');
  
  // 清除旧的全局定时器变量（兼容性）
  if (window.dataRefreshTimer) {
    clearInterval(window.dataRefreshTimer);
    window.dataRefreshTimer = null;
    console.log('已清除旧的全局数据刷新定时器');
  }
  
  // 确保轮询间隔至少为500毫秒
  const pollingInterval = Math.max(500, interval);
  
  console.log(`设置数据刷新定时器，间隔: ${pollingInterval}ms`);
  
  // 使用定时器管理器设置新的定时器
  const timerId = window.TimerManager.setTimer('dataRefresh', () => {
    // 检查连接和轮询状态
    const connected = isConnected();
    const polling = isPolling();
    
    console.log(`[定时器检查] 连接状态: ${connected}, 轮询状态: ${polling}`);
    
    if (!connected) {
      console.log('连接已断开，停止数据刷新定时器');
      window.TimerManager.clearTimer('dataRefresh');
      return;
    }
    
    if (!polling) {
      console.log('轮询已停止，停止数据刷新定时器');
      window.TimerManager.clearTimer('dataRefresh');
      return;
    }
    
    // 执行数据更新，强制刷新以获取最新数据
    console.log('[定时器] 执行数据刷新...');
    loadDataValues(true).catch(err => {
      console.error('数据刷新失败:', err);
      // 连续失败3次后停止定时器
      window.dataRefreshErrorCount = (window.dataRefreshErrorCount || 0) + 1;
      if (window.dataRefreshErrorCount >= 3) {
        console.warn('数据刷新连续失败3次，停止定时器');
        window.TimerManager.clearTimer('dataRefresh');
      }
    });
  }, pollingInterval);
  
  // 保持兼容性，设置全局变量
  window.dataRefreshTimer = timerId;
}

// 显示设置模态框
function showSettingsModal() {
  settingsModal.show();
}

// 保存设置
async function saveSettings() {
  showLoader();
  
  try {
    const connectionConfig = {
      host: document.getElementById('hostInput').value,
      port: parseInt(document.getElementById('portInput').value),
      unitId: parseInt(document.getElementById('unitIdInput').value),
      timeout: parseInt(document.getElementById('timeoutInput').value),
      autoConnect: document.getElementById('autoConnectCheck').checked
    };
    
    // 获取用户输入的轮询间隔
    let userInterval = parseInt(document.getElementById('pollingIntervalInput').value);
    
    // 获取最小建议轮询间隔
    const minIntervalInfo = await getMinPollingInterval();
    if (minIntervalInfo) {
      // 如果用户设置的间隔小于建议间隔，自动调整
      if (userInterval < minIntervalInfo.minRecommendedInterval) {
        userInterval = minIntervalInfo.minRecommendedInterval;
        showMessage(`轮询间隔已自动调整为最小建议值: ${userInterval}ms`);
      }
    }
    
    const pollingConfig = {
      interval: userInterval,
      enabled: document.getElementById('autoPollingCheck').checked
    };
    
    // 更新连接配置
    await axios.put(`${API_BASE_URL}/connection/config`, connectionConfig);
    
    // 更新轮询配置
    await axios.put(`${API_BASE_URL}/polling/config`, pollingConfig);
    
    // 重新加载状态
    await loadConnectionStatus();
    await loadPollingStatus();
    
    // 关闭模态框
    settingsModal.hide();
  } catch (error) {
    console.error('保存设置失败:', error);
    showError(error.response?.data?.error || '保存设置失败');
  } finally {
    hideLoader();
  }
}

// 显示添加数据点模态框
function showAddDataPointModal() {
  try {
    // 设置添加模式
    isEditMode = false;
    document.getElementById('dataPointModalTitle').innerHTML = '<i class="bi bi-plus-circle"></i> 添加数据点';
    
    // 清空表单
    document.getElementById('dataPointForm').reset();
    document.getElementById('dataPointId').value = '';
    
    // 设置默认值
    document.getElementById('formatSelect').value = 'UINT16';
    document.getElementById('scaleInput').value = '1';
    document.getElementById('accessModeSelect').value = 'read';
    
    // 根据当前数据源类型更新表单
    updateDataPointFormForDataSource(currentDataSourceType);
    
    // 更新功能码选项
    updateFunctionCodeOptions();
    
    // 处理格式变化
    handleFormatChange();
    
    // 隐藏告警设置
    const alarmEnabledCheck = document.getElementById('alarmEnabledCheck');
    if (alarmEnabledCheck) {
      alarmEnabledCheck.checked = false;
      toggleAlarmSettings();
    }
    
    // 确保模态框正确显示
    const modalElement = document.getElementById('dataPointModal');
    if (modalElement) {
      // 先检查是否已有模态框实例
      let modalInstance = bootstrap.Modal.getInstance(modalElement);
      if (!modalInstance) {
        modalInstance = new bootstrap.Modal(modalElement);
      }
      
      // 显示模态框
      modalInstance.show();
    } else {
      console.error('找不到数据点模态框元素');
      showError('无法显示添加界面');
    }
  } catch (error) {
    console.error('显示添加数据点模态框时出错:', error);
    showError('显示添加界面时出错: ' + error.message);
  }
}

// 根据数据源类型更新表单显示
function updateDataPointFormForDataSource(dataSourceType) {
  // 更新数据源类型提示
  const dataSourceTypeInfo = document.getElementById('currentDataSourceType');
  dataSourceTypeInfo.textContent = `当前数据源类型: ${dataSourceType === 'mqtt' ? 'MQTT' : 'Modbus TCP'}`;
  
  // 获取访问模式相关元素
  const accessModeDiv = document.getElementById('accessModeSelect')?.closest('.mb-3');
  const addressDiv = document.getElementById('addressInput')?.closest('.mb-3');
  
  // 根据数据源类型显示相应设置
  if (dataSourceType === 'mqtt') {
    // MQTT模式：隐藏Modbus特有的设置
    document.getElementById('modbusSettings').style.display = 'none';
    document.getElementById('mqttSettings').style.display = 'block';
    
    // 隐藏访问模式选择器（MQTT数据点通常是只读的，通过主题订阅获取数据）
    if (accessModeDiv) {
      accessModeDiv.style.display = 'none';
    }
    
    // 隐藏地址输入（MQTT使用主题而不是地址）
    if (addressDiv) {
      addressDiv.style.display = 'none';
    }
    
    // MQTT模式下位设置只在BIT格式下显示
    const format = document.getElementById('formatSelect').value;
    document.getElementById('bitPositionDiv').style.display = format === 'BIT' ? 'block' : 'none';
  } else {
    // Modbus模式：显示Modbus特有的设置
    document.getElementById('modbusSettings').style.display = 'block';
    document.getElementById('mqttSettings').style.display = 'none';
    
    // 显示访问模式选择器
    if (accessModeDiv) {
      accessModeDiv.style.display = 'block';
    }
    
    // 显示地址输入
    if (addressDiv) {
      addressDiv.style.display = 'block';
    }
  }
}

// 显示编辑数据点模态框
function showEditDataPointModal(id) {
  try {
    // 查找数据点
    const dataPoint = currentDataPoints.find(dp => dp.id === id);
    if (!dataPoint) {
      console.error('找不到指定的数据点:', id);
      showError('找不到指定的数据点');
      return;
    }
    
    // 设置编辑模式
    isEditMode = true;
    document.getElementById('dataPointModalTitle').innerHTML = '<i class="bi bi-pencil-square"></i> 编辑数据点';
    
    // 填充表单
    document.getElementById('dataPointId').value = dataPoint.id;
    document.getElementById('nameInput').value = dataPoint.name;
    document.getElementById('identifierInput').value = dataPoint.identifier || '';
    
    // 根据数据点的数据源类型更新表单
    const dataSourceType = dataPoint.dataSourceType || 'modbus';
    currentDataSourceType = dataSourceType;
    updateDataPointFormForDataSource(dataSourceType);
    
    // 根据数据源类型设置不同的字段
    if (dataSourceType === 'mqtt') {
      // MQTT数据点字段
      if (dataPoint.topic) {
        document.getElementById('mqttTopicInput').value = dataPoint.topic;
      }
    } else {
      // Modbus数据点字段
      document.getElementById('accessModeSelect').value = dataPoint.accessMode || 'read';
      if (dataPoint.address !== undefined && dataPoint.address !== null) {
        document.getElementById('addressInput').value = dataPoint.address;
      } else {
        document.getElementById('addressInput').value = '';
      }
    }
    
    // 更新功能码（现在是隐藏字段）
    updateFunctionCodeOptions();
    
    // 设置数据格式
    document.getElementById('formatSelect').value = dataPoint.format || 'UINT16';
    
    // 如果是位格式，显示位位置选择器并设置值
    handleFormatChange();
    if (dataPoint.format === 'BIT' && dataPoint.bitPosition !== undefined) {
      document.getElementById('bitPositionSelect').value = dataPoint.bitPosition;
    }
    
    document.getElementById('scaleInput').value = dataPoint.scale || 1;
    document.getElementById('unitInput').value = dataPoint.unit || '';
    document.getElementById('descriptionInput').value = dataPoint.description || '';
    
    // 设置告警参数
    const alarmEnabledCheck = document.getElementById('alarmEnabledCheck');
    if (alarmEnabledCheck) {
      alarmEnabledCheck.checked = !!dataPoint.alarmEnabled;
      
      // 如果启用告警，显示设置界面并填充数据
      if (dataPoint.alarmEnabled) {
        toggleAlarmSettings();
        
        setTimeout(() => {
          // 根据数据格式设置不同的告警内容
          if (dataPoint.format === 'BIT' || dataPoint.format === 'POINT') {
            const alarmTypeSelect = document.getElementById('alarmTypeSelect');
            const alarmContentInput = document.getElementById('alarmContentInput');
            const lowLevelAlarmCheck = document.getElementById('lowLevelAlarmCheck');
            
            if (alarmTypeSelect && dataPoint.alarmType) {
              alarmTypeSelect.value = dataPoint.alarmType;
            }
            
            if (alarmContentInput && dataPoint.alarmContent) {
              alarmContentInput.value = dataPoint.alarmContent;
            }
            
            // 设置低位报警复选框
            if (lowLevelAlarmCheck) {
              lowLevelAlarmCheck.checked = !!dataPoint.lowLevelAlarm;
            }
          } else {
            // 对于其他格式，设置通用告警内容
            const generalAlarmContentInput = document.getElementById('generalAlarmContentInput');
            if (generalAlarmContentInput && dataPoint.alarmContent) {
              generalAlarmContentInput.value = dataPoint.alarmContent;
            }
          }
        }, 100); // 短暂延迟确保toggleAlarmSettings已完成DOM更新
      }
    }
    
    // 如果是点位格式，设置点位解析配置
    if (dataPoint.format === 'POINT') {
      // 等待handleFormatChange完成后再设置值
      setTimeout(async () => {
        // 确保16位数据点已加载
        await loadAvailable16BitDataPoints();
        
        // 设置源数据点
        if (dataPoint.sourceDataPointIdentifier) {
          const sourceDataPointSelect = document.getElementById('sourceDataPointSelect');
          if (sourceDataPointSelect) {
            sourceDataPointSelect.value = dataPoint.sourceDataPointIdentifier;
          }
        }
        
        // 设置位位置
        if (dataPoint.pointBitPosition !== undefined) {
          const pointBitPositionSelect = document.getElementById('pointBitPositionSelect');
          if (pointBitPositionSelect) {
            pointBitPositionSelect.value = dataPoint.pointBitPosition;
          }
        }
        
        // 更新预览
        updatePointPreview();
      }, 100);
    }
    
    // 确保模态框正确显示
    const modalElement = document.getElementById('dataPointModal');
    if (modalElement) {
      // 先检查是否已有模态框实例
      let modalInstance = bootstrap.Modal.getInstance(modalElement);
      if (!modalInstance) {
        modalInstance = new bootstrap.Modal(modalElement);
      }
      
      // 显示模态框
      modalInstance.show();
    } else {
      console.error('找不到数据点模态框元素');
      showError('无法显示编辑界面');
    }
  } catch (error) {
    console.error('显示编辑数据点模态框时出错:', error);
    showError('显示编辑界面时出错: ' + error.message);
  }
}

// 显示写入值模态框
function showWriteValueModal(id) {
  // 查找数据点
  const dataPoint = currentDataPoints.find(dp => dp.id === id);
  if (!dataPoint) return;
  
  // 获取当前值
  const currentValueElement = document.getElementById(`value-${dataPoint.id}`);
  const currentValue = currentValueElement ? currentValueElement.innerText : '无数据';
  
  // 填充表单
  document.getElementById('writeDataPointId').value = dataPoint.id;
  document.getElementById('writeDataPointIdentifier').value = dataPoint.identifier;
  document.getElementById('dataPointNameText').value = dataPoint.name;
  document.getElementById('currentValueText').value = currentValue;
  
  // 安全地设置新值输入框
  const newValueInput = document.getElementById('newValueInput');
  if (newValueInput) {
    newValueInput.value = '';
  } else {
    console.error('找不到 newValueInput 元素');
  }
  
  // 根据数据格式更新帮助文本
  const valueFormatHelp = document.getElementById('valueFormatHelp');
  let helpText = '根据数据格式输入适当的值';
  
  switch (dataPoint.format) {
    case 'INT16':
      helpText = '输入范围: -32768 到 32767';
      break;
    case 'UINT16':
      helpText = '输入范围: 0 到 65535';
      break;
    case 'INT32':
      helpText = '输入范围: -2147483648 到 2147483647';
      break;
    case 'UINT32':
      helpText = '输入范围: 0 到 4294967295';
      break;
    case 'FLOAT32':
      helpText = '输入浮点数，例如: 12.34';
      break;
    case 'BIT':
      helpText = '输入0或1';
      break;
  }
  
  valueFormatHelp.innerText = helpText;
  
  // 显示模态框
  writeValueModal.show();
}

/**
 * 写入数据点值
 */
async function writeDataPointValue() {
  // 在函数开始处定义startTime，确保在所有作用域中都可用
  const startTime = Date.now();
  
  try {
    // 显示加载指示器
    showLoader();
    
    // 获取输入值
    const identifier = document.getElementById('writeDataPointIdentifier').value;
    const valueInput = document.getElementById('newValueInput');
    
    if (!valueInput) {
      showError('找不到值输入框');
      hideLoader();
      return;
    }
    
    const value = valueInput.value;
    
    if (!identifier) {
      showError('请选择要写入的数据点');
      hideLoader();
      return;
    }
    
    if (value === '') {
      showError('请输入要写入的值');
      hideLoader();
      return;
    }
    
    // 获取数据点信息
    const allDataPoints = window.dataPoints || currentDataPoints || [];
    const dataPoint = allDataPoints.find(dp => dp.identifier === identifier);
    if (!dataPoint) {
      showError(`找不到数据点: ${identifier}`);
      hideLoader();
      return;
    }
    
    console.log(`准备写入数据点 ${dataPoint.name}(${identifier}), 地址: ${dataPoint.address}, 格式: ${dataPoint.format}, 值: ${value}`);
    
    // 解析值
    let parsedValue;
    try {
      parsedValue = parseValue(value);
      
      // 对于BIT格式，确保值为0或1
      if (dataPoint.format === 'BIT') {
        parsedValue = parsedValue ? 1 : 0;
      }
    } catch (error) {
      showError(`输入值格式错误: ${error.message}`);
      hideLoader();
      return;
    }
    
    try {
      // 显示写入中状态
      const statusElement = document.getElementById('writeStatus');
      if (statusElement) {
        statusElement.innerHTML = '<span class="text-warning"><i class="bi bi-hourglass-split"></i> 正在写入...</span>';
        statusElement.classList.remove('d-none', 'alert-danger', 'alert-success');
        statusElement.classList.add('alert-info');
      }
      
      // 发送写入请求
      const requestData = {
        identifier: identifier,
        value: parsedValue
      };
      
      // 对于BIT格式，添加位位置信息
      if (dataPoint.format === 'BIT' && dataPoint.bitPosition !== undefined) {
        requestData.bitPosition = dataPoint.bitPosition;
      }
      
      console.log("发送写入请求数据:", JSON.stringify(requestData));
      const response = await axios.post('/api/modbus/write', requestData);
      
      // 计算响应时间
      const responseTime = Date.now() - startTime;
      
      if (response.data.success) {
        console.log(`写入成功 (${responseTime}ms):`, response.data);
        
        // 处理BIT格式的特殊响应
        if (dataPoint.format === 'BIT' && response.data.data && response.data.data.format === 'BIT') {
          console.log("收到BIT格式的响应:", response.data.data);
          
          // 立即更新本地显示的值，而不等待轮询
          if (!window.currentDataValues) {
            window.currentDataValues = {};
          }
          
          if (!window.currentDataValues[dataPoint.name]) {
            window.currentDataValues[dataPoint.name] = {};
          }
          
          // 使用响应中返回的位信息更新本地数据
          const bitData = response.data.data;
          window.currentDataValues[dataPoint.name] = {
            value: bitData.bitValue,
            formatted: bitData.bitValue.toString(),
            timestamp: new Date().toISOString(),
            binaryString: bitData.binaryString,
            bitPosition: bitData.bitPosition,
            bitValue: bitData.bitValue,
            registerValue: bitData.registerValue
          };
          
          // 立即更新UI
          updateDataValues(window.currentDataValues);
        }
        
        // 更新数据点显示值 - 立即强制加载一次
        await loadDataValues(true);
        
        // 延迟后再次加载，确保能获取到写入后的最新值（考虑网络和PLC内部处理延迟）
        setTimeout(async () => {
          console.log('写入后延迟加载数据点值');
          await loadDataValues(true);
        }, 1000);
        
        // 关闭模态框
        const modal = bootstrap.Modal.getInstance(document.getElementById('writeValueModal'));
        modal.hide();
        
        // 显示成功消息
        let successMsg = `成功写入数据点 "${dataPoint.name}" 值: ${parsedValue} (响应时间: ${responseTime}ms)`;
        
        // 对于BIT格式，显示更详细的信息
        if (dataPoint.format === 'BIT' && response.data.data && response.data.data.format === 'BIT') {
          const bitData = response.data.data;
          successMsg += `\n位位置: ${bitData.bitPosition}, 位值: ${bitData.bitValue}, 寄存器值: ${bitData.registerValue}`;
        }
        
        showSuccess(successMsg);
        
        // 更新状态显示
        const statusElement = document.getElementById('writeStatus');
        if (statusElement) {
          statusElement.innerHTML = `<span class="text-success"><i class="bi bi-check-circle"></i> 写入成功 (${responseTime}ms)</span>`;
          statusElement.classList.remove('alert-info', 'alert-danger');
          statusElement.classList.add('alert-success');
        }
        
        // 添加到写入历史记录
        addWriteHistory({
          dataPoint: dataPoint.name,
          identifier: identifier,
          value: parsedValue,
          timestamp: new Date().toISOString(),
          responseTime: responseTime,
          success: true
        });
        
      } else {
        // 写入失败
        const errorMessage = response.data.message || '写入失败';
        showError(`写入数据点 "${dataPoint.name}" 失败: ${errorMessage}`);
        
        // 更新状态显示
        const statusElement = document.getElementById('writeStatus');
        if (statusElement) {
          statusElement.innerHTML = `<span class="text-danger"><i class="bi bi-exclamation-triangle"></i> 写入失败: ${errorMessage}</span>`;
          statusElement.classList.remove('alert-info');
          statusElement.classList.add('alert-danger');
        }
        
        // 添加到写入历史记录 - 失败记录
        addWriteHistory({
          dataPoint: dataPoint.name,
          identifier: identifier,
          value: parsedValue,
          timestamp: new Date().toISOString(),
          responseTime: Date.now() - startTime,
          success: false,
          error: errorMessage
        });
      }
    } catch (error) {
      console.error('写入数据点值失败:', error);
      
      if (error.response && error.response.status === 503) {
        // 服务不可用，尝试重新连接
        showWarning('Modbus连接已断开，正在尝试重新连接...');
        
        // 尝试重新连接
        setTimeout(async () => {
          try {
            const response = await fetch('/api/modbus/connection', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              }
            });
            
            if (response.ok) {
              showSuccess('Modbus连接已恢复');
            }
          } catch (connectError) {
            console.error('连接请求失败:', connectError);
          }
        }, 1000);
        
        const errorMessage = '未连接到Modbus服务器，请先建立连接';
        showError(`写入数据点 "${dataPoint.name}" 失败: ${errorMessage}`);
        
        // 更新状态显示
        const statusElement = document.getElementById('writeStatus');
        if (statusElement) {
          statusElement.innerHTML = `<span class="text-danger"><i class="bi bi-exclamation-triangle"></i> 写入失败: ${errorMessage}</span>`;
          statusElement.classList.remove('alert-info');
          statusElement.classList.add('alert-danger');
        }
        
        // 添加到写入历史记录 - 失败记录
        addWriteHistory({
          dataPoint: dataPoint.name,
          identifier: identifier,
          value: parsedValue,
          timestamp: new Date().toISOString(),
          responseTime: Date.now() - startTime,
          success: false,
          error: errorMessage
        });
      } else {
        // 网络错误或其他错误
        const errorMessage = error.message || '连接服务器失败';
        showError(`写入数据点 "${dataPoint.name}" 失败: ${errorMessage}`);
        
        // 更新状态显示
        const statusElement = document.getElementById('writeStatus');
        if (statusElement) {
          statusElement.innerHTML = `<span class="text-danger"><i class="bi bi-exclamation-triangle"></i> 写入失败: ${errorMessage}</span>`;
          statusElement.classList.remove('alert-info');
          statusElement.classList.add('alert-danger');
        }
        
        // 添加到写入历史记录 - 失败记录
        addWriteHistory({
          dataPoint: dataPoint.name,
          identifier: identifier,
          value: parsedValue,
          timestamp: new Date().toISOString(),
          responseTime: Date.now() - startTime,
          success: false,
          error: errorMessage
        });
      }
    } finally {
      hideLoader();
    }
  } catch (error) {
    console.error('处理写入请求时出错:', error);
    showError('处理写入请求时出错: ' + error.message);
    hideLoader();
  }
}

// 解析值为适当的类型
function parseValue(value) {
  // 尝试解析为数字
  if (!isNaN(value)) {
    // 检查是否是浮点数
    if (value.toString().includes('.')) {
      return parseFloat(value);
    } else {
      return parseInt(value);
    }
  }
  return value;
}

// 保存数据点
async function saveDataPoint() {
  let modalInstance = null;
  
  try {
    // 先获取模态框实例，确保后续能正常关闭
    const modalElement = document.getElementById('dataPointModal');
    if (modalElement) {
      modalInstance = bootstrap.Modal.getInstance(modalElement);
      if (!modalInstance) {
        modalInstance = new bootstrap.Modal(modalElement);
      }
    }
    
  // 创建数据点对象
  const dataPoint = {
    name: document.getElementById('nameInput').value,
      identifier: document.getElementById('identifierInput').value.trim(),
      format: document.getElementById('formatSelect').value,
    scale: parseFloat(document.getElementById('scaleInput').value) || 1,
    unit: document.getElementById('unitInput').value,
    description: document.getElementById('descriptionInput').value
  };
    
    // 根据数据源类型添加特有字段
    if (currentDataSourceType === 'mqtt') {
      // MQTT特有字段
      let topic = document.getElementById('mqttTopicInput').value;
      // 如果主题为空，自动生成
      if (!topic) {
        topic = `data/modbus/${dataPoint.identifier}`;
      }
      dataPoint.topic = topic;
      dataPoint.dataSourceType = 'mqtt';
      
      // MQTT数据点默认为只读模式（通过主题订阅获取数据）
      dataPoint.accessMode = 'read';
    } else {
      // Modbus特有字段
      const accessMode = document.getElementById('accessModeSelect').value;
      let readFunctionCode = 3;  // 固定读功能码为3
      let writeFunctionCode = 6; // 固定写功能码为6
      
      const addressValue = document.getElementById('addressInput').value;
      if (addressValue && addressValue.trim() !== '') {
        dataPoint.address = parseInt(addressValue);
      }
      dataPoint.accessMode = accessMode;
      dataPoint.readFunctionCode = readFunctionCode;
      dataPoint.writeFunctionCode = writeFunctionCode;
      dataPoint.dataSourceType = 'modbus';
    }
  
  // 如果格式是BIT，获取位位置
    if (dataPoint.format === 'BIT') {
    dataPoint.bitPosition = parseInt(document.getElementById('bitPositionSelect').value);
  }
  
  // 如果格式是POINT，获取点位解析配置
  if (dataPoint.format === 'POINT') {
    const sourceDataPointSelect = document.getElementById('sourceDataPointSelect');
    const pointBitPositionSelect = document.getElementById('pointBitPositionSelect');
    
    if (!sourceDataPointSelect.value) {
      alert('请选择关联的16位数据点');
      return;
    }
    
    dataPoint.sourceDataPointIdentifier = sourceDataPointSelect.value;
    dataPoint.pointBitPosition = parseInt(pointBitPositionSelect.value);
    
    console.log('点位数据解析配置:', {
      sourceDataPointIdentifier: dataPoint.sourceDataPointIdentifier,
      pointBitPosition: dataPoint.pointBitPosition
    });
  }
  
  // 获取告警设置
  const alarmEnabledCheck = document.getElementById('alarmEnabledCheck');
  if (alarmEnabledCheck && alarmEnabledCheck.checked) {
    dataPoint.alarmEnabled = true;
    
    // 根据数据格式获取不同的告警内容
    if (dataPoint.format === 'BIT' || dataPoint.format === 'POINT') {
      // BIT格式和POINT格式都从告警类型和内容获取
      const alarmTypeSelect = document.getElementById('alarmTypeSelect');
      const alarmContentInput = document.getElementById('alarmContentInput');
      const lowLevelAlarmCheck = document.getElementById('lowLevelAlarmCheck');
      
      if (alarmTypeSelect && alarmContentInput) {
        dataPoint.alarmType = alarmTypeSelect.value;
        dataPoint.alarmContent = alarmContentInput.value;
      }
      
      // 保存低位报警设置
      if (lowLevelAlarmCheck) {
        dataPoint.lowLevelAlarm = lowLevelAlarmCheck.checked;
      }
    } else {
      // 其他格式从通用告警内容获取
      const generalAlarmContentInput = document.getElementById('generalAlarmContentInput');
      if (generalAlarmContentInput) {
        dataPoint.alarmContent = generalAlarmContentInput.value;
      }
    }
  } else {
    // 明确设置告警为禁用状态
    dataPoint.alarmEnabled = false;
  }
  
  // 验证必填字段
  if (!dataPoint.name) {
    alert('请输入数据点名称');
    return;
  }
  
  if (!dataPoint.identifier) {
    alert('请输入唯一标识符');
    return;
  }
  
  // 验证标识符格式（只允许字母、数字和下划线）
  if (!/^[a-zA-Z0-9_]+$/.test(dataPoint.identifier)) {
    alert('唯一标识符只能包含字母、数字和下划线');
    return;
  }
  
    // Modbus特有验证（地址改为可选）
    if (currentDataSourceType === 'modbus') {
      const addressValue = document.getElementById('addressInput').value;
      if (addressValue && addressValue.trim() !== '' && isNaN(parseInt(addressValue))) {
        alert('地址必须是有效的数字');
        return;
      }
    }
  
  // 验证告警内容
  if (dataPoint.alarmEnabled && !dataPoint.alarmContent) {
    alert('请输入告警内容');
    return;
  }
  
  console.log('保存数据点:', dataPoint);
  showLoader();
  
  try {
      // 获取编辑ID
      const id = document.getElementById('dataPointId').value;
      
      if (id) {
        // 更新数据点
        dataPoint.id = id;
      await axios.put(`${API_BASE_URL}/datapoints/${id}`, dataPoint);
    } else {
      // 添加数据点
      await axios.post(`${API_BASE_URL}/datapoints`, dataPoint);
    }
    
    // 重新加载数据点列表
    await loadDataPoints();
    
    // 如果是更新操作且禁用了告警，清理该数据点的活动告警
    if (id && dataPoint.alarmEnabled === false) {
      console.log(`数据点 ${dataPoint.name} 已禁用告警，清理相关的活动告警`);
      clearDataPointAlarm(dataPoint.identifier, dataPoint.name);
    }
    
    // 强制关闭模态框
    try {
      if (modalInstance) {
        modalInstance.hide();
      } else {
        // 备用关闭方法
        const modalElement = document.getElementById('dataPointModal');
        if (modalElement) {
          modalElement.style.display = 'none';
          modalElement.classList.remove('show');
          document.body.classList.remove('modal-open');
          
          // 移除backdrop
          const backdrop = document.querySelector('.modal-backdrop');
          if (backdrop) {
            backdrop.remove();
          }
        }
      }
    } catch (modalError) {
      console.error('关闭模态框时出错:', modalError);
      // 强制移除模态框相关样式
      const modalElement = document.getElementById('dataPointModal');
      if (modalElement) {
        modalElement.style.display = 'none';
        modalElement.classList.remove('show');
      }
      document.body.classList.remove('modal-open');
      const backdrop = document.querySelector('.modal-backdrop');
      if (backdrop) {
        backdrop.remove();
      }
    }
      
      // 显示成功消息
      showSuccess(`数据点 ${dataPoint.name} 已${id ? '更新' : '添加'}`);
  } catch (error) {
    console.error('保存数据点失败:', error);
    showError(error.response?.data?.error || '保存数据点失败');
  } finally {
      hideLoader();
    }
  } catch (e) {
    console.error('处理数据点表单时出错:', e);
    showError('处理数据点表单时出错: ' + e.message);
    hideLoader();
    
    // 确保在出错时也能关闭模态框
    try {
      if (modalInstance) {
        modalInstance.hide();
      }
    } catch (modalError) {
      console.error('出错时关闭模态框失败:', modalError);
    }
  }
}

// 确认删除数据点
function confirmDeleteDataPoint(id) {
  if (confirm('确定要删除此数据点吗？')) {
    deleteDataPoint(id);
  }
}

// 删除数据点
async function deleteDataPoint(id) {
  showLoader();
  
  try {
    // 获取要删除的数据点信息，用于后续清理告警
    const dataPoint = window.dataPoints.find(dp => dp.id === id);
    
    await axios.delete(`${API_BASE_URL}/datapoints/${id}`);
    
    // 如果删除成功且找到了数据点信息，立即清理相关告警
    if (dataPoint && typeof cleanDeletedDataPointAlarms === 'function') {
      console.log(`删除数据点 ${dataPoint.name}，立即清理相关告警`);
      cleanDeletedDataPointAlarms();
    }
    
    // 重新加载数据点列表
    await loadDataPoints();
    
    // 显示成功消息
    showSuccess(`数据点 ${dataPoint ? dataPoint.name : id} 已成功删除`);
  } catch (error) {
    console.error('删除数据点失败:', error);
    showError(error.response?.data?.error || '删除数据点失败');
  } finally {
    hideLoader();
  }
}

/**
 * 显示成功消息
 */
function showSuccess(message, duration = 3000) {
  // 创建一个成功消息元素
  const successDiv = document.createElement('div');
  successDiv.className = 'alert alert-success alert-dismissible fade show position-fixed';
  successDiv.style.cssText = 'top: 70px; right: 20px; z-index: 9999;';
  successDiv.innerHTML = message + 
    '<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="关闭"></button>';
  
  document.body.appendChild(successDiv);
  
  // 自动消失
  setTimeout(() => {
    const bsAlert = new bootstrap.Alert(successDiv);
    bsAlert.close();
  }, duration);
}

/**
 * 显示警告消息
 * @param {string} message 警告消息
 * @param {number} duration 显示持续时间（毫秒），0表示不自动隐藏
 */
function showWarning(message, duration = 5000) {
  // 先记录到控制台，确保警告信息不会丢失
  console.warn('警告:', message);
  
  // 安全地获取DOM元素
  const container = document.getElementById('warningContainer');
  const messageEl = document.getElementById('warningMessage');
  
  // 如果DOM元素不存在，仅记录到控制台后返回
  if (!container || !messageEl) {
    console.warn('无法显示警告消息：警告容器元素不存在');
    return;
  }
  
  // 确保清除任何先前的隐藏定时器
  if (window.warningTimeout) {
    clearTimeout(window.warningTimeout);
    window.warningTimeout = null;
  }
  
  // 设置消息和显示容器
  messageEl.innerHTML = message;
  container.style.display = 'block';
  
  // 添加进入动画
  container.classList.add('animate__animated', 'animate__fadeInDown');
  
  // 如果持续时间不为0，设置自动隐藏定时器
  if (duration > 0) {
    window.warningTimeout = setTimeout(() => {
      hideWarning();
    }, duration);
  }
}

/**
 * 隐藏警告消息
 */
function hideWarning() {
  const container = document.getElementById('warningContainer');
  
  // 如果DOM元素不存在，直接返回
  if (!container) {
    return;
  }
  
  // 如果警告容器正在显示，添加淡出动画
  if (container.style.display !== 'none') {
    container.classList.add('animate__fadeOutUp');
    
    // 动画结束后隐藏
    setTimeout(() => {
      container.style.display = 'none';
      container.classList.remove('animate__animated', 'animate__fadeInDown', 'animate__fadeOutUp');
    }, 500);
  }
  
  // 清除任何已有定时器
  if (window.warningTimeout) {
    clearTimeout(window.warningTimeout);
    window.warningTimeout = null;
  }
}

/**
 * 添加写入历史记录
 * @param {Object} entry 写入记录
 */
function addWriteHistory(entry) {
  // 添加到历史记录开头
  writeHistory.unshift(entry);
  
  // 限制历史记录长度
  if (writeHistory.length > MAX_HISTORY_LENGTH) {
    writeHistory.pop();
  }
  
  // 如果历史面板打开，更新显示
  if (document.getElementById('writeHistoryPanel') && 
      !document.getElementById('writeHistoryPanel').classList.contains('d-none')) {
    displayWriteHistory();
  }
  
  // 保存到localStorage
  localStorage.setItem('modbusWriteHistory', JSON.stringify(writeHistory));
}

/**
 * 加载写入历史记录
 */
function loadWriteHistory() {
  try {
    const savedHistory = localStorage.getItem('modbusWriteHistory');
    if (savedHistory) {
      writeHistory = JSON.parse(savedHistory);
    }
  } catch (error) {
    console.error('加载写入历史记录失败:', error);
    // 如果加载失败，初始化为空数组
    writeHistory = [];
  }
}

/**
 * 清除写入历史记录
 */
function clearWriteHistory() {
  writeHistory = [];
  localStorage.removeItem('modbusWriteHistory');
  
  // 更新显示
  displayWriteHistory();
}

/**
 * 显示写入历史记录
 */
function displayWriteHistory() {
  const historyContainer = document.getElementById('writeHistoryList');
  if (!historyContainer) return;
  
  // 清空现有内容
  historyContainer.innerHTML = '';
  
  if (writeHistory.length === 0) {
    historyContainer.innerHTML = '<div class="text-center text-muted py-3">暂无写入历史记录</div>';
    return;
  }
  
  // 构建历史记录列表
  writeHistory.forEach((entry, index) => {
    const itemElement = document.createElement('div');
    itemElement.className = `write-history-item p-2 ${index % 2 === 0 ? 'bg-light' : ''} ${entry.success ? '' : 'border-danger'}`;
    
    const timestamp = new Date(entry.timestamp);
    const formattedTime = `${formatDateTime(timestamp)}`;
    
    let statusHTML = '';
    if (entry.success) {
      statusHTML = `<span class="badge bg-success">成功</span>`;
      if (entry.responseTime) {
        statusHTML += ` <small>${entry.responseTime}ms</small>`;
      }
    } else {
      statusHTML = `<span class="badge bg-danger">失败</span>`;
    }
    
    itemElement.innerHTML = `
      <div class="d-flex justify-content-between align-items-center">
        <div><strong>${entry.dataPoint}</strong> (${entry.identifier})</div>
        <div>${statusHTML}</div>
      </div>
      <div class="d-flex justify-content-between small text-muted">
        <div>值: ${entry.value}</div>
        <div>${formattedTime}</div>
      </div>
      ${entry.error ? `<div class="text-danger small mt-1">${entry.error}</div>` : ''}
    `;
    
    historyContainer.appendChild(itemElement);
  });
}

/**
 * 切换写入历史面板显示
 */
function toggleWriteHistoryPanel() {
  const panel = document.getElementById('writeHistoryPanel');
  if (!panel) return;
  
  if (panel.classList.contains('d-none')) {
    panel.classList.remove('d-none');
    displayWriteHistory();
  } else {
    panel.classList.add('d-none');
  }
}

// 填充数据点选择下拉框
function populateDataPointSelect() {
  const select = document.getElementById('dataPointSelect');
  select.innerHTML = '<option value="">-- 选择数据点 --</option>';
  
  if (currentDataPoints && currentDataPoints.length > 0) {
    currentDataPoints.forEach(dp => {
      const option = document.createElement('option');
      option.value = dp.identifier;
      option.textContent = dp.name || dp.identifier;
      select.appendChild(option);
    });
  }
}

// 快速查看特定数据点的历史
function viewDataPointHistory(identifier) {
  // 切换到历史视图
  switchView('data-history');
  
  // 设置下拉框选中项
  const select = document.getElementById('dataPointSelect');
  select.value = identifier;
  
  // 设置默认时间范围（过去24小时）
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  
  document.getElementById('endTimeInput').value = formatDateTimeForInput(now);
  document.getElementById('startTimeInput').value = formatDateTimeForInput(yesterday);
  
  // 执行查询
  queryHistory();
}

// 格式化日期为datetime-local输入框格式
function formatDateTimeForInput(date) {
  return date.toISOString().slice(0, 16);
}

// 查询历史数据
async function queryHistory() {
  const dataPointId = document.getElementById('dataPointSelect').value;
  const startTime = document.getElementById('startTimeInput').value;
  const endTime = document.getElementById('endTimeInput').value;
  
  // 验证输入
  if (!dataPointId) {
    showWarning('请选择一个数据点');
    return;
  }
  
  if (!startTime || !endTime) {
    showWarning('请设置开始和结束时间');
    return;
  }
  
  try {
    // 显示加载状态
    document.getElementById('historyTableBody').innerHTML = '<tr><td colspan="6" class="text-center"><div class="spinner-border spinner-border-sm" role="status"></div> 正在加载...</td></tr>';
    document.getElementById('noHistoryData').style.display = 'none';
    
    // 发起请求 - 先尝试旧路径
    console.log('[调试] 开始查询历史数据...');
    let response = null;
    let error1 = null;
    let usedUrl = '';
    
    try {
      // 尝试旧的API路径
      console.log('[调试] 尝试请求URL: /api/modbus/values/history');
      usedUrl = '/api/modbus/values/history';
      response = await axios.get('/api/modbus/values/history', {
        params: {
          identifier: dataPointId,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
          limit: 1000
        }
      });
      console.log('[调试] 成功获取历史数据 - 路径1');
    } catch (err) {
      console.error('[调试] 路径1请求失败:', err);
      error1 = err;
      
      // 如果第一个路径失败，尝试新的路径格式
      try {
        console.log(`[调试] 尝试备用URL: /api/modbus/history/${dataPointId}`);
        usedUrl = `/api/modbus/history/${dataPointId}`;
        response = await axios.get(`/api/modbus/history/${dataPointId}`, {
          params: {
            startTime: new Date(startTime).toISOString(),
            endTime: new Date(endTime).toISOString(),
            limit: 1000
          }
        });
        console.log('[调试] 成功获取历史数据 - 路径2');
      } catch (err2) {
        console.error('[调试] 路径2请求也失败:', err2);
        // 如果两个路径都失败，抛出第一个错误
        throw error1;
      }
    }
    
    console.log(`[调试] 收到响应 (${usedUrl}):`, response);
    
    // 处理响应
    if (response.data && (response.data.length > 0 || (response.data.data && response.data.data.length > 0))) {
      const dataArray = response.data.data || response.data;
      renderHistoryTable(dataArray);
      document.getElementById('historyResultInfo').textContent = `共找到 ${dataArray.length} 条记录`;
      document.getElementById('noHistoryData').style.display = 'none';
    } else {
      document.getElementById('noHistoryData').style.display = 'block';
      document.getElementById('historyTableBody').innerHTML = '';
      document.getElementById('historyResultInfo').textContent = '未找到匹配的记录';
    }
  } catch (error) {
    console.error('查询历史数据失败:', error);
    console.error('[调试] 错误详情:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      responseData: error.response?.data,
      config: error.config
    });
    document.getElementById('historyTableBody').innerHTML = '';
    document.getElementById('noHistoryData').style.display = 'block';
    document.getElementById('noHistoryData').innerHTML = `<i class="bi bi-exclamation-triangle me-2"></i>查询失败: ${error.response?.data?.message || error.message}`;
    document.getElementById('historyResultInfo').textContent = '';
  }
}

// 渲染历史数据表格
function renderHistoryTable(historyData) {
  const tableBody = document.getElementById('historyTableBody');
  tableBody.innerHTML = '';
  
  historyData.forEach(item => {
    const row = document.createElement('tr');
    
    // 格式化时间戳
    const timestamp = new Date(item.timestamp);
    const formattedTime = timestamp.toLocaleString('zh-CN');
    
    // 确定质量标签的样式
    let qualityClass = 'bg-secondary';
    if (item.quality === 'GOOD') qualityClass = 'bg-success';
    else if (item.quality === 'BAD') qualityClass = 'bg-danger';
    else if (item.quality === 'UNCERTAIN') qualityClass = 'bg-warning';
    
    // 适配新旧数据格式
    const valueDisplay = item.value !== null && item.value !== undefined ? item.value : '无数据';
    const formattedValueDisplay = item.formatted_value || item.formattedValue || '无数据';
    const readTimeDisplay = item.read_time_ms !== undefined ? item.read_time_ms + 'ms' : 
                           (item.readTime !== undefined ? item.readTime + 'ms' : '无数据');
    const changeDescription = item.change_description || item.changeDescription || '无变化描述';
    
    row.innerHTML = `
      <td>${formattedTime}</td>
      <td>${changeDescription}</td>
      <td>${valueDisplay}</td>
      <td>${formattedValueDisplay}</td>
      <td><span class="badge ${qualityClass}">${item.quality || 'UNKNOWN'}</span></td>
      <td>${readTimeDisplay}</td>
    `;
    
    tableBody.appendChild(row);
  });
}

// 获取当前激活的视图ID
function getCurrentView() {
  const viewContainers = document.querySelectorAll('.view-container');
  for (const container of viewContainers) {
    if (container.classList.contains('active')) {
      return container.id;
    }
  }
  return null;
}

// 添加数据格式更改处理函数
function handleFormatChange() {
  const formatSelect = document.getElementById('formatSelect');
  const bitPositionDiv = document.getElementById('bitPositionDiv');
  const pointParsingDiv = document.getElementById('pointParsingDiv');
  const scaleDiv = document.getElementById('scaleInput').parentElement;
  const alarmEnabledCheck = document.getElementById('alarmEnabledCheck');
  
  // 根据所选格式显示或隐藏相应的设置区域
  if (formatSelect.value === 'BIT') {
    bitPositionDiv.style.display = 'block';
    pointParsingDiv.style.display = 'none';
    // 位值不需要缩放因子
    document.getElementById('scaleInput').value = '1';
    scaleDiv.style.display = 'none';
    
    // 更新告警设置区域
    if (alarmEnabledCheck && alarmEnabledCheck.checked) {
      toggleAlarmSettings();
    }
  } else if (formatSelect.value === 'POINT') {
    bitPositionDiv.style.display = 'none';
    pointParsingDiv.style.display = 'block';
    // 点位值不需要缩放因子
    document.getElementById('scaleInput').value = '1';
    scaleDiv.style.display = 'none';
    
    // 加载可用的16位数据点
    loadAvailable16BitDataPoints();
    
    // 设置点位解析的事件监听器
    setupPointParsingListeners();
    
    // 更新告警设置区域
    if (alarmEnabledCheck && alarmEnabledCheck.checked) {
      toggleAlarmSettings();
    }
  } else {
    bitPositionDiv.style.display = 'none';
    pointParsingDiv.style.display = 'none';
    scaleDiv.style.display = 'block';
    
    // 更新告警设置区域
    if (alarmEnabledCheck && alarmEnabledCheck.checked) {
      toggleAlarmSettings();
    }
  }
}

// 添加告警设置切换函数
function toggleAlarmSettings() {
  const alarmEnabledCheck = document.getElementById('alarmEnabledCheck');
  const alarmSettingsDiv = document.getElementById('alarmSettingsDiv');
  const bitAlarmSettings = document.getElementById('bitAlarmSettings');
  const formatSelect = document.getElementById('formatSelect');
  
  if (!alarmEnabledCheck || !alarmSettingsDiv) {
    console.warn('toggleAlarmSettings: 找不到必要的DOM元素');
    return;
  }
  
  // 根据复选框状态显示/隐藏告警设置
  if (alarmEnabledCheck.checked) {
    alarmSettingsDiv.style.display = 'block';
    
    // 根据数据格式决定显示哪种告警设置
    if (formatSelect && (formatSelect.value === 'BIT' || formatSelect.value === 'POINT')) {
      // BIT格式和POINT格式都使用分类和内容设置
      if (bitAlarmSettings) {
        bitAlarmSettings.style.display = 'block';
      }
      
      // 隐藏通用告警设置（如果存在）
      const generalAlarmDiv = document.getElementById('generalAlarmSettings');
      if (generalAlarmDiv) {
        generalAlarmDiv.style.display = 'none';
      }
      
      // 初始化告警内容
      updateAlarmContent();
    } else {
      // 其他格式隐藏告警类型选择
      if (bitAlarmSettings) {
        bitAlarmSettings.style.display = 'none';
      }
      
      // 非BIT/POINT格式时，在alarmSettingsDiv中添加告警内容输入框
      const generalAlarmDiv = document.getElementById('generalAlarmSettings');
      if (!generalAlarmDiv) {
        // 创建通用告警设置区域
        const div = document.createElement('div');
        div.id = 'generalAlarmSettings';
        div.innerHTML = `
          <div class="row">
            <div class="col-md-12">
              <div class="mb-3">
                <label for="generalAlarmContentInput" class="form-label">告警内容</label>
                <input type="text" class="form-control" id="generalAlarmContentInput" placeholder="输入告警触发时显示的内容">
              </div>
            </div>
          </div>
        `;
        alarmSettingsDiv.appendChild(div);
      } else {
        generalAlarmDiv.style.display = 'block';
      }
    }
  } else {
    // 不启用告警时，隐藏所有告警设置
    alarmSettingsDiv.style.display = 'none';
    
    // 隐藏对应的告警设置区域
    if (bitAlarmSettings) {
      bitAlarmSettings.style.display = 'none';
    }
    
    const generalAlarmDiv = document.getElementById('generalAlarmSettings');
    if (generalAlarmDiv) {
      generalAlarmDiv.style.display = 'none';
    }
  }
}

// 更新告警内容
function updateAlarmContent() {
  const alarmTypeSelect = document.getElementById('alarmTypeSelect');
  const alarmContentInput = document.getElementById('alarmContentInput');
  const nameInput = document.getElementById('nameInput');
  
  if (!alarmTypeSelect || !alarmContentInput) {
    return;
  }
  
  // 获取数据点名称
  const dataName = nameInput.value || '数据名';
  
  // 根据所选类型设置默认内容
  const alarmType = alarmTypeSelect.value;
  let defaultContent = '';
  
  switch (alarmType) {
    case '1':
      defaultContent = `"${dataName}"运行但是电流为零，可能故障原因是跳闸、变频器报错以及回路硬件故障，请现场查看`;
      break;
    case '2':
      defaultContent = `"${dataName}"热保护启动，可能故障原因是堵塞、设备电机故障，请现场查看`;
      break;
    case '3':
      defaultContent = `"${dataName}"运行方式异常，可能故障原因手动切换后未恢复自动运行，请现场查看`;
      break;
    case '4':
      defaultContent = `"${dataName}"水流异常，可能故障原因是水泵堵塞或者脱管导致未有出水，请现场查看`;
      break;
    case '5':
      defaultContent = `"${dataName}"切换至手动运行，请问是现场操作吗？需要进行计时提醒操作吗？`;
      break;
    default:
      defaultContent = `"${dataName}"发生未知告警，请检查`;
  }
  
  // 设置告警内容
  alarmContentInput.value = defaultContent;
}

// 添加CSS动画到head
const style = document.createElement('style');
style.innerHTML = `
@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.5; }
  100% { opacity: 1; }
}

.highlight-update {
  animation: highlight 1s ease-in-out;
}

@keyframes highlight {
  0% { background-color: transparent; }
  30% { background-color: rgba(255, 251, 0, 0.2); }
  70% { background-color: rgba(255, 251, 0, 0.2); }
  100% { background-color: transparent; }
}
`;
document.head.appendChild(style);

// 播放告警声音
function playAlarmSound(alarmMessages = []) {
  console.log('[告警调试] 播放告警声音，告警内容:', alarmMessages);
  
  try {
    // 检查是否有告警消息
    if (!alarmMessages || alarmMessages.length === 0) {
      console.log('[告警调试] 没有告警消息，不播放声音');
      return;
    }
    
    // 过滤出新的告警消息（不在当前活动告警列表中的）
    const newAlarms = alarmMessages.filter(msg => 
      !window.alarmPlayingState.activeAlarms.includes(msg) || 
      window.alarmPlayingState.activeAlarms.indexOf(msg) === alarmMessages.indexOf(msg)
    );
    
    console.log(`[告警调试] 过滤后新告警数量: ${newAlarms.length}, 原始数量: ${alarmMessages.length}`);
    
    // 如果没有新告警，只更新现有列表
    if (newAlarms.length === 0) {
      console.log('[告警调试] 没有新的告警消息，不播放声音');
      return;
    }
    
    // 如果已经有告警在播放，只更新活动告警列表并返回
    if (window.alarmPlayingState.isPlaying) {
      console.log('[告警调试] 已有告警在播放，更新活动告警列表');
      
      // 更新活动告警列表，避免重复
      alarmMessages.forEach(msg => {
        if (!window.alarmPlayingState.activeAlarms.includes(msg)) {
          window.alarmPlayingState.activeAlarms.push(msg);
        }
      });
      
      return;
    }
    
    // 设置为正在播放状态
    window.alarmPlayingState.isPlaying = true;
    
    // 合并新的告警到列表中，避免重复
    alarmMessages.forEach(msg => {
      if (!window.alarmPlayingState.activeAlarms.includes(msg)) {
        window.alarmPlayingState.activeAlarms.push(msg);
      }
    });
    
    window.alarmPlayingState.loopCounter = 0;
    
    // 开始播放告警序列
    playAlarmSequence();
    
    // 显示告警通知
    showAlarmNotifications(alarmMessages);
    
  } catch (error) {
    console.error('[告警调试] 播放告警声音失败:', error);
    // 即使播放声音失败，也要显示告警信息
    try {
      const alarmsText = alarmMessages.join(', ');
      showWarning(`<strong>告警触发!</strong> ${alarmsText} (音频播放失败)`, 8000);
    } catch (e) {
      console.error('[告警调试] 显示告警信息也失败了:', e);
    }
  }
}

// 播放告警序列
function playAlarmSequence() {
  if (window.alarmPlayingState.paused) {
    console.log('[告警调试] 告警已暂停，不播放');
    return;
  }
  
  if (window.alarmPlayingState.activeAlarms.length === 0) {
    console.log('[告警调试] 没有活动告警，停止播放');
    window.alarmPlayingState.isPlaying = false;
    window.alarmPlayingState.nextAlarmTime = null;
    updateAlarmStatusDisplay();
    return;
  }
  
  console.log('[告警调试] 开始告警播放序列，循环次数:', window.alarmPlayingState.loopCounter);
  
  const currentAlarms = [...window.alarmPlayingState.activeAlarms];
  
  // 更新告警状态
  window.alarmPlayingState.alarmCount++;
  window.alarmPlayingState.nextAlarmTime = new Date(Date.now() + 300000); // 5分钟后
  updateAlarmStatusDisplay();
  
  playAlertSound()
    .then(() => {
      const playQueue = [];
      currentAlarms.forEach(alarmText => {
        playQueue.push(() => playTextToSpeech(alarmText));
        playQueue.push(() => playTextToSpeech(alarmText));
      });
      return playQueueSequentially(playQueue);
    })
    .then(() => {
      window.alarmPlayingState.loopCounter++;
      window.alarmLoopTimer = setTimeout(() => {
        playAlarmSequence();
      }, 300000);
    })
    .catch(error => {
      console.error('[告警调试] 告警播放过程中出错:', error);
      window.alarmLoopTimer = setTimeout(() => {
        playAlarmSequence();
      }, 300000);
    });
}

// 播放告警提示音
function playAlertSound() {
  return new Promise((resolve, reject) => {
    try {
      console.log('[告警调试] 播放告警提示音 Broadcastalert.mp3');
      
      const audio = new Audio('/audio/Broadcastalert.mp3');
      audio.volume = 0.8;
      
      // 提示音播放完成后解析Promise
      audio.onended = () => {
        console.log('[告警调试] 提示音播放完成');
        resolve();
      };
      
      // 错误处理
      audio.onerror = (e) => {
        console.error('[告警调试] 提示音播放失败:', e);
        // 即使提示音失败，也继续流程
        resolve();
      };
      
      // 播放提示音
      const playPromise = audio.play();
      
      // 现代浏览器中play()返回Promise
      if (playPromise) {
        playPromise.catch(err => {
          console.warn('[告警调试] 提示音自动播放被阻止:', err);
          // 自动播放被阻止，也继续流程
          resolve();
        });
      }
    } catch (error) {
      console.error('[告警调试] 播放提示音时发生错误:', error);
      // 出错也继续流程
      resolve();
    }
  });
}

// 播放文字转语音
function playTextToSpeech(text) {
  return new Promise((resolve, reject) => {
    try {
      console.log(`[告警调试] 播放文字语音: "${text}"`);
      
      // 使用浏览器内置的语音合成API进行文字到语音的转换
      if ('speechSynthesis' in window) {
        // 创建语音合成实例
        const utterance = new SpeechSynthesisUtterance(text);
        
        // 设置语音属性
        utterance.lang = 'zh-CN'; // 设置语言为中文
        utterance.rate = 1.0;     // 语速
        utterance.pitch = 1.0;    // 音调
        utterance.volume = 0.8;   // 音量
        
        // 获取可用的语音
        const voices = window.speechSynthesis.getVoices();
        
        // 尝试找到中文女声
        const chineseVoice = voices.find(voice => 
          voice.lang.includes('zh') || 
          voice.name.includes('Chinese') || 
          voice.name.includes('中文')
        );
        
        // 如果找到了中文女声，则使用它
        if (chineseVoice) {
          utterance.voice = chineseVoice;
        }
        
        // 语音播放完成后解析Promise
        utterance.onend = () => {
          console.log(`[告警调试] 文字语音播放完成: "${text}"`);
          resolve();
        };
        
        // 错误处理
        utterance.onerror = (e) => {
          console.error(`[告警调试] 文字语音播放失败: "${text}"`, e);
          // 即使失败，也继续流程
          resolve();
        };
        
        // 播放语音
        window.speechSynthesis.speak(utterance);
      } else {
        // 浏览器不支持语音合成API，直接返回成功
        console.warn(`[告警调试] 浏览器不支持语音合成API`);
        setTimeout(() => {
          console.log(`[告警调试] 文字语音模拟播放完成: "${text}"`);
          resolve();
        }, 2000);
      }
    } catch (error) {
      console.error(`[告警调试] 播放文字语音时发生错误: "${text}"`, error);
      // 出错也继续流程
      resolve();
    }
  });
}

// 依次执行播放队列
function playQueueSequentially(playQueue) {
  return playQueue.reduce((promise, playFunc) => {
    return promise.then(() => {
      // 如果告警被暂停，中断队列
      if (window.alarmPlayingState.paused) {
        return Promise.reject('告警播放被用户暂停');
      }
      return playFunc();
    });
  }, Promise.resolve());
}

// 停止告警循环
function stopAlarmLoop() {
  console.log('[告警调试] 停止告警循环');
  
  if (window.alarmLoopTimer) {
    clearTimeout(window.alarmLoopTimer);
    window.alarmLoopTimer = null;
  }
  
  window.alarmPlayingState.isPlaying = false;
  window.alarmPlayingState.activeAlarms = [];
  window.alarmPlayingState.loopCounter = 0;
  window.alarmPlayingState.paused = false;
  window.alarmPlayingState.nextAlarmTime = null;
  window.alarmPlayingState.alarmFirstTriggerTime = {}; // 清除首次触发时间记录
  
  updateAlarmStatusDisplay();
  console.log('[告警调试] 告警循环已停止');
}

// 暂停/恢复告警循环
function toggleAlarmPause() {
  if (window.alarmPlayingState.paused) {
    // 恢复告警
    console.log('[告警调试] 恢复告警播放');
    window.alarmPlayingState.paused = false;
    
    // 如果有活动告警，重新开始播放
    if (window.alarmPlayingState.activeAlarms.length > 0) {
      window.alarmPlayingState.isPlaying = true;
      playAlarmSequence();
    }
  } else {
    // 暂停告警
    console.log('[告警调试] 暂停告警播放');
    window.alarmPlayingState.paused = true;
    
    // 清除定时器
    if (window.alarmLoopTimer) {
      clearTimeout(window.alarmLoopTimer);
      window.alarmLoopTimer = null;
    }
  }
}

// 显示告警通知（桌面通知和页面提示）
function showAlarmNotifications(alarmMessages) {
  // 在页面上显示告警提示
  const alarmsText = alarmMessages.join(', ');
  showWarning(`<strong>告警触发!</strong> ${alarmsText}`, 10000);
  
  // 显示桌面通知（如果支持）
  if (alarmMessages.length > 0 && typeof Notification !== 'undefined') {
    // 检查通知权限
    if (Notification.permission === 'granted') {
      console.log('[告警调试] 发送桌面通知');
      
      const message = alarmMessages.length === 1 
        ? alarmMessages[0] 
        : `有 ${alarmMessages.length} 个告警触发`;
      
      try {
        const notification = new Notification('Modbus告警', {
          body: message,
          icon: '/img/alert-icon.png',
          vibrate: [100, 50, 100]
        });
        
        // 10秒后关闭通知
        setTimeout(() => notification.close(), 10000);
      } catch (notifyError) {
        console.error('[告警调试] 创建通知失败:', notifyError);
      }
    } else if (Notification.permission !== 'denied') {
      // 请求通知权限
      console.log('[告警调试] 请求通知权限');
      Notification.requestPermission();
    }
  }
}

// 添加样式规则，用于高亮显示变化的数据
document.addEventListener('DOMContentLoaded', function() {
  // 添加样式规则
  const style = document.createElement('style');
  style.textContent = `
    .highlight-change {
      animation: highlight-fade 2s;
    }
    
    @keyframes highlight-fade {
      0% { background-color: rgba(76, 175, 80, 0.5); }
      100% { background-color: transparent; }
    }
    
    .value-cell {
      font-weight: bold;
    }
    
    .timestamp-cell {
      font-size: 0.85em;
      color: #666;
    }
  `;
  document.head.appendChild(style);
  
  // 初始化页面时加载数据点和连接状态
  loadConnectionStatus();
  loadDataPoints();
});

// 刷新数据点（一次性轮询）
async function refreshDataPoints() {
  try {
    showLoader();
    console.log('refreshDataPoints: 开始执行一次性轮询更新数据...');
    
    // 检查是否已连接
    if (!isConnected()) {
      console.log('refreshDataPoints: 未连接到Modbus服务器，无法执行轮询');
      showWarning('未连接到Modbus服务器，请先连接');
      hideLoader();
      return;
    }
    
    // 重新加载数据点列表
    await loadDataPoints();
    
    // 执行一次性轮询
    try {
      console.log('refreshDataPoints: 发送一次性轮询请求');
      const pollResponse = await fetch('/api/modbus/poll-once', {
        method: 'POST'
      });
      
      if (pollResponse.ok) {
        const pollResult = await pollResponse.json();
        console.log('一次性轮询成功，数据:', pollResult);
        
        // 加载并显示数据
        await loadDataValues(true);
        
        // 更新最后更新时间
        updateLastUpdateTime();
        
        showSuccess('已成功刷新数据');
      } else {
        console.warn('一次性轮询请求失败');
        showError('轮询请求失败: ' + (await pollResponse.text()));
      }
    } catch (pollError) {
      console.error('执行一次性轮询时出错:', pollError);
      showError('轮询出错: ' + pollError.message);
    }
  } catch (error) {
    console.error('刷新数据失败:', error);
    showError(error.message);
  } finally {
    hideLoader();
  }
}

// 添加告警控制相关API路由
document.addEventListener('DOMContentLoaded', function() {
  // 添加告警控制按钮到导航栏
  const navbarNav = document.querySelector('.navbar-nav');
  if (navbarNav) {
    const alarmControlBtn = document.createElement('li');
    alarmControlBtn.className = 'nav-item';
    alarmControlBtn.innerHTML = `
      <a class="nav-link" href="#" id="stopAlarmBtn">
        <i class="bi bi-volume-mute"></i> 停止告警
      </a>
    `;
    navbarNav.appendChild(alarmControlBtn);
    
    // 添加事件监听器
    document.getElementById('stopAlarmBtn').addEventListener('click', function(e) {
      e.preventDefault();
      stopAlarmLoop();
      showSuccess('已停止所有告警循环');
    });
  }
});

// 添加API路由处理函数
async function handleAPIRequest(url, method = 'GET', data = null) {
  try {
    const options = {
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    if (data && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(data);
    }
    
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('API请求出错:', error);
    throw error;
  }
}

// 后端API路由
// 用于处理告警控制的API路由
if (typeof window.apiRoutes === 'undefined') {
  window.apiRoutes = {
    // 停止所有告警
    stopAlarms: '/api/modbus/alarms/stop',
    // 暂停/恢复告警
    toggleAlarmPause: '/api/modbus/alarms/toggle-pause'
  };
  
  // 注册路由处理器
  const originalFetch = window.fetch;
  window.fetch = async function(url, options = {}) {
    // 如果是告警控制API
    if (url === window.apiRoutes.stopAlarms) {
      console.log('[API] 接收到停止告警请求');
      stopAlarmLoop();
      return new Response(JSON.stringify({
        success: true,
        message: '已停止所有告警循环'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } else if (url === window.apiRoutes.toggleAlarmPause) {
      console.log('[API] 接收到切换告警暂停状态请求');
      toggleAlarmPause();
      return new Response(JSON.stringify({
        success: true,
        message: window.alarmPlayingState.paused ? '已暂停告警' : '已恢复告警',
        status: window.alarmPlayingState.paused ? 'paused' : 'playing'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 调用原始的fetch
    return originalFetch.apply(this, arguments);
  };
}

// 更新告警状态显示
function updateAlarmStatusDisplay() {
  const alarmsList = document.getElementById('alarmsList');
  const noAlarms = document.getElementById('noAlarms');
  
  if (!alarmsList || !noAlarms) return;
  
  if (window.alarmPlayingState.activeAlarms.length > 0) {
    // 去重处理告警列表，确保相同内容不重复显示
    const uniqueAlarms = [...new Set(window.alarmPlayingState.activeAlarms)];
    
    console.log(`[告警调试] 更新告警状态显示: 原始告警数量=${window.alarmPlayingState.activeAlarms.length}, 去重后=${uniqueAlarms.length}`);
    
    alarmsList.innerHTML = `
      <table class="table table-hover">
        <thead>
          <tr>
            <th>告警内容</th>
            <th>首次触发时间</th>
            <th>告警次数</th>
            <th>下次告警</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          ${uniqueAlarms.map(alarm => `
            <tr>
              <td>${alarm}</td>
              <td>${formatAlarmDateTime(window.alarmPlayingState.alarmFirstTriggerTime[alarm])}</td>
              <td>${window.alarmPlayingState.alarmCount}</td>
              <td>${window.alarmPlayingState.nextAlarmTime ? 
                formatTimeRemaining(window.alarmPlayingState.nextAlarmTime) : 
                '已停止'}</td>
              <td>
                <span class="badge bg-danger">
                  ${window.alarmPlayingState.paused ? '已暂停' : '告警中'}
                </span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    noAlarms.style.display = 'none';
  } else {
    alarmsList.innerHTML = '';
    noAlarms.style.display = 'block';
  }
}

// 格式化剩余时间
function formatTimeRemaining(nextTime) {
  const now = new Date();
  const diff = nextTime - now;
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return `${minutes}分${seconds}秒`;
}

// 添加值变化停止告警的函数
function stopAlarmOnValueChange(identifier, newValue) {
  const lastState = window.alarmPlayingState.lastAlarmStates[identifier];
  if (lastState && lastState.triggered && Number(newValue) === 0) {
    console.log(`[告警调试] 数据点 ${identifier} 值变为0，停止相关告警`);
    
    // 查找与此数据点相关的告警
    const dataPoint = window.dataPoints.find(dp => dp.identifier === identifier);
    if (dataPoint) {
      const alarmContent = dataPoint.alarmContent || `${dataPoint.name} 告警`;
      
      // 从活动告警列表中移除
      const index = window.alarmPlayingState.activeAlarms.findIndex(alarm => 
        alarm === alarmContent || alarm.includes(identifier));
      
      if (index !== -1) {
        // 移除告警
        window.alarmPlayingState.activeAlarms.splice(index, 1);
        console.log(`[告警调试] 已从活动告警列表中移除 ${alarmContent}`);
        
        // 更新UI
        updateAlarmStatusDisplay();
      }
    }
  }
}

// 清理特定数据点的告警
function clearDataPointAlarm(identifier, dataPointName) {
  console.log(`[告警调试] 清理数据点告警: ${identifier || dataPointName}`);
  
  if (!window.alarmPlayingState || !window.alarmPlayingState.activeAlarms) {
    console.log(`[告警调试] 告警状态对象不存在或无活动告警`);
    return;
  }
  
  let removedCount = 0;
  const originalLength = window.alarmPlayingState.activeAlarms.length;
  
  // 过滤掉与该数据点相关的告警
  window.alarmPlayingState.activeAlarms = window.alarmPlayingState.activeAlarms.filter(alarm => {
    const isRelated = identifier && alarm.includes(identifier) || 
                     dataPointName && alarm.includes(dataPointName);
    
    if (isRelated) {
      removedCount++;
      console.log(`[告警调试] 移除数据点告警: ${alarm}`);
      
      // 清除相关的时间记录
      if (window.alarmPlayingState.alarmFirstTriggerTime && 
          window.alarmPlayingState.alarmFirstTriggerTime[alarm]) {
        delete window.alarmPlayingState.alarmFirstTriggerTime[alarm];
      }
    }
    
    return !isRelated;
  });
  
  // 清理lastAlarmStates中该数据点的状态
  if (identifier && window.alarmPlayingState.lastAlarmStates[identifier]) {
    delete window.alarmPlayingState.lastAlarmStates[identifier];
    console.log(`[告警调试] 已清理数据点告警状态: ${identifier}`);
  }
  
  if (removedCount > 0) {
    console.log(`[告警调试] 已移除 ${removedCount} 个数据点告警`);
    
    // 如果告警列表为空，停止告警循环
    if (window.alarmPlayingState.activeAlarms.length === 0 && window.alarmPlayingState.isPlaying) {
      console.log('[告警调试] 所有告警已清理，停止告警循环');
      stopAlarmLoop();
    }
    
    // 更新告警显示
    updateAlarmStatusDisplay();
  } else {
    console.log(`[告警调试] 未找到相关的活动告警需要清理`);
  }
}

// 初始化告警状态更新定时器
function initAlarmStatusUpdater() {
  // 使用定时器管理器设置告警状态更新定时器
  window.TimerManager.setTimer('alarmStatusUpdater', () => {
    updateAlarmStatusDisplay();
  }, 1000);
  
  // 使用定时器管理器设置告警清理定时器
  window.TimerManager.setTimer('alarmCleaner', () => {
    cleanDeletedDataPointAlarms();
  }, 30000);
}

// 添加全局事件监听器，用于在chat.html中接收告警状态
window.addEventListener('storage', function(e) {
  if (e.key === 'alarmState') {
    try {
      const alarmState = JSON.parse(e.newValue);
      if (alarmState && alarmState.activeAlarms && alarmState.activeAlarms.length > 0) {
        // 在chat.html中显示告警信息
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
          const alarmMessage = document.createElement('div');
          alarmMessage.className = 'message message-alarm';
          alarmMessage.innerHTML = `
            <div class="alarm-notification">
              <i class="bi bi-exclamation-triangle-fill"></i>
              <strong>系统告警：</strong>
              ${alarmState.activeAlarms.join(', ')}
            </div>
          `;
          chatMessages.appendChild(alarmMessage);
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }
      }
    } catch (error) {
      console.error('解析告警状态失败:', error);
    }
  }
});

// 添加一个用于安全显示告警时间的辅助函数
function formatAlarmDateTime(dateStr) {
  try {
    if (!dateStr) return '未知时间';
    
    // 尝试使用Date对象解析时间
    const date = new Date(dateStr);
    
    // 检查是否是有效日期
    if (!isNaN(date.getTime())) {
      return date.toLocaleString();
    }
    
    // 如果直接用Date解析无效，尝试手动解析ISO格式
    if (typeof dateStr === 'string' && dateStr.includes('T')) {
      const parts = dateStr.split('T');
      const datePart = parts[0];
      const timePart = parts[1].split('.')[0]; // 移除毫秒部分
      return `${datePart} ${timePart}`;
    }
    
    // 如果所有方法都失败，直接返回原始字符串
    return dateStr;
  } catch (e) {
    console.error('[告警调试] 格式化时间失败:', e, '原始值:', dateStr);
    return dateStr || '无效日期';
  }
}

// 清理已删除数据点的告警
function cleanDeletedDataPointAlarms() {
  if (!window.alarmPlayingState || !window.alarmPlayingState.activeAlarms) return;
  
  console.log('[告警调试] 开始清理已删除数据点的告警');
  
  // 获取当前所有数据点的标识符和名称
  const validIdentifiers = window.dataPoints.map(dp => dp.identifier);
  const validNames = window.dataPoints.map(dp => dp.name);
  
  // 过滤活动告警列表，移除与已删除数据点相关的告警
  const originalLength = window.alarmPlayingState.activeAlarms.length;
  const filteredAlarms = window.alarmPlayingState.activeAlarms.filter(alarm => {
    // 检查告警内容是否与任何现有数据点相关
    const isValid = window.dataPoints.some(dp => {
      return (
        alarm === dp.alarmContent || 
        alarm.includes(dp.name) || 
        (dp.identifier && alarm.includes(dp.identifier))
      );
    });
    
    // 如果告警无效，清除相关的时间记录
    if (!isValid && window.alarmPlayingState.alarmFirstTriggerTime[alarm]) {
      console.log(`[告警调试] 移除已删除数据点的告警: ${alarm}`);
      delete window.alarmPlayingState.alarmFirstTriggerTime[alarm];
    }
    
    return isValid;
  });
  
  // 更新活动告警列表
  window.alarmPlayingState.activeAlarms = filteredAlarms;
  
  // 清理lastAlarmStates中已删除数据点的状态
  for (const identifier in window.alarmPlayingState.lastAlarmStates) {
    if (!validIdentifiers.includes(identifier) && !validNames.includes(identifier)) {
      console.log(`[告警调试] 移除已删除数据点的告警状态: ${identifier}`);
      delete window.alarmPlayingState.lastAlarmStates[identifier];
    }
  }
  
  // 如果有告警被移除，更新告警显示
  if (originalLength !== filteredAlarms.length) {
    console.log(`[告警调试] 已移除 ${originalLength - filteredAlarms.length} 个已删除数据点的告警`);
    
    // 如果告警列表为空，停止告警播放
    if (filteredAlarms.length === 0 && window.alarmPlayingState.isPlaying) {
      window.alarmPlayingState.isPlaying = false;
      console.log('[告警调试] 告警列表为空，停止告警播放');
      
      // 如果有告警停止函数，调用它
      if (typeof stopAlarmLoop === 'function') {
        stopAlarmLoop();
      }
    }
    
    // 更新告警显示
    updateAlarmStatusDisplay();
  }
  
  console.log('[告警调试] 清理已删除数据点的告警完成');
}

// 向后端发送告警清除信息
function sendAlarmClearToBackend(identifier, content, clearedTime, retryCount = 0) {
  try {
    console.log(`[告警调试] 开始向后端发送告警清除: ${identifier}, ${content}`);
    console.log(`[告警调试] - 清除时间: ${clearedTime}`);
    console.log(`[告警调试] - 重试次数: ${retryCount}`);
    
    // 最大重试次数
    const maxRetries = 2;
    
    // 使用fetch API向后端发送告警清除信息
    fetch('/api/modbus/alarms/clear', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        identifier: identifier,
        content: content,
        clearedTime: clearedTime
      })
    })
    .then(response => {
      console.log(`[告警调试] 告警清除请求状态: ${response.status} ${response.statusText}`);
      
      // 如果响应不成功，且未超过最大重试次数，则重试
      if (!response.ok) {
        if (retryCount < maxRetries) {
          console.log(`[告警调试] 发送告警清除失败，将在2秒后重试，当前重试次数: ${retryCount}`);
          // 延迟2秒后重试
          setTimeout(() => {
            sendAlarmClearToBackend(identifier, content, clearedTime, retryCount + 1);
          }, 2000);
          return { error: '响应不成功，将重试' };
        } else {
          console.error(`[告警调试] 发送告警清除失败，已达到最大重试次数: ${maxRetries}`);
          return { error: '达到最大重试次数' };
        }
      }
      
      return response.json();
    })
    .then(data => {
      // 如果包含错误信息，说明是重试逻辑返回的对象，不继续处理
      if (data && data.error) {
        console.log(`[告警调试] 等待重试: ${data.error}`);
        return;
      }
      
      console.log('[告警调试] 告警清除已发送到后端，响应:', data);
    })
    .catch(error => {
      console.error('[告警调试] 向后端发送告警清除失败:', error);
      
      // 如果发生错误且未超过最大重试次数，则重试
      if (retryCount < maxRetries) {
        console.log(`[告警调试] 发送告警清除出错，将在3秒后重试，当前重试次数: ${retryCount}`);
        // 延迟3秒后重试
        setTimeout(() => {
          sendAlarmClearToBackend(identifier, content, clearedTime, retryCount + 1);
        }, 3000);
      } else {
        console.error(`[告警调试] 发送告警清除最终失败，已达到最大重试次数: ${maxRetries}`);
      }
    });
  } catch (error) {
    console.error('[告警调试] 准备告警清除数据时出错:', error);
  }
}

// 日报管理相关功能
// ===========================================

// 存储日报查询状态
window.reportState = {
  currentPage: 0,
  pageSize: 10,
  totalRecords: 0,
  currentData: [],
  queryParams: {}
};

// 初始化日报功能
function initReportFeatures() {
  console.log('初始化日报功能');
  
  // 设置默认日期范围（过去30天）
  const now = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(now.getDate() - 30);
  
  document.getElementById('reportEndDateInput').value = formatDateForInput(now);
  document.getElementById('reportStartDateInput').value = formatDateForInput(thirtyDaysAgo);
  
  // 为生成日报按钮添加事件
  const generateReportBtn = document.getElementById('generateReportBtn');
  if (generateReportBtn) {
    generateReportBtn.addEventListener('click', showGenerateReportModal);
  }
  
  // 为查询按钮添加事件
  const queryReportsBtn = document.getElementById('queryReportsBtn');
  if (queryReportsBtn) {
    queryReportsBtn.addEventListener('click', queryReports);
  }
  
  // 为确认生成按钮添加事件
  const confirmGenerateReportBtn = document.getElementById('confirmGenerateReportBtn');
  if (confirmGenerateReportBtn) {
    confirmGenerateReportBtn.addEventListener('click', generateReport);
  }
  
  // 为分页按钮添加事件
  const prevBtn = document.getElementById('reportPrevBtn');
  const nextBtn = document.getElementById('reportNextBtn');
  
  if (prevBtn) {
    prevBtn.addEventListener('click', prevReportPage);
  }
  
  if (nextBtn) {
    nextBtn.addEventListener('click', nextReportPage);
  }
  
  // 为原始数据查看按钮添加事件
  const viewRawDataBtn = document.getElementById('viewRawDataBtn');
  if (viewRawDataBtn) {
    viewRawDataBtn.addEventListener('click', toggleRawDataView);
  }
  
  // 添加导航事件监听器
  const reportsNavLink = document.querySelector('.sidebar-nav-link[data-view="daily-reports"]');
  if (reportsNavLink) {
    reportsNavLink.addEventListener('click', function() {
      console.log('日报页面被打开');
      // 打开日报页面时，自动查询数据
      setTimeout(() => {
        queryReports();
      }, 100);
    });
  }
  
  // 初始化日报日期选择为昨天
  const reportDateInput = document.getElementById('reportDateInput');
  if (reportDateInput) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    reportDateInput.value = formatDateForInput(yesterday);
  }
}

// 为日期格式化函数
function formatDateForInput(date) {
  return date.toISOString().split('T')[0];
}

// 显示生成日报模态框
function showGenerateReportModal() {
  const modal = new bootstrap.Modal(document.getElementById('generateReportModal'));
  modal.show();
}

// 查询日报列表
async function queryReports() {
  showLoader();
  
  try {
    // 重置页码
    window.reportState.currentPage = 0;
    
    // 获取查询参数
    const startDate = document.getElementById('reportStartDateInput').value;
    const endDate = document.getElementById('reportEndDateInput').value;
    const type = document.getElementById('reportTypeSelect').value;
    
    // 保存查询参数
    window.reportState.queryParams = { startDate, endDate, type };
    
    // 加载数据
    await loadReportData();
  } catch (error) {
    console.error('查询日报失败:', error);
    showError('查询日报失败: ' + error.message);
  } finally {
    hideLoader();
  }
}

// 加载日报数据
async function loadReportData() {
  showLoader();
  
  try {
    const params = window.reportState.queryParams || {};
    const page = window.reportState.currentPage || 0;
    const pageSize = window.reportState.pageSize || 10;
    
    // 构建查询参数
    const queryParams = new URLSearchParams();
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    if (params.type) queryParams.append('type', params.type);
    
    // 添加分页参数
    queryParams.append('limit', pageSize);
    queryParams.append('offset', page * pageSize);
    
    // 输出请求URL用于调试
    const requestUrl = `/api/modbus/reports?${queryParams.toString()}`;
    console.log('日报查询URL:', requestUrl);
    
    // 发送请求
    const response = await fetch(requestUrl);
    
    if (!response.ok) {
      throw new Error(`查询失败: ${response.status} ${response.statusText}`);
    }
    
    // 解析响应数据
    const data = await response.json();
    console.log('日报查询响应:', data);
    
    if (data.success) {
      // 保存数据和分页信息
      window.reportState.currentData = data.reports || [];
      window.reportState.totalRecords = data.total || 0;
      
      // 渲染数据
      renderReportTable(data.reports);
      updateReportPagination();
      
      // 更新结果信息
      document.getElementById('reportResultInfo').textContent = `共 ${data.total} 条记录`;
    } else {
      throw new Error(data.error || '查询失败');
    }
  } catch (error) {
    console.error('加载日报数据失败:', error);
    showError('加载日报数据失败: ' + error.message);
    
    // 清空表格
    document.getElementById('reportsTableBody').innerHTML = '';
    document.getElementById('noReports').classList.remove('d-none');
  } finally {
    hideLoader();
  }
}

// 渲染日报表格
function renderReportTable(reports) {
  const tableBody = document.getElementById('reportsTableBody');
  const noReports = document.getElementById('noReports');
  
  tableBody.innerHTML = '';
  
  if (!reports || reports.length === 0) {
    noReports.classList.remove('d-none');
    return;
  }
  
  noReports.classList.add('d-none');
  
  reports.forEach(report => {
    const row = document.createElement('tr');
    
    // 格式化日期
    const reportDate = new Date(report.report_date);
    const formattedDate = formatDateForInput(reportDate);
    
    // 格式化创建时间 - 优先使用generated_at字段，如果不存在则使用created_at
    let createdAt = null;
    if (report.generated_at) {
      createdAt = new Date(report.generated_at);
    } else if (report.created_at) {
      createdAt = new Date(report.created_at);
    } else {
      createdAt = new Date(); // 兜底方案
    }
    const formattedCreatedAt = formatDateTime(createdAt);
    
    // 确定报告类型
    let typeText = '未知';
    let typeClass = 'secondary';
    
    if (report.report_type === 'daily') {
      typeText = '日报';
      typeClass = 'primary';
    } else if (report.report_type === 'weekly') {
      typeText = '周报';
      typeClass = 'success';
    } else if (report.report_type === 'monthly') {
      typeText = '月报';
      typeClass = 'info';
    }
    
    // 获取报告内容预览（截取前80个字符）
    let contentPreview = report.report_content || '';
    if (contentPreview.length > 80) {
      contentPreview = contentPreview.substring(0, 80) + '...';
    }
    
    // 创建单元格
    row.innerHTML = `
      <td>${report.id}</td>
      <td>${formattedDate}</td>
      <td><span class="badge bg-${typeClass}">${typeText}</span></td>
      <td style="max-width: 280px; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(contentPreview)}</td>
      <td>${formattedCreatedAt}</td>
      <td style="min-width: 250px;">
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-primary flex-grow-1" onclick="viewReport(${report.id})">
            <i class="bi bi-eye"></i> 查看
          </button>
          <button class="btn btn-sm btn-outline-success flex-grow-1" onclick="uploadReportToKnowledge(${report.id})">
            <i class="bi bi-cloud-upload"></i> 上传
          </button>
          <button class="btn btn-sm btn-outline-danger" onclick="directDeleteReport(${report.id})">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </td>
    `;
    
    tableBody.appendChild(row);
  });
}

// 更新分页信息
function updateReportPagination() {
  const { currentPage, pageSize, totalRecords } = window.reportState;
  
  // 计算显示的记录范围
  const start = totalRecords > 0 ? (currentPage * pageSize) + 1 : 0;
  const end = Math.min((currentPage + 1) * pageSize, totalRecords);
  
  // 更新显示
  document.getElementById('reportStart').textContent = start;
  document.getElementById('reportEnd').textContent = end;
  document.getElementById('reportTotal').textContent = totalRecords;
  
  // 更新按钮状态
  document.getElementById('reportPrevBtn').disabled = currentPage === 0;
  document.getElementById('reportNextBtn').disabled = end >= totalRecords;
}

// 上一页
function prevReportPage() {
  if (window.reportState.currentPage > 0) {
    window.reportState.currentPage--;
    loadReportData();
  }
}

// 下一页
function nextReportPage() {
  const { currentPage, pageSize, totalRecords } = window.reportState;
  const totalPages = Math.ceil(totalRecords / pageSize);
  
  if (currentPage < totalPages - 1) {
    window.reportState.currentPage++;
    loadReportData();
  }
}

// 查看日报详情
let currentReportId = null;

async function viewReport(reportId) {
  showLoader();
  
  try {
    // 保存当前日报ID
    currentReportId = reportId;
    
    // 发送请求获取日报详情
    const response = await fetch(`/api/modbus/reports/${reportId}`);
    
    if (!response.ok) {
      throw new Error(`获取日报失败: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('日报详情:', data);
    
    if (!data.success) {
      throw new Error(data.error || '获取日报详情失败');
    }
    
    const report = data.report;
    
    // 在模态框中显示日报内容
    const reportTitle = document.getElementById('reportTitle');
    const reportContent = document.getElementById('reportContent');
    const reportDateBadge = document.getElementById('reportDateBadge');
    const reportTypeBadge = document.getElementById('reportTypeBadge');
    const reportIdBadge = document.getElementById('reportIdBadge');
    
    // 保存原始数据到模态框上
    const modal = document.getElementById('viewReportModal');
    modal.dataset.rawContent = report.original_json || '{}';
    
    // 设置标题和徽章
    const reportDate = new Date(report.report_date);
    reportDateBadge.textContent = formatDateForInput(reportDate);
    reportIdBadge.textContent = `ID: ${report.id}`;
    
    // 设置创建时间
    let createTimeText = '';
    // 优先使用generated_at字段，如果不存在则使用created_at
    if (report.generated_at) {
      createTimeText = ` (生成于: ${formatDateTime(report.generated_at)})`;
    } else if (report.created_at) {
      createTimeText = ` (创建于: ${formatDateTime(report.created_at)})`;
    }
    
    // 设置类型徽章
    let typeText = '未知';
    let typeBadgeClass = 'bg-secondary';
    
    if (report.report_type === 'daily') {
      typeText = '日报';
      typeBadgeClass = 'bg-primary';
    } else if (report.report_type === 'weekly') {
      typeText = '周报';
      typeBadgeClass = 'bg-success';
    } else if (report.report_type === 'monthly') {
      typeText = '月报';
      typeBadgeClass = 'bg-info';
    }
    
    reportTypeBadge.textContent = typeText;
    reportTypeBadge.className = `badge ${typeBadgeClass}`;
    
    // 设置标题
    reportTitle.textContent = `${typeText}详情${createTimeText}`;
    
    // 将Markdown内容转换为HTML
    const htmlContent = convertMarkdownToHtml(report.report_content || '');
    reportContent.innerHTML = htmlContent;
    
    // 高亮代码块
    document.querySelectorAll('pre code').forEach((block) => {
      try {
        if (window.hljs) {
          hljs.highlightElement(block);
        }
      } catch (e) {
        console.warn('代码高亮失败:', e);
      }
    });
    
    // 查找并设置删除按钮的当前日报ID
    const deleteBtn = document.getElementById('deleteReportBtn');
    if (deleteBtn) {
      deleteBtn.dataset.reportId = report.id;
    }
    
    // 查找并设置上传知识库按钮的当前日报ID
    const uploadBtn = document.getElementById('uploadToKnowledgeBtn');
    if (uploadBtn) {
      uploadBtn.dataset.reportId = report.id;
      
      // 添加点击事件处理
      uploadBtn.onclick = function() {
        uploadReportToKnowledge(report.id);
      };
    }
    
    // 显示模态框
    const viewReportModal = new bootstrap.Modal(document.getElementById('viewReportModal'));
    viewReportModal.show();
  } catch (error) {
    console.error('查看日报失败:', error);
    showError('查看日报失败: ' + error.message);
  } finally {
    hideLoader();
  }
}

// 切换原始数据视图
function toggleRawDataView() {
  const reportContent = document.getElementById('reportContent');
  const viewRawDataBtn = document.getElementById('viewRawDataBtn');
  const modal = document.getElementById('viewReportModal');
  
  // 检查是否在原始数据视图
  const isRawView = viewRawDataBtn.querySelector('i').classList.contains('bi-file-text');
  
  if (isRawView) {
    // 切换回报告视图
    viewReport(currentReportId);
    viewRawDataBtn.innerHTML = '<i class="bi bi-code"></i> 查看原始数据';
  } else {
    // 切换到原始数据视图
    try {
      const rawData = JSON.parse(modal.dataset.rawContent || '{}');
      reportContent.innerHTML = `<pre class="bg-light p-3 rounded"><code class="language-json">${JSON.stringify(rawData, null, 2)}</code></pre>`;
      
      // 高亮代码
      document.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
      });
      
      // 更改按钮图标
      viewRawDataBtn.innerHTML = '<i class="bi bi-file-text"></i> 查看报告内容';
    } catch (e) {
      console.error('解析原始数据失败:', e);
      showError('无法解析原始数据');
    }
  }
}

// 确认删除日报
function confirmDeleteReport() {
  // 显示确认删除模态框
  const modal = new bootstrap.Modal(document.getElementById('deleteReportConfirmModal'));
  modal.show();
}

// 删除日报
async function deleteReport() {
  showLoader();
  
  try {
    const reportId = window.currentReportId;
    if (!reportId) {
      throw new Error('未找到要删除的日报ID');
    }
    
    // 发送删除请求
    const response = await fetch(`/api/modbus/reports/${reportId}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      throw new Error(`删除日报失败: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('删除日报响应:', data);
    
    // 关闭确认模态框和查看模态框
    const confirmModal = bootstrap.Modal.getInstance(document.getElementById('deleteReportConfirmModal'));
    confirmModal.hide();
    
    const viewModal = bootstrap.Modal.getInstance(document.getElementById('viewReportModal'));
    viewModal.hide();
    
    // 显示成功消息
    showSuccess(data.message || '日报删除成功');
    
    // 刷新日报列表
    setTimeout(() => {
      queryReports();
    }, 1000);
  } catch (error) {
    console.error('删除日报失败:', error);
    showError('删除日报失败: ' + error.message);
  } finally {
    hideLoader();
  }
}

// 生成日报
async function generateReport() {
  showLoader();
  
  try {
    const reportDateInput = document.getElementById('reportDateInput');
    if (!reportDateInput || !reportDateInput.value) {
      throw new Error('请选择要生成日报的日期');
    }
    
    const targetDate = reportDateInput.value;
    
    // 发送请求生成日报
    const response = await fetch('/api/modbus/reports/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ targetDate })
    });
    
    if (!response.ok) {
      throw new Error(`生成日报失败: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('生成日报响应:', data);
    
    // 隐藏模态框
    const modal = bootstrap.Modal.getInstance(document.getElementById('generateReportModal'));
    modal.hide();
    
    if (data.success) {
      showSuccess(data.message || '日报生成成功');
      
      // 刷新日报列表
      setTimeout(() => {
        queryReports();
      }, 1000);
    } else {
      showWarning(data.message || '日报生成失败');
    }
  } catch (error) {
    console.error('生成日报失败:', error);
    showError('生成日报失败: ' + error.message);
  } finally {
    hideLoader();
  }
}

// 确保DOMContentLoaded事件发生时初始化日报功能
document.addEventListener('DOMContentLoaded', function() {
  console.log('页面加载完成，准备初始化日报功能');
  
  setTimeout(() => {
    if (typeof initReportFeatures === 'function') {
      console.log('调用initReportFeatures初始化日报功能');
      initReportFeatures();
    } else {
      console.error('initReportFeatures函数不存在');
    }
  }, 1000);
});

// 转义HTML特殊字符
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// 将Markdown转换为HTML (简单实现)
function convertMarkdownToHtml(markdown) {
  if (!markdown) return '';
  
  let html = markdown
    // 标题
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^#### (.*$)/gm, '<h4>$1</h4>')
    .replace(/^##### (.*$)/gm, '<h5>$1</h5>')
    
    // 加粗
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    
    // 斜体
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    
    // 列表项
    .replace(/^\s*- (.*$)/gm, '<li>$1</li>')
    
    // 段落
    .replace(/^(?!<h|<li|<ul|<p|<table)(.*$)/gm, '<p>$1</p>')
    
    // 链接
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
    
    // 表格处理
    .replace(/^\|(.*)\|$/gm, function(match, content) {
      const cells = content.split('|').map(cell => cell.trim());
      return '<tr>' + cells.map(cell => `<td>${cell}</td>`).join('') + '</tr>';
    });
  
  // 处理表格标题行
  html = html.replace(/<tr><td>---+<\/td>/g, '<tr><td>');
  
  // 将连续的<li>元素包装在<ul>中
  let inList = false;
  const lines = html.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('<li>')) {
      if (!inList) {
        lines[i] = '<ul>' + lines[i];
        inList = true;
      }
    } else if (inList) {
      lines[i-1] = lines[i-1] + '</ul>';
      inList = false;
    }
  }
  
  if (inList) {
    lines.push('</ul>');
  }
  
  html = lines.join('\n');
  
  // 包装表格
  html = html.replace(/<tr>(.*?)<\/tr>/g, function(match) {
    if (match.includes('<td>-')) {
      // 这是分隔线行，替换为表头结束标记
      return '</thead><tbody>';
    }
    return match;
  });
  
  // 包装表格
  html = html.replace(/(<tr>.*?<\/tr>)\n(<tr>.*?<\/tr>)\n(<\/thead>)/g, '<table class="table"><thead>$1$2$3');
  html = html.replace(/(<\/tbody>)(?!\n<\/table>)/g, '$1</table>');
  
  return html;
}

// 从列表页面直接删除日报
async function directDeleteReport(reportId) {
  if (!reportId) return;
  
  // 存储要删除的报告ID
  window.currentReportId = reportId;
  
  // 显示确认删除模态框
  const modal = new bootstrap.Modal(document.getElementById('deleteReportConfirmModal'));
  modal.show();
}

// 初始化告警历史查询状态
window.alarmHistoryState = {
  currentPage: 0,
  pageSize: 10,
  totalRecords: 0,
  alarms: []
};

// 格式化告警时间为本地时间
function formatAlarmTime(timeStr) {
  if (!timeStr) return '-';
  
  try {
    const date = new Date(timeStr);
    return date.toLocaleString();
  } catch (e) {
    console.error('格式化告警时间出错:', e);
    return timeStr;
  }
}

// 初始化告警历史查询功能
function initAlarmHistoryFeatures() {
  console.log('初始化告警历史查询功能');
  
  // 设置默认时间范围 (过去24小时)
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  
  document.getElementById('alarmEndTimeInput').value = formatDateTimeForInput(now);
  document.getElementById('alarmStartTimeInput').value = formatDateTimeForInput(yesterday);
  
  // 初始查询
  queryAlarmHistory();
}

// 查询告警历史
async function queryAlarmHistory() {
  showLoader();
  
  try {
    // 重置分页
    window.alarmHistoryState.currentPage = 0;
    
    // 获取查询参数
    const startTime = document.getElementById('alarmStartTimeInput').value;
    const endTime = document.getElementById('alarmEndTimeInput').value;
    const status = document.getElementById('alarmStatusSelect').value;
    
    // 构建查询参数
    const params = new URLSearchParams();
    if (startTime) params.append('startTime', new Date(startTime).toISOString());
    if (endTime) params.append('endTime', new Date(endTime).toISOString());
    if (status) params.append('status', status);
    params.append('limit', window.alarmHistoryState.pageSize);
    params.append('offset', 0);
    
    // 发送查询请求
    const response = await fetch(`/api/modbus/alarms/history?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error(`查询失败: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('查询到告警历史:', data);
    
    // 保存结果
    window.alarmHistoryState.alarms = data.alarms || [];
    window.alarmHistoryState.totalRecords = data.count || data.alarms?.length || 0;
    
    // 渲染结果
    renderAlarmHistory();
    updateAlarmHistoryPagination();
  } catch (error) {
    console.error('查询告警历史失败:', error);
    showError('查询告警历史失败: ' + error.message);
    
    // 清空结果
    window.alarmHistoryState.alarms = [];
    window.alarmHistoryState.totalRecords = 0;
    
    // 显示无数据提示
    document.getElementById('alarmHistoryList').innerHTML = '';
    document.getElementById('noAlarmHistory').style.display = 'block';
    document.getElementById('alarmHistoryResultInfo').textContent = '查询出错';
  } finally {
    hideLoader();
  }
}

// 渲染告警历史列表
function renderAlarmHistory() {
  const alarmHistoryList = document.getElementById('alarmHistoryList');
  const noAlarmHistory = document.getElementById('noAlarmHistory');
  const resultInfo = document.getElementById('alarmHistoryResultInfo');
  
  // 清空现有内容
  alarmHistoryList.innerHTML = '';
  
  // 获取要显示的告警
  const alarms = window.alarmHistoryState.alarms;
  
  // 更新结果信息
  resultInfo.textContent = `共 ${window.alarmHistoryState.totalRecords} 条记录`;
  
  // 检查是否有数据
  if (!alarms || alarms.length === 0) {
    noAlarmHistory.style.display = 'block';
    return;
  }
  
  // 隐藏无数据提示
  noAlarmHistory.style.display = 'none';
  
  // 渲染每条告警
  alarms.forEach(alarm => {
    const alarmItem = document.createElement('div');
    alarmItem.className = 'alarm-item';
    
    // 根据状态添加样式
    if (alarm.status === 'cleared') {
      alarmItem.classList.add('warning');
    }
    
    // 计算告警持续时间
    let durationText = '';
    if (alarm.status === 'cleared' && alarm.triggered_time && alarm.cleared_time) {
      try {
        const triggerTime = new Date(alarm.triggered_time);
        const clearTime = new Date(alarm.cleared_time);
        const durationMs = clearTime - triggerTime;
        
        // 格式化持续时间
        if (durationMs < 60000) { // 小于1分钟
          durationText = `持续 ${Math.floor(durationMs / 1000)} 秒`;
        } else if (durationMs < 3600000) { // 小于1小时
          durationText = `持续 ${Math.floor(durationMs / 60000)} 分钟`;
        } else { // 大于1小时
          const hours = Math.floor(durationMs / 3600000);
          const minutes = Math.floor((durationMs % 3600000) / 60000);
          durationText = `持续 ${hours} 小时 ${minutes} 分钟`;
        }
      } catch (e) {
        console.error('计算告警持续时间出错:', e);
      }
    }
    
    // 构建告警内容
    alarmItem.innerHTML = `
      <div class="alarm-title">${alarm.alarm_content || alarm.content || '未知告警'}</div>
      <div class="alarm-desc">
        数据点: ${alarm.data_point_name || alarm.dataPointName || alarm.identifier || '未知'}
      </div>
      <div class="alarm-time">
        <span>触发时间: ${formatAlarmTime(alarm.triggered_time)}</span>
        ${alarm.status === 'cleared' ? `<span class="ms-3">解除时间: ${formatAlarmTime(alarm.cleared_time)}</span>` : ''}
        ${durationText ? `<span class="ms-3">${durationText}</span>` : ''}
      </div>
      <div class="mt-2">
        <span class="alarm-alert">
          <i class="bi ${alarm.status === 'cleared' ? 'bi-check-circle' : 'bi-exclamation-circle'}"></i>
          ${alarm.status === 'cleared' ? '已解除' : '未解除'}
        </span>
      </div>
    `;
    
    alarmHistoryList.appendChild(alarmItem);
  });
}

// 加载分页的告警历史数据
async function loadAlarmHistoryData() {
  showLoader();
  
  try {
    // 获取查询参数
    const startTime = document.getElementById('alarmStartTimeInput').value;
    const endTime = document.getElementById('alarmEndTimeInput').value;
    const status = document.getElementById('alarmStatusSelect').value;
    
    // 构建查询参数
    const params = new URLSearchParams();
    if (startTime) params.append('startTime', new Date(startTime).toISOString());
    if (endTime) params.append('endTime', new Date(endTime).toISOString());
    if (status) params.append('status', status);
    params.append('limit', window.alarmHistoryState.pageSize);
    params.append('offset', window.alarmHistoryState.currentPage * window.alarmHistoryState.pageSize);
    
    // 发送查询请求
    const response = await fetch(`/api/modbus/alarms/history?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error(`加载数据失败: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // 更新数据
    window.alarmHistoryState.alarms = data.alarms || [];
    
    // 渲染结果
    renderAlarmHistory();
    updateAlarmHistoryPagination();
  } catch (error) {
    console.error('加载告警历史失败:', error);
    showError('加载告警历史失败: ' + error.message);
  } finally {
    hideLoader();
  }
}

// 更新告警历史分页信息
function updateAlarmHistoryPagination() {
  const { currentPage, pageSize, totalRecords } = window.alarmHistoryState;
  
  // 计算显示的记录范围
  const start = totalRecords > 0 ? (currentPage * pageSize) + 1 : 0;
  const end = Math.min((currentPage + 1) * pageSize, totalRecords);
  
  // 更新显示
  document.getElementById('alarmHistoryStart').textContent = start;
  document.getElementById('alarmHistoryEnd').textContent = end;
  document.getElementById('alarmHistoryTotal').textContent = totalRecords;
  
  // 更新按钮状态
  document.getElementById('alarmHistoryPrevBtn').disabled = currentPage === 0;
  document.getElementById('alarmHistoryNextBtn').disabled = end >= totalRecords;
}

// 上一页
function prevAlarmHistoryPage() {
  if (window.alarmHistoryState.currentPage > 0) {
    window.alarmHistoryState.currentPage--;
    loadAlarmHistoryData();
  }
}

// 下一页
function nextAlarmHistoryPage() {
  const { currentPage, pageSize, totalRecords } = window.alarmHistoryState;
  const totalPages = Math.ceil(totalRecords / pageSize);
  
  if (currentPage < totalPages - 1) {
    window.alarmHistoryState.currentPage++;
    loadAlarmHistoryData();
  }
}

// 确保在DOMContentLoaded时初始化告警历史功能
document.addEventListener('DOMContentLoaded', function() {
  console.log('页面加载完成，准备初始化功能');
  
  // 为不同的视图设置相应的初始化函数
  const viewInitializers = {
    'data-display': function() {
      console.log('初始化数据展示视图');
    },
    'alarm-history': initAlarmHistoryFeatures,
    'daily-reports': function() {
      console.log('初始化日报功能');
      if (typeof initReportFeatures === 'function') {
        initReportFeatures();
      }
    }
  };
  
  // 为侧边栏导航项添加点击事件，激活相应的视图初始化函数
  const sidebarLinks = document.querySelectorAll('.sidebar-nav-link');
  sidebarLinks.forEach(link => {
    link.addEventListener('click', function() {
      const viewId = this.getAttribute('data-view');
      if (viewId && viewInitializers[viewId]) {
        console.log(`激活视图: ${viewId}`);
        setTimeout(() => {
          viewInitializers[viewId]();
        }, 100);
      }
    });
  });
  
  // 检查当前激活的视图并初始化
  setTimeout(() => {
    const activeViewLink = document.querySelector('.sidebar-nav-link.active');
    if (activeViewLink) {
      const viewId = activeViewLink.getAttribute('data-view');
      if (viewId && viewInitializers[viewId]) {
        console.log(`初始化当前激活视图: ${viewId}`);
        viewInitializers[viewId]();
      }
    }
  }, 500);
});

// 上传日报到知识库
async function uploadReportToKnowledge(reportId) {
  showLoader();
  
  try {
    // 确认上传
    if (!confirm('确定要将此日报上传到知识库吗？')) {
      hideLoader();
      return;
    }
    
    console.log(`准备上传日报(ID:${reportId})到知识库`);
    
    // 发送请求
    const response = await fetch(`/api/modbus/reports/${reportId}/upload-to-knowledge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    
    if (!response.ok) {
      throw new Error(`上传失败: ${response.status} ${response.statusText}`);
    }
    
    // 解析响应
    const data = await response.json();
    console.log('上传日报到知识库响应:', data);
    
    if (data.success) {
      // 显示成功消息
      showSuccess(`日报已成功上传到知识库! 文档标题: ${data.documentTitle}`);
    } else {
      throw new Error(data.error || '上传失败');
    }
  } catch (error) {
    console.error('上传日报到知识库失败:', error);
    showError('上传日报到知识库失败: ' + error.message);
  } finally {
    hideLoader();
  }
}

// 获取最小建议轮询间隔
async function getMinPollingInterval() {
  try {
    const response = await fetch(`${API_BASE_URL}/polling/min-interval`);
    if (!response.ok) {
      console.error('获取最小建议轮询间隔失败');
      return null;
    }
    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error('获取最小建议轮询间隔出错:', error);
    return null;
  }
}

// 显示设置弹窗
async function showSettingsModal() {
  // 显示加载器
  showLoader();
  
  try {
    // 获取连接配置
    const connectionConfig = await axios.get(`${API_BASE_URL}/connection/config`);
    
    // 获取轮询配置
    const pollingConfig = await axios.get(`${API_BASE_URL}/polling/config`);
    
    // 获取最小建议轮询间隔
    const minIntervalInfo = await getMinPollingInterval();
    
    // 填充表单
    document.getElementById('hostInput').value = connectionConfig.data.data.host;
    document.getElementById('portInput').value = connectionConfig.data.data.port;
    document.getElementById('unitIdInput').value = connectionConfig.data.data.unitId;
    document.getElementById('timeoutInput').value = connectionConfig.data.data.timeout;
    document.getElementById('autoConnectCheck').checked = connectionConfig.data.data.autoConnect;
    
    document.getElementById('pollingIntervalInput').value = pollingConfig.data.data.interval;
    document.getElementById('autoPollingCheck').checked = pollingConfig.data.data.enabled;
    
    // 显示最小建议轮询间隔提示
    const minIntervalInfoElement = document.getElementById('minIntervalInfo');
    if (minIntervalInfo && minIntervalInfoElement) {
      // 当前数据点数量的建议间隔
      const currentMinInterval = minIntervalInfo.minRecommendedInterval;
      // 200个数据点情况下的参考间隔
      const referenceInterval = minIntervalInfo.referenceFor200Points;
      
      // 获取当前设置的间隔
      const currentInterval = parseInt(pollingConfig.data.data.interval);
      
      // 如果当前设置的间隔小于建议间隔，显示警告
      if (currentInterval < currentMinInterval) {
        minIntervalInfoElement.innerHTML = `
          <i class="bi bi-exclamation-triangle-fill"></i> 
          当前数据点(${minIntervalInfo.dataPointCount}个)建议最小间隔: <strong>${currentMinInterval}ms</strong>，
          当前设置值过小可能导致请求堆积
        `;
        minIntervalInfoElement.className = 'form-text text-danger';
      } else {
        minIntervalInfoElement.innerHTML = `
          当前数据点(${minIntervalInfo.dataPointCount}个)建议最小间隔: ${currentMinInterval}ms
          <br>参考值: 200个数据点建议间隔${referenceInterval}ms
        `;
        minIntervalInfoElement.className = 'form-text text-info';
      }
    }
    
    // 显示模态框
    settingsModal.show();
  } catch (error) {
    console.error('加载设置失败:', error);
    showError(error.response?.data?.error || '加载设置失败');
  } finally {
    hideLoader();
  }
}

// 重置数据点表单
function resetDataPointForm() {
  document.getElementById('dataPointForm').reset();
  document.getElementById('dataPointId').value = '';
  
  // 设置标题
  const titleElement = document.getElementById('dataPointModalTitle');
  titleElement.innerHTML = '<i class="bi bi-database-add"></i> 添加数据点';
  
  // 默认设置为只读模式
  document.getElementById('accessModeSelect').value = 'read';
  
  // 更新功能码选项
  updateFunctionCodeOptions();
  
  // 默认数据格式为UINT16
  document.getElementById('formatSelect').value = 'UINT16';
  
  // 隐藏位位置选择
  document.getElementById('bitPositionDiv').style.display = 'none';
  
  // 默认缩放因子为1
  document.getElementById('scaleInput').value = '1';
  
  // 默认不启用告警
  document.getElementById('alarmEnabledCheck').checked = false;
  
  // 隐藏告警设置
  document.getElementById('alarmSettingsDiv').style.display = 'none';
  document.getElementById('bitAlarmSettings').style.display = 'none';
}

// 加载可用的16位数据点
async function loadAvailable16BitDataPoints() {
  try {
    console.log('开始加载16位数据点...');
    
    const sourceDataPointSelect = document.getElementById('sourceDataPointSelect');
    if (!sourceDataPointSelect) {
      console.error('找不到sourceDataPointSelect元素');
      return;
    }
    
    // 清空现有选项
    sourceDataPointSelect.innerHTML = '<option value="">请选择16位数据点</option>';
    
    // 获取所有数据点 - 使用正确的API端点
    console.log('正在请求数据点列表...');
    const response = await axios.get(`${API_BASE_URL}/data-points`);
    console.log('数据点API响应:', response.data);
    
    // 处理不同的响应格式
    let dataPoints = [];
    if (response.data.success && response.data.dataPoints) {
      dataPoints = response.data.dataPoints;
    } else if (Array.isArray(response.data)) {
      dataPoints = response.data;
    } else if (response.data.data && Array.isArray(response.data.data)) {
      dataPoints = response.data.data;
    }
    
    console.log(`获取到 ${dataPoints.length} 个数据点`);
    
    if (dataPoints.length === 0) {
      console.warn('没有找到任何数据点');
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '暂无可用的数据点';
      option.disabled = true;
      sourceDataPointSelect.appendChild(option);
      return;
    }
    
    // 过滤出16位数据点（UINT16, INT16）
    const sixteenBitDataPoints = dataPoints.filter(dp => {
      console.log(`检查数据点: ${dp.name} (${dp.identifier}) - 格式: ${dp.format}`);
      return dp.format === 'UINT16' || dp.format === 'INT16';
    });
    
    console.log(`过滤后的16位数据点数量: ${sixteenBitDataPoints.length}`);
    
    if (sixteenBitDataPoints.length === 0) {
      console.warn('没有找到16位数据点');
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '暂无16位数据点';
      option.disabled = true;
      sourceDataPointSelect.appendChild(option);
      return;
    }
    
    // 添加到选择器中
    sixteenBitDataPoints.forEach(dp => {
      const option = document.createElement('option');
      option.value = dp.identifier;
      option.textContent = `${dp.name} (${dp.identifier}) - ${dp.format}`;
      sourceDataPointSelect.appendChild(option);
      console.log(`添加选项: ${option.textContent}`);
    });
    
    console.log(`成功加载了 ${sixteenBitDataPoints.length} 个16位数据点`);
  } catch (error) {
    console.error('加载16位数据点失败:', error);
    
    const sourceDataPointSelect = document.getElementById('sourceDataPointSelect');
    if (sourceDataPointSelect) {
      sourceDataPointSelect.innerHTML = '<option value="">加载失败，请重试</option>';
    }
    
    // 显示错误信息给用户
    showError(`加载16位数据点失败: ${error.message || '未知错误'}`);
  }
}

// 设置点位解析的事件监听器
function setupPointParsingListeners() {
  const sourceDataPointSelect = document.getElementById('sourceDataPointSelect');
  const pointBitPositionSelect = document.getElementById('pointBitPositionSelect');
  
  if (!sourceDataPointSelect || !pointBitPositionSelect) return;
  
  // 移除现有的事件监听器
  sourceDataPointSelect.removeEventListener('change', updatePointPreview);
  pointBitPositionSelect.removeEventListener('change', updatePointPreview);
  
  // 添加新的事件监听器
  sourceDataPointSelect.addEventListener('change', updatePointPreview);
  pointBitPositionSelect.addEventListener('change', updatePointPreview);
  
  // 初始更新预览
  updatePointPreview();
}

// 更新点位解析预览
function updatePointPreview() {
  const sourceDataPointSelect = document.getElementById('sourceDataPointSelect');
  const pointBitPositionSelect = document.getElementById('pointBitPositionSelect');
  const sourceValuePreview = document.getElementById('sourceValuePreview');
  const binaryPreview = document.getElementById('binaryPreview');
  const pointValuePreview = document.getElementById('pointValuePreview');
  
  if (!sourceDataPointSelect || !pointBitPositionSelect || 
      !sourceValuePreview || !binaryPreview || !pointValuePreview) {
    return;
  }
  
  const sourceIdentifier = sourceDataPointSelect.value;
  const bitPosition = parseInt(pointBitPositionSelect.value);
  
  if (!sourceIdentifier) {
    sourceValuePreview.textContent = '--';
    binaryPreview.textContent = '----------------';
    pointValuePreview.textContent = '--';
    return;
  }
  
  // 获取源数据点的当前值
  const sourceValue = getDataPointCurrentValue(sourceIdentifier);
  
  if (sourceValue !== null && sourceValue !== undefined) {
    const numValue = parseInt(sourceValue);
    if (!isNaN(numValue)) {
      // 显示源值
      sourceValuePreview.textContent = numValue;
      
      // 转换为16位二进制字符串
      const binaryStr = (numValue >>> 0).toString(2).padStart(16, '0');
      binaryPreview.textContent = binaryStr;
      
      // 提取指定位的值
      const bitValue = (numValue >> bitPosition) & 1;
      pointValuePreview.textContent = bitValue;
      pointValuePreview.className = `fw-bold ${bitValue ? 'text-success' : 'text-danger'}`;
    } else {
      sourceValuePreview.textContent = sourceValue;
      binaryPreview.textContent = '无效数值';
      pointValuePreview.textContent = '--';
    }
  } else {
    sourceValuePreview.textContent = '--';
    binaryPreview.textContent = '----------------';
    pointValuePreview.textContent = '--';
  }
}

// 获取数据点当前值
function getDataPointCurrentValue(identifier) {
  // 从全局数据点映射中获取值
  if (window.dataPointsMap && window.dataPointsMap.has(identifier)) {
    const dataPoint = window.dataPointsMap.get(identifier);
    return dataPoint.value;
  }
  
  // 从数据点值缓存中获取
  if (window.dataValues && window.dataValues[identifier]) {
    return window.dataValues[identifier].value;
  }
  
  return null;
}

// 根据数据点格式获取格式化的显示内容
function getFormattedValueDisplay(value, dataPoint) {
  if (dataPoint.format === 'POINT' || dataPoint.format === 'BIT') {
    // 对于POINT和BIT格式，显示为徽章
    const pointValue = value === 1 || value === true;
    return `<span class="badge ${pointValue ? 'bg-success' : 'bg-secondary'}">${pointValue ? '1' : '0'}</span>`;
  }
  
  // 对于其他格式，返回原始值
  return value;
}

/**
 * 处理MQTT消息中的POINT格式数据点实时解析
 * @param {Object} mqttData MQTT消息数据
 */
function processPointDataPointsFromMQTT(mqttData) {
  console.log('开始处理MQTT消息中的POINT格式数据点解析...', mqttData);
  
  // 加载数据点配置
  loadDataPointConfigs().then(dataPointConfigs => {
    if (!dataPointConfigs || dataPointConfigs.length === 0) {
      console.log('没有数据点配置，跳过POINT解析');
      return;
    }
    
    // 查找所有POINT格式的数据点
    const pointDataPoints = dataPointConfigs.filter(dp => dp.format === 'POINT');
    
    if (pointDataPoints.length === 0) {
      console.log('没有POINT格式数据点，跳过解析');
      return;
    }
    
    console.log(`找到 ${pointDataPoints.length} 个POINT格式数据点需要处理解析`);
    
    // 创建当前有效数据点标识符的集合，用于快速查找
    const validIdentifiers = new Set(dataPointConfigs.map(dp => dp.identifier).filter(id => id));
    const validNames = new Set(dataPointConfigs.map(dp => dp.name).filter(name => name));
    
    // 收集解析后的POINT数据用于保存到数据库
    const pointDataToSave = {};
    
    pointDataPoints.forEach(pointDP => {
      console.log(`检查POINT数据点: ${pointDP.name} (${pointDP.identifier})`);
      
      // 检查源数据点是否在本次MQTT数据中有更新
      const sourceIdentifier = pointDP.sourceDataPointIdentifier;
      if (!sourceIdentifier) {
        console.warn(`POINT数据点 ${pointDP.name} 没有配置源数据点标识符，跳过`);
        return;
      }
      
      console.log(`源数据点标识符: ${sourceIdentifier}, 位位置: ${pointDP.pointBitPosition}`);
      
      // 验证源数据点是否仍然存在于当前配置中
      if (!validIdentifiers.has(sourceIdentifier) && !validNames.has(sourceIdentifier)) {
        console.warn(`POINT数据点 ${pointDP.name} 的源数据点 ${sourceIdentifier} 已不存在，跳过解析`);
        return;
      }
      
      // 检查MQTT数据中是否包含源数据点的值
      let sourceValue = null;
      if (mqttData[sourceIdentifier] !== undefined) {
        sourceValue = mqttData[sourceIdentifier];
      } else {
        // 尝试通过数据点名称查找
        const sourceDataPoint = dataPointConfigs.find(dp => dp.identifier === sourceIdentifier);
        if (sourceDataPoint && mqttData[sourceDataPoint.name] !== undefined) {
          sourceValue = mqttData[sourceDataPoint.name];
        }
      }
      
      if (sourceValue === null || sourceValue === undefined) {
        console.log(`源数据点 ${sourceIdentifier} 在本次MQTT数据中没有更新`);
        return;
      }
      
      console.log(`处理POINT数据点 ${pointDP.name}，源数据点 ${sourceIdentifier} 值: ${sourceValue}`);
      
      // 执行位运算解析
      const numValue = parseInt(sourceValue);
      if (isNaN(numValue)) {
        console.warn(`源数据点 ${sourceIdentifier} 的值 ${sourceValue} 不是有效数字，跳过解析`);
        return;
      }
      
      const pointBitPosition = parseInt(pointDP.pointBitPosition);
      if (isNaN(pointBitPosition) || pointBitPosition < 0 || pointBitPosition > 15) {
        console.warn(`POINT数据点 ${pointDP.name} 的位位置 ${pointDP.pointBitPosition} 无效，跳过解析`);
        return;
      }
      
      // 执行位运算：(numValue >> bitPosition) & 1
      const pointValue = (numValue >> pointBitPosition) & 1;
      
      console.log(`POINT解析结果: ${pointDP.name} = ${pointValue} (源值: ${numValue}, 位位置: ${pointBitPosition})`);
      
      // 更新数据点映射
      if (!window.currentDataValues) {
        window.currentDataValues = {};
      }
      
      window.currentDataValues[pointDP.name] = {
        value: pointValue,
        formatted: pointValue.toString(),
        timestamp: new Date().toISOString(),
        quality: 'GOOD'
      };
      
      // 收集数据用于保存到数据库
      pointDataToSave[pointDP.identifier] = pointValue;
      
      // 更新UI显示
      updateDataPointUI(pointDP, pointValue);
    });
    
    // 如果有解析后的POINT数据，保存到数据库
    if (Object.keys(pointDataToSave).length > 0) {
      console.log(`保存 ${Object.keys(pointDataToSave).length} 个POINT数据到数据库:`, pointDataToSave);
      savePointDataToDatabase(pointDataToSave);
    }
  }).catch(error => {
    console.error('加载数据点配置失败:', error);
  });
}

// 保存POINT数据到数据库
async function savePointDataToDatabase(pointData) {
  try {
    const response = await fetch('/api/modbus/save-point-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        pointData: pointData,
        timestamp: new Date().toISOString()
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('POINT数据保存成功:', result);
    } else {
      console.error('POINT数据保存失败:', response.status, response.statusText);
    }
  } catch (error) {
    console.error('保存POINT数据到数据库失败:', error);
  }
}

/**
 * 更新数据点UI显示
 * @param {Object} dataPoint 数据点配置
 * @param {any} value 数据点值
 */
function updateDataPointUI(dataPoint, value) {
  const valueElement = document.getElementById(`value-${dataPoint.id}`);
  const timestampElement = document.getElementById(`timestamp-${dataPoint.id}`);
  
  if (valueElement) {
    const formattedValue = getFormattedValueDisplay(value, dataPoint);
    const oldContent = valueElement.innerHTML;
    
    if (oldContent !== formattedValue) {
      valueElement.innerHTML = formattedValue;
      
      // 添加更新动画效果
      valueElement.classList.add('updated');
      setTimeout(() => {
        valueElement.classList.remove('updated');
      }, 1500);
    }
  }
  
  if (timestampElement) {
    const formattedTime = formatDateTime(new Date());
    const oldTimestamp = timestampElement.innerText;
    
    if (oldTimestamp !== formattedTime) {
      timestampElement.innerText = formattedTime;
      
      // 添加更新动画效果
      timestampElement.classList.add('updated');
      setTimeout(() => {
        timestampElement.classList.remove('updated');
      }, 1500);
    }
  }
}

/**
 * 加载数据点配置
 * @returns {Promise<Array>} 数据点配置数组
 */
async function loadDataPointConfigs() {
  try {
    const response = await fetch('/api/modbus/data-points');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // 处理不同的响应格式
    if (Array.isArray(data)) {
      return data;
    } else if (data.dataPoints && Array.isArray(data.dataPoints)) {
      return data.dataPoints;
    } else if (data.data && Array.isArray(data.data)) {
      return data.data;
    } else {
      console.warn('意外的API响应格式:', data);
      return [];
    }
  } catch (error) {
    console.error('加载数据点配置失败:', error);
    return [];
  }
}

// 调试函数：查看定时器状态
window.debugTimers = function() {
  const status = window.TimerManager.getTimerStatus();
  console.log('=== 当前定时器状态 ===');
  console.table(status);
  
  if (Object.keys(status).length === 0) {
    console.log('没有活跃的定时器');
  } else {
    console.log(`共有 ${Object.keys(status).length} 个活跃定时器`);
  }
  
  return status;
};

// 调试函数：停止所有定时器
window.stopAllTimers = function() {
  console.log('=== 停止所有定时器 ===');
  window.TimerManager.clearAllTimers();
  
  // 清理其他可能的全局定时器
  if (window.dataRefreshTimer) {
    clearInterval(window.dataRefreshTimer);
    window.dataRefreshTimer = null;
    console.log('已清理全局dataRefreshTimer');
  }
  
  if (window.autoRefreshTimer) {
    clearInterval(window.autoRefreshTimer);
    window.autoRefreshTimer = null;
    console.log('已清理全局autoRefreshTimer');
  }
  
  console.log('所有定时器已停止');
};

// 调试函数：重启数据刷新
window.restartDataRefresh = function(interval = 1000) {
  console.log(`=== 重启数据刷新定时器 (间隔: ${interval}ms) ===`);
  
  // 先停止现有定时器
  window.TimerManager.clearTimer('dataRefresh');
  
  // 检查状态
  const connected = isConnected();
  const polling = isPolling();
  
  console.log(`连接状态: ${connected}, 轮询状态: ${polling}`);
  
  if (connected && polling) {
    setupDataRefresh(interval);
    console.log('数据刷新定时器已重启');
  } else {
    console.log('无法重启：连接或轮询状态不正确');
  }
};

// 调试函数：检查POINT数据点配置
window.checkPointDataPoints = async function() {
  console.log('=== 检查POINT数据点配置 ===');
  
  try {
    const dataPointConfigs = await loadDataPointConfigs();
    if (!dataPointConfigs || dataPointConfigs.length === 0) {
      console.log('没有数据点配置');
      return;
    }
    
    // 查找所有POINT格式的数据点
    const pointDataPoints = dataPointConfigs.filter(dp => dp.format === 'POINT');
    
    if (pointDataPoints.length === 0) {
      console.log('没有POINT格式数据点');
      return;
    }
    
    console.log(`找到 ${pointDataPoints.length} 个POINT格式数据点:`);
    
    // 创建当前有效数据点标识符的集合
    const validIdentifiers = new Set(dataPointConfigs.map(dp => dp.identifier).filter(id => id));
    const validNames = new Set(dataPointConfigs.map(dp => dp.name).filter(name => name));
    
    const invalidPoints = [];
    
    pointDataPoints.forEach(pointDP => {
      const sourceIdentifier = pointDP.sourceDataPointIdentifier;
      const isValid = sourceIdentifier && 
                     (validIdentifiers.has(sourceIdentifier) || validNames.has(sourceIdentifier));
      
      console.log(`- ${pointDP.name} (${pointDP.identifier})`);
      console.log(`  源数据点: ${sourceIdentifier || '未配置'}`);
      console.log(`  位位置: ${pointDP.pointBitPosition}`);
      console.log(`  状态: ${isValid ? '✓ 有效' : '✗ 无效 - 源数据点不存在'}`);
      
      if (!isValid) {
        invalidPoints.push({
          id: pointDP.id,
          name: pointDP.name,
          identifier: pointDP.identifier,
          sourceIdentifier: sourceIdentifier
        });
      }
    });
    
    if (invalidPoints.length > 0) {
      console.warn(`发现 ${invalidPoints.length} 个无效的POINT数据点:`);
      console.table(invalidPoints);
      console.log('建议删除这些无效的POINT数据点配置');
    } else {
      console.log('所有POINT数据点配置都是有效的');
    }
    
    return {
      total: pointDataPoints.length,
      valid: pointDataPoints.length - invalidPoints.length,
      invalid: invalidPoints.length,
      invalidPoints: invalidPoints
    };
    
  } catch (error) {
    console.error('检查POINT数据点配置失败:', error);
  }
};

console.log('调试函数已加载:');
console.log('- window.debugTimers() - 查看定时器状态');
console.log('- window.stopAllTimers() - 停止所有定时器');
console.log('- window.restartDataRefresh(interval) - 重启数据刷新定时器');
console.log('- window.checkPointDataPoints() - 检查POINT数据点配置');

// ==================== 数据点批量导入导出功能 ====================

/**
 * 显示批量导入模态框
 */
function showBatchImportModal() {
  console.log('[批量导入] 显示批量导入模态框');
  
  // 重置表单和状态
  resetBatchImportModal();
  
  // 显示模态框
  const modal = new bootstrap.Modal(document.getElementById('batchImportModal'));
  modal.show();
  
  // 绑定事件监听器
  setupBatchImportEventListeners();
}

/**
 * 重置批量导入模态框状态
 */
function resetBatchImportModal() {
  // 重置文件输入
  const fileInput = document.getElementById('excelFileInput');
  if (fileInput) {
    fileInput.value = '';
  }
  
  // 重置复选框
  const skipDuplicatesCheck = document.getElementById('skipDuplicatesCheck');
  if (skipDuplicatesCheck) {
    skipDuplicatesCheck.checked = false;
  }
  
  // 隐藏进度和结果显示
  hideElement('importProgress');
  hideElement('importResults');
  hideElement('importDetailsContainer');
  
  // 重置按钮状态
  showElement('startImportBtn');
  hideElement('closeImportModalBtn');
  
  // 清空结果显示
  clearImportResults();
}

/**
 * 设置批量导入事件监听器
 */
function setupBatchImportEventListeners() {
  const startImportBtn = document.getElementById('startImportBtn');
  if (startImportBtn) {
    startImportBtn.onclick = startBatchImport;
  }
  
  const fileInput = document.getElementById('excelFileInput');
  if (fileInput) {
    fileInput.onchange = validateFileInput;
  }
}

/**
 * 验证文件输入
 */
function validateFileInput() {
  const fileInput = document.getElementById('excelFileInput');
  const file = fileInput.files[0];
  
  if (!file) {
    return;
  }
  
  // 检查文件类型
  const allowedTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/excel'
  ];
  
  const fileName = file.name.toLowerCase();
  const isValidType = allowedTypes.includes(file.type) || 
                     fileName.endsWith('.xlsx') || 
                     fileName.endsWith('.xls');
  
  if (!isValidType) {
    showToast('请选择有效的Excel文件(.xlsx或.xls)', 'error');
    fileInput.value = '';
    return;
  }
  
  // 检查文件大小 (10MB)
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    showToast('文件大小不能超过10MB', 'error');
    fileInput.value = '';
    return;
  }
  
  console.log(`[批量导入] 文件验证通过: ${file.name}, 大小: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
}

/**
 * 开始批量导入
 */
async function startBatchImport() {
  console.log('[批量导入] 开始批量导入数据点');
  
  const fileInput = document.getElementById('excelFileInput');
  const file = fileInput.files[0];
  
  if (!file) {
    showToast('请选择要导入的Excel文件', 'warning');
    return;
  }
  
  // 显示进度
  showImportProgress();
  
  try {
    // 创建FormData
    const formData = new FormData();
    formData.append('excelFile', file);
    
    const skipDuplicates = document.getElementById('skipDuplicatesCheck').checked;
    if (skipDuplicates) {
      formData.append('skipDuplicates', 'true');
    }
    
    // 更新进度
    updateImportProgress(10, '正在上传文件...');
    
    // 发送导入请求
    const response = await axios.post('/api/data-point-batch/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      onUploadProgress: (progressEvent) => {
        const progress = Math.round((progressEvent.loaded * 50) / progressEvent.total);
        updateImportProgress(10 + progress, '正在上传文件...');
      }
    });
    
    // 更新进度
    updateImportProgress(70, '正在处理数据...');
    
    if (response.data.success) {
      const results = response.data.data;
      
      // 更新进度
      updateImportProgress(90, '正在完成导入...');
      
      // 显示导入结果
      showImportResults(results);
      
      // 更新进度
      updateImportProgress(100, '导入完成');
      
      // 如果有成功导入的数据点，刷新数据点列表
      if (results.success > 0) {
        setTimeout(() => {
          loadDataPoints();
          console.log(`[批量导入] 成功导入 ${results.success} 个数据点，正在刷新列表`);
        }, 1000);
      }
      
    } else {
      throw new Error(response.data.error || '导入失败');
    }
    
  } catch (error) {
    console.error('[批量导入] 导入失败:', error);
    
    let errorMessage = '导入失败';
    if (error.response && error.response.data && error.response.data.error) {
      errorMessage = error.response.data.error;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    showImportError(errorMessage);
  }
}

/**
 * 显示导入进度
 */
function showImportProgress() {
  hideElement('importResults');
  showElement('importProgress');
  hideElement('startImportBtn');
  
  updateImportProgress(0, '准备导入...');
}

/**
 * 更新导入进度
 */
function updateImportProgress(percentage, status) {
  const progressBar = document.getElementById('importProgressBar');
  const statusElement = document.getElementById('importStatus');
  
  if (progressBar) {
    progressBar.style.width = `${percentage}%`;
    progressBar.textContent = `${percentage}%`;
    progressBar.setAttribute('aria-valuenow', percentage);
  }
  
  if (statusElement) {
    statusElement.textContent = status;
  }
}

/**
 * 显示导入结果
 */
function showImportResults(results) {
  hideElement('importProgress');
  showElement('importResults');
  hideElement('startImportBtn');
  showElement('closeImportModalBtn');
  
  // 清空之前的结果
  clearImportResults();
  
  const { total, success, failed, errors, successItems, failedItems } = results;
  
  if (failed === 0) {
    // 全部成功
    showElement('importSuccessAlert');
    document.getElementById('importSuccessMessage').textContent = 
      `成功导入 ${success} 个数据点，共处理 ${total} 行数据。`;
  } else if (success > 0) {
    // 部分成功
    showElement('importWarningAlert');
    document.getElementById('importWarningMessage').textContent = 
      `成功导入 ${success} 个数据点，失败 ${failed} 个，共处理 ${total} 行数据。`;
  } else {
    // 全部失败
    showElement('importErrorAlert');
    document.getElementById('importErrorMessage').textContent = 
      `导入失败，共处理 ${total} 行数据，全部导入失败。`;
  }
  
  // 显示详细结果
  if (failedItems && failedItems.length > 0) {
    showImportDetails(successItems, failedItems);
  }
}

/**
 * 显示导入错误
 */
function showImportError(errorMessage) {
  hideElement('importProgress');
  showElement('importResults');
  hideElement('startImportBtn');
  showElement('closeImportModalBtn');
  
  clearImportResults();
  
  showElement('importErrorAlert');
  document.getElementById('importErrorMessage').textContent = errorMessage;
}

/**
 * 显示导入详情
 */
function showImportDetails(successItems, failedItems) {
  showElement('importDetailsContainer');
  
  const tableBody = document.getElementById('importDetailsTableBody');
  if (!tableBody) return;
  
  tableBody.innerHTML = '';
  
  // 添加成功的项目
  if (successItems) {
    successItems.forEach(item => {
      const row = createImportDetailRow(item, '成功', '');
      tableBody.appendChild(row);
    });
  }
  
  // 添加失败的项目
  if (failedItems) {
    failedItems.forEach(item => {
      const row = createImportDetailRow(item, '失败', item.error || '未知错误');
      tableBody.appendChild(row);
    });
  }
}

/**
 * 创建导入详情表格行
 */
function createImportDetailRow(item, status, errorMessage) {
  const row = document.createElement('tr');
  row.className = status === '成功' ? 'table-success' : 'table-danger';
  
  row.innerHTML = `
    <td>${item.row || '-'}</td>
    <td>${escapeHtml(item.name || '-')}</td>
    <td>${escapeHtml(item.identifier || '-')}</td>
    <td>
      <span class="badge ${status === '成功' ? 'bg-success' : 'bg-danger'}">
        ${status}
      </span>
    </td>
    <td>${escapeHtml(errorMessage)}</td>
  `;
  
  return row;
}

/**
 * 清空导入结果显示
 */
function clearImportResults() {
  hideElement('importSuccessAlert');
  hideElement('importWarningAlert');
  hideElement('importErrorAlert');
  hideElement('importDetailsContainer');
  
  // 清空消息内容
  const messageElements = [
    'importSuccessMessage',
    'importWarningMessage', 
    'importErrorMessage'
  ];
  
  messageElements.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = '';
    }
  });
  
  // 清空详情表格
  const tableBody = document.getElementById('importDetailsTableBody');
  if (tableBody) {
    tableBody.innerHTML = '';
  }
}

/**
 * 导出数据点到Excel
 */
async function exportDataPoints() {
  console.log('[批量导出] 开始导出数据点到Excel');
  
  try {
    showToast('正在生成Excel文件...', 'info');
    
    // 发送导出请求
    const response = await axios.get('/api/data-point-batch/export', {
      responseType: 'blob' // 重要：指定响应类型为blob
    });
    
    // 创建下载链接
    const blob = new Blob([response.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // 从响应头获取文件名，如果没有则使用默认名称
    const contentDisposition = response.headers['content-disposition'];
    let filename = '数据点配置.xlsx';
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (filenameMatch && filenameMatch[1]) {
        filename = decodeURIComponent(filenameMatch[1].replace(/['"]/g, ''));
      }
    }
    
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    
    // 清理
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    showToast('Excel文件导出成功', 'success');
    console.log(`[批量导出] Excel文件导出成功: ${filename}`);
    
  } catch (error) {
    console.error('[批量导出] 导出失败:', error);
    
    let errorMessage = '导出失败';
    if (error.response && error.response.data) {
      // 如果是blob响应，尝试解析错误信息
      if (error.response.data instanceof Blob) {
        try {
          const text = await error.response.data.text();
          const errorData = JSON.parse(text);
          errorMessage = errorData.error || errorMessage;
        } catch (parseError) {
          console.error('解析错误响应失败:', parseError);
        }
      } else if (error.response.data.error) {
        errorMessage = error.response.data.error;
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    showToast(errorMessage, 'error');
  }
}

/**
 * 下载Excel模板
 */
async function downloadTemplate() {
  console.log('[模板下载] 开始下载Excel模板');
  
  try {
    showToast('正在生成模板文件...', 'info');
    
    // 发送模板下载请求
    const response = await axios.get('/api/data-point-batch/template', {
      responseType: 'blob' // 重要：指定响应类型为blob
    });
    
    // 创建下载链接
    const blob = new Blob([response.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '数据点导入模板.xlsx';
    document.body.appendChild(link);
    link.click();
    
    // 清理
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    showToast('模板文件下载成功', 'success');
    console.log('[模板下载] 模板文件下载成功');
    
  } catch (error) {
    console.error('[模板下载] 下载失败:', error);
    
    let errorMessage = '模板下载失败';
    if (error.response && error.response.data) {
      if (error.response.data instanceof Blob) {
        try {
          const text = await error.response.data.text();
          const errorData = JSON.parse(text);
          errorMessage = errorData.error || errorMessage;
        } catch (parseError) {
          console.error('解析错误响应失败:', parseError);
        }
      } else if (error.response.data.error) {
        errorMessage = error.response.data.error;
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    showToast(errorMessage, 'error');
  }
}

/**
 * 显示元素
 */
function showElement(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    element.style.display = 'block';
  }
}

/**
 * 隐藏元素
 */
function hideElement(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    element.style.display = 'none';
  }
}

/**
 * 显示提示消息
 */
function showToast(message, type = 'info', duration = 3000) {
  // 如果已经有showSuccess, showWarning等函数，可以复用
  switch (type) {
    case 'success':
      if (typeof showSuccess === 'function') {
        showSuccess(message, duration);
      } else {
        console.log(`[成功] ${message}`);
      }
      break;
    case 'warning':
      if (typeof showWarning === 'function') {
        showWarning(message, duration);
      } else {
        console.warn(`[警告] ${message}`);
      }
      break;
    case 'error':
      if (typeof showError === 'function') {
        showError(message, duration);
      } else {
        console.error(`[错误] ${message}`);
      }
      break;
    default:
      console.log(`[信息] ${message}`);
  }
}

// 将函数暴露到全局作用域，以便HTML中的onclick可以调用
window.showBatchImportModal = showBatchImportModal;
window.exportDataPoints = exportDataPoints;
window.downloadTemplate = downloadTemplate;

// 全局变量
let currentDataPoints = [];
const API_BASE_URL = '/api/modbus';

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', async function() {
  console.log('===== 页面已加载，初始化Modbus界面 =====');
  console.log('时间:', new Date().toISOString());
  
  // 初始化状态
  window.modbusConnected = false;
  window.modbusPolling = false;
  
  try {
    // 加载数据点
    await loadDataPoints();
    console.log('数据点加载完成');
    
    // 延迟添加功能按钮
    setTimeout(() => {
      console.log('添加功能按钮');
      addRefreshButton();
      addDiagnosticButton();
    }, 1000);
    
    // 检查连接状态
    fetch(`${API_BASE_URL}/connection`)
      .then(response => response.json())
      .then(result => {
        if (result.success && result.data.connected) {
          console.log('检测到活跃连接，更新状态');
          updateConnectionStatus(true, '已连接');
          
          // 立即加载一次数据
          loadDataValues(true, true);
          
          // 检查轮询状态
          if (result.data.details.pollingActive) {
            console.log('检测到轮询活跃，更新状态');
            updatePollingStatus(true, result.data.details.pollingInterval);
            
            // 设置数据刷新定时器
            setupDataRefresh(result.data.details.pollingInterval);
          }
        }
      })
      .catch(err => {
        console.error('检查连接状态失败:', err);
      });
    
    // 设置自动刷新定时器，每5秒强制刷新一次数据，无论是否有变化
    setupAutoRefresh();
    console.log('自动刷新功能已设置');
    
  } catch (error) {
    console.error('初始化Modbus界面失败:', error);
    showError('初始化界面失败: ' + error.message);
  }
});

// ===================== 核心功能 =====================

// 加载数据点列表
async function loadDataPoints() {
  try {
    const response = await fetch(`${API_BASE_URL}/datapoints`);
    if(!response.ok) {
      throw new Error(`HTTP错误: ${response.status}`);
    }
    
    const data = await response.json();
    currentDataPoints = data;
    
    // 渲染数据点列表
    renderDataPoints();
    
    // 更新连接状态显示
    updateConnectionStatus(false, '未连接');
    
  } catch (error) {
    console.error('加载数据点失败:', error);
    showError('加载数据点失败: ' + error.message);
  }
}

// 渲染数据点表格
function renderDataPoints() {
  const tableBody = document.getElementById('dataPointsTableBody');
  if (!tableBody) return;
  
  // 清空现有内容
  tableBody.innerHTML = '';
  
  // 添加数据点到表格
  currentDataPoints.forEach(dp => {
    const row = document.createElement('tr');
    
    // 确定是否可写
    let isWritable = dp.accessMode === 'write' || dp.accessMode === 'readwrite';
    
    row.innerHTML = `
      <td>${dp.name}</td>
      <td id="value-${dp.id}">无数据</td>
      <td>${dp.unit || '-'}</td>
      <td id="timestamp-${dp.id}" class="timestamp">未更新</td>
      <td>
        <div class="btn-group btn-group-sm" role="group">
          ${isWritable ? `
          <button type="button" class="btn btn-outline-success" onclick="showWriteValueModal('${dp.id}')">
            <i class="bi bi-pencil-square"></i> 写入
          </button>
          ` : `
          <button type="button" class="btn btn-outline-secondary" disabled>
            <i class="bi bi-lock"></i> 只读
          </button>
          `}
        </div>
      </td>
    `;
    tableBody.appendChild(row);
  });
}

// 切换连接状态
async function toggleConnection() {
  try {
    showLoader();
    
    const connected = isConnected();
    
    if (connected) {
      // 断开连接
      const response = await fetch(`${API_BASE_URL}/connection`, {
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
      
      // 清除自动刷新定时器
      if (window.autoRefreshTimer) {
        clearInterval(window.autoRefreshTimer);
        window.autoRefreshTimer = null;
      }
      
      // 重置错误计数器
      window.dataRefreshErrorCount = 0;
      
      // 清空数据点值
      updateDataValues({});
      
      console.log('成功断开Modbus连接');
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
      
      console.log('正在建立Modbus连接...', config);
      
      // 发送连接请求
      const response = await fetch(`${API_BASE_URL}/connection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ config })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`连接失败: ${response.status} ${errorText || ''}`);
      }
      
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || '连接失败，未知原因');
      }
      
      // 更新连接状态
      updateConnectionStatus(true, '已连接');
      console.log('Modbus连接成功');
      
      // 连接成功后，立即读取一次数据，强制更新显示
      await loadDataValues(true, true);
      
      // 添加功能按钮
      addRefreshButton();
      addDiagnosticButton();
      
      // 重新设置自动刷新定时器
      setupAutoRefresh();
    }
    
  } catch (error) {
    console.error('连接操作失败:', error);
    showError(`连接操作失败: ${error.message}`);
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
      
      // 清除定时器
      if (window.dataRefreshTimer) {
        clearInterval(window.dataRefreshTimer);
        window.dataRefreshTimer = null;
      }
      
      console.log('轮询已停止');
      
    } else {
      // 检查连接状态
      if (!isConnected()) {
        throw new Error('无法启动轮询：未连接到Modbus服务器');
      }
      
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
        const interval = pollingData.interval || 1000;
        
        // 更新轮询状态显示
        updatePollingStatus(true, interval);
        
        console.log(`轮询已启动，间隔: ${interval}ms`);
        
        // 立即加载一次数据
        await loadDataValues(true);
        
        // 设置定期刷新
        setupDataRefresh(interval);
      } else {
        throw new Error(result.error || '启动轮询失败');
      }
    }
  } catch (error) {
    console.error('轮询操作失败:', error);
    showError(error.message);
    updatePollingStatus(false);
  } finally {
    hideLoader();
  }
}

// 设置数据自动刷新
function setupDataRefresh(interval = 1000) {
  // 清除现有定时器
  if (window.dataRefreshTimer) {
    clearInterval(window.dataRefreshTimer);
    window.dataRefreshTimer = null;
  }
  
  // 确保轮询间隔至少为500毫秒
  const pollingInterval = Math.max(500, interval);
  
  // 设置新的定时器
  window.dataRefreshTimer = setInterval(async () => {
    // 检查连接和轮询状态
    if (!isConnected()) {
      console.log('连接已断开，停止轮询');
      clearInterval(window.dataRefreshTimer);
      window.dataRefreshTimer = null;
      updatePollingStatus(false);
      return;
    }
    
    if (!isPolling()) {
      console.log('轮询已停止');
      clearInterval(window.dataRefreshTimer);
      window.dataRefreshTimer = null;
      return;
    }
    
    // 执行数据更新 - 传入true作为第二个参数强制更新显示
    try {
      await loadDataValues(false, true);
    } catch (err) {
      console.error('数据刷新失败:', err);
      
      // 计数连续失败次数（用于判断是否需要自动重连）
      window.dataRefreshErrorCount = (window.dataRefreshErrorCount || 0) + 1;
      
      // 如果连续失败超过阈值，尝试重新建立连接
      if (window.dataRefreshErrorCount >= 3) {
        console.warn(`数据刷新连续失败${window.dataRefreshErrorCount}次，可能需要重新连接`);
        showError(`数据轮询连续${window.dataRefreshErrorCount}次失败，请检查网络或服务器状态`);
      }
    }
  }, pollingInterval);
  
  console.log(`已设置数据刷新定时器，间隔: ${pollingInterval}ms`);
}

// 改进通用错误处理函数
function handleApiError(error, context = '') {
  console.error(`${context ? context + ': ' : ''}`, error);
  
  let errorMessage = error.message || '未知错误';
  
  // 处理常见网络错误
  if (error.message && error.message.includes('ERR_CONNECTION_REFUSED')) {
    errorMessage = '无法连接到服务器，请确保Modbus服务已启动';
    updateConnectionStatus(false, '服务器连接失败', 'error');
  } 
  // 超时错误
  else if (error.message && error.message.includes('timeout')) {
    errorMessage = '服务器响应超时，请检查网络连接';
  }
  // 服务器错误
  else if (error.status >= 500) {
    errorMessage = `服务器错误 (${error.status}): ${error.message}`;
  }
  
  // 显示错误消息
  showError(errorMessage);
  
  // 记录错误事件，便于调试
  if (window.errorEvents) {
    window.errorEvents.push({
      timestamp: new Date().toISOString(),
      context,
      message: errorMessage,
      originalError: error.toString()
    });
  } else {
    window.errorEvents = [{
      timestamp: new Date().toISOString(),
      context,
      message: errorMessage,
      originalError: error.toString()
    }];
  }
}

// 检查数据点是否有变化
function hasDataChanged(oldData, newData) {
  // 如果没有旧数据，则认为是有变化的
  if (!oldData) {
    console.log('数据变化检测: 没有历史数据，判定为有变化');
    return true;
  }
  
  // 比较值是否发生变化
  if (oldData.value !== newData.value) {
    console.log(`数据变化检测: 值已变化，旧值=${oldData.value}，新值=${newData.value}`);
    return true;
  }
  
  // 比较事务ID是否发生变化
  if (oldData.transactionId !== newData.transactionId) {
    console.log(`数据变化检测: 事务ID已变化，旧事务ID=${oldData.transactionId}，新事务ID=${newData.transactionId}`);
    return true;
  }
  
  // 比较原始值是否发生变化
  if (oldData.rawValue && newData.rawValue) {
    const oldRawStr = JSON.stringify(oldData.rawValue);
    const newRawStr = JSON.stringify(newData.rawValue);
    if (oldRawStr !== newRawStr) {
      console.log(`数据变化检测: 原始值已变化，旧原始值=${oldRawStr}，新原始值=${newRawStr}`);
      return true;
    }
  }
  
  // 所有检查都通过，认为数据没有变化
  return false;
}

// 加载所有数据点的当前值
async function loadDataValues(forceLoad = false, forceUpdate = false) {
  try {
    console.log(`===== 前端loadDataValues 开始 =====`);
    console.log(`- 时间: ${new Date().toISOString()}`);
    console.log(`- 参数: forceLoad=${forceLoad}, forceUpdate=${forceUpdate}`);
    
    // 检查连接状态
    const connected = isConnected();
    console.log(`- 连接状态: ${connected ? '已连接' : '未连接'}`);
    
    if (!connected && !forceLoad) {
      console.log('未连接，跳过数据加载');
      return { success: false, reason: 'notConnected' };
    }
    
    // 获取数据点值
    console.log(`请求数据点值: GET ${API_BASE_URL}/values${forceLoad ? ' (强制加载)' : ''}`);
    const startTime = Date.now();
    const response = await fetch(`${API_BASE_URL}/values`);
    console.log(`- API响应耗时: ${Date.now() - startTime}ms, 状态码: ${response.status}`);
    
    if (!response.ok) {
      throw new Error(`获取数据点值失败: HTTP ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.success) {
      // 记录API返回的数据结构信息
      const dataPoints = result.data || {};
      const dataKeys = Object.keys(dataPoints);
      const meta = {
        count: dataKeys.length,
        withTransactionIds: dataKeys.filter(key => dataPoints[key].transactionId !== undefined).length,
        withRawValues: dataKeys.filter(key => dataPoints[key].rawValue !== undefined).length,
        timestamp: new Date().toISOString()
      };
      
      console.log(`- 收到数据点值: ${dataKeys.length}个, 具有事务ID: ${meta.withTransactionIds}个, 具有原始值: ${meta.withRawValues}个`);
      
      // 跟踪变化的数据点数量
      let changedCount = 0;
      let sameCount = 0;
      let forceUpdatedCount = 0;
      
      // 获取上一次的数据值（如果有），用于比较变化
      const lastValues = window.lastDataValues || {};
      
      // 如果是强制更新，则清除上次的值
      if (forceUpdate) {
        console.log('- 强制更新模式，忽略历史值比较');
        window.lastDataValues = null;
      }
      
      // 遍历所有数据点，更新显示
      for (const key in dataPoints) {
        const dataValue = dataPoints[key];
        const lastValue = lastValues[key];
        
        // 检查数据是否有变化，或者是否需要强制更新
        const hasChanged = hasDataChanged(lastValue, dataValue);
        const needsUpdate = forceUpdate || hasChanged;
        
        if (needsUpdate) {
          if (forceUpdate && !hasChanged) {
            forceUpdatedCount++;
            console.log(`- 数据点 ${key} 无变化但被强制更新`);
          } else {
            changedCount++;
            console.log(`- 数据点 ${key} 有变化，将被更新`);
          }
          
          // 更新DOM元素显示
          updateDataPointDisplay(key, dataValue);
        } else {
          sameCount++;
          console.log(`- 数据点 ${key} 没有变化`);
        }
      }
      
      // 更新最后获取的值，用于下次比较
      window.lastDataValues = result.data;
      
      console.log(`- 数据更新完成: ${changedCount}个有变化, ${sameCount}个无变化, ${forceUpdatedCount}个强制更新`);
      
      // 添加元数据并返回结果
      return {
        success: true,
        data: result.data,
        meta: meta,
        dataItemCount: dataKeys.length,
        changedCount: changedCount,
        sameCount: sameCount,
        forceUpdatedCount: forceUpdatedCount
      };
    } else {
      console.error(`- API返回错误: ${result.error || '未知错误'}`);
      showError(`获取数据失败: ${result.error || '未知错误'}`);
      return {
        success: false,
        error: result.error,
        details: result
      };
    }
  } catch (error) {
    console.error(`===== loadDataValues 出错: ${error.message} =====`);
    showError(`获取数据失败: ${error.message}`);
    
    // 增加错误计数
    window.dataRefreshErrorCount = (window.dataRefreshErrorCount || 0) + 1;
    
    return {
      success: false,
      error: error.message
    };
  }
}

// 更新数据值显示
function updateDataValues(values, forceUpdate = false) {
  console.log('收到数据值更新:', values);
  
  // 防止没有值时的处理
  if (!values || Object.keys(values).length === 0) {
    console.log('没有数据值可更新');
    return;
  }
  
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
        } else {
          // 普通值 - 优先使用formatted，如果没有则显示原始值
          newContent = dataValue.formatted || 
                      (dataValue.value !== undefined ? String(dataValue.value) : '无数据');
        }
      }
      
      // 输出调试信息
      console.log(`${dp.name}: 旧值="${oldContent}", 新值="${newContent}"`);
      
      // 只有强制更新或内容变化时才更新DOM
      if (forceUpdate || newContent !== oldContent) {
        if (forceUpdate) {
          console.log(`${dp.name}: 强制更新显示`);
        } else {
          console.log(`${dp.name}: 值已变化，更新显示`);
        }
        
        if (newContent.includes('<')) {
          valueElement.innerHTML = newContent;
        } else {
          valueElement.innerText = newContent;
        }
        
        // 添加短暂高亮效果
        valueElement.classList.add('highlight-update');
        setTimeout(() => {
          valueElement.classList.remove('highlight-update');
        }, 1000);
      } else {
        console.log(`${dp.name}: 值未变化，跳过更新`);
      }
      
      // 更新时间戳 - 总是更新时间戳以反映最新的刷新时间
      if (dataValue.timestamp) {
        const date = new Date(dataValue.timestamp);
        const formattedTime = formatDateTime(date);
        
        console.log(`${dp.name}: 更新时间戳 -> ${formattedTime}`);
        timestampElement.innerText = formattedTime;
      } else {
        // 如果没有时间戳，显示当前时间
        const now = new Date();
        const formattedTime = formatDateTime(now);
        console.log(`${dp.name}: 使用当前时间 -> ${formattedTime}`);
        timestampElement.innerText = formattedTime;
      }
    } else {
      console.log(`数据中没有 ${dp.name} 的值`);
    }
  });
}

// ===================== 辅助函数 =====================

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

// 更新连接状态显示
function updateConnectionStatus(connected, statusMessage = '', severityLevel = 'success') {
  // 更新全局连接状态
  window.modbusConnected = connected;
  
  // 获取所有可能的状态显示元素
  const badges = document.querySelectorAll("#connection-badge");
  const connectBtns = document.querySelectorAll("#connectBtn, #toggle-connection-btn");
  
  // 更新所有状态标签
  badges.forEach(badge => {
    if (badge) {
      badge.innerHTML = connected ? (statusMessage || '已连接') : (statusMessage || '未连接');
      
      // 清除所有现有类
      badge.className = 'badge';
      
      if (connected) {
        badge.classList.add('bg-success');
      } else {
        // 根据严重程度设置不同的样式
        if (severityLevel === 'warning') {
          badge.classList.add('bg-warning', 'text-dark');
        } else if (severityLevel === 'error') {
          badge.classList.add('bg-danger');
        } else {
          badge.classList.add('bg-secondary');
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
  
  // 更新所有轮询按钮
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

// 格式化日期时间
function formatDateTime(date) {
  return `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())} ${padZero(date.getHours())}:${padZero(date.getMinutes())}:${padZero(date.getSeconds())}`;
}

// 数字补零
function padZero(num) {
  return String(num).padStart(2, '0');
}

// 显示加载指示器
function showLoader() {
  const loader = document.getElementById('globalLoader');
  if (loader) {
    loader.style.display = 'flex';
  }
}

// 隐藏加载指示器
function hideLoader() {
  const loader = document.getElementById('globalLoader');
  if (loader) {
    loader.style.display = 'none';
  }
}

// 显示错误信息
function showError(message, duration = 10000) {
  const container = document.getElementById('errorContainer');
  const textElement = document.getElementById('errorText');
  
  if (container && textElement) {
    textElement.innerText = message;
    container.style.display = 'block';
    container.classList.add('animate__animated', 'animate__fadeInDown');
    
    // 设置定时器自动关闭
    if (duration > 0) {
      window.errorTimeout = setTimeout(() => {
        hideError();
      }, duration);
    }
  } else {
    // 如果找不到错误容器，使用alert作为后备方案
    alert(`错误: ${message}`);
  }
}

// 隐藏错误信息
function hideError() {
  const container = document.getElementById('errorContainer');
  if (!container) return;
  
  container.classList.add('animate__fadeOutUp');
  
  // 动画结束后隐藏
  setTimeout(() => {
    container.style.display = 'none';
    container.classList.remove('animate__animated', 'animate__fadeInDown', 'animate__fadeOutUp');
  }, 500);
  
  // 清除任何已有定时器
  if (window.errorTimeout) {
    clearTimeout(window.errorTimeout);
    window.errorTimeout = null;
  }
}

// 添加CSS动画
const style = document.createElement('style');
style.innerHTML = `
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

// 添加强制刷新函数
function forceRefreshDataDisplay() {
  console.log('===== 强制刷新数据显示 =====');
  console.log('时间:', new Date().toISOString());
  
  // 清除上次比较用的数据值
  if (window.lastDataValues) {
    console.log('清除上次缓存的数据值:', Object.keys(window.lastDataValues).length, '项');
  }
  window.lastDataValues = null;
  
  // 显示加载指示器
  showLoader();
  
  // 执行数据刷新，同时传递forceLoad和forceUpdate参数都为true
  loadDataValues(true, true)
    .then((result) => {
      console.log('强制刷新完成，数据项数量:', result?.dataItemCount || '未知');
      hideLoader();
      showSuccess('数据已强制刷新');
      return result;
    })
    .catch(error => {
      console.error('强制刷新失败:', error);
      hideLoader();
      showError('强制刷新失败: ' + error.message);
    });
}

// 添加成功提示函数
function showSuccess(message, duration = 3000) {
  const container = document.getElementById('successContainer');
  const textElement = document.getElementById('successText');
  
  if (container && textElement) {
    textElement.innerText = message;
    container.style.display = 'block';
    container.classList.add('animate__animated', 'animate__fadeInDown');
    
    // 设置定时器自动关闭
    if (duration > 0) {
      window.successTimeout = setTimeout(() => {
        hideSuccess();
      }, duration);
    }
  } else {
    // 如果找不到成功提示容器，使用console
    console.log(`成功: ${message}`);
  }
}

// 隐藏成功提示
function hideSuccess() {
  const container = document.getElementById('successContainer');
  if (!container) return;
  
  container.classList.add('animate__fadeOutUp');
  
  // 动画结束后隐藏
  setTimeout(() => {
    container.style.display = 'none';
    container.classList.remove('animate__animated', 'animate__fadeInDown', 'animate__fadeOutUp');
  }, 500);
  
  // 清除任何已有定时器
  if (window.successTimeout) {
    clearTimeout(window.successTimeout);
    window.successTimeout = null;
  }
}

// 添加刷新按钮
function addRefreshButton() {
  // 检查页面中是否已有刷新按钮
  if (document.getElementById('refreshDataBtn')) {
    return; // 已存在，无需再添加
  }
  
  // 查找按钮组
  const btnGroups = document.querySelectorAll('.connection-controls, .modbus-controls');
  
  if (btnGroups.length > 0) {
    // 在第一个按钮组添加刷新按钮
    const btnGroup = btnGroups[0];
    
    // 创建刷新按钮
    const refreshBtn = document.createElement('button');
    refreshBtn.id = 'refreshDataBtn';
    refreshBtn.className = 'btn btn-info btn-sm ms-2';
    refreshBtn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> 强制刷新';
    refreshBtn.onclick = forceRefreshDataDisplay;
    
    // 添加按钮到控制区
    btnGroup.appendChild(refreshBtn);
    
    console.log('已添加强制刷新按钮');
  } else {
    console.log('未找到合适的控制区添加刷新按钮');
  }
}

// 设置自动刷新定时器
function setupAutoRefresh(interval = 5000) {
  // 清除现有定时器
  if (window.autoRefreshTimer) {
    clearInterval(window.autoRefreshTimer);
    window.autoRefreshTimer = null;
  }
  
  console.log(`设置自动强制刷新定时器，间隔: ${interval}ms`);
  
  // 创建新定时器
  window.autoRefreshTimer = setInterval(() => {
    // 只在已连接状态下执行
    if (isConnected()) {
      console.log('自动强制刷新触发...');
      // 直接加载最新数据并强制更新显示
      loadDataValues(true, true).catch(err => {
        console.warn('自动刷新失败:', err);
      });
    }
  }, interval);
}

// 添加诊断功能按钮
function addDiagnosticButton() {
  // 检查页面中是否已有诊断按钮
  if (document.getElementById('diagnosticBtn')) {
    return; // 已存在，无需再添加
  }
  
  // 查找按钮组
  const btnGroups = document.querySelectorAll('.connection-controls, .modbus-controls');
  
  if (btnGroups.length > 0) {
    // 在第一个按钮组添加诊断按钮
    const btnGroup = btnGroups[0];
    
    // 创建诊断按钮
    const diagnosticBtn = document.createElement('button');
    diagnosticBtn.id = 'diagnosticBtn';
    diagnosticBtn.className = 'btn btn-secondary btn-sm ms-2';
    diagnosticBtn.innerHTML = '<i class="bi bi-bug"></i> 诊断';
    diagnosticBtn.onclick = showDiagnosticInfo;
    
    // 添加按钮到控制区
    btnGroup.appendChild(diagnosticBtn);
    
    console.log('已添加诊断按钮');
  } else {
    console.log('未找到合适的控制区添加诊断按钮');
  }
}

// 显示诊断信息
async function showDiagnosticInfo() {
  console.log('获取诊断信息...');
  showLoader();
  
  try {
    // 获取诊断数据
    const response = await fetch(`${API_BASE_URL}/diagnostic`);
    
    if (!response.ok) {
      throw new Error(`获取诊断数据失败: HTTP ${response.status}`);
    }
    
    const result = await response.json();
    console.log('诊断数据:', result);
    
    if (result.success && result.data) {
      // 创建诊断模态框
      createDiagnosticModal(result.data);
    } else {
      throw new Error(result.error || '获取诊断数据失败');
    }
  } catch (error) {
    console.error('获取诊断信息失败:', error);
    showError('获取诊断信息失败: ' + error.message);
  } finally {
    hideLoader();
  }
}

// 创建诊断模态框
function createDiagnosticModal(data) {
  // 检查是否已有诊断模态框
  let modal = document.getElementById('diagnosticModal');
  
  // 如果没有，创建一个
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'diagnosticModal';
    modal.className = 'modal fade';
    modal.tabIndex = -1;
    modal.setAttribute('aria-labelledby', 'diagnosticModalLabel');
    modal.setAttribute('aria-hidden', 'true');
    
    document.body.appendChild(modal);
  }
  
  // 创建模态框内容
  const modalContent = `
    <div class="modal-dialog modal-xl modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="diagnosticModalLabel">Modbus系统诊断</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="关闭"></button>
        </div>
        <div class="modal-body">
          <div class="row mb-3">
            <div class="col-md-6">
              <div class="card">
                <div class="card-header">连接信息</div>
                <div class="card-body">
                  <p><strong>连接状态:</strong> ${data.connectionStatus.connected ? '<span class="text-success">已连接</span>' : '<span class="text-danger">未连接</span>'}</p>
                  <p><strong>主机地址:</strong> ${data.connectionStatus.config.host}:${data.connectionStatus.config.port}</p>
                  <p><strong>站号:</strong> ${data.connectionStatus.config.unitId}</p>
                  <p><strong>超时设置:</strong> ${data.connectionStatus.config.timeout}ms</p>
                  <p><strong>服务器时间:</strong> ${new Date(data.serverTime).toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div class="col-md-6">
              <div class="card">
                <div class="card-header">统计信息</div>
                <div class="card-body">
                  <p><strong>数据点总数:</strong> ${data.dataPointsCount}</p>
                  <p><strong>数据值总数:</strong> ${data.valuesCount}</p>
                  <p><strong>Modbus数据点数:</strong> ${data.modbusDataPointsCount}</p>
                  <p><strong>连接尝试次数:</strong> ${data.connectionStatus.details.reconnectAttempts}</p>
                  <p><strong>轮询状态:</strong> ${data.connectionStatus.details.pollingActive ? '活跃' : '未活跃'}</p>
                </div>
              </div>
            </div>
          </div>
          
          <h6>数据点详情</h6>
          <div class="table-responsive">
            <table class="table table-striped table-hover">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>地址</th>
                  <th>格式</th>
                  <th>当前值</th>
                  <th>原始值</th>
                  <th>事务ID</th>
                  <th>时间戳</th>
                </tr>
              </thead>
              <tbody>
                ${data.dataPointDetails.map(point => `
                  <tr>
                    <td>${point.name}</td>
                    <td>${point.address}</td>
                    <td>${point.format || '-'}</td>
                    <td>${point.currentValueFormatted || '-'}</td>
                    <td>${point.rawValue ? JSON.stringify(point.rawValue) : '-'}</td>
                    <td>${point.transactionId || '-'}</td>
                    <td>${point.timestamp ? new Date(point.timestamp).toLocaleString() : '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-primary" onclick="window.location.reload()">刷新页面</button>
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
        </div>
      </div>
    </div>
  `;
  
  // 设置模态框内容
  modal.innerHTML = modalContent;
  
  // 显示模态框
  const bootstrapModal = new bootstrap.Modal(modal);
  bootstrapModal.show();
}

// 在页面加载完成后添加诊断按钮
document.addEventListener('DOMContentLoaded', () => {
  // 延迟一秒添加诊断按钮，确保其他必要元素已加载
  setTimeout(() => {
    addDiagnosticButton();
  }, 1000);
});

// 更新单个数据点的显示
function updateDataPointDisplay(key, dataValue) {
  // 查找相关的DOM元素
  const dataDisplay = document.querySelector(`.modbus-data[data-name="${key}"]`);
  if (!dataDisplay) {
    console.log(`无法找到数据点 ${key} 的显示元素`);
    return;
  }
  
  // 更新值显示
  const valueElement = dataDisplay.querySelector('.modbus-value');
  if (valueElement) {
    // 使用格式化值（如果有）或数值
    valueElement.textContent = dataValue.formatted || dataValue.value || '无数据';
    
    // 设置更新动画
    valueElement.classList.add('updated');
    setTimeout(() => {
      valueElement.classList.remove('updated');
    }, 1500);
  }
  
  // 更新时间戳显示
  const timestampElement = dataDisplay.querySelector('.modbus-timestamp');
  if (timestampElement && dataValue.timestamp) {
    // 格式化时间戳为本地日期时间
    const date = new Date(dataValue.timestamp);
    const formattedTime = date.toLocaleTimeString();
    timestampElement.textContent = formattedTime;
    
    // 设置更新动画
    timestampElement.classList.add('updated');
    setTimeout(() => {
      timestampElement.classList.remove('updated');
    }, 1500);
  }
  
  // 添加事务ID显示（如果存在）
  const infoElement = dataDisplay.querySelector('.modbus-info');
  if (infoElement && dataValue.transactionId) {
    // 更新或创建事务ID显示
    let transactionElement = infoElement.querySelector('.transaction-id');
    if (!transactionElement) {
      transactionElement = document.createElement('span');
      transactionElement.className = 'transaction-id badge bg-secondary ms-1';
      infoElement.appendChild(transactionElement);
    }
    
    transactionElement.textContent = `#${dataValue.transactionId}`;
    
    // 设置更新动画
    transactionElement.classList.add('updated');
    setTimeout(() => {
      transactionElement.classList.remove('updated');
    }, 1500);
  }
  
  // 添加更新指示图标
  const updateIndicator = document.createElement('span');
  updateIndicator.className = 'update-indicator';
  updateIndicator.innerHTML = '<i class="bi bi-arrow-repeat text-success"></i>';
  dataDisplay.appendChild(updateIndicator);
  
  // 短暂显示更新指示器然后移除
  setTimeout(() => {
    updateIndicator.remove();
  }, 2000);
  
  // 记录更新
  console.log(`更新了数据点 ${key} 的显示: 值=${dataValue.value}, 事务ID=${dataValue.transactionId}`);
}
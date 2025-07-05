// 全局变量
let dataPoints = [];
let scheduledTasks = {};
let currentTask = null;

// 页面加载后执行
document.addEventListener('DOMContentLoaded', async function() {
  // 加载连接状态
  await loadConnectionStatus();
  
  // 加载数据点
  await loadDataPoints();
  
  // 初始化事件监听
  initEventListeners();
  
  // 加载定时任务列表
  await loadScheduledTasks();
});

// 初始化事件监听
function initEventListeners() {
  // 数据点选择变化时
  document.getElementById('dataPointSelect').addEventListener('change', function() {
    updateDataPointSelection(this);
  });
  
  // 任务模态框中的数据点选择变化时
  document.getElementById('taskDataPoint').addEventListener('change', function() {
    updateDataPointSelection(this, 'task');
  });
  
  // 写入按钮点击
  document.getElementById('writeButton').addEventListener('click', writeDataPointValue);
  
  // 创建任务按钮点击
  document.getElementById('createTaskBtn').addEventListener('click', function() {
    openTaskModal();
  });
  
  // 保存任务按钮点击
  document.getElementById('saveTaskBtn').addEventListener('click', saveTask);
  
  // 模态框关闭时重置表单
  document.getElementById('taskModal').addEventListener('hidden.bs.modal', function() {
    document.getElementById('taskForm').reset();
    document.getElementById('taskId').value = '';
    currentTask = null;
    
    // 隐藏位位置输入
    document.getElementById('taskBitPositionContainer').classList.add('d-none');
    
    // 重置标题
    document.getElementById('taskModalTitle').textContent = '创建定时写入任务';
  });
}

// 更新数据点选择后的相关显示
function updateDataPointSelection(selectElement, prefix = '') {
  const selectedOption = selectElement.options[selectElement.selectedIndex];
  if (!selectedOption.value) return;
  
  const format = selectedOption.dataset.format;
  const bitPosition = selectedOption.dataset.bitPosition;
  
  // 前缀用于区分不同表单中的元素
  const formatHelpId = prefix ? `${prefix}FormatHelp` : 'formatHelpText';
  const bitPositionContainerId = prefix ? `${prefix}BitPositionContainer` : 'bitPositionContainer';
  const bitPositionInputId = prefix ? `${prefix}BitPosition` : 'bitPositionInput';
  
  // 更新格式提示
  updateFormatHelp(format, formatHelpId);
  
  // 显示或隐藏位位置输入
  const bitPositionContainer = document.getElementById(bitPositionContainerId);
  if (format === 'BIT') {
    bitPositionContainer.classList.remove('d-none');
    if (bitPosition) {
      document.getElementById(bitPositionInputId).value = bitPosition;
    }
  } else {
    bitPositionContainer.classList.add('d-none');
  }
}

// 加载连接状态
async function loadConnectionStatus() {
  try {
    const response = await axios.get('/api/modbus/connection');
    
    if (response.data.success) {
      const status = response.data.data;
      const connected = status.connected;
      
      const connectionStatusElement = document.getElementById('connectionStatus');
      
      if (connected) {
        connectionStatusElement.textContent = '已连接';
        connectionStatusElement.className = 'connection-status status-connected';
      } else {
        connectionStatusElement.textContent = '未连接';
        connectionStatusElement.className = 'connection-status status-disconnected';
      }
    }
  } catch (error) {
    console.error('加载连接状态失败:', error);
    document.getElementById('connectionStatus').textContent = '状态未知';
  }
}

// 加载数据点
async function loadDataPoints() {
  try {
    showLoader();
    const response = await axios.get('/api/modbus/datapoints');
    hideLoader();
    
    if (response.data && Array.isArray(response.data)) {
      dataPoints = response.data;
      
      // 填充数据点选择下拉框
      fillDataPointSelect('dataPointSelect');
      fillDataPointSelect('taskDataPoint');
    } else {
      showError('加载数据点失败: 响应格式错误');
    }
  } catch (error) {
    hideLoader();
    console.error('加载数据点失败:', error);
    showError('加载数据点失败: ' + (error.response?.data?.error || error.message));
  }
}

// 填充数据点选择下拉框
function fillDataPointSelect(selectId) {
  const select = document.getElementById(selectId);
  select.innerHTML = '<option value="">请选择数据点...</option>';
  
  dataPoints.forEach(dp => {
    // 跳过只读数据点
    if (dp.accessMode === 'read') {
      return;
    }
    
    const option = document.createElement('option');
    option.value = dp.identifier;
    option.textContent = `${dp.name} (${dp.address})`;
    option.dataset.format = dp.format || 'UINT16';
    
    if (dp.format === 'BIT' && dp.bitPosition !== undefined) {
      option.dataset.bitPosition = dp.bitPosition;
    }
    
    select.appendChild(option);
  });
}

// 获取数据点信息
function getDataPointByIdentifier(identifier) {
  return dataPoints.find(dp => dp.identifier === identifier);
}

// 获取当前选择的数据点名称
function getSelectedDataPointName(selectId = 'dataPointSelect') {
  const select = document.getElementById(selectId);
  return select.options[select.selectedIndex] ? select.options[select.selectedIndex].textContent : '未知数据点';
}

// 更新格式帮助提示
function updateFormatHelp(format, elementId = 'formatHelpText') {
  const helpText = document.getElementById(elementId);
  
  switch (format) {
    case 'BIT':
      helpText.textContent = '位值，请输入0或1';
      break;
    case 'INT16':
      helpText.textContent = '有符号16位整数 (-32768 到 32767)';
      break;
    case 'UINT16':
      helpText.textContent = '无符号16位整数 (0 到 65535)';
      break;
    case 'INT32':
      helpText.textContent = '有符号32位整数 (-2147483648 到 2147483647)';
      break;
    case 'UINT32':
      helpText.textContent = '无符号32位整数 (0 到 4294967295)';
      break;
    default:
      helpText.textContent = '';
  }
}

// 解析值
function parseValue(value) {
  // 尝试将值转换为数字
  if (value === 'true' || value === 'false') {
    return value === 'true' ? 1 : 0;
  }
  
  const numValue = Number(value);
  if (isNaN(numValue)) {
    throw new Error('无法解析为数字');
  }
  
  return numValue;
}

// 写入数据点值
async function writeDataPointValue() {
  try {
    // 获取输入值
    const select = document.getElementById('dataPointSelect');
    const identifier = select.value;
    const value = document.getElementById('dataValueInput').value.trim();
    
    // 验证输入
    if (!identifier) {
      showError('请选择数据点');
      return;
    }
    
    if (!value) {
      showError('请输入要写入的值');
      return;
    }
    
    // 解析值
    let parsedValue;
    
    try {
      parsedValue = parseValue(value);
    } catch (parseError) {
      showError(`值格式错误: ${parseError.message}`);
      return;
    }
    
    // 获取数据点信息
    const selectedOption = select.options[select.selectedIndex];
    const format = selectedOption.dataset.format;
    
    // 准备请求数据
    const requestData = {
      identifier: identifier,
      value: parsedValue
    };
    
    // 对于BIT格式，添加位位置信息
    if (format === 'BIT') {
      const bitPosition = parseInt(document.getElementById('bitPositionInput').value, 10);
      requestData.bitPosition = bitPosition;
    }
    
    // 发送写入请求
    showLoader();
    const startTime = Date.now();
    const response = await axios.post('/api/modbus/write', requestData);
    const responseTime = Date.now() - startTime;
    hideLoader();
    
    if (response.data.success) {
      // 显示成功信息
      const resultElement = document.getElementById('writeResult');
      resultElement.className = 'alert alert-success mt-3';
      resultElement.innerHTML = `
        <i class="bi bi-check-circle"></i> 
        写入成功 (${responseTime}ms)
        <div class="mt-2 small">
          数据点: ${getSelectedDataPointName()}<br>
          写入值: ${parsedValue}<br>
          时间戳: ${new Date().toLocaleString()}
        </div>
      `;
      resultElement.classList.remove('d-none');
      
      // 清空输入
      document.getElementById('dataValueInput').value = '';
    }
  } catch (error) {
    hideLoader();
    console.error('写入失败:', error);
    
    // 显示错误信息
    const resultElement = document.getElementById('writeResult');
    resultElement.className = 'alert alert-danger mt-3';
    
    let errorMessage = '写入失败';
    if (error.response) {
      errorMessage = error.response.data.error || error.response.data.message || '未知错误';
    } else {
      errorMessage = error.message;
    }
    
    resultElement.innerHTML = `
      <i class="bi bi-exclamation-triangle"></i> 
      ${errorMessage}
    `;
    resultElement.classList.remove('d-none');
  }
}

// 加载定时任务列表
async function loadScheduledTasks() {
  try {
    showLoader();
    const response = await axios.get('/api/scheduled-write/tasks');
    hideLoader();
    
    if (response.data.success) {
      scheduledTasks = response.data.data || {};
      renderScheduledTasks();
    } else {
      console.error('加载定时任务失败:', response.data.error);
    }
  } catch (error) {
    hideLoader();
    console.error('加载定时任务失败:', error);
  }
}

// 渲染定时任务列表
function renderScheduledTasks() {
  const container = document.getElementById('scheduledTasksList');
  const noTasksMessage = document.getElementById('noTasksMessage');
  
  // 如果没有任务，显示提示信息
  if (Object.keys(scheduledTasks).length === 0) {
    noTasksMessage.classList.remove('d-none');
    container.innerHTML = '';
    return;
  }
  
  // 隐藏无任务提示
  noTasksMessage.classList.add('d-none');
  
  // 构建任务列表HTML
  let html = '';
  
  for (const [taskId, task] of Object.entries(scheduledTasks)) {
    const dataPoint = getDataPointByIdentifier(task.identifier);
    const dataPointName = dataPoint ? dataPoint.name : task.identifier;
    const lastRunTime = task.lastRun ? new Date(task.lastRun).toLocaleString() : '从未运行';
    const statusClass = task.active ? 'active' : 'inactive';
    
    html += `
      <div class="scheduled-task-item ${statusClass}" data-task-id="${taskId}">
        <div class="d-flex justify-content-between align-items-start">
          <div>
            <h6 class="mb-1">${task.name}</h6>
            <div class="small mb-1">
              <span class="badge bg-secondary task-badge">
                <i class="bi bi-hash"></i> ${dataPointName}
              </span>
              <span class="badge bg-secondary task-badge">
                <i class="bi bi-clock"></i> <span class="cron-expression">${task.cronExpression}</span>
              </span>
              <span class="badge ${task.active ? 'bg-success' : 'bg-secondary'} task-badge">
                ${task.active ? '已启用' : '已禁用'}
              </span>
            </div>
            ${task.description ? `<div class="small text-muted mb-1">${task.description}</div>` : ''}
            <div class="small text-muted">
              值: ${task.value}
              ${task.bitPosition !== undefined ? `(位置: ${task.bitPosition})` : ''}
            </div>
            <div class="small text-muted">上次执行: ${lastRunTime}</div>
            ${task.lastError ? 
              `<div class="small text-danger mt-1">
                <i class="bi bi-exclamation-triangle"></i> 
                ${task.lastError.message || '执行失败'}
              </div>` : ''}
          </div>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary task-edit" data-task-id="${taskId}" title="编辑">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-outline-secondary task-state" data-task-id="${taskId}" title="${task.active ? '停用' : '启用'}">
              <i class="bi ${task.active ? 'bi-pause' : 'bi-play'}"></i>
            </button>
            <button class="btn btn-outline-success task-execute" data-task-id="${taskId}" title="立即执行">
              <i class="bi bi-lightning"></i>
            </button>
            <button class="btn btn-outline-danger task-delete" data-task-id="${taskId}" title="删除">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }
  
  container.innerHTML = html;
  
  // 添加按钮事件监听
  document.querySelectorAll('.task-edit').forEach(btn => {
    btn.addEventListener('click', function() {
      const taskId = this.dataset.taskId;
      editTask(taskId);
    });
  });
  
  document.querySelectorAll('.task-state').forEach(btn => {
    btn.addEventListener('click', function() {
      const taskId = this.dataset.taskId;
      toggleTaskState(taskId);
    });
  });
  
  document.querySelectorAll('.task-execute').forEach(btn => {
    btn.addEventListener('click', function() {
      const taskId = this.dataset.taskId;
      executeTask(taskId);
    });
  });
  
  document.querySelectorAll('.task-delete').forEach(btn => {
    btn.addEventListener('click', function() {
      const taskId = this.dataset.taskId;
      deleteTask(taskId);
    });
  });
}

// 打开任务模态框
function openTaskModal(taskId = null) {
  const modal = new bootstrap.Modal(document.getElementById('taskModal'));
  
  if (taskId) {
    // 编辑现有任务
    currentTask = scheduledTasks[taskId];
    document.getElementById('taskModalTitle').textContent = '编辑定时写入任务';
    document.getElementById('taskId').value = taskId;
    
    // 填充表单
    document.getElementById('taskName').value = currentTask.name || '';
    document.getElementById('taskDescription').value = currentTask.description || '';
    document.getElementById('taskCronExpression').value = currentTask.cronExpression || '';
    document.getElementById('taskValue').value = currentTask.value !== undefined ? currentTask.value : '';
    document.getElementById('taskActive').checked = !!currentTask.active;
    
    // 设置数据点选择
    const taskDataPointSelect = document.getElementById('taskDataPoint');
    for (let i = 0; i < taskDataPointSelect.options.length; i++) {
      if (taskDataPointSelect.options[i].value === currentTask.identifier) {
        taskDataPointSelect.selectedIndex = i;
        break;
      }
    }
    
    // 更新格式提示和位位置输入
    updateDataPointSelection(taskDataPointSelect, 'task');
    
    // 如果有位位置信息，设置位位置输入
    if (currentTask.bitPosition !== undefined) {
      document.getElementById('taskBitPosition').value = currentTask.bitPosition;
    }
  }
  
  modal.show();
}

// 保存任务
async function saveTask() {
  try {
    // 获取表单数据
    const taskId = document.getElementById('taskId').value;
    const name = document.getElementById('taskName').value;
    const description = document.getElementById('taskDescription').value;
    const identifier = document.getElementById('taskDataPoint').value;
    const cronExpression = document.getElementById('taskCronExpression').value;
    const value = document.getElementById('taskValue').value;
    const active = document.getElementById('taskActive').checked;
    
    // 验证必填字段
    if (!name || !identifier || !cronExpression || value === '') {
      alert('请填写所有必填字段');
      return;
    }
    
    // 解析值
    let parsedValue;
    try {
      parsedValue = parseValue(value);
    } catch (parseError) {
      alert(`值格式错误: ${parseError.message}`);
      return;
    }
    
    // 准备请求数据
    const taskData = {
      name,
      description,
      identifier,
      cronExpression,
      value: parsedValue,
      active
    };
    
    // 检查是否需要添加位位置
    const dataPointSelect = document.getElementById('taskDataPoint');
    const selectedOption = dataPointSelect.options[dataPointSelect.selectedIndex];
    
    if (selectedOption.dataset.format === 'BIT') {
      const bitPosition = parseInt(document.getElementById('taskBitPosition').value, 10);
      taskData.bitPosition = bitPosition;
    }
    
    showLoader();
    
    let response;
    if (taskId) {
      // 更新现有任务
      response = await axios.put(`/api/scheduled-write/tasks/${taskId}`, taskData);
    } else {
      // 创建新任务
      response = await axios.post('/api/scheduled-write/tasks', taskData);
    }
    
    hideLoader();
    
    if (response.data.success) {
      // 关闭模态框
      bootstrap.Modal.getInstance(document.getElementById('taskModal')).hide();
      
      // 重新加载定时任务列表
      await loadScheduledTasks();
      
      // 显示成功消息
      showToast(taskId ? '任务已更新' : '任务已创建', 'success');
    } else {
      alert(`保存失败: ${response.data.error || '未知错误'}`);
    }
  } catch (error) {
    hideLoader();
    console.error('保存任务失败:', error);
    alert(`保存失败: ${error.response?.data?.error || error.message || '未知错误'}`);
  }
}

// 编辑任务
function editTask(taskId) {
  openTaskModal(taskId);
}

// 切换任务状态
async function toggleTaskState(taskId) {
  try {
    const task = scheduledTasks[taskId];
    if (!task) return;
    
    showLoader();
    
    const response = await axios.post(`/api/scheduled-write/tasks/${taskId}/${task.active ? 'stop' : 'start'}`);
    
    hideLoader();
    
    if (response.data.success) {
      // 更新任务状态
      scheduledTasks[taskId] = response.data.data;
      
      // 重新渲染任务列表
      renderScheduledTasks();
      
      // 显示成功消息
      showToast(`任务已${task.active ? '停用' : '启用'}`, 'success');
    } else {
      alert(`操作失败: ${response.data.error || '未知错误'}`);
    }
  } catch (error) {
    hideLoader();
    console.error('切换任务状态失败:', error);
    alert(`操作失败: ${error.response?.data?.error || error.message || '未知错误'}`);
  }
}

// 立即执行任务
async function executeTask(taskId) {
  try {
    const task = scheduledTasks[taskId];
    if (!task) return;
    
    // 确认执行
    if (!confirm(`确定要立即执行 "${task.name}" 任务吗？将写入值 ${task.value} 到数据点 ${task.identifier}`)) {
      return;
    }
    
    showLoader();
    
    const response = await axios.post(`/api/scheduled-write/tasks/${taskId}/execute`);
    
    hideLoader();
    
    if (response.data.success) {
      // 更新任务执行时间
      scheduledTasks[taskId].lastRun = response.data.data.executionTime;
      
      // 重新渲染任务列表
      renderScheduledTasks();
      
      // 显示成功消息
      showToast('任务已执行', 'success');
    } else {
      alert(`执行失败: ${response.data.error || '未知错误'}`);
    }
  } catch (error) {
    hideLoader();
    console.error('执行任务失败:', error);
    alert(`执行失败: ${error.response?.data?.error || error.message || '未知错误'}`);
  }
}

// 删除任务
async function deleteTask(taskId) {
  try {
    const task = scheduledTasks[taskId];
    if (!task) return;
    
    // 确认删除
    if (!confirm(`确定要删除 "${task.name}" 任务吗？此操作不可恢复！`)) {
      return;
    }
    
    showLoader();
    
    const response = await axios.delete(`/api/scheduled-write/tasks/${taskId}`);
    
    hideLoader();
    
    if (response.data.success) {
      // 删除本地任务对象
      delete scheduledTasks[taskId];
      
      // 重新渲染任务列表
      renderScheduledTasks();
      
      // 显示成功消息
      showToast('任务已删除', 'success');
    } else {
      alert(`删除失败: ${response.data.error || '未知错误'}`);
    }
  } catch (error) {
    hideLoader();
    console.error('删除任务失败:', error);
    alert(`删除失败: ${error.response?.data?.error || error.message || '未知错误'}`);
  }
}

// 显示加载器
function showLoader() {
  document.getElementById('loaderContainer').style.display = 'flex';
}

// 隐藏加载器
function hideLoader() {
  document.getElementById('loaderContainer').style.display = 'none';
}

// 显示错误信息
function showError(message) {
  const resultElement = document.getElementById('writeResult');
  resultElement.className = 'alert alert-danger mt-3';
  resultElement.innerHTML = `<i class="bi bi-exclamation-triangle"></i> ${message}`;
  resultElement.classList.remove('d-none');
}

// 显示Toast通知
function showToast(message, type = 'info') {
  // 创建toast容器 (如果不存在)
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    document.body.appendChild(toastContainer);
  }
  
  // 创建bootstrap toast
  const toastId = `toast-${Date.now()}`;
  const bgClass = type === 'success' ? 'bg-success' : 
                  type === 'error' ? 'bg-danger' : 
                  type === 'warning' ? 'bg-warning' : 'bg-info';
  
  const toastHtml = `
    <div id="${toastId}" class="toast" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="toast-header ${bgClass} text-white">
        <strong class="me-auto">通知</strong>
        <small>${new Date().toLocaleTimeString()}</small>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="关闭"></button>
      </div>
      <div class="toast-body">
        ${message}
      </div>
    </div>
  `;
  
  toastContainer.insertAdjacentHTML('beforeend', toastHtml);
  
  // 显示toast
  const toastElement = document.getElementById(toastId);
  const toast = new bootstrap.Toast(toastElement, { delay: 3000 });
  
  toast.show();
  
  // 自动删除
  toastElement.addEventListener('hidden.bs.toast', function() {
    this.remove();
  });
} 
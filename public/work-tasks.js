/**
 * 工作内容管理前端脚本
 */
document.addEventListener('DOMContentLoaded', function() {
  // 初始化日期选择器
  const datePicker = flatpickr('#datePicker', {
    locale: 'zh',
    dateFormat: 'Y-m-d',
    defaultDate: new Date(),
    onChange: function(selectedDates, dateStr) {
      loadDailyPlan(dateStr);
    }
  });

  // 初始化时间选择器
  flatpickr('#startTime, #regularStartTime', {
    enableTime: true,
    noCalendar: true,
    dateFormat: 'H:i',
    time_24hr: true
  });

  // 初始化任务日期选择器
  flatpickr('#taskDate', {
    locale: 'zh',
    dateFormat: 'Y-m-d',
    defaultDate: new Date()
  });

  // 初始化自定义日期选择器
  flatpickr('#customDates', {
    locale: 'zh',
    dateFormat: 'Y-m-d',
    mode: 'multiple'
  });

  // 生成月份天数选项
  for (let i = 1; i <= 31; i++) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = i + '日';
    document.getElementById('monthDay').appendChild(option);
  }

  // 导航切换
  document.querySelectorAll('#nav-daily, #nav-regular, #nav-temporary').forEach(nav => {
    nav.addEventListener('click', function(e) {
      e.preventDefault();
      
      // 更新导航状态
      document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
      this.classList.add('active');
      
      // 显示对应视图
      document.querySelectorAll('.view-container').forEach(view => view.classList.add('d-none'));
      
      if (this.id === 'nav-daily') {
        document.getElementById('dailyView').classList.remove('d-none');
        loadDailyPlan(datePicker.selectedDates[0] ? formatDate(datePicker.selectedDates[0]) : formatDate(new Date()));
      } else if (this.id === 'nav-regular') {
        document.getElementById('regularView').classList.remove('d-none');
        loadRegularTasks();
      } else if (this.id === 'nav-temporary') {
        document.getElementById('temporaryView').classList.remove('d-none');
        loadTemporaryTasks();
      }
    });
  });

  // 今日按钮点击事件
  document.getElementById('btnToday').addEventListener('click', function() {
    const today = new Date();
    datePicker.setDate(today);
    loadDailyPlan(formatDate(today));
  });

  // 刷新按钮点击事件
  document.getElementById('btnRefresh').addEventListener('click', function() {
    const activeView = document.querySelector('.view-container:not(.d-none)').id;
    
    if (activeView === 'dailyView') {
      loadDailyPlan(datePicker.selectedDates[0] ? formatDate(datePicker.selectedDates[0]) : formatDate(new Date()));
    } else if (activeView === 'regularView') {
      loadRegularTasks();
    } else if (activeView === 'temporaryView') {
      loadTemporaryTasks();
    }
  });

  // 添加工作按钮点击事件
  document.getElementById('btnAddTask').addEventListener('click', function() {
    resetTaskForm();
    
    // 根据当前视图设置默认任务类型
    const activeView = document.querySelector('.view-container:not(.d-none)').id;
    if (activeView === 'regularView') {
      document.getElementById('typeRegular').checked = true;
      toggleTaskFields('regular');
    } else {
      document.getElementById('typeTemporary').checked = true;
      toggleTaskFields('temporary');
    }
    
    // 设置任务日期为当前选择的日期
    if (activeView === 'dailyView' || activeView === 'temporaryView') {
      document.getElementById('taskDate').value = datePicker.selectedDates[0] 
        ? formatDate(datePicker.selectedDates[0]) 
        : formatDate(new Date());
    }
    
    document.getElementById('taskModalTitle').textContent = '添加工作内容';
    const taskModal = new bootstrap.Modal(document.getElementById('taskModal'));
    taskModal.show();
  });

  // 工作类型切换事件
  document.querySelectorAll('input[name="taskTypeRadio"]').forEach(radio => {
    radio.addEventListener('change', function() {
      toggleTaskFields(this.value);
    });
  });

  // 周期类型切换事件
  document.getElementById('cycleType').addEventListener('change', function() {
    toggleCycleOptions(this.value);
  });

  // 保存任务按钮点击事件
  document.getElementById('btnSaveTask').addEventListener('click', function() {
    saveTask();
  });

  // 确认删除按钮点击事件
  document.getElementById('btnConfirmDelete').addEventListener('click', function() {
    const taskId = this.getAttribute('data-task-id');
    const taskType = this.getAttribute('data-task-type');
    
    if (taskId && taskType) {
      deleteTask(taskId, taskType);
    }
  });
  
  // 获取同步配置状态
  loadSyncStatus();
  
  // 保存同步配置按钮点击事件
  document.getElementById('btnSaveSync').addEventListener('click', function() {
    saveSyncConfig();
  });
  
  // 手动同步按钮点击事件
  document.getElementById('btnManualSync').addEventListener('click', function() {
    manualSync();
  });

  // 加载初始数据
  loadDailyPlan(formatDate(new Date()));
});

// 格式化日期为YYYY-MM-DD
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 格式化时间显示
function formatTime(timeStr) {
  if (!timeStr) return '';
  
  // 如果时间格式为HH:MM:SS，去掉秒
  if (timeStr.length === 8) {
    return timeStr.substring(0, 5);
  }
  
  return timeStr;
}

// 切换任务字段显示
function toggleTaskFields(taskType) {
  document.getElementById('taskType').value = taskType;
  
  if (taskType === 'temporary') {
    document.getElementById('temporaryFields').classList.remove('d-none');
    document.getElementById('regularFields').classList.add('d-none');
  } else {
    document.getElementById('temporaryFields').classList.add('d-none');
    document.getElementById('regularFields').classList.remove('d-none');
  }
}

// 切换周期选项显示
function toggleCycleOptions(cycleType) {
  // 隐藏所有周期选项
  document.querySelectorAll('#cycleDailyOptions, #cycleWeeklyOptions, #cycleMonthlyOptions, #cycleCustomOptions')
    .forEach(option => option.classList.add('d-none'));
  
  // 显示对应的周期选项
  if (cycleType === 'daily') {
    document.getElementById('cycleDailyOptions').classList.remove('d-none');
  } else if (cycleType === 'weekly') {
    document.getElementById('cycleWeeklyOptions').classList.remove('d-none');
  } else if (cycleType === 'monthly') {
    document.getElementById('cycleMonthlyOptions').classList.remove('d-none');
  } else if (cycleType === 'custom') {
    document.getElementById('cycleCustomOptions').classList.remove('d-none');
  }
}

// 重置任务表单
function resetTaskForm() {
  document.getElementById('taskForm').reset();
  document.getElementById('taskId').value = '';
  
  // 重置默认值
  document.getElementById('taskType').value = 'temporary';
  document.getElementById('typeTemporary').checked = true;
  document.getElementById('status').value = 'pending';
  document.getElementById('regularStatus').value = 'active';
  document.getElementById('priority').value = '0';
  
  // 默认显示临时任务字段
  toggleTaskFields('temporary');
  
  // 设置日期为今天
  const today = formatDate(new Date());
  document.getElementById('taskDate').value = today;
  
  // 重置日期选择器
  const taskDatePicker = document.getElementById('taskDate')._flatpickr;
  if (taskDatePicker) {
    taskDatePicker.setDate(today);
  }
}

// 加载日常工作计划
async function loadDailyPlan(date) {
  try {
    const response = await fetch(`/api/work-tasks/daily-plan?date=${date}`);
    const data = await response.json();
    
    if (data.success) {
      const dailyTaskList = document.getElementById('dailyTaskList');
      const dailyTaskCount = document.getElementById('dailyTaskCount');
      
      // 清空列表
      dailyTaskList.innerHTML = '';
      
      // 更新任务数量
      dailyTaskCount.textContent = data.data.length;
      
      if (data.data.length === 0) {
        dailyTaskList.innerHTML = `
          <div class="empty-state">
            <i class="bi bi-calendar-check"></i>
            <p>当日没有工作计划</p>
          </div>
        `;
        return;
      }
      
      // 渲染任务列表
      data.data.forEach(task => {
        const taskElement = createTaskElement(task, 'daily');
        dailyTaskList.appendChild(taskElement);
      });
    } else {
      showAlert('加载日常工作计划失败: ' + data.message, 'danger');
    }
  } catch (error) {
    console.error('加载日常工作计划出错:', error);
    showAlert('加载日常工作计划出错: ' + error.message, 'danger');
  }
}

// 加载常规工作内容
async function loadRegularTasks() {
  try {
    const response = await fetch('/api/work-tasks/regular');
    const data = await response.json();
    
    if (data.success) {
      const regularTaskList = document.getElementById('regularTaskList');
      const regularTaskCount = document.getElementById('regularTaskCount');
      
      // 清空列表
      regularTaskList.innerHTML = '';
      
      // 更新任务数量
      regularTaskCount.textContent = data.data.length;
      
      if (data.data.length === 0) {
        regularTaskList.innerHTML = `
          <div class="empty-state">
            <i class="bi bi-calendar-range"></i>
            <p>暂无常规工作内容</p>
          </div>
        `;
        return;
      }
      
      // 渲染任务列表
      data.data.forEach(task => {
        const taskElement = createTaskElement(task, 'regular');
        regularTaskList.appendChild(taskElement);
      });
    } else {
      showAlert('加载常规工作内容失败: ' + data.message, 'danger');
    }
  } catch (error) {
    console.error('加载常规工作内容出错:', error);
    showAlert('加载常规工作内容出错: ' + error.message, 'danger');
  }
}

// 加载临时工作内容
async function loadTemporaryTasks() {
  try {
    const response = await fetch('/api/work-tasks/temporary');
    const data = await response.json();
    
    if (data.success) {
      const temporaryTaskList = document.getElementById('temporaryTaskList');
      const temporaryTaskCount = document.getElementById('temporaryTaskCount');
      
      // 清空列表
      temporaryTaskList.innerHTML = '';
      
      // 更新任务数量
      temporaryTaskCount.textContent = data.data.length;
      
      if (data.data.length === 0) {
        temporaryTaskList.innerHTML = `
          <div class="empty-state">
            <i class="bi bi-list-task"></i>
            <p>暂无临时工作内容</p>
          </div>
        `;
        return;
      }
      
      // 渲染任务列表
      data.data.forEach(task => {
        const taskElement = createTaskElement(task, 'temporary');
        temporaryTaskList.appendChild(taskElement);
      });
    } else {
      showAlert('加载临时工作内容失败: ' + data.message, 'danger');
    }
  } catch (error) {
    console.error('加载临时工作内容出错:', error);
    showAlert('加载临时工作内容出错: ' + error.message, 'danger');
  }
}

// 创建任务元素
function createTaskElement(task, viewType) {
  const div = document.createElement('div');
  div.className = `card task-item ${task.status} ${task.priority >= 2 ? 'priority-high' : (task.priority == 1 ? 'priority-medium' : '')}`;
  
  // 获取任务类型
  const taskType = task.task_type || (viewType === 'regular' ? 'regular' : 'temporary');
  
  // 构建时间信息
  let timeInfo = '';
  if (task.start_time) {
    timeInfo = `<span class="time-badge">${formatTime(task.start_time)}`;
    if (task.duration) {
      const duration = parseInt(task.duration);
      const durationHours = Math.floor(duration / 60);
      const durationMinutes = duration % 60;
      let durationText = '';
      
      if (durationHours > 0) {
        durationText += `${durationHours}小时`;
      }
      if (durationMinutes > 0 || durationHours === 0) {
        durationText += `${durationMinutes}分钟`;
      }
      
      timeInfo += ` (${durationText})`;
    }
    timeInfo += '</span>';
  }
  
  // 构建周期信息（仅限常规任务）
  let cycleInfo = '';
  if (taskType === 'regular' && task.cycle_type) {
    cycleInfo = `<span class="badge bg-secondary ms-2">`;
    
    switch(task.cycle_type) {
      case 'daily':
        cycleInfo += '每日';
        break;
      case 'weekly':
        const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
        cycleInfo += `每周${weekdays[parseInt(task.cycle_value) - 1] || ''}`;
        break;
      case 'monthly':
        cycleInfo += `每月${task.cycle_value}日`;
        break;
      case 'custom':
        cycleInfo += '自定义日期';
        break;
    }
    
    cycleInfo += '</span>';
  }
  
  // 构建日期信息（仅限临时任务）
  let dateInfo = '';
  if (taskType === 'temporary' && task.scheduled_date) {
    dateInfo = `<span class="badge bg-info ms-2">${task.scheduled_date}</span>`;
  }
  
  // 构建优先级标识
  let priorityBadge = '';
  if (task.priority >= 2) {
    priorityBadge = '<span class="badge bg-warning ms-2">高优先级</span>';
  } else if (task.priority == 1) {
    priorityBadge = '<span class="badge bg-info ms-2">中等优先级</span>';
  }
  
  // 构建状态标识
  let statusBadge = '';
  if (task.status) {
    let statusClass = '';
    let statusText = '';
    
    switch(task.status) {
      case 'pending':
        statusClass = 'bg-warning';
        statusText = '待处理';
        break;
      case 'in_progress':
        statusClass = 'bg-primary';
        statusText = '进行中';
        break;
      case 'completed':
        statusClass = 'bg-success';
        statusText = '已完成';
        break;
      case 'cancelled':
        statusClass = 'bg-danger';
        statusText = '已取消';
        break;
      case 'active':
        statusClass = 'bg-success';
        statusText = '活跃';
        break;
      case 'inactive':
        statusClass = 'bg-secondary';
        statusText = '禁用';
        break;
    }
    
    statusBadge = `<span class="badge ${statusClass} ms-2">${statusText}</span>`;
  }
  
  // 任务内容HTML
  div.innerHTML = `
    <div class="card-body">
      <div class="d-flex justify-content-between align-items-center">
        <h5 class="card-title mb-2">
          ${task.title}
          ${statusBadge}
          ${cycleInfo}
          ${dateInfo}
          ${priorityBadge}
        </h5>
        <div class="task-actions">
          <button class="btn btn-sm btn-outline-primary btn-edit" data-id="${task.id}" data-type="${taskType}">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger btn-delete" data-id="${task.id}" data-type="${taskType}">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
      
      <p class="card-text text-muted mb-2">${task.description || ''}</p>
      
      <div class="d-flex justify-content-between align-items-center">
        <div>
          ${timeInfo}
        </div>
        
        ${taskType === 'temporary' && viewType === 'daily' ? `
          <div class="btn-group btn-group-sm status-actions">
            <button class="btn btn-outline-primary btn-status" data-id="${task.id}" data-status="pending" ${task.status === 'pending' ? 'disabled' : ''}>
              待处理
            </button>
            <button class="btn btn-outline-primary btn-status" data-id="${task.id}" data-status="in_progress" ${task.status === 'in_progress' ? 'disabled' : ''}>
              进行中
            </button>
            <button class="btn btn-outline-success btn-status" data-id="${task.id}" data-status="completed" ${task.status === 'completed' ? 'disabled' : ''}>
              完成
            </button>
          </div>
        ` : ''}
      </div>
    </div>
  `;
  
  // 添加编辑按钮事件
  div.querySelector('.btn-edit').addEventListener('click', function() {
    editTask(task.id, taskType);
  });
  
  // 添加删除按钮事件
  div.querySelector('.btn-delete').addEventListener('click', function() {
    const deleteBtn = document.getElementById('btnConfirmDelete');
    deleteBtn.setAttribute('data-task-id', task.id);
    deleteBtn.setAttribute('data-task-type', taskType);
    
    const deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));
    deleteModal.show();
  });
  
  // 添加状态按钮事件（仅临时任务）
  if (taskType === 'temporary' && viewType === 'daily') {
    div.querySelectorAll('.btn-status').forEach(btn => {
      btn.addEventListener('click', function() {
        const taskId = this.getAttribute('data-id');
        const status = this.getAttribute('data-status');
        updateTaskStatus(taskId, status);
      });
    });
  }
  
  return div;
}

// 编辑任务
async function editTask(id, type) {
  try {
    // 加载任务数据
    const response = await fetch(`/api/work-tasks/${type}/${id}`);
    const data = await response.json();
    
    if (!data.success || !data.data) {
      showAlert('加载任务详情失败', 'danger');
      return;
    }
    
    const task = data.data;
    
    // 重置表单
    resetTaskForm();
    
    // 设置表单数据
    document.getElementById('taskId').value = task.id;
    document.getElementById('title').value = task.title;
    document.getElementById('description').value = task.description || '';
    document.getElementById('priority').value = task.priority || 0;
    
    // 设置任务类型
    if (type === 'regular') {
      document.getElementById('typeRegular').checked = true;
      toggleTaskFields('regular');
      
      // 设置周期类型
      document.getElementById('cycleType').value = task.cycle_type;
      toggleCycleOptions(task.cycle_type);
      
      // 设置周期值
      if (task.cycle_type === 'weekly' && task.cycle_value) {
        document.getElementById('weekday').value = task.cycle_value;
      } else if (task.cycle_type === 'monthly' && task.cycle_value) {
        document.getElementById('monthDay').value = task.cycle_value;
      } else if (task.cycle_type === 'custom' && task.cycle_value) {
        document.getElementById('customDates').value = task.cycle_value;
      }
      
      // 设置时间
      if (task.start_time) {
        document.getElementById('regularStartTime').value = formatTime(task.start_time);
      }
      
      // 设置状态
      document.getElementById('regularStatus').value = task.status || 'active';
    } else {
      document.getElementById('typeTemporary').checked = true;
      toggleTaskFields('temporary');
      
      // 设置日期和时间
      if (task.scheduled_date) {
        document.getElementById('taskDate').value = task.scheduled_date;
        const taskDatePicker = document.getElementById('taskDate')._flatpickr;
        if (taskDatePicker) {
          taskDatePicker.setDate(task.scheduled_date);
        }
      }
      
      if (task.start_time) {
        document.getElementById('startTime').value = formatTime(task.start_time);
      }
      
      // 设置状态
      document.getElementById('status').value = task.status || 'pending';
    }
    
    // 显示模态框
    document.getElementById('taskModalTitle').textContent = '编辑工作内容';
    const taskModal = new bootstrap.Modal(document.getElementById('taskModal'));
    taskModal.show();
  } catch (error) {
    console.error('加载任务详情出错:', error);
    showAlert('加载任务详情出错: ' + error.message, 'danger');
  }
}

// 保存任务
async function saveTask() {
  try {
    const taskId = document.getElementById('taskId').value;
    const taskType = document.getElementById('taskType').value;
    const isEdit = taskId !== '';
    
    // 获取通用字段
    const title = document.getElementById('title').value;
    const description = document.getElementById('description').value;
    const priority = document.getElementById('priority').value;
    
    if (!title) {
      showAlert('请输入工作标题', 'warning');
      return;
    }
    
    let taskData = {};
    let endpoint = '';
    
    if (taskType === 'regular') {
      // 常规工作内容
      const cycleType = document.getElementById('cycleType').value;
      let cycleValue = '';
      
      if (cycleType === 'weekly') {
        cycleValue = document.getElementById('weekday').value;
      } else if (cycleType === 'monthly') {
        cycleValue = document.getElementById('monthDay').value;
      } else if (cycleType === 'custom') {
        cycleValue = document.getElementById('customDates').value;
      }
      
      const startTime = document.getElementById('regularStartTime').value;
      const duration = document.getElementById('regularDuration').value || '60';
      const status = document.getElementById('regularStatus').value;
      
      taskData = {
        title,
        description,
        cycle_type: cycleType,
        cycle_value: cycleValue,
        start_time: startTime,
        duration: parseInt(duration),
        status,
        priority: parseInt(priority)
      };
      
      endpoint = `/api/work-tasks/regular${isEdit ? `/${taskId}` : ''}`;
    } else {
      // 临时工作内容
      const taskDate = document.getElementById('taskDate').value;
      const startTime = document.getElementById('startTime').value;
      const duration = document.getElementById('duration').value || '60';
      const status = document.getElementById('status').value;
      
      if (!taskDate) {
        showAlert('请选择任务日期', 'warning');
        return;
      }
      
      taskData = {
        title,
        description,
        scheduled_date: taskDate,
        start_time: startTime,
        duration: parseInt(duration),
        status,
        priority: parseInt(priority)
      };
      
      endpoint = `/api/work-tasks/temporary${isEdit ? `/${taskId}` : ''}`;
    }
    
    console.log('发送任务数据:', taskData);
    console.log('请求端点:', endpoint);
    
    // 发送请求
    const response = await fetch(endpoint, {
      method: isEdit ? 'PUT' : 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(taskData)
    });
    
    const data = await response.json();
    
    if (data.success) {
      // 关闭模态框
      const taskModal = bootstrap.Modal.getInstance(document.getElementById('taskModal'));
      taskModal.hide();
      
      // 显示成功消息
      showAlert(isEdit ? '工作内容更新成功' : '工作内容添加成功', 'success');
      
      // 刷新数据
      refreshCurrentView();
    } else {
      showAlert(data.message || '操作失败', 'danger');
    }
  } catch (error) {
    console.error('保存任务出错:', error);
    showAlert('保存任务出错: ' + error.message, 'danger');
  }
}

// 更新任务状态
async function updateTaskStatus(taskId, status) {
  try {
    const response = await fetch(`/api/work-tasks/temporary/${taskId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status })
    });
    
    const data = await response.json();
    
    if (data.success) {
      // 刷新当前视图
      refreshCurrentView();
      showAlert('任务状态更新成功', 'success');
    } else {
      showAlert(data.message || '更新状态失败', 'danger');
    }
  } catch (error) {
    console.error('更新任务状态出错:', error);
    showAlert('更新任务状态出错: ' + error.message, 'danger');
  }
}

// 删除任务
async function deleteTask(taskId, taskType) {
  try {
    const response = await fetch(`/api/work-tasks/${taskType}/${taskId}`, {
      method: 'DELETE'
    });
    
    const data = await response.json();
    
    // 关闭模态框
    const deleteModal = bootstrap.Modal.getInstance(document.getElementById('deleteModal'));
    deleteModal.hide();
    
    if (data.success) {
      // 刷新数据
      refreshCurrentView();
      showAlert('工作内容删除成功', 'success');
    } else {
      showAlert(data.message || '删除失败', 'danger');
    }
  } catch (error) {
    console.error('删除任务出错:', error);
    showAlert('删除任务出错: ' + error.message, 'danger');
  }
}

// 刷新当前视图
function refreshCurrentView() {
  const activeView = document.querySelector('.view-container:not(.d-none)').id;
  
  if (activeView === 'dailyView') {
    const datePicker = document.getElementById('datePicker')._flatpickr;
    loadDailyPlan(datePicker.selectedDates[0] ? formatDate(datePicker.selectedDates[0]) : formatDate(new Date()));
  } else if (activeView === 'regularView') {
    loadRegularTasks();
  } else if (activeView === 'temporaryView') {
    loadTemporaryTasks();
  }
}

// 显示提示信息
function showAlert(message, type = 'info') {
  // 创建提示元素
  const alertDiv = document.createElement('div');
  alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3`;
  alertDiv.style.zIndex = '9999';
  alertDiv.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
  `;
  
  // 添加到页面
  document.body.appendChild(alertDiv);
  
  // 3秒后自动关闭
  setTimeout(() => {
    if (alertDiv.parentNode) {
      alertDiv.classList.remove('show');
      setTimeout(() => {
        if (alertDiv.parentNode) {
          alertDiv.parentNode.removeChild(alertDiv);
        }
      }, 300);
    }
  }, 3000);
}

// 加载同步状态
async function loadSyncStatus() {
  try {
    const syncStatusInfo = document.getElementById('syncStatusInfo');
    syncStatusInfo.innerHTML = '正在获取同步状态...';
    
    const response = await fetch('/api/modbus/work-tasks/sync/status');
    const data = await response.json();
    
    if (data.success) {
      // 更新状态信息
      const syncHour = document.getElementById('syncHour');
      const syncMinute = document.getElementById('syncMinute');
      
      // 设置当前配置的同步时间
      syncHour.value = data.syncHour;
      syncMinute.value = data.syncMinute;
      
      // 更新状态信息
      const statusText = data.syncActive 
        ? `同步任务已启动，每天 ${data.syncHour}:${String(data.syncMinute).padStart(2, '0')} 自动同步`
        : `同步任务未启动，当前配置时间为 ${data.syncHour}:${String(data.syncMinute).padStart(2, '0')}`;
      
      const lastSyncText = data.lastSyncDate 
        ? `，上次同步日期: ${data.lastSyncDate}`
        : '，尚未执行过同步';
      
      syncStatusInfo.innerHTML = statusText + lastSyncText;
    } else {
      syncStatusInfo.innerHTML = '获取同步状态失败: ' + (data.error || '未知错误');
    }
  } catch (error) {
    console.error('加载同步状态失败:', error);
    document.getElementById('syncStatusInfo').innerHTML = '获取同步状态失败: ' + error.message;
  }
}

// 保存同步配置
async function saveSyncConfig() {
  try {
    const syncHour = document.getElementById('syncHour').value;
    const syncMinute = document.getElementById('syncMinute').value;
    
    // 验证输入
    if (!syncHour || !syncMinute) {
      showAlert('请输入有效的小时和分钟', 'warning');
      return;
    }
    
    const hourValue = parseInt(syncHour);
    const minuteValue = parseInt(syncMinute);
    
    if (isNaN(hourValue) || hourValue < 0 || hourValue > 23) {
      showAlert('小时必须是0-23之间的整数', 'warning');
      return;
    }
    
    if (isNaN(minuteValue) || minuteValue < 0 || minuteValue > 59) {
      showAlert('分钟必须是0-59之间的整数', 'warning');
      return;
    }
    
    // 显示保存中状态
    const syncStatusInfo = document.getElementById('syncStatusInfo');
    const btnSaveSync = document.getElementById('btnSaveSync');
    const originalBtnText = btnSaveSync.innerHTML;
    
    syncStatusInfo.innerHTML = '正在保存同步配置...';
    btnSaveSync.disabled = true;
    btnSaveSync.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 保存中';
    
    // 发送请求保存配置
    const response = await fetch('/api/modbus/work-tasks/sync/configure', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        hour: hourValue,
        minute: minuteValue,
        restart: true
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      showAlert('同步配置已保存', 'success');
      
      // 更新状态信息
      const statusText = data.syncActive 
        ? `同步任务已启动，每天 ${data.hour}:${String(data.minute).padStart(2, '0')} 自动同步`
        : `同步任务未启动，当前配置时间为 ${data.hour}:${String(data.minute).padStart(2, '0')}`;
      
      syncStatusInfo.innerHTML = statusText;
    } else {
      showAlert('保存同步配置失败: ' + (data.error || '未知错误'), 'danger');
      syncStatusInfo.innerHTML = '保存同步配置失败: ' + (data.error || '未知错误');
    }
    
    // 恢复按钮状态
    btnSaveSync.disabled = false;
    btnSaveSync.innerHTML = originalBtnText;
  } catch (error) {
    console.error('保存同步配置失败:', error);
    showAlert('保存同步配置失败: ' + error.message, 'danger');
    document.getElementById('syncStatusInfo').innerHTML = '保存同步配置失败: ' + error.message;
    document.getElementById('btnSaveSync').disabled = false;
    document.getElementById('btnSaveSync').innerHTML = '保存';
  }
}

// 手动同步工作任务
async function manualSync() {
  try {
    const syncStatusInfo = document.getElementById('syncStatusInfo');
    const btnManualSync = document.getElementById('btnManualSync');
    const originalBtnText = btnManualSync.innerHTML;
    
    syncStatusInfo.innerHTML = '正在执行手动同步...';
    btnManualSync.disabled = true;
    btnManualSync.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 同步中';
    
    // 发送请求手动同步
    const response = await fetch('/api/modbus/work-tasks/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (data.success) {
      showAlert('手动同步成功', 'success');
      syncStatusInfo.innerHTML = `手动同步成功：${data.regularTasksCount} 个常规任务，${data.tempTasksCount} 个临时任务`;
      
      // 刷新当前视图
      refreshCurrentView();
    } else {
      showAlert('手动同步失败: ' + (data.error || '未知错误'), 'danger');
      syncStatusInfo.innerHTML = '手动同步失败: ' + (data.error || '未知错误');
    }
    
    // 恢复按钮状态
    btnManualSync.disabled = false;
    btnManualSync.innerHTML = originalBtnText;
    
    // 更新同步状态
    setTimeout(loadSyncStatus, 2000);
  } catch (error) {
    console.error('手动同步失败:', error);
    showAlert('手动同步失败: ' + error.message, 'danger');
    document.getElementById('syncStatusInfo').innerHTML = '手动同步失败: ' + error.message;
    document.getElementById('btnManualSync').disabled = false;
    document.getElementById('btnManualSync').innerHTML = '<i class="bi bi-arrow-repeat me-2"></i>立即同步工作任务';
  }
} 
/**
 * 工作总结管理前端脚本
 */
document.addEventListener('DOMContentLoaded', function() {
  // 当前分页状态
  const paginationState = {
    limit: 10,
    offset: 0,
    total: 0,
    currentPage: 1,
    totalPages: 1,
    startDate: '',
    endDate: ''
  };

  // 初始化日期选择器
  const startDatePicker = flatpickr('#startDate', {
    locale: 'zh',
    dateFormat: 'Y-m-d',
    onChange: function(selectedDates, dateStr) {
      paginationState.startDate = dateStr;
    }
  });

  const endDatePicker = flatpickr('#endDate', {
    locale: 'zh',
    dateFormat: 'Y-m-d',
    onChange: function(selectedDates, dateStr) {
      paginationState.endDate = dateStr;
    }
  });

  // 初始化总结日期选择器
  flatpickr('#summaryDate', {
    locale: 'zh',
    dateFormat: 'Y-m-d',
    defaultDate: new Date()
  });

  // 生成工作总结按钮点击事件
  document.getElementById('btnGenerateSummary').addEventListener('click', function() {
    const generateModal = new bootstrap.Modal(document.getElementById('generateModal'));
    generateModal.show();
  });

  // 确认生成工作总结按钮点击事件
  document.getElementById('btnConfirmGenerate').addEventListener('click', function() {
    generateSummary();
  });

  // 刷新按钮点击事件
  document.getElementById('btnRefresh').addEventListener('click', function() {
    loadSummaryList();
  });

  // 筛选按钮点击事件
  document.getElementById('btnFilter').addEventListener('click', function() {
    paginationState.offset = 0;
    paginationState.currentPage = 1;
    loadSummaryList();
  });

  // 确认删除按钮点击事件
  document.getElementById('btnConfirmDelete').addEventListener('click', function() {
    const summaryId = this.getAttribute('data-summary-id');
    
    if (summaryId) {
      deleteSummary(summaryId);
    }
  });

  // 加载初始数据
  loadSummaryList();

  /**
   * 加载工作总结列表
   */
  async function loadSummaryList() {
    try {
      showLoading('加载工作总结列表...');
      
      // 构建请求URL
      let url = `/api/work-summaries?limit=${paginationState.limit}&offset=${paginationState.offset}`;
      
      if (paginationState.startDate) {
        url += `&startDate=${paginationState.startDate}`;
      }
      
      if (paginationState.endDate) {
        url += `&endDate=${paginationState.endDate}`;
      }
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.success) {
        // 更新分页状态
        paginationState.total = data.total;
        paginationState.totalPages = Math.ceil(data.total / paginationState.limit);
        
        // 更新总结数量
        document.getElementById('summaryCount').textContent = data.total;
        
        // 更新分页信息
        updatePaginationInfo();
        
        // 渲染总结列表
        renderSummaryList(data.data);
        
        // 渲染分页控件
        renderPagination();
      } else {
        showAlert('加载工作总结列表失败: ' + data.error, 'danger');
      }
      
      hideLoading();
    } catch (error) {
      console.error('加载工作总结列表出错:', error);
      showAlert('加载工作总结列表出错: ' + error.message, 'danger');
      hideLoading();
    }
  }

  /**
   * 渲染工作总结列表
   * @param {Array} summaries 工作总结数据
   */
  function renderSummaryList(summaries) {
    const summaryList = document.getElementById('summaryList');
    
    // 清空列表
    summaryList.innerHTML = '';
    
    if (!summaries || summaries.length === 0) {
      summaryList.innerHTML = `
        <div class="empty-state">
          <i class="bi bi-journal-text"></i>
          <p>暂无工作总结</p>
        </div>
      `;
      return;
    }
    
    // 渲染每个总结项
    summaries.forEach(summary => {
      const completionRate = summary.total_tasks > 0 
        ? Math.round((summary.completed_tasks / summary.total_tasks) * 100) 
        : 0;
      
      const summaryItem = document.createElement('div');
      summaryItem.className = 'card summary-item mb-3';
      summaryItem.innerHTML = `
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center">
            <h5 class="card-title mb-2">${formatDate(summary.summary_date)} 工作总结</h5>
            <div class="summary-actions">
              <button class="btn btn-sm btn-outline-primary btn-view" data-id="${summary.id}">
                <i class="bi bi-eye"></i>
              </button>
              <button class="btn btn-sm btn-outline-danger btn-delete" data-id="${summary.id}">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </div>
          
          <div class="d-flex flex-wrap mt-2">
            <span class="stats-badge badge-total">总计: ${summary.total_tasks}</span>
            <span class="stats-badge badge-completed">已完成: ${summary.completed_tasks}</span>
            <span class="stats-badge badge-pending">待处理: ${summary.pending_tasks}</span>
            <span class="stats-badge badge-cancelled">已取消: ${summary.cancelled_tasks}</span>
          </div>
          
          <div class="progress mt-3" style="height: 10px;">
            <div class="progress-bar bg-success" role="progressbar" style="width: ${completionRate}%;" 
                 aria-valuenow="${completionRate}" aria-valuemin="0" aria-valuemax="100">
              ${completionRate}%
            </div>
          </div>
          
          <div class="text-muted mt-2">
            <small>生成于: ${formatDateTime(summary.created_at)}</small>
          </div>
        </div>
      `;
      
      // 添加查看按钮事件
      summaryItem.querySelector('.btn-view').addEventListener('click', function() {
        viewSummaryDetail(summary.id);
      });
      
      // 添加删除按钮事件
      summaryItem.querySelector('.btn-delete').addEventListener('click', function() {
        const deleteBtn = document.getElementById('btnConfirmDelete');
        deleteBtn.setAttribute('data-summary-id', summary.id);
        
        const deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));
        deleteModal.show();
      });
      
      summaryList.appendChild(summaryItem);
    });
  }

  /**
   * 生成工作总结
   */
  async function generateSummary() {
    try {
      const summaryDate = document.getElementById('summaryDate').value;
      
      if (!summaryDate) {
        showAlert('请选择要生成总结的日期', 'warning');
        return;
      }
      
      // 关闭模态框
      const generateModal = bootstrap.Modal.getInstance(document.getElementById('generateModal'));
      generateModal.hide();
      
      showLoading(`正在生成 ${summaryDate} 的工作总结，这可能需要一些时间...`);
      
      const response = await fetch('/api/work-summaries/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          date: summaryDate
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        showAlert(`${summaryDate} 的工作总结已成功生成`, 'success');
        
        // 重新加载总结列表
        loadSummaryList();
      } else {
        showAlert('生成工作总结失败: ' + data.error, 'danger');
      }
      
      hideLoading();
    } catch (error) {
      console.error('生成工作总结出错:', error);
      showAlert('生成工作总结出错: ' + error.message, 'danger');
      hideLoading();
    }
  }

  /**
   * 查看总结详情
   * @param {number} id 总结ID
   */
  async function viewSummaryDetail(id) {
    try {
      showLoading('加载工作总结详情...');
      
      const response = await fetch(`/api/work-summaries/${id}`);
      const data = await response.json();
      
      if (data.success) {
        const summary = data.data;
        
        // 更新详情模态框内容
        document.getElementById('summaryDetailTitle').textContent = 
          `${formatDate(summary.summary_date)} 工作总结`;
        document.getElementById('detailDate').textContent = formatDate(summary.summary_date);
        document.getElementById('detailCreatedAt').textContent = formatDateTime(summary.created_at);
        document.getElementById('detailTotal').textContent = summary.total_tasks;
        document.getElementById('detailCompleted').textContent = summary.completed_tasks;
        document.getElementById('detailPending').textContent = summary.pending_tasks;
        document.getElementById('detailCancelled').textContent = summary.cancelled_tasks;
        document.getElementById('detailContent').textContent = summary.dify_response || '无内容';
        document.getElementById('detailTaskDetails').textContent = summary.task_details || '无任务详情';
        
        // 显示详情模态框
        const detailModal = new bootstrap.Modal(document.getElementById('summaryDetailModal'));
        detailModal.show();
      } else {
        showAlert('加载工作总结详情失败: ' + data.error, 'danger');
      }
      
      hideLoading();
    } catch (error) {
      console.error('加载工作总结详情出错:', error);
      showAlert('加载工作总结详情出错: ' + error.message, 'danger');
      hideLoading();
    }
  }

  /**
   * 删除工作总结
   * @param {number} id 总结ID
   */
  async function deleteSummary(id) {
    try {
      showLoading('正在删除工作总结...');
      
      // 关闭模态框
      const deleteModal = bootstrap.Modal.getInstance(document.getElementById('deleteModal'));
      deleteModal.hide();
      
      const response = await fetch(`/api/work-summaries/${id}`, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      
      if (data.success) {
        showAlert('工作总结已成功删除', 'success');
        
        // 重新加载总结列表
        loadSummaryList();
      } else {
        showAlert('删除工作总结失败: ' + data.error, 'danger');
      }
      
      hideLoading();
    } catch (error) {
      console.error('删除工作总结出错:', error);
      showAlert('删除工作总结出错: ' + error.message, 'danger');
      hideLoading();
    }
  }

  /**
   * 更新分页信息
   */
  function updatePaginationInfo() {
    const start = paginationState.offset + 1;
    const end = Math.min(paginationState.offset + paginationState.limit, paginationState.total);
    const total = paginationState.total;
    
    document.getElementById('paginationInfo').textContent = 
      `显示 ${total > 0 ? start : 0}-${end}，共 ${total} 条`;
  }

  /**
   * 渲染分页控件
   */
  function renderPagination() {
    const pagination = document.getElementById('pagination');
    pagination.innerHTML = '';
    
    // 如果总页数小于等于1，不显示分页
    if (paginationState.totalPages <= 1) {
      return;
    }
    
    // 上一页按钮
    const prevItem = document.createElement('li');
    prevItem.className = `page-item ${paginationState.currentPage === 1 ? 'disabled' : ''}`;
    prevItem.innerHTML = `
      <a class="page-link" href="#" aria-label="上一页">
        <span aria-hidden="true">&laquo;</span>
      </a>
    `;
    
    if (paginationState.currentPage > 1) {
      prevItem.addEventListener('click', function(e) {
        e.preventDefault();
        goToPage(paginationState.currentPage - 1);
      });
    }
    
    pagination.appendChild(prevItem);
    
    // 页码按钮
    const maxVisiblePages = 5;
    let startPage = Math.max(1, paginationState.currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(paginationState.totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      const pageItem = document.createElement('li');
      pageItem.className = `page-item ${i === paginationState.currentPage ? 'active' : ''}`;
      pageItem.innerHTML = `<a class="page-link" href="#">${i}</a>`;
      
      pageItem.addEventListener('click', function(e) {
        e.preventDefault();
        goToPage(i);
      });
      
      pagination.appendChild(pageItem);
    }
    
    // 下一页按钮
    const nextItem = document.createElement('li');
    nextItem.className = `page-item ${paginationState.currentPage === paginationState.totalPages ? 'disabled' : ''}`;
    nextItem.innerHTML = `
      <a class="page-link" href="#" aria-label="下一页">
        <span aria-hidden="true">&raquo;</span>
      </a>
    `;
    
    if (paginationState.currentPage < paginationState.totalPages) {
      nextItem.addEventListener('click', function(e) {
        e.preventDefault();
        goToPage(paginationState.currentPage + 1);
      });
    }
    
    pagination.appendChild(nextItem);
  }

  /**
   * 跳转到指定页
   * @param {number} page 页码
   */
  function goToPage(page) {
    if (page < 1 || page > paginationState.totalPages) {
      return;
    }
    
    paginationState.currentPage = page;
    paginationState.offset = (page - 1) * paginationState.limit;
    
    loadSummaryList();
  }

  /**
   * 显示加载中状态
   * @param {string} message 加载提示消息
   */
  function showLoading(message = '加载中...') {
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingMessage = document.getElementById('loadingMessage');
    
    loadingMessage.textContent = message;
    loadingOverlay.classList.remove('d-none');
  }

  /**
   * 隐藏加载中状态
   */
  function hideLoading() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    loadingOverlay.classList.add('d-none');
  }

  /**
   * 显示提示信息
   * @param {string} message 提示信息
   * @param {string} type 提示类型
   */
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

  /**
   * 格式化日期
   * @param {string} dateStr 日期字符串
   * @returns {string} 格式化后的日期
   */
  function formatDate(dateStr) {
    if (!dateStr) return '';
    
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  }

  /**
   * 格式化日期时间
   * @param {string} dateTimeStr 日期时间字符串
   * @returns {string} 格式化后的日期时间
   */
  function formatDateTime(dateTimeStr) {
    if (!dateTimeStr) return '';
    
    const date = new Date(dateTimeStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
}); 
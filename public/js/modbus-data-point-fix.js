/**
 * Modbus数据点功能修复脚本
 * 修复数据点添加按钮点击事件问题
 */

(function() {
  console.log('加载数据点功能修复脚本...');
  
  // 确保在页面加载完成后执行
  document.addEventListener('DOMContentLoaded', function() {
    console.log('应用数据点功能修复...');
    
    // 确保showAddDataPointModal函数定义正确
    if (typeof window.showAddDataPointModal !== 'function') {
      console.log('修复showAddDataPointModal函数');
      
      window.showAddDataPointModal = async function() {
        try {
          console.log('显示添加数据点模态框');
          
          // 重置表单
          if (typeof resetDataPointForm === 'function') {
            resetDataPointForm();
          }
          
          // 设置为非编辑模式
          window.isEditMode = false;
          
          // 更新模态框标题
          const titleElement = document.getElementById('dataPointModalTitle');
          if (titleElement) {
            titleElement.innerHTML = '<i class="bi bi-database-add"></i> 添加数据点';
          }
          
          // 尝试加载数据源类型
          let dataSourceType = 'modbus';
          try {
            if (typeof loadDataSourceType === 'function') {
              dataSourceType = await loadDataSourceType();
            }
          } catch (error) {
            console.error('加载数据源类型出错:', error);
          }
          
          // 更新表单显示
          if (typeof updateDataPointFormForDataSource === 'function') {
            updateDataPointFormForDataSource(dataSourceType);
          } else {
            // 简单的备用实现
            const dataSourceTypeInfo = document.getElementById('currentDataSourceType');
            if (dataSourceTypeInfo) {
              dataSourceTypeInfo.textContent = `当前数据源类型: ${dataSourceType === 'mqtt' ? 'MQTT' : 'Modbus TCP'}`;
            }
            
            const modbusSettings = document.getElementById('modbusSettings');
            const mqttSettings = document.getElementById('mqttSettings');
            
            if (modbusSettings && mqttSettings) {
              if (dataSourceType === 'mqtt') {
                modbusSettings.style.display = 'none';
                mqttSettings.style.display = 'block';
                
                // MQTT模式下位设置只在BIT格式下显示
                const format = document.getElementById('formatSelect')?.value;
                const bitPositionDiv = document.getElementById('bitPositionDiv');
                if (bitPositionDiv) {
                  bitPositionDiv.style.display = format === 'BIT' ? 'block' : 'none';
                }
              } else {
                modbusSettings.style.display = 'block';
                mqttSettings.style.display = 'none';
              }
            }
          }
          
          // 显示模态框
          const dataPointModal = document.getElementById('dataPointModal');
          if (dataPointModal) {
            const modal = new bootstrap.Modal(dataPointModal);
            modal.show();
          } else {
            console.error('找不到数据点模态框元素');
            showToast('无法显示数据点添加界面，找不到模态框元素', 'error');
          }
        } catch (error) {
          console.error('显示数据点表单出错:', error);
          showToast('显示数据点表单出错: ' + error.message, 'error');
        }
      };
    }
    
    // 确保通用的Toast通知功能可用
    if (typeof window.showToast !== 'function') {
      window.showToast = function(message, type = 'info', duration = 3000) {
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        // 如果有Bootstrap Toast组件，创建一个Toast通知
        if (typeof bootstrap !== 'undefined' && bootstrap.Toast) {
          // 查找或创建toast容器
          let toastContainer = document.getElementById('toast-container');
          if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
            document.body.appendChild(toastContainer);
          }
          
          // 创建Toast元素
          const toastEl = document.createElement('div');
          toastEl.className = `toast align-items-center text-white bg-${type === 'error' ? 'danger' : type}`;
          toastEl.setAttribute('role', 'alert');
          toastEl.setAttribute('aria-live', 'assertive');
          toastEl.setAttribute('aria-atomic', 'true');
          
          // 创建Toast内容
          toastEl.innerHTML = `
            <div class="d-flex">
              <div class="toast-body">
                ${message}
              </div>
              <button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast" aria-label="关闭"></button>
            </div>
          `;
          
          // 添加到容器
          toastContainer.appendChild(toastEl);
          
          // 创建并显示Toast
          const toast = new bootstrap.Toast(toastEl, { delay: duration });
          toast.show();
          
          // 自动删除Toast元素
          toastEl.addEventListener('hidden.bs.toast', function () {
            toastEl.remove();
          });
        } else {
          // 如果没有Bootstrap，使用简单的alert
          alert(`${type.toUpperCase()}: ${message}`);
        }
      };
    }
    
    console.log('数据点功能修复脚本应用完成');
  });
})();

/**
 * Modbus数据点写入功能修复脚本
 * 专门修复写入数据点时的DOM元素访问问题
 */

console.log('[数据点写入修复] 开始初始化写入功能修复...');

// 等待DOM加载完成
document.addEventListener('DOMContentLoaded', function() {
    console.log('[数据点写入修复] DOM已加载，开始修复写入功能');
    
    // 修复写入数据点值函数
    if (typeof window.writeDataPointValue === 'function') {
        console.log('[数据点写入修复] 发现现有的writeDataPointValue函数，进行增强');
        
        // 保存原始函数
        const originalWriteDataPointValue = window.writeDataPointValue;
        
        // 创建增强版本
        window.writeDataPointValue = async function() {
            console.log('[数据点写入修复] 开始执行增强的写入函数');
            
            try {
                // 检查必要的DOM元素
                const requiredElements = [
                    'writeDataPointIdentifier',
                    'newValueInput'
                ];
                
                let missingElements = [];
                for (const elementId of requiredElements) {
                    const element = document.getElementById(elementId);
                    if (!element) {
                        missingElements.push(elementId);
                    }
                }
                
                if (missingElements.length > 0) {
                    const errorMsg = `缺少必要的DOM元素: ${missingElements.join(', ')}`;
                    console.error('[数据点写入修复]', errorMsg);
                    if (typeof showError === 'function') {
                        showError(errorMsg);
                    } else {
                        alert(errorMsg);
                    }
                    return;
                }
                
                console.log('[数据点写入修复] 所有必要元素都存在，调用原始函数');
                return await originalWriteDataPointValue();
                
            } catch (error) {
                console.error('[数据点写入修复] 写入过程中发生错误:', error);
                if (typeof showError === 'function') {
                    showError(`写入失败: ${error.message}`);
                } else {
                    alert(`写入失败: ${error.message}`);
                }
            }
        };
        
        console.log('[数据点写入修复] writeDataPointValue函数已增强');
    } else {
        console.warn('[数据点写入修复] 未找到writeDataPointValue函数');
    }
    
    // 修复showWriteValueModal函数
    if (typeof window.showWriteValueModal === 'function') {
        console.log('[数据点写入修复] 发现现有的showWriteValueModal函数，进行增强');
        
        // 保存原始函数
        const originalShowWriteValueModal = window.showWriteValueModal;
        
        // 创建增强版本
        window.showWriteValueModal = function(id) {
            console.log('[数据点写入修复] 开始执行增强的显示写入弹窗函数, ID:', id);
            
            try {
                // 调用原始函数
                const result = originalShowWriteValueModal(id);
                
                // 额外的安全检查
                setTimeout(() => {
                    const newValueInput = document.getElementById('newValueInput');
                    if (newValueInput) {
                        console.log('[数据点写入修复] 确认newValueInput元素存在且可访问');
                    } else {
                        console.error('[数据点写入修复] newValueInput元素不存在！');
                    }
                }, 100);
                
                return result;
                
            } catch (error) {
                console.error('[数据点写入修复] 显示写入弹窗时发生错误:', error);
                if (typeof showError === 'function') {
                    showError(`无法显示写入弹窗: ${error.message}`);
                } else {
                    alert(`无法显示写入弹窗: ${error.message}`);
                }
            }
        };
        
        console.log('[数据点写入修复] showWriteValueModal函数已增强');
    } else {
        console.warn('[数据点写入修复] 未找到showWriteValueModal函数');
    }
    
    console.log('[数据点写入修复] 写入功能修复完成');
});

// 提供一个测试函数
window.testWriteFunction = function() {
    console.log('[数据点写入修复] 开始测试写入功能');
    
    const elements = [
        'writeValueModal',
        'writeDataPointId',
        'writeDataPointIdentifier', 
        'dataPointNameText',
        'currentValueText',
        'newValueInput',
        'valueFormatHelp'
    ];
    
    let results = [];
    elements.forEach(id => {
        const element = document.getElementById(id);
        const exists = element !== null;
        results.push(`${id}: ${exists ? '✓' : '✗'}`);
        console.log(`[数据点写入修复] ${id}: ${exists ? '存在' : '不存在'}`);
    });
    
    console.log('[数据点写入修复] 测试结果:', results.join(', '));
    return results;
};

console.log('[数据点写入修复] 修复脚本加载完成'); 
// Modbus设置界面控制
$(document).ready(function() {
  // API基础URL
  const API_BASE_URL = '/api/modbus';
  
  // 加载Modbus配置
  function loadModbusConfig() {
    axios.get(`${API_BASE_URL}/connection/config`)
      .then(response => {
        if (response.data.success) {
          const config = response.data.data;
          
          // 填充表单
          $('#modbus-host').val(config.host);
          $('#modbus-port').val(config.port);
          $('#modbus-unit-id').val(config.unitId);
          $('#modbus-timeout').val(config.timeout);
          $('#modbus-auto-reconnect').prop('checked', config.autoReconnect);
          $('#modbus-max-reconnect-attempts').val(config.maxReconnectAttempts);
          $('#modbus-keep-alive-enabled').prop('checked', config.keepAliveEnabled);
          $('#modbus-keep-alive-interval').val(config.keepAliveInterval);
          $('#modbus-keep-alive-address').val(config.keepAliveAddress);
          $('#modbus-keep-alive-function-code').val(config.keepAliveFunctionCode);
          
          // 更新保活设置的可见性
          toggleKeepAliveSettings();
          
          console.log('Modbus配置已加载');
        } else {
          showToast('加载Modbus配置失败: ' + response.data.error, 'error');
        }
      })
      .catch(error => {
        console.error('加载Modbus配置出错:', error);
        showToast('加载Modbus配置出错: ' + (error.response?.data?.error || error.message), 'error');
      });
  }
  
  // 保存Modbus配置
  function saveModbusConfig() {
    const config = {
      host: $('#modbus-host').val(),
      port: parseInt($('#modbus-port').val()),
      unitId: parseInt($('#modbus-unit-id').val()),
      timeout: parseInt($('#modbus-timeout').val()),
      autoReconnect: $('#modbus-auto-reconnect').prop('checked'),
      maxReconnectAttempts: parseInt($('#modbus-max-reconnect-attempts').val()),
      keepAliveEnabled: $('#modbus-keep-alive-enabled').prop('checked'),
      keepAliveInterval: parseInt($('#modbus-keep-alive-interval').val()),
      keepAliveAddress: parseInt($('#modbus-keep-alive-address').val()),
      keepAliveFunctionCode: parseInt($('#modbus-keep-alive-function-code').val())
    };
    
    axios.put(`${API_BASE_URL}/connection/config`, config)
      .then(response => {
        if (response.data.success) {
          showToast('Modbus配置已保存', 'success');
        } else {
          showToast('保存Modbus配置失败: ' + response.data.error, 'error');
        }
      })
      .catch(error => {
        console.error('保存Modbus配置出错:', error);
        showToast('保存Modbus配置出错: ' + (error.response?.data?.error || error.message), 'error');
      });
  }
  
  // 测试Modbus连接
  function testModbusConnection() {
    const config = {
      host: $('#modbus-host').val(),
      port: parseInt($('#modbus-port').val()),
      unitId: parseInt($('#modbus-unit-id').val()),
      timeout: parseInt($('#modbus-timeout').val())
    };
    
    axios.post(`${API_BASE_URL}/test-connection`, config)
      .then(response => {
        if (response.data.success) {
          showToast('Modbus连接测试成功', 'success');
        } else {
          showToast('Modbus连接测试失败: ' + response.data.error, 'error');
        }
      })
      .catch(error => {
        console.error('Modbus连接测试出错:', error);
        showToast('Modbus连接测试出错: ' + (error.response?.data?.error || error.message), 'error');
      });
  }
  
  // 显示/隐藏保活设置
  function toggleKeepAliveSettings() {
    if ($('#modbus-keep-alive-enabled').prop('checked')) {
      $('.keep-alive-settings').show();
    } else {
      $('.keep-alive-settings').hide();
    }
  }
  
  // 显示提示信息
  function showToast(message, type = 'info') {
    if (typeof Toastify === 'function') {
      Toastify({
        text: message,
        duration: 3000,
        gravity: 'top',
        position: 'right',
        backgroundColor: type === 'success' ? '#4CAF50' : 
                       type === 'error' ? '#F44336' : 
                       type === 'warning' ? '#FF9800' : '#2196F3'
      }).showToast();
    } else {
      alert(message);
    }
  }
  
  // 绑定事件
  $('#modbus-settings-form').on('submit', function(e) {
    e.preventDefault();
    saveModbusConfig();
  });
  
  $('#test-modbus-connection').on('click', function() {
    testModbusConnection();
  });
  
  $('#modbus-keep-alive-enabled').on('change', function() {
    toggleKeepAliveSettings();
  });
  
  // 初始化加载
  loadModbusConfig();
}); 
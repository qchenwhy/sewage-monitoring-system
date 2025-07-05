// MQTT设置界面控制
$(document).ready(function() {
  // API基础URL
  const API_BASE_URL = '/api/modbus';
  
  // 加载MQTT配置
  function loadMqttConfig() {
    axios.get(`${API_BASE_URL}/mqtt/config`)
      .then(response => {
        if (response.data.success) {
          const config = response.data.data;
          
          // 填充表单
          $('#mqtt-url').val(config.url);
          $('#mqtt-client-id').val(config.options.clientId);
          $('#mqtt-username').val(config.options.username);
          $('#mqtt-password').val(config.options.password);
          $('#mqtt-keepalive').val(config.options.keepalive);
          $('#mqtt-reconnect-period').val(config.options.reconnectPeriod);
          $('#mqtt-connect-timeout').val(config.options.connectTimeout);
          $('#mqtt-clean').prop('checked', config.options.clean);
          $('#mqtt-auto-reconnect').prop('checked', config.autoReconnect);
          $('#mqtt-max-reconnect-attempts').val(config.maxReconnectAttempts);
          
          console.log('MQTT配置已加载');
        } else {
          showToast('加载MQTT配置失败: ' + response.data.error, 'error');
        }
      })
      .catch(error => {
        console.error('加载MQTT配置出错:', error);
        showToast('加载MQTT配置出错: ' + (error.response?.data?.error || error.message), 'error');
      });
  }
  
  // 保存MQTT配置
  function saveMqttConfig() {
    const config = {
      url: $('#mqtt-url').val(),
      options: {
        clientId: $('#mqtt-client-id').val(),
        username: $('#mqtt-username').val(),
        password: $('#mqtt-password').val(),
        keepalive: parseInt($('#mqtt-keepalive').val()),
        reconnectPeriod: parseInt($('#mqtt-reconnect-period').val()),
        connectTimeout: parseInt($('#mqtt-connect-timeout').val()),
        clean: $('#mqtt-clean').prop('checked')
      },
      autoReconnect: $('#mqtt-auto-reconnect').prop('checked'),
      maxReconnectAttempts: parseInt($('#mqtt-max-reconnect-attempts').val())
    };
    
    axios.put(`${API_BASE_URL}/mqtt/config`, config)
      .then(response => {
        if (response.data.success) {
          showToast('MQTT配置已保存', 'success');
        } else {
          showToast('保存MQTT配置失败: ' + response.data.error, 'error');
        }
      })
      .catch(error => {
        console.error('保存MQTT配置出错:', error);
        showToast('保存MQTT配置出错: ' + (error.response?.data?.error || error.message), 'error');
      });
  }
  
  // 切换数据源类型
  function switchDataSourceType(type) {
    axios.put(`${API_BASE_URL}/data-source/type`, { type })
      .then(response => {
        if (response.data.success) {
          showToast(`已切换到${type === 'mqtt' ? 'MQTT' : 'Modbus'}数据源`, 'success');
          
          // 延迟一秒后刷新页面
          setTimeout(() => {
            location.reload();
          }, 1000);
        } else {
          showToast('切换数据源失败: ' + response.data.error, 'error');
        }
      })
      .catch(error => {
        console.error('切换数据源出错:', error);
        showToast('切换数据源出错: ' + (error.response?.data?.error || error.message), 'error');
      });
  }
  
  // 加载当前数据源类型
  function loadDataSourceType() {
    axios.get(`${API_BASE_URL}/connection/config`)
      .then(response => {
        if (response.data.success) {
          const config = response.data.data;
          const dataSourceType = config.dataSourceType || 'modbus';
          
          // 更新界面显示
          if (dataSourceType === 'mqtt') {
            $('#data-source-mqtt').prop('checked', true);
            $('#mqtt-settings-panel').show();
            $('#modbus-settings-panel').hide();
          } else {
            $('#data-source-modbus').prop('checked', true);
            $('#mqtt-settings-panel').hide();
            $('#modbus-settings-panel').show();
          }
          
          console.log(`当前数据源类型: ${dataSourceType}`);
        }
      })
      .catch(error => {
        console.error('加载数据源类型出错:', error);
      });
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
  $('#mqtt-settings-form').on('submit', function(e) {
    e.preventDefault();
    saveMqttConfig();
  });
  
  // 数据源类型切换
  $('input[name="data-source-type"]').on('change', function() {
    const type = $(this).val();
    switchDataSourceType(type);
  });
  
  // 生成随机客户端ID
  $('#generate-client-id').on('click', function() {
    const randomId = 'modbus_mqtt_' + Math.random().toString(16).substring(2, 10);
    $('#mqtt-client-id').val(randomId);
  });
  
  // 测试MQTT连接
  $('#test-mqtt-connection').on('click', function() {
    axios.post(`${API_BASE_URL}/mqtt/test-connection`, {
      url: $('#mqtt-url').val(),
      options: {
        clientId: $('#mqtt-client-id').val(),
        username: $('#mqtt-username').val(),
        password: $('#mqtt-password').val()
      }
    })
      .then(response => {
        if (response.data.success) {
          showToast('MQTT连接测试成功', 'success');
        } else {
          showToast('MQTT连接测试失败: ' + response.data.error, 'error');
        }
      })
      .catch(error => {
        console.error('MQTT连接测试出错:', error);
        showToast('MQTT连接测试出错: ' + (error.response?.data?.error || error.message), 'error');
      });
  });
  
  // 初始化加载
  loadDataSourceType();
  loadMqttConfig();
}); 
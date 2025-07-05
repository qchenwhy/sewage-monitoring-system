/**
 * 单点报警管理 JavaScript
 * 负责单点报警规则的创建、编辑和管理
 */

// 全局变量
let dataPoints = [];
let alarmRules = [];

// 页面初始化
document.addEventListener('DOMContentLoaded', function() {
  // 初始化页面
  initializeSinglePointAlarm();
});

/**
 * 初始化单点报警模块
 */
function initializeSinglePointAlarm() {
  console.log('初始化单点报警模块');
  
  // 加载数据点
  loadDataPoints();
  
  // 绑定事件监听器
  bindEventListeners();
}

/**
 * 绑定事件监听器
 */
function bindEventListeners() {
  // 报警类型切换
  const alarmTypeSelect = document.getElementById('singlePointAlarmTypeSelect');
  if (alarmTypeSelect) {
    alarmTypeSelect.addEventListener('change', onAlarmTypeChange);
  }
  
  // 保存按钮
  const saveBtn = document.getElementById('saveSinglePointAlarmBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveAlarmRule);
  }
  
  // 表单输入变化时更新预览
  const form = document.getElementById('singlePointAlarmForm');
  if (form) {
    form.addEventListener('input', updateConfigPreview);
    form.addEventListener('change', updateConfigPreview);
  }
  
  // 阈值操作符变化时更新示例
  const thresholdOperator = document.getElementById('singlePointThresholdOperator');
  if (thresholdOperator) {
    thresholdOperator.addEventListener('change', updateContentExample);
  }
  
  // 数据点选择变化时更新示例
  const dataPointSelect = document.getElementById('singlePointDataPointSelect');
  if (dataPointSelect) {
    dataPointSelect.addEventListener('change', updateContentExample);
  }
}

/**
 * 显示单点报警配置模态框
 */
function showSinglePointAlarmModal() {
  console.log('显示单点报警配置模态框');
  
  // 显示模态框
  const modalElement = document.getElementById('singlePointAlarmModal');
  if (!modalElement) {
    console.error('❌ 找不到模态框元素');
    alert('模态框加载失败，请刷新页面重试');
    return;
  }
  
  const modal = new bootstrap.Modal(modalElement);
  modal.show();
  
  // 在模态框显示后执行初始化
  modalElement.addEventListener('shown.bs.modal', function() {
    console.log('模态框已显示，开始初始化...');
    
    // 检查关键元素是否存在
    const elements = {
      alarmTypeSelect: document.getElementById('singlePointAlarmTypeSelect'),
      dataPointSelect: document.getElementById('singlePointDataPointSelect'),
      noUpdateConfig: document.getElementById('singlePointNoUpdateConfig'),
      thresholdConfig: document.getElementById('singlePointThresholdConfig')
    };
    
    console.log('关键元素检查:', {
      alarmTypeSelect: !!elements.alarmTypeSelect,
      dataPointSelect: !!elements.dataPointSelect,
      noUpdateConfig: !!elements.noUpdateConfig,
      thresholdConfig: !!elements.thresholdConfig
    });
    
    // 重置表单
    resetAlarmForm();
    
    // 设置报警类型默认值（在表单重置之后）
    if (elements.alarmTypeSelect) {
      console.log('表单重置后，报警类型当前值:', elements.alarmTypeSelect.value);
      console.log('报警类型选项列表:', Array.from(elements.alarmTypeSelect.options).map(opt => `${opt.value}: ${opt.textContent}`));
      
      // 强制设置为第一个有效选项
      elements.alarmTypeSelect.value = 'no_update';
      console.log('强制设置报警类型后的值:', elements.alarmTypeSelect.value);
      
      // 如果设置失败，尝试通过索引设置
      if (!elements.alarmTypeSelect.value || elements.alarmTypeSelect.value === '') {
        console.log('通过value设置失败，尝试通过selectedIndex设置...');
        elements.alarmTypeSelect.selectedIndex = 0; // 选择第一个选项
        console.log('通过selectedIndex设置后的值:', elements.alarmTypeSelect.value);
        console.log('selectedIndex:', elements.alarmTypeSelect.selectedIndex);
      }
    }
    
    // 重新绑定事件监听器
    bindEventListeners();
    
    // 重新加载数据点
    loadDataPoints().then(() => {
      console.log('数据点加载完成，下拉列表选项数量:', 
        document.getElementById('singlePointDataPointSelect').options.length);
      
      // 强制刷新下拉列表显示
      const dataPointSelect = document.getElementById('singlePointDataPointSelect');
      if (dataPointSelect && dataPointSelect.options.length > 1) {
        console.log('数据点选项示例:', Array.from(dataPointSelect.options).slice(0, 3).map(opt => opt.textContent));
      }
    });
    
    // 设置正确的显示状态（在所有初始化完成后执行）
    setTimeout(() => {
      console.log('延迟触发报警类型变化处理...');
      
      // 最终确保报警类型值正确
      const alarmTypeSelect = document.getElementById('singlePointAlarmTypeSelect');
      if (alarmTypeSelect) {
        console.log('最终检查报警类型值:', alarmTypeSelect.value);
        console.log('selectedIndex:', alarmTypeSelect.selectedIndex);
        console.log('options:', Array.from(alarmTypeSelect.options).map((opt, i) => `${i}: ${opt.value} (${opt.selected ? 'selected' : 'not selected'})`));
        
        // 如果值仍然为空，强制修复
        if (!alarmTypeSelect.value || alarmTypeSelect.value === '') {
          console.log('最终修复：报警类型值仍为空，强制设置...');
          
          // 方法1：直接设置选项的selected属性
          const noUpdateOption = alarmTypeSelect.querySelector('option[value="no_update"]');
          if (noUpdateOption) {
            noUpdateOption.selected = true;
            console.log('通过option.selected设置完成，当前值:', alarmTypeSelect.value);
          }
          
          // 方法2：如果还是不行，通过DOM操作强制设置
          if (!alarmTypeSelect.value) {
            alarmTypeSelect.innerHTML = `
              <option value="no_update" selected>无更新报警</option>
              <option value="threshold">阈值报警</option>
            `;
            console.log('通过重新创建HTML设置完成，当前值:', alarmTypeSelect.value);
          }
        }
        
        console.log('最终报警类型值:', alarmTypeSelect.value);
      }
      
      onAlarmTypeChange();
      
      // 额外确保显示状态正确
      setTimeout(() => {
        console.log('二次确认显示状态...');
        onAlarmTypeChange();
      }, 100);
    }, 200);
    
    // 初始化配置预览
    updateConfigPreview();
    updateContentExample();
  }, { once: true }); // 只执行一次
}

/**
 * 加载数据点列表
 */
async function loadDataPoints() {
  console.log('加载数据点列表...');
  
  try {
    // 尝试多个API端点
    const endpoints = [
      '/api/modbus/datapoints',
      '/api/modbus/data-points',
      '/api/modbus/values'
    ];
    
    let loadedDataPoints = [];
    
    for (const endpoint of endpoints) {
      try {
        console.log(`尝试从 ${endpoint} 加载数据点`);
        const response = await fetch(endpoint);
        
        console.log(`${endpoint} 响应状态:`, response.status, response.statusText);
        
        if (response.ok) {
          const data = await response.json();
          console.log(`从 ${endpoint} 获取到数据:`, data);
          
          // 处理不同的响应格式
          if (Array.isArray(data)) {
            loadedDataPoints = data;
            console.log('识别为数组格式，数据点数量:', loadedDataPoints.length);
          } else if (data.dataPoints && Array.isArray(data.dataPoints)) {
            loadedDataPoints = data.dataPoints;
            console.log('识别为 dataPoints 字段格式，数据点数量:', loadedDataPoints.length);
          } else if (data.data && Array.isArray(data.data)) {
            loadedDataPoints = data.data;
            console.log('识别为 data 字段格式，数据点数量:', loadedDataPoints.length);
          } else if (data.success && data.data) {
            if (Array.isArray(data.data)) {
              loadedDataPoints = data.data;
              console.log('识别为 success.data 数组格式，数据点数量:', loadedDataPoints.length);
            } else if (typeof data.data === 'object') {
              // 如果是对象格式，转换为数组
              loadedDataPoints = Object.entries(data.data).map(([key, value]) => ({
                identifier: key,
                name: key,
                value: value.value || value,
                ...value
              }));
              console.log('识别为 success.data 对象格式，转换后数据点数量:', loadedDataPoints.length);
            }
          } else {
            console.log('未识别的数据格式，尝试直接使用:', data);
            // 尝试将对象转换为数组
            if (typeof data === 'object' && data !== null) {
              loadedDataPoints = Object.entries(data).map(([key, value]) => ({
                identifier: key,
                name: key,
                value: typeof value === 'object' ? value.value || value : value,
                ...(typeof value === 'object' ? value : {})
              }));
              console.log('对象转数组后数据点数量:', loadedDataPoints.length);
            }
          }
          
          if (loadedDataPoints.length > 0) {
            console.log(`✓ 成功从 ${endpoint} 加载 ${loadedDataPoints.length} 个数据点`);
            console.log('数据点示例:', loadedDataPoints.slice(0, 3));
            break;
          } else {
            console.log(`${endpoint} 返回数据为空，尝试下一个端点`);
          }
        } else {
          console.log(`${endpoint} 请求失败:`, response.status, response.statusText);
        }
      } catch (error) {
        console.warn(`从 ${endpoint} 加载数据点失败:`, error);
      }
    }
    
    // 如果所有端点都失败，创建测试数据
    if (loadedDataPoints.length === 0) {
      console.log('所有API端点都失败，创建测试数据...');
      loadedDataPoints = [
        { identifier: 'test_temp_1', name: '温度传感器1', value: 25.5, address: '40001' },
        { identifier: 'test_humidity_1', name: '湿度传感器1', value: 60.2, address: '40002' },
        { identifier: 'test_pressure_1', name: '压力传感器1', value: 1013.25, address: '40003' }
      ];
      console.log('创建了测试数据点:', loadedDataPoints.length, '个');
    }
    
    // 保存数据点
    dataPoints = loadedDataPoints;
    console.log('最终保存的数据点数量:', dataPoints.length);
    console.log('数据点详情:', dataPoints);
    
    // 填充数据点下拉列表
    populateDataPointSelect();
    
    return dataPoints;
    
  } catch (error) {
    console.error('加载数据点失败:', error);
    showNotification('加载数据点失败: ' + error.message, 'error');
    
    // 创建默认测试数据
    dataPoints = [
      { identifier: 'test_temp_1', name: '温度传感器1', value: 25.5 },
      { identifier: 'test_humidity_1', name: '湿度传感器1', value: 60.2 }
    ];
    populateDataPointSelect();
    return dataPoints;
  }
}

/**
 * 填充数据点下拉列表
 */
function populateDataPointSelect() {
  console.log('开始填充数据点下拉列表...');
  
  const select = document.getElementById('singlePointDataPointSelect');
  if (!select) {
    console.error('❌ 找不到数据点选择元素 (ID: singlePointDataPointSelect)');
    return;
  }
  
  console.log('找到数据点选择元素，当前选项数量:', select.options.length);
  console.log('可用数据点数量:', dataPoints.length);
  
  // 清空现有选项
  select.innerHTML = '';
  
  // 创建默认选项
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = '-- 请选择数据点 --';
  select.appendChild(defaultOpt);
  
  console.log('清空选项后，剩余选项数量:', select.options.length);
  
  // 添加数据点选项
  dataPoints.forEach((dataPoint, index) => {
    console.log(`添加数据点 ${index + 1}:`, dataPoint);
    
    const option = document.createElement('option');
    option.value = dataPoint.identifier || dataPoint.name || dataPoint.id || `point_${index}`;
    
    // 构建显示文本
    let displayText = dataPoint.name || dataPoint.identifier || dataPoint.id || `数据点${index + 1}`;
    
    // 如果有额外信息，添加到选项文本中
    if (dataPoint.identifier && dataPoint.name && dataPoint.identifier !== dataPoint.name) {
      displayText = `${dataPoint.name} (${dataPoint.identifier})`;
    }
    
    // 如果有地址信息，也添加进去
    if (dataPoint.address) {
      displayText += ` [${dataPoint.address}]`;
    }
    
    option.textContent = displayText;
    
    // 添加数据属性
    option.setAttribute('data-identifier', dataPoint.identifier || '');
    option.setAttribute('data-name', dataPoint.name || '');
    option.setAttribute('data-address', dataPoint.address || '');
    option.setAttribute('data-format', dataPoint.format || '');
    option.setAttribute('data-value', dataPoint.value || '');
    
    select.appendChild(option);
    console.log(`✓ 添加选项: ${option.value} - ${option.textContent}`);
  });
  
  console.log(`✓ 填充完成，总选项数量: ${select.options.length} (包含默认选项)`);
  console.log('数据点下拉列表前3个选项:', Array.from(select.options).slice(0, 4).map(opt => `${opt.value}: ${opt.textContent}`));
  
  // 强制刷新下拉列表显示状态
  setTimeout(() => {
    console.log('延迟检查下拉列表最终状态:');
    console.log('- 元素是否可见:', select.offsetHeight > 0);
    console.log('- 选项数量:', select.options.length);
    console.log('- 当前选中值:', select.value);
    console.log('- 第一个有效选项:', select.options[1] ? select.options[1].textContent : 'none');
    
    // 如果选项存在但不可见，尝试强制重绘
    if (select.options.length > 1 && select.offsetHeight === 0) {
      console.log('检测到下拉列表不可见，尝试强制重绘...');
      select.style.display = 'none';
      setTimeout(() => {
        select.style.display = '';
      }, 10);
    }
  }, 100);
}

/**
 * 报警类型变化处理
 */
function onAlarmTypeChange() {
  console.log('=== onAlarmTypeChange 被调用 ===');
  
  const alarmTypeSelect = document.getElementById('singlePointAlarmTypeSelect');
  if (!alarmTypeSelect) {
    console.error('❌ 找不到报警类型选择元素');
    return;
  }
  
  const alarmType = alarmTypeSelect.value;
  console.log('当前选择的报警类型:', alarmType);
  
  const noUpdateConfig = document.getElementById('singlePointNoUpdateConfig');
  const thresholdConfig = document.getElementById('singlePointThresholdConfig');
  
  console.log('配置元素检查:', {
    noUpdateConfig: !!noUpdateConfig,
    thresholdConfig: !!thresholdConfig,
    noUpdateDisplay: noUpdateConfig ? noUpdateConfig.style.display : 'null',
    thresholdDisplay: thresholdConfig ? thresholdConfig.style.display : 'null'
  });
  
  if (!noUpdateConfig || !thresholdConfig) {
    console.error('❌ 找不到配置区域元素');
    console.error('noUpdateConfig:', noUpdateConfig);
    console.error('thresholdConfig:', thresholdConfig);
    return;
  }
  
  // 重置所有字段的必填要求
  const thresholdValueInput = document.getElementById('singlePointThresholdValue');
  if (thresholdValueInput) {
    thresholdValueInput.required = false;
  }
  
  if (alarmType === 'no_update') {
    console.log('设置为无更新报警模式');
    noUpdateConfig.style.display = 'block';
    thresholdConfig.style.display = 'none';
    
    console.log('无更新报警设置完成:', {
      noUpdateDisplay: noUpdateConfig.style.display,
      thresholdDisplay: thresholdConfig.style.display
    });
    
  } else if (alarmType === 'threshold') {
    console.log('设置为阈值报警模式');
    noUpdateConfig.style.display = 'none';
    thresholdConfig.style.display = 'block';
    
    // 设置阈值相关字段为必填
    if (thresholdValueInput) {
      thresholdValueInput.required = true;
      console.log('阈值输入框设置为必填');
    }
    
    console.log('阈值报警设置完成:', {
      noUpdateDisplay: noUpdateConfig.style.display,
      thresholdDisplay: thresholdConfig.style.display,
      thresholdRequired: thresholdValueInput ? thresholdValueInput.required : 'N/A'
    });
    
  } else {
    console.log('未知的报警类型:', alarmType);
  }
  
  // 强制重新渲染
  setTimeout(() => {
    console.log('延迟检查显示状态:', {
      alarmType: alarmType,
      noUpdateVisible: noUpdateConfig.style.display !== 'none',
      thresholdVisible: thresholdConfig.style.display !== 'none',
      noUpdateConfig: noUpdateConfig.offsetHeight > 0,
      thresholdConfig: thresholdConfig.offsetHeight > 0
    });
  }, 100);
  
  // 更新配置预览和示例
  updateConfigPreview();
  updateContentExample();
  
  console.log('=== onAlarmTypeChange 处理完成 ===');
}

/**
 * 更新配置预览
 */
function updateConfigPreview() {
  const preview = document.getElementById('singlePointConfigPreview');
  if (!preview) return;
  
  const formData = getFormData();
  
  let previewHTML = '';
  
  if (formData.dataPointId) {
    const dataPoint = dataPoints.find(dp => 
      (dp.identifier || dp.name || dp.id) === formData.dataPointId
    );
    const dataPointName = dataPoint ? (dataPoint.name || dataPoint.identifier) : formData.dataPointId;
    
    previewHTML += `<strong>数据点:</strong> ${dataPointName}<br>`;
  }
  
  previewHTML += `<strong>报警类型:</strong> ${formData.alarmType === 'no_update' ? '无更新报警' : '阈值报警'}<br>`;
  
  if (formData.alarmType === 'no_update') {
    previewHTML += `<strong>超时时间:</strong> ${formData.noUpdateTimeout || 300} 秒<br>`;
  } else if (formData.alarmType === 'threshold') {
    const operatorText = getOperatorText(formData.thresholdOperator);
    previewHTML += `<strong>条件:</strong> 数值 ${operatorText} ${formData.thresholdValue || '?'}<br>`;
    previewHTML += `<strong>持续时间:</strong> ${formData.thresholdDuration || 60} 秒<br>`;
    previewHTML += `<strong>检查间隔:</strong> ${formData.checkInterval || 10} 秒<br>`;
  }
  
  previewHTML += `<strong>报警级别:</strong> ${getLevelText(formData.alarmLevel)}<br>`;
  
  if (formData.enableNotification || formData.enableSound) {
    const notifications = [];
    if (formData.enableNotification) notifications.push('页面通知');
    if (formData.enableSound) notifications.push('声音报警');
    previewHTML += `<strong>通知方式:</strong> ${notifications.join(', ')}`;
  }
  
  preview.innerHTML = previewHTML;
}

/**
 * 更新内容示例
 */
function updateContentExample() {
  const example = document.getElementById('singlePointContentExample');
  if (!example) return;
  
  const formData = getFormData();
  
  let exampleText = '示例: ';
  
  if (formData.dataPointId) {
    const dataPoint = dataPoints.find(dp => 
      (dp.identifier || dp.name || dp.id) === formData.dataPointId
    );
    const dataPointName = dataPoint ? (dataPoint.name || dataPoint.identifier) : '数据点';
    
    if (formData.alarmType === 'no_update') {
      const timeout = formData.noUpdateTimeout || 300;
      const timeText = timeout >= 60 ? `${Math.floor(timeout/60)}分钟` : `${timeout}秒`;
      exampleText += `"${dataPointName}数据异常，超过${timeText}未更新"`;
    } else if (formData.alarmType === 'threshold') {
      const operatorText = getOperatorText(formData.thresholdOperator);
      const value = formData.thresholdValue || 'X';
      exampleText += `"${dataPointName}数值${operatorText}${value}，触发阈值报警"`;
    }
  } else {
    exampleText += '"请先选择数据点"';
  }
  
  example.textContent = exampleText;
}

/**
 * 获取操作符文本
 */
function getOperatorText(operator) {
  const operators = {
    'greater_than': '大于',
    'greater_equal': '大于等于',
    'less_than': '小于',
    'less_equal': '小于等于',
    'equals': '等于',
    'not_equals': '不等于'
  };
  return operators[operator] || operator;
}

/**
 * 获取级别文本
 */
function getLevelText(level) {
  const levels = {
    'low': '低级',
    'medium': '中级',
    'high': '高级'
  };
  return levels[level] || level;
}

/**
 * 获取表单数据
 */
function getFormData() {
  return {
    ruleName: document.getElementById('singlePointAlarmRuleName')?.value || '',
    dataPointId: document.getElementById('singlePointDataPointSelect')?.value || '',
    alarmType: document.getElementById('singlePointAlarmTypeSelect')?.value || 'no_update',
    noUpdateTimeout: parseInt(document.getElementById('singlePointNoUpdateTimeout')?.value) || 300,
    thresholdOperator: document.getElementById('singlePointThresholdOperator')?.value || 'greater_than',
    thresholdValue: parseFloat(document.getElementById('singlePointThresholdValue')?.value) || 0,
    thresholdDuration: parseInt(document.getElementById('singlePointThresholdDuration')?.value) || 60,
    checkInterval: parseInt(document.getElementById('singlePointCheckInterval')?.value) || 10,
    alarmLevel: document.getElementById('singlePointAlarmLevel')?.value || 'medium',
    alarmContent: document.getElementById('singlePointAlarmContent')?.value || '',
    enableNotification: document.getElementById('singlePointEnableNotification')?.checked || false,
    enableSound: document.getElementById('singlePointEnableSound')?.checked || false
  };
}

/**
 * 重置表单
 */
function resetAlarmForm() {
  console.log('重置表单...');
  const form = document.getElementById('singlePointAlarmForm');
  if (form) {
    form.reset();
    
    // 重置为默认值
    const alarmTypeSelect = document.getElementById('singlePointAlarmTypeSelect');
    const alarmLevel = document.getElementById('singlePointAlarmLevel');
    const enableNotification = document.getElementById('singlePointEnableNotification');
    const enableSound = document.getElementById('singlePointEnableSound');
    const noUpdateTimeout = document.getElementById('singlePointNoUpdateTimeout');
    const thresholdDuration = document.getElementById('singlePointThresholdDuration');
    const checkInterval = document.getElementById('singlePointCheckInterval');
    const thresholdValue = document.getElementById('singlePointThresholdValue');
    
    // 确保报警类型选择器设置正确
    if (alarmTypeSelect) {
      alarmTypeSelect.value = 'no_update';
      console.log('表单重置后设置报警类型为:', alarmTypeSelect.value);
    }
    
    if (alarmLevel) alarmLevel.value = 'medium';
    if (enableNotification) enableNotification.checked = true;
    if (enableSound) enableSound.checked = false;
    if (noUpdateTimeout) noUpdateTimeout.value = 300;
    if (thresholdDuration) thresholdDuration.value = 60;
    if (checkInterval) checkInterval.value = 10;
    if (thresholdValue) thresholdValue.required = false;
    
    console.log('表单重置完成，当前报警类型:', alarmTypeSelect ? alarmTypeSelect.value : 'null');
    
    // 不要在这里设置显示状态，让onAlarmTypeChange来处理
    // 这样可以避免与后续的状态设置冲突
  }
}

/**
 * 验证表单
 */
function validateForm() {
  const formData = getFormData();
  const errors = [];
  
  // 基本验证
  if (!formData.ruleName.trim()) {
    errors.push('请输入规则名称');
  }
  
  if (!formData.dataPointId) {
    errors.push('请选择监控数据点');
  }
  
  if (!formData.alarmContent.trim()) {
    errors.push('请输入报警内容');
  }
  
  // 阈值报警验证
  if (formData.alarmType === 'threshold') {
    if (isNaN(formData.thresholdValue)) {
      errors.push('请输入有效的阈值');
    }
    
    if (formData.thresholdDuration < 1) {
      errors.push('持续时间必须大于0秒');
    }
    
    if (formData.checkInterval < 1) {
      errors.push('检查间隔必须大于0秒');
    }
  } else if (formData.alarmType === 'no_update') {
    if (formData.noUpdateTimeout < 10) {
      errors.push('超时时间必须大于等于10秒');
    }
  }
  
  return errors;
}

/**
 * 保存报警规则
 */
async function saveAlarmRule() {
  console.log('保存报警规则');
  
  // 验证表单
  const errors = validateForm();
  if (errors.length > 0) {
    showNotification('表单验证失败：\n' + errors.join('\n'), 'error');
    return;
  }
  
  const formData = getFormData();
  console.log('表单数据:', formData);
  
  try {
    // 找到选中的数据点信息
    const selectedDataPoint = dataPoints.find(dp => 
      (dp.identifier || dp.name || dp.id) === formData.dataPointId
    );
    
    // 构建报警规则数据
    const ruleData = {
      name: formData.ruleName,
      dataPointId: formData.dataPointId,
      dataPointName: selectedDataPoint ? (selectedDataPoint.name || selectedDataPoint.identifier) : formData.dataPointId,
      alarmType: formData.alarmType,
      config: formData.alarmType === 'no_update' ? {
        timeout: formData.noUpdateTimeout
      } : {
        operator: formData.thresholdOperator,
        value: formData.thresholdValue,
        duration: formData.thresholdDuration,
        checkInterval: formData.checkInterval
      },
      level: formData.alarmLevel,
      content: formData.alarmContent,
      notifications: {
        page: formData.enableNotification,
        sound: formData.enableSound
      }
    };
    
    console.log('准备保存的规则数据:', ruleData);
    
    // 调用后端API
    const response = await fetch('/api/single-point-alarm/rules', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(ruleData)
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('规则保存成功:', result);
      
      showNotification(`单点报警规则"${formData.ruleName}"创建成功！`, 'success');
      
      // 关闭模态框
      const modal = bootstrap.Modal.getInstance(document.getElementById('singlePointAlarmModal'));
      if (modal) {
        modal.hide();
      }
      
      // 清空表单
      resetAlarmForm();
      
      // 更新主页面显示
      if (typeof loadAndRenderMainPageRules === 'function') {
        loadAndRenderMainPageRules();
      }
    } else {
      const error = await response.json();
      throw new Error(error.error || '保存失败');
    }
    
  } catch (error) {
    console.error('保存报警规则失败:', error);
    showNotification('保存失败: ' + error.message, 'error');
  }
}

/**
 * 显示通知消息
 * @param {string} message 消息内容
 * @param {string} type 消息类型 (success, error, warning, info)
 */
function showNotification(message, type = 'info') {
  // 创建通知元素
  const notification = document.createElement('div');
  notification.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show position-fixed`;
  notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
  
  notification.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `;
  
  // 添加到页面
  document.body.appendChild(notification);
  
  // 3秒后自动移除
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 3000);
}

// 将函数暴露到全局作用域
window.showSinglePointAlarmModal = showSinglePointAlarmModal;
window.loadDataPoints = loadDataPoints;
window.onAlarmTypeChange = onAlarmTypeChange;
window.resetAlarmForm = resetAlarmForm;
window.validateForm = validateForm;
window.saveAlarmRule = saveAlarmRule;
window.showNotification = showNotification;

// 调试信息
console.log('单点报警模块已加载，函数已暴露到window对象:', {
  showSinglePointAlarmModal: typeof window.showSinglePointAlarmModal,
  loadDataPoints: typeof window.loadDataPoints,
  onAlarmTypeChange: typeof window.onAlarmTypeChange
}); 
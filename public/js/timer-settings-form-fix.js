/**
 * timer-settings-form-fix.js
 * 修复计时器设置表单不存在或无法保存设置的问题
 * 版本: 1.1 - 美化界面
 */

(function() {
    console.log('[表单修复] 开始检查计时器设置表单');
    
    // 添加样式
    function addStyles() {
        const styleId = 'timer-settings-styles';
        if (document.getElementById(styleId)) {
            return; // 已存在样式，不重复添加
        }
        
        const styleElement = document.createElement('style');
        styleElement.id = styleId;
        styleElement.textContent = `
            /* 模态框样式 */
            #timerSettingsModal {
                background-color: rgba(0, 0, 0, 0.6);
            }
            
            #timerSettingsModal .modal-content {
                background-color: #fff;
                max-width: 500px;
                margin: 10% auto;
                padding: 25px;
                border-radius: 10px;
                box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
                position: relative;
            }
            
            #timerSettingsModal h2 {
                color: #333;
                margin-top: 0;
                margin-bottom: 20px;
                border-bottom: 2px solid #f0f0f0;
                padding-bottom: 10px;
                font-size: 1.5rem;
                text-align: center;
            }
            
            #timerSettingsModal .close {
                position: absolute;
                right: 15px;
                top: 15px;
                font-size: 24px;
                font-weight: bold;
                color: #999;
                cursor: pointer;
                transition: color 0.2s;
            }
            
            #timerSettingsModal .close:hover {
                color: #f44336;
            }
            
            /* 表单样式 */
            #timerSettingsForm .form-group {
                margin-bottom: 15px;
                display: flex;
                align-items: center;
            }
            
            #timerSettingsForm label {
                width: 40%;
                color: #555;
                font-weight: 500;
                padding-right: 10px;
            }
            
            #timerSettingsForm input[type="number"] {
                width: 60%;
                padding: 8px 12px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 14px;
                transition: border-color 0.2s;
            }
            
            #timerSettingsForm input[type="number"]:focus {
                border-color: #4CAF50;
                outline: none;
                box-shadow: 0 0 5px rgba(76, 175, 80, 0.3);
            }
            
            #timerSettingsForm input[type="checkbox"] {
                width: 18px;
                height: 18px;
                margin-right: 5px;
            }
            
            #timerSettingsForm .checkbox-container {
                display: flex;
                align-items: center;
            }
            
            /* 按钮样式 */
            #timerSettingsForm .form-actions {
                display: flex;
                justify-content: space-between;
                margin-top: 25px;
                padding-top: 15px;
                border-top: 1px solid #f0f0f0;
            }
            
            #timerSettingsForm button {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 500;
                transition: all 0.2s;
            }
            
            #saveTimerSettings {
                background-color: #4CAF50;
                color: white;
            }
            
            #saveTimerSettings:hover {
                background-color: #45a049;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
            }
            
            #testAudioBtn {
                background-color: #2196F3;
                color: white;
            }
            
            #testAudioBtn:hover {
                background-color: #0b7dda;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
            }
            
            /* 通知样式 */
            .timer-notification {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 12px 20px;
                border-radius: 6px;
                color: white;
                font-size: 14px;
                font-family: 'Microsoft YaHei', Arial, sans-serif;
                box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
                z-index: 9999;
                display: flex;
                align-items: center;
                animation: fadeInRight 0.3s, fadeOut 0.3s 2.7s;
            }
            
            .timer-notification.info {
                background-color: #2196F3;
            }
            
            .timer-notification.success {
                background-color: #4CAF50;
            }
            
            .timer-notification.error {
                background-color: #F44336;
            }
            
            @keyframes fadeInRight {
                from {
                    opacity: 0;
                    transform: translateX(20px);
                }
                to {
                    opacity: 1;
                    transform: translateX(0);
                }
            }
            
            @keyframes fadeOut {
                from {
                    opacity: 1;
                }
                to {
                    opacity: 0;
                }
            }
        `;
        
        document.head.appendChild(styleElement);
        console.log('[表单修复] 添加样式完成');
    }
    
    // 在DOM加载完成后执行
    function initFormFix() {
        console.log('[表单修复] DOM已加载，开始修复表单');
        
        // 添加样式
        addStyles();
        
        // 检查模态框是否存在
        const modal = document.getElementById('timerSettingsModal');
        if (!modal) {
            console.error('[表单修复] 未找到设置模态框，无法修复');
            showNotification('无法修复设置表单：未找到模态框', 'error');
            return;
        }
        
        // 检查表单是否存在
        let form = document.getElementById('timerSettingsForm');
        if (!form) {
            console.warn('[表单修复] 未找到设置表单，将创建新表单');
            createSettingsForm(modal);
        } else {
            console.log('[表单修复] 找到现有表单，检查字段');
            ensureFormFields(form);
        }
        
        // 修复设置按钮
        fixSettingsButton();
        
        // 加载设置到表单
        setTimeout(loadSettingsToForm, 300);
        
        // 移除调试信息面板
        removeDebugPanel();
        
        console.log('[表单修复] 初始化完成');
    }
    
    // 移除调试信息面板
    function removeDebugPanel() {
        const debugPanels = document.querySelectorAll('.debug-panel, .debug-toggle');
        debugPanels.forEach(panel => {
            if (panel && panel.parentNode) {
                panel.parentNode.removeChild(panel);
                console.log('[表单修复] 已移除调试面板');
            }
        });
    }
    
    // 创建设置表单
    function createSettingsForm(modal) {
        console.log('[表单修复] 创建新的设置表单');
        
        // 查找或创建内容容器
        let modalContent = modal.querySelector('.modal-content');
        if (!modalContent) {
            modalContent = document.createElement('div');
            modalContent.className = 'modal-content';
            modal.appendChild(modalContent);
        }
        
        // 创建表单HTML
        const formHtml = `
            <span class="close">&times;</span>
            <h2>计时器设置</h2>
            <form id="timerSettingsForm">
                <div class="form-group">
                    <label for="repeatCount">提醒重复次数:</label>
                    <input type="number" id="repeatCount" name="repeatCount" min="1" max="10" value="2">
                </div>
                <div class="form-group">
                    <label for="intervalSeconds">提醒间隔(秒):</label>
                    <input type="number" id="intervalSeconds" name="intervalSeconds" min="1" max="60" value="5">
                </div>
                <div class="form-group">
                    <label for="autoStopOnResponse">有响应时停止提醒:</label>
                    <div class="checkbox-container">
                        <input type="checkbox" id="autoStopOnResponse" name="autoStopOnResponse" checked>
                    </div>
                </div>
                <div class="form-group">
                    <label for="audioLoopCount">音频循环次数:</label>
                    <input type="number" id="audioLoopCount" name="audioLoopCount" min="1" max="10" value="3">
                </div>
                <div class="form-group">
                    <label for="audioLoopInterval">音频循环间隔(毫秒):</label>
                    <input type="number" id="audioLoopInterval" name="audioLoopInterval" min="100" max="2000" value="500">
                </div>
                <div class="form-actions">
                    <button type="button" id="testAudioBtn">测试音频</button>
                    <button type="button" id="saveTimerSettings">保存设置</button>
                </div>
            </form>
        `;
        
        // 设置内容
        modalContent.innerHTML = formHtml;
        
        // 获取新创建的表单
        const newForm = document.getElementById('timerSettingsForm');
        
        // 添加事件监听器
        setupFormEventListeners(newForm);
        
        console.log('[表单修复] 表单创建完成');
        showNotification('已创建新的设置表单', 'info');
        
        return newForm;
    }
    
    // 确保表单有所有必要字段
    function ensureFormFields(form) {
        console.log('[表单修复] 检查表单字段');
        
        const requiredFields = [
            { id: 'repeatCount', type: 'number', default: 2 },
            { id: 'intervalSeconds', type: 'number', default: 5 },
            { id: 'autoStopOnResponse', type: 'checkbox', default: true },
            { id: 'audioLoopCount', type: 'number', default: 3 },
            { id: 'audioLoopInterval', type: 'number', default: 500 }
        ];
        
        // 检查每个必要字段
        let missingFields = [];
        requiredFields.forEach(field => {
            const input = form.querySelector(`[name="${field.id}"]`);
            if (!input) {
                missingFields.push(field);
            }
        });
        
        // 如果有缺失字段，添加它们
        if (missingFields.length > 0) {
            console.warn('[表单修复] 发现缺失字段:', missingFields.map(f => f.id).join(', '));
            
            // 获取表单结束标签前的位置
            const lastElement = form.lastElementChild;
            
            // 为每个缺失字段创建HTML
            missingFields.forEach(field => {
                const div = document.createElement('div');
                div.className = 'form-group';
                
                if (field.type === 'checkbox') {
                    div.innerHTML = `
                        <label for="${field.id}">${getFieldLabel(field.id)}:</label>
                        <input type="${field.type}" id="${field.id}" name="${field.id}" ${field.default ? 'checked' : ''}>
                    `;
                } else {
                    div.innerHTML = `
                        <label for="${field.id}">${getFieldLabel(field.id)}:</label>
                        <input type="${field.type}" id="${field.id}" name="${field.id}" value="${field.default}">
                    `;
                }
                
                // 插入到表单末尾或按钮前
                if (lastElement && lastElement.classList.contains('form-actions')) {
                    form.insertBefore(div, lastElement);
                } else {
                    form.appendChild(div);
                }
            });
            
            console.log('[表单修复] 已添加缺失字段');
        } else {
            console.log('[表单修复] 表单字段已完整');
        }
    }
    
    // 获取字段的标签文本
    function getFieldLabel(fieldId) {
        const labels = {
            'repeatCount': '提醒重复次数',
            'intervalSeconds': '提醒间隔(秒)',
            'autoStopOnResponse': '有响应时停止提醒',
            'audioLoopCount': '音频循环次数',
            'audioLoopInterval': '音频循环间隔(毫秒)'
        };
        return labels[fieldId] || fieldId;
    }
    
    // 设置表单事件监听器
    function setupFormEventListeners(form) {
        console.log('[表单修复] 设置表单事件监听器');
        
        // 设置保存按钮事件
        const saveBtn = document.getElementById('saveTimerSettings');
        if (saveBtn) {
            // 移除可能存在的事件
            const newSaveBtn = saveBtn.cloneNode(true);
            if (saveBtn.parentNode) {
                saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
            }
            
            // 添加新的事件监听器
            newSaveBtn.addEventListener('click', function(e) {
                console.log('[表单修复] 保存按钮被点击');
                saveSettings(form);
            });
        }
        
        // 设置测试按钮事件
        const testBtn = document.getElementById('testAudioBtn');
        if (testBtn) {
            // 移除可能存在的事件
            const newTestBtn = testBtn.cloneNode(true);
            if (testBtn.parentNode) {
                testBtn.parentNode.replaceChild(newTestBtn, testBtn);
            }
            
            // 添加新的事件监听器
            newTestBtn.addEventListener('click', function(e) {
                console.log('[表单修复] 测试按钮被点击');
                testAudioLoopPlayback();
            });
        }
        
        // 设置关闭按钮事件
        const closeBtn = document.querySelector('#timerSettingsModal .close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                document.getElementById('timerSettingsModal').style.display = 'none';
            });
        }
        
        // 设置点击模态框背景关闭
        const modal = document.getElementById('timerSettingsModal');
        if (modal) {
            modal.addEventListener('click', function(e) {
                if (e.target === modal) {
                    modal.style.display = 'none';
                }
            });
        }
        
        // 防止表单提交刷新页面
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            saveSettings(form);
        });
    }
    
    // 修复设置按钮
    function fixSettingsButton() {
        console.log('[表单修复] 修复设置按钮');
        
        // 查找设置按钮
        const settingsBtn = document.getElementById('toggleSettings');
        if (!settingsBtn) {
            console.error('[表单修复] 未找到设置按钮');
            return;
        }
        
        // 移除可能存在的事件
        const newBtn = settingsBtn.cloneNode(true);
        if (settingsBtn.parentNode) {
            settingsBtn.parentNode.replaceChild(newBtn, settingsBtn);
        }
        
        // 添加新的事件监听器
        newBtn.addEventListener('click', function(e) {
            console.log('[表单修复] 设置按钮被点击');
            e.preventDefault();
            
            const modal = document.getElementById('timerSettingsModal');
            if (modal) {
                // 加载最新设置到表单
                loadSettingsToForm();
                // 显示模态框
                modal.style.display = 'block';
            } else {
                console.error('[表单修复] 无法找到模态框');
            }
        });
        
        console.log('[表单修复] 设置按钮已修复');
    }
    
    // 从表单保存设置
    function saveSettings(form) {
        console.log('[表单修复] 开始保存设置');
        
        try {
            // 获取表单数据
            let settings = {};
            
            if (form) {
                // 尝试使用FormData API
                try {
                    const formData = new FormData(form);
                    settings = {
                        repeatCount: parseInt(formData.get('repeatCount') || 2),
                        intervalSeconds: parseInt(formData.get('intervalSeconds') || 5),
                        autoStopOnResponse: formData.get('autoStopOnResponse') === 'on',
                        audioLoopCount: parseInt(formData.get('audioLoopCount') || 3),
                        audioLoopInterval: parseInt(formData.get('audioLoopInterval') || 500)
                    };
                } catch (formError) {
                    // 如果FormData失败，手动获取值
                    console.warn('[表单修复] FormData失败，使用手动获取:', formError);
                    
                    settings = {
                        repeatCount: parseInt(form.querySelector('[name="repeatCount"]')?.value || 2),
                        intervalSeconds: parseInt(form.querySelector('[name="intervalSeconds"]')?.value || 5),
                        autoStopOnResponse: form.querySelector('[name="autoStopOnResponse"]')?.checked !== false,
                        audioLoopCount: parseInt(form.querySelector('[name="audioLoopCount"]')?.value || 3),
                        audioLoopInterval: parseInt(form.querySelector('[name="audioLoopInterval"]')?.value || 500)
                    };
                }
            } else {
                console.error('[表单修复] 无法找到表单');
                // 使用默认设置
                settings = {
                    repeatCount: 2,
                    intervalSeconds: 5,
                    autoStopOnResponse: true,
                    audioLoopCount: 3,
                    audioLoopInterval: 500
                };
            }
            
            // 验证设置
            if (isNaN(settings.repeatCount) || settings.repeatCount < 1) {
                console.warn('[表单修复] 重复次数无效，设为默认值2');
                settings.repeatCount = 2;
            }
            
            if (isNaN(settings.intervalSeconds) || settings.intervalSeconds < 1) {
                console.warn('[表单修复] 间隔秒数无效，设为默认值5');
                settings.intervalSeconds = 5;
            }
            
            if (isNaN(settings.audioLoopCount) || settings.audioLoopCount < 1) {
                console.warn('[表单修复] 音频循环次数无效，设为默认值3');
                settings.audioLoopCount = 3;
            }
            
            if (isNaN(settings.audioLoopInterval) || settings.audioLoopInterval < 100) {
                console.warn('[表单修复] 音频循环间隔无效，设为默认值500');
                settings.audioLoopInterval = 500;
            }
            
            // 保存到localStorage
            try {
                localStorage.setItem('timerSettings', JSON.stringify(settings));
                console.log('[表单修复] 设置已保存:', settings);
                
                // 更新全局变量
                window.timerSettings = settings;
                
                // 关闭模态框
                const modal = document.getElementById('timerSettingsModal');
                if (modal) {
                    modal.style.display = 'none';
                }
                
                showNotification('设置已保存', 'success');
                
                // 重新加载表单确保显示最新值
                setTimeout(loadSettingsToForm, 300);
                
                return true;
            } catch (e) {
                console.error('[表单修复] 保存设置到localStorage出错:', e);
                showNotification('保存设置失败: ' + e.message, 'error');
                return false;
            }
        } catch (e) {
            console.error('[表单修复] 保存设置时出错:', e);
            showNotification('保存设置出错: ' + e.message, 'error');
            return false;
        }
    }
    
    // 加载设置到表单
    function loadSettingsToForm() {
        console.log('[表单修复] 加载设置到表单');
        
        try {
            // 检查表单是否存在
            const form = document.getElementById('timerSettingsForm');
            if (!form) {
                console.error('[表单修复] 未找到表单');
                return false;
            }
            
            // 获取设置
            let settings = {};
            try {
                const savedSettings = localStorage.getItem('timerSettings');
                if (savedSettings) {
                    settings = JSON.parse(savedSettings);
                }
            } catch (e) {
                console.error('[表单修复] 加载设置出错:', e);
            }
            
            // 使用默认值填充缺失设置
            settings = {
                repeatCount: 2,
                intervalSeconds: 5,
                autoStopOnResponse: true,
                audioLoopCount: 3,
                audioLoopInterval: 500,
                ...settings
            };
            
            console.log('[表单修复] 当前设置:', settings);
            
            // 更新表单字段
            updateFormField(form, 'repeatCount', settings.repeatCount);
            updateFormField(form, 'intervalSeconds', settings.intervalSeconds);
            updateFormField(form, 'autoStopOnResponse', settings.autoStopOnResponse);
            updateFormField(form, 'audioLoopCount', settings.audioLoopCount);
            updateFormField(form, 'audioLoopInterval', settings.audioLoopInterval);
            
            // 同步到全局变量
            window.timerSettings = settings;
            
            console.log('[表单修复] 设置已加载到表单');
            return true;
        } catch (e) {
            console.error('[表单修复] 加载设置到表单时出错:', e);
            return false;
        }
    }
    
    // 更新表单字段值
    function updateFormField(form, fieldName, value) {
        const field = form.querySelector(`[name="${fieldName}"]`);
        if (!field) {
            console.warn(`[表单修复] 未找到字段 ${fieldName}`);
            return;
        }
        
        // 根据字段类型设置值
        if (field.type === 'checkbox') {
            field.checked = !!value;
        } else {
            field.value = value;
        }
        
        // 触发change事件
        field.dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`[表单修复] 已更新字段 ${fieldName} = ${value}`);
    }
    
    // 测试音频循环播放
    function testAudioLoopPlayback() {
        console.log('[表单修复] 测试音频循环播放');
        
        // 获取设置
        let settings = {};
        try {
            const savedSettings = localStorage.getItem('timerSettings');
            if (savedSettings) {
                settings = JSON.parse(savedSettings);
            }
        } catch (e) {
            console.error('[表单修复] 加载设置出错:', e);
        }
        
        // 使用默认值填充缺失设置
        settings = {
            audioLoopCount: 3,
            audioLoopInterval: 500,
            ...settings
        };
        
        // 显示通知
        showNotification(`测试音频 (循环${settings.audioLoopCount}次，间隔${settings.audioLoopInterval}毫秒)`, 'info');
        
        // 使用现有函数测试音频
        if (typeof window.testAudioLoopPlayback === 'function') {
            window.testAudioLoopPlayback();
        } else if (window.emergencyFunctions && typeof window.emergencyFunctions.testAudioLoopPlayback === 'function') {
            window.emergencyFunctions.testAudioLoopPlayback();
        } else {
            // 简单测试音频
            console.log('[表单修复] 使用简单测试音频函数');
            playTestAudio(settings.audioLoopCount, settings.audioLoopInterval);
        }
    }
    
    // 简单播放测试音频
    function playTestAudio(loopCount, interval) {
        const audioUrl = '/audio/alert.mp3';
        console.log(`[表单修复] 播放测试音频: ${audioUrl}, 循环${loopCount}次, 间隔${interval}ms`);
        
        let currentLoop = 0;
        
        function playLoop() {
            currentLoop++;
            console.log(`[表单修复] 播放循环 ${currentLoop}/${loopCount}`);
            
            const audio = new Audio(audioUrl);
            audio.volume = 0.5; // 降低音量避免过大声音
            
            audio.onended = function() {
                if (currentLoop < loopCount) {
                    // 继续下一循环
                    setTimeout(playLoop, interval);
                } else {
                    console.log('[表单修复] 测试音频播放完成');
                }
            };
            
            audio.onerror = function(e) {
                console.error('[表单修复] 音频播放错误:', e);
            };
            
            audio.play().catch(function(e) {
                console.error('[表单修复] 无法播放音频:', e);
                showNotification('无法播放音频，请检查浏览器权限', 'error');
            });
        }
        
        // 开始播放
        playLoop();
    }
    
    // 显示通知
    function showNotification(message, type = 'info') {
        console.log(`[表单修复] 显示通知: ${message} (${type})`);
        
        // 检查是否有现有通知函数
        if (typeof window.showNotification === 'function' && window.showTimerNotifications !== false) {
            window.showNotification(message, type);
            return;
        }
        
        // 移除可能存在的旧通知
        const existingNotifications = document.querySelectorAll('.timer-notification');
        existingNotifications.forEach(notification => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        });
        
        // 创建通知元素
        const notification = document.createElement('div');
        notification.className = `timer-notification ${type}`;
        notification.textContent = message;
        
        // 添加到文档
        document.body.appendChild(notification);
        
        // 3秒后移除
        setTimeout(function() {
            if (document.body.contains(notification)) {
                notification.style.opacity = '0';
                setTimeout(() => {
                    if (document.body.contains(notification)) {
                        document.body.removeChild(notification);
                    }
                }, 300);
            }
        }, 3000);
    }
    
    // 导出关键函数到全局
    window.timerFormFix = {
        createSettingsForm,
        loadSettingsToForm,
        saveSettings,
        testAudioLoopPlayback
    };
    
    // 禁用调试显示
    window.showTimerNotifications = true; // 启用优化后的通知
    
    // 检查DOM状态并执行初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFormFix);
    } else {
        // 如果DOM已加载，延迟执行以确保其他脚本已加载
        setTimeout(initFormFix, 500);
    }
    
    console.log('[表单修复] 脚本加载完成');
})(); 
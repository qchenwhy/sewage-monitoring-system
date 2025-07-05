/**
 * settings-initialization-fix.js
 * 解决timerSettings变量初始化问题和按钮ID不匹配问题
 */

// 立即执行函数确保变量不污染全局作用域
(function() {
    console.log('设置初始化修复脚本已加载');
    
    // 1. 立即初始化timerSettings全局变量
    if (typeof window.timerSettings === 'undefined') {
        console.log('预先初始化timerSettings变量，防止报错');
        window.timerSettings = {
            notificationSound: 'default',
            notificationVolume: 0.5,
            loopNotification: false,
            useVoiceNotification: true,
            voiceLanguage: 'zh-CN',
            repeatCount: 1,
            intervalSeconds: 5,
            autoStopOnResponse: true
        };
        
        // 尝试从localStorage加载已保存的设置
        try {
            const savedSettings = localStorage.getItem('timerSettings');
            if (savedSettings) {
                const parsedSettings = JSON.parse(savedSettings);
                // 合并已保存设置和默认设置
                window.timerSettings = {...window.timerSettings, ...parsedSettings};
                console.log('已从localStorage加载设置:', window.timerSettings);
            }
        } catch (e) {
            console.error('加载设置时出错:', e);
        }
    }
    
    // 2. 定义修复函数 - 在DOM加载完成后执行
    function fixSettingsIssues() {
        console.log('开始修复设置相关问题');
        
        // 2.1 修复初始化面板函数
        if (typeof window.initSettingsPanel === 'function') {
            console.log('包装initSettingsPanel函数，确保timerSettings已初始化');
            const originalInitSettingsPanel = window.initSettingsPanel;
            
            window.initSettingsPanel = function() {
                // 确保timerSettings已定义
                if (typeof window.timerSettings === 'undefined') {
                    console.log('initSettingsPanel中重新初始化timerSettings');
                    window.timerSettings = {
                        notificationSound: 'default',
                        notificationVolume: 0.5,
                        loopNotification: false,
                        useVoiceNotification: true,
                        voiceLanguage: 'zh-CN',
                        repeatCount: 1,
                        intervalSeconds: 5,
                        autoStopOnResponse: true
                    };
                }
                
                // 调用原始函数
                try {
                    originalInitSettingsPanel();
                    console.log('initSettingsPanel函数执行成功');
                } catch (e) {
                    console.error('执行initSettingsPanel出错:', e);
                    // 如果出错，尝试手动操作
                    manualInitSettings();
                }
            };
        }
        
        // 2.2 监听保存按钮点击事件
        const saveBtn = document.getElementById('saveTimerSettings');
        if (saveBtn) {
            console.log('找到保存按钮，添加事件监听器');
            
            // 移除可能存在的事件监听器
            const newSaveBtn = saveBtn.cloneNode(true);
            saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
            
            // 添加新的事件监听器
            newSaveBtn.addEventListener('click', function(e) {
                console.log('保存按钮被点击');
                e.preventDefault();
                saveTimerSettings();
            });
        } else {
            console.warn('未找到ID为saveTimerSettings的保存按钮');
            
            // 监听DOM变化，等待保存按钮出现
            const observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                    if (mutation.addedNodes && mutation.addedNodes.length > 0) {
                        const saveBtn = document.getElementById('saveTimerSettings');
                        if (saveBtn) {
                            console.log('DOM变更后找到保存按钮，添加事件监听器');
                            
                            // 添加点击事件
                            saveBtn.addEventListener('click', function(e) {
                                console.log('保存按钮被点击');
                                e.preventDefault();
                                saveTimerSettings();
                            });
                            
                            observer.disconnect(); // 停止观察
                        }
                    }
                });
            });
            
            // 观察document.body的变化
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }
    
    // 3. 手动初始化设置（备用方案）
    function manualInitSettings() {
        console.log('执行手动设置初始化');
        
        const settingsBtn = document.getElementById('toggleSettings');
        if (!settingsBtn) {
            console.warn('未找到设置按钮，无法手动初始化');
            return;
        }
        
        // 获取模态窗口
        const settingsModal = document.getElementById('timerSettingsModal');
        if (!settingsModal) {
            console.warn('未找到设置模态窗口，无法手动初始化');
            return;
        }
        
        // 确保点击事件正确绑定
        settingsBtn.addEventListener('click', function() {
            console.log('手动绑定的设置按钮被点击');
            
            // 填充表单数据
            fillSettingsForm();
            
            // 显示模态窗口
            settingsModal.style.display = 'block';
        });
        
        // 关闭按钮事件
        const closeBtn = settingsModal.querySelector('.close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                settingsModal.style.display = 'none';
            });
        }
        
        console.log('手动初始化设置完成');
    }
    
    // 4. 填充设置表单
    function fillSettingsForm() {
        console.log('填充设置表单');
        
        const form = document.getElementById('timerSettingsForm');
        if (!form) {
            console.warn('未找到设置表单，无法填充数据');
            return;
        }
        
        // 从timerSettings获取数据填充表单
        try {
            if (form.elements['notificationSound'] && timerSettings.notificationSound) {
                form.elements['notificationSound'].value = timerSettings.notificationSound;
            }
            
            if (form.elements['notificationVolume'] && timerSettings.notificationVolume !== undefined) {
                form.elements['notificationVolume'].value = timerSettings.notificationVolume;
            }
            
            if (form.elements['loopNotification'] && timerSettings.loopNotification !== undefined) {
                form.elements['loopNotification'].checked = timerSettings.loopNotification;
            }
            
            if (form.elements['useVoiceNotification'] && timerSettings.useVoiceNotification !== undefined) {
                form.elements['useVoiceNotification'].checked = timerSettings.useVoiceNotification;
            }
            
            if (form.elements['voiceLanguage'] && timerSettings.voiceLanguage) {
                form.elements['voiceLanguage'].value = timerSettings.voiceLanguage;
            }
            
            if (form.elements['reminderRepeatCount'] && timerSettings.repeatCount !== undefined) {
                form.elements['reminderRepeatCount'].value = timerSettings.repeatCount;
            }
            
            console.log('设置表单填充完成');
        } catch (e) {
            console.error('填充表单数据时出错:', e);
        }
    }
    
    // 5. 保存设置
    function saveTimerSettings() {
        console.log('保存计时器设置');
        
        const form = document.getElementById('timerSettingsForm');
        if (!form) {
            console.error('未找到设置表单，无法保存设置');
            return;
        }
        
        // 收集表单数据
        try {
            const updatedSettings = {
                notificationSound: form.elements['notificationSound'] ? 
                    form.elements['notificationSound'].value : timerSettings.notificationSound,
                    
                notificationVolume: form.elements['notificationVolume'] ? 
                    parseFloat(form.elements['notificationVolume'].value) : timerSettings.notificationVolume,
                    
                loopNotification: form.elements['loopNotification'] ? 
                    form.elements['loopNotification'].checked : timerSettings.loopNotification,
                    
                useVoiceNotification: form.elements['useVoiceNotification'] ? 
                    form.elements['useVoiceNotification'].checked : timerSettings.useVoiceNotification,
                    
                voiceLanguage: form.elements['voiceLanguage'] ? 
                    form.elements['voiceLanguage'].value : timerSettings.voiceLanguage,
                    
                repeatCount: form.elements['reminderRepeatCount'] ? 
                    parseInt(form.elements['reminderRepeatCount'].value) : timerSettings.repeatCount
            };
            
            // 更新全局变量
            window.timerSettings = {...timerSettings, ...updatedSettings};
            
            // 保存到localStorage
            localStorage.setItem('timerSettings', JSON.stringify(window.timerSettings));
            console.log('设置已保存到localStorage:', window.timerSettings);
            
            // 关闭模态窗口
            const modal = document.getElementById('timerSettingsModal');
            if (modal) {
                modal.style.display = 'none';
            }
            
            // 显示成功消息
            showNotification('设置已成功保存！', 'success');
        } catch (e) {
            console.error('保存设置时出错:', e);
            showNotification('保存设置失败: ' + e.message, 'error');
        }
    }
    
    // 6. 显示通知
    function showNotification(message, type = 'info') {
        console.log(`显示通知[${type}]:`, message);
        
        // 检查是否已有通知函数
        if (typeof window.showNotification === 'function') {
            window.showNotification(message, type);
            return;
        }
        
        // 创建通知容器
        let container = document.getElementById('settingsNotificationContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'settingsNotificationContainer';
            container.style.position = 'fixed';
            container.style.top = '20px';
            container.style.right = '20px';
            container.style.zIndex = '9999';
            document.body.appendChild(container);
        }
        
        // 创建通知元素
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.margin = '10px';
        notification.style.padding = '10px 15px';
        notification.style.borderRadius = '4px';
        notification.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
        notification.style.fontFamily = 'Microsoft YaHei, sans-serif';
        notification.style.fontSize = '14px';
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(-20px)';
        notification.style.transition = 'opacity 0.3s, transform 0.3s';
        
        // 根据类型设置样式
        if (type === 'success') {
            notification.style.backgroundColor = '#4CAF50';
            notification.style.color = 'white';
        } else if (type === 'error') {
            notification.style.backgroundColor = '#F44336';
            notification.style.color = 'white';
        } else {
            notification.style.backgroundColor = '#2196F3';
            notification.style.color = 'white';
        }
        
        // 添加到容器
        container.appendChild(notification);
        
        // 显示动画
        setTimeout(function() {
            notification.style.opacity = '1';
            notification.style.transform = 'translateY(0)';
        }, 10);
        
        // 自动关闭
        setTimeout(function() {
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(-20px)';
            
            // 移除元素
            setTimeout(function() {
                if (container.contains(notification)) {
                    container.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
    
    // 监听DOM加载完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fixSettingsIssues);
    } else {
        // 如果DOM已加载完成，直接执行
        fixSettingsIssues();
    }
})(); 
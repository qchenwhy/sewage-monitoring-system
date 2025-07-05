/**
 * timer-settings-init-quick-fix.js
 * 解决timerSettings变量在初始化前被访问的问题
 * 在页面加载时立即执行，确保timerSettings变量可用
 */

// 立即执行函数
(function() {
    console.log('[快速修复] 正在初始化timerSettings变量...');

    // 1. 检查是否已经存在timerSettings全局变量
    if (typeof window.timerSettings === 'undefined') {
        // 2. 如果不存在，先设置默认值
        window.timerSettings = {
            notificationSound: 'default',
            notificationVolume: 0.5,
            loopNotification: false,
            useVoiceNotification: true,
            voiceLanguage: 'zh-CN',
            repeatCount: 2,
            intervalSeconds: 5,
            autoStopOnResponse: true,
            audioLoopCount: 1,
            audioLoopInterval: 500
        };

        // 3. 尝试从localStorage加载用户保存的设置
        try {
            const savedSettings = localStorage.getItem('timerSettings');
            if (savedSettings) {
                const parsedSettings = JSON.parse(savedSettings);
                // 合并默认设置和保存的设置
                window.timerSettings = {...window.timerSettings, ...parsedSettings};
                console.log('[快速修复] 已从本地存储加载设置');
            }
        } catch (error) {
            console.error('[快速修复] 加载本地设置失败:', error);
        }

        console.log('[快速修复] timerSettings变量已成功初始化');
    } else {
        console.log('[快速修复] timerSettings变量已存在，无需初始化');
    }

    // 4. 修复初始化函数（如果存在）
    window.addEventListener('DOMContentLoaded', function() {
        // 等待短暂时间确保页面其他脚本已加载
        setTimeout(function() {
            // 检查initSettingsPanel函数是否存在
            if (typeof window.initSettingsPanel === 'function') {
                console.log('[快速修复] 找到initSettingsPanel函数，准备修复');
                
                // 保存原始函数
                const originalInitSettingsPanel = window.initSettingsPanel;
                
                // 替换为修复版本
                window.initSettingsPanel = function() {
                    // 确保timerSettings存在
                    if (typeof window.timerSettings === 'undefined') {
                        console.warn('[快速修复] timerSettings在initSettingsPanel中仍未定义，重新初始化');
                        window.timerSettings = {
                            notificationSound: 'default',
                            notificationVolume: 0.5,
                            loopNotification: false,
                            useVoiceNotification: true,
                            voiceLanguage: 'zh-CN',
                            repeatCount: 2,
                            intervalSeconds: 5,
                            autoStopOnResponse: true,
                            audioLoopCount: 1,
                            audioLoopInterval: 500
                        };
                    }
                    
                    // 调用原始函数
                    try {
                        console.log('[快速修复] 调用修复后的initSettingsPanel函数');
                        originalInitSettingsPanel();
                    } catch (error) {
                        console.error('[快速修复] 调用initSettingsPanel时出错:', error);
                        
                        // 尝试修复保存按钮
                        fixSaveSettingsButton();
                    }
                };
                
                console.log('[快速修复] initSettingsPanel函数已修复');
            } else {
                console.log('[快速修复] 未找到initSettingsPanel函数，尝试直接修复保存按钮');
                fixSaveSettingsButton();
            }
        }, 300);
    });
    
    // 5. 修复保存按钮事件
    function fixSaveSettingsButton() {
        console.log('[快速修复] 修复保存设置按钮');
        
        const saveBtn = document.getElementById('saveTimerSettings');
        if (saveBtn) {
            console.log('[快速修复] 找到保存按钮，添加事件监听器');
            
            // 移除可能存在的事件监听器
            const newSaveBtn = saveBtn.cloneNode(true);
            saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
            
            // 添加新的事件监听器
            newSaveBtn.addEventListener('click', function(e) {
                console.log('[快速修复] 保存按钮被点击');
                e.preventDefault();
                
                // 尝试调用原始保存函数
                if (typeof window.saveSettings === 'function') {
                    const settingsForm = document.getElementById('timerSettingsForm');
                    if (settingsForm) {
                        window.saveSettings(settingsForm);
                        showFixNotification('设置已保存！', 'success');
                    } else {
                        console.error('[快速修复] 未找到设置表单');
                        showFixNotification('保存失败：未找到设置表单', 'error');
                    }
                } else {
                    console.error('[快速修复] 未找到saveSettings函数');
                    showFixNotification('保存失败：未找到保存函数', 'error');
                }
            });
            
            console.log('[快速修复] 保存按钮事件已修复');
        } else {
            console.warn('[快速修复] 未找到保存按钮，无法修复');
        }
    }
    
    // 6. 简单的通知函数
    function showFixNotification(message, type = 'info') {
        console.log(`[快速修复] 显示通知: ${message} (${type})`);
        
        // 检查是否已有通知函数
        if (typeof window.showNotification === 'function') {
            window.showNotification(message, type);
            return;
        }
        
        // 创建简单的通知元素
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.position = 'fixed';
        notification.style.top = '20px';
        notification.style.right = '20px';
        notification.style.padding = '10px 15px';
        notification.style.borderRadius = '4px';
        notification.style.zIndex = '9999';
        notification.style.fontSize = '14px';
        notification.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
        
        // 根据类型设置颜色
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
        
        // 添加到文档
        document.body.appendChild(notification);
        
        // 3秒后消失
        setTimeout(function() {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 3000);
    }
})(); 
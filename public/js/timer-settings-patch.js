/**
 * 计时器设置修复补丁
 * 解决timerSettings变量初始化和设置保存问题
 */

// 确保在DOM加载完成后执行
document.addEventListener('DOMContentLoaded', function() {
    console.log('计时器设置补丁已加载');
    
    // 全局初始化timerSettings变量，防止"Cannot access before initialization"错误
    if (typeof window.timerSettings === 'undefined') {
        console.log('初始化timerSettings变量');
        window.timerSettings = {
            notificationSound: 'default',
            notificationVolume: 0.5,
            loopNotification: false,
            useVoiceNotification: true,
            voiceLanguage: 'zh-CN',
            repeatCount: 1
        };
        
        // 尝试从localStorage加载已保存的设置
        try {
            const savedSettings = localStorage.getItem('timerSettings');
            if (savedSettings) {
                const parsedSettings = JSON.parse(savedSettings);
                window.timerSettings = {...window.timerSettings, ...parsedSettings};
                console.log('从localStorage加载设置:', window.timerSettings);
            }
        } catch (e) {
            console.error('加载设置时出错:', e);
        }
    }
    
    // 确保保存设置按钮功能正常
    fixSaveSettingsButton();
    
    // 修复计时器音频循环播放
    fixTimerAudioLooping();
});

/**
 * 修复保存设置按钮功能
 */
function fixSaveSettingsButton() {
    console.log('开始修复保存设置按钮');
    
    // 查找保存设置按钮
    const saveBtn = document.getElementById('saveTimerSettings');
    if (!saveBtn) {
        console.warn('未找到保存设置按钮，将等待DOM变更后再尝试');
        
        // 使用MutationObserver监听DOM变化
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.addedNodes && mutation.addedNodes.length > 0) {
                    // 再次查找按钮
                    const saveBtn = document.getElementById('saveTimerSettings');
                    if (saveBtn) {
                        console.log('DOM变更后找到保存设置按钮，添加事件监听器');
                        attachSaveButtonListener(saveBtn);
                        observer.disconnect(); // 停止观察
                    }
                }
            });
        });
        
        // 开始观察文档
        observer.observe(document.body, { childList: true, subtree: true });
        return;
    }
    
    // 找到按钮，添加事件监听器
    attachSaveButtonListener(saveBtn);
}

/**
 * 为保存按钮附加事件监听器
 */
function attachSaveButtonListener(saveBtn) {
    // 移除可能已存在的事件监听器，防止重复添加
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    
    // 添加新的事件监听器
    newSaveBtn.addEventListener('click', function(e) {
        console.log('保存按钮被点击（通过补丁添加的事件处理器）');
        e.preventDefault();
        
        // 获取设置表单
        const settingsForm = document.getElementById('timerSettingsForm');
        if (!settingsForm) {
            console.error('找不到设置表单元素');
            showPatchNotification('保存失败：找不到设置表单', 'error');
            return;
        }
        
        // 收集表单数据并保存
        const formData = {
            notificationSound: settingsForm.elements['notificationSound'] ? 
                settingsForm.elements['notificationSound'].value : 'default',
            notificationVolume: settingsForm.elements['notificationVolume'] ? 
                parseFloat(settingsForm.elements['notificationVolume'].value) : 0.5,
            loopNotification: settingsForm.elements['loopNotification'] ? 
                settingsForm.elements['loopNotification'].checked : false,
            useVoiceNotification: settingsForm.elements['useVoiceNotification'] ? 
                settingsForm.elements['useVoiceNotification'].checked : true,
            voiceLanguage: settingsForm.elements['voiceLanguage'] ? 
                settingsForm.elements['voiceLanguage'].value : 'zh-CN',
            repeatCount: settingsForm.elements['reminderRepeatCount'] ? 
                parseInt(settingsForm.elements['reminderRepeatCount'].value) : 1
        };
        
        // 更新全局设置变量
        window.timerSettings = formData;
        
        // 保存到localStorage
        try {
            localStorage.setItem('timerSettings', JSON.stringify(formData));
            console.log('设置已保存:', formData);
            
            // 关闭模态框
            const settingsModal = document.getElementById('timerSettingsModal');
            if (settingsModal) {
                settingsModal.style.display = 'none';
            }
            
            showPatchNotification('设置已成功保存！', 'success');
        } catch (error) {
            console.error('保存设置时出错:', error);
            showPatchNotification('保存设置失败: ' + error.message, 'error');
        }
    });
    
    console.log('保存按钮事件监听器添加成功');
}

/**
 * 修复计时器音频循环播放功能
 */
function fixTimerAudioLooping() {
    console.log('修复计时器音频循环播放功能');
    
    // 修改全局handleTimerCompleted函数或添加增强功能
    if (typeof window.handleTimerCompleted === 'function') {
        // 保存原始函数
        const originalHandleTimerCompleted = window.handleTimerCompleted;
        
        // 替换为增强版本
        window.handleTimerCompleted = function(timerData) {
            console.log('增强版计时器完成处理函数，确保安全访问timerSettings');
            
            // 确保timerSettings已初始化
            if (typeof window.timerSettings === 'undefined') {
                console.warn('timerSettings未定义，使用默认设置');
                window.timerSettings = {
                    notificationSound: 'default',
                    notificationVolume: 0.5,
                    loopNotification: false,
                    useVoiceNotification: true,
                    voiceLanguage: 'zh-CN',
                    repeatCount: 1
                };
            }
            
            // 调用原始处理函数
            try {
                originalHandleTimerCompleted(timerData);
            } catch (e) {
                console.error('原始计时器处理函数出错:', e);
                
                // 提供备用实现
                playTimerCompletionSound(timerData);
            }
        };
        
        console.log('已增强计时器完成处理函数');
    } else {
        console.warn('未找到handleTimerCompleted函数，无法增强');
    }
    
    // 集成AudioHelper以改进音频循环播放
    if (!window.AudioHelper && window.AudioAutoplay) {
        console.log('添加AudioHelper支持以改进循环播放');
        
        // 动态加载AudioHelper脚本
        const script = document.createElement('script');
        script.src = '/js/audio-helper.js';
        script.onload = function() {
            console.log('AudioHelper脚本加载成功');
        };
        script.onerror = function() {
            console.error('AudioHelper脚本加载失败');
        };
        document.head.appendChild(script);
    }
}

/**
 * 备用函数：播放计时器完成音效
 */
function playTimerCompletionSound(timerData) {
    console.log('使用备用函数播放计时器完成音效', timerData);
    
    // 确保有正确的数据
    if (!timerData || !timerData.message) {
        console.error('无效的计时器数据');
        return;
    }
    
    // 先播放提示音（如果有AudioHelper就用它）
    if (window.AudioHelper) {
        // 使用AudioHelper播放循环提示音
        const soundOptions = {
            volume: window.timerSettings?.notificationVolume || 0.5,
            fadeIn: 300
        };
        
        window.AudioHelper.startLoop('/audio/alert.mp3', soundOptions);
        
        // 3秒后淡出停止
        setTimeout(() => {
            window.AudioHelper.stopLoop({ fadeOut: 500 });
            
            // 然后播放语音消息（如果启用）
            if (window.timerSettings?.useVoiceNotification) {
                speakMessage(timerData.message);
            }
        }, 3000);
    } else if (window.AudioAutoplay) {
        // 使用原有的AudioAutoplay
        window.AudioAutoplay.playLoop('/audio/alert.mp3', function() {
            console.log('提示音播放完成');
            
            // 播放语音消息
            if (window.timerSettings?.useVoiceNotification) {
                speakMessage(timerData.message);
            }
        });
    } else {
        // 后备方案：使用普通Audio元素
        const audio = new Audio('/audio/alert.mp3');
        audio.volume = window.timerSettings?.notificationVolume || 0.5;
        audio.loop = window.timerSettings?.loopNotification || false;
        audio.play().catch(e => console.error('音频播放失败:', e));
    }
}

/**
 * 使用语音合成播放消息
 */
function speakMessage(message) {
    if (!message || !window.speechSynthesis) return;
    
    console.log('播放语音消息:', message);
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = window.timerSettings?.voiceLanguage || 'zh-CN';
    utterance.volume = window.timerSettings?.notificationVolume || 0.5;
    window.speechSynthesis.speak(utterance);
}

/**
 * 显示通知消息
 */
function showPatchNotification(message, type = 'info') {
    console.log(`显示补丁通知[${type}]:`, message);
    
    // 如果已有通知显示函数则使用它
    if (typeof window.showNotification === 'function') {
        window.showNotification(message, type);
        return;
    }
    
    // 否则创建自己的通知
    let notificationContainer = document.getElementById('patchNotificationContainer');
    if (!notificationContainer) {
        notificationContainer = document.createElement('div');
        notificationContainer.id = 'patchNotificationContainer';
        notificationContainer.style.position = 'fixed';
        notificationContainer.style.top = '20px';
        notificationContainer.style.right = '20px';
        notificationContainer.style.zIndex = '9999';
        document.body.appendChild(notificationContainer);
    }
    
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // 设置样式
    notification.style.padding = '10px 15px';
    notification.style.marginBottom = '10px';
    notification.style.borderRadius = '4px';
    notification.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    notification.style.opacity = '0';
    notification.style.transform = 'translateY(-20px)';
    notification.style.transition = 'opacity 0.3s, transform 0.3s';
    
    // 根据类型设置不同背景色
    if (type === 'success') {
        notification.style.backgroundColor = '#4caf50';
        notification.style.color = 'white';
    } else if (type === 'error') {
        notification.style.backgroundColor = '#f44336';
        notification.style.color = 'white';
    } else {
        notification.style.backgroundColor = '#2196f3';
        notification.style.color = 'white';
    }
    
    // 添加到容器
    notificationContainer.appendChild(notification);
    
    // 显示动画
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateY(0)';
    }, 10);
    
    // 自动关闭
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(-20px)';
        
        // 移除元素
        setTimeout(() => {
            if (notificationContainer.contains(notification)) {
                notificationContainer.removeChild(notification);
            }
        }, 300);
    }, 3000);
} 
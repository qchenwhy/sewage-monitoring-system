/**
 * timer-settings-init-fix.js
 * 修复timerSettings变量未初始化的问题
 */

// 立即执行函数，防止污染全局作用域
(function() {
    console.log('计时器设置初始化补丁已加载');
    
    // 确保timerSettings变量存在
    if (typeof window.timerSettings === 'undefined') {
        console.log('初始化timerSettings变量');
        
        // 从localStorage中加载设置或使用默认值
        try {
            const savedSettings = localStorage.getItem('timerSettings');
            if (savedSettings) {
                window.timerSettings = JSON.parse(savedSettings);
                console.log('已从localStorage加载设置:', window.timerSettings);
            } else {
                // 设置默认值
                window.timerSettings = {
                    notificationType: 'audio',
                    audioUrl: '/audio/alert.mp3',
                    notificationVolume: 1.0,
                    vibration: true,
                    loopAudio: true,
                    audioPlayDuration: 10
                };
                console.log('已设置默认值:', window.timerSettings);
            }
        } catch (error) {
            console.error('加载设置出错:', error);
            
            // 设置备用默认值
            window.timerSettings = {
                notificationType: 'audio',
                audioUrl: '/audio/alert.mp3',
                notificationVolume: 1.0,
                vibration: true,
                loopAudio: true,
                audioPlayDuration: 10
            };
            console.log('已设置备用默认值:', window.timerSettings);
        }
    } else {
        console.log('timerSettings变量已存在，无需初始化');
    }
    
    // 监听DOM加载完成事件
    document.addEventListener('DOMContentLoaded', function() {
        console.log('DOM已加载，检查timerSettings初始化状态');
        
        // 再次确认timerSettings变量存在
        if (typeof window.timerSettings === 'undefined') {
            console.warn('DOM加载后timerSettings仍未定义，重新初始化');
            window.timerSettings = {
                notificationType: 'audio',
                audioUrl: '/audio/alert.mp3',
                notificationVolume: 1.0,
                vibration: true,
                loopAudio: true,
                audioPlayDuration: 10
            };
        }
        
        // 确保设置表单已加载
        setTimeout(function checkSettingsForm() {
            const settingsForm = document.getElementById('timerSettingsForm');
            if (settingsForm) {
                console.log('设置表单已找到，确保值已正确填充');
                
                // 如果已有loadSettingsToForm函数，在DOM加载后尝试执行
                if (typeof loadSettingsToForm === 'function') {
                    try {
                        loadSettingsToForm();
                        console.log('已执行loadSettingsToForm函数填充表单');
                    } catch (error) {
                        console.error('执行loadSettingsToForm时出错:', error);
                    }
                } else {
                    console.warn('未找到loadSettingsToForm函数，尝试手动填充表单');
                    
                    // 手动填充表单
                    try {
                        const notificationTypeSelect = settingsForm.querySelector('#notificationType');
                        const audioUrlInput = settingsForm.querySelector('#audioUrl');
                        const volumeInput = settingsForm.querySelector('#notificationVolume');
                        const vibrationCheckbox = settingsForm.querySelector('#vibration');
                        const loopAudioCheckbox = settingsForm.querySelector('#loopAudio');
                        const audioPlayDurationInput = settingsForm.querySelector('#audioPlayDuration');
                        
                        if (notificationTypeSelect) {
                            notificationTypeSelect.value = window.timerSettings.notificationType || 'audio';
                        }
                        
                        if (audioUrlInput) {
                            audioUrlInput.value = window.timerSettings.audioUrl || '/audio/alert.mp3';
                        }
                        
                        if (volumeInput) {
                            volumeInput.value = window.timerSettings.notificationVolume || 1.0;
                        }
                        
                        if (vibrationCheckbox) {
                            vibrationCheckbox.checked = window.timerSettings.vibration !== false;
                        }
                        
                        if (loopAudioCheckbox) {
                            loopAudioCheckbox.checked = window.timerSettings.loopAudio !== false;
                        }
                        
                        if (audioPlayDurationInput) {
                            audioPlayDurationInput.value = window.timerSettings.audioPlayDuration || 10;
                        }
                        
                        console.log('已手动填充表单');
                    } catch (error) {
                        console.error('手动填充表单时出错:', error);
                    }
                }
            } else {
                console.log('设置表单尚未找到，稍后再试');
                // 如果表单尚未加载，100ms后再尝试
                setTimeout(checkSettingsForm, 100);
            }
        }, 100);
    });
    
    // 导出一个公共方法用于确保timerSettings已初始化
    window.ensureTimerSettingsInitialized = function() {
        if (typeof window.timerSettings === 'undefined') {
            console.warn('timerSettings未初始化，现在进行初始化');
            window.timerSettings = {
                notificationType: 'audio',
                audioUrl: '/audio/alert.mp3',
                notificationVolume: 1.0,
                vibration: true,
                loopAudio: true,
                audioPlayDuration: 10
            };
        }
        return window.timerSettings;
    };
})(); 
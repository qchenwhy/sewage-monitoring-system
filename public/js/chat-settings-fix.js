/**
 * chat-settings-fix.js
 * 修复chat.html页面中的计时器设置保存问题和activeTimerReminders变量问题
 * 版本: 1.3 - 增加与音频协调器的集成，优化音频播放兼容性
 */

// 立即执行函数，确保关键变量在页面加载早期就被初始化
(function() {
    console.log('[设置修复] 立即初始化关键变量');
    
    // 1. 确保timerSettings变量存在
    if (typeof window.timerSettings === 'undefined') {
        console.warn('[设置修复] timerSettings变量不存在，创建它');
        window.timerSettings = {
            repeatCount: 2,
            intervalSeconds: 5,
            autoStopOnResponse: true,
            audioLoopCount: 1,
            audioLoopInterval: 500
        };
        
        // 尝试从localStorage加载已保存的设置
        try {
            const savedSettings = localStorage.getItem('timerSettings');
            if (savedSettings) {
                const parsedSettings = JSON.parse(savedSettings);
                window.timerSettings = {...window.timerSettings, ...parsedSettings};
                console.log('[设置修复] 从localStorage加载了保存的设置');
            }
        } catch (error) {
            console.error('[设置修复] 加载设置出错:', error);
        }
    }
    
    // 2. 确保activeTimerReminders变量存在（全局变量）
    if (typeof window.activeTimerReminders === 'undefined') {
        console.warn('[设置修复] activeTimerReminders变量不存在，创建它');
        window.activeTimerReminders = new Map();
    }
    
    // 给window添加一个getter方法来确保activeTimerReminders总是可用
    // 这将确保任何时候访问window.activeTimerReminders都不会抛出未初始化错误
    try {
        // 保存原始的内容（如果存在）
        const originalActiveTimerReminders = window.activeTimerReminders || new Map();
        
        // 设置一个getter/setter，确保这个变量不会未定义
        Object.defineProperty(window, 'activeTimerReminders', {
            get: function() {
                // 总是返回一个有效的Map对象
                if (this._activeTimerReminders === undefined) {
                    console.warn('[设置修复] activeTimerReminders被访问时尚未初始化，创建默认值');
                    this._activeTimerReminders = new Map();
                }
                return this._activeTimerReminders;
            },
            set: function(value) {
                // 允许设置新值，但确保是Map类型
                this._activeTimerReminders = value instanceof Map ? value : new Map();
            },
            configurable: true
        });
        
        // 设置初始值
        window.activeTimerReminders = originalActiveTimerReminders;
        console.log('[设置修复] 已设置activeTimerReminders安全访问器');
    } catch (error) {
        console.error('[设置修复] 设置activeTimerReminders安全访问器失败:', error);
    }
    
    // 3. 设置lastUserInteractionTime变量访问器
    // 确保在任何地方访问这个变量都不会出错
    try {
        // 检查是否已经定义了这个属性
        let _lastUserInteractionTime = Date.now();
        if (typeof window.lastUserInteractionTime !== 'undefined') {
            _lastUserInteractionTime = window.lastUserInteractionTime;
        }
        
        // 提供安全的访问器
        Object.defineProperty(window, 'lastUserInteractionTime', {
            get: function() {
                return _lastUserInteractionTime;
            },
            set: function(value) {
                _lastUserInteractionTime = value;
            },
            configurable: true // 改为true以便与音频协调器兼容
        });
        
        console.log('[设置修复] 已设置lastUserInteractionTime安全访问器');
    } catch (error) {
        console.error('[设置修复] 设置lastUserInteractionTime安全访问器失败:', error);
        
        // 如果无法设置属性，则尝试直接赋值
        if (typeof window.lastUserInteractionTime === 'undefined') {
            window.lastUserInteractionTime = Date.now();
        }
    }
    
    // 4. 创建自定义的播放函数（如果原始函数不存在）
    if (typeof window.playTimerAudio !== 'function') {
        console.log('[设置修复] 创建自定义的计时器音频播放函数');
        
        window.playTimerAudio = function(audioUrl, message) {
            console.log('[设置修复] 调用自定义播放函数:', { audioUrl, message });
            
            // 优先使用音频协调器的安全播放函数(如果存在)
            if (window.AudioCoordinator && typeof window.AudioCoordinator.playTimerAudio === 'function') {
                console.log('[设置修复] 使用音频协调器播放计时器音频');
                return window.AudioCoordinator.playTimerAudio(audioUrl, message);
            }
            
            // 如果已存在safePlayTimerAudio函数，优先使用它
            if (typeof window.safePlayTimerAudio === 'function') {
                console.log('[设置修复] 使用safePlayTimerAudio函数');
                return window.safePlayTimerAudio(audioUrl, message);
            }
            
            // 确保audioUrl存在
            if (!audioUrl) {
                audioUrl = '/audio/Broadcastalert.mp3';
            }
            
            try {
                // 创建新的Audio元素（不使用SimpleAudioPlayer以避免干扰）
                const alertAudio = new Audio(audioUrl);
                
                alertAudio.onended = function() {
                    console.log('[设置修复] 提示音播放完成');
                    
                    // 播放消息
                    if (message && typeof window.speakMessage === 'function') {
                        setTimeout(function() {
                            window.speakMessage(message);
                        }, 500);
                    }
                };
                
                alertAudio.onerror = function(e) {
                    console.error('[设置修复] 播放音频失败:', e);
                };
                
                // 播放音频
                const playPromise = alertAudio.play();
                if (playPromise !== undefined) {
                    playPromise.catch(function(error) {
                        console.error('[设置修复] 播放音频出错:', error);
                    });
                }
                
                return true;
            } catch (error) {
                console.error('[设置修复] 创建或播放音频元素失败:', error);
                return false;
            }
        };
    }
    
    // 5. 修复setupTimerReminders函数（如果存在）
    if (typeof window.setupTimerReminders === 'function') {
        console.log('[设置修复] 找到setupTimerReminders函数，准备修复');
        
        try {
            // 保存原始函数的引用
            const originalSetupTimerReminders = window.setupTimerReminders;
            
            // 替换整个函数实现
            window.setupTimerReminders = function(timerId, title, message, audioUrl) {
                console.log('[设置修复] 调用修复版的setupTimerReminders函数:', {
                    timerId: timerId,
                    title: title,
                    message: message,
                    audioUrl: audioUrl
                });
                
                // 优先使用音频协调器版本
                if (window.AudioCoordinator) {
                    console.log('[设置修复] 检测到音频协调器，使用协调版本的setupTimerReminders');
                    return window.AudioCoordinator.setupTimerReminders ? 
                           window.AudioCoordinator.setupTimerReminders(timerId, title, message, audioUrl) : 
                           null;
                }
                
                // 确保全局Map对象存在
                if (!(window.activeTimerReminders instanceof Map)) {
                    console.warn('[设置修复] activeTimerReminders不是Map实例，重新创建');
                    window.activeTimerReminders = new Map();
                }
                
                // 检查是否已有此定时器的提醒
                if (window.activeTimerReminders.has(timerId)) {
                    console.log(`[设置修复] 计时器 ${timerId} 已存在提醒，先清除`);
                    const existing = window.activeTimerReminders.get(timerId);
                    
                    // 如果有正在运行的提醒间隔，清除它
                    if (existing && existing.intervalId) {
                        clearInterval(existing.intervalId);
                    }
                }
                
                // 创建新的提醒对象
                const timerSettings = window.timerSettings || {
                    repeatCount: 2,
                    intervalSeconds: 5,
                    autoStopOnResponse: true
                };
                
                const reminder = {
                    title: title || '未命名计时器',
                    message: message || '时间到',
                    audioUrl: audioUrl,
                    count: 0,
                    maxCount: timerSettings.repeatCount || 2,
                    intervalId: null,
                    createdAt: Date.now()
                };
                
                console.log(`[设置修复] 创建计时器提醒: ID=${timerId}, 标题=${reminder.title}, 重复=${reminder.maxCount}次`);
                
                // 存储提醒
                window.activeTimerReminders.set(timerId, reminder);
                
                // 自定义播放函数，处理播放逻辑和更新提醒计数
                function playReminderAudio() {
                    if (reminder.count >= reminder.maxCount) {
                        console.log(`[设置修复] 计时器 ${timerId} 已达到最大提醒次数 ${reminder.maxCount}，停止提醒`);
                        if (reminder.intervalId) {
                            clearInterval(reminder.intervalId);
                            reminder.intervalId = null;
                        }
                        return false;
                    }
                    
                    console.log(`[设置修复] 播放第 ${reminder.count + 1}/${reminder.maxCount} 次提醒`);
                    
                    // 优先使用协调器安全播放函数
                    if (window.AudioCoordinator && typeof window.AudioCoordinator.playTimerAudio === 'function') {
                        console.log('[设置修复] 使用音频协调器播放计时器提醒');
                        const played = window.AudioCoordinator.playTimerAudio(audioUrl, reminder.message);
                        if (played) {
                            reminder.count++;
                            console.log(`[设置修复] 使用协调器播放了第 ${reminder.count}/${reminder.maxCount} 次提醒`);
                            return true;
                        }
                    }
                    
                    // 尝试使用window.playTimerAudio
                    let played = false;
                    
                    if (typeof window.playTimerAudio === 'function') {
                        try {
                            played = window.playTimerAudio(audioUrl, reminder.message);
                        } catch (error) {
                            console.error('[设置修复] 播放函数出错:', error);
                            played = false;
                        }
                    }
                    
                    // 备用方案：直接使用原生Audio API
                    if (!played) {
                        try {
                            console.log('[设置修复] 尝试使用原生Audio API播放');
                            const audio = new Audio('/audio/Broadcastalert.mp3');
                            audio.play().then(() => {
                                console.log('[设置修复] 原生Audio播放成功');
                                
                                if (reminder.message && typeof window.speakMessage === 'function') {
                                    setTimeout(() => window.speakMessage(reminder.message), 1000);
                                } else if (audioUrl) {
                                    setTimeout(() => {
                                        const msgAudio = new Audio(audioUrl);
                                        msgAudio.play().catch(err => {
                                            console.error('[设置修复] 消息音频播放失败:', err);
                                        });
                                    }, 1000);
                                }
                            }).catch(err => {
                                console.error('[设置修复] 原生Audio播放失败:', err);
                                return false;
                            });
                            
                            played = true;
                        } catch (e) {
                            console.error('[设置修复] 所有播放尝试都失败:', e);
                            played = false;
                        }
                    }
                    
                    // 播放成功，更新计数
                    if (played) {
                        reminder.count++;
                        console.log(`[设置修复] 已播放第 ${reminder.count}/${reminder.maxCount} 次提醒`);
                        return true;
                    }
                    
                    console.error('[设置修复] 无法播放提醒音频');
                    return false;
                }
                
                // 播放第一次提醒
                playReminderAudio();
                
                // 如果需要多次播放，设置计时器
                if (reminder.maxCount > 1) {
                    const intervalSeconds = timerSettings.intervalSeconds || 5;
                    console.log(`[设置修复] 设置重复提醒，间隔 ${intervalSeconds} 秒`);
                    
                    reminder.intervalId = setInterval(function() {
                        // 检查是否已经达到最大播放次数
                        if (reminder.count >= reminder.maxCount) {
                            clearInterval(reminder.intervalId);
                            console.log(`[设置修复] 计时器 ${timerId} 已达到最大提醒次数，停止提醒`);
                            return;
                        }
                        
                        // 检查是否应该自动停止提醒
                        if (timerSettings.autoStopOnResponse) {
                            const timeSinceLastInteraction = Date.now() - window.lastUserInteractionTime;
                            if (timeSinceLastInteraction < intervalSeconds * 1000) {
                                clearInterval(reminder.intervalId);
                                console.log(`[设置修复] 检测到用户交互，停止计时器 ${timerId} 的提醒`);
                                return;
                            }
                        }
                        
                        // 播放下一次提醒
                        playReminderAudio();
                    }, intervalSeconds * 1000);
                }
                
                return reminder;
            };
                
            console.log('[设置修复] setupTimerReminders函数已修复');
        } catch (error) {
            console.error('[设置修复] 修复setupTimerReminders函数失败:', error);
        }
    }
    
    console.log('[设置修复] 关键变量初始化和函数修复完成');
})();

// DOM加载后执行的修复
document.addEventListener('DOMContentLoaded', function() {
    console.log('[设置修复] 开始修复chat.html中的设置保存功能');
    
    // 更新lastUserInteractionTime变量
    window.lastUserInteractionTime = Date.now();
    
    // 1. 修复handleTimerCompleted函数（如果存在）
    if (typeof window.handleTimerCompleted === 'function') {
        console.log('[设置修复] 找到handleTimerCompleted函数，准备修复');
        const originalHandleTimerCompleted = window.handleTimerCompleted;
        
        window.handleTimerCompleted = function(data) {
            console.log('[设置修复] 调用安全版的handleTimerCompleted函数:', data);
            
            try {
                // 检查数据完整性，这很重要！
                if (!data || !data.id) {
                    throw new Error('计时器数据无效，缺少ID');
                }
                
                // 如果有音频协调器，优先使用它处理计时器完成事件
                if (window.AudioCoordinator) {
                    console.log('[设置修复] 使用音频协调器处理计时器完成事件');
                    // 如果协调器有处理计时器完成的方法，调用它
                    if (typeof window.AudioCoordinator.handleTimerCompleted === 'function') {
                        return window.AudioCoordinator.handleTimerCompleted(data);
                    }
                }
                
                // 直接调用setupTimerReminders处理提醒
                if (typeof window.setupTimerReminders === 'function') {
                    console.log('[设置修复] 直接调用setupTimerReminders处理提醒:', {
                        id: data.id,
                        title: data.title,
                        message: data.message
                    });
                    window.setupTimerReminders(
                        data.id,
                        data.title,
                        data.message || '计时器时间到',
                        data.audioUrl
                    );
                    return;
                }
                
                // 如果没有setupTimerReminders函数，再尝试调用原始函数
                return originalHandleTimerCompleted(data);
            } catch (error) {
                console.error('[设置修复] 执行handleTimerCompleted时出错:', error);
                
                // 提供基本功能以避免完全失败
                try {
                    console.log('[设置修复] 尝试基本计时器完成处理:', data);
                    
                    // 再次尝试直接调用setupTimerReminders
                    if (typeof window.setupTimerReminders === 'function') {
                        console.log('[设置修复] 尝试直接调用setupTimerReminders');
                        window.setupTimerReminders(
                            data.id, 
                            data.title, 
                            data.message || '计时器时间到', 
                            data.audioUrl
                        );
                        return;
                    }
                    
                    // 备用处理方式
                    // 如果有音频协调器，使用它播放提示音
                    if (window.AudioCoordinator && typeof window.AudioCoordinator.playTimerAudio === 'function') {
                        window.AudioCoordinator.playTimerAudio(
                            '/audio/Broadcastalert.mp3',
                            `计时器 "${data.title || '未命名'}" 已完成: ${data.message || '时间到'}`
                        );
                        return;
                    }
                    
                    // 最后的备用方式：直接播放提示音
                    const alertSoundUrl = '/audio/Broadcastalert.mp3';
                    
                    try {
                        const audio = new Audio(alertSoundUrl);
                        audio.play().then(() => {
                            // 显示通知
                            showNotification(`计时器 "${data.title || '未命名'}" 已完成: ${data.message || '时间到'}`);
                        }).catch(err => {
                            console.error('[设置修复] 播放失败:', err);
                        });
                    } catch (e) {
                        console.error('[设置修复] 创建Audio对象失败:', e);
                    }
                } catch (innerError) {
                    console.error('[设置修复] 基本计时器处理失败:', innerError);
                }
            }
        };
        
        console.log('[设置修复] handleTimerCompleted函数已修复');
    }
    
    // 2. 修复保存按钮事件
    setTimeout(function() {
        const saveBtn = document.getElementById('saveTimerSettings');
        if (saveBtn) {
            console.log('[设置修复] 找到保存按钮，添加安全的事件处理');
            
            // 替换原有事件
            const newSaveBtn = saveBtn.cloneNode(true);
            saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
            
            // 添加新的事件处理
            newSaveBtn.addEventListener('click', function(e) {
                console.log('[设置修复] 保存按钮被点击');
                e.preventDefault();
                
                try {
                    const repeatCountInput = document.getElementById('reminderRepeatCount');
                    const intervalInput = document.getElementById('reminderInterval');
                    const autoStopSelect = document.getElementById('autoStopReminders');
                    const audioLoopCountInput = document.getElementById('audioLoopCount');
                    const audioLoopIntervalInput = document.getElementById('audioLoopInterval');
                    
                    // 检查所有需要的元素
                    if (!repeatCountInput || !intervalInput || !autoStopSelect || 
                        !audioLoopCountInput || !audioLoopIntervalInput) {
                        throw new Error('无法找到所有必要的表单元素');
                    }
                    
                    // 更新设置
                    window.timerSettings.repeatCount = Math.max(1, Math.min(10, parseInt(repeatCountInput.value) || 2));
                    window.timerSettings.intervalSeconds = Math.max(1, Math.min(60, parseInt(intervalInput.value) || 5));
                    window.timerSettings.autoStopOnResponse = autoStopSelect.value === 'true';
                    window.timerSettings.audioLoopCount = Math.max(1, Math.min(5, parseInt(audioLoopCountInput.value) || 1));
                    window.timerSettings.audioLoopInterval = Math.max(0, Math.min(5000, parseInt(audioLoopIntervalInput.value) || 500));
                    
                    // 更新输入框值
                    repeatCountInput.value = window.timerSettings.repeatCount;
                    intervalInput.value = window.timerSettings.intervalSeconds;
                    audioLoopCountInput.value = window.timerSettings.audioLoopCount;
                    audioLoopIntervalInput.value = window.timerSettings.audioLoopInterval;
                    
                    // 保存到localStorage
                    localStorage.setItem('timerSettings', JSON.stringify(window.timerSettings));
                    console.log('[设置修复] 设置已成功保存:', window.timerSettings);
                    
                    // 关闭模态窗口
                    const settingsModal = document.getElementById('timerSettingsModal');
                    if (settingsModal) {
                        settingsModal.style.display = 'none';
                    }
                    
                    // 显示成功通知
                    showNotification('设置已保存');
                } catch (error) {
                    console.error('[设置修复] 保存设置失败:', error);
                    showNotification('保存设置失败: ' + error.message, 'error');
                }
            });
        } else {
            console.warn('[设置修复] 未找到保存按钮(#saveTimerSettings)');
        }
    }, 500); // 延迟执行，确保原始事件已被设置
    
    // 3. 修复测试按钮事件
    setTimeout(function() {
        const testBtn = document.getElementById('testAudioLoop');
        if (testBtn) {
            console.log('[设置修复] 找到测试按钮，添加安全的事件处理');
            
            // 替换原有事件
            const newTestBtn = testBtn.cloneNode(true);
            testBtn.parentNode.replaceChild(newTestBtn, testBtn);
            
            // 添加新的事件处理
            newTestBtn.addEventListener('click', function(e) {
                console.log('[设置修复] 测试按钮被点击');
                e.preventDefault();
                
                try {
                    // 获取当前设置
                    const audioLoopCountInput = document.getElementById('audioLoopCount');
                    const audioLoopIntervalInput = document.getElementById('audioLoopInterval');
                    
                    // 临时更新设置
                    if (audioLoopCountInput) {
                        window.timerSettings.audioLoopCount = Math.max(1, Math.min(5, parseInt(audioLoopCountInput.value) || 1));
                    }
                    if (audioLoopIntervalInput) {
                        window.timerSettings.audioLoopInterval = Math.max(0, Math.min(5000, parseInt(audioLoopIntervalInput.value) || 500));
                    }
                    
                    console.log('[设置修复] 测试使用设置:', {
                        audioLoopCount: window.timerSettings.audioLoopCount,
                        audioLoopInterval: window.timerSettings.audioLoopInterval
                    });
                    
                    // 简化的测试方法
                    const audio = new Audio('/audio/Broadcastalert.mp3');
                    audio.play().then(() => {
                        showNotification('测试音频播放中...');
                    }).catch(err => {
                        console.error('[设置修复] 测试音频播放失败:', err);
                        showNotification('测试音频播放失败', 'error');
                    });
                    
                } catch (error) {
                    console.error('[设置修复] 测试按钮处理失败:', error);
                    showNotification('测试失败: ' + error.message, 'error');
                }
            });
        } else {
            console.warn('[设置修复] 未找到测试按钮(#testAudioLoop)');
        }
    }, 500); // 延迟执行，确保原始事件已被设置
    
    /**
     * 显示通知
     */
    function showNotification(message, type = 'info') {
        // 尝试使用页面原有的通知函数
        if (typeof window.showNotification === 'function') {
            window.showNotification(message, type);
            return;
        }
        
        // 如果没有原有函数，创建一个临时通知
        const tempNotification = document.createElement('div');
        tempNotification.textContent = message;
        tempNotification.style.position = 'fixed';
        tempNotification.style.top = '20px';
        tempNotification.style.right = '20px';
        tempNotification.style.backgroundColor = type === 'error' ? '#F44336' : '#4CAF50';
        tempNotification.style.color = 'white';
        tempNotification.style.padding = '15px';
        tempNotification.style.borderRadius = '4px';
        tempNotification.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
        tempNotification.style.zIndex = '9999';
        
        document.body.appendChild(tempNotification);
        
        // 3秒后移除
        setTimeout(function() {
            if (document.body.contains(tempNotification)) {
                document.body.removeChild(tempNotification);
            }
        }, 3000);
    }
    
    // 5. 修复用户交互时间更新
    try {
        // 更新最后用户交互时间的函数
        function updateLastInteractionTime() {
            window.lastUserInteractionTime = Date.now();
            console.log('[设置修复] 更新用户最后交互时间:', new Date(window.lastUserInteractionTime).toLocaleTimeString());
        }
        
        // 监听用户交互事件
        ['click', 'keydown', 'touchstart', 'mousedown'].forEach(function(eventType) {
            document.addEventListener(eventType, updateLastInteractionTime, { passive: true });
        });
        
        console.log('[设置修复] 已添加用户交互时间监听器');
    } catch (error) {
        console.error('[设置修复] 添加用户交互监听器失败:', error);
    }
    
    console.log('[设置修复] 修复脚本加载完成');
}); 
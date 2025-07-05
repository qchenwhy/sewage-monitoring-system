// timer-audio-integration-fix.js
// 整合计时器音频冲突修复
(function() {
    console.log('[整合修复] 开始整合计时器音频冲突修复');
    
    // 添加全局状态变量
    let audioState = {
        isPlaying: false,
        currentAudio: null,
        loopInfo: {
            totalLoops: 3,  // 默认3次
            currentLoop: 0,
            intervalId: 500 // 默认500毫秒
        },
        queue: []
    };
    
    // 1. 保存所有原始函数的引用
    const originalFunctions = {
        speakMessage: window.speakMessage,
        handleAudioEvent: window.handleAudioEvent,
        setupTimerReminders: window.setupTimerReminders,
        handleTimerCompleted: window.handleTimerCompleted
    };
    
    // 2. 创建一个安全、可靠的setupTimerReminders函数
    window.setupTimerReminders = function(timerId, title, message, audioUrl) {
        console.log('[整合修复] 调用整合版setupTimerReminders:', { timerId, title, message });
        
        // 清除任何正在进行的播放
        stopAllPlayback();
        
        // 实现安全的提醒逻辑，包括显示和播放
        const notification = {
            title: title || '计时器提醒',
            message: message || '时间到',
            audioUrl: audioUrl || '/audio/alert.mp3',
            timerId: timerId
        };
        
        // 显示通知
        showTimerNotification(notification);
        
        // 显示对话框提醒
        showDialogNotification(notification);
        
        // 播放广播提示音效后再播放主要提醒音频
        playBroadcastSound(function() {
            // 广播音效播放完成后播放主要提醒音频
            playTimerAudio(notification);
        });
        
        // 处理重复提醒逻辑
        scheduleRepeatReminder(notification);
        
        return true;
    };
    
    // 新增：处理重复提醒逻辑
    function scheduleRepeatReminder(notification) {
        // 获取设置 - 强制重新加载
        localStorage.removeItem('_timerSettingsCache');
        const settings = getSafeTimerSettings(true);
        const repeatCount = parseInt(settings.repeatCount) || 2;
        const intervalSeconds = parseInt(settings.intervalSeconds) || 5;
        
        console.log('[整合修复] 设置重复提醒，总次数:', repeatCount, '间隔:', intervalSeconds, '秒');
        
        // 如果重复次数小于2，不需要安排重复
        if (repeatCount < 2) {
            console.log('[整合修复] 重复次数小于2，不安排重复提醒');
            return;
        }
        
        // 创建重复提醒计数器对象
        if (!window._reminderCounters) {
            window._reminderCounters = {};
        }
        
        // 清除可能存在的旧计时器
        const reminderId = notification.timerId || ('reminder_' + Date.now());
        if (window._reminderCounters[reminderId]) {
            console.log('[整合修复] 清除已存在的计时器:', reminderId);
            clearRepeatReminders(reminderId);
        }
        
        // 为当前通知创建计数器
        window._reminderCounters[reminderId] = {
            currentCount: 1, // 已经显示了第一次
            maxCount: repeatCount,
            intervalMs: intervalSeconds * 1000,
            notification: notification,
            timers: []
        };
        
        console.log('[整合修复] 已创建重复提醒计数器:', window._reminderCounters[reminderId]);
        
        // 安排后续重复
        function scheduleNext() {
            const counter = window._reminderCounters[reminderId];
            if (!counter) {
                console.log('[整合修复] 计数器已被清除，不再安排重复');
                return;
            }
            
            if (counter.currentCount >= counter.maxCount) {
                console.log('[整合修复] 提醒已达到最大重复次数:', counter.maxCount);
                delete window._reminderCounters[reminderId];
                return;
            }
            
            console.log('[整合修复] 安排第', counter.currentCount + 1, '/', counter.maxCount, '次重复提醒，', counter.intervalMs/1000, '秒后触发');
            
            // 检查用户交互 - 如果最近有交互且设置自动停止，则不再重复
            if (settings.autoStopOnResponse && typeof window.lastUserInteractionTime !== 'undefined') {
                const lastInteraction = window.lastUserInteractionTime;
                const now = Date.now();
                const idleTime = now - lastInteraction;
                
                console.log('[整合修复] 上次交互距现在:', Math.floor(idleTime/1000), '秒');
                
                if (idleTime < counter.intervalMs) {
                    console.log('[整合修复] 检测到用户最近交互，自动停止重复提醒');
                    delete window._reminderCounters[reminderId];
                    return;
                }
            }
            
            // 安排下一次重复
            const timerId = setTimeout(function() {
                counter.currentCount++;
                console.log('[整合修复] 触发第', counter.currentCount, '/', counter.maxCount, '次重复提醒');
                
                // 显示通知
                showTimerNotification(counter.notification);
                
                // 显示对话框提醒
                showDialogNotification(counter.notification);
                
                // 播放音频
                playBroadcastSound(function() {
                    playTimerAudio(counter.notification);
                    
                    // 为下一次重复做准备
                    if (counter.currentCount < counter.maxCount) {
                        scheduleNext();
                    } else {
                        console.log('[整合修复] 已完成所有', counter.maxCount, '次提醒');
                        delete window._reminderCounters[reminderId];
                    }
                });
            }, counter.intervalMs);
            
            // 保存定时器ID便于清理
            counter.timers.push(timerId);
            console.log('[整合修复] 已安排重复提醒，定时器ID:', timerId);
        }
        
        // 开始安排第一次重复（第二次提醒）
        scheduleNext();
        console.log('[整合修复] 重复提醒计划已安排');
    }
    
    // 新增: 清除某个计时器的所有重复提醒
    function clearRepeatReminders(timerId) {
        if (!window._reminderCounters || !timerId) return;
        
        const counter = window._reminderCounters[timerId];
        if (counter) {
            console.log('[整合修复] 清除计时器的重复提醒:', timerId);
            
            // 清除所有定时器
            if (Array.isArray(counter.timers)) {
                counter.timers.forEach(id => clearTimeout(id));
            }
            
            // 移除计数器
            delete window._reminderCounters[timerId];
        }
    }
    
    // 新增：显示对话框提醒
    function showDialogNotification(notification) {
        console.log('[整合修复] 显示对话框提醒:', notification.title);
        
        try {
            // 获取聊天容器 - 尝试更多可能的选择器
            const chatContainer = document.querySelector('.chat-container') || 
                                document.querySelector('.messages-container') || 
                                document.querySelector('#messagesContainer') ||
                                document.querySelector('#chatMessages') ||
                                document.querySelector('#chat-messages') || 
                                document.querySelector('.chat-window') ||
                                document.querySelector('.chat-area');
            
            if (!chatContainer) {
                // 尝试查找任何可能的聊天容器
                const possibleContainers = document.querySelectorAll('div');
                let foundContainer = null;
                
                for (const container of possibleContainers) {
                    // 查找可能包含消息的容器
                    if (container.children.length > 3 && 
                        (container.scrollHeight > container.clientHeight || container.clientHeight > 300)) {
                        
                        // 检查是否包含消息类元素
                        if (container.querySelector('.message') || 
                            container.querySelector('[class*="message"]') ||
                            container.querySelector('[class*="chat"]')) {
                            
                            foundContainer = container;
                            break;
                        }
                    }
                }
                
                if (foundContainer) {
                    console.log('[整合修复] 找到可能的聊天容器:', foundContainer);
                    chatContainer = foundContainer;
                } else {
                    console.warn('[整合修复] 未找到聊天容器，尝试添加到body');
                    // 如果找不到，尝试添加到body
                    const timerMessagesContainer = document.createElement('div');
                    timerMessagesContainer.id = 'timerMessagesContainer';
                    timerMessagesContainer.style.position = 'fixed';
                    timerMessagesContainer.style.bottom = '100px';
                    timerMessagesContainer.style.left = '20px';
                    timerMessagesContainer.style.maxWidth = '300px';
                    timerMessagesContainer.style.maxHeight = '200px';
                    timerMessagesContainer.style.overflowY = 'auto';
                    timerMessagesContainer.style.zIndex = '1000';
                    document.body.appendChild(timerMessagesContainer);
                    chatContainer = timerMessagesContainer;
                }
            }
            
            // 创建对话框元素
            const dialogElement = document.createElement('div');
            dialogElement.className = 'message system-message timer-notification-message';
            dialogElement.innerHTML = `
                <div class="message-content">
                    <div class="message-header">
                        <strong>⏰ ${notification.title}</strong>
                    </div>
                    <div class="message-body">
                        ${notification.message}
                    </div>
                    <div class="message-time">
                        ${new Date().toLocaleTimeString()}
                    </div>
                </div>
            `;
            
            // 设置样式 - 使用更明显的风格
            Object.assign(dialogElement.style, {
                margin: '10px 0',
                padding: '10px',
                backgroundColor: '#e8f5e9',
                border: '1px solid #4CAF50',
                borderRadius: '4px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                animation: 'fadeIn 0.5s',
                fontSize: '14px',
                position: 'relative',
                zIndex: '999'
            });
            
            // 添加到聊天容器
            chatContainer.appendChild(dialogElement);
            
            // 滚动到底部
            chatContainer.scrollTop = chatContainer.scrollHeight;
            
            // 添加点击时的高亮效果
            dialogElement.addEventListener('click', function() {
                this.style.backgroundColor = '#c8e6c9';
                setTimeout(() => {
                    this.style.backgroundColor = '#e8f5e9';
                }, 300);
            });
            
            console.log('[整合修复] 对话框提醒添加成功');
            return true;
        } catch (error) {
            console.error('[整合修复] 显示对话框提醒失败:', error);
            return false;
        }
    }
    
    // 3. 创建显示通知的函数
    function showTimerNotification(notification) {
        try {
            // 创建通知元素
            const notificationElement = document.createElement('div');
            notificationElement.className = 'timer-notification';
            notificationElement.innerHTML = `
                <div class="notification-title">${notification.title}</div>
                <div class="notification-message">${notification.message}</div>
                <button class="close-notification">关闭</button>
            `;
            
            // 设置样式
            Object.assign(notificationElement.style, {
                position: 'fixed',
                top: '20px',
                right: '20px',
                backgroundColor: '#4CAF50',
                color: 'white',
                padding: '15px',
                borderRadius: '4px',
                boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                zIndex: '9999',
                maxWidth: '300px'
            });
            
            // 添加到页面
            document.body.appendChild(notificationElement);
            
            // 添加关闭按钮事件
            const closeButton = notificationElement.querySelector('.close-notification');
            if (closeButton) {
                closeButton.addEventListener('click', function() {
                    document.body.removeChild(notificationElement);
                });
            }
            
            // 自动关闭（10秒后）
            setTimeout(function() {
                if (document.body.contains(notificationElement)) {
                    document.body.removeChild(notificationElement);
                }
            }, 10000);
            
            console.log('[整合修复] 显示计时器通知成功');
            return true;
        } catch (error) {
            console.error('[整合修复] 显示通知失败:', error);
            return false;
        }
    }
    
    // 4. 播放广播提示音效
    function playBroadcastSound(onComplete) {
        // 确保先停止任何音频
        stopAllPlayback();
        
        console.log('[整合修复] 播放广播提示音');
        
        // 检查是否启用广播音效
        if (typeof window.enableBroadcastSound !== 'undefined' && !window.enableBroadcastSound) {
            console.log('[整合修复] 广播提示音已禁用，直接执行回调');
            if (typeof onComplete === 'function') {
                setTimeout(onComplete, 100);
            }
            return;
        }
        
        // 广播音频URL
        const broadcastSoundUrl = '/audio/Broadcastalert.mp3';
        
        // 确保文件存在
        fetch(broadcastSoundUrl, {method: 'HEAD'})
            .then(response => {
                if (response.ok) {
                    console.log('[整合修复] 广播提示音文件存在，开始播放');
                    
                    // 使用协调器播放（如果可用）
                    if (window.AudioCoordinator && typeof window.AudioCoordinator.playBroadcastSound === 'function') {
                        window.AudioCoordinator.playBroadcastSound(broadcastSoundUrl, function() {
                            console.log('[整合修复] 广播提示音播放完成');
                            if (typeof onComplete === 'function') {
                                onComplete();
                            }
                        });
                        return;
                    }
                    
                    // 使用基础播放功能
                    try {
                        console.log('[整合修复] 使用基础播放功能播放广播提示音');
                        // 创建新的音频元素
                        const audio = new Audio(broadcastSoundUrl);
                        
                        // 播放完成后执行回调
                        audio.onended = function() {
                            console.log('[整合修复] 广播提示音播放完成');
                            if (typeof onComplete === 'function') {
                                onComplete();
                            }
                        };
                        
                        // 播放错误处理
                        audio.onerror = function(e) {
                            console.error('[整合修复] 广播提示音播放失败:', e);
                            if (typeof onComplete === 'function') {
                                setTimeout(onComplete, 100);
                            }
                        };
                        
                        // 开始播放
                        audio.play().catch(function(error) {
                            console.error('[整合修复] 播放广播提示音失败:', error);
                            if (typeof onComplete === 'function') {
                                setTimeout(onComplete, 100);
                            }
                        });
                    } catch (error) {
                        console.error('[整合修复] 创建广播提示音播放实例失败:', error);
                        if (typeof onComplete === 'function') {
                            setTimeout(onComplete, 100);
                        }
                    }
                } else {
                    console.warn('[整合修复] 广播提示音文件不存在，跳过播放');
                    if (typeof onComplete === 'function') {
                        setTimeout(onComplete, 100);
                    }
                }
            })
            .catch(error => {
                console.error('[整合修复] 检查广播提示音文件失败:', error);
                if (typeof onComplete === 'function') {
                    setTimeout(onComplete, 100);
                }
            });
    }
    
    // 5. 创建播放音频的函数 - 修复循环播放问题
    function playTimerAudio(notification) {
        console.log('[整合修复] 播放计时器音频，获取配置...');
        
        // 再次清除缓存，确保获取最新设置
        localStorage.removeItem('_timerSettingsCache');
        
        // 确保停止所有当前播放
        stopAllPlayback();
        
        // 防止重叠播放 - 全局状态锁定
        if (audioState.isPlaying) {
            console.log('[整合修复] 已有音频正在播放，不重复播放');
            return;
        }
        
        // 获取设置 - 强制从localStorage重新加载
        const settings = getSafeTimerSettings(true);
        
        // 打印当前设置，帮助调试
        console.log('[整合修复] 当前计时器设置:', settings);
        console.log('[整合修复] audioLoopCount (每条提醒音频播放次数):', settings.audioLoopCount);
        console.log('[整合修复] audioLoopInterval (音频循环间隔,毫秒):', settings.audioLoopInterval);
        console.log('[整合修复] repeatCount (提醒重复次数):', settings.repeatCount);
        console.log('[整合修复] intervalSeconds (提醒间隔,秒):', settings.intervalSeconds);
        
        // 确保无效的设置值不会导致问题
        const loopCount = Math.max(1, parseInt(settings.audioLoopCount) || 3);
        const loopInterval = Math.max(100, parseInt(settings.audioLoopInterval) || 500);
        
        // 更新到状态对象
        audioState.isPlaying = true;
        audioState.currentAudio = notification.audioUrl;
        audioState.loopInfo.totalLoops = loopCount;
        audioState.loopInfo.intervalId = loopInterval;
        audioState.loopInfo.currentLoop = 0;
        
        console.log('[整合修复] 准备播放音频，循环次数:', audioState.loopInfo.totalLoops, 
                   '循环间隔:', audioState.loopInfo.intervalId, 'ms');
        
        // 定义递归播放函数
        function playSingleLoop() {
            if (!audioState.isPlaying) {
                console.log('[整合修复] 播放已被其他进程停止，中断循环');
                return;
            }
            
            // 更新循环索引
            audioState.loopInfo.currentLoop++;
            console.log('[整合修复] 播放第', audioState.loopInfo.currentLoop, '/', audioState.loopInfo.totalLoops, '次音频');
            
            try {
                // 创建专用的Audio实例，避免使用共享实例导致问题
                const audio = new Audio(notification.audioUrl);
                
                // 设置音量（如果有）
                if (settings.notificationVolume) {
                    audio.volume = parseFloat(settings.notificationVolume);
                }
                
                // 播放完成处理
                audio.onended = function() {
                    console.log('[整合修复] 单次音频播放完成');
                    
                    // 检查是否需要继续循环
                    if (audioState.loopInfo.currentLoop < audioState.loopInfo.totalLoops) {
                        console.log('[整合修复] 安排下一循环播放，等待间隔:', audioState.loopInfo.intervalId, 'ms');
                        setTimeout(playSingleLoop, audioState.loopInfo.intervalId);
                    } else {
                        console.log('[整合修复] 已完成所有', audioState.loopInfo.totalLoops, '次循环播放');
                        audioState.isPlaying = false;
                        audioState.currentAudio = null;
                    }
                };
                
                // 错误处理
                audio.onerror = function(error) {
                    console.error('[整合修复] 音频播放错误:', error);
                    
                    // 尝试使用备用方法播放
                    if (window.AudioAutoplay && typeof window.AudioAutoplay.play === 'function') {
                        console.log('[整合修复] 尝试使用AudioAutoplay播放');
                        window.AudioAutoplay.play(notification.audioUrl, function() {
                            // 检查是否需要继续循环
                            if (audioState.loopInfo.currentLoop < audioState.loopInfo.totalLoops) {
                                setTimeout(playSingleLoop, audioState.loopInfo.intervalId);
                            } else {
                                audioState.isPlaying = false;
                                audioState.currentAudio = null;
                            }
                        });
                    } else {
                        // 失败时还是继续循环逻辑
                        if (audioState.loopInfo.currentLoop < audioState.loopInfo.totalLoops) {
                            setTimeout(playSingleLoop, audioState.loopInfo.intervalId);
                        } else {
                            audioState.isPlaying = false;
                            audioState.currentAudio = null;
                        }
                    }
                };
                
                // 开始播放
                console.log('[整合修复] 开始播放音频:', notification.audioUrl);
                audio.play().catch(function(error) {
                    console.error('[整合修复] 音频播放API错误:', error);
                    
                    // 尝试使用备用方法
                    if (window.AudioAutoplay && typeof window.AudioAutoplay.play === 'function') {
                        console.log('[整合修复] 尝试使用AudioAutoplay备用播放');
                        window.AudioAutoplay.play(notification.audioUrl, function() {
                            // 完成后检查循环
                            if (audioState.loopInfo.currentLoop < audioState.loopInfo.totalLoops) {
                                setTimeout(playSingleLoop, audioState.loopInfo.intervalId);
                            } else {
                                audioState.isPlaying = false;
                                audioState.currentAudio = null;
                            }
                        });
                    } else {
                        // 依然处理循环逻辑
                        if (audioState.loopInfo.currentLoop < audioState.loopInfo.totalLoops) {
                            setTimeout(playSingleLoop, audioState.loopInfo.intervalId);
                        } else {
                            audioState.isPlaying = false;
                            audioState.currentAudio = null;
                        }
                    }
                });
            } catch (error) {
                console.error('[整合修复] 创建音频实例出错:', error);
                
                // 出错也要继续尝试循环
                if (audioState.loopInfo.currentLoop < audioState.loopInfo.totalLoops) {
                    setTimeout(playSingleLoop, audioState.loopInfo.intervalId);
                } else {
                    audioState.isPlaying = false;
                    audioState.currentAudio = null;
                }
            }
        }
        
        // 开始第一次播放
        playSingleLoop();
    }
    
    // 改进安全获取计时器设置的函数，确保从localStorage获取最新设置
    function getSafeTimerSettings(forceRefresh = false) {
        console.log('[整合修复-高优先级] 获取安全设置, forceRefresh=', forceRefresh);
        
        // 总是尝试先从localStorage获取最新设置
        try {
            const savedSettings = localStorage.getItem('timerSettings');
            if (savedSettings) {
                const parsedSettings = JSON.parse(savedSettings);
                console.log('[整合修复-高优先级] 从localStorage读取到设置:', parsedSettings);
                
                // 确保所有值的类型和范围正确
                const validatedSettings = {
                    audioLoopCount: validateNumberSetting(parsedSettings.audioLoopCount, 3, 1, 10),
                    audioLoopInterval: validateNumberSetting(parsedSettings.audioLoopInterval, 500, 100, 5000),
                    repeatCount: validateNumberSetting(parsedSettings.repeatCount, 2, 1, 10),
                    intervalSeconds: validateNumberSetting(parsedSettings.intervalSeconds, 5, 1, 60),
                    autoStopOnResponse: typeof parsedSettings.autoStopOnResponse === 'boolean' ? 
                                       parsedSettings.autoStopOnResponse : true
                };
                
                // 更新全局变量
                window.timerSettings = validatedSettings;
                
                // 缓存结果
                window._timerSettingsCache = {...validatedSettings};
                
                return validatedSettings;
            }
        } catch (error) {
            console.error('[整合修复-高优先级] 从localStorage读取设置失败:', error);
        }
        
        // 如果没有从localStorage获取到，尝试从全局变量获取
        if (typeof window.timerSettings !== 'undefined') {
            const settings = {...window.timerSettings};
            console.log('[整合修复-高优先级] 使用全局变量中的设置:', settings);
            
            // 验证设置合法性
            settings.audioLoopCount = validateNumberSetting(settings.audioLoopCount, 3, 1, 10);
            settings.audioLoopInterval = validateNumberSetting(settings.audioLoopInterval, 500, 100, 5000);
            settings.repeatCount = validateNumberSetting(settings.repeatCount, 2, 1, 10);
            settings.intervalSeconds = validateNumberSetting(settings.intervalSeconds, 5, 1, 60);
            settings.autoStopOnResponse = typeof settings.autoStopOnResponse === 'boolean' ? 
                                         settings.autoStopOnResponse : true;
            
            return settings;
        }
        
        // 如果都没有找到，使用默认设置
        const defaultSettings = {
            audioLoopCount: 3,
            audioLoopInterval: 500,
            repeatCount: 2,
            intervalSeconds: 5,
            autoStopOnResponse: true
        };
        
        console.log('[整合修复-高优先级] 无法获取保存的设置，使用默认值:', defaultSettings);
        window.timerSettings = {...defaultSettings};
        
        return defaultSettings;
    }
    
    // 辅助函数：验证数字设置项
    function validateNumberSetting(value, defaultValue, min, max) {
        let parsedValue = parseInt(value);
        if (isNaN(parsedValue)) return defaultValue;
        if (parsedValue < min) return min;
        if (parsedValue > max) return max;
        return parsedValue;
    }
    
    // 7. 安全地重写handleTimerCompleted函数
    if (typeof window.handleTimerCompleted === 'function') {
        window.handleTimerCompleted = function(data) {
            console.log('[整合修复] 调用安全版的handleTimerCompleted函数:', data);
            
            try {
                // 停止任何正在播放的音频，避免重叠
                stopAllPlayback();
                
                // 提取必要的数据
                const timerId = data.id || '';
                const title = data.title || '计时器提醒';
                const message = data.message || '时间到';
                const audioUrl = data.audioUrl || '/audio/alert.mp3';
                
                // 检查并使用音频协调器（如果存在）
                if (window.AudioCoordinator && typeof window.AudioCoordinator.handleTimerCompleted === 'function') {
                    console.log('[整合修复] 使用音频协调器处理计时器完成事件');
                    
                    // 更新用户交互时间
                    if (typeof window.lastUserInteractionTime !== 'undefined') {
                        window.lastUserInteractionTime = Date.now();
                    }
                    
                    // 调用协调器处理函数
                    const result = window.AudioCoordinator.handleTimerCompleted({
                        id: timerId,
                        title: title,
                        message: message,
                        audioUrl: audioUrl
                    });
                    
                    // 如果协调器成功处理，则返回结果
                    if (result) {
                        return result;
                    }
                    
                    // 否则继续使用我们的实现
                    console.log('[整合修复] 协调器处理失败，使用备用实现');
                }
                
                // 添加一个小延迟，确保之前的音频完全停止
                setTimeout(function() {
                    // 直接调用setupTimerReminders，不再通过其他中间函数
                    window.setupTimerReminders(timerId, title, message, audioUrl);
                }, 500);
                
                return true;
            } catch (error) {
                console.error('[整合修复] 处理计时器完成事件出错:', error);
                // 紧急备用方案
                showTimerNotification({
                    title: '计时器提醒',
                    message: data && data.message ? data.message : '时间到',
                    audioUrl: data && data.audioUrl ? data.audioUrl : '/audio/alert.mp3'
                });
                return false;
            }
        };
        console.log('[整合修复] 已安全重写handleTimerCompleted函数');
    }
    
    // 8. 确保activeTimerReminders变量存在并为Map类型
    if (typeof window.activeTimerReminders === 'undefined' || !(window.activeTimerReminders instanceof Map)) {
        window.activeTimerReminders = new Map();
        console.log('[整合修复] 初始化activeTimerReminders为空Map');
    }
    
    // 9. 确保timerSettings变量存在
    if (typeof window.timerSettings === 'undefined') {
        window.timerSettings = {
            repeatCount: 2,
            intervalSeconds: 5,
            autoStopOnResponse: true,
            audioLoopCount: 1,
            audioLoopInterval: 500
        };
        console.log('[整合修复] 初始化timerSettings变量');
        
        // 尝试从localStorage加载保存的设置
        try {
            const savedSettings = localStorage.getItem('timerSettings');
            if (savedSettings) {
                const parsedSettings = JSON.parse(savedSettings);
                // 合并设置
                window.timerSettings = {...window.timerSettings, ...parsedSettings};
                console.log('[整合修复] 从localStorage加载了保存的设置');
            }
        } catch (error) {
            console.error('[整合修复] 加载设置出错:', error);
        }
    }
    
    // 10. 测试函数 - 允许用户手动测试计时器通知功能
    window.testTimerNotification = function(title = '测试提醒', message = '这是一条测试消息', audioUrl = '/audio/alert.mp3') {
        console.log('[整合修复] 测试计时器通知功能');
        // 停止任何正在播放的内容
        stopAllPlayback();
        // 短暂延迟后开始测试，确保播放干净
        setTimeout(function() {
            window.setupTimerReminders('test-' + Date.now(), title, message, audioUrl);
        }, 200);
        return true;
    };
    
    // 11. 测试函数 - 仅测试循环播放功能
    window.testAudioLoopPlayback = function(audioUrl = '/audio/alert.mp3', loopCount = null, loopInterval = null) {
        console.log('[整合修复] 测试音频循环播放功能');
        
        // 停止任何正在播放的内容
        stopAllPlayback();
        
        // 临时修改设置用于测试
        const originalSettings = {...window.timerSettings};
        if (loopCount !== null) window.timerSettings.audioLoopCount = loopCount;
        if (loopInterval !== null) window.timerSettings.audioLoopInterval = loopInterval;
        
        // 短暂延迟后播放测试音频
        setTimeout(function() {
            playTimerAudio({
                title: '音频循环测试',
                message: '测试循环播放功能',
                audioUrl: audioUrl
            });
            
            // 恢复原始设置
            setTimeout(function() {
                window.timerSettings = originalSettings;
            }, 100);
        }, 200);
        
        return true;
    };
    
    // 12. 添加DOM加载完成后的初始化逻辑
    document.addEventListener('DOMContentLoaded', function() {
        console.log('[整合修复] DOM已加载，初始化集成功能');
        
        // 更新用户交互时间
        if (typeof window.lastUserInteractionTime !== 'undefined') {
            window.lastUserInteractionTime = Date.now();
            console.log('[整合修复] 更新用户交互时间');
        }
        
        // 处理与协调器的集成
        if (window.AudioCoordinator) {
            console.log('[整合修复] 检测到音频协调器，进行集成');
            
            // 备份原始方法
            const originalPlayTimerAudio = window.AudioCoordinator.playTimerAudio;
            
            // 增强playTimerAudio以防止重叠播放
            if (typeof originalPlayTimerAudio === 'function') {
                window.AudioCoordinator.playTimerAudio = function(audioUrl, message) {
                    console.log('[整合修复] 拦截AudioCoordinator.playTimerAudio调用');
                    
                    // 如果我们的脚本正在播放音频，停止协调器播放
                    if (audioState.isPlaying) {
                        console.log('[整合修复] 本地音频正在播放，忽略协调器播放请求');
                        return false;
                    }
                    
                    // 否则允许协调器播放
                    return originalPlayTimerAudio.call(window.AudioCoordinator, audioUrl, message);
                };
            }
            
            // 添加重复播放检测
            window.checkAudioCoordinatorQueue = function() {
                // 如果协调器队列中有内容，但我们的脚本正在播放，暂停协调器队列处理
                if (window.AudioCoordinator._state && 
                    window.AudioCoordinator._state.timerAudioQueue && 
                    window.AudioCoordinator._state.timerAudioQueue.length > 0 &&
                    audioState.isPlaying) {
                    console.log('[整合修复] 暂停协调器队列处理，避免重叠播放');
                    return false;
                }
                return true;
            };
            
            // 每秒检查一次是否有重叠播放
            setInterval(window.checkAudioCoordinatorQueue, 1000);
        }
        
        // 监听WebSocket消息，确保timerCompleted事件被正确处理
        const originalHandleSocketMessage = window.handleSocketMessage;
        if (typeof originalHandleSocketMessage === 'function') {
            // 创建处理过的消息ID集合，避免重复处理
            if (!window._processedTimerMessages) {
                window._processedTimerMessages = new Set();
            }
            
            window.handleSocketMessage = function(event) {
                try {
                    // 检查是否是计时器完成事件，并提前处理
                    let timerMessageHandled = false;
                    try {
                        const data = JSON.parse(event.data);
                        if (data && data.type === 'timer_completed' && data.data && data.data.id) {
                            // 检查是否已处理过此消息
                            const messageId = data.data.id + '_' + Date.now();
                            
                            if (window._processedTimerMessages.has(data.data.id)) {
                                console.log('[整合修复] 忽略重复的计时器完成消息:', data.data.id);
                                timerMessageHandled = true;
                            } else {
                                console.log('[整合修复] 检测到计时器完成WebSocket消息:', data);
                                
                                // 添加到已处理集合
                                window._processedTimerMessages.add(data.data.id);
                                
                                // 设置15秒后清除此ID（防止长期占用内存）
                                setTimeout(() => {
                                    window._processedTimerMessages.delete(data.data.id);
                                }, 15000);
                                
                                // 停止当前播放的任何音频，防止重叠
                                stopAllPlayback();
                                
                                // 确保计时器完成事件被处理，添加延迟避免冲突
                                setTimeout(function() {
                                    if (typeof window.handleTimerCompleted === 'function') {
                                        window.handleTimerCompleted(data.data);
                                        timerMessageHandled = true;
                                    }
                                }, 300);
                            }
                        }
                    } catch (error) {
                        // 忽略JSON解析错误
                        console.warn('[整合修复] 解析WebSocket消息出错:', error);
                    }
                    
                    // 如果没有处理过计时器消息，调用原始处理函数
                    if (!timerMessageHandled) {
                        originalHandleSocketMessage(event);
                    }
                } catch (error) {
                    console.error('[整合修复] 处理WebSocket消息出错:', error);
                    // 尝试调用原始函数
                    try {
                        originalHandleSocketMessage(event);
                    } catch (err) {
                        console.error('[整合修复] 原始WebSocket处理器也出错:', err);
                    }
                }
            };
            
            console.log('[整合修复] 已增强WebSocket消息处理');
        }
        
        // 13. 查找并增强计时器设置表单的保存功能
        setTimeout(function() {
            console.log('[整合修复] 开始查找计时器设置表单和保存按钮');
            
            // 获取保存按钮 - 尝试多个可能的ID
            const saveButton = document.getElementById('saveTimerSettings') || 
                               document.querySelector('.timer-settings-save') ||
                               document.querySelector('button[data-action="save-timer-settings"]');
            
            if (saveButton) {
                console.log('[整合修复] 找到计时器设置保存按钮:', saveButton);
                
                // 克隆并替换按钮以移除现有事件监听器
                const newSaveButton = saveButton.cloneNode(true);
                saveButton.parentNode.replaceChild(newSaveButton, saveButton);
                
                // 添加新事件监听器
                newSaveButton.addEventListener('click', function(e) {
                    console.log('[整合修复] 计时器设置保存按钮被点击');
                    e.preventDefault();
                    
                    // 获取表单 - 尝试多种查询方式
                    let settingsForm = document.getElementById('timerSettingsForm');
                    
                    // 如果找不到表单，尝试从按钮向上查找
                    if (!settingsForm) {
                        console.log('[整合修复] 通过ID未找到表单，尝试从按钮向上查找');
                        let parent = newSaveButton.parentElement;
                        while (parent && !settingsForm) {
                            if (parent.tagName === 'FORM' || 
                                parent.classList.contains('settings-form') || 
                                parent.classList.contains('timer-settings-container')) {
                                settingsForm = parent;
                                break;
                            }
                            
                            // 检查是否有form子元素
                            const formChild = parent.querySelector('form');
                            if (formChild) {
                                settingsForm = formChild;
                                break;
                            }
                            
                            parent = parent.parentElement;
                        }
                    }
                    
                    // 如果仍然找不到，尝试查找任何包含计时器设置相关输入的容器
                    if (!settingsForm) {
                        console.log('[整合修复] 无法找到完整表单，尝试查找设置容器');
                        settingsForm = document.querySelector('.modal-content') || 
                                      document.querySelector('.settings-modal') ||
                                      document.querySelector('.timer-settings-modal');
                    }
                    
                    if (!settingsForm) {
                        console.error('[整合修复] 无法找到任何计时器设置表单或容器');
                        
                        // 显示错误通知
                        showTimerNotification({
                            title: '保存失败',
                            message: '无法找到设置表单。请刷新页面后再试。',
                            audioUrl: ''
                        });
                        return;
                    }
                    
                    console.log('[整合修复] 找到设置容器:', settingsForm);
                    
                    // 收集数据
                    try {
                        // 从头创建空对象，不从现有设置复制
                        const settings = {};
                        
                        // 读取音频循环设置
                        const audioLoopCountInput = settingsForm.querySelector('#audioLoopCount') || 
                                                  settingsForm.querySelector('[name="audioLoopCount"]') ||
                                                  settingsForm.querySelector('input[data-setting="audioLoopCount"]');
                        if (audioLoopCountInput) {
                            settings.audioLoopCount = parseInt(audioLoopCountInput.value) || 3;
                            console.log('[整合修复] 读取audioLoopCount设置:', settings.audioLoopCount);
                        } else {
                            settings.audioLoopCount = 3; // 默认值
                        }
                        
                        const audioLoopIntervalInput = settingsForm.querySelector('#audioLoopInterval') ||
                                                     settingsForm.querySelector('[name="audioLoopInterval"]') ||
                                                     settingsForm.querySelector('input[data-setting="audioLoopInterval"]');
                        if (audioLoopIntervalInput) {
                            settings.audioLoopInterval = parseInt(audioLoopIntervalInput.value) || 500;
                            console.log('[整合修复] 读取audioLoopInterval设置:', settings.audioLoopInterval);
                        } else {
                            settings.audioLoopInterval = 500; // 默认值
                        }
                        
                        // 读取其他设置
                        const repeatCountInput = settingsForm.querySelector('#repeatCount') ||
                                               settingsForm.querySelector('[name="repeatCount"]') ||
                                               settingsForm.querySelector('input[data-setting="repeatCount"]');
                        if (repeatCountInput) {
                            settings.repeatCount = parseInt(repeatCountInput.value) || 2;
                            console.log('[整合修复] 读取repeatCount设置:', settings.repeatCount);
                        } else {
                            settings.repeatCount = 2; // 默认值
                        }
                        
                        const intervalSecondsInput = settingsForm.querySelector('#intervalSeconds') ||
                                                   settingsForm.querySelector('[name="intervalSeconds"]') ||
                                                   settingsForm.querySelector('input[data-setting="intervalSeconds"]');
                        if (intervalSecondsInput) {
                            settings.intervalSeconds = parseInt(intervalSecondsInput.value) || 5;
                            console.log('[整合修复] 读取intervalSeconds设置:', settings.intervalSeconds);
                        } else {
                            settings.intervalSeconds = 5; // 默认值
                        }
                        
                        const autoStopOnResponseInput = settingsForm.querySelector('#autoStopOnResponse') ||
                                                       settingsForm.querySelector('[name="autoStopOnResponse"]') ||
                                                       settingsForm.querySelector('input[data-setting="autoStopOnResponse"]');
                        if (autoStopOnResponseInput) {
                            settings.autoStopOnResponse = autoStopOnResponseInput.checked;
                            console.log('[整合修复] 读取autoStopOnResponse设置:', settings.autoStopOnResponse);
                        } else {
                            settings.autoStopOnResponse = true; // 默认值
                        }
                        
                        // 保存设置 - 完全替换旧设置
                        window.timerSettings = settings;
                        
                        // 清除缓存，确保下次获取最新设置
                        localStorage.removeItem('_timerSettingsCache');
                        
                        // 保存到localStorage
                        localStorage.setItem('timerSettings', JSON.stringify(settings));
                        
                        console.log('[整合修复] 已保存计时器设置:', settings);
                        
                        // 尝试关闭设置模态框 - 尝试多种方式
                        const modal = settingsForm.closest('.modal') || 
                                     document.querySelector('#timerSettingsModal') ||
                                     document.querySelector('.settings-modal') ||
                                     document.querySelector('.timer-settings-modal');
                        
                        if (modal) {
                            console.log('[整合修复] 找到模态框，尝试关闭');
                            modal.style.display = 'none';
                            
                            // 还可以尝试其他关闭方法
                            if (typeof modal.close === 'function') {
                                modal.close();
                            } else if (modal.classList.contains('show')) {
                                modal.classList.remove('show');
                            }
                        }
                        
                        // 显示成功消息
                        showTimerNotification({
                            title: '设置已保存',
                            message: '计时器设置已成功保存并立即生效',
                            audioUrl: ''
                        });
                        
                        // 提供当前设置的反馈
                        console.log('[整合修复] 当前有效设置:');
                        console.log('- 音频循环次数:', settings.audioLoopCount);
                        console.log('- 音频循环间隔:', settings.audioLoopInterval, '毫秒');
                        console.log('- 提醒重复次数:', settings.repeatCount);
                        console.log('- 提醒间隔时间:', settings.intervalSeconds, '秒');
                        console.log('- 有响应时自动停止:', settings.autoStopOnResponse);
                        
                        // 触发设置已更新事件，让其他脚本可以响应
                        const settingsUpdatedEvent = new CustomEvent('timerSettingsUpdated', { 
                            detail: settings 
                        });
                        document.dispatchEvent(settingsUpdatedEvent);
                    } catch (error) {
                        console.error('[整合修复] 保存设置时出错:', error);
                        
                        // 显示错误消息
                        showTimerNotification({
                            title: '保存失败',
                            message: '计时器设置保存失败: ' + error.message,
                            audioUrl: ''
                        });
                    }
                });
                
                console.log('[整合修复] 计时器设置保存按钮功能增强完成');
            } else {
                console.warn('[整合修复] 未找到计时器设置保存按钮');
            }
        }, 2000); // 延长等待时间到2秒，确保页面完全加载
    });
    
    // 14. 注册页面卸载前的清理函数
    window.addEventListener('beforeunload', function() {
        console.log('[整合修复] 页面即将卸载，清理资源');
        stopAllPlayback();
    });
    
    // 添加到合适位置：设置说明函数 - 显示计时器设置项的详细解释
    function showTimerSettingsExplanation() {
        console.log('[整合修复] 显示计时器设置项说明');
        
        // 找到合适的容器显示说明
        const container = document.querySelector('.modal-content') || 
                        document.querySelector('.settings-modal') ||
                        document.querySelector('.timer-settings-modal');
        
        if (!container) {
            console.warn('[整合修复] 无法找到合适的容器显示设置说明');
            return;
        }
        
        // 检查是否已存在说明
        if (container.querySelector('.settings-explanation')) {
            console.log('[整合修复] 设置说明已存在');
            return;
        }
        
        // 创建说明容器
        const explanationDiv = document.createElement('div');
        explanationDiv.className = 'settings-explanation';
        explanationDiv.style.margin = '10px 0';
        explanationDiv.style.padding = '10px';
        explanationDiv.style.backgroundColor = '#f8f9fa';
        explanationDiv.style.border = '1px solid #dee2e6';
        explanationDiv.style.borderRadius = '4px';
        explanationDiv.style.fontSize = '14px';
        
        // 添加说明内容
        explanationDiv.innerHTML = `
            <h4 style="margin-top:0;">计时器设置项说明</h4>
            <hr style="margin:5px 0;">
            <p style="margin-bottom:5px;"><strong>音频循环次数</strong>: 每条提醒通知音频连续播放的次数。例如设置为3，音频会连续播放3次。</p>
            <p style="margin-bottom:5px;"><strong>音频循环间隔</strong>: 音频连续播放时，每次播放之间的暂停时间（毫秒）。</p>
            <p style="margin-bottom:5px;"><strong>提醒重复次数</strong>: 整个提醒通知出现的次数。例如设置为2，整个提醒会在间隔后再次出现。</p>
            <p style="margin-bottom:5px;"><strong>提醒间隔时间</strong>: 两次提醒通知之间的间隔时间（秒）。</p>
            <p style="font-style:italic;color:#666;">提示：如果想让音频播放多次，请增加"音频循环次数"；如果想让整个提醒多次显示，请增加"提醒重复次数"。</p>
        `;
        
        // 找到合适的位置插入
        const form = container.querySelector('form') || container;
        const firstChild = form.firstChild;
        
        if (firstChild) {
            form.insertBefore(explanationDiv, firstChild);
        } else {
            form.appendChild(explanationDiv);
        }
        
        console.log('[整合修复] 已添加设置说明');
    }
    
    // 修改表单初始化函数，添加显示说明的调用
    function initializeTimerSettingsForm() {
        console.log('[整合修复-高优先级] 开始初始化计时器设置表单');
        
        // 查找设置按钮
        const settingsBtn = document.getElementById('toggleSettings') || 
                          document.querySelector('[data-action="toggle-timer-settings"]') ||
                          document.querySelector('.timer-settings-toggle');
        
        if (settingsBtn) {
            console.log('[整合修复-高优先级] 找到计时器设置按钮:', settingsBtn);
            
            // 完全替换点击事件处理函数
            const newBtn = settingsBtn.cloneNode(true);
            if (settingsBtn.parentNode) {
                settingsBtn.parentNode.replaceChild(newBtn, settingsBtn);
                console.log('[整合修复-高优先级] 已替换设置按钮，移除旧事件');
            }
            
            // 添加新的点击事件处理函数
            newBtn.addEventListener('click', function(e) {
                console.log('[整合修复-高优先级] 计时器设置按钮被点击');
                e.preventDefault();
                
                // 查找或创建设置面板
                let settingsModal = document.getElementById('timerSettingsModal');
                
                if (!settingsModal) {
                    console.log('[整合修复-高优先级] 设置模态框不存在，尝试查找其他候选项');
                    settingsModal = document.querySelector('.settings-modal') || 
                                  document.querySelector('.timer-settings-modal');
                }
                
                if (!settingsModal) {
                    console.warn('[整合修复-高优先级] 无法找到设置模态框，尝试创建一个');
                    
                    // 创建模态框
                    settingsModal = document.createElement('div');
                    settingsModal.id = 'timerSettingsModal';
                    settingsModal.className = 'modal settings-modal';
                    settingsModal.style.display = 'none';
                    settingsModal.style.position = 'fixed';
                    settingsModal.style.zIndex = '1000';
                    settingsModal.style.left = '0';
                    settingsModal.style.top = '0';
                    settingsModal.style.width = '100%';
                    settingsModal.style.height = '100%';
                    settingsModal.style.overflow = 'auto';
                    settingsModal.style.backgroundColor = 'rgba(0,0,0,0.4)';
                    
                    // 创建内容容器
                    const modalContent = document.createElement('div');
                    modalContent.className = 'modal-content';
                    modalContent.style.backgroundColor = '#fefefe';
                    modalContent.style.margin = '15% auto';
                    modalContent.style.padding = '20px';
                    modalContent.style.border = '1px solid #888';
                    modalContent.style.width = '60%';
                    modalContent.style.maxWidth = '500px';
                    modalContent.style.borderRadius = '5px';
                    modalContent.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
                    
                    // 创建关闭按钮
                    const closeBtn = document.createElement('span');
                    closeBtn.className = 'close';
                    closeBtn.innerHTML = '&times;';
                    closeBtn.style.color = '#aaa';
                    closeBtn.style.float = 'right';
                    closeBtn.style.fontSize = '28px';
                    closeBtn.style.fontWeight = 'bold';
                    closeBtn.style.cursor = 'pointer';
                    
                    // 添加关闭事件
                    closeBtn.addEventListener('click', function() {
                        settingsModal.style.display = 'none';
                    });
                    
                    // 创建标题
                    const title = document.createElement('h2');
                    title.textContent = '计时器设置';
                    title.style.marginTop = '0';
                    
                    // 创建表单
                    const form = document.createElement('form');
                    form.id = 'timerSettingsForm';
                    form.className = 'timer-settings-form';
                    
                    // 添加表单字段
                    const fields = [
                        {
                            id: 'audioLoopCount',
                            label: '音频循环次数',
                            type: 'number',
                            defaultValue: 3,
                            min: 1,
                            max: 10
                        },
                        {
                            id: 'audioLoopInterval',
                            label: '音频循环间隔(毫秒)',
                            type: 'number',
                            defaultValue: 500,
                            min: 100,
                            max: 5000,
                            step: 100
                        },
                        {
                            id: 'repeatCount',
                            label: '提醒重复次数',
                            type: 'number',
                            defaultValue: 2,
                            min: 1,
                            max: 10
                        },
                        {
                            id: 'intervalSeconds',
                            label: '提醒间隔时间(秒)',
                            type: 'number',
                            defaultValue: 5,
                            min: 1,
                            max: 60
                        },
                        {
                            id: 'autoStopOnResponse',
                            label: '用户响应时自动停止提醒',
                            type: 'checkbox',
                            defaultValue: true
                        }
                    ];
                    
                    // 创建字段
                    fields.forEach(field => {
                        const fieldGroup = document.createElement('div');
                        fieldGroup.className = 'form-group';
                        fieldGroup.style.marginBottom = '15px';
                        
                        // 创建标签
                        const label = document.createElement('label');
                        label.htmlFor = field.id;
                        label.textContent = field.label;
                        label.style.display = 'block';
                        label.style.marginBottom = '5px';
                        
                        // 根据类型创建输入控件
                        let input;
                        if (field.type === 'checkbox') {
                            // 创建复选框容器
                            const checkContainer = document.createElement('div');
                            checkContainer.style.display = 'flex';
                            checkContainer.style.alignItems = 'center';
                            
                            // 创建复选框
                            input = document.createElement('input');
                            input.type = 'checkbox';
                            input.id = field.id;
                            input.name = field.id;
                            input.checked = field.defaultValue;
                            
                            // 创建标签
                            const checkLabel = document.createElement('span');
                            checkLabel.textContent = field.label;
                            checkLabel.style.marginLeft = '8px';
                            
                            // 添加到容器
                            checkContainer.appendChild(input);
                            checkContainer.appendChild(checkLabel);
                            
                            // 添加到字段组
                            fieldGroup.appendChild(checkContainer);
                        } else {
                            // 创建输入框
                            input = document.createElement('input');
                            input.type = field.type;
                            input.id = field.id;
                            input.name = field.id;
                            input.value = field.defaultValue;
                            input.style.width = '100%';
                            input.style.padding = '8px';
                            input.style.boxSizing = 'border-box';
                            input.style.border = '1px solid #ddd';
                            input.style.borderRadius = '4px';
                            
                            // 添加属性
                            if (field.min) input.min = field.min;
                            if (field.max) input.max = field.max;
                            if (field.step) input.step = field.step;
                            
                            // 添加到字段组
                            fieldGroup.appendChild(label);
                            fieldGroup.appendChild(input);
                        }
                        
                        // 创建描述
                        if (field.type !== 'checkbox') {
                            const desc = document.createElement('div');
                            desc.className = 'field-description';
                            desc.textContent = field.label + '的设置';
                            desc.style.fontSize = '12px';
                            desc.style.color = '#666';
                            desc.style.marginTop = '4px';
                            fieldGroup.appendChild(desc);
                        }
                        
                        // 添加到表单
                        form.appendChild(fieldGroup);
                    });
                    
                    // 创建保存按钮
                    const saveBtn = document.createElement('button');
                    saveBtn.type = 'button';
                    saveBtn.id = 'saveTimerSettings';
                    saveBtn.className = 'btn btn-primary';
                    saveBtn.textContent = '保存设置';
                    saveBtn.style.backgroundColor = '#4CAF50';
                    saveBtn.style.color = 'white';
                    saveBtn.style.padding = '10px 15px';
                    saveBtn.style.border = 'none';
                    saveBtn.style.borderRadius = '4px';
                    saveBtn.style.cursor = 'pointer';
                    saveBtn.style.fontSize = '16px';
                    saveBtn.style.marginTop = '15px';
                    
                    // 添加按钮点击事件
                    saveBtn.addEventListener('click', function(e) {
                        e.preventDefault();
                        console.log('[整合修复-高优先级] 保存按钮被点击');
                        saveTimerSettings(form);
                    });
                    
                    // 组装模态框
                    modalContent.appendChild(closeBtn);
                    modalContent.appendChild(title);
                    modalContent.appendChild(form);
                    modalContent.appendChild(saveBtn);
                    settingsModal.appendChild(modalContent);
                    
                    // 添加到文档
                    document.body.appendChild(settingsModal);
                    
                    console.log('[整合修复-高优先级] 已创建计时器设置模态框');
                }
                
                // 显示设置面板
                settingsModal.style.display = 'block';
                
                // 添加设置说明
                showTimerSettingsExplanation();
                
                // 加载设置到表单前，确保表单字段已完整创建
                const form = document.getElementById('timerSettingsForm') ||
                           document.querySelector('form.timer-settings') ||
                           document.querySelector('.settings-form') ||
                           document.querySelector('.modal-content');
                          
                if (form) {
                    ensureFormHasRequiredFields(form);
                    
                    // 尝试加载设置到表单
                    loadSettingsToForm();
                    
                    // 记录清楚每个字段的状态
                    const fields = ['audioLoopCount', 'audioLoopInterval', 'repeatCount', 'intervalSeconds', 'autoStopOnResponse'];
                    fields.forEach(field => {
                        const input = form.querySelector(`#${field}`) || 
                                    form.querySelector(`[name="${field}"]`) ||
                                    form.querySelector(`[data-setting="${field}"]`);
                        if (input) {
                            console.log(`[整合修复-高优先级] 字段 ${field} 的值:`, 
                                      input.type === 'checkbox' ? input.checked : input.value);
                        } else {
                            console.warn(`[整合修复-高优先级] 未找到字段 ${field}`);
                        }
                    });
                } else {
                    console.error('[整合修复-高优先级] 无法找到表单，无法加载设置');
                }
            });
            
            console.log('[整合修复-高优先级] 已为设置按钮添加新的点击事件处理');
        } else {
            console.warn('[整合修复-高优先级] 未找到计时器设置按钮');
        }
        
        // 处理保存按钮逻辑
        setupSaveButtonHandler();
        
        console.log('[整合修复-高优先级] 计时器设置表单初始化完成');
    }
    
    // 单独处理保存按钮的函数，便于重复调用
    function setupSaveButtonHandler() {
        // 查找保存按钮
        const saveBtn = document.getElementById('saveTimerSettings') || 
                      document.querySelector('.timer-settings-save') ||
                      document.querySelector('button[data-action="save-timer-settings"]');
        
        if (saveBtn) {
            console.log('[整合修复-高优先级] 找到保存按钮，重置事件处理');
            
            // 移除现有事件
            const newSaveBtn = saveBtn.cloneNode(true);
            if (saveBtn.parentNode) {
                saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
            }
            
            // 添加新事件
            newSaveBtn.addEventListener('click', function(e) {
                e.preventDefault();
                console.log('[整合修复-高优先级] 保存按钮被点击');
                
                // 查找表单
                const form = document.getElementById('timerSettingsForm') ||
                           document.querySelector('form.timer-settings') ||
                           document.querySelector('.settings-form') ||
                           document.querySelector('.modal-content');
                           
                if (form) {
                    // 记录表单内每个字段的值
                    const fields = ['audioLoopCount', 'audioLoopInterval', 'repeatCount', 'intervalSeconds', 'autoStopOnResponse'];
                    const values = {};
                    
                    fields.forEach(field => {
                        const input = form.querySelector(`#${field}`) || 
                                    form.querySelector(`[name="${field}"]`) ||
                                    form.querySelector(`[data-setting="${field}"]`);
                        if (input) {
                            values[field] = input.type === 'checkbox' ? input.checked : input.value;
                            console.log(`[整合修复-高优先级] 保存前检查: 字段 ${field} = ${values[field]}`);
                        }
                    });
                    
                    saveTimerSettings(form);
                    
                    // 2秒后验证保存结果
                    setTimeout(() => {
                        const settings = getSafeTimerSettings(true);
                        console.log('[整合修复-高优先级] 保存结果验证:', settings);
                    }, 2000);
                } else {
                    console.error('[整合修复-高优先级] 无法找到设置表单，无法保存设置');
                    showNotification('保存失败：未找到设置表单', 'error');
                }
            });
            
            console.log('[整合修复-高优先级] 已为保存按钮添加新的事件处理');
        }
    }
    
    // 添加专门的保存设置函数
    function saveTimerSettings(form) {
        console.log('[整合修复-高优先级] 正在保存计时器设置...');
        
        if (!form) {
            console.error('[整合修复-高优先级] 保存失败：未提供表单对象');
            showNotification('保存失败：未找到设置表单', 'error');
            return;
        }
        
        // 直接打印表单内容，帮助调试
        console.log('[整合修复-高优先级] 表单对象:', form);
        
        // 收集表单数据
        const formData = {};
        
        // 查找所有输入字段 - 使用更严格的选择器
        const allInputs = form.querySelectorAll('input, select, textarea');
        
        // 打印找到的所有输入元素，帮助调试
        console.log('[整合修复-高优先级] 找到的输入元素:', allInputs);
        console.log('[整合修复-高优先级] 输入元素数量:', allInputs.length);
        
        // 获取每个输入元素的详细信息
        Array.from(allInputs).forEach((input, index) => {
            const id = input.id || input.name || `input_${index}`;
            const type = input.type || 'text';
            const value = input.type === 'checkbox' ? input.checked : input.value;
            
            console.log(`[整合修复-高优先级] 输入元素 #${index}: id=${id}, type=${type}, value=${value}`);
        });
        
        // 直接获取关键表单元素，确保能准确获取到
        const audioLoopCountInput = form.querySelector('#audioLoopCount') || 
                                  form.querySelector('[name="audioLoopCount"]') || 
                                  form.querySelector('input[data-setting="audioLoopCount"]');
                                  
        const audioLoopIntervalInput = form.querySelector('#audioLoopInterval') || 
                                      form.querySelector('[name="audioLoopInterval"]') || 
                                      form.querySelector('input[data-setting="audioLoopInterval"]');
                                      
        const repeatCountInput = form.querySelector('#repeatCount') || 
                               form.querySelector('[name="repeatCount"]') || 
                               form.querySelector('input[data-setting="repeatCount"]');
                               
        const intervalSecondsInput = form.querySelector('#intervalSeconds') || 
                                   form.querySelector('[name="intervalSeconds"]') || 
                                   form.querySelector('input[data-setting="intervalSeconds"]');
                                   
        const autoStopOnResponseInput = form.querySelector('#autoStopOnResponse') || 
                                      form.querySelector('[name="autoStopOnResponse"]') || 
                                      form.querySelector('input[data-setting="autoStopOnResponse"]');
        
        // 直接记录每个关键元素的信息
        if (audioLoopCountInput) {
            console.log('[整合修复-高优先级] audioLoopCount元素:', 
                       'id=', audioLoopCountInput.id, 
                       'value=', audioLoopCountInput.value, 
                       'type=', audioLoopCountInput.type);
            formData.audioLoopCount = parseInt(audioLoopCountInput.value) || 3;
        } else {
            console.warn('[整合修复-高优先级] 未找到audioLoopCount元素');
            formData.audioLoopCount = 3;
        }
        
        if (audioLoopIntervalInput) {
            console.log('[整合修复-高优先级] audioLoopInterval元素:', 
                       'id=', audioLoopIntervalInput.id, 
                       'value=', audioLoopIntervalInput.value, 
                       'type=', audioLoopIntervalInput.type);
            formData.audioLoopInterval = parseInt(audioLoopIntervalInput.value) || 500;
        } else {
            console.warn('[整合修复-高优先级] 未找到audioLoopInterval元素');
            formData.audioLoopInterval = 500;
        }
        
        if (repeatCountInput) {
            console.log('[整合修复-高优先级] repeatCount元素:', 
                       'id=', repeatCountInput.id, 
                       'value=', repeatCountInput.value, 
                       'type=', repeatCountInput.type);
            formData.repeatCount = parseInt(repeatCountInput.value) || 2;
        } else {
            console.warn('[整合修复-高优先级] 未找到repeatCount元素');
            formData.repeatCount = 2;
        }
        
        if (intervalSecondsInput) {
            console.log('[整合修复-高优先级] intervalSeconds元素:', 
                       'id=', intervalSecondsInput.id, 
                       'value=', intervalSecondsInput.value, 
                       'type=', intervalSecondsInput.type);
            formData.intervalSeconds = parseInt(intervalSecondsInput.value) || 5;
        } else {
            console.warn('[整合修复-高优先级] 未找到intervalSeconds元素');
            formData.intervalSeconds = 5;
        }
        
        if (autoStopOnResponseInput) {
            console.log('[整合修复-高优先级] autoStopOnResponse元素:', 
                       'id=', autoStopOnResponseInput.id, 
                       'checked=', autoStopOnResponseInput.checked, 
                       'type=', autoStopOnResponseInput.type);
            formData.autoStopOnResponse = !!autoStopOnResponseInput.checked;
        } else {
            console.warn('[整合修复-高优先级] 未找到autoStopOnResponse元素');
            formData.autoStopOnResponse = true;
        }
        
        // 记录最终收集到的表单数据
        console.log('[整合修复-高优先级] 收集到的最终表单数据:', formData);
        
        // 保存到localStorage之前先删除可能存在的旧缓存
        localStorage.removeItem('_timerSettingsCache');
        
        // 使用多种方式保存设置
        try {
            // 方式1：直接设置localStorage
            const settingsJson = JSON.stringify(formData);
            localStorage.setItem('timerSettings', settingsJson);
            console.log('[整合修复-高优先级] 方式1：已保存到localStorage:', settingsJson);
            
            // 方式2：使用sessionStorage作为备份
            sessionStorage.setItem('timerSettings_backup', settingsJson);
            console.log('[整合修复-高优先级] 方式2：已保存到sessionStorage作为备份');
            
            // 方式3：使用全局变量
            window.timerSettings = {...formData};
            console.log('[整合修复-高优先级] 方式3：已更新全局变量window.timerSettings');
            
            // 方式4：创建一个隐藏字段存储当前设置
            let hiddenField = document.getElementById('_current_timer_settings');
            if (!hiddenField) {
                hiddenField = document.createElement('input');
                hiddenField.type = 'hidden';
                hiddenField.id = '_current_timer_settings';
                document.body.appendChild(hiddenField);
            }
            hiddenField.value = settingsJson;
            console.log('[整合修复-高优先级] 方式4：已创建隐藏字段存储设置');
            
            // 关闭模态框
            const modal = document.getElementById('timerSettingsModal') || 
                         document.querySelector('.settings-modal') || 
                         document.querySelector('.timer-settings-modal');
                         
            if (modal) {
                modal.style.display = 'none';
            }
            
            // 立即加载设置到表单
            setTimeout(() => {
                const currentSettings = getSafeTimerSettings(true);
                console.log('[整合修复-高优先级] 验证保存后的设置:', currentSettings);
            }, 100);
            
            // 显示保存成功通知
            showNotification('设置已成功保存', 'success');
            
            // 触发自定义事件
            const event = new CustomEvent('timerSettingsUpdated', {
                detail: formData
            });
            document.dispatchEvent(event);
            
            return true;
        } catch (error) {
            console.error('[整合修复-高优先级] 保存设置失败:', error);
            showNotification('保存设置失败: ' + error.message, 'error');
            return false;
        }
    }
    
    // 确保表单中包含必要的字段
    function ensureFormHasRequiredFields(form) {
        console.log('[整合修复] 检查表单必要字段');
        
        const fieldDefinitions = [
            {
                id: 'audioLoopCount',
                label: '音频循环次数',
                description: '每条提醒音频的播放次数',
                type: 'number',
                min: '1',
                max: '10',
                defaultValue: '3'
            },
            {
                id: 'audioLoopInterval',
                label: '音频循环间隔(毫秒)',
                description: '音频重复播放的间隔时间',
                type: 'number',
                min: '100',
                max: '5000',
                step: '100',
                defaultValue: '500'
            },
            {
                id: 'repeatCount',
                label: '提醒重复次数',
                description: '提醒消息重复显示的次数',
                type: 'number',
                min: '1',
                max: '10',
                defaultValue: '2'
            },
            {
                id: 'intervalSeconds',
                label: '提醒间隔时间(秒)',
                description: '两次提醒通知之间的间隔时间',
                type: 'number',
                min: '1',
                max: '60',
                defaultValue: '5'
            },
            {
                id: 'autoStopOnResponse',
                label: '用户响应时自动停止提醒',
                description: '当用户与界面交互时自动停止后续提醒',
                type: 'checkbox',
                defaultValue: 'checked'
            }
        ];
        
        // 获取当前设置
        const settings = getSafeTimerSettings();
        
        // 为每个字段定义检查并添加
        fieldDefinitions.forEach(field => {
            if (!form.querySelector(`#${field.id}`) && 
                !form.querySelector(`[name="${field.id}"]`)) {
                
                console.log(`[整合修复] 添加缺失的${field.id}字段`);
                
                // 创建字段组
                const fieldGroup = document.createElement('div');
                fieldGroup.className = 'form-group';
                fieldGroup.style.marginBottom = '15px';
                
                // 创建标签
                const label = document.createElement('label');
                label.htmlFor = field.id;
                label.textContent = field.label;
                
                // 根据字段类型创建不同的输入控件
                let input;
                if (field.type === 'checkbox') {
                    // 为复选框创建容器
                    const checkContainer = document.createElement('div');
                    checkContainer.className = 'checkbox-container';
                    checkContainer.style.display = 'flex';
                    checkContainer.style.alignItems = 'center';
                    checkContainer.style.marginTop = '5px';
                    
                    // 创建复选框
                    input = document.createElement('input');
                    input.type = 'checkbox';
                    input.id = field.id;
                    input.name = field.id;
                    input.checked = settings[field.id] !== false; // 默认为true，除非明确设置为false
                    
                    checkContainer.appendChild(input);
                    
                    // 添加复选框标签
                    const checkLabel = document.createElement('span');
                    checkLabel.style.marginLeft = '8px';
                    checkLabel.textContent = field.label;
                    checkContainer.appendChild(checkLabel);
                    
                    // 将容器添加到字段组
                    fieldGroup.appendChild(checkContainer);
                } else {
                    // 创建标准输入框
                    input = document.createElement('input');
                    input.type = field.type;
                    input.id = field.id;
                    input.name = field.id;
                    input.className = 'form-control';
                    
                    // 添加属性
                    Object.keys(field).forEach(key => {
                        if (['min', 'max', 'step'].includes(key)) {
                            input.setAttribute(key, field[key]);
                        }
                    });
                    
                    // 设置值（从当前设置中获取，或使用默认值）
                    input.value = (settings[field.id] !== undefined) ? settings[field.id] : field.defaultValue;
                    
                    // 添加输入框到字段组
                    fieldGroup.appendChild(label);
                    fieldGroup.appendChild(input);
                }
                
                // 添加描述
                const description = document.createElement('div');
                description.className = 'field-description';
                description.style.fontSize = '12px';
                description.style.color = '#666';
                description.style.marginTop = '4px';
                description.textContent = field.description;
                
                // 添加描述到字段组
                fieldGroup.appendChild(description);
                
                // 查找合适的位置插入
                const submitBtn = form.querySelector('button[type="submit"]') || 
                                 form.querySelector('.btn-primary') ||
                                 form.querySelector('.save-btn');
                
                if (submitBtn && submitBtn.parentNode) {
                    form.insertBefore(fieldGroup, submitBtn.parentNode);
                } else {
                    form.appendChild(fieldGroup);
                }
            }
        });

        // 确保保存按钮存在并有正确的处理函数
        let saveBtn = form.querySelector('button[type="submit"]') || 
                     form.querySelector('.btn-primary') ||
                     form.querySelector('.save-btn') ||
                     document.getElementById('saveTimerSettings');
                     
        if (!saveBtn) {
            console.log('[整合修复] 创建缺失的保存按钮');
            saveBtn = document.createElement('button');
            saveBtn.type = 'button';
            saveBtn.id = 'saveTimerSettings';
            saveBtn.className = 'btn btn-primary save-btn';
            saveBtn.textContent = '保存设置';
            
            // 创建按钮容器
            const btnContainer = document.createElement('div');
            btnContainer.className = 'button-container';
            btnContainer.style.marginTop = '20px';
            btnContainer.style.textAlign = 'center';
            
            btnContainer.appendChild(saveBtn);
            form.appendChild(btnContainer);
        }
        
        // 确保保存按钮有事件处理函数
        if (!saveBtn._hasCustomClickHandler) {
            saveBtn._hasCustomClickHandler = true;
            saveBtn.addEventListener('click', function(e) {
                e.preventDefault();
                console.log('[整合修复] 保存按钮被点击');
                
                // 收集表单数据
                const formData = {};
                
                // 处理所有input字段
                fieldDefinitions.forEach(field => {
                    const input = form.querySelector(`#${field.id}`) || 
                                 form.querySelector(`[name="${field.id}"]`);
                    
                    if (input) {
                        if (input.type === 'checkbox') {
                            formData[field.id] = input.checked;
                        } else if (input.type === 'number') {
                            formData[field.id] = parseInt(input.value) || 
                                               (field.id === 'audioLoopCount' ? 3 : 
                                                field.id === 'audioLoopInterval' ? 500 : 
                                                field.id === 'repeatCount' ? 2 : 
                                                field.id === 'intervalSeconds' ? 5 : 0);
                        } else {
                            formData[field.id] = input.value;
                        }
                    }
                });
                
                // 保存到localStorage
                try {
                    localStorage.setItem('timerSettings', JSON.stringify(formData));
                    console.log('[整合修复] 设置已保存到localStorage:', formData);
                    
                    // 更新全局变量
                    window.timerSettings = formData;
                    
                    // 关闭模态框
                    const modal = document.getElementById('timerSettingsModal') || 
                                 document.querySelector('.settings-modal') || 
                                 document.querySelector('.timer-settings-modal');
                                 
                    if (modal) {
                        modal.style.display = 'none';
                    }
                    
                    // 显示保存成功通知
                    showNotification('设置已保存', 'success');
                } catch (error) {
                    console.error('[整合修复] 保存设置失败:', error);
                    showNotification('保存设置失败: ' + error.message, 'error');
                }
            });
            
            console.log('[整合修复] 已为保存按钮添加事件处理函数');
        }
    }
    
    // 简单的通知显示函数
    function showNotification(message, type = 'info') {
        console.log(`[整合修复] 显示通知: ${message} (${type})`);
        
        // 检查是否已有showNotification函数
        if (typeof window.showNotification === 'function' && window.showNotification !== showNotification) {
            window.showNotification(message, type);
            return;
        }
        
        // 创建通知元素
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // 设置样式
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
    
    // 加载设置到表单
    function loadSettingsToForm() {
        console.log('[整合修复] 正在加载设置到表单...');
        
        // 强制清除设置缓存
        localStorage.removeItem('_timerSettingsCache');
        
        // 直接从localStorage重新加载设置
        let settings;
        try {
            const savedSettings = localStorage.getItem('timerSettings');
            if (savedSettings) {
                settings = JSON.parse(savedSettings);
                console.log('[整合修复] 直接从localStorage加载设置:', settings);
            } else {
                settings = {
                    repeatCount: 2,
                    intervalSeconds: 5,
                    autoStopOnResponse: true,
                    audioLoopCount: 3,
                    audioLoopInterval: 500
                };
                console.log('[整合修复] 使用默认设置:', settings);
            }
        } catch (error) {
            console.error('[整合修复] 加载localStorage设置出错:', error);
            settings = {
                repeatCount: 2,
                intervalSeconds: 5,
                autoStopOnResponse: true,
                audioLoopCount: 3,
                audioLoopInterval: 500
            };
        }
        
        // 确保所有设置字段都存在
        if (settings.audioLoopCount === undefined) settings.audioLoopCount = 3;
        if (settings.audioLoopInterval === undefined) settings.audioLoopInterval = 500;
        if (settings.repeatCount === undefined) settings.repeatCount = 2;
        if (settings.intervalSeconds === undefined) settings.intervalSeconds = 5;
        if (settings.autoStopOnResponse === undefined) settings.autoStopOnResponse = true;
        
        // 更新全局timerSettings
        window.timerSettings = settings;
        console.log('[整合修复] 已更新全局timerSettings:', window.timerSettings);
        
        // 查找设置表单
        const form = document.getElementById('timerSettingsForm') ||
                    document.querySelector('form.timer-settings') ||
                    document.querySelector('.settings-form') ||
                    document.querySelector('.modal-content');
        
        if (!form) {
            console.warn('[整合修复] 无法找到设置表单，无法加载设置');
            return;
        }
        
        // 确保表单有必要的字段
        ensureFormHasRequiredFields(form);
        
        // 定义所有需要加载的设置项
        const settingsToLoad = [
            'audioLoopCount',
            'audioLoopInterval',
            'repeatCount',
            'intervalSeconds',
            'autoStopOnResponse'
        ];
        
        // 遍历所有设置，更新表单
        settingsToLoad.forEach(key => {
            // 查找对应的输入元素
            const input = form.querySelector(`#${key}`) || 
                          form.querySelector(`[name="${key}"]`) ||
                          form.querySelector(`[data-setting="${key}"]`);
            
            if (input) {
                // 根据输入类型设置值
                if (input.type === 'checkbox') {
                    input.checked = settings[key] !== false;
                    console.log(`[整合修复] 设置表单复选框 ${key} = ${input.checked}`);
                } else {
                    // 确保有有效值，防止undefined或NaN
                    const value = settings[key] !== undefined ? settings[key] : 
                                  key === 'audioLoopCount' ? 3 :
                                  key === 'audioLoopInterval' ? 500 :
                                  key === 'repeatCount' ? 2 :
                                  key === 'intervalSeconds' ? 5 : '';
                              
                    input.value = value;
                    console.log(`[整合修复] 设置表单字段 ${key} = ${value}`);
                }
                
                // 触发change事件，确保表单识别更改
                try {
                    const event = new Event('change', { bubbles: true });
                    input.dispatchEvent(event);
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    
                    // 额外处理获取焦点再失去焦点，确保某些框架能识别变化
                    if (input.type !== 'checkbox') {
                        input.focus();
                        input.blur();
                    }
                } catch (e) {
                    console.warn(`[整合修复] 为${key}触发事件失败:`, e);
                }
            } else {
                console.warn(`[整合修复] 未找到表单字段: ${key}`);
                
                // 如果还是找不到，可能需要添加该字段
                if (form) {
                    // 将在下次ensureFormHasRequiredFields调用时添加
                    console.log(`[整合修复] 将在下次检查时添加缺失字段: ${key}`);
                }
            }
        });
        
        // 添加表单说明，帮助用户理解设置项
        const formDescriptions = {
            'audioLoopCount': '每条提醒音频的播放次数',
            'audioLoopInterval': '音频重复播放的间隔时间(毫秒)',
            'repeatCount': '提醒消息的重复次数',
            'intervalSeconds': '提醒消息的间隔时间(秒)',
            'autoStopOnResponse': '用户与界面交互时是否停止后续提醒'
        };
        
        // 为每个字段添加说明
        Object.keys(formDescriptions).forEach(key => {
            const input = form.querySelector(`#${key}`) || 
                         form.querySelector(`[name="${key}"]`) ||
                         form.querySelector(`[data-setting="${key}"]`);
            
            if (input) {
                // 获取父容器
                const parent = input.parentElement;
                if (parent) {
                    // 检查是否已有说明
                    const existingDesc = parent.querySelector('.field-description');
                    if (!existingDesc) {
                        // 创建新的说明元素
                        const descElem = document.createElement('div');
                        descElem.className = 'field-description';
                        descElem.style.fontSize = '12px';
                        descElem.style.color = '#666';
                        descElem.style.marginTop = '2px';
                        descElem.textContent = formDescriptions[key];
                        parent.appendChild(descElem);
                    }
                }
            }
        });
        
        console.log('[整合修复] 设置已加载到表单并添加了说明');
    }
    
    // 在DOM加载完成后执行初始化
    document.addEventListener('DOMContentLoaded', function() {
        console.log('[整合修复] DOM加载完成，开始初始化计时器设置功能');
        
        // 立即初始化，不等待
        initializeTimerSettingsForm();
        
        // 额外添加一个延迟初始化，确保在其他脚本之后执行
        setTimeout(function() {
            console.log('[整合修复] 执行延迟初始化，确保表单完整性');
            
            // 重新加载设置
            const settings = getSafeTimerSettings(true);
            
            // 查找设置表单
            const form = document.getElementById('timerSettingsForm') ||
                       document.querySelector('form.timer-settings') ||
                       document.querySelector('.settings-form') ||
                       document.querySelector('.modal-content');
                       
            if (form) {
                // 确保表单字段完整
                ensureFormHasRequiredFields(form);
                
                // 检查表单字段是否存在
                checkFormFields(form);
            }
            
            // 验证当前设置是否完整
            verifyTimerSettings();
        }, 2000);
    });
    
    // 验证计时器设置是否完整
    function verifyTimerSettings() {
        console.log('[整合修复] 验证计时器设置的完整性');
        
        // 重新加载设置
        const settings = getSafeTimerSettings(true);
        
        // 检查必要字段
        const requiredFields = ['audioLoopCount', 'audioLoopInterval', 'repeatCount', 'intervalSeconds', 'autoStopOnResponse'];
        const missingFields = [];
        
        requiredFields.forEach(field => {
            if (settings[field] === undefined) {
                missingFields.push(field);
            }
        });
        
        if (missingFields.length > 0) {
            console.warn('[整合修复] 计时器设置中缺少以下字段:', missingFields.join(', '));
            
            // 创建完整的设置对象
            const completeSettings = {
                ...settings,
                audioLoopCount: settings.audioLoopCount !== undefined ? settings.audioLoopCount : 3,
                audioLoopInterval: settings.audioLoopInterval !== undefined ? settings.audioLoopInterval : 500,
                repeatCount: settings.repeatCount !== undefined ? settings.repeatCount : 2,
                intervalSeconds: settings.intervalSeconds !== undefined ? settings.intervalSeconds : 5,
                autoStopOnResponse: settings.autoStopOnResponse !== undefined ? settings.autoStopOnResponse : true
            };
            
            // 保存完整设置
            try {
                localStorage.setItem('timerSettings', JSON.stringify(completeSettings));
                console.log('[整合修复] 已保存完整的计时器设置:', completeSettings);
                
                // 更新全局变量
                window.timerSettings = completeSettings;
            } catch (error) {
                console.error('[整合修复] 保存完整设置失败:', error);
            }
        } else {
            console.log('[整合修复] 计时器设置已完整');
        }
    }
    
    // 检查表单字段是否正确创建
    function checkFormFields(form) {
        console.log('[整合修复] 检查表单字段是否正确创建');
        
        if (!form) {
            console.warn('[整合修复] 无法检查表单字段：未提供表单对象');
            return;
        }
        
        const requiredFields = ['audioLoopCount', 'audioLoopInterval', 'repeatCount', 'intervalSeconds', 'autoStopOnResponse'];
        const missingFields = [];
        
        requiredFields.forEach(field => {
            const input = form.querySelector(`#${field}`) || 
                        form.querySelector(`[name="${field}"]`) ||
                        form.querySelector(`[data-setting="${field}"]`);
                        
            if (!input) {
                missingFields.push(field);
            }
        });
        
        if (missingFields.length > 0) {
            console.warn('[整合修复] 表单中缺少以下字段:', missingFields.join(', '));
            console.log('[整合修复] 将重新创建这些字段');
            
            // 重新确保表单字段完整
            ensureFormHasRequiredFields(form);
            
            // 加载设置到表单
            loadSettingsToForm();
        } else {
            console.log('[整合修复] 表单字段已完整');
        }
    }
    
    // 停止所有正在进行的播放
    function stopAllPlayback() {
        console.log('[整合修复] 停止所有音频播放');
        
        // 重置音频状态
        audioState.isPlaying = false;
        audioState.currentAudio = null;
        audioState.loopInfo.currentLoop = 0;
        
        // 如果使用协调器，通知它停止
        if (window.AudioCoordinator && typeof window.AudioCoordinator.stopAllAudio === 'function') {
            try {
                window.AudioCoordinator.stopAllAudio();
            } catch (e) {
                console.error('[整合修复] 协调器停止音频失败:', e);
            }
        }
        
        // 如果使用原生AudioAutoplay，通知它停止
        if (window.AudioAutoplay && typeof window.AudioAutoplay.stop === 'function') {
            try {
                window.AudioAutoplay.stop();
            } catch (e) {
                console.error('[整合修复] AudioAutoplay停止失败:', e);
            }
        }
        
        // 使用原始Audio API停止（最后的保障）
        try {
            const allAudioElements = document.querySelectorAll('audio');
            allAudioElements.forEach(audio => {
                try {
                    audio.pause();
                    if (audio.parentNode) {
                        audio.parentNode.removeChild(audio);
                    }
                } catch (e) {
                    console.error('[整合修复] 停止单个音频元素失败:', e);
                }
            });
        } catch (e) {
            console.error('[整合修复] 停止所有音频元素失败:', e);
        }
    }
    
    console.log('[整合修复] 计时器音频整合修复完成');
})(); 

// 紧急修复函数 - 在文件末尾添加，确保在其他所有代码之后执行
(function emergencyFix() {
    console.log('[紧急修复] 计时器设置和音频播放紧急修复开始执行');
    
    // 确保DOM已加载
    function ensureDOMLoaded(callback) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback);
        } else {
            callback();
        }
    }
    
    ensureDOMLoaded(function() {
        console.log('[紧急修复] DOM已加载，开始执行紧急修复');
        
        // 添加调试功能
        function debugTimerForm() {
            console.log('[紧急修复-调试] =========== 开始诊断计时器表单问题 ===========');
            
            // 在页面上添加一个调试信息区域
            let debugInfo = document.getElementById('timer-debug-info');
            if (!debugInfo) {
                debugInfo = document.createElement('div');
                debugInfo.id = 'timer-debug-info';
                debugInfo.style.position = 'fixed';
                debugInfo.style.bottom = '10px'; // 改为底部显示
                debugInfo.style.right = '10px'; // 改为右侧显示
                debugInfo.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
                debugInfo.style.color = 'white';
                debugInfo.style.padding = '10px';
                debugInfo.style.borderRadius = '5px';
                debugInfo.style.zIndex = '9999';
                debugInfo.style.maxWidth = '400px'; // 限制最大宽度
                debugInfo.style.maxHeight = '300px'; // 限制最大高度
                debugInfo.style.overflow = 'auto';
                debugInfo.style.fontSize = '12px';
                debugInfo.style.fontFamily = 'monospace';
                document.body.appendChild(debugInfo);
            }
            
            // 尝试查找当前页面上的所有表单
            const allForms = document.querySelectorAll('form');
            const formInfo = Array.from(allForms).map(form => {
                return {
                    id: form.id || '无ID',
                    className: form.className,
                    fields: form.querySelectorAll('input').length
                };
            });
            
            // 尝试查找当前页面上的设置模态框
            const modal = document.getElementById('timerSettingsModal');
            const modalInfo = modal ? {
                id: modal.id,
                className: modal.className,
                style: modal.style.display,
                hasForm: !!modal.querySelector('form')
            } : '未找到';
            
            // 收集localStorage信息
            let storageInfo = '无法访问';
            try {
                const settings = localStorage.getItem('timerSettings');
                storageInfo = settings ? JSON.parse(settings) : '未设置';
            } catch (e) {
                storageInfo = `访问出错: ${e.message}`;
            }
            
            // 更新调试信息
            const info = `
                <h3>计时器设置调试信息</h3>
                <p><strong>表单数量:</strong> ${allForms.length}</p>
                <p><strong>表单信息:</strong> ${JSON.stringify(formInfo)}</p>
                <p><strong>模态框:</strong> ${JSON.stringify(modalInfo)}</p>
                <p><strong>localStorage:</strong> ${JSON.stringify(storageInfo)}</p>
                <p><strong>全局timerSettings:</strong> ${JSON.stringify(window.timerSettings)}</p>
                <hr>
                <button id="fix-timer-form-button" style="padding: 5px; background-color: #4CAF50; color: white; border: none; border-radius: 3px;">修复表单</button>
                <button id="hide-debug-info" style="padding: 5px; margin-left: 5px; background-color: #f44336; color: white; border: none; border-radius: 3px;">隐藏</button>
                <button id="show-debug-info" style="padding: 5px; margin-left: 5px; background-color: #2196F3; color: white; border: none; border-radius: 3px; display: none;">显示</button>
            `;
            
            debugInfo.innerHTML = info;
            
            // 添加修复按钮事件
            document.getElementById('fix-timer-form-button').addEventListener('click', function() {
                createNewSettingsForm();
            });
            
            // 添加隐藏按钮事件
            document.getElementById('hide-debug-info').addEventListener('click', function() {
                debugInfo.style.height = '30px';
                debugInfo.style.overflow = 'hidden';
                document.getElementById('hide-debug-info').style.display = 'none';
                document.getElementById('show-debug-info').style.display = 'inline-block';
            });
            
            // 添加显示按钮事件
            document.getElementById('show-debug-info').addEventListener('click', function() {
                debugInfo.style.height = 'auto';
                debugInfo.style.overflow = 'auto';
                document.getElementById('hide-debug-info').style.display = 'inline-block';
                document.getElementById('show-debug-info').style.display = 'none';
            });
            
            console.log('[紧急修复-调试] 已添加调试信息区域');
        }
        
        // 创建新的设置表单函数
        function createNewSettingsForm() {
            console.log('[紧急修复-调试] 尝试创建新的设置表单');
            
            // 首先检查是否已存在模态框
            let modal = document.getElementById('timerSettingsModal');
            
            // 如果存在但内部没有正确的表单，则清空它
            if (modal) {
                const existingForm = modal.querySelector('#timerSettingsForm');
                if (!existingForm) {
                    console.log('[紧急修复-调试] 模态框存在但没有正确的表单，清空内容');
                    modal.innerHTML = '';
                } else {
                    console.log('[紧急修复-调试] 模态框已包含正确的表单，无需创建');
                    return;
                }
            } else {
                // 创建模态框
                console.log('[紧急修复-调试] 创建新的模态框');
                modal = document.createElement('div');
                modal.id = 'timerSettingsModal';
                modal.className = 'modal';
                modal.style.display = 'none';
                modal.style.position = 'fixed';
                modal.style.zIndex = '1000';
                modal.style.left = '0';
                modal.style.top = '0';
                modal.style.width = '100%';
                modal.style.height = '100%';
                modal.style.overflow = 'auto';
                modal.style.backgroundColor = 'rgba(0,0,0,0.4)';
                document.body.appendChild(modal);
            }
            
            // 创建模态框内容
            const modalContent = document.createElement('div');
            modalContent.className = 'modal-content';
            modalContent.style.backgroundColor = '#fefefe';
            modalContent.style.margin = '15% auto';
            modalContent.style.padding = '20px';
            modalContent.style.border = '1px solid #888';
            modalContent.style.width = '60%';
            modalContent.style.maxWidth = '500px';
            modalContent.style.borderRadius = '5px';
            
            // 创建关闭按钮
            const closeBtn = document.createElement('span');
            closeBtn.className = 'close';
            closeBtn.innerHTML = '&times;';
            closeBtn.style.color = '#aaa';
            closeBtn.style.float = 'right';
            closeBtn.style.fontSize = '28px';
            closeBtn.style.fontWeight = 'bold';
            closeBtn.style.cursor = 'pointer';
            
            // 添加关闭事件
            closeBtn.addEventListener('click', function() {
                modal.style.display = 'none';
            });
            
            // 创建标题
            const title = document.createElement('h2');
            title.textContent = '计时器设置';
            
            // 创建表单
            const form = document.createElement('form');
            form.id = 'timerSettingsForm';
            
            // 获取当前设置
            const settings = window.timerSettings || {};
            
            // 创建表单字段
            const fields = [
                {
                    id: 'audioLoopCount',
                    label: '音频循环次数',
                    type: 'number',
                    value: settings.audioLoopCount || 3,
                    min: 1,
                    max: 10
                },
                {
                    id: 'audioLoopInterval',
                    label: '音频循环间隔(毫秒)',
                    type: 'number',
                    value: settings.audioLoopInterval || 500,
                    min: 100,
                    max: 5000
                },
                {
                    id: 'repeatCount',
                    label: '提醒重复次数',
                    type: 'number',
                    value: settings.repeatCount || 2,
                    min: 1,
                    max: 10
                },
                {
                    id: 'intervalSeconds',
                    label: '提醒间隔时间(秒)',
                    type: 'number',
                    value: settings.intervalSeconds || 5,
                    min: 1,
                    max: 60
                },
                {
                    id: 'autoStopOnResponse',
                    label: '收到响应时自动停止',
                    type: 'checkbox',
                    checked: settings.autoStopOnResponse !== false
                }
            ];
            
            // 添加字段到表单
            fields.forEach(field => {
                const fieldDiv = document.createElement('div');
                fieldDiv.style.marginBottom = '15px';
                
                const label = document.createElement('label');
                label.htmlFor = field.id;
                label.textContent = field.label;
                label.style.display = 'block';
                label.style.marginBottom = '5px';
                
                let input;
                
                if (field.type === 'checkbox') {
                    input = document.createElement('input');
                    input.type = 'checkbox';
                    input.id = field.id;
                    input.name = field.id;
                    input.checked = field.checked;
                    
                    // 创建内联标签样式
                    const checkboxLabel = document.createElement('span');
                    checkboxLabel.textContent = field.label;
                    checkboxLabel.style.marginLeft = '10px';
                    checkboxLabel.style.verticalAlign = 'middle';
                    
                    fieldDiv.appendChild(input);
                    fieldDiv.appendChild(checkboxLabel);
                } else {
                    input = document.createElement('input');
                    input.type = field.type;
                    input.id = field.id;
                    input.name = field.id;
                    input.value = field.value;
                    input.min = field.min;
                    input.max = field.max;
                    input.style.width = '100%';
                    input.style.padding = '8px';
                    input.style.borderRadius = '4px';
                    input.style.border = '1px solid #ddd';
                    
                    fieldDiv.appendChild(label);
                    fieldDiv.appendChild(input);
                }
                
                form.appendChild(fieldDiv);
            });
            
            // 创建保存按钮
            const saveBtn = document.createElement('button');
            saveBtn.id = 'saveTimerSettings';
            saveBtn.textContent = '保存设置';
            saveBtn.style.backgroundColor = '#4CAF50';
            saveBtn.style.color = 'white';
            saveBtn.style.padding = '10px 15px';
            saveBtn.style.border = 'none';
            saveBtn.style.borderRadius = '4px';
            saveBtn.style.cursor = 'pointer';
            
            // 添加保存事件
            saveBtn.addEventListener('click', function(e) {
                e.preventDefault();
                console.log('[紧急修复-调试] 保存按钮被点击');
                
                // 收集表单数据
                const formData = {};
                
                fields.forEach(field => {
                    const input = document.getElementById(field.id);
                    if (input) {
                        if (field.type === 'checkbox') {
                            formData[field.id] = input.checked;
                        } else if (field.type === 'number') {
                            formData[field.id] = parseFloat(input.value);
                        } else {
                            formData[field.id] = input.value;
                        }
                    }
                });
                
                console.log('[紧急修复-调试] 收集到的表单数据:', formData);
                
                // 保存到localStorage
                try {
                    localStorage.setItem('timerSettings', JSON.stringify(formData));
                    console.log('[紧急修复-调试] 已保存到localStorage');
                    
                    // 更新全局变量
                    window.timerSettings = { ...formData };
                    console.log('[紧急修复-调试] 已更新全局timerSettings');
                    
                    // 显示通知
                    showNotification('设置已保存', 'success');
                    
                    // 关闭模态框
                    modal.style.display = 'none';
                    
                    // 触发自定义事件
                    const event = new CustomEvent('timerSettingsUpdated', { detail: formData });
                    document.dispatchEvent(event);
                    console.log('[紧急修复-调试] 已触发timerSettingsUpdated事件');
                } catch (e) {
                    console.error('[紧急修复-调试] 保存设置时出错:', e);
                    showNotification('保存设置出错: ' + e.message, 'error');
                }
            });
            
            // 将元素添加到模态框
            form.appendChild(saveBtn);
            modalContent.appendChild(closeBtn);
            modalContent.appendChild(title);
            modalContent.appendChild(form);
            modal.appendChild(modalContent);
            
            console.log('[紧急修复-调试] 新的设置表单已创建');
            
            // 显示模态框
            modal.style.display = 'block';
        }
        
        // 原有的增强按钮函数修改
        function enhanceSettingsButton() {
            try {
                const settingsButton = document.querySelector('.timer-settings-button') || 
                                     document.getElementById('toggleSettings') ||
                                     document.querySelector('[data-action="toggle-timer-settings"]');
                                     
                if (settingsButton) {
                    console.log('[紧急修复] 发现计时器设置按钮，正在增强其功能');
                    
                    // 清除原有事件以避免重复
                    const newButton = settingsButton.cloneNode(true);
                    settingsButton.parentNode.replaceChild(newButton, settingsButton);
                    
                    // 添加新的点击事件
                    newButton.addEventListener('click', function(e) {
                        e.preventDefault();
                        console.log('[紧急修复] 计时器设置按钮被点击');
                        
                        try {
                            // 检查是否有正确的表单
                            const form = document.getElementById('timerSettingsForm');
                            
                            if (!form) {
                                console.log('[紧急修复] 未找到表单，创建新表单');
                                createNewSettingsForm();
                            } else {
                                // 检查模态框是否存在
                                const modal = document.getElementById('timerSettingsModal');
                                if (modal) {
                                    console.log('[紧急修复] 找到表单和模态框，直接显示模态框');
                                    // 显示模态框
                                    modal.style.display = 'block';
                                    // 然后尝试更新表单值
                                    setTimeout(function() {
                                        try {
                                            syncTimerSettings();
                                        } catch (syncError) {
                                            console.error('[紧急修复] 更新表单值时出错:', syncError);
                                        }
                                    }, 100);
                                } else {
                                    console.log('[紧急修复] 找到表单但未找到模态框，创建新表单');
                                    createNewSettingsForm();
                                }
                            }
                        } catch (clickError) {
                            console.error('[紧急修复] 处理设置按钮点击时出错:', clickError);
                            // 出错时也尝试创建新表单
                            try {
                                createNewSettingsForm();
                            } catch (formError) {
                                console.error('[紧急修复] 创建新表单时出错:', formError);
                                alert('无法打开计时器设置，请刷新页面后重试');
                            }
                        }
                    });
                    
                    console.log('[紧急修复] 计时器设置按钮功能增强完成');
                } else {
                    console.warn('[紧急修复] 未找到计时器设置按钮');
                }
            } catch (e) {
                console.error('[紧急修复] 增强设置按钮时出错:', e);
            }
        }

        // 执行诊断
        debugTimerForm();
        
        // 执行紧急修复
        enhanceSettingsButton();
        enhanceSaveButton();
        ensureFormFieldsExist();
        
        // 强制同步一次设置
        syncTimerSettings();
        
        console.log('[紧急修复] 紧急修复函数已执行完毕');
    });
    
    // 再次执行，确保不被其他脚本覆盖
    setTimeout(function() {
        ensureDOMLoaded(function() {
            console.log('[紧急修复] 再次确认紧急修复生效');
            enhanceSettingsButton();
            enhanceSaveButton();
        });
    }, 100);
    
    // 每30秒检查一次，确保长时间运行时修复依然有效
    setInterval(function() {
        ensureDOMLoaded(function() {
            // 检查保存按钮是否失效
            const saveButton = document.querySelector('#saveTimerSettings');
            if (saveButton) {
                // 模拟点击事件确认事件监听器是否工作
                const testEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                
                // 拦截原生调度并测试
                const originalDispatchEvent = EventTarget.prototype.dispatchEvent;
                
                let handlerCalled = false;
                EventTarget.prototype.dispatchEvent = function(event) {
                    if (event.type === 'click' && this === saveButton) {
                        handlerCalled = true;
                        return false; // 阻止真实的点击事件
                    }
                    return originalDispatchEvent.apply(this, arguments);
                };
                
                saveButton.dispatchEvent(testEvent);
                
                // 恢复原始方法
                EventTarget.prototype.dispatchEvent = originalDispatchEvent;
                
                if (!handlerCalled) {
                    console.warn('[紧急修复] 保存按钮点击事件已失效，重新修复');
                    enhanceSaveButton();
                }
            }
        });
    }, 30000);
    
    console.log('[紧急修复] 紧急修复脚本加载完成');
})(); 

// 添加简化版的syncTimerSettings函数
function syncTimerSettings() {
    console.log('[紧急修复] 同步计时器设置 - 开始');
    
    try {
        // 从localStorage读取设置
        const savedSettings = localStorage.getItem('timerSettings');
        let settings = {};
        
        if (savedSettings) {
            try {
                settings = JSON.parse(savedSettings);
                console.log('[紧急修复] 从localStorage读取到设置:', settings);
            } catch (e) {
                console.error('[紧急修复] 解析localStorage设置出错:', e);
            }
        }
        
        // 确保全局变量存在
        if (typeof window.timerSettings === 'undefined') {
            window.timerSettings = {};
        }
        
        // 默认设置
        const defaultSettings = {
            audioLoopCount: 3,
            audioLoopInterval: 500,
            repeatCount: 2,
            intervalSeconds: 5,
            autoStopOnResponse: true
        };
        
        // 更新全局变量
        window.timerSettings = { ...defaultSettings, ...settings };
        console.log('[紧急修复] 已更新全局timerSettings:', window.timerSettings);
        
        // 查找表单
        const form = document.getElementById('timerSettingsForm');
        if (form) {
            console.log('[紧急修复] 找到表单，更新表单字段');
            console.log('[紧急修复] 表单ID:', form.id);
            console.log('[紧急修复] 表单内输入元素数量:', form.querySelectorAll('input').length);
            
            // 尝试多种选择器查找方式
            const selectors = ['#', '[name="', '[id="'];
            
            // 设置表单字段值并记录详细信息
            for (const [key, value] of Object.entries(window.timerSettings)) {
                console.log(`[紧急修复] 尝试更新字段 ${key} = ${value}`);
                
                // 尝试多种选择器
                let input = null;
                for (const selector of selectors) {
                    if (selector === '#') {
                        input = form.querySelector(`${selector}${key}`);
                    } else {
                        input = form.querySelector(`${selector}${key}"]`);
                    }
                    
                    if (input) {
                        console.log(`[紧急修复] 使用选择器 ${selector} 找到字段 ${key}`);
                        break;
                    }
                }
                
                // 如果还是找不到，尝试使用更宽松的选择器
                if (!input) {
                    input = form.querySelector(`input[id*="${key}"]`) || 
                           form.querySelector(`input[name*="${key}"]`);
                    
                    if (input) {
                        console.log(`[紧急修复] 使用模糊匹配找到字段 ${key}, 实际ID=${input.id}, 实际name=${input.name}`);
                    }
                }
                
                if (input) {
                    console.log(`[紧急修复] 更新字段 ${key}, 类型=${input.type}, 旧值=${input.type === 'checkbox' ? input.checked : input.value}`);
                    
                    if (input.type === 'checkbox') {
                        input.checked = Boolean(value);
                    } else {
                        input.value = value;
                    }
                    
                    // 触发change事件确保UI更新
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    
                    console.log(`[紧急修复] 字段 ${key} 更新完成，新值=${input.type === 'checkbox' ? input.checked : input.value}`);
                } else {
                    console.warn(`[紧急修复] 未找到字段 ${key}，尝试创建`);
                    
                    // 尝试查找可能的容器
                    const fieldContainer = form.querySelector('.form-group') || form;
                    
                    // 创建新字段
                    const newField = document.createElement('div');
                    newField.className = 'form-group';
                    newField.style.marginBottom = '15px';
                    
                    let newInput;
                    if (key === 'autoStopOnResponse') {
                        // 创建复选框
                        const checkboxContainer = document.createElement('div');
                        checkboxContainer.className = 'checkbox';
                        
                        newInput = document.createElement('input');
                        newInput.type = 'checkbox';
                        newInput.id = key;
                        newInput.name = key;
                        newInput.checked = Boolean(value);
                        
                        const label = document.createElement('label');
                        label.htmlFor = key;
                        label.textContent = '收到响应时自动停止';
                        
                        checkboxContainer.appendChild(newInput);
                        checkboxContainer.appendChild(label);
                        newField.appendChild(checkboxContainer);
                    } else {
                        // 创建标签
                        const label = document.createElement('label');
                        label.htmlFor = key;
                        
                        switch (key) {
                            case 'audioLoopCount':
                                label.textContent = '音频循环次数';
                                break;
                            case 'audioLoopInterval':
                                label.textContent = '音频循环间隔(毫秒)';
                                break;
                            case 'repeatCount':
                                label.textContent = '提醒重复次数';
                                break;
                            case 'intervalSeconds':
                                label.textContent = '提醒间隔时间(秒)';
                                break;
                            default:
                                label.textContent = key;
                        }
                        
                        // 创建输入框
                        newInput = document.createElement('input');
                        newInput.type = 'number';
                        newInput.id = key;
                        newInput.name = key;
                        newInput.className = 'form-control';
                        newInput.value = value;
                        
                        newField.appendChild(label);
                        newField.appendChild(newInput);
                    }
                    
                    // 将新字段添加到表单中
                    fieldContainer.appendChild(newField);
                    console.log(`[紧急修复] 为字段 ${key} 创建了新的输入元素`);
                }
            }
            
            console.log('[紧急修复] 表单字段更新完成');
            
            // 进行二次检查
            setTimeout(() => {
                console.log('[紧急修复] 开始二次检查表单值');
                for (const [key, value] of Object.entries(window.timerSettings)) {
                    const input = form.querySelector(`#${key}`) || 
                                form.querySelector(`[name="${key}"]`) || 
                                form.querySelector(`input[id*="${key}"]`) || 
                                form.querySelector(`input[name*="${key}"]`);
                    
                    if (input) {
                        const actualValue = input.type === 'checkbox' ? input.checked : input.value;
                        console.log(`[紧急修复] 字段 ${key} 的当前值=${actualValue}, 期望值=${value}`);
                        
                        if (input.type === 'checkbox' && Boolean(actualValue) !== Boolean(value)) {
                            console.warn(`[紧急修复] 字段 ${key} 值不匹配，再次更新`);
                            input.checked = Boolean(value);
                            input.dispatchEvent(new Event('change', { bubbles: true }));
                        } else if (input.type !== 'checkbox' && String(actualValue) !== String(value)) {
                            console.warn(`[紧急修复] 字段 ${key} 值不匹配，再次更新`);
                            input.value = value;
                            input.dispatchEvent(new Event('change', { bubbles: true }));
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    }
                }
                console.log('[紧急修复] 二次检查完成');
            }, 300);
        } else {
            console.log('[紧急修复] 未找到表单，无法更新表单字段');
        }
        
        return window.timerSettings;
    } catch (e) {
        console.error('[紧急修复] 同步计时器设置时出错:', e);
        return window.timerSettings || {};
    }
}

// 修改createNewSettingsForm函数中保存按钮的处理逻辑
function createNewSettingsForm() {
    console.log('[紧急修复-调试] 尝试创建新的设置表单');
    
    // 首先检查是否已存在模态框
    let modal = document.getElementById('timerSettingsModal');
    
    // 如果存在但内部没有正确的表单，则清空它
    if (modal) {
        const existingForm = modal.querySelector('#timerSettingsForm');
        if (!existingForm) {
            console.log('[紧急修复-调试] 模态框存在但没有正确的表单，清空内容');
            modal.innerHTML = '';
        } else {
            console.log('[紧急修复-调试] 模态框已包含正确的表单，无需创建');
            return;
        }
    } else {
        // 创建模态框
        console.log('[紧急修复-调试] 创建新的模态框');
        modal = document.createElement('div');
        modal.id = 'timerSettingsModal';
        modal.className = 'modal';
        modal.style.display = 'none';
        modal.style.position = 'fixed';
        modal.style.zIndex = '1000';
        modal.style.left = '0';
        modal.style.top = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.overflow = 'auto';
        modal.style.backgroundColor = 'rgba(0,0,0,0.4)';
        document.body.appendChild(modal);
    }
    
    // 创建模态框内容
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.backgroundColor = '#fefefe';
    modalContent.style.margin = '15% auto';
    modalContent.style.padding = '20px';
    modalContent.style.border = '1px solid #888';
    modalContent.style.width = '60%';
    modalContent.style.maxWidth = '500px';
    modalContent.style.borderRadius = '5px';
    
    // 创建关闭按钮
    const closeBtn = document.createElement('span');
    closeBtn.className = 'close';
    closeBtn.innerHTML = '&times;';
    closeBtn.style.color = '#aaa';
    closeBtn.style.float = 'right';
    closeBtn.style.fontSize = '28px';
    closeBtn.style.fontWeight = 'bold';
    closeBtn.style.cursor = 'pointer';
    
    // 添加关闭事件
    closeBtn.addEventListener('click', function() {
        modal.style.display = 'none';
    });
    
    // 创建标题
    const title = document.createElement('h2');
    title.textContent = '计时器设置';
    
    // 创建表单
    const form = document.createElement('form');
    form.id = 'timerSettingsForm';
    
    // 获取当前设置
    const settings = window.timerSettings || {};
    
    // 创建表单字段
    const fields = [
        {
            id: 'audioLoopCount',
            label: '音频循环次数',
            type: 'number',
            value: settings.audioLoopCount || 3,
            min: 1,
            max: 10
        },
        {
            id: 'audioLoopInterval',
            label: '音频循环间隔(毫秒)',
            type: 'number',
            value: settings.audioLoopInterval || 500,
            min: 100,
            max: 5000
        },
        {
            id: 'repeatCount',
            label: '提醒重复次数',
            type: 'number',
            value: settings.repeatCount || 2,
            min: 1,
            max: 10
        },
        {
            id: 'intervalSeconds',
            label: '提醒间隔时间(秒)',
            type: 'number',
            value: settings.intervalSeconds || 5,
            min: 1,
            max: 60
        },
        {
            id: 'autoStopOnResponse',
            label: '收到响应时自动停止',
            type: 'checkbox',
            checked: settings.autoStopOnResponse !== false
        }
    ];
    
    // 添加字段到表单
    fields.forEach(field => {
        const fieldDiv = document.createElement('div');
        fieldDiv.style.marginBottom = '15px';
        fieldDiv.className = 'form-group';
        
        const label = document.createElement('label');
        label.htmlFor = field.id;
        label.textContent = field.label;
        label.style.display = 'block';
        label.style.marginBottom = '5px';
        
        let input;
        
        if (field.type === 'checkbox') {
            input = document.createElement('input');
            input.type = 'checkbox';
            input.id = field.id;
            input.name = field.id;
            input.checked = field.checked;
            
            // 创建内联标签样式
            const checkboxLabel = document.createElement('span');
            checkboxLabel.textContent = field.label;
            checkboxLabel.style.marginLeft = '10px';
            checkboxLabel.style.verticalAlign = 'middle';
            
            fieldDiv.appendChild(input);
            fieldDiv.appendChild(checkboxLabel);
        } else {
            input = document.createElement('input');
            input.type = field.type;
            input.id = field.id;
            input.name = field.id;
            input.value = field.value;
            input.min = field.min;
            input.max = field.max;
            input.style.width = '100%';
            input.style.padding = '8px';
            input.style.borderRadius = '4px';
            input.style.border = '1px solid #ddd';
            
            fieldDiv.appendChild(label);
            fieldDiv.appendChild(input);
        }
        
        // 记录初始值
        console.log(`[紧急修复-调试] 创建字段 ${field.id}=${field.type === 'checkbox' ? field.checked : field.value}`);
        
        form.appendChild(fieldDiv);
    });
    
    // 创建保存按钮
    const saveBtn = document.createElement('button');
    saveBtn.id = 'saveTimerSettings';
    saveBtn.textContent = '保存设置';
    saveBtn.style.backgroundColor = '#4CAF50';
    saveBtn.style.color = 'white';
    saveBtn.style.padding = '10px 15px';
    saveBtn.style.border = 'none';
    saveBtn.style.borderRadius = '4px';
    saveBtn.style.cursor = 'pointer';
    
    // 添加保存事件
    saveBtn.addEventListener('click', function(e) {
        e.preventDefault();
        console.log('[紧急修复-调试] 保存按钮被点击');
        
        try {
            // 收集表单数据
            const formData = {};
            
            // 记录表单中找到的所有输入元素
            const allInputs = form.querySelectorAll('input');
            console.log(`[紧急修复-调试] 表单中找到 ${allInputs.length} 个输入元素`);
            
            // 详细记录每个元素
            allInputs.forEach((input, index) => {
                console.log(`[紧急修复-调试] 输入#${index}: id=${input.id}, name=${input.name}, type=${input.type}, value=${input.type === 'checkbox' ? input.checked : input.value}`);
            });
            
            fields.forEach(field => {
                const input = form.querySelector(`#${field.id}`);
                if (input) {
                    if (field.type === 'checkbox') {
                        formData[field.id] = input.checked;
                        console.log(`[紧急修复-调试] 收集复选框 ${field.id}=${input.checked}`);
                    } else if (field.type === 'number') {
                        formData[field.id] = parseFloat(input.value);
                        console.log(`[紧急修复-调试] 收集数字字段 ${field.id}=${parseFloat(input.value)}`);
                    } else {
                        formData[field.id] = input.value;
                        console.log(`[紧急修复-调试] 收集文本字段 ${field.id}=${input.value}`);
                    }
                } else {
                    console.warn(`[紧急修复-调试] 未找到字段 ${field.id}，使用默认值`);
                    if (field.type === 'checkbox') {
                        formData[field.id] = field.checked;
                    } else {
                        formData[field.id] = field.value;
                    }
                }
            });
            
            console.log('[紧急修复-调试] 收集到的表单数据:', formData);
            
            // 保存到localStorage
            try {
                localStorage.setItem('timerSettings', JSON.stringify(formData));
                console.log('[紧急修复-调试] 已保存到localStorage');
                
                // 确认保存成功
                const savedData = localStorage.getItem('timerSettings');
                if (savedData) {
                    console.log('[紧急修复-调试] 验证保存的数据:', JSON.parse(savedData));
                }
                
                // 更新全局变量
                window.timerSettings = { ...formData };
                console.log('[紧急修复-调试] 已更新全局timerSettings');
                
                // 确认是否已更新
                console.log('[紧急修复-调试] 验证全局变量:', window.timerSettings);
                
                // 显示通知
                showNotification('设置已保存', 'success');
                
                // 关闭模态框
                modal.style.display = 'none';
                
                // 触发自定义事件
                const event = new CustomEvent('timerSettingsUpdated', { detail: formData });
                document.dispatchEvent(event);
                console.log('[紧急修复-调试] 已触发timerSettingsUpdated事件');
                
                // 暂停一会儿后再次同步，确保表单更新
                setTimeout(() => {
                    try {
                        syncTimerSettings();
                        console.log('[紧急修复-调试] 保存后已重新同步设置');
                    } catch (e) {
                        console.error('[紧急修复-调试] 保存后重新同步设置时出错:', e);
                    }
                }, 500);
            } catch (e) {
                console.error('[紧急修复-调试] 保存设置时出错:', e);
                showNotification('保存设置出错: ' + e.message, 'error');
            }
        } catch (e) {
            console.error('[紧急修复-调试] 处理保存按钮点击时出错:', e);
            showNotification('处理保存操作时出错: ' + e.message, 'error');
        }
    });
    
    // 将元素添加到模态框
    form.appendChild(saveBtn);
    modalContent.appendChild(closeBtn);
    modalContent.appendChild(title);
    modalContent.appendChild(form);
    modal.appendChild(modalContent);
    
    console.log('[紧急修复-调试] 新的设置表单已创建');
    
    // 显示模态框
    modal.style.display = 'block';
}

// 全局化一些函数，以便其他地方调用
window.emergencyFunctions = {
    createNewSettingsForm: createNewSettingsForm,
    syncTimerSettings: syncTimerSettings,
    debugTimerForm: debugTimerForm
};

// 添加一个悬浮的小按钮，以便需要时能够打开调试面板
function addDebugToggleButton() {
    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = '调试';
    toggleBtn.style.position = 'fixed';
    toggleBtn.style.bottom = '5px';
    toggleBtn.style.right = '5px';
    toggleBtn.style.padding = '3px 8px';
    toggleBtn.style.fontSize = '10px';
    toggleBtn.style.backgroundColor = '#2196F3';
    toggleBtn.style.color = 'white';
    toggleBtn.style.border = 'none';
    toggleBtn.style.borderRadius = '3px';
    toggleBtn.style.zIndex = '9998';
    toggleBtn.style.opacity = '0.7';
    
    toggleBtn.addEventListener('click', function() {
        const debugInfo = document.getElementById('timer-debug-info');
        if (debugInfo) {
            if (debugInfo.style.display === 'none') {
                debugInfo.style.display = 'block';
            } else {
                const showBtn = document.getElementById('show-debug-info');
                if (showBtn && showBtn.style.display !== 'none') {
                    showBtn.click();
                } else {
                    const hideBtn = document.getElementById('hide-debug-info');
                    if (hideBtn) hideBtn.click();
                }
            }
        } else {
            debugTimerForm();
        }
    });
    
    document.body.appendChild(toggleBtn);
}

addDebugToggleButton();

// 添加清除表单缓存功能
function clearTimerFormCache() {
    console.log('[紧急修复] 开始清理表单缓存');
    
    try {
        // 获取当前设置
        const currentSettings = window.timerSettings || {};
        console.log('[紧急修复] 当前全局设置:', currentSettings);
        
        // 备份到临时变量
        const backupSettings = { ...currentSettings };
        
        // 清空表单相关元素
        const modal = document.getElementById('timerSettingsModal');
        if (modal) {
            console.log('[紧急修复] 找到模态框，清空内容');
            modal.innerHTML = '';
        }
        
        // 移除表单
        const oldForm = document.getElementById('timerSettingsForm');
        if (oldForm) {
            console.log('[紧急修复] 找到旧表单，移除');
            if (oldForm.parentNode) {
                oldForm.parentNode.removeChild(oldForm);
            }
        }
        
        // 重新保存设置到localStorage
        try {
            localStorage.setItem('timerSettings', JSON.stringify(backupSettings));
            console.log('[紧急修复] 重新保存设置到localStorage');
        } catch (e) {
            console.error('[紧急修复] 保存设置到localStorage出错:', e);
        }
        
        // 重置全局变量
        window.timerSettings = backupSettings;
        
        // 创建新表单
        console.log('[紧急修复] 重新创建表单');
        createNewSettingsForm();
        
        showNotification('表单已重置', 'info');
        return true;
    } catch (e) {
        console.error('[紧急修复] 清理表单缓存出错:', e);
        showNotification('重置表单出错: ' + e.message, 'error');
        return false;
    }
}

// 修改调试界面生成函数，添加表单重置按钮
function debugTimerForm() {
    console.log('[紧急修复-调试] 正在生成调试界面...');
    
    // 创建调试信息面板
    let debugPanel = document.getElementById('timerDebugPanel');
    if (debugPanel) {
        console.log('[紧急修复-调试] 调试面板已存在，更新内容');
    } else {
        console.log('[紧急修复-调试] 创建新的调试面板');
        debugPanel = document.createElement('div');
        debugPanel.id = 'timerDebugPanel';
        debugPanel.style.position = 'fixed';
        debugPanel.style.bottom = '10px';
        debugPanel.style.right = '10px';
        debugPanel.style.width = '300px';
        debugPanel.style.maxHeight = '500px';
        debugPanel.style.overflowY = 'auto';
        debugPanel.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        debugPanel.style.color = '#fff';
        debugPanel.style.padding = '10px';
        debugPanel.style.borderRadius = '5px';
        debugPanel.style.fontFamily = 'monospace';
        debugPanel.style.fontSize = '12px';
        debugPanel.style.zIndex = '10000';
        debugPanel.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.5)';
        document.body.appendChild(debugPanel);
    }
    
    // 清空内容
    debugPanel.innerHTML = '';
    
    // 添加标题和关闭按钮
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '10px';
    
    const title = document.createElement('h3');
    title.textContent = '计时器调试面板';
    title.style.margin = '0';
    title.style.color = '#4CAF50';
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.backgroundColor = 'transparent';
    closeBtn.style.border = 'none';
    closeBtn.style.color = '#fff';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.fontSize = '20px';
    closeBtn.style.padding = '0 5px';
    closeBtn.addEventListener('click', function() {
        debugPanel.style.display = 'none';
    });
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    debugPanel.appendChild(header);
    
    // 添加表单信息
    const formInfo = document.createElement('div');
    formInfo.style.marginBottom = '15px';
    
    // 获取表单和模态框信息
    const form = document.getElementById('timerSettingsForm');
    const modal = document.getElementById('timerSettingsModal');
    
    // 表单状态
    let formStatus = 'Not found';
    let formFields = [];
    
    if (form) {
        formStatus = 'Found (ID: ' + form.id + ')';
        const inputs = form.querySelectorAll('input');
        if (inputs.length > 0) {
            formFields = Array.from(inputs).map(input => {
                return `${input.id || input.name}: ${input.type === 'checkbox' ? input.checked : input.value}`;
            });
        }
    }
    
    // 模态框状态
    let modalStatus = 'Not found';
    if (modal) {
        modalStatus = 'Found (ID: ' + modal.id + ', Display: ' + modal.style.display + ')';
    }
    
    formInfo.innerHTML = `
        <strong>表单状态:</strong> ${formStatus}<br>
        <strong>模态框状态:</strong> ${modalStatus}<br>
        <strong>表单字段:</strong><br>
        ${formFields.length > 0 ? formFields.map(f => `- ${f}`).join('<br>') : '无字段'}
    `;
    
    debugPanel.appendChild(formInfo);
    
    // 显示localStorage中的timerSettings
    const settingsInfo = document.createElement('div');
    settingsInfo.style.marginBottom = '15px';
    
    let storedSettings = {};
    try {
        const settingsStr = localStorage.getItem('timerSettings');
        if (settingsStr) {
            storedSettings = JSON.parse(settingsStr);
        }
    } catch (e) {
        console.error('[紧急修复-调试] 解析localStorage设置出错:', e);
    }
    
    settingsInfo.innerHTML = `
        <strong>localStorage设置:</strong><br>
        <pre>${JSON.stringify(storedSettings, null, 2)}</pre>
        <strong>全局timerSettings变量:</strong><br>
        <pre>${JSON.stringify(window.timerSettings || {}, null, 2)}</pre>
    `;
    
    debugPanel.appendChild(settingsInfo);
    
    // 添加操作按钮
    const actionButtons = document.createElement('div');
    actionButtons.style.display = 'flex';
    actionButtons.style.flexWrap = 'wrap';
    actionButtons.style.gap = '5px';
    
    // 添加尝试修复按钮
    const fixBtn = document.createElement('button');
    fixBtn.textContent = '尝试修复表单';
    fixBtn.style.backgroundColor = '#4CAF50';
    fixBtn.style.color = 'white';
    fixBtn.style.border = 'none';
    fixBtn.style.padding = '5px 10px';
    fixBtn.style.borderRadius = '3px';
    fixBtn.style.cursor = 'pointer';
    fixBtn.addEventListener('click', function() {
        try {
            createNewSettingsForm();
            showNotification('已尝试创建新表单', 'info');
        } catch (e) {
            console.error('[紧急修复-调试] 创建新表单出错:', e);
            showNotification('创建表单出错: ' + e.message, 'error');
        }
    });
    actionButtons.appendChild(fixBtn);
    
    // 添加同步按钮
    const syncBtn = document.createElement('button');
    syncBtn.textContent = '同步设置';
    syncBtn.style.backgroundColor = '#2196F3';
    syncBtn.style.color = 'white';
    syncBtn.style.border = 'none';
    syncBtn.style.padding = '5px 10px';
    syncBtn.style.borderRadius = '3px';
    syncBtn.style.cursor = 'pointer';
    syncBtn.addEventListener('click', function() {
        try {
            syncTimerSettings();
            showNotification('设置已同步', 'info');
        } catch (e) {
            console.error('[紧急修复-调试] 同步设置出错:', e);
            showNotification('同步设置出错: ' + e.message, 'error');
        }
    });
    actionButtons.appendChild(syncBtn);
    
    // 添加清理缓存按钮
    const clearCacheBtn = document.createElement('button');
    clearCacheBtn.textContent = '重置表单';
    clearCacheBtn.style.backgroundColor = '#f44336';
    clearCacheBtn.style.color = 'white';
    clearCacheBtn.style.border = 'none';
    clearCacheBtn.style.padding = '5px 10px';
    clearCacheBtn.style.borderRadius = '3px';
    clearCacheBtn.style.cursor = 'pointer';
    clearCacheBtn.addEventListener('click', function() {
        try {
            clearTimerFormCache();
            setTimeout(() => debugTimerForm(), 500); // 重载调试面板
        } catch (e) {
            console.error('[紧急修复-调试] 重置表单出错:', e);
            showNotification('重置表单出错: ' + e.message, 'error');
        }
    });
    actionButtons.appendChild(clearCacheBtn);
    
    // 添加刷新按钮
    const refreshBtn = document.createElement('button');
    refreshBtn.textContent = '刷新信息';
    refreshBtn.style.backgroundColor = '#795548';
    refreshBtn.style.color = 'white';
    refreshBtn.style.border = 'none';
    refreshBtn.style.padding = '5px 10px';
    refreshBtn.style.borderRadius = '3px';
    refreshBtn.style.cursor = 'pointer';
    refreshBtn.addEventListener('click', function() {
        debugTimerForm();
        showNotification('调试信息已刷新', 'info');
    });
    actionButtons.appendChild(refreshBtn);
    
    debugPanel.appendChild(actionButtons);
    
    // 将clearTimerFormCache函数导出到window，便于控制台调试
    window.emergencyFunctions.clearTimerFormCache = clearTimerFormCache;
    console.log('[紧急修复-调试] 已导出clearTimerFormCache到window.emergencyFunctions');
    
    return debugPanel;
}

// 修改enhanceSettingsButton函数，确保在处理点击事件前添加同步
function enhanceSettingsButton() {
    console.log('[紧急修复] 增强计时器设置按钮');
    
    try {
        // 查找设置按钮
        const settingsBtn = document.getElementById('toggleSettings');
        if (!settingsBtn) {
            console.error('[紧急修复] 未找到计时器设置按钮');
            return false;
        }
        
        // 清除现有的点击事件处理器
        const newBtn = settingsBtn.cloneNode(true);
        if (settingsBtn.parentNode) {
            settingsBtn.parentNode.replaceChild(newBtn, settingsBtn);
        }
        
        // 添加新的点击事件处理器
        newBtn.addEventListener('click', function(e) {
            console.log('[紧急修复] 计时器设置按钮被点击');
            e.preventDefault();
            
            try {
                // 先同步一次设置
                syncTimerSettings();
                
                // 查找表单和模态框
                const form = document.getElementById('timerSettingsForm');
                const modal = document.getElementById('timerSettingsModal');
                
                // 检查表单和模态框是否存在
                if (form && modal) {
                    console.log('[紧急修复] 找到表单和模态框，直接显示模态框');
                    modal.style.display = 'block';
                } else {
                    console.log('[紧急修复] 未找到表单或模态框，创建新的设置表单');
                    createNewSettingsForm();
                }
            } catch (e) {
                console.error('[紧急修复] 处理设置按钮点击时出错:', e);
                
                // 出错时尝试创建新表单
                try {
                    console.log('[紧急修复] 尝试重置并创建新表单');
                    clearTimerFormCache();
                } catch (err) {
                    console.error('[紧急修复] 重置表单失败:', err);
                    showNotification('设置加载失败，请刷新页面', 'error');
                }
            }
        });
        
        console.log('[紧急修复] 计时器设置按钮已增强');
        return true;
    } catch (e) {
        console.error('[紧急修复] 增强计时器设置按钮时出错:', e);
        return false;
    }
}

// 添加启动函数，确保所有修复都被正确应用
function startEmergencyFix() {
    console.log('[紧急修复] 开始应用紧急修复...');
    
    try {
        // 初始化紧急函数对象
        if (!window.emergencyFunctions) {
            window.emergencyFunctions = {};
        }
        
        // 确保基本变量存在
        ensureBasicVariables();
        
        // 增强设置按钮
        enhanceSettingsButton();
        
        // 添加调试开关按钮
        addDebugToggleButton();
        
        // 导出关键函数到全局
        window.emergencyFunctions.debugTimerForm = debugTimerForm;
        window.emergencyFunctions.syncTimerSettings = syncTimerSettings;
        window.emergencyFunctions.clearTimerFormCache = clearTimerFormCache;
        window.emergencyFunctions.createNewSettingsForm = createNewSettingsForm;
        window.emergencyFunctions.setupTimerReminders = customSetupTimerReminders;
        window.emergencyFunctions.playTimerAudio = playTimerAudio;
        window.emergencyFunctions.testAudioLoopPlayback = testAudioLoopPlayback;
        
        console.log('[紧急修复] 紧急修复已完全应用');
        showNotification('计时器增强功能已加载', 'info');
        return true;
    } catch (e) {
        console.error('[紧急修复] 应用紧急修复时出错:', e);
        return false;
    }
}

// 在DOM加载完成后启动修复
if (document.readyState === "loading") {
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(startEmergencyFix, 1000); // 延迟1秒，确保其他脚本已加载
    });
} else {
    // 如果已经加载完成，直接执行
    setTimeout(startEmergencyFix, 1000);
}

console.log('[紧急修复] 计时器和音频集成修复脚本已加载');
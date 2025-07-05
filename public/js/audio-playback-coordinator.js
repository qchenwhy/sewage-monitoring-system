/**
 * audio-playback-coordinator.js
 * 音频播放协调器 - 用于协调计时器音频和对话语音的兼容性
 * 版本: 1.0
 */

(function() {
    console.log('[音频协调器] 初始化音频播放协调系统');
    
    // 存储原始函数引用
    const originalFunctions = {
        speakMessage: null,
        handleAudioEvent: null,
        setupTimerReminders: null,
        playAudio: window.AudioAutoplay ? window.AudioAutoplay.play : null,
        playLoop: window.AudioAutoplay ? window.AudioAutoplay.playLoop : null
    };
    
    // 音频播放状态跟踪
    const audioState = {
        timerAudioPlaying: false,     // 计时器音频是否正在播放
        dialogAudioPlaying: false,    // 对话语音是否正在播放
        timerAudioQueue: [],          // 计时器音频队列
        dialogAudioQueue: [],         // 对话语音队列
        lastPlayedTimer: null,        // 最后播放的计时器信息
        lastPlayedDialog: null        // 最后播放的对话信息
    };
    
    // 在DOMContentLoaded事件中保存原始函数引用
    document.addEventListener('DOMContentLoaded', function() {
        console.log('[音频协调器] DOM已加载，保存原始函数引用');
        
        // 保存重要函数的原始引用
        if (typeof window.speakMessage === 'function') {
            originalFunctions.speakMessage = window.speakMessage;
        }
        
        if (typeof window.handleAudioEvent === 'function') {
            originalFunctions.handleAudioEvent = window.handleAudioEvent;
        }
        
        if (typeof window.setupTimerReminders === 'function') {
            originalFunctions.setupTimerReminders = window.setupTimerReminders;
        }
        
        // 延迟执行协调逻辑，确保所有其他脚本已加载
        setTimeout(setupAudioCoordination, 800);
    });
    
    // 设置音频协调逻辑
    function setupAudioCoordination() {
        console.log('[音频协调器] 开始设置音频协调逻辑');
        
        // 1. 增强speakMessage函数
        enhanceSpeakMessageFunction();
        
        // 2. 增强handleAudioEvent函数
        enhanceHandleAudioEventFunction();
        
        // 3. 增强setupTimerReminders函数
        enhanceSetupTimerRemindersFunction();
        
        // 4. 创建安全的播放函数
        createSafePlaybackFunctions();
        
        // 5. 导出全局协调接口
        exportCoordinationInterface();
        
        console.log('[音频协调器] 音频协调逻辑设置完成');
    }
    
    // 增强speakMessage函数
    function enhanceSpeakMessageFunction() {
        if (!originalFunctions.speakMessage) {
            console.warn('[音频协调器] 未找到原始speakMessage函数，跳过增强');
            return;
        }
        
        try {
            // 创建增强版函数
            const enhancedSpeakMessage = function(message, repeatCount = 1) {
                console.log('[音频协调器] 处理语音请求:', message);
                
                // 记录对话音频状态
                audioState.dialogAudioPlaying = true;
                audioState.lastPlayedDialog = {
                    message: message,
                    timestamp: Date.now()
                };
                
                // 如果计时器音频正在播放，根据策略决定是否暂停
                if (audioState.timerAudioPlaying) {
                    // 在此实现优先级策略，例如:
                    // 1. 对话语音优先 - 暂停计时器音频
                    // 2. 计时器音频优先 - 将对话语音加入队列
                    // 3. 混合播放 - 降低计时器音量
                    
                    // 这里我们选择对话语音优先，暂停计时器音频
                    console.log('[音频协调器] 检测到计时器音频正在播放，暂停它以便播放对话语音');
                    pauseTimerAudio();
                }
                
                // 调用原始函数
                try {
                    return originalFunctions.speakMessage(message, repeatCount);
                } catch (error) {
                    console.error('[音频协调器] 原始speakMessage函数执行出错:', error);
                    
                    // 降级到简单TTS
                    if ('speechSynthesis' in window) {
                        try {
                            const utterance = new SpeechSynthesisUtterance(message);
                            utterance.lang = 'zh-CN';
                            utterance.onend = function() {
                                audioState.dialogAudioPlaying = false;
                                processAudioQueue();
                            };
                            window.speechSynthesis.speak(utterance);
                            return true;
                        } catch (ttsError) {
                            console.error('[音频协调器] 浏览器TTS执行出错:', ttsError);
                        }
                    }
                    return false;
                } finally {
                    // 设置一个定时器，在一段时间后标记对话音频播放完成
                    // 这是为了防止回调未触发的情况
                    setTimeout(function() {
                        audioState.dialogAudioPlaying = false;
                        processAudioQueue();
                    }, 5000 + (repeatCount * 2000));
                }
            };
            
            // 安装增强版函数
            try {
                Object.defineProperty(window, 'speakMessage', {
                    configurable: true,
                    get: function() { return enhancedSpeakMessage; },
                    set: function(newFunc) {
                        console.warn('[音频协调器] 检测到尝试覆盖speakMessage函数，保存新函数引用');
                        originalFunctions.speakMessage = newFunc;
                    }
                });
                console.log('[音频协调器] speakMessage函数增强成功');
            } catch (error) {
                console.error('[音频协调器] 安装增强版speakMessage函数失败:', error);
                // 降级 - 直接覆盖
                window.speakMessage = enhancedSpeakMessage;
            }
        } catch (error) {
            console.error('[音频协调器] 增强speakMessage函数过程中出错:', error);
        }
    }
    
    // 增强handleAudioEvent函数
    function enhanceHandleAudioEventFunction() {
        if (!originalFunctions.handleAudioEvent) {
            console.warn('[音频协调器] 未找到原始handleAudioEvent函数，跳过增强');
            return;
        }
        
        try {
            // 创建增强版函数
            const enhancedHandleAudioEvent = function(data) {
                console.log('[音频协调器] 处理音频事件:', data);
                
                // 验证数据
                if (!data) {
                    console.error('[音频协调器] handleAudioEvent收到空数据');
                    return;
                }
                
                // 确保URL参数有效
                let audioUrl = null;
                if (data.url) {
                    audioUrl = data.url;
                } else if (data.audioUrl) {
                    audioUrl = data.audioUrl;
                    data.url = audioUrl; // 修复数据
                } else if (data.data && data.data.url) {
                    audioUrl = data.data.url;
                    data.url = audioUrl; // 修复数据
                }
                
                if (!audioUrl) {
                    console.error('[音频协调器] 无法从数据中提取有效的音频URL');
                    return;
                }
                
                // 记录对话音频状态
                audioState.dialogAudioPlaying = true;
                audioState.lastPlayedDialog = {
                    url: audioUrl,
                    timestamp: Date.now()
                };
                
                // 如果计时器音频正在播放，考虑暂停它
                if (audioState.timerAudioPlaying) {
                    console.log('[音频协调器] 检测到计时器音频正在播放，暂停它以便播放对话音频');
                    pauseTimerAudio();
                }
                
                // 调用原始函数
                try {
                    return originalFunctions.handleAudioEvent(data);
                } catch (error) {
                    console.error('[音频协调器] 原始handleAudioEvent函数执行出错:', error);
                    return false;
                } finally {
                    // 设置一个定时器，在一段时间后标记对话音频播放完成
                    setTimeout(function() {
                        audioState.dialogAudioPlaying = false;
                        processAudioQueue();
                    }, 10000); // 假设最长音频为10秒
                }
            };
            
            // 安装增强版函数
            try {
                Object.defineProperty(window, 'handleAudioEvent', {
                    configurable: true,
                    get: function() { return enhancedHandleAudioEvent; },
                    set: function(newFunc) {
                        console.warn('[音频协调器] 检测到尝试覆盖handleAudioEvent函数，保存新函数引用');
                        originalFunctions.handleAudioEvent = newFunc;
                    }
                });
                console.log('[音频协调器] handleAudioEvent函数增强成功');
            } catch (error) {
                console.error('[音频协调器] 安装增强版handleAudioEvent函数失败:', error);
                // 降级 - 直接覆盖
                window.handleAudioEvent = enhancedHandleAudioEvent;
            }
        } catch (error) {
            console.error('[音频协调器] 增强handleAudioEvent函数过程中出错:', error);
        }
    }
    
    // 增强setupTimerReminders函数
    function enhanceSetupTimerRemindersFunction() {
        if (!originalFunctions.setupTimerReminders) {
            console.warn('[音频协调器] 未找到原始setupTimerReminders函数，跳过增强');
            return;
        }
        
        try {
            // 创建增强版函数
            const enhancedSetupTimerReminders = function(timerId, title, message, audioUrl) {
                console.log('[音频协调器] 设置计时器提醒:', {
                    timerId: timerId,
                    title: title,
                    message: message
                });
                
                // 记录计时器音频状态
                audioState.timerAudioPlaying = true;
                audioState.lastPlayedTimer = {
                    timerId: timerId,
                    title: title,
                    message: message,
                    audioUrl: audioUrl,
                    timestamp: Date.now()
                };
                
                // 如果对话音频正在播放，考虑将计时器提醒加入队列
                if (audioState.dialogAudioPlaying) {
                    console.log('[音频协调器] 检测到对话音频正在播放，将计时器提醒加入队列');
                    audioState.timerAudioQueue.push({
                        timerId: timerId,
                        title: title,
                        message: message,
                        audioUrl: audioUrl,
                        timestamp: Date.now()
                    });
                    return { queued: true };
                }
                
                // 调用原始函数
                try {
                    const result = originalFunctions.setupTimerReminders(timerId, title, message, audioUrl);
                    
                    // 设置一个定时器，在一段时间后标记计时器音频播放完成
                    // 根据计时器配置计算可能的播放时间
                    const timerSettings = window.timerSettings || { repeatCount: 2, intervalSeconds: 5 };
                    const estimatedDuration = (timerSettings.repeatCount + 1) * (timerSettings.intervalSeconds * 1000 + 3000);
                    
                    setTimeout(function() {
                        audioState.timerAudioPlaying = false;
                        processAudioQueue();
                    }, estimatedDuration);
                    
                    return result;
                } catch (error) {
                    console.error('[音频协调器] 原始setupTimerReminders函数执行出错:', error);
                    audioState.timerAudioPlaying = false;
                    return false;
                }
            };
            
            // 安装增强版函数
            try {
                Object.defineProperty(window, 'setupTimerReminders', {
                    configurable: true,
                    get: function() { return enhancedSetupTimerReminders; },
                    set: function(newFunc) {
                        console.warn('[音频协调器] 检测到尝试覆盖setupTimerReminders函数，保存新函数引用');
                        originalFunctions.setupTimerReminders = newFunc;
                    }
                });
                console.log('[音频协调器] setupTimerReminders函数增强成功');
            } catch (error) {
                console.error('[音频协调器] 安装增强版setupTimerReminders函数失败:', error);
                // 降级 - 直接覆盖
                window.setupTimerReminders = enhancedSetupTimerReminders;
            }
        } catch (error) {
            console.error('[音频协调器] 增强setupTimerReminders函数过程中出错:', error);
        }
    }
    
    // 创建安全的播放函数
    function createSafePlaybackFunctions() {
        console.log('[音频协调器] 创建安全的音频播放函数');
        
        // 安全的计时器音频播放函数
        window.safePlayTimerAudio = function(audioUrl, message, options = {}) {
            console.log('[音频协调器] 安全播放计时器音频:', audioUrl);
            
            // 参数验证
            if (!audioUrl) {
                audioUrl = '/audio/Broadcastalert.mp3';
            }
            
            // 记录状态
            audioState.timerAudioPlaying = true;
            
            // 如果对话音频正在播放，考虑策略
            if (audioState.dialogAudioPlaying && !options.forcePlay) {
                console.log('[音频协调器] 对话音频正在播放，将计时器音频加入队列');
                audioState.timerAudioQueue.push({
                    audioUrl: audioUrl,
                    message: message,
                    options: options,
                    timestamp: Date.now()
                });
                return true;
            }
            
            // 播放音频
            try {
                // 创建新的Audio元素（避免干扰全局currentAudio）
                const timerAudio = new Audio(audioUrl);
                
                // 配置音频
                if (options.volume !== undefined) {
                    timerAudio.volume = options.volume;
                } else {
                    timerAudio.volume = 0.7; // 默认音量
                }
                
                if (options.loop) {
                    timerAudio.loop = true;
                }
                
                // 播放完成后的处理
                timerAudio.onended = function() {
                    console.log('[音频协调器] 计时器音频播放完成');
                    
                    // 如果需要语音播报消息
                    if (message && typeof window.speakMessage === 'function' && !options.skipMessage) {
                        setTimeout(function() {
                            window.speakMessage(message);
                        }, 500);
                    }
                    
                    // 标记播放完成
                    if (!options.loop) {
                        audioState.timerAudioPlaying = false;
                        processAudioQueue();
                    }
                };
                
                // 播放错误处理
                timerAudio.onerror = function(e) {
                    console.error('[音频协调器] 计时器音频播放失败:', e);
                    audioState.timerAudioPlaying = false;
                    processAudioQueue();
                };
                
                // 开始播放
                const playPromise = timerAudio.play();
                if (playPromise !== undefined) {
                    playPromise.catch(function(error) {
                        console.error('[音频协调器] 计时器音频播放Promise失败:', error);
                        audioState.timerAudioPlaying = false;
                        processAudioQueue();
                    });
                }
                
                return true;
            } catch (error) {
                console.error('[音频协调器] 计时器音频播放出错:', error);
                audioState.timerAudioPlaying = false;
                return false;
            }
        };
        
        // 安全的对话音频播放函数
        window.safePlayDialogAudio = function(audioUrl, options = {}) {
            console.log('[音频协调器] 安全播放对话音频:', audioUrl);
            
            // 参数验证
            if (!audioUrl) {
                console.error('[音频协调器] 无效的对话音频URL');
                return false;
            }
            
            // 记录状态
            audioState.dialogAudioPlaying = true;
            
            // 如果计时器音频正在播放，考虑策略
            if (audioState.timerAudioPlaying && !options.forcePlay) {
                // 对话语音优先，暂停计时器音频
                pauseTimerAudio();
            }
            
            // 播放音频
            try {
                // 使用原始AudioAutoplay.play函数播放
                if (window.AudioAutoplay && typeof window.AudioAutoplay.play === 'function') {
                    window.AudioAutoplay.play(audioUrl, function() {
                        console.log('[音频协调器] 对话音频播放完成');
                        audioState.dialogAudioPlaying = false;
                        processAudioQueue();
                    }, options.loop || false);
                    return true;
                } 
                // 降级到标准Audio API
                else {
                    const dialogAudio = new Audio(audioUrl);
                    
                    if (options.volume !== undefined) {
                        dialogAudio.volume = options.volume;
                    }
                    
                    if (options.loop) {
                        dialogAudio.loop = true;
                    }
                    
                    dialogAudio.onended = function() {
                        console.log('[音频协调器] 对话音频播放完成');
                        audioState.dialogAudioPlaying = false;
                        processAudioQueue();
                    };
                    
                    dialogAudio.onerror = function(e) {
                        console.error('[音频协调器] 对话音频播放失败:', e);
                        audioState.dialogAudioPlaying = false;
                        processAudioQueue();
                    };
                    
                    const playPromise = dialogAudio.play();
                    if (playPromise !== undefined) {
                        playPromise.catch(function(error) {
                            console.error('[音频协调器] 对话音频播放Promise失败:', error);
                            audioState.dialogAudioPlaying = false;
                            processAudioQueue();
                        });
                    }
                    
                    return true;
                }
            } catch (error) {
                console.error('[音频协调器] 对话音频播放出错:', error);
                audioState.dialogAudioPlaying = false;
                return false;
            }
        };
    }
    
    // 暂停计时器音频
    function pauseTimerAudio() {
        console.log('[音频协调器] 暂停计时器音频');
        
        // 这里的实现取决于计时器音频是如何播放的
        // 一种简单的方法是清除所有相关的定时器
        
        try {
            // 尝试找到并清除活动的计时器提醒
            if (window.activeTimerReminders && window.activeTimerReminders instanceof Map) {
                console.log('[音频协调器] 清除活动的计时器提醒');
                window.activeTimerReminders.forEach(function(reminder, timerId) {
                    if (reminder && reminder.intervalId) {
                        clearInterval(reminder.intervalId);
                        console.log(`[音频协调器] 已清除计时器 ${timerId} 的间隔定时器`);
                    }
                });
            }
            
            // 尝试停止当前的音频
            if (window.currentAudio) {
                try {
                    window.currentAudio.pause();
                    console.log('[音频协调器] 已暂停当前音频');
                } catch (e) {
                    console.warn('[音频协调器] 暂停当前音频失败:', e);
                }
            }
            
            // 尝试停止AudioContext
            if (window.AudioAutoplay && typeof window.AudioAutoplay.stop === 'function') {
                window.AudioAutoplay.stop();
                console.log('[音频协调器] 已调用AudioAutoplay.stop()');
            }
            
            // 标记状态
            audioState.timerAudioPlaying = false;
            
            return true;
        } catch (error) {
            console.error('[音频协调器] 暂停计时器音频出错:', error);
            return false;
        }
    }
    
    // 处理音频队列
    function processAudioQueue() {
        console.log('[音频协调器] 处理音频队列');
        
        // 如果没有正在播放的音频，检查队列中是否有等待播放的音频
        if (!audioState.timerAudioPlaying && !audioState.dialogAudioPlaying) {
            // 优先处理对话音频队列
            if (audioState.dialogAudioQueue.length > 0) {
                const dialogAudio = audioState.dialogAudioQueue.shift();
                console.log('[音频协调器] 从队列中播放对话音频:', dialogAudio);
                
                if (dialogAudio.url) {
                    window.safePlayDialogAudio(dialogAudio.url, dialogAudio.options || {});
                } else if (dialogAudio.message) {
                    if (typeof window.speakMessage === 'function') {
                        window.speakMessage(dialogAudio.message);
                    }
                }
            } 
            // 然后处理计时器音频队列
            else if (audioState.timerAudioQueue.length > 0) {
                const timerAudio = audioState.timerAudioQueue.shift();
                console.log('[音频协调器] 从队列中播放计时器音频:', timerAudio);
                
                if (timerAudio.timerId) {
                    // 如果是完整的计时器数据，使用setupTimerReminders
                    if (typeof window.setupTimerReminders === 'function') {
                        window.setupTimerReminders(
                            timerAudio.timerId,
                            timerAudio.title,
                            timerAudio.message,
                            timerAudio.audioUrl
                        );
                    }
                } else if (timerAudio.audioUrl) {
                    // 如果只有音频URL，使用safePlayTimerAudio
                    window.safePlayTimerAudio(
                        timerAudio.audioUrl,
                        timerAudio.message,
                        timerAudio.options || {}
                    );
                }
            }
        }
    }
    
    // 导出全局协调接口
    function exportCoordinationInterface() {
        console.log('[音频协调器] 导出全局协调接口');
        
        // 创建全局接口对象
        window.AudioCoordinator = {
            // 音频播放函数
            playTimerAudio: window.safePlayTimerAudio,
            playDialogAudio: window.safePlayDialogAudio,
            
            // 状态查询函数
            isTimerAudioPlaying: function() {
                return audioState.timerAudioPlaying;
            },
            isDialogAudioPlaying: function() {
                return audioState.dialogAudioPlaying;
            },
            
            // 队列管理函数
            clearTimerAudioQueue: function() {
                audioState.timerAudioQueue = [];
                return true;
            },
            clearDialogAudioQueue: function() {
                audioState.dialogAudioQueue = [];
                return true;
            },
            
            // 控制函数
            pauseTimerAudio: pauseTimerAudio,
            resumeTimerAudio: function() {
                // 实现恢复计时器音频的逻辑
                return false; // 目前不支持
            },
            
            // 测试函数
            testCoordination: function() {
                console.log('[音频协调器] 测试协调功能');
                
                // 播放计时器测试音频
                window.safePlayTimerAudio('/audio/Broadcastalert.mp3', '这是一个测试提醒');
                
                // 延迟1秒后播放对话测试音频
                setTimeout(function() {
                    if (typeof window.speakMessage === 'function') {
                        window.speakMessage('测试对话语音协调功能');
                    }
                }, 1000);
                
                return true;
            }
        };
        
        console.log('[音频协调器] 全局协调接口导出完成');
    }
    
    // 在页面关闭前执行清理
    window.addEventListener('beforeunload', function() {
        console.log('[音频协调器] 页面关闭，清理资源');
        
        // 停止所有可能的语音合成
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        
        // 清空队列
        audioState.timerAudioQueue = [];
        audioState.dialogAudioQueue = [];
    });
    
    console.log('[音频协调器] 初始化完成');
})(); 
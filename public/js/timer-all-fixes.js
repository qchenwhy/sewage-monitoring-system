/**
 * timer-all-fixes.js
 * 计时器相关综合修复脚本，主要解决以下问题：
 * 1. 音频循环播放问题
 * 2. timerSettings变量初始化问题
 * 3. 音频辅助功能增强
 */

// 立即执行函数，避免全局变量污染
(function() {
    console.log('计时器综合修复脚本已加载');
    
    // 确保timerSettings变量存在并初始化
    window.timerSettings = window.timerSettings || {
        notificationType: 'audio',
        audioUrl: '/audio/alert.mp3',
        notificationVolume: 0.8,
        vibration: true,
        loopAudio: true,
        audioPlayDuration: 10,
        repeatCount: 2,
        intervalSeconds: 5,
        autoStopOnResponse: true
    };
    
    // 从localStorage加载已保存的设置
    try {
        const savedSettings = localStorage.getItem('timerSettings');
        if (savedSettings) {
            const parsedSettings = JSON.parse(savedSettings);
            window.timerSettings = {...window.timerSettings, ...parsedSettings};
            console.log('已从localStorage加载设置:', window.timerSettings);
        }
    } catch (e) {
        console.error('加载设置时出错:', e);
    }
    
    // 等待DOM加载完成后执行初始化
    document.addEventListener('DOMContentLoaded', function() {
        console.log('DOM已加载，开始应用计时器修复');
        
        // 修复AudioAutoplay.playLoop函数，确保它存在且支持循环播放
        fixAudioLoopPlayback();
        
        // 增强音频播放功能
        enhanceAudioPlayback();
        
        // 修复计时器设置按钮问题
        fixTimerSettingsButton();
    });
    
    /**
     * 修复AudioAutoplay.playLoop函数
     */
    function fixAudioLoopPlayback() {
        if (!window.AudioAutoplay) {
            console.warn('AudioAutoplay模块不存在，无法修复');
            return;
        }
        
        // 确保playLoop函数支持循环播放
        if (!window.AudioAutoplay.playLoop) {
            console.log('创建AudioAutoplay.playLoop函数');
            
            window.AudioAutoplay.playLoop = function(audioUrl, onComplete) {
                console.log('使用修复版playLoop函数播放循环音频:', audioUrl);
                return window.AudioAutoplay.playAudio(audioUrl, onComplete, true);
            };
        } else {
            console.log('AudioAutoplay.playLoop函数已存在，无需创建');
        }
        
        // 增强stop方法，确保能正确停止循环播放
        const originalStop = window.AudioAutoplay.stop || function() {};
        window.AudioAutoplay.stop = function() {
            console.log('增强版stop方法，确保停止循环播放');
            
            // 调用原始stop方法（如果存在）
            originalStop.apply(window.AudioAutoplay, arguments);
            
            // 确保停止当前音频
            if (window.AudioAutoplay.stopCurrentAudio) {
                window.AudioAutoplay.stopCurrentAudio();
            }
            
            // 额外停止所有可能的音频元素
            document.querySelectorAll('audio').forEach(audio => {
                if (!audio.paused) {
                    try {
                        audio.pause();
                        audio.currentTime = 0;
                    } catch (e) {
                        console.warn('停止音频元素失败:', e);
                    }
                }
            });
        };
    }
    
    /**
     * 增强音频播放功能
     */
    function enhanceAudioPlayback() {
        if (!window.AudioPlaybackHelper) {
            window.AudioPlaybackHelper = {
                // 已播放完成的定时器
                _completedTimers: {},
                
                // 当前播放计数
                _playCount: 0,
                
                // 当前播放的计时器ID
                _currentTimerId: null,
                
                // 播放间隔定时器
                _intervalTimer: null,
                
                /**
                 * 播放计时器完成提示音
                 * @param {string} timerId - 计时器ID
                 * @param {string} title - 计时器标题
                 */
                playTimerCompleteSound: function(timerId, title) {
                    console.log(`播放计时器完成提示音 [${timerId}]: ${title}`);
                    
                    // 记录该定时器已播放提示音
                    this._completedTimers[timerId] = {
                        title: title,
                        timestamp: Date.now()
                    };
                    
                    this._currentTimerId = timerId;
                    this._playCount = 0;
                    
                    // 获取设置
                    const settings = window.timerSettings || {};
                    const repeatCount = settings.repeatCount || 2;
                    const intervalSeconds = settings.intervalSeconds || 5;
                    
                    // 清除可能存在的之前的间隔定时器
                    if (this._intervalTimer) {
                        clearInterval(this._intervalTimer);
                    }
                    
                    // 立即播放第一次
                    this._playAlertSound(title);
                    this._playCount++;
                    
                    // 设置间隔播放
                    if (repeatCount > 1) {
                        this._intervalTimer = setInterval(() => {
                            if (this._playCount >= repeatCount) {
                                clearInterval(this._intervalTimer);
                                this._intervalTimer = null;
                                return;
                            }
                            
                            this._playAlertSound(title);
                            this._playCount++;
                            
                            // 如果达到重复次数，清除定时器
                            if (this._playCount >= repeatCount) {
                                clearInterval(this._intervalTimer);
                                this._intervalTimer = null;
                            }
                        }, intervalSeconds * 1000);
                    }
                },
                
                /**
                 * 播放提示音和语音通知
                 */
                _playAlertSound: function(title) {
                    const settings = window.timerSettings || {};
                    const audioUrl = settings.audioUrl || '/audio/alert.mp3';
                    const volume = settings.notificationVolume || 0.8;
                    const useVoice = settings.useVoiceNotification !== false;
                    
                    // 检查不同的播放方法
                    if (window.AudioHelper && window.AudioHelper.startLoop) {
                        // 使用AudioHelper播放循环提示音
                        const soundOptions = {
                            volume: volume,
                            fadeIn: 300
                        };
                        
                        window.AudioHelper.startLoop(audioUrl, soundOptions);
                        
                        // 3秒后淡出停止
                        setTimeout(() => {
                            window.AudioHelper.stopLoop({ fadeOut: 500 });
                            
                            // 然后播放语音消息（如果启用）
                            if (useVoice && title) {
                                this._speakMessage(`计时器 ${title} 已完成`);
                            }
                        }, 3000);
                    } else if (window.AudioAutoplay) {
                        // 使用原有的AudioAutoplay
                        if (window.AudioAutoplay.playLoop) {
                            window.AudioAutoplay.playLoop(audioUrl, () => {
                                console.log('提示音播放完成');
                                
                                // 播放语音消息
                                if (useVoice && title) {
                                    this._speakMessage(`计时器 ${title} 已完成`);
                                }
                            });
                            
                            // 3秒后停止
                            setTimeout(() => {
                                if (window.AudioAutoplay.stop) {
                                    window.AudioAutoplay.stop();
                                }
                            }, 3000);
                        } else {
                            // 使用普通的播放方法
                            window.AudioAutoplay.play(audioUrl, () => {
                                if (useVoice && title) {
                                    this._speakMessage(`计时器 ${title} 已完成`);
                                }
                            });
                        }
                    } else {
                        // 后备方案：使用普通Audio元素
                        const audio = new Audio(audioUrl);
                        audio.volume = volume;
                        audio.loop = false;
                        audio.play().catch(e => console.error('音频播放失败:', e));
                        
                        // 播放完成后播放语音消息
                        audio.onended = () => {
                            if (useVoice && title) {
                                this._speakMessage(`计时器 ${title} 已完成`);
                            }
                        };
                    }
                },
                
                /**
                 * 使用语音合成播放消息
                 */
                _speakMessage: function(message) {
                    if (!message || !window.speechSynthesis) return;
                    
                    console.log('播放语音消息:', message);
                    const utterance = new SpeechSynthesisUtterance(message);
                    utterance.lang = window.timerSettings?.voiceLanguage || 'zh-CN';
                    utterance.volume = window.timerSettings?.notificationVolume || 0.8;
                    window.speechSynthesis.speak(utterance);
                },
                
                /**
                 * 停止所有提示音
                 */
                stopAllSounds: function() {
                    console.log('停止所有提示音');
                    
                    // 清除间隔定时器
                    if (this._intervalTimer) {
                        clearInterval(this._intervalTimer);
                        this._intervalTimer = null;
                    }
                    
                    // 停止语音合成
                    if (window.speechSynthesis) {
                        window.speechSynthesis.cancel();
                    }
                    
                    // 停止AudioHelper
                    if (window.AudioHelper && window.AudioHelper.stopLoop) {
                        window.AudioHelper.stopLoop({ fadeOut: 200 });
                    }
                    
                    // 停止AudioAutoplay
                    if (window.AudioAutoplay && window.AudioAutoplay.stop) {
                        window.AudioAutoplay.stop();
                    }
                    
                    // 停止所有音频元素
                    document.querySelectorAll('audio').forEach(audio => {
                        if (!audio.paused) {
                            try {
                                audio.pause();
                                audio.currentTime = 0;
                            } catch (e) {
                                console.warn('停止音频元素失败:', e);
                            }
                        }
                    });
                }
            };
            
            console.log('已创建AudioPlaybackHelper辅助功能');
        }
    }
    
    /**
     * 修复计时器设置按钮问题
     */
    function fixTimerSettingsButton() {
        // 在DOM加载完成后，找到设置按钮并绑定事件
        const settingsBtn = document.getElementById('toggleSettings') || 
                          document.getElementById('timerSettingsBtn');
                          
        if (!settingsBtn) {
            console.warn('未找到计时器设置按钮，无法修复');
            return;
        }
        
        console.log('找到计时器设置按钮:', settingsBtn);
        
        // 找到设置模态框
        const settingsModal = document.getElementById('timerSettingsModal');
        if (!settingsModal) {
            console.warn('未找到计时器设置模态框，无法修复');
            return;
        }
        
        // 添加点击事件（使用事件委托避免重复绑定）
        settingsBtn.addEventListener('click', function(e) {
            console.log('设置按钮被点击');
            e.preventDefault();
            
            // 显示模态框
            settingsModal.style.display = 'block';
            
            // 尝试加载设置到表单
            if (typeof loadSettingsToForm === 'function') {
                try {
                    loadSettingsToForm();
                } catch (error) {
                    console.error('加载设置到表单时出错:', error);
                }
            }
        });
        
        // 处理关闭按钮
        const closeBtn = settingsModal.querySelector('.close') || 
                        settingsModal.querySelector('.close-btn');
                        
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                settingsModal.style.display = 'none';
            });
        }
        
        // 点击模态框外部关闭
        window.addEventListener('click', function(event) {
            if (event.target === settingsModal) {
                settingsModal.style.display = 'none';
            }
        });
        
        console.log('计时器设置按钮事件修复完成');
    }
})(); 
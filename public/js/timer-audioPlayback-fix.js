/**
 * timer-audioPlayback-fix.js
 * 专门修复计时器音频播放的问题
 * 主要修复：
 * 1. 音频循环播放功能
 * 2. 音量控制
 * 3. 播放提示音和语音通知的集成
 */

document.addEventListener('DOMContentLoaded', function() {
    console.log('音频播放修复脚本已加载');
    
    // 检查AudioAutoplay存在性
    if (!window.AudioAutoplay) {
        console.warn('AudioAutoplay模块不存在，尝试为延迟加载设置监听');
        
        // 设置一个监听器，在AudioAutoplay加载后再执行
        const observer = new MutationObserver(function(mutations) {
            if (window.AudioAutoplay) {
                console.log('检测到AudioAutoplay已加载，开始应用修复');
                observer.disconnect();
                applyAudioFixes();
            }
        });
        
        // 监听文档变化
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
        
        // 10秒后自动停止观察
        setTimeout(function() {
            observer.disconnect();
        }, 10000);
    } else {
        // AudioAutoplay已存在，直接应用修复
        applyAudioFixes();
    }
});

/**
 * 应用音频相关修复
 */
function applyAudioFixes() {
    console.log('开始应用音频播放修复');
    
    // 1. 增强循环播放功能
    enhanceLoopPlayback();
    
    // 2. 增强停止播放功能
    enhanceStopPlayback();
    
    // 3. 创建音频播放辅助功能
    createAudioPlaybackHelper();
    
    // 4. 添加计时器播放控制按钮事件
    setupTimerSoundControls();
}

/**
 * 增强循环播放功能
 */
function enhanceLoopPlayback() {
    // 确保AudioAutoplay存在
    if (!window.AudioAutoplay) {
        console.error('无法增强循环播放功能，AudioAutoplay不存在');
        return;
    }
    
    // 检查并修复playLoop方法
    if (!window.AudioAutoplay.playLoop) {
        console.log('创建AudioAutoplay.playLoop方法');
        window.AudioAutoplay.playLoop = function(audioUrl, onComplete) {
            console.log('调用增强版playLoop方法:', audioUrl);
            // 使用第三个参数开启循环
            if (window.AudioAutoplay.playAudio) {
                return window.AudioAutoplay.playAudio(audioUrl, onComplete, true);
            } else if (window.AudioAutoplay.play) {
                return window.AudioAutoplay.play(audioUrl, onComplete, true);
            } else {
                console.error('无法找到有效的音频播放方法');
                // 降级实现
                const audio = new Audio(audioUrl);
                audio.loop = true;
                audio.volume = 0.7;
                
                // 错误处理
                audio.onerror = function(e) {
                    console.error('音频播放错误:', e);
                    if (onComplete && typeof onComplete === 'function') {
                        onComplete();
                    }
                };
                
                // 尝试播放
                audio.play().catch(function(e) {
                    console.error('播放音频失败:', e);
                    if (onComplete && typeof onComplete === 'function') {
                        onComplete();
                    }
                });
                
                // 存储引用
                window.currentLoopAudio = audio;
                return audio;
            }
        };
    }
    
    // 增强现有的playLoop方法以确保正确处理循环
    const originalPlayLoop = window.AudioAutoplay.playLoop;
    window.AudioAutoplay.playLoop = function(audioUrl, onComplete) {
        console.log('调用经过修复的playLoop方法:', audioUrl);
        
        // 先停止正在播放的
        if (window.AudioAutoplay.stop) {
            window.AudioAutoplay.stop();
        } else if (window.AudioAutoplay.stopCurrentAudio) {
            window.AudioAutoplay.stopCurrentAudio();
        }
        
        // 使用原始方法
        return originalPlayLoop.call(window.AudioAutoplay, audioUrl, onComplete);
    };
}

/**
 * 增强停止播放功能
 */
function enhanceStopPlayback() {
    // 确保AudioAutoplay存在
    if (!window.AudioAutoplay) {
        console.error('无法增强停止播放功能，AudioAutoplay不存在');
        return;
    }
    
    // 检查并创建stop方法（如果不存在）
    if (!window.AudioAutoplay.stop) {
        console.log('创建AudioAutoplay.stop方法');
        window.AudioAutoplay.stop = function() {
            console.log('调用新增的stop方法');
            // 优先使用内置的stopCurrentAudio方法
            if (window.AudioAutoplay.stopCurrentAudio) {
                window.AudioAutoplay.stopCurrentAudio();
            }
            
            // 尝试停止可能存在的循环音频
            if (window.currentLoopAudio) {
                try {
                    window.currentLoopAudio.pause();
                    window.currentLoopAudio.currentTime = 0;
                    window.currentLoopAudio = null;
                } catch (e) {
                    console.warn('停止当前循环音频失败:', e);
                }
            }
            
            // 尝试停止所有音频元素
            document.querySelectorAll('audio').forEach(function(audio) {
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
    } else {
        // 增强现有的stop方法
        const originalStop = window.AudioAutoplay.stop;
        window.AudioAutoplay.stop = function() {
            console.log('调用增强的stop方法');
            
            // 调用原始方法
            originalStop.call(window.AudioAutoplay);
            
            // 额外检查确保所有音频都停止
            document.querySelectorAll('audio').forEach(function(audio) {
                if (!audio.paused) {
                    try {
                        audio.pause();
                        audio.currentTime = 0;
                    } catch (e) {
                        console.warn('停止额外音频元素失败:', e);
                    }
                }
            });
            
            // 清除可能存在的循环音频引用
            window.currentLoopAudio = null;
        };
    }
}

/**
 * 创建音频播放辅助功能
 */
function createAudioPlaybackHelper() {
    if (!window.TimerAudioHelper) {
        console.log('创建TimerAudioHelper辅助对象');
        
        window.TimerAudioHelper = {
            /**
             * 播放提示音
             * @param {string} audioUrl - 音频URL
             * @param {object} options - 选项
             */
            playAlert: function(audioUrl, options) {
                const settings = options || {};
                const duration = settings.duration || 3000; // 默认3秒
                const volume = settings.volume !== undefined ? settings.volume : 0.7;
                
                audioUrl = audioUrl || '/audio/alert.mp3';
                
                console.log(`播放提示音: ${audioUrl}, 持续: ${duration}ms, 音量: ${volume}`);
                
                // 检查不同播放方法
                if (window.AudioAutoplay && window.AudioAutoplay.playLoop) {
                    // 使用AudioAutoplay播放
                    window.AudioAutoplay.playLoop(audioUrl, function() {
                        console.log('AudioAutoplay.playLoop完成回调');
                    });
                    
                    // 设置定时停止
                    setTimeout(function() {
                        if (window.AudioAutoplay.stop) {
                            window.AudioAutoplay.stop();
                        }
                    }, duration);
                } else {
                    // 使用原生Audio API
                    const audio = new Audio(audioUrl);
                    audio.volume = volume;
                    
                    // 如果持续时间超过音频长度，则设置循环
                    if (duration > 10000) {
                        audio.loop = true;
                    }
                    
                    // 尝试播放
                    audio.play().catch(function(e) {
                        console.error('播放音频失败:', e);
                    });
                    
                    // 设置定时停止
                    setTimeout(function() {
                        try {
                            audio.pause();
                            audio.currentTime = 0;
                        } catch (e) {
                            console.warn('停止音频失败:', e);
                        }
                    }, duration);
                }
            },
            
            /**
             * 播放语音通知
             * @param {string} message - 通知消息
             * @param {object} options - 选项
             */
            speakMessage: function(message, options) {
                if (!message || !window.speechSynthesis) {
                    console.warn('无法播放语音通知，消息为空或不支持语音合成');
                    return;
                }
                
                const settings = options || {};
                const lang = settings.lang || 'zh-CN';
                const volume = settings.volume !== undefined ? settings.volume : 0.8;
                
                console.log(`播放语音通知: "${message}", 语言: ${lang}, 音量: ${volume}`);
                
                const utterance = new SpeechSynthesisUtterance(message);
                utterance.lang = lang;
                utterance.volume = volume;
                
                // 开始播放
                window.speechSynthesis.speak(utterance);
            },
            
            /**
             * 播放计时器完成通知
             * @param {string} title - 计时器标题
             * @param {object} options - 选项
             */
            playTimerCompleteNotification: function(title, options) {
                const settings = options || {};
                const useAudio = settings.useAudio !== false;
                const useVoice = settings.useVoice !== false;
                
                console.log(`播放计时器完成通知: "${title}"`);
                
                // 先播放音频提示音
                if (useAudio) {
                    this.playAlert('/audio/alert.mp3', {
                        duration: 3000
                    });
                    
                    // 音频播放3秒后播放语音通知
                    if (useVoice && title) {
                        setTimeout(function() {
                            window.TimerAudioHelper.speakMessage(`计时器 ${title} 已完成`);
                        }, 3000);
                    }
                } else if (useVoice && title) {
                    // 只播放语音通知
                    this.speakMessage(`计时器 ${title} 已完成`);
                }
            },
            
            /**
             * 停止所有声音
             */
            stopAllSounds: function() {
                console.log('停止所有声音');
                
                // 停止语音合成
                if (window.speechSynthesis) {
                    window.speechSynthesis.cancel();
                }
                
                // 停止AudioAutoplay
                if (window.AudioAutoplay && window.AudioAutoplay.stop) {
                    window.AudioAutoplay.stop();
                } else if (window.AudioAutoplay && window.AudioAutoplay.stopCurrentAudio) {
                    window.AudioAutoplay.stopCurrentAudio();
                }
                
                // 停止所有音频元素
                document.querySelectorAll('audio').forEach(function(audio) {
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
    }
}

/**
 * 设置计时器声音控制按钮事件
 */
function setupTimerSoundControls() {
    // 寻找暂停所有按钮
    const pauseAllBtn = document.getElementById('pauseAllBtn');
    if (pauseAllBtn) {
        console.log('找到暂停所有按钮，添加事件监听器');
        
        pauseAllBtn.addEventListener('click', function() {
            console.log('点击了暂停所有按钮');
            
            // 使用新的TimerAudioHelper停止所有声音
            if (window.TimerAudioHelper) {
                window.TimerAudioHelper.stopAllSounds();
            } else if (window.AudioAutoplay) {
                // 回退到AudioAutoplay
                if (window.AudioAutoplay.stop) {
                    window.AudioAutoplay.stop();
                } else if (window.AudioAutoplay.stopCurrentAudio) {
                    window.AudioAutoplay.stopCurrentAudio();
                }
            }
        });
    }
    
    // 寻找恢复所有按钮
    const resumeAllBtn = document.getElementById('resumeAllBtn');
    if (resumeAllBtn) {
        console.log('找到恢复所有按钮，添加事件监听器');
        
        resumeAllBtn.addEventListener('click', function() {
            console.log('点击了恢复所有按钮');
            
            // 查找暂停的计时器并恢复
            const pausedTimers = document.querySelectorAll('.timer-paused');
            if (pausedTimers.length > 0) {
                console.log(`找到${pausedTimers.length}个暂停的计时器，尝试恢复`);
                
                // 触发计时器的恢复按钮点击
                pausedTimers.forEach(function(timer) {
                    const resumeBtn = timer.querySelector('.resume-timer-btn');
                    if (resumeBtn) {
                        resumeBtn.click();
                    }
                });
            } else {
                console.log('没有找到暂停的计时器');
            }
        });
    }
} 
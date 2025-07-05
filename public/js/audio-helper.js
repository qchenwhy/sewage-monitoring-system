/**
 * AudioHelper - 音频播放辅助工具
 * 基于AudioAutoplay库增强音频循环播放功能
 */

// 在DOMContentLoaded事件触发后初始化
document.addEventListener('DOMContentLoaded', function() {
    console.log('AudioHelper: 初始化音频辅助工具');
    
    // 检查依赖是否存在
    if (window.AudioHelper) {
        console.log('AudioHelper: 已初始化，跳过');
        return;
    }
    
    // 创建全局AudioHelper命名空间
    window.AudioHelper = (function() {
        // 私有变量
        let _currentLoopAudio = null;           // 当前播放的循环音频
        let _isLooping = false;                 // 是否正在循环播放
        let _currentAudioUrl = '';              // 当前音频URL
        let _volume = 1.0;                      // 音量 (0.0 - 1.0)
        let _fadeInTime = 0;                    // 淡入时间 (毫秒)
        let _fadeOutTime = 0;                   // 淡出时间 (毫秒)
        let _fadeInterval = null;               // 渐变计时器
        
        // 私有方法
        // 检查AudioAutoplay依赖
        function _checkDependency() {
            if (!window.AudioAutoplay) {
                console.error('AudioHelper: 依赖的AudioAutoplay模块不存在！');
                return false;
            }
            return true;
        }
        
        // 公共API
        return {
            /**
             * 开始循环播放音频
             * @param {string} audioUrl - 音频文件URL
             * @param {object} options - 配置选项
             * @param {number} options.volume - 音量 (0.0-1.0)
             * @param {number} options.fadeIn - 淡入时间 (毫秒)
             * @returns {boolean} - 是否成功开始播放
             */
            startLoop: function(audioUrl, options = {}) {
                if (!_checkDependency()) return false;
                
                // 检查音频URL
                if (!audioUrl) {
                    console.error('AudioHelper: 无效的音频URL');
                    return false;
                }
                
                // 记录设置
                _currentAudioUrl = audioUrl;
                _volume = options.volume !== undefined ? Math.min(1.0, Math.max(0, options.volume)) : 1.0;
                _fadeInTime = options.fadeIn || 0;
                
                console.log(`AudioHelper: 开始循环播放 ${audioUrl}${_fadeInTime ? `, 淡入时间: ${_fadeInTime}ms` : ''}`);
                
                // 如果已经在播放，先停止
                if (_isLooping) {
                    window.AudioAutoplay.stop();
                }
                
                // 使用AudioAutoplay的playLoop方法
                window.AudioAutoplay.playLoop(audioUrl, function() {
                    console.log('AudioHelper: 循环播放完成');
                    _isLooping = false;
                    _currentLoopAudio = null;
                });
                
                _isLooping = true;
                
                // 应用音量（如果AudioAutoplay没有直接支持音量控制）
                // 实现淡入效果
                if (_fadeInTime > 0) {
                    // 创建淡入效果
                    let currentVolume = 0;
                    const targetVolume = _volume;
                    const step = targetVolume / ((_fadeInTime / 1000) * 10); // 每100ms增加的音量
                    
                    // 确保currentAudio元素存在
                    setTimeout(() => {
                        if (window.currentAudio) {
                            _currentLoopAudio = window.currentAudio;
                            _currentLoopAudio.volume = 0; // 从0开始
                            
                            // 清除之前的淡入淡出
                            if (_fadeInterval) clearInterval(_fadeInterval);
                            
                            // 创建新的淡入
                            _fadeInterval = setInterval(() => {
                                currentVolume += step;
                                if (currentVolume >= targetVolume) {
                                    currentVolume = targetVolume;
                                    clearInterval(_fadeInterval);
                                    _fadeInterval = null;
                                }
                                
                                if (_currentLoopAudio) {
                                    _currentLoopAudio.volume = currentVolume;
                                }
                            }, 100);
                        }
                    }, 100); // 等待100ms确保音频元素已创建
                }
                
                return true;
            },
            
            /**
             * 停止循环播放
             * @param {object} options - 配置选项
             * @param {number} options.fadeOut - 淡出时间 (毫秒)
             */
            stopLoop: function(options = {}) {
                if (!_checkDependency()) return;
                
                _fadeOutTime = options.fadeOut || 0;
                
                console.log(`AudioHelper: 停止循环播放${_fadeOutTime ? `, 淡出时间: ${_fadeOutTime}ms` : ''}`);
                
                // 如果没有在播放，直接返回
                if (!_isLooping) {
                    console.log('AudioHelper: 没有正在播放的循环音频');
                    return;
                }
                
                // 如果需要淡出效果
                if (_fadeOutTime > 0 && window.currentAudio) {
                    _currentLoopAudio = window.currentAudio;
                    const startVolume = _currentLoopAudio.volume;
                    const step = startVolume / ((_fadeOutTime / 1000) * 10); // 每100ms减少的音量
                    let currentVolume = startVolume;
                    
                    // 清除之前的淡入淡出
                    if (_fadeInterval) clearInterval(_fadeInterval);
                    
                    // 创建新的淡出
                    _fadeInterval = setInterval(() => {
                        currentVolume -= step;
                        if (currentVolume <= 0) {
                            currentVolume = 0;
                            clearInterval(_fadeInterval);
                            _fadeInterval = null;
                            
                            // 完全停止
                            window.AudioAutoplay.stop();
                            _isLooping = false;
                            _currentLoopAudio = null;
                        }
                        
                        if (_currentLoopAudio) {
                            _currentLoopAudio.volume = currentVolume;
                        }
                    }, 100);
                } else {
                    // 直接停止
                    window.AudioAutoplay.stop();
                    _isLooping = false;
                    _currentLoopAudio = null;
                }
            },
            
            /**
             * 设置当前播放音频的音量
             * @param {number} volume - 音量 (0.0-1.0)
             */
            setVolume: function(volume) {
                if (!_checkDependency()) return;
                
                _volume = Math.min(1.0, Math.max(0, volume));
                console.log(`AudioHelper: 设置音量为 ${_volume}`);
                
                // 如果当前有音频在播放，立即应用
                if (_isLooping && window.currentAudio) {
                    window.currentAudio.volume = _volume;
                }
            },
            
            /**
             * 获取当前音频播放状态
             * @returns {object} - 播放状态信息
             */
            getStatus: function() {
                return {
                    isLooping: _isLooping,
                    currentAudio: _currentAudioUrl,
                    volume: _volume
                };
            },
            
            /**
             * 检查是否正在循环播放
             * @returns {boolean} - 是否正在循环播放
             */
            isLooping: function() {
                return _isLooping;
            },
            
            /**
             * 切换循环播放状态
             * @param {string} audioUrl - 音频文件URL（当需要开始播放时）
             * @param {object} options - 配置选项
             * @returns {boolean} - 切换后是否在播放
             */
            toggleLoop: function(audioUrl, options = {}) {
                if (_isLooping) {
                    this.stopLoop(options);
                    return false;
                } else {
                    return this.startLoop(audioUrl, options);
                }
            }
        };
    })();
    
    // 初始化完成
    console.log('AudioHelper: 初始化完成');
}); 
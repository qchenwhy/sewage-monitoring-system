/**
 * chat-audio-log.js
 * 用于记录聊天音频问题修复的日志信息
 * 版本: 1.0.0
 */

(function() {
    // 初始化变量
    const logEnabled = true;
    const detailedLogging = true;
    
    // 创建日志容器
    window.AudioDebugLog = {
        logs: [],
        maxLogs: 100,
        
        /**
         * 记录日志
         * @param {string} message 日志消息
         * @param {string} level 日志级别 (info, warn, error)
         * @param {object} data 附加数据
         */
        log: function(message, level = 'info', data = null) {
            if (!logEnabled) return;
            
            const timestamp = new Date().toISOString();
            const logEntry = {
                timestamp,
                level,
                message,
                data: data ? JSON.stringify(data) : null
            };
            
            // 添加到日志集合
            this.logs.unshift(logEntry);
            
            // 限制日志数量
            if (this.logs.length > this.maxLogs) {
                this.logs = this.logs.slice(0, this.maxLogs);
            }
            
            // 控制台输出
            const prefix = `[音频修复日志 ${timestamp.split('T')[1].split('.')[0]}]`;
            switch (level) {
                case 'warn':
                    console.warn(`${prefix} ${message}`, data || '');
                    break;
                case 'error':
                    console.error(`${prefix} ${message}`, data || '');
                    break;
                default:
                    console.log(`${prefix} ${message}`, data || '');
            }
        },
        
        /**
         * 记录音频事件
         * @param {string} eventType 事件类型
         * @param {object} audioData 音频相关数据
         */
        logAudioEvent: function(eventType, audioData) {
            if (!detailedLogging) return;
            
            let message = `音频事件: ${eventType}`;
            if (audioData) {
                if (audioData.roundId) {
                    message += `, 轮次ID: ${audioData.roundId}`;
                }
                if (audioData.url) {
                    message += `, URL: ${audioData.url.substring(0, 30)}...`;
                }
            }
            
            this.log(message, 'info', audioData);
        },
        
        /**
         * 导出日志
         * @returns {string} JSON格式的日志字符串
         */
        exportLogs: function() {
            return JSON.stringify(this.logs, null, 2);
        },
        
        /**
         * 清空日志
         */
        clearLogs: function() {
            this.logs = [];
            console.log('[音频修复日志] 日志已清空');
        },
        
        /**
         * 诊断音频问题
         * 全面检查页面中的音频元素和相关状态
         * @returns {object} 诊断结果对象
         */
        diagnoseAudioIssues: function() {
            console.log('========== 开始音频问题诊断 ==========');
            
            const results = {
                audioElements: [],
                globalState: {},
                detectedIssues: [],
                recommendations: []
            };
            
            // 1. 检查audio元素
            try {
                const audioElements = document.querySelectorAll('audio');
                console.log(`找到 ${audioElements.length} 个音频元素`);
                
                audioElements.forEach((audio, index) => {
                    const audioInfo = {
                        index: index,
                        paused: audio.paused,
                        currentTime: audio.currentTime,
                        duration: audio.duration,
                        src: audio.src,
                        volume: audio.volume,
                        muted: audio.muted,
                        hasError: audio.error !== null,
                        errorCode: audio.error ? audio.error.code : null,
                        hasDataset: !!audio.dataset,
                        roundId: audio.dataset ? audio.dataset.roundId : null,
                        audioUrl: audio.dataset ? audio.dataset.audioUrl : null
                    };
                    
                    results.audioElements.push(audioInfo);
                    
                    // 检查问题
                    if (!audio.paused && audio.currentTime === 0) {
                        results.detectedIssues.push(`音频元素 #${index} 显示为播放状态但时间为0`);
                    }
                    
                    if (audio.error) {
                        results.detectedIssues.push(`音频元素 #${index} 存在错误: ${audio.error.code}`);
                    }
                    
                    if (audio.dataset && audio.dataset.roundId && 
                        audio.dataset.roundId !== window.currentConversationRoundId) {
                        results.detectedIssues.push(`音频元素 #${index} 轮次ID (${audio.dataset.roundId}) 与当前轮次 (${window.currentConversationRoundId}) 不匹配`);
                    }
                });
                
                if (audioElements.length > 5) {
                    results.detectedIssues.push('页面中存在过多音频元素，可能导致资源冲突');
                    results.recommendations.push('使用stopAllAudio()函数清理多余音频元素');
                }
            } catch (e) {
                console.error('检查音频元素时出错:', e);
                results.detectedIssues.push('检查音频元素时发生错误: ' + e.message);
            }
            
            // 2. 检查全局状态
            try {
                // 基本状态变量
                results.globalState = {
                    currentRoundId: window.currentConversationRoundId,
                    lastUserInteractionTime: window.lastUserInteractionTime,
                    isStreamingResponse: window.isStreamingResponse,
                    isAudioPlaying: window.isAudioPlaying,
                    audioQueueLength: Array.isArray(window.audioQueue) ? window.audioQueue.length : 'undefined',
                    pendingSynthesisSegmentsLength: Array.isArray(window.pendingSynthesisSegments) ? window.pendingSynthesisSegments.length : 'undefined',
                    isSynthesizing: window.isSynthesizing,
                    processedAudioUrlsSize: window.processedAudioUrls instanceof Set ? window.processedAudioUrls.size : 'undefined',
                    hasAudioContext: !!window.audioContext,
                    hasAudioCoordinator: !!window.AudioCoordinator
                };
                
                // 检查问题
                if (!window.currentConversationRoundId) {
                    results.detectedIssues.push('缺少对话轮次ID');
                    results.recommendations.push('调用resetAudioState()函数创建新的轮次ID');
                }
                
                if (window.isAudioPlaying && document.querySelectorAll('audio:not([paused])').length === 0) {
                    results.detectedIssues.push('系统认为有音频正在播放，但没有找到播放中的音频元素');
                    results.recommendations.push('手动重置isAudioPlaying状态: window.isAudioPlaying = false');
                }
                
                if (window.isSynthesizing && 
                    (!Array.isArray(window.pendingSynthesisSegments) || window.pendingSynthesisSegments.length === 0)) {
                    results.detectedIssues.push('系统认为正在合成，但没有待处理的片段');
                    results.recommendations.push('手动重置合成状态: window.isSynthesizing = false');
                }
            } catch (e) {
                console.error('检查全局状态时出错:', e);
                results.detectedIssues.push('检查全局状态时发生错误: ' + e.message);
            }
            
            // 3. 提供建议
            if (results.detectedIssues.length === 0) {
                console.log('诊断完成，未发现明显问题');
                results.recommendations.push('音频系统状态正常');
            } else {
                console.log(`诊断完成，发现 ${results.detectedIssues.length} 个问题`);
                
                // 通用建议
                if (results.recommendations.length === 0) {
                    results.recommendations.push('尝试使用window.StreamingHandler.resetAudioState()重置音频状态');
                    results.recommendations.push('确保在发送新消息时调用stopAllAudio()函数');
                }
            }
            
            console.log('诊断结果:', results);
            console.log('========== 音频问题诊断完成 ==========');
            
            return results;
        }
    };
    
    // 记录初始化日志
    window.AudioDebugLog.log('音频调试日志初始化完成');
    
    // 添加问题修复版本信息
    window.AudioDebugLog.log('音频播放问题修复完成', 'info', {
        version: '1.0.0',
        fixes: [
            '修复lastUserInteractionTime变量在初始化前被访问的问题',
            '实现基于对话轮次ID的音频管理系统，防止不同轮次音频混合播放',
            '优化音频排序算法，改进了内容类型判断和顺序处理',
            '增强音频停止机制，发送新消息时彻底清理所有音频资源',
            '改进DOM中音频元素的管理，防止内存泄漏和资源残留'
        ],
        date: new Date().toISOString()
    });
    
    // 添加全局诊断函数，方便用户在控制台调用
    window.diagnoseAudioIssues = function() {
        return window.AudioDebugLog.diagnoseAudioIssues();
    };
    
    console.log('[音频修复] 音频问题诊断和日志系统已加载，可以通过调用diagnoseAudioIssues()函数进行诊断');
})(); 
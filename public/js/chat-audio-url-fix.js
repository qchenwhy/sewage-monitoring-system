/**
 * chat-audio-url-fix.js
 * 修复聊天页面中的音频URL处理和播放问题
 * 版本: 1.0
 */

(function() {
    console.log('[音频URL修复] 开始修复音频URL处理和播放问题');
    
    // 确保立即执行，防止变量初始化问题
    if (typeof window.lastUserInteractionTime === 'undefined') {
        window.lastUserInteractionTime = Date.now();
        console.log('[音频URL修复] 初始化 lastUserInteractionTime =', new Date(window.lastUserInteractionTime).toLocaleTimeString());
    }

    // 安全地处理全局事件监听器，防止访问未初始化的变量
    document.addEventListener('DOMContentLoaded', function() {
        console.log('[音频URL修复] DOM已加载，开始修复URL处理问题');
        
        // 1. 修复 isUrlProcessed 函数，确保安全地处理 URL
        if (typeof window.isUrlProcessed === 'function') {
            console.log('[音频URL修复] 找到并修复 isUrlProcessed 函数');
            const originalIsUrlProcessed = window.isUrlProcessed;
            
            window.isUrlProcessed = function(url) {
                // 安全检查
                if (!url || typeof url !== 'string') {
                    console.warn('[音频URL修复] isUrlProcessed 收到无效URL:', url);
                    return false;
                }
                
                try {
                    return originalIsUrlProcessed(url);
                } catch (error) {
                    console.error('[音频URL修复] isUrlProcessed 处理出错:', error);
                    return false;
                }
            };
        } else {
            // 如果函数不存在，创建一个安全版本
            window.isUrlProcessed = function(url) {
                if (!url || typeof url !== 'string') {
                    return false;
                }
                
                try {
                    // 检查URL是否在已处理列表中
                    return window.processedUrls && window.processedUrls.has(url);
                } catch (error) {
                    console.error('[音频URL修复] 检查URL处理状态出错:', error);
                    return false;
                }
            };
        }
        
        // 2. 修复 handleAudioEvent 函数中的URL处理
        if (typeof window.handleAudioEvent === 'function') {
            console.log('[音频URL修复] 找到并修复 handleAudioEvent 函数');
            const originalHandleAudioEvent = window.handleAudioEvent;
            
            window.handleAudioEvent = function(event) {
                try {
                    // 安全地获取音频URL
                    const audioUrl = event && event.data && event.data.url;
                    if (!audioUrl || typeof audioUrl !== 'string') {
                        console.error('[音频URL修复] 收到无效的音频URL:', audioUrl);
                        return; // 跳过处理
                    }
                    
                    // 确保其他数据字段也是有效的
                    if (event.data) {
                        event.data.url = audioUrl; // 确保URL是字符串
                        event.data.text = event.data.text || '';
                        event.data.isFinal = !!event.data.isFinal;
                    }
                    
                    // 调用原始处理函数
                    return originalHandleAudioEvent(event);
                } catch (error) {
                    console.error('[音频URL修复] 处理音频事件时出错:', error);
                }
            };
        }
        
        // 3. 修复 checkMissingAudio 函数
        if (typeof window.checkMissingAudio === 'function') {
            console.log('[音频URL修复] 找到并修复 checkMissingAudio 函数');
            const originalCheckMissingAudio = window.checkMissingAudio;
            
            window.checkMissingAudio = function(urls) {
                try {
                    if (!urls || !Array.isArray(urls)) {
                        console.warn('[音频URL修复] checkMissingAudio 收到无效的URLs:', urls);
                        return [];
                    }
                    
                    // 过滤掉无效URL
                    const validUrls = urls.filter(url => url && typeof url === 'string');
                    console.log('[音频URL修复] 过滤后有效的URLs:', validUrls.length);
                    
                    // 调用原始函数
                    return originalCheckMissingAudio(validUrls);
                } catch (error) {
                    console.error('[音频URL修复] 检查缺失音频时出错:', error);
                    return [];
                }
            };
        }
        
        // 4. 修复 processNextAudio 函数
        if (typeof window.processNextAudio === 'function') {
            console.log('[音频URL修复] 找到并修复 processNextAudio 函数');
            const originalProcessNextAudio = window.processNextAudio;
            
            window.processNextAudio = async function() {
                try {
                    // 检查待处理队列
                    if (!window.pendingAudioUrls || !Array.isArray(window.pendingAudioUrls)) {
                        console.warn('[音频URL修复] pendingAudioUrls 无效:', window.pendingAudioUrls);
                        window.pendingAudioUrls = [];
                        return;
                    }
                    
                    // 验证队列中的URL
                    window.pendingAudioUrls = window.pendingAudioUrls.filter(item => {
                        if (!item) return false;
                        
                        // 如果是对象，确保url属性是字符串
                        if (typeof item === 'object') {
                            return item.url && typeof item.url === 'string';
                        }
                        
                        // 如果是字符串，直接保留
                        return typeof item === 'string';
                    });
                    
                    // 调用原始处理函数
                    return originalProcessNextAudio();
                } catch (error) {
                    console.error('[音频URL修复] 处理下一个音频时出错:', error);
                    
                    // 重置处理状态
                    if (typeof window.isProcessingAudio !== 'undefined') {
                        window.isProcessingAudio = false;
                    }
                }
            };
        }
        
        // 5. 增强 AudioAutoplay.play 方法的安全性
        if (window.AudioAutoplay && typeof window.AudioAutoplay.play === 'function') {
            console.log('[音频URL修复] 增强 AudioAutoplay.play 方法安全性');
            const originalPlay = window.AudioAutoplay.play;
            
            window.AudioAutoplay.play = function(url, onComplete, loop) {
                // 安全检查URL
                if (!url || typeof url !== 'string') {
                    console.error('[音频URL修复] AudioAutoplay.play 收到无效URL:', url);
                    
                    // 尝试提取有效URL（如果是对象）
                    if (url && typeof url === 'object' && url.url && typeof url.url === 'string') {
                        console.log('[音频URL修复] 从对象中提取URL:', url.url);
                        url = url.url;
                    } else {
                        // 如果无法恢复，直接调用回调并返回
                        if (typeof onComplete === 'function') {
                            setTimeout(onComplete, 100);
                        }
                        return false;
                    }
                }
                
                // 调用原始播放函数
                try {
                    return originalPlay.call(window.AudioAutoplay, url, onComplete, loop);
                } catch (error) {
                    console.error('[音频URL修复] AudioAutoplay.play 执行出错:', error);
                    
                    // 出错时仍然调用回调，确保流程继续
                    if (typeof onComplete === 'function') {
                        setTimeout(onComplete, 100);
                    }
                    return false;
                }
            };
        }
        
        // 6. 修复 error: processedUrl.split is not a function
        setTimeout(function() {
            // 在所有脚本加载后执行一次检查
            console.log('[音频URL修复] 检查并确保 processedUrls 集合正确初始化');
            
            // 确保 processedUrls 是一个 Set
            if (!window.processedUrls || !(window.processedUrls instanceof Set)) {
                console.warn('[音频URL修复] 重新初始化 processedUrls 集合');
                window.processedUrls = new Set();
            }
            
            // 确保相关的 Map 集合也被正确初始化
            if (!window.activeTimerReminders || !(window.activeTimerReminders instanceof Map)) {
                console.warn('[音频URL修复] 重新初始化 activeTimerReminders Map');
                window.activeTimerReminders = new Map();
            }
        }, 1000);
        
        console.log('[音频URL修复] 修复脚本加载完成');
    });
})(); 
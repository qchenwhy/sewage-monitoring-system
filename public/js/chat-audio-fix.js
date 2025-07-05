/**
 * chat-audio-fix.js
 * 修复因chat-settings-fix.js导致的聊天回复语音播放问题
 * 版本: 1.0
 */

(function() {
    console.log('[语音修复] 开始检查和恢复聊天语音播放功能');
    
    // 存储原始函数引用
    let originalSpeakMessage = null;
    let originalPlayAudioWithRepeat = null;
    let originalPlayAudioElementWithRepeat = null;
    let originalHandleAudioEvent = null;
    
    // 在页面加载完成后执行修复
    document.addEventListener('DOMContentLoaded', function() {
        console.log('[语音修复] DOM已加载，开始修复语音功能');
        
        // 确保AudioAutoplay模块可用
        if (!window.AudioAutoplay) {
            console.error('[语音修复] AudioAutoplay模块不存在，语音播放可能无法正常工作');
        } else {
            console.log('[语音修复] 检测到AudioAutoplay模块');
        }
        
        // 1. 检查并恢复speakMessage函数
        if (typeof window.speakMessage === 'function') {
            console.log('[语音修复] speakMessage函数已存在，保存原始引用');
            originalSpeakMessage = window.speakMessage;
        } else {
            console.error('[语音修复] speakMessage函数不存在，这是一个严重问题');
        }
        
        // 2. 确保playAudioWithRepeat函数正常工作
        if (typeof window.playAudioWithRepeat === 'function') {
            console.log('[语音修复] playAudioWithRepeat函数已存在，保存原始引用');
            originalPlayAudioWithRepeat = window.playAudioWithRepeat;
        }
        
        // 3. 确保playAudioElementWithRepeat函数正常工作
        if (typeof window.playAudioElementWithRepeat === 'function') {
            console.log('[语音修复] playAudioElementWithRepeat函数已存在，保存原始引用');
            originalPlayAudioElementWithRepeat = window.playAudioElementWithRepeat;
        }
        
        // 4. 确保handleAudioEvent函数正常工作
        if (typeof window.handleAudioEvent === 'function') {
            console.log('[语音修复] handleAudioEvent函数已存在，保存原始引用');
            originalHandleAudioEvent = window.handleAudioEvent;
        }
        
        // 5. 提供安全的替代函数，以防原始函数被覆盖
        // 这些函数将在原始函数被覆盖时调用
        
        // 安全的speakMessage替代函数
        window.safeSpeakMessage = function(message, repeatCount = 1) {
            console.log('[语音修复] 使用安全的speakMessage函数:', message);
            
            // 如果原始函数可用，优先使用原始函数
            if (originalSpeakMessage && typeof originalSpeakMessage === 'function') {
                console.log('[语音修复] 调用原始speakMessage函数');
                return originalSpeakMessage(message, repeatCount);
            }
            
            console.log('[语音修复] 原始speakMessage不可用，使用备用实现');
            
            // 使用TTS API获取语音
            fetch('/api/tts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text: message })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success && data.audioUrl) {
                    console.log(`[语音修复] 开始播放语音消息: "${message}"`);
                    
                    // 使用Audio元素播放
                    const audio = new Audio(data.audioUrl);
                    audio.onended = function() {
                        console.log('[语音修复] 语音播放完成');
                    };
                    audio.onerror = function(e) {
                        console.error('[语音修复] 播放语音失败:', e);
                    };
                    
                    // 确保audio元素从DOM中移除
                    audio.style.display = 'none';
                    document.body.appendChild(audio);
                    
                    // 播放音频
                    audio.play().catch(function(error) {
                        console.error('[语音修复] 播放语音出错:', error);
                        // 尝试浏览器原生TTS
                        if ('speechSynthesis' in window) {
                            const utterance = new SpeechSynthesisUtterance(message);
                            utterance.lang = 'zh-CN';
                            window.speechSynthesis.speak(utterance);
                        }
                    });
                } else {
                    console.error('[语音修复] 语音合成失败:', data.error);
                    // 降级到浏览器原生TTS
                    if ('speechSynthesis' in window) {
                        const utterance = new SpeechSynthesisUtterance(message);
                        utterance.lang = 'zh-CN';
                        window.speechSynthesis.speak(utterance);
                    }
                }
            })
            .catch(error => {
                console.error('[语音修复] 语音合成请求失败:', error);
                // 降级到浏览器原生TTS
                if ('speechSynthesis' in window) {
                    const utterance = new SpeechSynthesisUtterance(message);
                    utterance.lang = 'zh-CN';
                    window.speechSynthesis.speak(utterance);
                }
            });
        };
        
        // 6. 监听原始函数被覆盖的情况
        // 使用Object.defineProperty监视speakMessage函数
        if (window.speakMessage) {
            let _speakMessage = window.speakMessage;
            Object.defineProperty(window, 'speakMessage', {
                get: function() {
                    return _speakMessage;
                },
                set: function(newFunc) {
                    console.warn('[语音修复] speakMessage函数被修改:', newFunc);
                    
                    // 如果新函数无效，使用我们的安全函数
                    if (!newFunc || typeof newFunc !== 'function') {
                        console.error('[语音修复] 无效的speakMessage函数，恢复为安全实现');
                        _speakMessage = window.safeSpeakMessage;
                    } else {
                        _speakMessage = newFunc;
                    }
                },
                configurable: true
            });
        }
        
        console.log('[语音修复] 语音播放保护措施已设置');
        
        // 7. 测试语音功能是否正常
        setTimeout(function() {
            console.log('[语音修复] 测试语音功能');
            
            // 尝试使用系统原生TTS测试发音
            try {
                if ('speechSynthesis' in window) {
                    const testUtterance = new SpeechSynthesisUtterance('语音修复测试');
                    testUtterance.volume = 0.1; // 低音量测试
                    testUtterance.onend = function() {
                        console.log('[语音修复] 浏览器TTS测试成功');
                    };
                    testUtterance.onerror = function(e) {
                        console.error('[语音修复] 浏览器TTS测试失败:', e);
                    };
                    window.speechSynthesis.speak(testUtterance);
                }
            } catch (e) {
                console.error('[语音修复] 测试语音功能失败:', e);
            }
        }, 3000);
    });
    
    // 页面关闭前进行清理
    window.addEventListener('beforeunload', function() {
        console.log('[语音修复] 页面关闭，清理资源');
        
        // 停止所有语音合成
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
    });
    
    console.log('[语音修复] 修复脚本初始化完成');
})(); 
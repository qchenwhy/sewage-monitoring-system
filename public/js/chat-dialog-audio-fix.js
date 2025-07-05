/**
 * chat-dialog-audio-fix.js
 * 修复因计时器功能影响导致的对话框语音播放问题
 * 恢复对话框原有的语音播放逻辑，而不影响计时器功能
 */

(function() {
    console.log('[对话框语音修复] 开始恢复原有语音播放功能');
    
    // 存储对话框原始语音相关函数的引用
    let originalSpeakMessage = null;
    let originalPlayAudioWithRepeat = null;
    let originalPlayAudioElementWithRepeat = null;
    let originalHandleAudioEvent = null;
    let originalProcessNextAudio = null;
    
    // 等待DOM加载完成
    document.addEventListener('DOMContentLoaded', function() {
        console.log('[对话框语音修复] DOM加载完成，开始还原语音功能');
        
        // 1. 保存重要函数的原始引用（如果存在）
        if (typeof window.speakMessage === 'function') {
            console.log('[对话框语音修复] 保存原始speakMessage函数');
            originalSpeakMessage = window.speakMessage;
        }
        
        if (typeof window.playAudioWithRepeat === 'function') {
            console.log('[对话框语音修复] 保存原始playAudioWithRepeat函数');
            originalPlayAudioWithRepeat = window.playAudioWithRepeat;
        }
        
        if (typeof window.playAudioElementWithRepeat === 'function') {
            console.log('[对话框语音修复] 保存原始playAudioElementWithRepeat函数');
            originalPlayAudioElementWithRepeat = window.playAudioElementWithRepeat;
        }
        
        if (typeof window.handleAudioEvent === 'function') {
            console.log('[对话框语音修复] 保存原始handleAudioEvent函数');
            originalHandleAudioEvent = window.handleAudioEvent;
        }
        
        if (typeof window.processNextAudio === 'function') {
            console.log('[对话框语音修复] 保存原始processNextAudio函数');
            originalProcessNextAudio = window.processNextAudio;
        }
        
        // 在所有脚本加载完成后恢复原始函数
        // 修改：减少延时，确保在其他脚本之前运行
        setTimeout(function() {
            restoreOriginalFunctions();
        }, 500);
    });
    
    // 恢复对话框的原始语音处理功能
    function restoreOriginalFunctions() {
        console.log('[对话框语音修复] 开始恢复原始语音处理函数');
        
        // 恢复speakMessage函数
        if (originalSpeakMessage) {
            // 设置特殊标记，防止其他修复脚本再次覆盖
            const safeOriginalSpeakMessage = function(message, repeatCount = 1) {
                console.log('[对话框语音修复] 使用原始speakMessage函数:', message);
                try {
                    return originalSpeakMessage(message, repeatCount);
                } catch (error) {
                    console.error('[对话框语音修复] 原始speakMessage执行出错:', error);
                    // 降级到简单的语音合成
                    simpleTTS(message, repeatCount);
                }
            };
            
            // 使用属性定义器防止被覆盖
            Object.defineProperty(window, 'speakMessage', {
                configurable: true,
                get: function() {
                    return safeOriginalSpeakMessage;
                },
                set: function(newFunc) {
                    console.warn('[对话框语音修复] 检测到尝试覆盖speakMessage函数，已阻止');
                }
            });
            
            console.log('[对话框语音修复] speakMessage函数已恢复');
        }
        
        // 恢复handleAudioEvent函数
        if (originalHandleAudioEvent) {
            // 设置带保护的函数
            const safeOriginalHandleAudioEvent = function(parsedData) {
                try {
                    // 增强型数据验证
                    if (!parsedData) {
                        console.error('[对话框语音修复] handleAudioEvent收到空数据');
                        return;
                    }
                    
                    // 确保URL参数有效，是处理无效URL错误的关键
                    if (!parsedData.url) {
                        console.error('[对话框语音修复] 收到无效的音频URL:', parsedData.url);
                        
                        // 尝试从其他字段恢复
                        if (parsedData.audioUrl) {
                            console.log('[对话框语音修复] 尝试使用audioUrl字段:', parsedData.audioUrl);
                            parsedData.url = parsedData.audioUrl;
                        } else if (parsedData.data && parsedData.data.url) {
                            console.log('[对话框语音修复] 尝试使用data.url字段:', parsedData.data.url);
                            parsedData.url = parsedData.data.url;
                        } else {
                            // 如果无法恢复，则跳过处理
                            return;
                        }
                    }
                    
                    // 确保URL是字符串并移除可能的非法字符
                    parsedData.url = String(parsedData.url).trim();
                    
                    // 确保URL有效 - 必须以/audio/开头
                    if (!parsedData.url.startsWith('/audio/')) {
                        console.error('[对话框语音修复] URL不符合预期格式:', parsedData.url);
                        return;
                    }
                    
                    // 确保其他必要字段存在
                    if (!parsedData.text) {
                        parsedData.text = '';
                    }
                    
                    // 确保布尔值字段正确
                    parsedData.isFinal = !!parsedData.isFinal;
                    
                    // 确保roundId字段存在(如果需要)
                    if (!parsedData.roundId && window.currentConversationRoundId) {
                        parsedData.roundId = window.currentConversationRoundId;
                    }
                    
                    console.log('[对话框语音修复] 处理有效音频URL:', parsedData.url);
                    
                    // 调用原始函数
                    return originalHandleAudioEvent(parsedData);
                } catch (error) {
                    console.error('[对话框语音修复] 处理音频事件出错:', error);
                }
            };
            
            // 覆盖handleAudioEvent函数
            window.handleAudioEvent = safeOriginalHandleAudioEvent;
            console.log('[对话框语音修复] handleAudioEvent函数已恢复并增强');
        }
        
        // 修复可能存在的变量初始化问题
        ensureAudioVariablesExist();
        
        console.log('[对话框语音修复] 语音处理函数恢复完成');
        
        // 与其他修复脚本配合
        integrateWithOtherFixScripts();
        
        // 测试恢复后功能
        setTimeout(function() {
            testAudioFunctionality();
        }, 2000);
    }
    
    // 与其他修复脚本集成
    function integrateWithOtherFixScripts() {
        console.log('[对话框语音修复] 检查并集成其他修复脚本');
        
        // 与chat-audio-url-fix.js集成
        if (typeof window.handleAudioEvent === 'function') {
            // 确保我们的函数不被覆盖
            const ourHandleAudioEvent = window.handleAudioEvent;
            
            // 监听handleAudioEvent函数的变化
            let isMonitoring = false;
            try {
                const descriptor = Object.getOwnPropertyDescriptor(window, 'handleAudioEvent');
                if (!descriptor || descriptor.configurable) {
                    // 只有在函数可配置时才设置监听
                    isMonitoring = true;
                    
                    const originalGetter = descriptor ? descriptor.get : undefined;
                    const originalSetter = descriptor ? descriptor.set : undefined;
                    
                    Object.defineProperty(window, 'handleAudioEvent', {
                        configurable: true,
                        get: function() {
                            return originalGetter ? originalGetter.call(this) : ourHandleAudioEvent;
                        },
                        set: function(newFunc) {
                            console.warn('[对话框语音修复] 检测到handleAudioEvent被修改，确保兼容性');
                            
                            // 允许其他脚本设置函数，但我们包装它以确保我们的逻辑不丢失
                            if (typeof newFunc === 'function') {
                                const otherFixFunc = newFunc;
                                
                                // 创建一个集成两者的函数
                                const combinedFunc = function(data) {
                                    // 先应用我们的数据验证逻辑
                                    if (!data || (!data.url && !data.audioUrl)) {
                                        console.error('[对话框语音修复] 无效数据，跳过处理');
                                        return;
                                    }
                                    
                                    // 确保URL存在
                                    if (!data.url && data.audioUrl) {
                                        data.url = data.audioUrl;
                                    }
                                    
                                    try {
                                        // 调用对方的函数
                                        return otherFixFunc(data);
                                    } catch (error) {
                                        console.error('[对话框语音修复] 其他修复脚本处理失败:', error);
                                        // 降级到我们的原始函数
                                        return ourHandleAudioEvent(data);
                                    }
                                };
                                
                                // 使用原始setter(如果存在)，否则直接赋值
                                if (originalSetter) {
                                    originalSetter.call(this, combinedFunc);
                                } else {
                                    // 直接赋值(会再次触发setter，但函数已经不同)
                                    Object.defineProperty(window, 'handleAudioEvent', {
                                        configurable: true,
                                        writable: true,
                                        value: combinedFunc
                                    });
                                }
                            }
                        }
                    });
                }
            } catch (error) {
                console.error('[对话框语音修复] 设置集成监听时出错:', error);
            }
            
            if (!isMonitoring) {
                console.log('[对话框语音修复] 无法设置监听，采用定期检查方式');
                // 定期检查函数是否被修改
                const checkInterval = setInterval(function() {
                    if (window.handleAudioEvent !== ourHandleAudioEvent) {
                        console.warn('[对话框语音修复] 检测到handleAudioEvent已变更，恢复我们的版本');
                        window.handleAudioEvent = ourHandleAudioEvent;
                    }
                }, 2000);
                
                // 60秒后停止监控
                setTimeout(function() {
                    clearInterval(checkInterval);
                }, 60000);
            }
        }
    }
    
    // 确保音频处理所需的变量已被正确初始化
    function ensureAudioVariablesExist() {
        // 确保处理URL集合存在
        if (!window.processedUrls || !(window.processedUrls instanceof Set)) {
            console.log('[对话框语音修复] 重新初始化processedUrls集合');
            window.processedUrls = new Set();
        }
        
        // 确保待处理音频队列存在
        if (!window.pendingAudioUrls || !Array.isArray(window.pendingAudioUrls)) {
            console.log('[对话框语音修复] 重新初始化pendingAudioUrls数组');
            window.pendingAudioUrls = [];
        }
        
        // 确保其他必要变量存在
        if (typeof window.isProcessingAudio === 'undefined') {
            window.isProcessingAudio = false;
        }
        
        if (typeof window.totalAudioReceived === 'undefined') {
            window.totalAudioReceived = 0;
        }
        
        if (typeof window.totalAudioPlayed === 'undefined') {
            window.totalAudioPlayed = 0;
        }
        
        if (typeof window.currentPlayingAudio === 'undefined') {
            window.currentPlayingAudio = null;
        }
        
        if (typeof window.deletedFiles === 'undefined') {
            window.deletedFiles = new Set();
        }
        
        if (typeof window.currentConversationRoundId === 'undefined') {
            window.currentConversationRoundId = 'round_' + Date.now();
        }
        
        console.log('[对话框语音修复] 音频处理变量初始化完成');
    }
    
    // 降级的简单TTS实现
    function simpleTTS(message, repeatCount = 1) {
        console.log('[对话框语音修复] 使用简单TTS:', message);
        
        if ('speechSynthesis' in window) {
            for (let i = 0; i < repeatCount; i++) {
                setTimeout(function() {
                    const utterance = new SpeechSynthesisUtterance(message);
                    utterance.lang = 'zh-CN';
                    window.speechSynthesis.speak(utterance);
                }, i * 1500); // 每次播放间隔1.5秒
            }
        } else {
            console.error('[对话框语音修复] 浏览器不支持语音合成API');
            // 显示消息通知
            alert(message);
        }
    }
    
    // 测试恢复后的语音功能
    function testAudioFunctionality() {
        console.log('[对话框语音修复] 测试语音播放功能');
        
        // 检查核心函数是否可用
        const coreFunctionsAvailable = 
            typeof window.speakMessage === 'function' &&
            typeof window.handleAudioEvent === 'function';
            
        if (coreFunctionsAvailable) {
            console.log('[对话框语音修复] 核心语音函数可用，修复成功');
        } else {
            console.error('[对话框语音修复] 语音函数恢复失败，部分功能可能不可用');
        }
        
        // 添加测试接口供开发者使用
        window.testDialogAudio = function() {
            if (typeof window.speakMessage === 'function') {
                window.speakMessage('对话框语音播放测试，如果您听到这句话，说明修复成功', 1);
                return true;
            }
            return false;
        };
        
        // 添加模拟音频数据测试函数
        window.testAudioEvent = function() {
            if (typeof window.handleAudioEvent === 'function') {
                // 模拟一个有效的音频事件数据
                const testData = {
                    url: '/audio/tts_' + Date.now() + '.mp3',
                    text: '这是一个测试音频事件',
                    isFinal: true,
                    roundId: window.currentConversationRoundId || ('round_' + Date.now())
                };
                
                console.log('[对话框语音修复] 测试音频事件处理:', testData);
                window.handleAudioEvent(testData);
                return true;
            }
            return false;
        };
    }
    
    // 在页面关闭前执行清理
    window.addEventListener('beforeunload', function() {
        // 停止所有可能的语音合成
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
    });
    
    console.log('[对话框语音修复] 修复脚本初始化完成');
})(); 
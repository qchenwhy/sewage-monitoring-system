/**
 * 流式响应处理器
 * 用于处理服务器端流式响应，实现打字机效果和流式语音合成
 */

// 安全初始化全局变量，避免重复声明
// 使用IIFE保护作用域
(function() {
    // 如果全局作用域中已有这些变量，使用已有的变量
    window.isStreamingResponse = window.isStreamingResponse || false; // 标记是否正在接收流式响应
    window.currentResponseReader = window.currentResponseReader || null; // 当前响应读取器
    window.currentBotMessageElement = window.currentBotMessageElement || null; // 当前机器人消息元素
    window.botMessage = window.botMessage || ""; // 当前累积的消息内容

    // 音频管理相关变量
    window.audioQueue = window.audioQueue || []; // 音频队列，存储待播放的音频
    window.isAudioPlaying = window.isAudioPlaying || false; // 是否有音频正在播放
    window.lastSynthesizedText = window.lastSynthesizedText || ""; // 上次已合成的文本
    window.audioContext = window.audioContext || null; // 音频上下文
    window.pendingSynthesisSegments = window.pendingSynthesisSegments || []; // 待合成的文本片段队列
    window.isSynthesizing = window.isSynthesizing || false; // 是否正在合成中
    window.processedAudioUrls = window.processedAudioUrls || new Set(); // 新增：已处理的音频URL集合，避免重复处理
    window.currentConversationRoundId = window.currentConversationRoundId || 'round_' + Date.now(); // 新增：当前对话轮次ID
    
    // 添加handleCommandMessage函数的实现
    if (typeof window.handleCommandMessage === 'undefined') {
        window.handleCommandMessage = function(message) {
            // 简单的命令检查逻辑
            console.log('检查是否是命令消息:', message);
            
            // 如果是以斜杠开头的命令，如"/help"
            if (message && message.trim().startsWith('/')) {
                const command = message.trim().substring(1).toLowerCase();
                console.log('检测到命令:', command);
                
                // 处理一些基本命令
                switch (command) {
                    case 'help':
                        console.log('显示帮助信息');
                        // 如果有addMessage函数则使用
                        if (typeof window.addMessage === 'function') {
                            window.addMessage('可用命令：\n/help - 显示帮助信息\n/clear - 清除聊天记录', 'bot');
                        }
                        return true;
                    case 'clear':
                        console.log('清除聊天记录');
                        // 清空聊天区域
                        const chatMessages = document.getElementById('chatMessages');
                        if (chatMessages) {
                            chatMessages.innerHTML = '';
                            if (typeof window.addMessage === 'function') {
                                window.addMessage('聊天记录已清除', 'bot');
                            }
                        }
                        return true;
                    default:
                        console.log('未知命令:', command);
                        if (typeof window.addMessage === 'function') {
                            window.addMessage(`未知命令: ${command}`, 'bot');
                        }
                        return true;
                }
            }
            
            // 不是命令，返回false继续正常处理
            return false;
        };
    }
})();

/**
 * 打字机效果显示文本
 * @param {HTMLElement} element 要显示文本的DOM元素
 * @param {string} content 完整内容
 * @param {number} startIndex 起始索引
 */
function typewriterEffect(element, content, startIndex = 0) {
    if (!element) return;
    
    // 创建文本元素（如果不存在）
    let textEl = element.querySelector(".message-text");
    if (!textEl) {
        textEl = document.createElement("div");
        textEl.className = "message-text";
        element.appendChild(textEl);
    }
    
    // 如果是初始状态，清空文本
    if (startIndex === 0) {
        textEl.textContent = "";
    }
    
    // 显示到当前索引的文本
    textEl.textContent = content.substring(0, startIndex);
    
    // 如果还有字符要显示，继续打字效果
    if (startIndex < content.length) {
        // 根据文本语言和标点符号动态调整打字速度
        let speed = 20; // 基础速度，毫秒/字符
        
        // 如果当前字符是标点符号，稍微延长显示时间
        const currentChar = content.charAt(startIndex);
        if ("，。！？；：,.!?;:".includes(currentChar)) {
            speed = 80; // 标点符号处停顿略长
        }
        
        // 继续显示下一个字符
        setTimeout(() => {
            typewriterEffect(element, content, startIndex + 1);
        }, speed);
    }
    
    // 确保滚动到最新消息
    const chatMessages = document.getElementById("chatMessages");
    if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

/**
 * 智能分段文本
 * 根据标点符号和语义边界进行分段，确保分段长度适中
 * @param {string} text 要分割的文本
 * @returns {Array<string>} 分段后的文本数组
 */
function intelligentTextSegmentation(text) {
    if (!text || text.length === 0) return [];
    
    // 定义标点符号类型
    const endPunctuations = ["。", "！", "？", ".", "!", "?"]; // 句末标点
    const midPunctuations = ["；", "，", "、", "：", ";", ",", ":", "、"]; // 句中标点
    
    // 长度配置
    const minLength = 15;   // 最小分段长度
    const idealLength = 50; // 理想分段长度
    const maxLength = 100;  // 最大分段长度
    
    const segments = [];
    let currentSegment = "";
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        currentSegment += char;
        
        // 分段条件判断
        const isEndPunctuation = endPunctuations.includes(char);
        const isMidPunctuation = midPunctuations.includes(char);
        
        // 分段策略：
        // 1. 句号等结束标点，且长度超过最小值，必定分段
        // 2. 逗号等中间标点，且长度超过理想值，进行分段
        // 3. 无标点但长度超过最大值，强制分段
        if ((isEndPunctuation && currentSegment.length >= minLength) || 
            (isMidPunctuation && currentSegment.length >= idealLength) ||
            (currentSegment.length >= maxLength)) {
            segments.push(currentSegment);
            currentSegment = "";
        }
    }
    
    // 处理剩余文本
    if (currentSegment.length > 0) {
        // 如果剩余文本很短且有前一个段落，合并到最后一个段落
        if (segments.length > 0 && currentSegment.length < minLength / 2) {
            segments[segments.length - 1] += currentSegment;
        } else {
            segments.push(currentSegment);
        }
    }
    
    // 空文本检查
    if (segments.length === 0 && text.length > 0) {
        segments.push(text);
    }
    
    return segments;
}

/**
 * 检查文本片段是否已合成
 * 避免重复合成相同文本
 * @param {string} text 待检查的文本片段
 * @returns {boolean} 是否已合成过
 */
function isTextAlreadySynthesized(text) {
    // 检查新文本是否是上次已合成文本的一部分
    if (lastSynthesizedText && lastSynthesizedText.includes(text)) {
        console.log(`文本 "${text.substring(0, 20)}..." 已经合成过，跳过`);
        return true;
    }
    return false;
}

/**
 * 尝试确定文本在序列中的位置
 * 根据文本内容特征判断该片段可能的顺序位置
 * @param {string} text 文本内容
 * @returns {number} 顺序指标
 */
function determineTextSequenceOrder(text) {
    if (!text) return 999; // 无效文本排在最后
    
    const lowerText = text.toLowerCase();
    
    // 开场白、自我介绍在最前面
    if (lowerText.startsWith('我是') || lowerText.startsWith('这里是') || 
        lowerText.includes('欢迎') || lowerText.includes('您好')) {
        return 10;
    }
    
    // 问题放在前面部分
    if (lowerText.includes('请问') || lowerText.includes('吗？') || 
        lowerText.includes('您可以') || lowerText.includes('能否') ||
        lowerText.includes('需要') || lowerText.includes('想要了解')) {
        return 20; // 修改：将问题部分提前到第二位
    }
    
    // 示例内容段落
    if (lowerText.includes('例如') || lowerText.includes('比如') || 
        lowerText.includes('类似') || lowerText.includes('举例')) {
        return 30;
    }
    
    // 具体示例项目，按原始顺序
    if (lowerText.includes('- ') || lowerText.includes('•')) {
        // 根据示例序号提取序号
        const match = text.match(/(\d+)\./);
        if (match) {
            return 40 + parseInt(match[1]);
        }
        return 40;
    }
    
    // 请求用户输入信息排在中间偏后
    if (lowerText.includes('请告诉我') || lowerText.includes('需要您提供')) {
        return 50;
    }
    
    // 总结性内容放在最后
    if (lowerText.includes('这样我可以') || lowerText.includes('希望能帮到您') || 
        lowerText.includes('期待您的') || lowerText.includes('谢谢')) {
        return 80;
    }
    
    // 默认排序值
    return 60;
}

/**
 * 处理音频播放队列
 * 确保按顺序播放合成的音频
 */
function processAudioQueue() {
    // 检查是否有音频正在播放或队列为空
    if (isAudioPlaying || audioQueue.length === 0) {
        return;
    }
    
    // 再次排序确保顺序一致
    sortAudioQueue();
    
    // 再次检查队列是否为空（可能在排序和过滤后变为空）
    if (audioQueue.length === 0) {
        console.log("排序后音频队列为空，无需播放");
        return;
    }
    
    // 取出队首音频
    const audioItem = audioQueue.shift();
    
    // 进行全面验证
    if (!audioItem || !audioItem.url) {
        console.error("无效的音频项，跳过播放");
        setTimeout(processAudioQueue, 10);
        return;
    }
    
    // 额外检查是否属于当前轮次
    const currentRoundId = window.currentConversationRoundId;
    if (!currentRoundId) {
        console.warn("当前轮次ID缺失，创建新轮次ID");
        window.currentConversationRoundId = 'round_' + Date.now();
    }
    
    // 强化轮次检查
    if (audioItem.roundId !== window.currentConversationRoundId) {
        // 比较去掉前缀后的实际ID值
        const itemIdWithoutPrefix = audioItem.roundId.replace('round_', '');
        const currentIdWithoutPrefix = window.currentConversationRoundId.replace('round_', '');
        
        if (itemIdWithoutPrefix === currentIdWithoutPrefix) {
            console.log(`轮次ID匹配(忽略前缀): ${audioItem.roundId} ≈ ${window.currentConversationRoundId}`);
        } else {
            console.log(`跳过非当前轮次(${window.currentConversationRoundId})的音频: ${audioItem.roundId}, URL: ${audioItem.url.substring(0, 50)}`);
            // 递归处理下一个
            setTimeout(processAudioQueue, 10);
            return;
        }
    }
    
    // 检查URL中是否包含轮次ID，并与当前轮次比较
    if (audioItem.url.includes('_round_')) {
        const urlRoundMatch = audioItem.url.match(/_round_([^.]+)/);
        if (urlRoundMatch) {
            const urlIdWithoutPrefix = urlRoundMatch[1].replace('round_', '');
            const currentIdWithoutPrefix = window.currentConversationRoundId.replace('round_', '');
            
            if (urlIdWithoutPrefix !== currentIdWithoutPrefix) {
                console.log(`URL中轮次ID(${urlRoundMatch[1]})与当前轮次(${window.currentConversationRoundId})不匹配，跳过: ${audioItem.url.substring(0, 50)}`);
                setTimeout(processAudioQueue, 10);
                return;
            } else {
                console.log(`URL中轮次ID(${urlRoundMatch[1]})与当前轮次(${window.currentConversationRoundId})匹配(忽略前缀)`);
            }
        }
    }
    
    // 标记为正在播放状态
    isAudioPlaying = true;
    
    // 创建新的音频元素
    const audio = new Audio();
    
    // 添加轮次ID属性用于后续检查
    audio.dataset.roundId = audioItem.roundId;
    audio.dataset.audioUrl = audioItem.url;
    audio.dataset.timestamp = audioItem.timestamp;
    
    // 记录当前播放的音频信息
    console.log(`开始播放音频片段: "${audioItem.text ? audioItem.text.substring(0, 20) + '...' : '无文本'}", 时间戳: ${audioItem.timestamp}, 顺序: ${audioItem.order}, 轮次ID: ${audioItem.roundId}`);
    
    // 监听音频播放结束事件
    audio.addEventListener('ended', () => {
        console.log(`音频片段播放结束: "${audioItem.text ? audioItem.text.substring(0, 20) + '...' : '无文本'}"`);
        isAudioPlaying = false;
        
        // 更新最后合成的文本
        if (audioItem.text) {
            lastSynthesizedText += audioItem.text;
        }
        
        // 清理资源，避免内存泄漏
        audio.src = '';
        audio.removeAttribute('src');
        
        // 检查轮次是否变更
        if (audioItem.roundId !== window.currentConversationRoundId) {
            console.log(`轮次已变更，停止播放队列，当前: ${window.currentConversationRoundId}, 音频: ${audioItem.roundId}`);
            return;
        }
        
        // 如果可能，从DOM中移除
        if (audio.parentNode) {
            audio.parentNode.removeChild(audio);
        }
        
        // 现在播放完成后才添加到已处理集合
        if (window.processedAudioUrls) {
            window.processedAudioUrls.add(audioItem.url);
            console.log(`音频播放完成，添加到已处理集合: ${audioItem.url.substring(0, 50)}`);
        }
        
        // 播放队列中的下一个音频
        setTimeout(processAudioQueue, 50);
    });
    
    // 监听播放错误
    audio.addEventListener('error', (e) => {
        console.error(`音频播放错误:`, e);
        isAudioPlaying = false;
        
        // 记录详细错误信息
        let errorDetails = "未知错误";
        if (e.target && e.target.error) {
            // MediaError 对象包含详细错误信息
            const mediaError = e.target.error;
            const errorCodes = {
                1: "MEDIA_ERR_ABORTED - 用户中止获取媒体过程",
                2: "MEDIA_ERR_NETWORK - 网络错误",
                3: "MEDIA_ERR_DECODE - 解码错误",
                4: "MEDIA_ERR_SRC_NOT_SUPPORTED - 不支持的媒体格式"
            };
            errorDetails = errorCodes[mediaError.code] || `错误代码: ${mediaError.code}`;
            if (mediaError.message) {
                errorDetails += `, 消息: ${mediaError.message}`;
            }
        }
        console.error(`详细错误: ${errorDetails}, URL: ${audioItem.url}`);
        
        // 尝试释放资源
        try {
            audio.src = '';
            audio.removeAttribute('src');
            audio.load();
            
            // 如果可能，从DOM中移除
            if (audio.parentNode) {
                audio.parentNode.removeChild(audio);
            }
        } catch (cleanupError) {
            console.warn("清理音频资源失败:", cleanupError);
        }
        
        // 继续处理队列中的下一个
        setTimeout(processAudioQueue, 50);
    });
    
    // 添加到DOM以便控制和防止被垃圾回收
    audio.style.display = 'none'; // 隐藏元素但保持功能
    document.body.appendChild(audio);
    
    // 开始加载音频
    try {
        audio.src = audioItem.url;
        
        // 开始播放
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.error('音频播放失败:', error);
                isAudioPlaying = false;
                
                // 如果可能，从DOM中移除
                if (audio.parentNode) {
                    audio.parentNode.removeChild(audio);
                }
                
                setTimeout(processAudioQueue, 50);
            });
        }
    } catch (error) {
        console.error("音频加载或播放时出错:", error);
        isAudioPlaying = false;
        
        // 如果可能，从DOM中移除
        if (audio.parentNode) {
            audio.parentNode.removeChild(audio);
        }
        
        setTimeout(processAudioQueue, 50);
    }
}

/**
 * 清理并重置音频相关状态
 * 生成新的对话轮次ID
 */
function resetAudioState() {
    // 记录旧的轮次ID用于日志
    const oldRoundId = window.currentConversationRoundId || 'none';
    
    // 生成新的对话轮次ID - 直接使用时间戳，不添加前缀
    window.currentConversationRoundId = Date.now().toString();
    
    console.log(`音频状态重置: 新轮次ID=${window.currentConversationRoundId}, 旧轮次ID=${oldRoundId}`);
    
    // 停止所有音频播放
    stopAllAudio();
    
    // 强制清理额外的音频元素 - 更彻底的清理
    try {
        // 查找所有音频元素
        document.querySelectorAll('audio').forEach(audio => {
            try {
                // 停止播放
                if (!audio.paused) {
                    audio.pause();
                }
                audio.currentTime = 0;
                
                // 移除所有事件监听器
                audio.onended = null;
                audio.onerror = null;
                audio.onplaying = null;
                audio.onpause = null;
                
                // 清空源
                audio.src = '';
                audio.removeAttribute('src');
                audio.load();
                
                // 如果有轮次ID属性，记录它
                if (audio.dataset && audio.dataset.roundId) {
                    console.log(`清理轮次${audio.dataset.roundId}的音频元素`);
                }
                
                // 如果可能，从DOM中移除
                if (audio.parentNode) {
                    audio.parentNode.removeChild(audio);
                }
            } catch (e) {
                console.error('清理单个音频元素时出错:', e);
            }
        });
    } catch (e) {
        console.error('清理所有音频元素时出错:', e);
    }
    
    // 清空音频队列
    if (window.audioQueue) {
        const queueLength = window.audioQueue.length;
        window.audioQueue = [];
        console.log(`清空音频队列，之前有${queueLength}个项目`);
    }
    
    // 清空已处理URL集合
    if (window.processedAudioUrls) {
        const urlsCount = window.processedAudioUrls.size;
        window.processedAudioUrls.clear();
        console.log(`清空已处理URL集合，之前有${urlsCount}个URL`);
    }
    
    // 清空文本合成状态
    window.lastSynthesizedText = "";
    window.pendingSynthesisSegments = [];
    window.isSynthesizing = false;
    
    // 重置全局播放状态
    isAudioPlaying = false;
    
    // 返回新的轮次ID，以便其他地方使用
    return window.currentConversationRoundId;
}

/**
 * 停止所有音频播放
 */
function stopAllAudio() {
    console.log('正在停止所有音频播放...');
    
    // 清空音频队列
    const queueLength = audioQueue ? audioQueue.length : 0;
    audioQueue = [];
    
    // 重置播放状态
    isAudioPlaying = false;
    
    // 尝试使用Web Audio API停止所有声音
    try {
        if (window.audioContext) {
            // 如果有音频上下文，尝试关闭它
            if (window.audioContext.state !== 'closed') {
                window.audioContext.suspend();
                console.log('已暂停Web Audio上下文');
            }
        }
    } catch (e) {
        console.warn('停止Web Audio上下文时出错:', e);
    }
    
    // 停止所有活动的Audio元素
    let stoppedCount = 0;
    try {
        document.querySelectorAll('audio').forEach(audio => {
            try {
                // 记录轮次ID信息（如果有）
                const roundId = audio.dataset && audio.dataset.roundId;
                const audioUrl = audio.dataset && audio.dataset.audioUrl;
                
                if (roundId) {
                    console.log(`停止轮次${roundId}的音频元素，URL: ${audioUrl || '未知'}`);
                }
                
                // 停止播放
                if (!audio.paused) {
                    audio.pause();
                    stoppedCount++;
                }
                
                // 移除所有事件监听器
                audio.onended = null;
                audio.onerror = null;
                audio.onplaying = null;
                audio.onpause = null;
                
                // 清空源以释放资源
                audio.currentTime = 0;
                audio.src = '';
                audio.removeAttribute('src');
                audio.load();
                
                // 尝试从DOM中移除元素
                if (audio.parentNode) {
                    audio.parentNode.removeChild(audio);
                }
            } catch (error) {
                console.warn('停止单个音频元素时出错:', error);
            }
        });
    } catch (error) {
        console.warn('停止音频元素时出错:', error);
    }
    
    // 清空已处理的URL集合，允许重新播放
    const processedUrlsCount = window.processedAudioUrls ? window.processedAudioUrls.size : 0;
    if (window.processedAudioUrls) {
        window.processedAudioUrls.clear();
    }
    
    // 清除所有可能的音频相关定时器
    try {
        // 查找可能的音频定时器
        const timers = window.audioTimers || [];
        if (Array.isArray(timers) && timers.length > 0) {
            timers.forEach(timer => {
                if (timer) {
                    clearTimeout(timer);
                }
            });
            window.audioTimers = [];
            console.log(`已清除${timers.length}个音频定时器`);
        }
    } catch (e) {
        console.warn('清除音频定时器时出错:', e);
    }
    
    console.log(`已停止所有音频播放: 清空队列(${queueLength}项), 停止${stoppedCount}个活动音频, 清除${processedUrlsCount}个已处理URL`);
}

/**
 * 对音频队列进行排序
 * 使用复合条件确保正确顺序
 */
function sortAudioQueue() {
    // 首先过滤掉不属于当前轮次的音频
    const currentRoundId = window.currentConversationRoundId;
    const originalLength = audioQueue.length;
    
    // 确保当前轮次ID有效
    if (!currentRoundId) {
        console.warn('当前轮次ID无效，生成新的轮次ID');
        window.currentConversationRoundId = 'round_' + Date.now();
    }
    
    // 更严格的轮次过滤
    audioQueue = audioQueue.filter(item => {
        // 基本有效性检查
        if (!item || !item.url) {
            console.log(`过滤无效音频项`);
            return false;
        }
        
        // 严格的轮次ID匹配检查
        if (!item.roundId) {
            console.log(`过滤缺少轮次ID的音频项`);
            return false;
        }
        
        // 移除前缀后比较实际ID值
        const itemIdWithoutPrefix = item.roundId.replace('round_', '');
        const currentIdWithoutPrefix = currentRoundId.replace('round_', '');
        
        if (itemIdWithoutPrefix !== currentIdWithoutPrefix) {
            console.log(`过滤非当前轮次的音频: ${item.roundId} (值: ${itemIdWithoutPrefix}) ≠ ${currentRoundId} (值: ${currentIdWithoutPrefix})`);
            return false;
        }
        
        // 检查URL是否包含轮次信息且与当前轮次不符
        if (item.url.includes('_round_')) {
            const urlRoundMatch = item.url.match(/_round_([^.]+)/);
            if (urlRoundMatch) {
                const urlRoundId = urlRoundMatch[1].replace('round_', '');
                if (urlRoundId !== currentIdWithoutPrefix) {
                    console.log(`URL中轮次ID(${urlRoundMatch[1]})与当前轮次(${currentRoundId})不匹配，过滤: ${item.url.substring(0, 50)}`);
                    return false;
                }
            }
        }
        
        return true;
    });
    
    const afterFilterLength = audioQueue.length;
    if (originalLength !== afterFilterLength) {
        console.log(`轮次过滤: 从${originalLength}项减少到${afterFilterLength}项`);
    }
    
    // 过滤重复项 - 使用多种标准检测重复
    const uniqueUrls = new Set();
    const uniqueTexts = new Set();
    const uniqueTextFirstWords = new Set(); // 用于检测内容相似的项
    const uniqueItems = [];
    
    for (let i = 0; i < audioQueue.length; i++) {
        const item = audioQueue[i];
        
        // 如果URL已存在，跳过
        if (uniqueUrls.has(item.url)) {
            console.log(`检测到重复URL，跳过: "${item.url.substring(0, 30)}..."`);
            continue;
        }
        
        // 如果完全一致的文本已存在，跳过
        if (item.text && uniqueTexts.has(item.text)) {
            console.log(`检测到重复文本，跳过: "${item.text.substring(0, 20)}..."`);
            continue;
        }
        
        // 检查内容相似度 - 提取前5个词
        if (item.text) {
            const firstWords = item.text.split(' ').slice(0, 5).join(' ').toLowerCase();
            if (firstWords.length > 10 && uniqueTextFirstWords.has(firstWords)) {
                console.log(`检测到相似内容，跳过: "${item.text.substring(0, 20)}..."`);
                continue;
            }
            uniqueTextFirstWords.add(firstWords);
        }
        
        // 添加到已处理集合
        uniqueUrls.add(item.url);
        if (item.text) {
            uniqueTexts.add(item.text);
        }
        uniqueItems.push(item);
    }
    
    // 更新队列为去重后的结果
    const afterDedupeLength = uniqueItems.length;
    if (afterFilterLength !== afterDedupeLength) {
        console.log(`重复项过滤: 从${afterFilterLength}项减少到${afterDedupeLength}项`);
    }
    audioQueue = uniqueItems;
    
    // 确保每个项目都有有效的顺序值
    audioQueue.forEach(item => {
        if (item.order === undefined) {
            item.order = determineTextSequenceOrder(item.text);
        }
    });
    
    // 首先按内容类型排序优先级排序，时间戳作为次要因素
    audioQueue.sort((a, b) => {
        // 首先按照内容的类型排序
        const orderDiff = a.order - b.order;
        
        // 如果顺序类别相差较大，直接按顺序类别排序
        if (Math.abs(orderDiff) > 2) {
            return orderDiff;
        }
        
        // 同一顺序类别内或相近类别，在原始数据中先生成的应该先播放
        // 注意：较小时间戳表示先生成的内容
        return a.timestamp - b.timestamp;
    });
    
    // 打印排序结果
    if (audioQueue.length > 1) {
        console.log(`排序后音频队列(${audioQueue.length}项):`);
        audioQueue.forEach((item, index) => {
            console.log(`#${index+1}: 顺序: ${item.order}, 时间戳: ${item.timestamp}, 轮次: ${item.roundId || '未知'}, 内容: "${item.text ? item.text.substring(0, 15) + '...' : '无文本'}"`);
        });
    } else if (audioQueue.length === 1) {
        console.log(`排序后音频队列只有1项: 顺序=${audioQueue[0].order}, 时间戳=${audioQueue[0].timestamp}, 内容="${audioQueue[0].text ? audioQueue[0].text.substring(0, 15) + '...' : '无文本'}"`);
    } else {
        console.log(`排序后音频队列为空`);
    }
}

/**
 * 添加音频到播放队列
 * @param {string} url 音频URL
 * @param {string} text 对应的文本内容
 * @param {number} customTimestamp 自定义时间戳
 * @param {string} roundId 对话轮次ID
 */
function addAudioToQueue(url, text, customTimestamp = null, roundId = null) {
    // 检查URL有效性
    if (!url || typeof url !== 'string' || url.trim() === '') {
        console.error('无效的音频URL，跳过添加到队列');
        return;
    }
    
    // 使用传入的轮次ID或当前轮次ID
    const currentRoundId = roundId || window.currentConversationRoundId || ('round_' + Date.now());
    
    // 检查这个轮次是否已经被服务端处理过，如果是则跳过客户端处理
    if (window.processedRounds && window.processedRounds.has(currentRoundId)) {
        console.log(`轮次 ${currentRoundId} 已被服务端处理，仅播放服务端生成的音频`);
        
        // 检查URL中是否包含serverGenerated标记
        const isServerGenerated = url.includes('server') || 
                                  (typeof text === 'string' && text.includes('server'));
        
        if (!isServerGenerated) {
            console.log(`跳过非服务端生成的音频: ${url.substring(0, 50)}...`);
            return;
        }
    }
    
    // 如果不是当前轮次，直接跳过
    if (currentRoundId !== window.currentConversationRoundId) {
        // 比较去掉前缀后的实际ID值
        const itemIdWithoutPrefix = currentRoundId.replace('round_', '');
        const globalIdWithoutPrefix = window.currentConversationRoundId.replace('round_', '');
        
        if (itemIdWithoutPrefix === globalIdWithoutPrefix) {
            console.log(`音频轮次ID匹配(忽略前缀): ${currentRoundId} ≈ ${window.currentConversationRoundId}`);
        } else {
            console.log(`音频不属于当前轮次(${window.currentConversationRoundId})，跳过: ${currentRoundId}`);
            return;
        }
    }
    
    // 检查URL是否已在处理集合中 - 使用警告但不阻止添加
    if (window.processedAudioUrls && window.processedAudioUrls.has(url)) {
        // 不再发出警告，因为我们在播放完成时才添加到processedAudioUrls，此处判断没有意义
        // 未来可能添加其他逻辑
    }
    
    // 检查URL中是否包含其他轮次的ID
    if (url.includes('_round_')) {
        const urlRoundMatch = url.match(/_round_([^.]+)/);
        if (urlRoundMatch) {
            const urlIdWithoutPrefix = urlRoundMatch[1].replace('round_', '');
            const currentIdWithoutPrefix = currentRoundId.replace('round_', '');
            
            if (urlIdWithoutPrefix !== currentIdWithoutPrefix) {
                console.log(`URL中轮次ID(${urlRoundMatch[1]})与当前轮次(${currentRoundId})不匹配，跳过`);
                return;
            } else {
                console.log(`URL中轮次ID(${urlRoundMatch[1]})与当前轮次(${currentRoundId})匹配(忽略前缀)`);
            }
        }
    }
    
    // 从URL中提取时间戳作为排序依据
    let timestamp = customTimestamp || Date.now(); // 优先使用传入的时间戳
    
    // 如果没有自定义时间戳，尝试从URL中提取
    if (!customTimestamp) {
        const match = url.match(/tts_(\d+)(?:_round_[^.]+)?\.mp3$/);
        if (match) {
            timestamp = parseInt(match[1]);
        }
    }
    
    // 处理文本
    const safeText = text || ""; // 确保文本不为null
    
    // 使用文本内容辅助确定顺序
    const order = determineTextSequenceOrder(safeText);
    
    // 对文本进行预处理，移除多余空格便于日志显示
    const displayText = safeText.replace(/\s+/g, ' ').trim();
    
    // 添加到队列，包含时间戳、顺序信息和轮次ID
    audioQueue.push({ 
        url, 
        text: displayText, 
        timestamp, 
        order,
        roundId: currentRoundId 
    });
    
    console.log(`添加音频到队列: "${displayText.substring(0, 20)}...", 时间戳: ${timestamp}, 顺序: ${order}, 轮次ID: ${currentRoundId}`);
    
    // 按照复合条件排序
    sortAudioQueue();
    
    // 如果当前没有音频播放，开始处理队列
    if (!isAudioPlaying) {
        processAudioQueue();
    }
}

/**
 * 处理待合成队列
 * 按顺序处理待合成文本段落
 * @param {Function} requestSpeechFn 请求语音合成的函数
 * @param {string} roundId 当前对话轮次ID
 */
async function processSynthesisQueue(requestSpeechFn, roundId = null) {
    if (isSynthesizing || pendingSynthesisSegments.length === 0) {
        return;
    }
    
    // 使用当前轮次ID或全局轮次ID
    const currentRoundId = roundId || window.currentConversationRoundId;
    
    isSynthesizing = true;
    const segment = pendingSynthesisSegments.shift();
    
    try {
        // 检查是否已合成
        if (!isTextAlreadySynthesized(segment)) {
            console.log(`请求合成文本片段: "${segment.substring(0, 20)}...", 轮次ID: ${currentRoundId}`);
            // 传递true表示这是分段合成，同时传递当前轮次ID和时间戳
            const timestamp = Date.now();
            await requestSpeechFn(segment, true, timestamp, currentRoundId);
        }
    } catch (error) {
        console.error('语音合成失败:', error);
    } finally {
        isSynthesizing = false;
        
        // 处理队列中的下一个
        if (pendingSynthesisSegments.length > 0) {
            setTimeout(() => processSynthesisQueue(requestSpeechFn, currentRoundId), 100);
        }
    }
}

/**
 * 处理服务器流式响应
 * @param {Response} response 服务器响应对象
 * @param {Function} addMessageFn 添加消息的函数
 * @param {Function} requestSpeechFn 请求语音合成的函数
 * @param {HTMLElement} typingIndicator 输入指示器元素
 */
function handleStreamingResponse(response, addMessageFn, requestSpeechFn, typingIndicator) {
    if (!response || !response.body) {
        console.error("响应没有可读流");
        return;
    }
    
    // 标记为正在接收流式响应
    isStreamingResponse = true;
    
    // 重置音频相关状态并获取新的轮次ID
    const currentRoundId = resetAudioState();
    
    // 清空现有的响应文本
    botMessage = "";
    
    // 创建一个新的消息元素
    const messageEl = addMessageFn("", "bot");
    
    // 保存消息元素到全局变量，以便在需要时移除
    currentBotMessageElement = messageEl;
    
    // 隐藏输入指示器
    if (typingIndicator) {
        typingIndicator.style.display = "none";
    }
    
    // 处理数据流
    const reader = response.body.getReader();
    currentResponseReader = reader;
    
    // 用于累积部分解析的JSON数据
    let partialJSON = "";
    
    // 当前文本缓冲区，累积完整句子
    let textBuffer = "";
    
    // 文本累积计时器
    let bufferTimer = null;
    
    // 递归读取数据流
    function readStream() {
        reader.read().then(({ value, done }) => {
            if (done) {
                console.log("流式响应接收完成");
                isStreamingResponse = false;
                
                // 处理剩余的文本缓冲区
                if (textBuffer.length > 0) {
                    const remainingSegments = intelligentTextSegmentation(textBuffer);
                    console.log(`流结束，处理剩余文本: ${remainingSegments.length}个片段`);
                    
                    // 将剩余段落添加到合成队列
                    if (window.autoSpeakEnabled) {
                        remainingSegments.forEach(segment => {
                            if (!isTextAlreadySynthesized(segment)) {
                                pendingSynthesisSegments.push(segment);
                            }
                        });
                        
                        // 处理合成队列
                        processSynthesisQueue(requestSpeechFn, currentRoundId);
                    }
                    
                    // 清空缓冲区
                    textBuffer = "";
                }
                
                return;
            }
            
            // 将二进制数据转为文本
            const chunk = new TextDecoder().decode(value);
            
            // 分行处理接收到的数据
            const lines = chunk.split("\n").filter(line => line.trim() !== "");
            
            for (const line of lines) {
                // 处理SSE格式数据
                if (line.startsWith("data: ")) {
                    const data = line.substring(6);
                    
                    if (data === "[DONE]") {
                        console.log("收到流式响应结束标志");
                        continue;
                    }
                    
                    try {
                        // 尝试解析JSON数据
                        let parsedData;
                        try {
                            parsedData = JSON.parse(data);
                        } catch (e) {
                            // 如果解析出错，可能是JSON数据不完整，先累积起来
                            partialJSON += data;
                            try {
                                parsedData = JSON.parse(partialJSON);
                                // 解析成功后重置累积器
                                partialJSON = "";
                            } catch (e2) {
                                // 仍然不完整，等待更多数据
                                continue;
                            }
                        }
                        
                        // 处理已解析的数据
                        if (parsedData && (parsedData.event === "message" || parsedData.event === "text_update")) {
                            if (parsedData.answer !== undefined && typeof parsedData.answer === "string") {
                                // 计算新增的文本部分
                                const newText = parsedData.answer.substring(botMessage.length);
                                
                                // 只有当有新文本时才更新
                                if (newText.length > 0) {
                                    // 累加文本到全局变量
                                    botMessage = parsedData.answer;
                                    
                                    // 使用打字机效果更新显示
                                    typewriterEffect(messageEl, botMessage);
                                    
                                    // 添加新文本到缓冲区，但不立即处理
                                    textBuffer += newText;
                                    console.log("接收到新文本并更新界面，等待服务器的语音合成结果");

                                    /* 禁用客户端的语音合成逻辑
                                    // 如果设置了缓冲计时器，清除它
                                    if (bufferTimer) {
                                        clearTimeout(bufferTimer);
                                    }
                                    
                                    // 设置一个新的计时器，如果500ms内没有新文本，则处理当前缓冲区
                                    bufferTimer = setTimeout(() => {
                                        if (textBuffer.length > 0) {
                                            const segments = intelligentTextSegmentation(textBuffer);
                                            console.log(`文本缓冲区分段: ${segments.length}个片段`);
                                            
                                            // 将分段添加到合成队列
                                            if (window.autoSpeakEnabled) {
                                                segments.forEach(segment => {
                                                    if (!isTextAlreadySynthesized(segment)) {
                                                        pendingSynthesisSegments.push(segment);
                                                    }
                                                });
                                                
                                                // 处理合成队列
                                                processSynthesisQueue(requestSpeechFn, currentRoundId);
                                            }
                                            
                                            // 清空缓冲区
                                            textBuffer = "";
                                        }
                                    }, 500); // 等待500ms无新内容再处理
                                    */
                                }
                            }
                        } else if (parsedData && parsedData.event === "audio") {
                            // 处理服务器发来的音频事件
                            if (parsedData.url && parsedData.text) {
                                console.log('收到服务器音频事件:', JSON.stringify({
                                    url: parsedData.url,
                                    text: parsedData.text.substring(0, 30) + (parsedData.text.length > 30 ? '...' : ''),
                                    roundId: parsedData.roundId || '未指定',
                                    audioId: parsedData.audioId || '未指定',
                                    isFinal: parsedData.isFinal
                                }));
                                // 添加到音频队列，传递当前轮次ID
                                addAudioToQueue(parsedData.url, parsedData.text, null, currentRoundId);
                            }
                        } else if (parsedData && parsedData.event === "message_end") {
                            // 检查是否有serverProcessed标记，表示服务器已处理了语音合成
                            console.log('收到message_end事件:', JSON.stringify({
                                serverProcessed: parsedData.serverProcessed || false,
                                roundId: parsedData.roundId || '未指定',
                                processTime: parsedData.processTime || '未指定',
                                messageEndId: parsedData.messageEndId || '未指定'
                            }));
                            
                            if (parsedData.serverProcessed === true) {
                                console.log("检测到服务器已处理语音合成，跳过客户端合成");
                                // 彻底清除所有文本缓冲区和合成队列
                                textBuffer = "";
                                pendingSynthesisSegments = [];
                                
                                // 添加全局标记，防止同一轮次的其他处理
                                if (parsedData.roundId) {
                                    if (!window.processedRounds) {
                                        window.processedRounds = new Set();
                                    }
                                    window.processedRounds.add(parsedData.roundId);
                                    console.log(`已标记轮次 ${parsedData.roundId} 为服务端处理完成`);
                                }
                                
                                // 处理音频队列中的项目
                                processAudioQueue();
                            } else {
                                // 处理剩余的文本缓冲区
                                if (textBuffer.length > 0) {
                                    const remainingSegments = intelligentTextSegmentation(textBuffer);
                                    console.log(`流结束，处理剩余文本: ${remainingSegments.length}个片段`);
                                    
                                    // 将剩余段落添加到合成队列
                                    if (window.autoSpeakEnabled) {
                                        remainingSegments.forEach(segment => {
                                            if (!isTextAlreadySynthesized(segment)) {
                                                pendingSynthesisSegments.push(segment);
                                            }
                                        });
                                        
                                        // 处理合成队列
                                        processSynthesisQueue(requestSpeechFn, currentRoundId);
                                    }
                                    
                                    // 清空缓冲区
                                    textBuffer = "";
                                }
                            }
                        }
                    } catch (error) {
                        console.error("处理流式数据出错:", error);
                    }
                }
            }
            
            // 继续读取流
            readStream();
        }).catch(error => {
            console.error("读取流出错:", error);
            isStreamingResponse = false;
        });
    }
    
    // 开始读取流
    readStream();
}

/**
 * 停止当前流式响应
 */
function stopStreamingResponse() {
    if (isStreamingResponse) {
        try {
            // 尝试中止当前的响应读取器（如果存在）
            if (currentResponseReader && currentResponseReader.cancel) {
                currentResponseReader.cancel("用户中断");
                console.log("已中断当前响应流读取器");
            }
            
            // 停止所有音频播放
            stopAllAudio();
            
            // 移除当前的机器人消息DOM元素（如果正在显示）
            if (currentBotMessageElement) {
                console.log("移除未完成的机器人消息元素");
                if (currentBotMessageElement.parentNode) {
                    currentBotMessageElement.parentNode.removeChild(currentBotMessageElement);
                }
                currentBotMessageElement = null;
            }
            
            // 重置标志
            isStreamingResponse = false;
        } catch (error) {
            console.error("中断流式响应时出错:", error);
        }
    }
}

/**
 * 处理接收到的TTS结果
 * @param {Object} data TTS响应数据
 */
function handleTTSResponse(data) {
    if (data.success && data.audioUrl) {
        // 添加到音频队列进行顺序播放，使用当前轮次ID
        addAudioToQueue(data.audioUrl, data.text || "", null, window.currentConversationRoundId);
    } else {
        console.error('TTS处理失败:', data.error || '未知错误');
    }
}

// 导出函数以供其他脚本使用
window.StreamingHandler = {
    handleStreamingResponse,
    stopStreamingResponse,
    typewriterEffect,
    intelligentTextSegmentation,
    addAudioToQueue,
    stopAllAudio,
    handleTTSResponse,
    processAudioQueue,
    resetAudioState
}; 
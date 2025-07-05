/**
 * 告警处理补丁脚本
 * 用于确保只使用alarm-display.js中的告警处理功能，避免与页面中的重复函数冲突
 */
(function() {
    console.log('[告警补丁] 初始化告警补丁');
    
    // 等待短暂延迟，确保所有脚本都已加载
    setTimeout(function() {
        // 修复变量重复声明问题 - 检查全局作用域中的变量
        if (window.alarmMuted !== undefined) {
            console.log('[告警补丁] 检测到全局告警变量，不重复声明');
        }
        
        // 确保告警容器可见
        const alarmContainer = document.getElementById('alarmContainer');
        if (alarmContainer) {
            console.log('[告警补丁] 确保告警容器可见');
            alarmContainer.style.display = 'block';
        } else {
            console.error('[告警补丁] 找不到告警容器元素');
        }
        
        // 重置主JS文件中的重复声明变量
        window.mediaRecorder = window.mediaRecorder || null;
        window.isRecording = window.isRecording || false;
        window.conversationId = window.conversationId || '';
        window.userId = window.userId || '';
        window.sessionStartTime = window.sessionStartTime || Date.now();
        window.mediaSource = window.mediaSource || null;
        window.sourceBuffer = window.sourceBuffer || null;
        window.audioElement = window.audioElement || null;
        window.audioChunks = window.audioChunks || [];
        window.audioQueue = window.audioQueue || [];
        window.pendingAudioUrls = window.pendingAudioUrls || [];
        window.isAudioPlaying = window.isAudioPlaying || false;
        window.isProcessingAudio = window.isProcessingAudio || false;
        window.audioInitialized = window.audioInitialized || false;
        window.processedUrls = window.processedUrls || new Set();
        window.deletedFiles = window.deletedFiles || new Set();
        window.totalAudioReceived = window.totalAudioReceived || 0;
        window.totalAudioPlayed = window.totalAudioPlayed || 0;
        window.currentPlayingAudio = window.currentPlayingAudio || null;
        window.lastUserInteractionTime = window.lastUserInteractionTime || Date.now();
        
        console.log('[告警补丁] 变量修复完成');
    }, 500);
})(); 
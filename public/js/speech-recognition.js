/**
 * 语音识别模块 - 完整录音版本
 * 提供语音识别功能，完成录音后一次性发送到服务器进行识别
 */

// 全局变量
let mediaRecorder = null;      // 媒体录音器
let audioChunks = [];          // 音频数据块
let audioStream = null;        // 音频流
let audioTracks = null;        // 音频轨道
let isRecording = false;       // 是否正在录音
let recordingStartTime = 0;    // 录音开始时间
let userId = null;             // 用户ID

/**
 * 初始化语音识别模块
 * @param {Object} config 配置对象
 */
function initSpeechRecognition(config = {}) {
    console.log('初始化语音识别模块 - 完整录音版本');
    
    // 合并配置
    const defaultConfig = {
        recordButtonId: 'recordButton', 
        recordingStatusId: 'recordingStatus',
        inputBoxId: 'messageInput',
        userIdGetter: null     // 获取用户ID的函数
    };
    
    const cfg = {...defaultConfig, ...config};
    
    // 获取DOM元素
    const recordButton = document.getElementById(cfg.recordButtonId);
    const recordingStatus = document.getElementById(cfg.recordingStatusId);
    
    // 如果提供了用户ID获取函数，使用它
    if (typeof cfg.userIdGetter === 'function') {
        userId = cfg.userIdGetter();
    }
    
    // 更新录音按钮状态
    function updateRecordingButtonState(state) {
        console.log(`更新录音按钮状态: ${state}`);
        
        if (!recordButton) return;
        
        // 移除所有可能的类
        recordButton.classList.remove('recording', 'processing', 'error');
        
        // 根据状态设置相应的类和属性
        switch (state) {
            case 'idle':
                // 空闲状态
                recordButton.textContent = '录音';
                recordButton.disabled = false;
                recordButton.title = '开始录音';
                
                // 隐藏状态提示
                if (recordingStatus && 
                    (recordingStatus.textContent === '正在录音...' || 
                    recordingStatus.textContent.startsWith('正在录音... '))) {
                    recordingStatus.style.display = 'none';
                }
                break;
                
            case 'recording':
                // 录音中状态
                recordButton.classList.add('recording');
                recordButton.textContent = '停止';
                recordButton.disabled = false;
                recordButton.title = '停止录音';
                
                // 显示录音状态
                if (recordingStatus) {
                    recordingStatus.style.display = 'block';
                    recordingStatus.textContent = '正在录音...';
                }
                break;
                
            case 'processing':
                // 处理中状态
                recordButton.classList.add('processing');
                recordButton.textContent = '处理中...';
                recordButton.disabled = true;
                recordButton.title = '处理中...';
                
                // 显示处理状态
                if (recordingStatus) {
                    recordingStatus.style.display = 'block';
                    recordingStatus.textContent = '正在处理录音...';
                }
                break;
                
            case 'error':
                // 错误状态
                recordButton.classList.add('error');
                recordButton.textContent = '重试';
                recordButton.disabled = false;
                recordButton.title = '录音出错，点击重试';
                
                // 如果没有特定错误消息，显示通用消息
                if (recordingStatus && recordingStatus.textContent === '') {
                    recordingStatus.textContent = '录音出错，请重试';
                }
                
                if (recordingStatus) {
                    recordingStatus.style.display = 'block';
                }
                break;
            
            default:
                console.error(`未知的按钮状态: ${state}`);
                recordButton.textContent = '录音';
                recordButton.disabled = false;
                break;
        }
        
        // 日志当前状态
        console.log(`按钮状态已更新为: ${state}, 禁用状态: ${recordButton.disabled}, 文本: ${recordButton.textContent}`);
    }
    
    // 显示录音状态信息
    function showStatus(type, message) {
        console.log(`状态更新: [${type}] ${message}`);
        
        if (!recordingStatus) {
            console.error('录音状态元素未找到');
            return;
        }
        
        recordingStatus.textContent = message;
        recordingStatus.style.display = 'block';
        
        // 根据状态类型设置不同的样式
        recordingStatus.className = 'recording-status';
        switch (type) {
            case 'error':
                recordingStatus.classList.add('status-error');
                break;
            case 'success':
                recordingStatus.classList.add('status-success');
                // 成功状态1.5秒后自动隐藏
                setTimeout(() => {
                    if (recordingStatus.classList.contains('status-success')) {
                        recordingStatus.style.display = 'none';
                    }
                }, 1500);
                break;
            case 'info':
                recordingStatus.classList.add('status-info');
                break;
            case 'warning':
                recordingStatus.classList.add('status-warning');
                break;
            default:
                break;
        }
    }
    
    // 处理完整录音数据
    function processCompletedRecording() {
        console.log('开始处理完整录音数据');
        
        // 检查是否有录音数据
        if (!audioChunks || audioChunks.length === 0) {
            console.warn('没有录音数据可处理');
            showStatus('error', '没有检测到语音');
            updateRecordingButtonState('idle');
            return;
        }
        
        try {
            // 创建音频Blob
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            console.log(`完整音频数据大小: ${(audioBlob.size / 1024).toFixed(2)} KB`);
            
            // 检查音频大小
            if (audioBlob.size < 8192) { // 8KB
                console.warn('音频数据太小，可能没有录到声音');
                showStatus('error', '录音太短或没有声音');
                updateRecordingButtonState('idle');
                return;
            }
            
            // 创建FormData对象
            const formData = new FormData();
            formData.append('file', audioBlob, `recording_${Date.now()}.webm`);
            formData.append('user', userId || 'user-' + Date.now());
            formData.append('isPartial', 'false'); // 标记为完整音频
            
            showStatus('info', '正在识别完整语音...');
            
            // 标记AJAX识别请求正在处理中
            window.isProcessingAjaxRecognition = true;
            
            // 发送到服务器进行识别
            fetch('/api/speech-to-text', {
                method: 'POST',
                body: formData
            })
            .then(response => {
                if (!response.ok) {
                    console.error(`语音识别请求失败: ${response.status} ${response.statusText}`);
                    throw new Error(`语音识别请求失败: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('完整语音识别结果:', data);
                
                if (data.success && data.text) {
                    // 将识别结果添加到输入框
                    const inputBox = document.getElementById(cfg.inputBoxId);
                    if (inputBox) {
                        // 更新输入框文本
                        inputBox.value = data.text;
                        
                        // 将焦点设置到输入框末尾
                        inputBox.focus();
                        inputBox.setSelectionRange(inputBox.value.length, inputBox.value.length);
                    }
                    
                    showStatus('success', '语音识别成功，已添加到输入框');
                } else {
                    console.warn('语音识别没有返回文本');
                    showStatus('warning', '未能识别语音内容');
                }
                
                // 恢复按钮状态
                updateRecordingButtonState('idle');
            })
            .catch(error => {
                console.error('语音识别处理出错:', error);
                showStatus('error', `语音识别失败: ${error.message}`);
                updateRecordingButtonState('error');
                
                // 延迟后恢复按钮状态
                setTimeout(() => {
                    updateRecordingButtonState('idle');
                }, 2000);
            })
            .finally(() => {
                // 清空音频数据
                audioChunks = [];
                // 标记AJAX识别请求处理完成
                window.isProcessingAjaxRecognition = false;
            });
        } catch (error) {
            console.error('处理录音数据出错:', error);
            showStatus('error', `处理录音出错: ${error.message}`);
            updateRecordingButtonState('error');
            
            // 延迟后恢复按钮状态
            setTimeout(() => {
                updateRecordingButtonState('idle');
            }, 2000);
            
            // 清空音频数据
            audioChunks = [];
            // 确保状态重置
            window.isProcessingAjaxRecognition = false;
        }
    }
    
    // 开始录音
    async function startRecording() {
        console.log('开始录音');
        
        // 更新录音按钮状态
        updateRecordingButtonState('recording');
        
        try {
            // 重置音频块数组
            audioChunks = [];
            
            // 设置录音状态为true
            isRecording = true;
            
            // 获取媒体流
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 16000,
                    channelCount: 1 // 确保单声道
                }
            });
            
            console.log('获取到麦克风权限');
            
            // 保存媒体流和轨道
            audioStream = stream;
            audioTracks = stream.getAudioTracks();
            
            // 创建MediaRecorder实例，明确指定mime类型和比特率
            const options = {
                mimeType: 'audio/webm;codecs=opus',
                audioBitsPerSecond: 128000
            };
            
            // 如果不支持，尝试其他格式
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                console.warn(`${options.mimeType} 不支持，尝试备选格式`);
                options.mimeType = 'audio/webm';
            }
            
            console.log(`使用录音格式: ${options.mimeType}`);
            mediaRecorder = new MediaRecorder(stream, options);
            
            // 记录开始时间
            recordingStartTime = Date.now();
            
            // 设置数据可用事件处理器
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    console.log(`收集到音频块: ${(event.data.size / 1024).toFixed(2)} KB`);
                    audioChunks.push(event.data);
                }
            };
            
            // 设置停止事件处理器
            mediaRecorder.onstop = () => {
                console.log('MediaRecorder 停止');
                
                // 停止所有音频轨道
                if (audioTracks) {
                    audioTracks.forEach(track => {
                        if (track.readyState === 'live') {
                            track.stop();
                            console.log('音频轨道已停止');
                        }
                    });
                }
                
                // 检查录音时长
                const recordingDuration = Date.now() - recordingStartTime;
                console.log(`录音时长: ${(recordingDuration / 1000).toFixed(1)}秒`);
                
                if (recordingDuration < 500) { // 少于0.5秒
                    console.warn('录音时间太短，忽略处理');
                    showStatus('warning', '录音时间太短，请重试');
                    updateRecordingButtonState('idle');
                    return;
                }
                
                // 处理完整录音以获得最终结果
                showStatus('info', '完成录音，正在进行识别...');
                processCompletedRecording();
            };
            
            // 开始录音，不使用定时收集数据
            mediaRecorder.start();
            console.log(`录音已开始，将在停止时一次性收集数据`);
            
            showStatus('info', '录音中...');
        } catch (error) {
            console.error('启动录音时出错:', error);
            
            // 确保录音状态设置为false
            isRecording = false;
            
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                showStatus('error', '麦克风访问被拒绝，请检查浏览器权限设置');
            } else {
                showStatus('error', `启动录音出错: ${error.message}`);
            }
            
            updateRecordingButtonState('error');
            
            // 延迟后恢复按钮状态
            setTimeout(() => {
                updateRecordingButtonState('idle');
            }, 2000);
        }
    }
    
    // 停止录音
    function stopRecording() {
        console.log('停止录音');
        
        // 更新按钮状态
        updateRecordingButtonState('processing');
        
        // 设置录音状态为false
        isRecording = false;
        
        try {
            // 检查mediaRecorder是否存在和状态
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                console.log('停止MediaRecorder');
                mediaRecorder.stop();
            } else {
                console.warn('MediaRecorder不存在或不在录音状态');
                
                // 如果录音器不存在，直接处理结果
                if (audioChunks && audioChunks.length > 0) {
                    processCompletedRecording();
                } else {
                    updateRecordingButtonState('idle');
                    showStatus('error', '录音异常，请重试');
                }
            }
            
            // 停止所有音频轨道
            if (audioTracks) {
                audioTracks.forEach(track => {
                    if (track.readyState === 'live') {
                        track.stop();
                        console.log('音频轨道已停止');
                    }
                });
            }
            
            // 释放音频流
            if (audioStream) {
                audioStream.getTracks().forEach(track => track.stop());
                audioStream = null;
            }
        } catch (error) {
            console.error('停止录音时出错:', error);
            showStatus('error', `停止录音出错: ${error.message}`);
            updateRecordingButtonState('error');
            
            // 延迟后恢复按钮状态
            setTimeout(() => {
                updateRecordingButtonState('idle');
            }, 2000);
        }
    }
    
    // 绑定录音按钮事件
    if (recordButton) {
        recordButton.addEventListener('click', (event) => {
            console.log('录音按钮被点击，当前录音状态:', isRecording ? '录音中' : '未录音');
            
            // 阻止事件冒泡和默认行为，避免多次触发
            event.preventDefault();
            event.stopPropagation();
            
            // 录音按钮在处理中时禁用点击
            if (recordButton.disabled) {
                console.log('录音按钮当前已禁用，忽略点击');
                return;
            }
            
            if (isRecording) {
                console.log('尝试停止录音...');
                // 立即更新UI状态，防止用户重复点击
                recordButton.disabled = true;
                updateRecordingButtonState('processing');
                
                // 使用setTimeout确保状态更新后再停止录音
                setTimeout(() => {
                    stopRecording();
                }, 10);
            } else {
                console.log('尝试开始录音...');
                startRecording();
            }
        });
    } else {
        console.error('未找到录音按钮元素');
    }
    
    // 返回公共API
    return {
        startRecording,
        stopRecording,
        isRecording: () => isRecording,
        setUserId: (id) => { userId = id; }
    };
}

// 导出模块
window.SpeechRecognition = {
    init: initSpeechRecognition
}; 
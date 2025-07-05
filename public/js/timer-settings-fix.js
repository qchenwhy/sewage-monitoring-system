// timer-settings-fix.js - 用于修复计时器设置按钮功能问题
document.addEventListener('DOMContentLoaded', function() {
    console.log('计时器设置修复脚本已加载');
    initTimerSettingsBtn();
});

/**
 * 初始化计时器设置按钮和相关功能
 */
function initTimerSettingsBtn() {
    console.log('正在初始化计时器设置按钮');
    
    // 获取设置按钮元素
    const settingsBtn = document.getElementById('timerSettingsBtn');
    if (!settingsBtn) {
        console.error('无法找到计时器设置按钮元素，ID: timerSettingsBtn');
        return;
    }
    
    // 获取设置模态框元素
    const settingsModal = document.getElementById('timerSettingsModal');
    if (!settingsModal) {
        console.error('无法找到计时器设置模态框元素，ID: timerSettingsModal');
        return;
    }
    
    // 获取设置表单元素
    const settingsForm = document.getElementById('timerSettingsForm');
    if (!settingsForm) {
        console.error('无法找到计时器设置表单元素，ID: timerSettingsForm');
        return;
    }
    
    // 获取关闭按钮元素
    const closeBtn = settingsModal.querySelector('.close-btn');
    if (!closeBtn) {
        console.error('无法找到模态框关闭按钮元素');
    }
    
    // 获取保存按钮元素
    const saveBtn = document.getElementById('saveTimerSettings');
    if (!saveBtn) {
        console.error('无法找到保存设置按钮元素，ID: saveTimerSettings');
    }
    
    // 获取测试音频按钮元素
    const testAudioBtn = document.getElementById('testAudioBtn');
    if (!testAudioBtn) {
        console.error('无法找到测试音频按钮元素，ID: testAudioBtn');
    }
    
    // 添加设置按钮点击事件
    settingsBtn.addEventListener('click', function(e) {
        console.log('设置按钮被点击');
        e.preventDefault();
        
        // 加载当前设置到表单
        loadSettingsToForm();
        
        // 显示模态框
        settingsModal.style.display = 'block';
    });
    
    // 添加关闭按钮点击事件
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            console.log('关闭按钮被点击');
            settingsModal.style.display = 'none';
        });
    }
    
    // 添加模态框背景点击关闭事件
    settingsModal.addEventListener('click', function(e) {
        if (e.target === settingsModal) {
            console.log('模态框背景被点击，关闭模态框');
            settingsModal.style.display = 'none';
        }
    });
    
    // 添加保存按钮点击事件
    if (saveBtn) {
        saveBtn.addEventListener('click', function(e) {
            console.log('保存按钮被点击');
            e.preventDefault();
            saveSettings(settingsForm);
            settingsModal.style.display = 'none';
            showNotification('设置已保存！', 'success');
        });
    }
    
    // 添加测试音频按钮点击事件
    if (testAudioBtn) {
        testAudioBtn.addEventListener('click', function(e) {
            console.log('测试音频按钮被点击');
            e.preventDefault();
            testAudioLoopPlayback();
        });
    }
    
    // 添加表单提交事件（防止页面刷新）
    settingsForm.addEventListener('submit', function(e) {
        e.preventDefault();
        saveSettings(settingsForm);
        settingsModal.style.display = 'none';
        showNotification('设置已保存！', 'success');
    });
    
    console.log('计时器设置按钮初始化完成');
}

/**
 * 从本地存储加载设置到表单
 */
function loadSettingsToForm() {
    console.log('正在加载设置到表单');
    
    // 获取设置表单元素
    const form = document.getElementById('timerSettingsForm');
    if (!form) {
        console.error('无法找到计时器设置表单');
        return;
    }
    
    // 从本地存储获取设置
    const settings = localStorage.getItem('timerSettings');
    if (settings) {
        try {
            const parsedSettings = JSON.parse(settings);
            console.log('已加载设置:', parsedSettings);
            
            // 填充表单字段
            if (form.elements['notificationSound']) {
                form.elements['notificationSound'].value = parsedSettings.notificationSound || 'default';
            }
            
            if (form.elements['notificationVolume']) {
                form.elements['notificationVolume'].value = parsedSettings.notificationVolume || 0.5;
            }
            
            if (form.elements['loopNotification']) {
                form.elements['loopNotification'].checked = parsedSettings.loopNotification || false;
            }
            
            if (form.elements['useVoiceNotification']) {
                form.elements['useVoiceNotification'].checked = parsedSettings.useVoiceNotification || false;
            }
            
            if (form.elements['voiceLanguage']) {
                form.elements['voiceLanguage'].value = parsedSettings.voiceLanguage || 'zh-CN';
            }
        } catch (error) {
            console.error('解析设置时出错:', error);
        }
    } else {
        console.log('未找到保存的设置，使用默认值');
    }
}

/**
 * 保存设置到本地存储
 * @param {HTMLFormElement} form - 设置表单元素
 */
function saveSettings(form) {
    console.log('正在保存设置');
    
    if (!form) {
        console.error('保存设置失败：表单不存在');
        return;
    }
    
    // 收集表单数据
    const settings = {
        notificationSound: form.elements['notificationSound'] ? form.elements['notificationSound'].value : 'default',
        notificationVolume: form.elements['notificationVolume'] ? parseFloat(form.elements['notificationVolume'].value) : 0.5,
        loopNotification: form.elements['loopNotification'] ? form.elements['loopNotification'].checked : false,
        useVoiceNotification: form.elements['useVoiceNotification'] ? form.elements['useVoiceNotification'].checked : false,
        voiceLanguage: form.elements['voiceLanguage'] ? form.elements['voiceLanguage'].value : 'zh-CN'
    };
    
    // 保存到本地存储
    try {
        localStorage.setItem('timerSettings', JSON.stringify(settings));
        console.log('设置已保存:', settings);
    } catch (error) {
        console.error('保存设置时出错:', error);
        showNotification('保存设置失败: ' + error.message, 'error');
    }
}

/**
 * 测试音频循环播放功能
 */
function testAudioLoopPlayback() {
    console.log('正在测试音频循环播放');
    
    // 获取设置表单元素
    const form = document.getElementById('timerSettingsForm');
    if (!form) {
        console.error('无法找到计时器设置表单');
        return;
    }
    
    // 获取当前选择的音频和音量
    const soundFile = form.elements['notificationSound'] ? form.elements['notificationSound'].value : 'default';
    const volume = form.elements['notificationVolume'] ? parseFloat(form.elements['notificationVolume'].value) : 0.5;
    
    // 判断是否使用循环播放
    const loopEnabled = form.elements['loopNotification'] ? form.elements['loopNotification'].checked : false;
    
    // 判断是否使用语音通知
    const useVoice = form.elements['useVoiceNotification'] ? form.elements['useVoiceNotification'].checked : false;
    const voiceLanguage = form.elements['voiceLanguage'] ? form.elements['voiceLanguage'].value : 'zh-CN';
    
    // 测试音频播放
    try {
        // 首先停止任何正在播放的音频
        if (typeof AudioAutoplay !== 'undefined') {
            if (AudioAutoplay.stop) {
                AudioAutoplay.stop();
            } else if (AudioAutoplay.stopCurrentAudio) {
                AudioAutoplay.stopCurrentAudio();
            }
        }
        
        // 测试语音通知
        if (useVoice && window.speechSynthesis) {
            const testMessage = '这是一条测试语音通知';
            const utterance = new SpeechSynthesisUtterance(testMessage);
            utterance.lang = voiceLanguage;
            utterance.volume = volume;
            window.speechSynthesis.speak(utterance);
        }
        
        // 测试音频通知
        if (typeof AudioAutoplay !== 'undefined') {
            // 获取音频URL
            let audioUrl = '/audio/default.mp3'; // 默认
            if (soundFile && soundFile !== 'default') {
                audioUrl = '/audio/' + soundFile;
            }
            
            // 播放音频（通过AudioAutoplay）
            if (loopEnabled) {
                console.log('开始循环播放音频测试:', audioUrl);
                
                if (AudioAutoplay.playLoop) {
                    // 使用新的playLoop函数
                    AudioAutoplay.playLoop(audioUrl, function() {
                        console.log('循环音频播放完成回调');
                    });
                } else if (AudioAutoplay.play) {
                    // 使用普通play函数的第三个参数
                    AudioAutoplay.play(audioUrl, function() {
                        console.log('循环音频播放完成回调');
                    }, true);
                } else if (AudioAutoplay.playAudio) {
                    // 使用老版本的playAudio函数
                    AudioAutoplay.playAudio(audioUrl, function() {
                        console.log('循环音频播放完成回调');
                    }, true);
                }
                
                // 5秒后停止循环音频（仅测试用）
                setTimeout(function() {
                    if (AudioAutoplay.stop) {
                        AudioAutoplay.stop();
                    } else if (AudioAutoplay.stopCurrentAudio) {
                        AudioAutoplay.stopCurrentAudio();
                    }
                    console.log('测试音频已停止');
                    showNotification('循环音频已停止', 'info');
                }, 5000);
            } else {
                // 普通播放
                console.log('开始普通播放音频测试:', audioUrl);
                if (AudioAutoplay.play) {
                    AudioAutoplay.play(audioUrl, function() {
                        console.log('音频播放完成回调');
                        showNotification('音频播放完成', 'info');
                    });
                } else if (AudioAutoplay.playAudio) {
                    AudioAutoplay.playAudio(audioUrl, function() {
                        console.log('音频播放完成回调');
                        showNotification('音频播放完成', 'info');
                    });
                }
            }
        } else {
            console.warn('未找到AudioAutoplay模块，无法播放音频');
            showNotification('未找到音频播放模块，请确保页面已正确加载', 'error');
        }
    } catch (error) {
        console.error('测试音频播放时出错:', error);
        showNotification('测试音频失败: ' + error.message, 'error');
    }
}

/**
 * 显示通知消息
 * @param {string} message - 通知消息内容
 * @param {string} type - 通知类型 (success, error, info)
 */
function showNotification(message, type = 'info') {
    console.log(`显示${type}类型通知:`, message);
    
    // 获取或创建通知容器
    let notificationContainer = document.getElementById('notificationContainer');
    if (!notificationContainer) {
        notificationContainer = document.createElement('div');
        notificationContainer.id = 'notificationContainer';
        notificationContainer.style.position = 'fixed';
        notificationContainer.style.top = '20px';
        notificationContainer.style.right = '20px';
        notificationContainer.style.zIndex = '9999';
        document.body.appendChild(notificationContainer);
    }
    
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = message;
    
    // 设置样式
    notification.style.padding = '10px 15px';
    notification.style.marginBottom = '10px';
    notification.style.borderRadius = '4px';
    notification.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    notification.style.opacity = '0';
    notification.style.transform = 'translateY(-20px)';
    notification.style.transition = 'opacity 0.3s, transform 0.3s';
    
    // 根据类型设置不同背景色
    if (type === 'success') {
        notification.style.backgroundColor = '#4caf50';
        notification.style.color = 'white';
    } else if (type === 'error') {
        notification.style.backgroundColor = '#f44336';
        notification.style.color = 'white';
    } else {
        notification.style.backgroundColor = '#2196f3';
        notification.style.color = 'white';
    }
    
    // 添加到容器
    notificationContainer.appendChild(notification);
    
    // 显示动画
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateY(0)';
    }, 10);
    
    // 自动关闭
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(-20px)';
        
        // 移除元素
        setTimeout(() => {
            notificationContainer.removeChild(notification);
        }, 300);
    }, 3000);
}
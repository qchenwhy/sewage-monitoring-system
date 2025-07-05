# 计时器设置修复指南

## 问题分析

根据您提供的错误信息，计时器设置保存按钮无响应和音频循环播放存在以下问题：

1. **变量初始化错误**: 
   ```
   chat.html:819 解析WebSocket消息失败: ReferenceError: Cannot access 'timerSettings' before initialization
   ```
   这表明代码尝试在定义前使用 `timerSettings` 变量。

2. **事件处理逻辑不完整**: 保存按钮的点击事件可能未被正确处理。

3. **音频循环播放逻辑不完善**: 虽然 AudioAutoplay 库提供了 playLoop 方法，但实际应用中可能存在问题。

## 解决方案

### 1. 修复 timerSettings 变量初始化问题

将以下代码添加到 `chat.html` 文件的 `<head>` 标签内或其他脚本之前：

```javascript
<script>
// 预先初始化timerSettings变量，防止"Cannot access before initialization"错误
window.timerSettings = {
    notificationSound: 'default',
    notificationVolume: 0.5,
    loopNotification: false,
    useVoiceNotification: true,
    voiceLanguage: 'zh-CN',
    repeatCount: 1
};

// 尝试从localStorage加载已保存的设置
(function() {
    try {
        const savedSettings = localStorage.getItem('timerSettings');
        if (savedSettings) {
            const parsedSettings = JSON.parse(savedSettings);
            window.timerSettings = {...window.timerSettings, ...parsedSettings};
            console.log('从localStorage加载设置:', window.timerSettings);
        }
    } catch (e) {
        console.error('加载设置时出错:', e);
    }
})();
</script>
```

### 2. 修复保存设置按钮功能

找到 `timer-settings-fix.js` 文件中保存按钮事件绑定的部分，确保事件处理器正确绑定：

```javascript
// 在timer-settings-fix.js或通过内联脚本添加
function fixSaveSettingsButton() {
    console.log('修复保存设置按钮');
    
    // 获取保存按钮元素
    const saveBtn = document.getElementById('saveTimerSettings');
    if (!saveBtn) {
        console.error('找不到保存设置按钮');
        return;
    }
    
    // 移除可能已存在的事件监听器
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    
    // 添加新的事件监听器
    newSaveBtn.addEventListener('click', function(e) {
        console.log('保存按钮被点击（修复后）');
        e.preventDefault();
        
        // 获取设置表单
        const settingsForm = document.getElementById('timerSettingsForm');
        if (!settingsForm) {
            console.error('找不到设置表单元素');
            showNotification('保存失败：找不到设置表单', 'error');
            return;
        }
        
        // 收集表单数据并保存
        const formData = {
            notificationSound: settingsForm.elements['notificationSound'] ? 
                settingsForm.elements['notificationSound'].value : 'default',
            notificationVolume: settingsForm.elements['notificationVolume'] ? 
                parseFloat(settingsForm.elements['notificationVolume'].value) : 0.5,
            loopNotification: settingsForm.elements['loopNotification'] ? 
                settingsForm.elements['loopNotification'].checked : false,
            useVoiceNotification: settingsForm.elements['useVoiceNotification'] ? 
                settingsForm.elements['useVoiceNotification'].checked : true,
            voiceLanguage: settingsForm.elements['voiceLanguage'] ? 
                settingsForm.elements['voiceLanguage'].value : 'zh-CN',
            repeatCount: settingsForm.elements['reminderRepeatCount'] ? 
                parseInt(settingsForm.elements['reminderRepeatCount'].value) : 1
        };
        
        // 更新全局设置变量
        window.timerSettings = formData;
        
        // 保存到localStorage
        try {
            localStorage.setItem('timerSettings', JSON.stringify(formData));
            console.log('设置已保存:', formData);
            
            // 关闭模态框
            const settingsModal = document.getElementById('timerSettingsModal');
            if (settingsModal) {
                settingsModal.style.display = 'none';
            }
            
            showNotification('设置已成功保存！', 'success');
        } catch (error) {
            console.error('保存设置时出错:', error);
            showNotification('保存设置失败: ' + error.message, 'error');
        }
    });
    
    console.log('保存按钮事件监听器修复完成');
}

// 在DOMContentLoaded时执行修复
document.addEventListener('DOMContentLoaded', function() {
    fixSaveSettingsButton();
});
```

### 3. 修复音频循环播放功能

使用我们创建的 `AudioHelper` 库来增强音频循环播放功能。首先，确保引入了 `audio-helper.js` 文件：

```html
<script src="/js/audio-helper.js"></script>
```

然后，修改计时器完成处理函数，使用 AudioHelper 来播放音频：

```javascript
// 增强音频循环播放
function enhanceTimerCompletedHandler() {
    // 保存原始处理函数
    const originalHandleTimerCompleted = window.handleTimerCompleted;
    
    // 替换为增强版本
    window.handleTimerCompleted = function(timerData) {
        console.log('增强版计时器完成处理函数');
        
        // 确保timerSettings已初始化
        if (typeof window.timerSettings === 'undefined') {
            console.warn('timerSettings未定义，使用默认设置');
            window.timerSettings = {
                notificationSound: 'default',
                notificationVolume: 0.5,
                loopNotification: false,
                useVoiceNotification: true,
                voiceLanguage: 'zh-CN',
                repeatCount: 1
            };
        }
        
        // 优先使用AudioHelper
        if (window.AudioHelper && window.timerSettings.loopNotification) {
            // 使用AudioHelper播放循环提示音
            const soundOptions = {
                volume: window.timerSettings.notificationVolume || 0.5,
                fadeIn: 300
            };
            
            window.AudioHelper.startLoop('/audio/alert.mp3', soundOptions);
            
            // 根据设置的重复次数，在适当时间后停止
            setTimeout(() => {
                window.AudioHelper.stopLoop({ fadeOut: 500 });
                
                // 然后播放语音消息（如果启用）
                if (window.timerSettings.useVoiceNotification) {
                    const utterance = new SpeechSynthesisUtterance(timerData.message);
                    utterance.lang = window.timerSettings.voiceLanguage || 'zh-CN';
                    utterance.volume = window.timerSettings.notificationVolume || 0.5;
                    window.speechSynthesis.speak(utterance);
                }
            }, 3000 * (window.timerSettings.repeatCount || 1));
            
            return;
        }
        
        // 如果没有AudioHelper，则尝试调用原始处理函数
        try {
            originalHandleTimerCompleted(timerData);
        } catch (e) {
            console.error('原始计时器处理函数出错:', e);
            
            // 备用实现
            if (window.AudioAutoplay) {
                if (window.timerSettings.loopNotification) {
                    window.AudioAutoplay.playLoop('/audio/alert.mp3', function() {
                        console.log('提示音播放完成');
                    });
                    
                    // 一段时间后停止
                    setTimeout(() => {
                        window.AudioAutoplay.stop();
                    }, 3000 * (window.timerSettings.repeatCount || 1));
                } else {
                    window.AudioAutoplay.play('/audio/alert.mp3', function() {
                        // 播放语音消息
                        if (window.timerSettings.useVoiceNotification) {
                            const utterance = new SpeechSynthesisUtterance(timerData.message);
                            utterance.lang = window.timerSettings.voiceLanguage || 'zh-CN';
                            utterance.volume = window.timerSettings.notificationVolume || 0.5;
                            window.speechSynthesis.speak(utterance);
                        }
                    });
                }
            }
        }
    };
}

// 在DOMContentLoaded时执行
document.addEventListener('DOMContentLoaded', function() {
    enhanceTimerCompletedHandler();
});
```

## 完整解决方案

为了全面解决问题，请创建一个名为 `timer-settings-patch.js` 的新文件，将上述所有修复整合在一起：

```javascript
/**
 * 计时器设置修复补丁
 * 解决timerSettings变量初始化、设置保存和音频循环播放问题
 */

// 确保在DOM加载完成后执行
document.addEventListener('DOMContentLoaded', function() {
    console.log('计时器设置补丁已加载');
    
    // 全局初始化timerSettings变量，防止"Cannot access before initialization"错误
    if (typeof window.timerSettings === 'undefined') {
        console.log('初始化timerSettings变量');
        window.timerSettings = {
            notificationSound: 'default',
            notificationVolume: 0.5,
            loopNotification: false,
            useVoiceNotification: true,
            voiceLanguage: 'zh-CN',
            repeatCount: 1
        };
        
        // 尝试从localStorage加载已保存的设置
        try {
            const savedSettings = localStorage.getItem('timerSettings');
            if (savedSettings) {
                const parsedSettings = JSON.parse(savedSettings);
                window.timerSettings = {...window.timerSettings, ...parsedSettings};
                console.log('从localStorage加载设置:', window.timerSettings);
            }
        } catch (e) {
            console.error('加载设置时出错:', e);
        }
    }
    
    // 修复保存设置按钮功能
    fixSaveSettingsButton();
    
    // 修复计时器音频循环播放
    enhanceTimerCompletedHandler();
    
    // 如果需要AudioHelper但未加载，则动态加载
    loadAudioHelperIfNeeded();
});

/**
 * 修复保存设置按钮功能
 */
function fixSaveSettingsButton() {
    console.log('开始修复保存设置按钮');
    
    // 查找保存设置按钮
    const saveBtn = document.getElementById('saveTimerSettings');
    if (!saveBtn) {
        console.warn('未找到保存设置按钮，将等待DOM变更后再尝试');
        
        // 使用MutationObserver监听DOM变化
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.addedNodes && mutation.addedNodes.length > 0) {
                    // 再次查找按钮
                    const saveBtn = document.getElementById('saveTimerSettings');
                    if (saveBtn) {
                        console.log('DOM变更后找到保存设置按钮，添加事件监听器');
                        attachSaveButtonListener(saveBtn);
                        observer.disconnect(); // 停止观察
                    }
                }
            });
        });
        
        // 开始观察文档
        observer.observe(document.body, { childList: true, subtree: true });
        return;
    }
    
    // 找到按钮，添加事件监听器
    attachSaveButtonListener(saveBtn);
}

/**
 * 为保存按钮附加事件监听器
 */
function attachSaveButtonListener(saveBtn) {
    // 移除可能已存在的事件监听器，防止重复添加
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    
    // 添加新的事件监听器
    newSaveBtn.addEventListener('click', function(e) {
        console.log('保存按钮被点击（通过补丁添加的事件处理器）');
        e.preventDefault();
        
        // 获取设置表单
        const settingsForm = document.getElementById('timerSettingsForm');
        if (!settingsForm) {
            console.error('找不到设置表单元素');
            showNotification('保存失败：找不到设置表单', 'error');
            return;
        }
        
        // 收集表单数据并保存
        const formData = {
            notificationSound: settingsForm.elements['notificationSound'] ? 
                settingsForm.elements['notificationSound'].value : 'default',
            notificationVolume: settingsForm.elements['notificationVolume'] ? 
                parseFloat(settingsForm.elements['notificationVolume'].value) : 0.5,
            loopNotification: settingsForm.elements['loopNotification'] ? 
                settingsForm.elements['loopNotification'].checked : false,
            useVoiceNotification: settingsForm.elements['useVoiceNotification'] ? 
                settingsForm.elements['useVoiceNotification'].checked : true,
            voiceLanguage: settingsForm.elements['voiceLanguage'] ? 
                settingsForm.elements['voiceLanguage'].value : 'zh-CN',
            repeatCount: settingsForm.elements['reminderRepeatCount'] ? 
                parseInt(settingsForm.elements['reminderRepeatCount'].value) : 1
        };
        
        // 更新全局设置变量
        window.timerSettings = formData;
        
        // 保存到localStorage
        try {
            localStorage.setItem('timerSettings', JSON.stringify(formData));
            console.log('设置已保存:', formData);
            
            // 关闭模态框
            const settingsModal = document.getElementById('timerSettingsModal');
            if (settingsModal) {
                settingsModal.style.display = 'none';
            }
            
            showNotification('设置已成功保存！', 'success');
        } catch (error) {
            console.error('保存设置时出错:', error);
            showNotification('保存设置失败: ' + error.message, 'error');
        }
    });
    
    console.log('保存按钮事件监听器添加成功');
}

/**
 * 增强计时器完成处理函数
 */
function enhanceTimerCompletedHandler() {
    if (typeof window.handleTimerCompleted === 'function') {
        // 保存原始函数
        const originalHandleTimerCompleted = window.handleTimerCompleted;
        
        // 替换为增强版本
        window.handleTimerCompleted = function(timerData) {
            console.log('增强版计时器完成处理函数');
            
            // 确保timerSettings已初始化
            if (typeof window.timerSettings === 'undefined') {
                console.warn('timerSettings未定义，使用默认设置');
                window.timerSettings = {
                    notificationSound: 'default',
                    notificationVolume: 0.5,
                    loopNotification: false,
                    useVoiceNotification: true,
                    voiceLanguage: 'zh-CN',
                    repeatCount: 1
                };
            }
            
            // 优先使用AudioHelper
            if (window.AudioHelper && window.timerSettings.loopNotification) {
                // 使用AudioHelper播放循环提示音
                const soundOptions = {
                    volume: window.timerSettings.notificationVolume || 0.5,
                    fadeIn: 300
                };
                
                window.AudioHelper.startLoop('/audio/alert.mp3', soundOptions);
                
                // 根据设置的重复次数，在适当时间后停止
                setTimeout(() => {
                    window.AudioHelper.stopLoop({ fadeOut: 500 });
                    
                    // 然后播放语音消息（如果启用）
                    if (window.timerSettings.useVoiceNotification) {
                        const utterance = new SpeechSynthesisUtterance(timerData.message);
                        utterance.lang = window.timerSettings.voiceLanguage || 'zh-CN';
                        utterance.volume = window.timerSettings.notificationVolume || 0.5;
                        window.speechSynthesis.speak(utterance);
                    }
                }, 3000 * (window.timerSettings.repeatCount || 1));
                
                return;
            }
            
            // 如果没有AudioHelper，则尝试调用原始处理函数
            try {
                originalHandleTimerCompleted(timerData);
            } catch (e) {
                console.error('原始计时器处理函数出错:', e);
                
                // 备用实现
                if (window.AudioAutoplay) {
                    if (window.timerSettings.loopNotification) {
                        window.AudioAutoplay.playLoop('/audio/alert.mp3', function() {
                            console.log('提示音播放完成');
                        });
                        
                        // 一段时间后停止
                        setTimeout(() => {
                            window.AudioAutoplay.stop();
                        }, 3000 * (window.timerSettings.repeatCount || 1));
                    } else {
                        window.AudioAutoplay.play('/audio/alert.mp3', function() {
                            // 播放语音消息
                            if (window.timerSettings.useVoiceNotification) {
                                const utterance = new SpeechSynthesisUtterance(timerData.message);
                                utterance.lang = window.timerSettings.voiceLanguage || 'zh-CN';
                                utterance.volume = window.timerSettings.notificationVolume || 0.5;
                                window.speechSynthesis.speak(utterance);
                            }
                        });
                    }
                }
            }
        };
        
        console.log('已增强计时器完成处理函数');
    } else {
        console.warn('未找到handleTimerCompleted函数，无法增强');
    }
}

/**
 * 如果需要但未加载AudioHelper，则动态加载
 */
function loadAudioHelperIfNeeded() {
    if (!window.AudioHelper && window.AudioAutoplay) {
        console.log('动态加载AudioHelper');
        
        const script = document.createElement('script');
        script.src = '/js/audio-helper.js';
        script.onload = function() {
            console.log('AudioHelper脚本加载成功');
        };
        script.onerror = function() {
            console.error('AudioHelper脚本加载失败');
        };
        document.head.appendChild(script);
    }
}

/**
 * 显示通知消息
 */
function showNotification(message, type = 'info') {
    console.log(`显示通知[${type}]:`, message);
    
    // 如果已有通知显示函数则使用它
    if (typeof window.showNotification === 'function') {
        window.showNotification(message, type);
        return;
    }
    
    // 否则创建自己的通知
    let notificationContainer = document.getElementById('patchNotificationContainer');
    if (!notificationContainer) {
        notificationContainer = document.createElement('div');
        notificationContainer.id = 'patchNotificationContainer';
        notificationContainer.style.position = 'fixed';
        notificationContainer.style.top = '20px';
        notificationContainer.style.right = '20px';
        notificationContainer.style.zIndex = '9999';
        document.body.appendChild(notificationContainer);
    }
    
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
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
            if (notificationContainer.contains(notification)) {
                notificationContainer.removeChild(notification);
            }
        }, 300);
    }, 3000);
}
```

然后，将这个脚本添加到您的主页面中（在其他脚本之后）：

```html
<!-- 在chat.html或相关页面底部添加 -->
<script src="/js/timer-settings-patch.js"></script>
```

## 集成步骤

1. 将 `timer-settings-patch.js` 文件保存到您的 `/js` 目录
2. 将 `audio-helper.js` 文件保存到您的 `/js` 目录
3. 在 `chat.html` 或相关页面中，添加这两个脚本的引用（在现有脚本之后）
4. 重新加载页面并测试功能

## 验证修复成功

修复成功后，您应该能够:

1. 正常保存计时器设置（保存按钮可正常工作）
2. 计时器完成时循环播放音频提示（如果在设置中启用）
3. 控制台不再显示 `Cannot access 'timerSettings' before initialization` 错误
4. 语音通知功能正常工作（如果在设置中启用） 
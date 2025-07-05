/**
 * 语音识别兼容性修复脚本
 * 解决chat.html与语音识别模块之间的冲突
 */

// 立即执行函数避免变量污染
(function() {
    // 在页面加载时执行修复
    window.addEventListener('DOMContentLoaded', function() {
        console.log('正在执行语音识别修复脚本...');
        
        // 修复变量冲突问题
        fixVariableConflicts();
        
        // 修复函数访问问题
        fixFunctionAccess();
        
        console.log('语音识别修复完成');
    });
    
    // 修复变量冲突
    function fixVariableConflicts() {
        // 通过监听speech-recognition.js中userId的访问来解决冲突
        if (typeof window.speechRecognitionUserId === 'undefined') {
            // 创建一个代理变量，用于存储真实的userId值
            window.speechRecognitionUserId = null;
            
            // 使用getter/setter拦截对window.userId的访问
            let userIdValue = window.userId || '';
            Object.defineProperty(window, 'userId', {
                get: function() {
                    return userIdValue;
                },
                set: function(value) {
                    userIdValue = value;
                    console.log('userId被更新为:', value);
                    
                    // 如果已初始化，同步更新speech-recognition模块的userId
                    if (window.speechRecognitionApi) {
                        window.speechRecognitionApi.setUserId(value);
                    }
                },
                configurable: true
            });
            
            console.log('已修复userId变量冲突');
        }
    }
    
    // 修复函数访问问题
    function fixFunctionAccess() {
        // 如果chat.html中存在sendMessage函数但不是全局函数，添加到window对象
        if (typeof sendMessage === 'function' && typeof window.sendMessage !== 'function') {
            window.sendMessage = sendMessage;
            console.log('已将sendMessage函数添加到window对象');
        }
        
        // 如果没有sendMessage函数，创建一个简单的占位函数
        if (typeof window.sendMessage !== 'function') {
            window.sendMessage = function() {
                console.log('使用占位sendMessage函数');
                
                // 获取输入框值
                const messageInput = document.getElementById('messageInput');
                if (messageInput && messageInput.value.trim() !== '') {
                    console.log('尝试发送消息:', messageInput.value);
                    
                    // 尝试找到聊天发送相关函数
                    if (typeof submitMessage === 'function') {
                        submitMessage();
                    } else if (typeof sendChatMessage === 'function') {
                        sendChatMessage();
                    } else {
                        console.log('无法找到合适的消息发送函数');
                        alert('请手动点击发送按钮发送消息');
                    }
                }
            };
            console.log('已创建sendMessage占位函数');
        }
    }
})(); 
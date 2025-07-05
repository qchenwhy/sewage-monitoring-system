/**
 * 语音识别桥接脚本 - 修复版
 * 将chat.html与speech-recognition.js模块连接起来
 */

// 等待DOM加载完成
document.addEventListener('DOMContentLoaded', () => {
    console.log('正在初始化语音识别桥接脚本...');
    
    // 确保SpeechRecognition模块已加载
    if (!window.SpeechRecognition) {
        console.error('语音识别模块未加载，请确保已引入speech-recognition.js');
        return;
    }
    
    // 获取userId函数
    function getUserId() {
        // 优先使用页面中定义的全局userId
        if (typeof window.userId !== 'undefined') {
            console.log('使用window.userId:', window.userId);
            return window.userId;
        }
        
        // 然后尝试使用页面中定义的userId
        if (typeof window.userId === 'undefined' && typeof userId !== 'undefined') {
            console.log('使用页面中定义的userId:', userId);
            // 同时更新window.userId以保持同步
            window.userId = userId;
            return userId;
        }
        
        // 否则从localStorage中获取
        const storedUserId = localStorage.getItem('userId');
        if (storedUserId) {
            console.log('使用localStorage中的userId:', storedUserId);
            // 同时更新全局变量以保持同步
            window.userId = storedUserId;
            return storedUserId;
        }
        
        // 如果都没有，生成一个新的
        const newUserId = 'user-' + Date.now();
        console.log('生成新的userId:', newUserId);
        // 更新全局变量
        window.userId = newUserId;
        return newUserId;
    }
    
    // 初始化语音识别模块
    const speechRecognitionApi = window.SpeechRecognition.init({
        recordButtonId: 'recordButton',
        recordingStatusId: 'recordingStatus',
        inputBoxId: 'messageInput',
        userIdGetter: getUserId
    });
    
    console.log('语音识别模块初始化完成');
    
    // 导出到全局，方便调试和访问
    window.speechRecognitionApi = speechRecognitionApi;
    
    // 修复发送按钮
    fixSendButton();
});

// 修复发送按钮功能
function fixSendButton() {
    const sendButton = document.getElementById('sendButton');
    if (!sendButton) {
        console.error('无法找到发送按钮');
        return;
    }
    
    console.log('尝试修复发送按钮...');
    
    // 添加额外的点击事件处理程序
    sendButton.addEventListener('click', function(event) {
        console.log('发送按钮被点击 (修复处理程序)');
        
        try {
            // 尝试调用原始的sendMessage函数
            if (typeof window.sendMessage === 'function') {
                console.log('调用window.sendMessage()');
                window.sendMessage();
            } else if (typeof sendMessage === 'function') {
                console.log('调用sendMessage()');
                sendMessage();
            } else {
                console.error('找不到sendMessage函数，请确保chat.html中已定义该函数');
            }
        } catch (error) {
            console.error('调用sendMessage函数时出错:', error);
        }
    });
    
    console.log('发送按钮修复完成');
}

// 确保页面初始化正常工作
window.addEventListener('load', function() {
    console.log('检查页面初始化状态...');
    
    // 延迟检查欢迎词是否加载
    setTimeout(function() {
        const chatMessages = document.querySelector('.chat-messages');
        if (chatMessages && chatMessages.childElementCount === 0) {
            console.log('页面初始化可能存在问题，尝试触发初始化...');
            
            // 尝试触发欢迎词加载
            if (typeof initChat === 'function') {
                console.log('调用initChat()函数');
                initChat();
            } else if (typeof window.initChat === 'function') {
                console.log('调用window.initChat()函数');
                window.initChat();
            } else {
                console.log('未找到initChat函数，尝试其他方法初始化...');
                
                // 尝试查找其他可能的初始化函数
                ['initialize', 'init', 'startChat', 'loadChat'].forEach(funcName => {
                    if (typeof window[funcName] === 'function') {
                        console.log(`调用${funcName}()函数`);
                        window[funcName]();
                    }
                });
            }
        }
    }, 1000);
}); 
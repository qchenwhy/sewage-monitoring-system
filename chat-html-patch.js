/**
 * chat.html WebSocket处理补丁脚本
 * 在保留原有功能的前提下，添加对chat_response消息类型的处理
 */

const fs = require('fs');
const path = require('path');

// chat.html 文件路径
const CHAT_HTML_PATH = path.join(__dirname, 'public', 'chat.html');

// 备份原文件
function backupOriginalFile() {
  const backupPath = `${CHAT_HTML_PATH}.bak-${Date.now()}`;
  console.log(`备份原始chat.html文件到 ${backupPath}`);
  fs.copyFileSync(CHAT_HTML_PATH, backupPath);
  return backupPath;
}

// 读取文件内容
function readChatHtmlFile() {
  console.log(`读取文件: ${CHAT_HTML_PATH}`);
  return fs.readFileSync(CHAT_HTML_PATH, 'utf8');
}

// 修改WebSocket消息处理部分
function modifyChatHtml() {
  // 先备份原文件
  const backupPath = backupOriginalFile();
  
  // 读取文件内容
  let content = readChatHtmlFile();
  
  // 查找WebSocket onmessage处理函数
  const wsMessageHandlerRegex = /ws\.onmessage = \(event\) => {[\s\S]*?try {[\s\S]*?const data = JSON\.parse\(event\.data\);[\s\S]*?console\.log\([^)]*\);([\s\S]*?)catch \(error\) {/m;
  
  // 检查文件中是否已有chat_response处理逻辑
  const hasChatResponseHandler = content.includes("data.type === 'chat_response'");
  
  if (hasChatResponseHandler) {
    console.log('文件中已存在chat_response处理逻辑，无需修改。');
    return {
      success: false,
      reason: 'already_exists',
      backupPath
    };
  }
  
  // 匹配WebSocket消息处理部分
  const match = content.match(wsMessageHandlerRegex);
  
  if (!match) {
    console.error('无法找到WebSocket消息处理函数，修改失败。');
    return {
      success: false,
      reason: 'pattern_not_found',
      backupPath
    };
  }
  
  // 提取现有的处理逻辑
  const existingHandlers = match[1];
  
  // 新的chat_response处理逻辑
  const chatResponseHandler = `
                    // 处理聊天响应
                    else if (data.type === 'chat_response') {
                        console.log('收到聊天响应:', data);
                        
                        // 隐藏输入指示器
                        typingIndicator.style.display = 'none';
                        
                        if (data.success) {
                            // 添加机器人消息
                            addMessage(data.answer, 'bot');
                            
                            // 如果提供了会话ID，保存它(保持原有的会话连续性逻辑)
                            if (data.conversation_id) {
                                console.log('收到会话ID:', data.conversation_id);
                                conversationId = data.conversation_id;
                                localStorage.setItem('lastSessionId', conversationId);
                                localStorage.setItem('lastSessionDate', getCurrentDateString());
                            }
                            
                            // 消息分类标识
                            if (data.messageType) {
                                console.log('消息分类:', data.messageType);
                            }
                            
                            // 如果启用了自动语音并且有文本响应
                            if (autoSpeakEnabled && data.answer) {
                                // 请求语音合成
                                if (typeof requestTTS === 'function') {
                                    requestTTS(data.answer);
                                } else if (typeof synthesizeSpeech === 'function') {
                                    synthesizeSpeech(data.answer);
                                }
                            }
                        } else {
                            // 处理错误
                            addMessage(data.error || '抱歉，处理您的请求时出错了。', 'bot');
                        }
                        
                        // 滚动到底部
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    }`;
  
  // 在现有处理逻辑之后添加chat_response处理
  const newHandlers = existingHandlers + chatResponseHandler;
  
  // 替换内容
  const updatedContent = content.replace(wsMessageHandlerRegex, `ws.onmessage = (event) => {\\$&${chatResponseHandler}catch (error) {`);
  
  // 写入修改后的内容
  fs.writeFileSync(CHAT_HTML_PATH, content.replace(match[0], match[0].replace(existingHandlers, newHandlers)), 'utf8');
  console.log(`已成功修改 ${CHAT_HTML_PATH}`);
  console.log(`原文件已备份到 ${backupPath}`);
  
  return {
    success: true,
    backupPath
  };
}

// 执行修改
try {
  const result = modifyChatHtml();
  console.log('修改完成:', result);
} catch (error) {
  console.error('修改失败:', error);
} 
/**
 * 聊天分类功能安装脚本
 * 自动修改app.js和chat.html，添加硬编码消息分类逻辑
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('====================================');
console.log('聊天分类功能安装脚本');
console.log('====================================');
console.log('本脚本将添加硬编码消息分类功能，连接到不同的Dify API');
console.log('将会修改以下文件：');
console.log('1. app.js - 添加消息分类逻辑');
console.log('2. chat.html - 添加处理chat_response消息的逻辑');
console.log('所有文件在修改前均会备份\n');

// 创建备份目录
const backupDir = path.join(__dirname, 'backups', `backup-${Date.now()}`);
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

// 文件路径
const APP_JS_PATH = path.join(__dirname, 'app.js');
const CHAT_HTML_PATH = path.join(__dirname, 'public', 'chat.html');
const MESSAGE_CLASSIFIER_PATH = path.join(__dirname, 'message-classifier.js');

// 备份文件
function backupFiles() {
  console.log('正在备份文件...');
  
  if (fs.existsSync(APP_JS_PATH)) {
    fs.copyFileSync(APP_JS_PATH, path.join(backupDir, 'app.js.bak'));
    console.log(`- app.js 已备份`);
  } else {
    console.error(`- 错误: app.js 不存在`);
    return false;
  }
  
  if (fs.existsSync(CHAT_HTML_PATH)) {
    fs.copyFileSync(CHAT_HTML_PATH, path.join(backupDir, 'chat.html.bak'));
    console.log(`- chat.html 已备份`);
  } else {
    console.error(`- 错误: chat.html 不存在`);
    return false;
  }
  
  console.log(`所有文件已备份到 ${backupDir}\n`);
  return true;
}

// 创建消息分类器文件
function createMessageClassifier() {
  console.log('创建消息分类器...');
  
  const content = `/**
 * 消息分类和API调用脚本
 * 用于替换app.js中的Dify API调用部分
 */

// 随机问候回复数组
const greetings = [
  "你好！有什么可以帮到你的吗？",
  "你好啊！很高兴为你服务。",
  "我在呢，请问有什么需要帮助的吗？",
  "你好，我是智能助手，有什么可以帮你的？",
  "嗨！有什么问题需要解答吗？"
];

// 关键词定义
const KEYWORDS = {
  // 分类一：系统参数查询 - 识别关键词
  PARAM_QUERY: ["型号", "参数", "状态", "运行时间", "操作手册"],
  // 分类二：数据更改 - 识别关键词
  DATA_CHANGE: ["设置", "输入", "写入", "添加", "新建", "创建", "增加", "记录", "记住", 
              "删除", "移除", "取消", "完成", "标记", "清除", "修改", "更改", "调整", "变更", 
              "任务", "计划", "参数"],
  // 分类三：计时指令 - 识别关键词
  TIMER: ["计时", "倒计时", "设置计时器", "提醒", "告知"],
  // 分类四：问候语识别
  GREETING: ["你好", "好啊", "你是谁", "在吗", "嗨", "哈喽", "Hello", "Hi"]
};

// API配置
const API_CONFIG = {
  PARAM_QUERY: {
    url: 'http://5ca6-218-57-212-166.ngrok-free.app/v1',
    key: 'app-c4nsE8BRWPTvHfVOOZjxAMe7'
  },
  DATA_CHANGE: {
    url: 'http://5ca6-218-57-212-166.ngrok-free.app/v1',
    key: 'app-wnuHyMsy5CpzBaWUCu4aOVof'
  },
  TIMER: {
    url: 'http://5ca6-218-57-212-166.ngrok-free.app/v1',
    key: 'app-2x8qQKmixHT0xnq77KsRBVqG'
  },
  GENERAL: {
    url: 'http://5ca6-218-57-212-166.ngrok-free.app/v1',
    key: 'app-noztD5mGi319kxZ7W3B6CtMI'
  }
};

/**
 * 对消息进行分类
 * @param {string} message - 用户消息
 * @returns {Object} - 分类结果，包含类型、API URL和Key
 */
function classifyMessage(message) {
  // 消息规范化处理
  const normalizedMessage = message.trim().toLowerCase();
  
  // 分类结果
  let result = {
    type: '',
    apiUrl: '',
    apiKey: '',
    response: null
  };
  
  // 分类一：系统参数查询
  if (KEYWORDS.PARAM_QUERY.some(keyword => normalizedMessage.includes(keyword))) {
    console.log("识别为系统参数查询");
    result.type = '系统参数查询';
    result.apiUrl = API_CONFIG.PARAM_QUERY.url;
    result.apiKey = API_CONFIG.PARAM_QUERY.key;
  } 
  // 分类二：数据更改
  else if (KEYWORDS.DATA_CHANGE.some(keyword => normalizedMessage.includes(keyword))) {
    console.log("识别为数据更改");
    result.type = '数据更改';
    result.apiUrl = API_CONFIG.DATA_CHANGE.url;
    result.apiKey = API_CONFIG.DATA_CHANGE.key;
  } 
  // 分类三：计时指令
  else if (KEYWORDS.TIMER.some(keyword => normalizedMessage.includes(keyword))) {
    console.log("识别为计时指令");
    result.type = '计时指令';
    result.apiUrl = API_CONFIG.TIMER.url;
    result.apiKey = API_CONFIG.TIMER.key;
  } 
  // 分类四：问候语
  else if (KEYWORDS.GREETING.some(keyword => normalizedMessage.includes(keyword))) {
    console.log("识别为问候语");
    result.type = '问候语';
    // 随机选择一个问候回复
    const randomIndex = Math.floor(Math.random() * greetings.length);
    result.response = greetings[randomIndex];
  } 
  // 分类五：其他
  else {
    console.log("无法确定分类，使用通用智能应答");
    result.type = '通用智能应答';
    result.apiUrl = API_CONFIG.GENERAL.url;
    result.apiKey = API_CONFIG.GENERAL.key;
  }
  
  return result;
}

/**
 * 调用Dify API
 * @param {string} apiUrl - API URL
 * @param {string} apiKey - API Key
 * @param {string} message - 用户消息
 * @param {string} userId - 用户ID
 * @returns {Promise<Object>} - API响应
 */
async function callDifyAPI(apiUrl, apiKey, message, userId) {
  console.log(\`调用API: \${apiUrl}, Key: \${apiKey}\`);
  
  try {
    // 发送请求到Dify API
    const response = await fetch(\`\${apiUrl}/chat-messages\`, {
      method: 'POST',
      headers: {
        'Authorization': \`Bearer \${apiKey}\`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: {},
        query: message,
        response_mode: "blocking", // 使用blocking模式获取完整回复
        user: userId || "default_user"
      })
    });
    
    if (!response.ok) {
      throw new Error(\`API请求失败: \${response.status} \${response.statusText}\`);
    }
    
    const result = await response.json();
    console.log(\`API返回结果:\`, result);
    
    return result;
  } catch (error) {
    console.error('API请求失败:', error);
    throw error;
  }
}

// 导出函数
module.exports = {
  classifyMessage,
  callDifyAPI
};`;

  fs.writeFileSync(MESSAGE_CLASSIFIER_PATH, content, 'utf8');
  console.log(`- 已创建消息分类器: ${MESSAGE_CLASSIFIER_PATH}\n`);
  return true;
}

// 修改app.js文件
function modifyAppJs() {
  console.log('修改app.js文件...');
  
  try {
    let content = fs.readFileSync(APP_JS_PATH, 'utf8');
    
    // 引入消息分类模块
    const importCode = `// 引入消息分类模块
const { classifyMessage, callDifyAPI } = require('./message-classifier');`;
    
    // 在文件开头添加导入语句
    // 使用正则表达式查找require语句的最后位置
    const lastRequireIndex = content.lastIndexOf('require(');
    const lastRequireEndIndex = content.indexOf(';', lastRequireIndex);
    
    if (lastRequireIndex !== -1 && lastRequireEndIndex !== -1) {
      content = content.substring(0, lastRequireEndIndex + 1) + 
                '\n' + importCode + 
                content.substring(lastRequireEndIndex + 1);
    } else {
      // 如果找不到require语句，则在文件开头添加
      content = importCode + '\n' + content;
    }
    
    // 替换聊天请求处理代码
    const chatRequestRegex = /\/\/ 处理聊天请求\s*else if \(data\.type === 'chat_request'\) {[\s\S]*?(?=\s*}\s*catch \(error\) {)/m;
    
    const newChatRequestCode = `// 处理聊天请求
      else if (data.type === 'chat_request') {
        console.log('收到聊天请求:', data.message);
        
        if (!data.message) {
          ws.send(JSON.stringify({
            type: 'chat_response',
            success: false,
            requestId: data.requestId,
            error: '消息不能为空'
          }));
          return;
        }
        
        // 使用消息分类器进行消息分类
        const classResult = classifyMessage(data.message);
        console.log('消息分类结果:', classResult.type);
        
        // 如果是问候语，直接返回响应
        if (classResult.type === '问候语' && classResult.response) {
          ws.send(JSON.stringify({
            type: 'chat_response',
            success: true,
            requestId: data.requestId,
            answer: classResult.response,
            messageType: classResult.type
          }));
          return;
        }
        
        // 对于其他类型，调用相应的API
        try {
          // 调用对应的Dify API
          const result = await callDifyAPI(
            classResult.apiUrl, 
            classResult.apiKey, 
            data.message, 
            data.userId || 'default_user'
          );
          
          // 发送结果到客户端
          ws.send(JSON.stringify({
            type: 'chat_response',
            success: true,
            requestId: data.requestId,
            answer: result.answer || "抱歉，无法获取回答",
            messageType: classResult.type,
            // 保留原有的conversation_id，保持连续对话功能
            conversation_id: result.conversation_id
          }));
        } catch (error) {
          console.error('API请求失败:', error);
          ws.send(JSON.stringify({
            type: 'chat_response',
            success: false,
            requestId: data.requestId,
            error: \`请求失败: \${error.message}\`
          }));
        }
      }`;
    
    if (chatRequestRegex.test(content)) {
      content = content.replace(chatRequestRegex, newChatRequestCode);
    } else {
      console.error('- 错误: 找不到聊天请求处理代码，请手动修改app.js');
      console.log('请手动将以下代码替换app.js中的聊天请求处理部分:');
      console.log(newChatRequestCode);
      return false;
    }
    
    // 写入修改后的内容
    fs.writeFileSync(APP_JS_PATH, content, 'utf8');
    console.log('- app.js 修改成功\n');
    return true;
  } catch (error) {
    console.error('- 修改app.js失败:', error);
    return false;
  }
}

// 修改chat.html文件
function modifyChatHtml() {
  console.log('修改chat.html文件...');
  
  try {
    let content = fs.readFileSync(CHAT_HTML_PATH, 'utf8');
    
    // 检查文件中是否已有chat_response处理逻辑
    const hasChatResponseHandler = content.includes("data.type === 'chat_response'");
    
    if (hasChatResponseHandler) {
      console.log('- chat.html 已存在处理逻辑，无需修改\n');
      return true;
    }
    
    // 查找WebSocket onmessage处理函数
    const wsMessageHandlerRegex = /ws\.onmessage = \(event\) => {[\s\S]*?try {[\s\S]*?const data = JSON\.parse\(event\.data\);[\s\S]*?console\.log\([^)]*\);([\s\S]*?)catch \(error\) {/m;
    
    // 匹配WebSocket消息处理部分
    const match = content.match(wsMessageHandlerRegex);
    
    if (!match) {
      console.error('- 错误: 找不到WebSocket消息处理函数，请手动修改chat.html');
      return false;
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
    
    // 写入修改后的内容
    fs.writeFileSync(CHAT_HTML_PATH, content.replace(match[0], match[0].replace(existingHandlers, newHandlers)), 'utf8');
    console.log('- chat.html 修改成功\n');
    return true;
  } catch (error) {
    console.error('- 修改chat.html失败:', error);
    return false;
  }
}

// 主函数
function main() {
  try {
    // 1. 备份文件
    if (!backupFiles()) {
      console.error('备份文件失败，安装终止');
      return;
    }
    
    // 2. 创建消息分类器
    if (!createMessageClassifier()) {
      console.error('创建消息分类器失败，安装终止');
      return;
    }
    
    // 3. 修改app.js
    if (!modifyAppJs()) {
      console.error('修改app.js失败，请手动修改');
    }
    
    // 4. 修改chat.html
    if (!modifyChatHtml()) {
      console.error('修改chat.html失败，请手动修改');
    }
    
    console.log('====================================');
    console.log('安装完成！');
    console.log('====================================');
    console.log('现在您的系统已经具有以下功能:');
    console.log('1. 五种消息分类(系统参数查询、数据更改、计时指令、问候语、通用智能应答)');
    console.log('2. 不同分类连接到不同的Dify API接口');
    console.log('3. 保留了原有的界面和用户体验');
    console.log('\n如需恢复原始文件，请使用备份目录中的文件:');
    console.log(`备份目录: ${backupDir}`);
    console.log('\n如需重启服务器，请运行:');
    console.log('npm restart');
    console.log('====================================');
  } catch (error) {
    console.error('安装过程中发生错误:', error);
  }
}

// 执行主函数
main(); 
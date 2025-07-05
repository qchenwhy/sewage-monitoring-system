/**
 * 修改app.js脚本
 * 替换原有的Dify API调用为新的消息分类逻辑
 */

const fs = require('fs');
const path = require('path');

// 应用主文件路径
const APP_JS_PATH = path.join(__dirname, 'app.js');

// 备份原文件
function backupOriginalFile() {
  const backupPath = `${APP_JS_PATH}.bak-${Date.now()}`;
  console.log(`备份原始app.js文件到 ${backupPath}`);
  fs.copyFileSync(APP_JS_PATH, backupPath);
  return backupPath;
}

// 读取文件内容
function readAppFile() {
  console.log(`读取文件: ${APP_JS_PATH}`);
  return fs.readFileSync(APP_JS_PATH, 'utf8');
}

// 修改chat_request处理部分
function modifyAppJs() {
  // 先备份原文件
  const backupPath = backupOriginalFile();
  
  // 读取文件内容
  let content = readAppFile();
  
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
  const chatRequestRegex = /\/\/ 处理聊天请求\s*else if \(data\.type === 'chat_request'\) {[\s\S]*?(?=\s*}[\s\S]*?catch \(error\) {)/m;
  
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
  
  content = content.replace(chatRequestRegex, newChatRequestCode);
  
  // 写入修改后的内容
  fs.writeFileSync(APP_JS_PATH, content, 'utf8');
  console.log(`已成功修改 ${APP_JS_PATH}`);
  console.log(`原文件已备份到 ${backupPath}`);
  
  return {
    success: true,
    backupPath
  };
}

// 执行修改
try {
  const result = modifyAppJs();
  console.log('修改完成:', result);
} catch (error) {
  console.error('修改失败:', error);
} 
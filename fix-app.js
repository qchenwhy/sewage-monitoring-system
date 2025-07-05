/**
 * app.js修复脚本
 * 正确替换聊天请求处理逻辑，确保语法正确
 */

const fs = require('fs');
const path = require('path');

// app.js文件路径
const APP_JS_PATH = path.join(__dirname, 'app.js');

// 备份原文件
function backupOriginalFile() {
  const backupDir = path.join(__dirname, 'backups', 'fixes');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  const backupPath = path.join(backupDir, `app.js.bak-${Date.now()}`);
  console.log(`备份原始app.js文件到 ${backupPath}`);
  fs.copyFileSync(APP_JS_PATH, backupPath);
  return backupPath;
}

// 导入消息分类器模块
function addClassifierImport() {
  console.log('添加消息分类器模块导入...');
  let content = fs.readFileSync(APP_JS_PATH, 'utf8');
  
  // 检查是否已经导入
  if (content.includes('require(\'./message-classifier\')')) {
    console.log('消息分类器已导入，跳过此步骤');
    return content;
  }
  
  // 添加导入语句
  const importCode = `
// 引入消息分类模块
const { classifyMessage, callDifyAPI } = require('./message-classifier');`;
  
  // 在require语句之后添加
  const lastRequireIndex = content.lastIndexOf('require(');
  const lastRequireEndIndex = content.indexOf(';', lastRequireIndex) + 1;
  
  content = content.substring(0, lastRequireEndIndex) + 
            importCode + 
            content.substring(lastRequireEndIndex);
  
  console.log('成功添加导入语句');
  return content;
}

// 替换聊天处理部分
function replaceMessageHandler(content) {
  console.log('替换聊天请求处理部分...');
  
  // 定位chat_request处理部分
  const handlerStartPattern = /\/\/ 处理聊天请求\s*else if \(data\.type === 'chat_request'\) {/;
  const handlerStart = content.match(handlerStartPattern);
  
  if (!handlerStart) {
    console.error('无法找到聊天请求处理部分');
    return content;
  }
  
  console.log(`找到聊天请求处理部分，索引位置: ${handlerStart.index}`);
  
  // 找到处理块的开始和结束
  const startIndex = handlerStart.index;
  let braceCount = 0;
  let endIndex = startIndex;
  
  // 从处理块开始查找匹配的结束括号
  for (let i = startIndex; i < content.length; i++) {
    if (content[i] === '{') {
      braceCount++;
    } else if (content[i] === '}') {
      braceCount--;
      if (braceCount === 0) {
        // 找到匹配的结束括号
        endIndex = i + 1;
        break;
      }
    }
  }
  
  if (endIndex === startIndex) {
    console.error('无法确定聊天请求处理部分的结束位置');
    return content;
  }
  
  console.log(`找到处理块结束位置，索引: ${endIndex}`);
  
  // 提取原始处理块
  const originalHandler = content.substring(startIndex, endIndex);
  console.log(`原始处理块长度: ${originalHandler.length} 字符`);
  
  // 新的处理逻辑
  const newHandler = `// 处理聊天请求
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
  
  // 替换处理块
  const newContent = content.substring(0, startIndex) + newHandler + content.substring(endIndex);
  console.log('成功替换处理块');
  return newContent;
}

// 执行修复
function fixAppJs() {
  try {
    // 备份原文件
    const backupPath = backupOriginalFile();
    
    // 添加导入语句
    let content = addClassifierImport();
    
    // 替换消息处理逻辑
    content = replaceMessageHandler(content);
    
    // 写入修改后的内容
    fs.writeFileSync(APP_JS_PATH, content, 'utf8');
    
    console.log(`修复完成！原文件已备份到 ${backupPath}`);
    return true;
  } catch (error) {
    console.error('修复失败:', error.message);
    console.error(error.stack);
    return false;
  }
}

// 执行修复
fixAppJs(); 
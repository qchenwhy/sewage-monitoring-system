require('dotenv').config();

// 简单使用node-fetch，不使用任何代理
const { fetch } = require('undici');

const express = require('express');
const mqtt = require('mqtt');
const mysql = require('mysql2');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { Readable } = require('stream');
const multer = require('multer');
const FormData = require('form-data');
const ffmpeg = require('fluent-ffmpeg');

// 创建Express应用
const app = express();

// 启用CORS和JSON解析中间件
app.use(cors());
app.use(express.json());

// 提供静态文件服务
app.use(express.static('public'));
app.use('/audio', express.static('audio')); // 添加音频文件静态服务
app.use('/recordings', express.static('public/recordings')); // 添加录音文件静态服务

// 添加根路由，返回HTML页面
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.get('/timer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/timer.html'));
});

app.get('/speech', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/speech-recognition.html'));
});

// 添加一个测试路由
app.get('/test', (req, res) => {
  res.send('服务器正常运行');
});

// 创建MySQL连接
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '753456Chen*',  // 替换为您的MySQL密码
  database: 'mqtt_data'
});

// 添加数据库连接错误处理
connection.connect((err) => {
  if (err) {
    console.error('数据库连接失败:', err);
    return;
  }
  console.log('数据库连接成功');
});

// 创建一个空的 mqttClient 对象，避免其他代码报错
const mqttClient = {
  end: () => {},
  on: () => {}
};

// 连接MQTT服务器
/*
const mqttClient = mqtt.connect('mqtt://localhost:1883', {
  username: 'wzh',
  password: '753456'
});

// 添加MQTT错误处理
mqttClient.on('error', (err) => {
  console.error('MQTT连接错误:', err);
});

mqttClient.on('offline', () => {
  console.log('MQTT连接断开，尝试重连...');
});

mqttClient.on('reconnect', () => {
  console.log('MQTT正在重连...');
});

// MQTT订阅主题
mqttClient.on('connect', () => {
  console.log('已连接到MQTT服务器');
  mqttClient.subscribe('sensor/data', (err) => {
    if (!err) {
      console.log('已订阅sensor/data主题');
    } else {
      console.error('订阅主题失败:', err);
    }
  });
});
*/

// 创建HTTP服务器
const server = http.createServer(app);

// 创建WebSocket服务器
const wss = new WebSocket.Server({ server });

// WebSocket客户端列表
const clients = new Set();

// WebSocket连接处理
wss.on('connection', (ws) => {
  console.log('WebSocket客户端已连接');
  
  // 添加到客户端列表
  clients.add(ws);
  
  // 当收到MQTT消息时，发送给所有WebSocket客户端
  const sendDataToClients = (data) => {
    // 发送给当前连接
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  };
  
  // 处理WebSocket客户端消息
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      // 处理TTS请求
      if (data.type === 'tts_request') {
        console.log('收到TTS请求:', data.text ? data.text.substring(0, 50) + '...' : '无文本');
        
        if (!data.text) {
          ws.send(JSON.stringify({
            type: 'tts_response',
            success: false,
            requestId: data.requestId,
            error: '文本不能为空'
          }));
          return;
        }
        
        try {
          // 调用语音合成
          const result = await synthesizeSpeech(data.text, {
            voice: data.voice || 'longxiaochun',
            format: 'mp3',
            sampleRate: 22050
          });
          
          // 发送成功响应
          ws.send(JSON.stringify({
            type: 'tts_response',
            success: true,
            requestId: data.requestId,
            audioUrl: result.audioUrl
          }));
        } catch (error) {
          console.error('语音合成失败:', error);
          
          // 发送错误响应
          ws.send(JSON.stringify({
            type: 'tts_response',
            success: false,
            requestId: data.requestId,
            error: error.message
          }));
        }
      }
      
      // 处理聊天请求
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
        
        // 这里可以调用Dify API并将结果通过WebSocket发送回客户端
        // 为简化示例，这里省略具体实现
      }
    } catch (error) {
      console.error('处理WebSocket消息失败:', error);
      
      // 发送错误响应
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message
      }));
    }
  });
  
  // 处理WebSocket关闭
  ws.on('close', () => {
    console.log('WebSocket客户端已断开');
    clients.delete(ws); // 从客户端列表移除
  });
});

// 全局函数：将数据发送给所有WebSocket客户端
const sendDataToClients = (data) => {
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
};

// 添加在其他路由之前
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 优化API端点
app.get('/api/data', (req, res) => {
  const limit = parseInt(req.query.limit) || 10; // 允许通过查询参数指定返回数量
  const sql = 'SELECT * FROM sensor_data ORDER BY timestamp DESC LIMIT ?';
  
  connection.query(sql, [limit], (error, results) => {
    if (error) {
      console.error('查询错误:', error);
      res.status(500).json({ error: '数据库查询错误' });
    } else {
      res.json(results);
    }
  });
});

// 添加Dify API配置
const DIFY_API_KEY = process.env.DIFY_API_KEY || 'your-dify-api-key';
const DIFY_API_URL = process.env.DIFY_API_URL || 'https://api.dify.ai/v1';

// Dify API集成
app.post('/api/chat', async (req, res) => {
  const { query, conversation_id, user, files, round_id } = req.body;
  
  if (!query) {
    return res.status(400).json({ error: '查询内容不能为空' });
  }
  
  if (!user) {
    return res.status(400).json({ error: '用户标识不能为空' });
  }
  
  console.log(`========== 聊天请求开始 ==========`);
  console.log(`查询内容: "${query}"`);
  console.log(`会话ID: "${conversation_id || '无'}" (${conversation_id ? '已提供' : '未提供'})`);
  console.log(`用户标识: "${user}"`);
  console.log(`对话轮次ID: "${round_id || '无'}"`);
  console.log(`附件数量: ${files ? files.length : 0}`);
  
  try {
    // 准备请求数据
    const requestData = {
      inputs: {},
      query: query,
      response_mode: "streaming",
      user: user, // 使用客户端提供的稳定用户标识
      files: files ? files.map(file => ({
        type: file.type || "image",
        transfer_method: file.transfer_method || "remote_url",
        url: file.url
      })) : []
    };
    
    // 只有存在且非空且不是自定义格式时才添加会话ID
    if (conversation_id && !conversation_id.startsWith('chat_session_')) {
      requestData.conversation_id = conversation_id;
    }
    
    console.log(`发送到Dify的完整数据: ${JSON.stringify(requestData)}`);
    console.log(`API端点: ${process.env.DIFY_API_URL}/chat-messages`);
    
    // 发送请求到Dify API
    const response = await fetch(`${process.env.DIFY_API_URL}/chat-messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DIFY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });
    
    // 检查响应状态
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Dify API错误: ${response.status} ${errorText}`);
      
      // 如果是会话不存在错误，返回详细信息给客户端
      if (response.status === 404 && errorText.includes("Conversation Not Exists")) {
        console.error('会话ID不存在，客户端将尝试重置会话ID');
      }
      
      // 返回原始错误给客户端，保留状态码
      return res.status(response.status).json({ 
        error: '聊天服务错误', 
        message: errorText,
        status: response.status
      });
    }
    
    // 检查响应内容类型
    const contentType = response.headers.get('Content-Type');
    
    // 流式响应处理
    if (contentType && contentType.includes('text/event-stream')) {
      // 设置响应头
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      
      // 检查客户端连接状态
      req.on('close', () => {
        console.log('客户端连接已关闭');
      });
      
      // 定期检查连接状态
      const connectionCheck = setInterval(() => {
        if (res.writableEnded) {
          console.log('响应已结束，停止检查');
          clearInterval(connectionCheck);
        } else {
          console.log('连接状态: 正常');
        }
      }, 2000);
      
      // 处理数据流
      const processStream = async () => {
        try {
          console.log('开始处理Dify流式响应，支持文本和语音流');
          
          // 获取响应流
          const reader = response.body.getReader();
          
          // 初始化文本处理变量
          let currentText = '';
          let lastSynthesizedLength = 0;
          const minChunkSize = 10; // 最小合成长度，约10个字符
          let textBuffer = '';
          let fullText = '';
          let taskId = null; // 添加任务ID变量
          
          // 添加全局计数器，跟踪合成次数
          let synthesisCount = 0;
          
          console.log('初始化文本处理变量: currentText="", lastSynthesizedLength=0, minChunkSize=10, textBuffer="", fullText=""');
          
          // 处理数据块
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              console.log(`Dify API流式响应结束`);
              
              // 不在这里处理剩余文本，因为message_end事件应该已经处理过了
              // 如果没有收到message_end事件，再处理剩余文本
              if (textBuffer.length > 0) {
                console.log(`检测到流结束但未收到message_end事件，处理剩余文本: "${textBuffer}"`);
                
                try {
                  // 合成剩余文本
                  const ttsResult = await synthesizeSpeech(textBuffer, {
                    voice: 'longxiaochun',
                    format: 'mp3',
                    sampleRate: 22050
                  });
                  
                  // 确保音频文件可访问
                  ensureAudioFileAccessible(ttsResult.audioUrl);
                  
                    // 发送音频URL到客户端
                    const audioEvent = {
                      event: 'audio',
                    url: ttsResult.audioUrl,
                    text: textBuffer,
                      isFinal: true
                    };
                  
                  console.log(`发送最终音频事件: ${JSON.stringify(audioEvent)}`);
                    res.write(`data: ${JSON.stringify(audioEvent)}\n\n`);
                    if (res.flush) res.flush();
                } catch (ttsError) {
                  console.error('最终语音合成失败:', ttsError);
                }
              }
              
              // 确保发送结束事件
              const endEvent = {
                event: 'message_end'
              };
              res.write(`data: ${JSON.stringify(endEvent)}\n\n`);
              res.end();
              break;
            }
            
            // 将二进制数据转换为文本
            const chunkText = new TextDecoder().decode(value);
            console.log(`收到数据块: ${chunkText.length} 字节`);
            
            // 处理SSE格式的数据
            const lines = chunkText.split('\n\n');
            for (const line of lines) {
              if (line.trim().startsWith('data:')) {
                const eventData = line.trim().substring(5).trim();
                if (eventData) {
                  try {
                    // 解析事件数据
                    const eventObj = JSON.parse(eventData);
                    console.log(`收到事件: ${eventObj.event}`);
                    
                    // 捕获任务ID (如果存在且尚未捕获)
                    if (eventObj.task_id && !taskId) {
                      taskId = eventObj.task_id;
                      console.log(`捕获到Dify任务ID: ${taskId}`);
                    }
                    
                    // 如果是消息事件，提取文本并发送到TTS服务
                    if (eventObj.event === 'message' && eventObj.answer) {
                      // 确保消息事件中包含任务ID
                      if (taskId && !eventObj.task_id) {
                        eventObj.task_id = taskId;
                        console.log(`向消息事件添加任务ID: ${taskId}`);
                      }
                      
                      console.log(`收到消息文本: ${eventObj.answer.substring(0, 50)}...`);
                      
                      // 更新当前文本
                      currentText = eventObj.answer;
                      console.log(`当前文本长度: ${currentText.length}, 已合成长度: ${lastSynthesizedLength}`);
                      
                      // 如果返回了会话ID，记录下来
                      if (eventObj.conversation_id) {
                        console.log(`Dify返回的会话ID: ${eventObj.conversation_id} (UUID格式)`);
                      } else {
                        console.log(`Dify未返回会话ID`);
                      }
                      
                      // 添加当前文本到缓冲区
                      textBuffer += currentText;
                      console.log(`文本缓冲区: "${textBuffer}"`);
                      
                      // 如果有新增文本，进行处理
                      if (textBuffer.length > 0) {
                        // 使用新的分段逻辑
                        const segments = splitTextByPunctuation(textBuffer, minChunkSize);
                        
                        if (segments.length > 0) {
                          // 保留最后一段，其余的进行合成
                          const textsToSynthesize = segments.slice(0, -1);
                          textBuffer = segments[segments.length - 1];
                          
                          // 对每个分段进行语音合成
                          for (const textToSynthesize of textsToSynthesize) {
                            try {
                              console.log(`开始语音合成: "${textToSynthesize}"`);
                              const ttsResult = await synthesizeSpeech(textToSynthesize, {
                                voice: 'longxiaochun',
                                format: 'mp3',
                                sampleRate: 22050,
                                roundId: round_id // 传递对话轮次ID
                              });
                              
                              // 确保音频文件可访问
                              ensureAudioFileAccessible(ttsResult.audioUrl);
                              
                              // 发送音频URL到客户端
                              const audioEvent = {
                                event: 'audio',
                                url: ttsResult.audioUrl,
                                text: textToSynthesize,
                                isFinal: false,
                                roundId: ttsResult.roundId // 添加对话轮次ID
                              };
                              
                              console.log(`发送音频事件: ${JSON.stringify(audioEvent)}`);
                              res.write(`data: ${JSON.stringify(audioEvent)}\n\n`);
                              if (res.flush) res.flush();
                              
                              // 更新已合成的长度
                              lastSynthesizedLength += textToSynthesize.length;
                            } catch (error) {
                              console.error('语音合成失败:', error);
                            }
                          }
                        }
                      }
                    } else if (eventObj.event === 'message_end') {
                      console.log('收到message_end事件，文本流结束');
                      
                      // 确保结束事件中包含任务ID
                      if (taskId && !eventObj.task_id) {
                        eventObj.task_id = taskId;
                        console.log(`向结束事件添加任务ID: ${taskId}`);
                      }
                      
                      // 处理剩余文本
                      if (textBuffer.length > 0) {
                        try {
                          console.log(`合成剩余文本: "${textBuffer}"`);
                          
                          // 直接合成整个剩余文本，不再使用分段逻辑
                          const ttsResult = await synthesizeSpeech(textBuffer, {
                                  voice: 'longxiaochun',
                                  format: 'mp3',
                                  sampleRate: 22050,
                                  roundId: round_id // 传递对话轮次ID
                                });
                                
                                // 确保音频文件可访问
                                ensureAudioFileAccessible(ttsResult.audioUrl);
                                
                                // 发送音频URL到客户端
                                const audioEvent = {
                                  event: 'audio',
                                  url: ttsResult.audioUrl,
                                  text: textBuffer,
                                  isFinal: true,
                                  roundId: ttsResult.roundId // 添加对话轮次ID
                                };
                                
                          console.log(`发送最终音频事件: ${JSON.stringify(audioEvent)}`);
                                res.write(`data: ${JSON.stringify(audioEvent)}\n\n`);
                                if (res.flush) res.flush();
                                
                          // 清空文本缓冲区
                          textBuffer = '';
                        } catch (error) {
                          console.error('处理剩余文本失败:', error);
                        }
                      }
                    }
                    
                    // 最后再次确保所有事件都包含任务ID
                    if (taskId && !eventObj.task_id) {
                      eventObj.task_id = taskId;
                    }
                    
                    // 发送原始数据到客户端
                    const modifiedEventData = JSON.stringify(eventObj);
                    res.write(`data: ${modifiedEventData}\n\n`);
                    // 添加刷新，确保数据立即发送到客户端
                    if (res.flush) {
                      res.flush();
                    }
                  } catch (e) {
                    console.error('解析事件数据失败:', e, eventData);
                    // 尝试发送原始数据
                    res.write(`data: ${eventData}\n\n`);
                    if (res.flush) res.flush();
                  }
                }
              }
            }
          }
        } catch (error) {
          console.error('流处理错误:', error);
          
          // 发送错误事件
          const errorEvent = {
            event: 'error',
            message: error.message,
            status: 500,
            code: 'stream_processing_error'
          };
          res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
          res.end();
        }
      };
      
      // 开始处理流
      processStream();
    } else {
      // 非流式响应
      const data = await response.json();
      console.log('收到Dify API非流式响应');
      res.json(data);
    }
  } catch (error) {
    console.error('聊天请求失败:', error);
    res.status(500).json({ 
      error: '聊天服务错误', 
      message: error.message
    });
  }
});

// 添加停止响应API
app.post('/api/chat/:task_id/stop', async (req, res) => {
  const { task_id } = req.params;
  const { user } = req.body;
  
  if (!task_id) {
    return res.status(400).json({ error: '任务ID不能为空' });
  }
  
  if (!user) {
    return res.status(400).json({ error: '用户标识不能为空' });
  }
  
  try {
    console.log(`停止任务: ${task_id}`);
    
    // 发送请求到Dify API
    const response = await fetch(`${process.env.DIFY_API_URL}/chat-messages/${task_id}/stop`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DIFY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ user })
    });
    
    // 检查响应状态
    if (!response.ok) {
      const errorText = await response.text();
      console.error('停止任务失败:', response.status, errorText);
      return res.status(response.status).json({ 
        error: '停止任务失败', 
        message: errorText
      });
    }
    
    // 返回结果
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('停止任务请求失败:', error);
    res.status(500).json({ 
      error: '停止任务失败', 
      message: error.message
    });
  }
});

// 添加消息反馈API
app.post('/api/messages/:message_id/feedbacks', async (req, res) => {
  const { message_id } = req.params;
  const { rating, user, content } = req.body;
  
  if (!message_id) {
    return res.status(400).json({ error: '消息ID不能为空' });
  }
  
  if (!user) {
    return res.status(400).json({ error: '用户标识不能为空' });
  }
  
  try {
    console.log(`提交消息反馈: ${message_id}, 评分: ${rating}`);
    
    // 发送请求到Dify API
    const response = await fetch(`${process.env.DIFY_API_URL}/messages/${message_id}/feedbacks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DIFY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ rating, user, content })
    });
    
    // 检查响应状态
    if (!response.ok) {
      const errorText = await response.text();
      console.error('提交反馈失败:', response.status, errorText);
      return res.status(response.status).json({ 
        error: '提交反馈失败', 
        message: errorText
      });
    }
    
    // 返回结果
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('提交反馈请求失败:', error);
    res.status(500).json({ 
      error: '提交反馈失败', 
      message: error.message
    });
  }
});

// 获取会话历史消息
app.get('/api/messages', async (req, res) => {
  const { conversation_id, user, first_id, limit } = req.query;
  
  if (!user) {
    return res.status(400).json({ error: '用户标识不能为空' });
  }
  
  try {
    // 构建查询参数
    const params = new URLSearchParams();
    if (conversation_id) params.append('conversation_id', conversation_id);
    params.append('user', user);
    if (first_id) params.append('first_id', first_id);
    if (limit) params.append('limit', limit);
    
    console.log(`获取会话历史消息: ${params.toString()}`);
    
    // 发送请求到Dify API
    const response = await fetch(`${process.env.DIFY_API_URL}/messages?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.DIFY_API_KEY}`
      }
    });
    
    // 检查响应状态
    if (!response.ok) {
      const errorText = await response.text();
      console.error('获取历史消息失败:', response.status, errorText);
      return res.status(response.status).json({ 
        error: '获取历史消息失败', 
        message: errorText
      });
    }
    
    // 返回结果
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('获取历史消息请求失败:', error);
    res.status(500).json({ 
      error: '获取历史消息失败', 
      message: error.message
    });
  }
});

// 获取会话列表
app.get('/api/conversations', async (req, res) => {
  const { user, last_id, limit, sort_by } = req.query;
  
  if (!user) {
    return res.status(400).json({ error: '用户标识不能为空' });
  }
  
  try {
    // 构建查询参数
    const params = new URLSearchParams();
    params.append('user', user);
    if (last_id) params.append('last_id', last_id);
    if (limit) params.append('limit', limit);
    if (sort_by) params.append('sort_by', sort_by);
    
    console.log(`获取会话列表: ${params.toString()}`);
    
    // 发送请求到Dify API
    const response = await fetch(`${process.env.DIFY_API_URL}/conversations?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.DIFY_API_KEY}`
      }
    });
    
    // 检查响应状态
    if (!response.ok) {
      const errorText = await response.text();
      console.error('获取会话列表失败:', response.status, errorText);
      return res.status(response.status).json({ 
        error: '获取会话列表失败', 
        message: errorText
      });
    }
    
    // 返回结果
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('获取会话列表请求失败:', error);
    res.status(500).json({ 
      error: '获取会话列表失败', 
      message: error.message
    });
  }
});

// 删除会话
app.delete('/api/conversations/:conversation_id', async (req, res) => {
  const { conversation_id } = req.params;
  const { user } = req.body;
  
  if (!conversation_id) {
    return res.status(400).json({ error: '会话ID不能为空' });
  }
  
  if (!user) {
    return res.status(400).json({ error: '用户标识不能为空' });
  }
  
  try {
    console.log(`删除会话: ${conversation_id}`);
    
    // 发送请求到Dify API
    const response = await fetch(`${process.env.DIFY_API_URL}/conversations/${conversation_id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${process.env.DIFY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ user })
    });
    
    // 检查响应状态
    if (!response.ok) {
      const errorText = await response.text();
      console.error('删除会话失败:', response.status, errorText);
      return res.status(response.status).json({ 
        error: '删除会话失败', 
        message: errorText
      });
    }
    
    // 返回结果
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('删除会话请求失败:', error);
    res.status(500).json({ 
      error: '删除会话失败', 
      message: error.message
    });
  }
});

// 获取应用参数
app.get('/api/parameters', async (req, res) => {
  try {
    console.log('获取应用参数');
    
    // 发送请求到Dify API
    const response = await fetch(`${process.env.DIFY_API_URL}/parameters`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.DIFY_API_KEY}`
      }
    });
    
    // 检查响应状态
    if (!response.ok) {
      const errorText = await response.text();
      console.error('获取应用参数失败:', response.status, errorText);
      return res.status(response.status).json({ 
        error: '获取应用参数失败', 
        message: errorText
      });
    }
    
    // 返回结果
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('获取应用参数请求失败:', error);
    res.status(500).json({ 
      error: '获取应用参数失败', 
      message: error.message
    });
  }
});

// 添加流式对话API端点
app.post('/api/chat/stream', async (req, res) => {
  const { message, systemPrompt } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: '消息不能为空' });
  }
  
  // 设置响应头，支持流式传输
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // 检查客户端连接状态
  req.on('close', () => {
    console.log('客户端连接已关闭');
  });
  
  // 定期检查连接状态
  const connectionCheck = setInterval(() => {
    if (res.writableEnded) {
      console.log('响应已结束，停止检查');
      clearInterval(connectionCheck);
    } else {
      console.log('连接状态: 正常');
    }
  }, 2000);
  
  try {
    console.log(`开始流式对话合成: "${message.substring(0, 50)}..."`);
    
    // 分割文本为句子
    const sentences = message.match(/[^。！？.!?]+[。！？.!?]+/g) || [message];
    
    const audioUrls = [];
    
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      if (sentence.length === 0) continue;
      
      console.log(`处理第${i+1}/${sentences.length}个句子: "${sentence.substring(0, 50)}..."`);
      
      try {
        // 调用语音合成
        const result = await synthesizeSpeech(sentence, {
          voice: 'longxiaochun',
          format: 'mp3',
          sampleRate: 22050
        });
        
        // 存储音频URL
        audioUrls.push(result.audioUrl);
        
        // 确保音频文件可访问
        ensureAudioFileAccessible(result.audioUrl);
        
        // 发送音频URL到客户端
        const audioEvent = {
          event: 'audio',
          url: result.audioUrl,
          text: sentence,
          index: i,
          total: sentences.length,
          isFinal: i === sentences.length - 1
        };
        
        // 添加调试信息
        console.log(`发送音频事件: ${JSON.stringify(audioEvent)}`);
        
        // 确保数据格式正确
        const eventData = `data: ${JSON.stringify(audioEvent)}\n\n`;
        
        // 使用try-catch包装写入操作
        try {
          res.write(eventData);
          console.log(`成功写入事件数据: ${eventData.length} 字节`);
        } catch (writeError) {
          console.error(`写入事件数据失败: ${writeError.message}`);
        }
        
        // 确保数据被发送出去
        try {
          if (res.flush) {
            res.flush();
            console.log('成功刷新响应缓冲区');
          }
        } catch (flushError) {
          console.error(`刷新响应缓冲区失败: ${flushError.message}`);
        }
        
        // 添加延迟确保客户端有时间处理
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`第${i+1}次语音合成失败:`, error);
      }
    }
    
    // 在最后一个音频发送后，再次发送一个汇总事件
    if (i === sentences.length - 1) {
      const summaryEvent = {
        event: 'audio_summary',
        urls: audioUrls, // 存储所有生成的音频URL
        count: sentences.length
      };
      console.log(`发送音频汇总事件: ${JSON.stringify(summaryEvent)}`);
      
      // 使用try-catch包装写入操作
      try {
        res.write(`data: ${JSON.stringify(summaryEvent)}\n\n`);
        console.log('成功写入音频汇总事件');
        if (res.flush) res.flush();
      } catch (summaryError) {
        console.error(`发送音频汇总事件失败: ${summaryError.message}`);
      }
    }
  } catch (error) {
    console.error('流式对话合成失败:', error);
    
    // 发送错误事件
    const errorEvent = {
      event: 'error',
      message: error.message,
      status: 500,
      code: 'tts_stream_error'
    };
    res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
    res.end();
    clearInterval(connectionCheck);
  }
});

// 添加获取提示词模板API
app.get('/api/prompts', (req, res) => {
  const sql = 'SELECT * FROM prompt_templates ORDER BY name';
  connection.query(sql, (error, results) => {
    if (error) {
      console.error('查询提示词模板失败:', error);
      res.status(500).json({ error: '数据库查询错误' });
    } else {
      res.json(results);
    }
  });
});

// 添加保存提示词模板API
app.post('/api/prompts', (req, res) => {
  const { name, content } = req.body;
  
  if (!name || !content) {
    return res.status(400).json({ error: '名称和内容不能为空' });
  }
  
  const sql = 'INSERT INTO prompt_templates (name, content) VALUES (?, ?)';
  connection.query(sql, [name, content], (error, results) => {
    if (error) {
      console.error('保存提示词模板失败:', error);
      res.status(500).json({ error: '数据库操作错误' });
    } else {
      res.json({ id: results.insertId, name, content });
    }
  });
});

// 添加优雅退出处理
process.on('SIGINT', () => {
  mqttClient.end();
  connection.end((err) => {
    if (err) {
      console.error('关闭数据库连接时出错:', err);
    }
    process.exit();
  });
});

// 数据模型API
// 获取所有数据模型
app.get('/api/datamodels', (req, res) => {
  const sql = 'SELECT * FROM data_models ORDER BY name';
  connection.query(sql, (error, results) => {
    if (error) {
      console.error('查询数据模型失败:', error);
      res.status(500).json({ error: '数据库查询错误' });
    } else {
      res.json(results);
    }
  });
});

// 创建数据模型
app.post('/api/datamodels', (req, res) => {
  const { name, identifier, type, accessType, isStored, storageType, storageInterval, hasAlarm, alarmCondition, alarmValue } = req.body;
  
  if (!name || !identifier || !type || !accessType) {
    return res.status(400).json({ error: '所有字段都是必填的' });
  }
  
  const sql = 'INSERT INTO data_models (name, identifier, type, accessType, isStored, storageType, storageInterval, hasAlarm, alarmCondition, alarmValue) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  connection.query(sql, [name, identifier, type, accessType, isStored, storageType, storageInterval, hasAlarm, alarmCondition, alarmValue], (error, results) => {
    if (error) {
      console.error('创建数据模型失败:', error);
      res.status(500).json({ error: '数据库操作错误' });
    } else {
      res.status(201).json({ id: results.insertId, name, identifier, type, accessType, isStored, storageType, storageInterval, hasAlarm, alarmCondition, alarmValue });
    }
  });
});

// 更新数据模型
app.put('/api/datamodels/:id', (req, res) => {
  const { id } = req.params;
  const { name, identifier, type, accessType, isStored, storageType, storageInterval, hasAlarm, alarmCondition, alarmValue } = req.body;
  
  if (!name || !identifier || !type || !accessType) {
    return res.status(400).json({ error: '所有字段都是必填的' });
  }
  
  const sql = 'UPDATE data_models SET name = ?, identifier = ?, type = ?, accessType = ?, isStored = ?, storageType = ?, storageInterval = ?, hasAlarm = ?, alarmCondition = ?, alarmValue = ? WHERE id = ?';
  connection.query(sql, [name, identifier, type, accessType, isStored, storageType, storageInterval, hasAlarm, alarmCondition, alarmValue, id], (error, results) => {
    if (error) {
      console.error('更新数据模型失败:', error);
      res.status(500).json({ error: '数据库操作错误' });
    } else if (results.affectedRows === 0) {
      res.status(404).json({ error: '数据模型不存在' });
    } else {
      res.json({ id, name, identifier, type, accessType, isStored, storageType, storageInterval, hasAlarm, alarmCondition, alarmValue });
    }
  });
});

// 删除数据模型
app.delete('/api/datamodels/:id', (req, res) => {
  const { id } = req.params;
  
  const sql = 'DELETE FROM data_models WHERE id = ?';
  connection.query(sql, [id], (error, results) => {
    if (error) {
      console.error('删除数据模型失败:', error);
      res.status(500).json({ error: '数据库操作错误' });
    } else if (results.affectedRows === 0) {
      res.status(404).json({ error: '数据模型不存在' });
    } else {
      res.status(204).send();
    }
  });
});

// 存储所有活动计时器
const activeTimers = new Map();

// 创建计时器API
app.post('/api/timers', (req, res) => {
  const { title, duration, message } = req.body;
  
  if (!title || !duration || !message) {
    return res.status(400).json({ error: '标题、时长和消息都是必填的' });
  }
  
  // 记录请求来源
  console.log('计时器请求来源:', req.get('User-Agent') || '未知');
  
  // 生成唯一ID
  const timerId = Date.now().toString();
  
  // 计算结束时间
  const endTime = Date.now() + (duration * 1000);
  
  // 创建计时器
  const timer = {
    id: timerId,
    title,
    duration,
    message,
    endTime,
    status: 'active'
  };
  
  // 存储计时器
  activeTimers.set(timerId, timer);
  
  // 设置定时器
  setTimeout(() => {
    // 更新状态
    timer.status = 'completed';
    
    // 广播到所有WebSocket客户端
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'timer_completed',
          timer: {
            id: timer.id,
            title: timer.title,
            message: timer.message
          }
        }));
      }
    });
    
    // 记录到数据库
    const sql = 'INSERT INTO timer_history (timer_id, title, message, completed_at) VALUES (?, ?, ?, NOW())';
    connection.query(sql, [timer.id, timer.title, timer.message], (error) => {
      if (error) {
        console.error('保存计时器历史记录失败:', error);
      }
    });
    
    console.log(`计时器 "${timer.title}" 已完成，消息: "${timer.message}"`);
    
  }, duration * 1000);
  
  // 返回计时器信息
  res.status(201).json(timer);
});

// 获取所有活动计时器
app.get('/api/timers', (req, res) => {
  const timers = Array.from(activeTimers.values());
  res.json(timers);
});

// 取消计时器
app.delete('/api/timers/:id', (req, res) => {
  const { id } = req.params;
  
  if (!activeTimers.has(id)) {
    return res.status(404).json({ error: '计时器不存在' });
  }
  
  // 删除计时器
  activeTimers.delete(id);
  
  res.status(204).send();
});

// 阿里云DashScope API Key
const ALIYUN_DASHSCOPE_API_KEY = process.env.ALIYUN_DASHSCOPE_API_KEY || 'your-dashscope-api-key';

// 确保音频目录存在
const audioDir = path.join(__dirname, 'public', 'audio');
const recordingsDir = path.join(__dirname, 'public', 'recordings'); // 新增录音文件目录

if (!fs.existsSync(audioDir)) {
  console.log(`创建音频目录: ${audioDir}`);
  fs.mkdirSync(audioDir, { recursive: true });
}

if (!fs.existsSync(recordingsDir)) {
  console.log(`创建录音目录: ${recordingsDir}`);
  fs.mkdirSync(recordingsDir, { recursive: true });
}

// 使用WebSocket调用CosyVoice语音合成
async function synthesizeSpeech(text, options = {}) {
  return new Promise((resolve, reject) => {
    const taskId = uuidv4();
    const timestamp = Date.now();
    
    // 构建文件名，加入轮次ID（如果存在）
    let fileName = `tts_${timestamp}`;
    if (options.roundId) {
      fileName += `_round_${options.roundId}`;
    }
    fileName += '.mp3';
    
    const filePath = path.join(audioDir, fileName);
    
    // 创建一个空文件
    fs.writeFileSync(filePath, Buffer.alloc(0));
    
    console.log('==================== WebSocket语音合成开始 ====================');
    console.log(`合成文本: "${text}"`);
    console.log(`任务ID: ${taskId}`);
    console.log(`轮次ID: ${options.roundId || '未指定'}`);
    console.log(`输出文件: ${filePath}`);
    
    // 连接WebSocket
    console.log('正在连接WebSocket服务器: wss://dashscope.aliyuncs.com/api-ws/v1/inference');
    const ws = new WebSocket('wss://dashscope.aliyuncs.com/api-ws/v1/inference', {
      headers: {
        'Authorization': `Bearer ${ALIYUN_DASHSCOPE_API_KEY}`
      }
    });
    
    let taskStarted = false;
    let audioReceived = false;
    let audioFrames = []; // 存储音频帧
    
    // 连接打开事件
    ws.on('open', () => {
      console.log('WebSocket连接已建立成功');
      
      // 发送run-task指令
      const runTaskCmd = {
        "header": {
          "action": "run-task",
          "task_id": taskId,
          "streaming": "duplex"
        },
        "payload": {
          "task_group": "audio",
          "task": "tts",
          "function": "SpeechSynthesizer",
          "model": "cosyvoice-v1",
          "parameters": {
            "text_type": "PlainText",
            "voice": options.voice || "longxiaochun",
            "format": options.format || "mp3",
            "sample_rate": options.sampleRate || 22050,
            "volume": options.volume || 50,
            "rate": options.rate || 1,
            "pitch": options.pitch || 1
          },
          "input": {}
        }
      };
      
      console.log('发送run-task指令');
      ws.send(JSON.stringify(runTaskCmd));
    });
    
    // 消息接收事件
    ws.on('message', (data) => {
      // 检查是否为二进制数据
      if (data instanceof Buffer) {
        // 尝试解析为JSON (有时二进制数据实际上是JSON消息)
        try {
          const jsonStr = data.toString('utf8');
          const jsonData = JSON.parse(jsonStr);
          
          console.log('收到JSON消息:', JSON.stringify(jsonData, null, 2));
          
          if (jsonData.header && jsonData.header.event) {
            handleJsonMessage(jsonData);
          }
          return;
        } catch (e) {
          // 不是JSON，继续处理为二进制音频数据
        }
        
        console.log(`收到二进制音频数据: ${data.length} 字节`);
        
        // 将二进制数据存储到数组
        audioFrames.push(data);
        
        // 将二进制数据追加到文件
        fs.appendFileSync(filePath, data);
        audioReceived = true;
      } else {
        // 处理文本消息
        try {
          const message = JSON.parse(data.toString());
          console.log('收到文本消息:', JSON.stringify(message, null, 2));
          
          handleJsonMessage(message);
        } catch (error) {
          console.error('解析JSON消息失败:', error);
          console.error('原始消息:', data.toString());
        }
      }
    });
    
    // 处理JSON消息
    function handleJsonMessage(message) {
      if (message.header && message.header.event) {
        switch (message.header.event) {
          case 'task-started':
            console.log('语音合成任务已开始');
            taskStarted = true;
            
            // 发送continue-task指令
            const continueTaskCmd = {
              "header": {
                "action": "continue-task",
                "task_id": taskId,
                "streaming": "duplex"
              },
              "payload": {
                "input": {
                  "text": text
                }
              }
            };
            
            console.log('发送continue-task指令');
            ws.send(JSON.stringify(continueTaskCmd));
            
            // 发送finish-task指令
            const finishTaskCmd = {
              "header": {
                "action": "finish-task",
                "task_id": taskId,
                "streaming": "duplex"
              },
              "payload": {
                "input": {}
              }
            };
            
            console.log('发送finish-task指令');
            ws.send(JSON.stringify(finishTaskCmd));
            break;
            
          case 'task-finished':
            console.log('语音合成任务已完成');
            
            // 检查是否收到了音频数据
            if (audioReceived) {
              console.log('音频合成成功，关闭连接');
              ws.close();
              
              // 检查文件大小
              const fileSize = fs.statSync(filePath).size;
              console.log(`文件大小: ${fileSize} 字节`);
              
              if (fileSize > 0) {
                resolve({
                  success: true,
                  audioUrl: `/audio/${fileName}`,
                  streaming: true,
                  roundId: options.roundId // 返回轮次ID
                });
              } else {
                reject(new Error('生成的文件大小为0'));
              }
            } else {
              console.error('任务完成但未收到音频数据');
              ws.close();
              reject(new Error('任务完成但未收到音频数据'));
            }
            break;
            
          case 'task-failed':
            console.error('语音合成任务失败:', 
              message.header.error_code, 
              message.header.error_message);
            ws.close();
            reject(new Error(message.header.error_message || '语音合成失败'));
            break;
        }
      }
    }
    
    // 错误处理
    ws.on('error', (error) => {
      console.error('WebSocket错误:', error.message);
      reject(error);
    });
    
    // 连接关闭处理
    ws.on('close', (code, reason) => {
      console.log(`WebSocket连接已关闭: 代码=${code}, 原因=${reason || '未提供'}`);
      
      // 如果任务已开始但未完成，检查是否收到了音频数据
      if (taskStarted && audioReceived) {
        console.log('连接关闭但已收到音频数据，尝试返回文件');
        
        // 检查文件大小
        const fileSize = fs.statSync(filePath).size;
        console.log(`文件大小: ${fileSize} 字节`);
        
        if (fileSize > 0) {
          resolve({
            success: true,
            audioUrl: `/audio/${fileName}`,
            streaming: true,
            roundId: options.roundId // 返回轮次ID
          });
          return;
        }
      }
      
      if (!taskStarted) {
        reject(new Error('WebSocket连接已关闭，但任务尚未开始'));
      } else if (!audioReceived) {
        reject(new Error('WebSocket连接已关闭，但未收到音频数据'));
      } else {
        reject(new Error('WebSocket连接已关闭，但未能生成有效的音频文件'));
      }
    });
    
    // 设置任务超时处理
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        console.log('语音合成任务超时，关闭连接');
        ws.close();
        reject(new Error('语音合成任务超时'));
      }
    }, 30000); // 30秒超时
  });
}

// 文件上传处理
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // 确保recordings目录存在
    if (!fs.existsSync(recordingsDir)) {
      fs.mkdirSync(recordingsDir, { recursive: true });
    }
    cb(null, recordingsDir);
  },
  filename: function (req, file, cb) {
    // 使用时间戳和原始文件名，保持原始格式
    const timestamp = Date.now();
    const ext = file.originalname.split('.').pop();
    cb(null, `recording_${timestamp}.${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  // 只接受音频文件
  if (file.mimetype.startsWith('audio/')) {
    cb(null, true);
  } else {
    cb(new Error('只支持音频文件'));
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 15 * 1024 * 1024 // 限制15MB
  }
});

// 确保上传目录存在
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
}

// 文件上传API
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '没有上传文件' });
  }
  
  // 获取文件信息
  const file = req.file;
  
  // 生成公共URL
  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${file.filename}`;
  
  // 返回文件URL
  res.json({
                  success: true,
    url: fileUrl,
    filename: file.filename,
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size
  });
});

// 添加语音转文本API端点
app.post('/api/speech-to-text', upload.single('file'), async (req, res) => {
  let tempPcmFile = null;
  
  try {
    // 检查是否有文件上传
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: '没有上传文件'
      });
    }

    console.log('文件信息:', {
      文件名: req.file.originalname,
      保存路径: req.file.path,
      MIME类型: req.file.mimetype,
      文件大小: req.file.size
    });

    // 用户ID，默认为匿名
    const userId = req.body.user || 'anonymous';
    
    console.log(`处理模式: 完整识别, 用户ID: ${userId}`);

    // 转换音频为PCM格式
    tempPcmFile = path.join(recordingsDir, `temp_${Date.now()}.pcm`);
    
    await new Promise((resolve, reject) => {
      console.log(`开始将音频转换为PCM格式: ${req.file.path} -> ${tempPcmFile}`);
      
      // 首先检测文件格式
      ffmpeg.ffprobe(req.file.path, (err, metadata) => {
        if (err) {
          console.error('音频格式检测失败:', err);
          
          // 尝试用不同参数进行转换，即使格式检测失败
          console.log('尝试使用通用参数转换音频...');
          ffmpeg(req.file.path)
            .inputOptions(['-f', 'webm', '-acodec', 'libopus'])  // 强制指定输入格式和编解码器
            .outputOptions(['-ac', '1', '-ar', '16000'])  // 设置单声道，16kHz 采样率
            .format('s16le')  // PCM 16-bit little-endian
            .on('error', (convErr) => {
              console.error('备选方法音频转换失败:', convErr);
              
              // 最后尝试，使用更通用的方法
              ffmpeg(req.file.path)
                .inputOptions(['-f', 'lavfi', '-i', 'anullsrc=channel_layout=mono:sample_rate=16000'])
                .inputOptions(['-t', '0.01'])  // 创建一个短的空白音频
                .outputOptions(['-ac', '1', '-ar', '16000'])
                .format('s16le')
                .on('error', (finalErr) => {
                  console.error('所有转换方法均失败:', finalErr);
                  reject(finalErr);
                })
                .on('end', () => {
                  console.log('创建了空白PCM文件作为替代');
                  resolve();
                })
                .save(tempPcmFile);
            })
            .on('progress', (progress) => {
              console.log(`备选转换进度: ${progress.percent || 0}% 完成`);
            })
            .on('end', () => {
              console.log(`备选方法音频转换完成: ${tempPcmFile}`);
              
              // 验证文件是否存在
              if (fs.existsSync(tempPcmFile)) {
                const stats = fs.statSync(tempPcmFile);
                console.log(`PCM文件大小: ${stats.size} 字节`);
                if (stats.size === 0) {
                  reject(new Error('PCM文件大小为0字节'));
                  return;
                }
              } else {
                reject(new Error('PCM文件不存在'));
                return;
              }
              
              resolve();
            })
            .save(tempPcmFile);
          
          return;
        }
        
        // 如果成功探测到文件格式
        console.log('文件格式探测结果:', metadata.format.format_name);
        
        // 根据探测到的格式选择合适的转换参数
        let ffmpegCommand = ffmpeg(req.file.path);
        
        if (metadata.format.format_name.includes('webm')) {
          console.log('检测到WebM格式，使用特定参数');
          ffmpegCommand.inputOptions(['-acodec', 'libopus']);
        } else if (metadata.format.format_name.includes('ogg')) {
          console.log('检测到Ogg格式，使用特定参数');
          ffmpegCommand.inputOptions(['-acodec', 'libvorbis']);
        } else if (metadata.format.format_name.includes('mp3')) {
          console.log('检测到MP3格式，使用特定参数');
          ffmpegCommand.inputOptions(['-acodec', 'mp3']);
        } else if (metadata.format.format_name.includes('wav')) {
          console.log('检测到WAV格式，使用特定参数');
          ffmpegCommand.inputOptions(['-acodec', 'pcm_s16le']);
        }
        
        // 通用输出参数
        ffmpegCommand
          .toFormat('s16le') // PCM 16-bit little-endian
          .audioChannels(1) // 单声道
          .audioFrequency(16000) // 16kHz 采样率
          .on('error', (err) => {
            console.error('音频转换失败:', err);
            reject(err);
          })
          .on('progress', (progress) => {
            console.log(`转换进度: ${progress.percent || 0}% 完成`);
          })
          .on('end', () => {
            console.log(`音频转换完成: ${tempPcmFile}`);
            
            // 验证文件是否存在
            if (fs.existsSync(tempPcmFile)) {
              const stats = fs.statSync(tempPcmFile);
              console.log(`PCM文件大小: ${stats.size} 字节`);
              if (stats.size === 0) {
                reject(new Error('PCM文件大小为0字节'));
                return;
              }
            } else {
              reject(new Error('PCM文件不存在'));
              return;
            }
            
            resolve();
          })
          .save(tempPcmFile);
      });
    });

    // 使用Promise封装WebSocket语音识别过程
    const recognizeAudio = () => {
      return new Promise((resolve, reject) => {
        const taskId = uuidv4();
        let recognizedText = '';
        let recognizedSentences = []; // 存储识别出的所有句子
    let taskStarted = false;
        let hasReceivedResult = false;
        let reconnectAttempt = 0;
        const maxReconnectAttempts = 2;
        
        // 创建连接和启动任务的函数
        const createConnection = () => {
          console.log(`创建WebSocket连接，尝试次数: ${reconnectAttempt + 1}`);
          
          const ws = new WebSocket('wss://dashscope.aliyuncs.com/api-ws/v1/inference', {
            headers: {
              'Authorization': `Bearer ${ALIYUN_DASHSCOPE_API_KEY}`
            }
          });
    
    ws.on('open', () => {
      console.log('WebSocket连接已建立');
      
      const runTaskCmd = {
        header: {
                action: 'run-task',
          task_id: taskId,
                streaming: 'duplex'
        },
        payload: {
                task_group: 'audio',
                task: 'asr',
                function: 'recognition',
                model: 'paraformer-realtime-v2',
          parameters: {
                  sample_rate: 16000,
                  format: 'pcm',  // 明确指定使用PCM格式
                  enable_punctuation: true,
                  enable_timestamps: true,
                  semantic_punctuation_enabled: false,
                  max_sentence_silence: 500
          },
          input: {}
        }
      };
      
            console.log('发送run-task指令:', JSON.stringify(runTaskCmd));
      ws.send(JSON.stringify(runTaskCmd));
    });
    
          ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
              console.log('收到消息:', JSON.stringify(message, null, 2));
          
          if (message.header && message.header.event) {
            switch (message.header.event) {
              case 'task-started':
                    console.log('语音识别任务已开始');
                taskStarted = true;
                
                    try {
                      // 读取转换后的PCM文件
                      if (!fs.existsSync(tempPcmFile)) {
                        throw new Error(`PCM文件不存在: ${tempPcmFile}`);
                      }
                      
                      const fileBuffer = fs.readFileSync(tempPcmFile);
                      console.log(`读取PCM文件成功，大小: ${fileBuffer.length} 字节`);
                      
                      if (fileBuffer.length === 0) {
                        throw new Error('PCM文件大小为0字节');
                      }
                      
                      // 分批发送音频数据
                      const chunkSize = 16 * 1024; // 16KB分片
                      for (let i = 0; i < fileBuffer.length; i += chunkSize) {
                        if (ws.readyState !== WebSocket.OPEN) {
                          console.error('WebSocket连接已关闭，停止发送音频数据');
                          break;
                        }
                        
                        const chunk = fileBuffer.slice(i, Math.min(i + chunkSize, fileBuffer.length));
                        console.log(`发送音频数据分片: ${i}-${i + chunk.length}, ${chunk.length} 字节`);
                        ws.send(chunk);
                        
                        // 短暂停顿，避免发送过快
                        await new Promise(resolve => setTimeout(resolve, 10));
                      }
                      
                      if (ws.readyState === WebSocket.OPEN) {
                        console.log('音频文件发送完成');
                        
                        const finishTaskCmd = {
                  header: {
                            action: 'finish-task',
                    task_id: taskId,
                            streaming: 'duplex'
                  },
                  payload: {
                    input: {}
                  }
                        };
                        console.log('发送finish-task指令:', JSON.stringify(finishTaskCmd));
                        ws.send(JSON.stringify(finishTaskCmd));
                      }
                    } catch (fileError) {
                      console.error('读取或发送音频文件失败:', fileError);
                      ws.close();
                      reject(fileError);
                    }
                break;
                
                  case 'result-generated':
                    if (message.payload && message.payload.output && message.payload.output.sentence) {
                      hasReceivedResult = true;
                      const sentence = message.payload.output.sentence;
                      recognizedText = sentence.text || '';
                      console.log('当前识别文本:', recognizedText);
                      
                      // 向客户端发送实时识别结果
                      sendDataToClients({
                        type: 'asr_result',
                        text: recognizedText,
                        isFinal: sentence.sentence_end === true,
                        sentenceId: sentence.sentence_id
                      });
                      
                      // 如果是句子结束，添加到识别句子列表中
                      if (sentence.sentence_end === true) {
                        recognizedSentences.push(recognizedText);
                        console.log('收到最终识别结果');
                      }
                    }
                    break;

                  case 'task-finished':
                    console.log('语音识别任务完成');
                    if (!hasReceivedResult) {
                      console.warn('任务完成但未收到识别结果');
                      
                      if (reconnectAttempt < maxReconnectAttempts) {
                        reconnectAttempt++;
                        console.log(`尝试重新连接，次数: ${reconnectAttempt}`);
                        ws.close();
                        setTimeout(createConnection, 1000);
                        return;
          } else {
                        resolve({text: "", isFinal: true});
          }
        } else {
                      // 当任务完成时，将所有句子合并为完整结果
                      const fullText = recognizedSentences.join(' ');
                      
                      // 发送最终结果给客户端
                      sendDataToClients({
                        type: 'asr_complete',
                        text: fullText
                      });
                      
                      resolve({text: fullText, isFinal: true});
                    }
                    ws.close();
                    break;

                  case 'task-failed':
                    console.error('语音识别任务失败:', 
                      message.header.error_code,
                      message.header.error_message);
                    
                    if (message.header.error_code === 'UNSUPPORTED_FORMAT' && reconnectAttempt < maxReconnectAttempts) {
                      reconnectAttempt++;
                      console.log(`因格式错误重新尝试，尝试次数: ${reconnectAttempt}`);
                      ws.close();
                      setTimeout(createConnection, 1000);
                      return;
                    }
                    
                    reject(new Error(message.header.error_message || '语音识别失败'));
                    ws.close();
                    break;
                }
              }
            } catch (error) {
              console.error('处理WebSocket消息失败:', error);
            }
          });

          // 设置超时时间
          const timeoutDuration = 30000;
          setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
              console.log(`语音识别任务超时 (${timeoutDuration}ms)`);
              ws.close(1000);
              
              if (hasReceivedResult) {
                // 如果有部分结果，则返回所有识别的句子
                const fullText = recognizedSentences.join(' ');
                resolve({text: fullText, isFinal: true});
              } else {
                reject(new Error('语音识别任务超时'));
              }
            }
          }, timeoutDuration);
        };
        
        createConnection();
      });
    };

    try {
      // 执行语音识别
      const result = await recognizeAudio();
      console.log('识别结果:', result);
      
      // 返回识别结果
      if (!res.headersSent) {
        if (result.text && result.text.length > 0) {
          // 返回识别结果
          res.json({
            success: true,
            text: result.text,
            isFinal: true,
            language: 'zh'
          });
        } else {
          // 识别成功但没有文本内容
          res.json({
      success: true,
            text: "",
            message: "未能识别出语音内容，可能是因为音频质量不佳或无语音内容",
            isFinal: true,
            language: 'zh'
          });
        }
      }
    } catch (recognizeError) {
      console.error('语音识别失败:', recognizeError);
      
      // 确保只响应一次
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: '语音转文本失败',
          message: recognizeError.message
        });
      }
    }

  } catch (error) {
    console.error('处理请求失败:', error);
    
    // 确保只响应一次
    if (!res.headersSent) {
    res.status(500).json({ 
        success: false,
        error: '语音转文本失败',
        message: error.message
      });
    }
  } finally {
    // 清理临时文件
    try {
      if (req.file && req.file.path) {
        fs.unlinkSync(req.file.path);
        console.log('临时文件已删除:', req.file.path);
      }
      if (tempPcmFile && fs.existsSync(tempPcmFile)) {
        fs.unlinkSync(tempPcmFile);
        console.log('临时PCM文件已删除:', tempPcmFile);
      }
    } catch (error) {
      console.error('删除临时文件失败:', error);
    }
  }
});

// 提供上传文件的静态访问
app.use('/uploads', express.static('uploads'));

// 添加流式TTS API端点
app.post('/api/tts/stream', async (req, res) => {
  const { text, voice } = req.body;
  
  if (!text) {
    return res.status(400).json({ error: '文本不能为空' });
  }
  
  // 设置响应头，支持流式传输
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // 检查客户端连接状态
  req.on('close', () => {
    console.log('客户端连接已关闭');
  });
  
  // 定期检查连接状态
  const connectionCheck = setInterval(() => {
    if (res.writableEnded) {
      console.log('响应已结束，停止检查');
      clearInterval(connectionCheck);
    } else {
      console.log('连接状态: 正常');
    }
  }, 2000);
  
  try {
    console.log(`开始流式语音合成: "${text.substring(0, 50)}..."`);
    
    // 分割文本为句子
    const sentences = text.match(/[^。！？.!?]+[。！？.!?]+/g) || [text];
    
    const audioUrls = [];
    
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      if (sentence.length === 0) continue;
      
      console.log(`处理第${i+1}/${sentences.length}个句子: "${sentence.substring(0, 50)}..."`);
      
      try {
        // 调用语音合成
        const result = await synthesizeSpeech(sentence, {
          voice: voice || 'longxiaochun',
          format: 'mp3',
          sampleRate: 22050
        });
        
        // 存储音频URL
        audioUrls.push(result.audioUrl);
        
        // 确保音频文件可访问
        ensureAudioFileAccessible(result.audioUrl);
        
        // 发送音频URL到客户端
        const audioEvent = {
          event: 'audio',
          url: result.audioUrl,
          text: sentence,
          index: i,
          total: sentences.length,
          isFinal: i === sentences.length - 1
        };
        
        // 添加调试信息
        console.log(`发送音频事件: ${JSON.stringify(audioEvent)}`);
        
        // 确保数据格式正确
        const eventData = `data: ${JSON.stringify(audioEvent)}\n\n`;
        
        // 使用try-catch包装写入操作
        try {
          res.write(eventData);
          console.log(`成功写入事件数据: ${eventData.length} 字节`);
        } catch (writeError) {
          console.error(`写入事件数据失败: ${writeError.message}`);
        }
        
        // 确保数据被发送出去
        try {
          if (res.flush) {
            res.flush();
            console.log('成功刷新响应缓冲区');
          }
        } catch (flushError) {
          console.error(`刷新响应缓冲区失败: ${flushError.message}`);
        }
        
        // 添加延迟确保客户端有时间处理
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`第${i+1}次语音合成失败:`, error);
      }
    }
    
    // 在最后一个音频发送后，发送一个汇总事件
      const summaryEvent = {
        event: 'audio_summary',
        urls: audioUrls, // 存储所有生成的音频URL
      count: audioUrls.length
      };
      console.log(`发送音频汇总事件: ${JSON.stringify(summaryEvent)}`);
      
      // 使用try-catch包装写入操作
      try {
        res.write(`data: ${JSON.stringify(summaryEvent)}\n\n`);
        console.log('成功写入音频汇总事件');
        if (res.flush) res.flush();
      } catch (summaryError) {
        console.error(`发送音频汇总事件失败: ${summaryError.message}`);
      }
    
    // 发送结束事件
    const endEvent = {
      event: 'end',
      message: '语音合成完成'
    };
    res.write(`data: ${JSON.stringify(endEvent)}\n\n`);
    
    // 结束响应
    res.end();
    clearInterval(connectionCheck);
  } catch (error) {
    console.error('流式语音合成失败:', error);
    
    // 发送错误事件
    const errorEvent = {
      event: 'error',
      message: error.message,
      status: 500,
      code: 'tts_stream_error'
    };
    res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
    res.end();
    clearInterval(connectionCheck);
  }
});

// 添加API端点，获取音频文件列表
app.get('/api/audio/list', (req, res) => {
  try {
    // 检查public/audio目录
    const publicAudioDir = path.join(__dirname, 'public', 'audio');
    let files = [];
    
    if (fs.existsSync(publicAudioDir)) {
      files = fs.readdirSync(publicAudioDir)
        .filter(file => file.endsWith('.mp3'));
    }
    
    res.json({
      success: true,
      files: files
    });
  } catch (error) {
    console.error('获取音频文件列表失败:', error);
    res.status(500).json({
      success: false,
      error: '获取音频文件列表失败',
      message: error.message
    });
  }
});

// 添加API端点，删除单个音频文件
app.delete('/api/audio/delete/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    
    // 安全检查：确保文件名是有效的音频文件
    if (!filename || !filename.startsWith('tts_') || !filename.endsWith('.mp3')) {
      return res.status(400).json({
        success: false,
        error: '无效的文件名',
        message: '只能删除tts_开头的mp3文件'
      });
    }
    
    // 确定文件路径
    const publicAudioPath = path.join(__dirname, 'public', 'audio', filename);
    const audioPath = path.join(__dirname, 'audio', filename);
    
    let deleted = false;
    
    // 尝试从public/audio目录中删除
    if (fs.existsSync(publicAudioPath)) {
      fs.unlinkSync(publicAudioPath);
      console.log(`已从public目录删除音频文件: ${filename}`);
      deleted = true;
    }
    
    // 如果public目录中不存在，尝试从audio目录中删除
    if (!deleted && fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
      console.log(`已从audio目录删除音频文件: ${filename}`);
      deleted = true;
    }
    
    if (deleted) {
      res.json({
        success: true,
        message: `文件 ${filename} 已成功删除`
      });
    } else {
      res.status(404).json({
        success: false,
        error: '文件不存在',
        message: `未找到文件 ${filename}`
      });
    }
  } catch (error) {
    console.error('删除音频文件失败:', error);
    res.status(500).json({
      success: false,
      error: '删除音频文件失败',
      message: error.message
    });
  }
});

// 添加API端点，批量清理旧音频文件
app.post('/api/audio/cleanup', (req, res) => {
  try {
    const { sessionStartTime } = req.body;
    const startTime = sessionStartTime ? parseInt(sessionStartTime) : Date.now();
    
    // 创建存储目录列表
    const directories = [
      path.join(__dirname, 'public', 'audio'),
      path.join(__dirname, 'audio')
    ];
    
    let totalDeleted = 0;
    let deletedFiles = [];
    
    // 遍历每个目录
    directories.forEach(directory => {
      if (fs.existsSync(directory)) {
        const files = fs.readdirSync(directory)
          .filter(file => file.startsWith('tts_') && file.endsWith('.mp3'));
        
        // 删除旧文件（时间戳小于会话开始时间的文件）
        files.forEach(file => {
          try {
            // 从文件名提取时间戳
            const match = file.match(/tts_(\d+)\.mp3$/);
            if (match) {
              const fileTimestamp = parseInt(match[1]);
              
              // 只删除比会话开始时间早的文件
              if (fileTimestamp < startTime) {
                const filePath = path.join(directory, file);
                fs.unlinkSync(filePath);
                console.log(`已清理旧音频文件: ${filePath}`);
                deletedFiles.push(file);
                totalDeleted++;
              }
            }
          } catch (fileError) {
            console.error(`清理文件 ${file} 失败:`, fileError);
          }
        });
      }
    });
    
    res.json({
      success: true,
      deletedCount: totalDeleted,
      message: `已清理 ${totalDeleted} 个旧音频文件`,
      deletedFiles: deletedFiles
    });
  } catch (error) {
    console.error('清理音频文件失败:', error);
    res.status(500).json({
      success: false,
      error: '清理音频文件失败',
      message: error.message
    });
  }
});

// 添加timer.html使用的/api/tts接口（非流式返回）
app.post('/api/tts', async (req, res) => {
  const { text, voice } = req.body;
  
  if (!text) {
    return res.status(400).json({ error: '文本不能为空' });
  }
  
  console.log(`开始语音合成（非流式）: "${text.substring(0, 50)}..."`);
  
  try {
    // 调用语音合成服务
    const result = await synthesizeSpeech(text, {
      voice: voice || 'longxiaochun',
      format: 'mp3',
      sampleRate: 22050
    });
    
    // 确保音频文件可访问
    ensureAudioFileAccessible(result.audioUrl);
    
    // 返回音频URL
    res.json({
      success: true,
      audioUrl: result.audioUrl,
      streaming: true
    });
  } catch (error) {
    console.error('语音合成失败:', error);
    res.status(500).json({
      success: false,
      error: '语音合成失败',
      message: error.message,
      fallback: true
    });
  }
});

// 在所有路由之后，添加404错误处理中间件
app.use((req, res) => {
  res.status(404).send('找不到页面 - 请确认路径是否正确');
});

// 确保音频文件可访问
function ensureAudioFileAccessible(audioUrl) {
  try {
    // 从URL中提取文件名
    const fileName = audioUrl.split('/').pop();
    
    // 检查文件是否已经在public/audio目录
    const publicAudioPath = path.join(__dirname, 'public', 'audio', fileName);
    if (fs.existsSync(publicAudioPath)) {
      console.log(`音频文件已存在于public目录: ${publicAudioPath}`);
      
      // 检查文件是否可读
      try {
        fs.accessSync(publicAudioPath, fs.constants.R_OK);
        console.log(`音频文件可访问: ${publicAudioPath}`);
        return true;
      } catch (err) {
        console.error(`音频文件不可读: ${publicAudioPath}`, err);
      }
    }
    
    // 检查文件是否在audio目录
    const audioPath = path.join(__dirname, 'audio', fileName);
    if (fs.existsSync(audioPath)) {
      console.log(`发现音频文件在非public目录: ${audioPath}`);
      
      // 检查文件是否可读
      try {
        fs.accessSync(audioPath, fs.constants.R_OK);
      } catch (err) {
        console.error(`源音频文件不可读: ${audioPath}`, err);
        return false;
      }
      
      // 确保目标目录存在
      const publicAudioDir = path.join(__dirname, 'public', 'audio');
      if (!fs.existsSync(publicAudioDir)) {
        console.log(`创建public音频目录: ${publicAudioDir}`);
        fs.mkdirSync(publicAudioDir, { recursive: true });
      }
      
      // 复制文件到public目录
      fs.copyFileSync(audioPath, publicAudioPath);
      console.log(`已复制音频文件到public目录: ${publicAudioPath}`);
      return true;
    } else {
      console.log(`未找到音频文件: ${fileName}`);
      return false;
    }
  } catch (error) {
    console.error(`确保音频文件可访问时出错:`, error);
    return false;
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
});

// 添加一个函数，确保音频文件在正确的位置
function ensureAudioFileAccessible(audioUrl) {
  try {
    // 从URL中提取文件名
    const fileName = audioUrl.split('/').pop();
    
    // 检查文件是否已经在public/audio目录
    const publicAudioPath = path.join(__dirname, 'public', 'audio', fileName);
    if (fs.existsSync(publicAudioPath)) {
      console.log(`音频文件已存在于public目录: ${publicAudioPath}`);
      
      // 检查文件是否可读
      try {
        fs.accessSync(publicAudioPath, fs.constants.R_OK);
        console.log(`音频文件可访问: ${publicAudioPath}`);
        return true;
      } catch (err) {
        console.error(`音频文件不可读: ${publicAudioPath}`, err);
      }
    }
    
    // 检查文件是否在audio目录
    const audioPath = path.join(__dirname, 'audio', fileName);
    if (fs.existsSync(audioPath)) {
      console.log(`发现音频文件在非public目录: ${audioPath}`);
      
      // 检查文件是否可读
      try {
        fs.accessSync(audioPath, fs.constants.R_OK);
      } catch (err) {
        console.error(`源音频文件不可读: ${audioPath}`, err);
        return false;
      }
      
      // 确保目标目录存在
      const publicAudioDir = path.join(__dirname, 'public', 'audio');
      if (!fs.existsSync(publicAudioDir)) {
        console.log(`创建public音频目录: ${publicAudioDir}`);
        fs.mkdirSync(publicAudioDir, { recursive: true });
      }
      
      // 复制文件到public目录
      fs.copyFileSync(audioPath, publicAudioPath);
      console.log(`已复制音频文件到public目录: ${publicAudioPath}`);
      return true;
    } else {
      console.log(`未找到音频文件: ${fileName}`);
      return false;
    }
  } catch (error) {
    console.error(`确保音频文件可访问时出错:`, error);
    return false;
  }
}

// 添加一个函数，根据标点符号和长度限制分割文本
function splitTextByPunctuation(text, averageLength = 10) {
  if (!text || text.length === 0) return [];
  
  // 定义中文和英文的标点符号
  const punctuations = [
    // 中文标点
    '。', '！', '？', '；', '，', '、', '：', '"', '"', "'", "'", '…', '—',
    // 英文标点
    '.', '!', '?', ';', ',', ':', '"', "'", '...', '-', '(', ')', '[', ']'
  ];
  
  const segments = [];
  let currentSegment = '';
  let lastPunctuationIndex = 0;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    currentSegment += char;
    
    // 检查是否是标点符号
    if (punctuations.includes(char)) {
      // 如果当前段落长度已经接近或超过平均长度，则添加到结果中
      if (currentSegment.length >= averageLength) {
        segments.push(currentSegment);
        currentSegment = '';
        lastPunctuationIndex = i;
      }
    }
  }
  
  // 处理剩余文本
  if (currentSegment.length > 0) {
    // 如果剩余文本很短，可以合并到前一个段落
    if (segments.length > 0 && currentSegment.length < averageLength / 2) {
      segments[segments.length - 1] += currentSegment;
    } else {
      segments.push(currentSegment);
    }
  }
  
  return segments;
} 

// 优化的文本分段函数
function optimizeTextSegmentation(text) {
  if (!text || text.length === 0) return [];
  
  // 定义中文和英文的标点符号
  const endPunctuations = ['。', '！', '？', '.', '!', '?']; // 句末标点
  const midPunctuations = ['；', '，', '、', '：', ';', ',', ':', '、']; // 句中标点
  const allPunctuations = [...endPunctuations, ...midPunctuations];
  
  const segments = [];
  let currentSegment = '';
  const idealLength = 10; // 理想段落长度
  const maxLength = 20;   // 最大段落长度
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    currentSegment += char;
    
    // 检查是否达到分段条件
    const isEndPunctuation = endPunctuations.includes(char);
    const isMidPunctuation = midPunctuations.includes(char);
    const isPunctuation = isEndPunctuation || isMidPunctuation;
    
    // 分段策略:
    // 1. 如果是句末标点，且当前段落长度接近或超过理想长度，则分段
    // 2. 如果是句中标点，且当前段落长度超过最大长度，则分段
    // 3. 如果当前段落长度超过最大长度的2倍，强制分段(防止没有标点的长文本)
    if ((isEndPunctuation && currentSegment.length >= idealLength) || 
        (isMidPunctuation && currentSegment.length >= maxLength) ||
        (currentSegment.length >= maxLength * 2)) {
      segments.push(currentSegment);
      currentSegment = '';
    }
  }
  
  // 处理剩余文本
  if (currentSegment.length > 0) {
    // 如果剩余文本很短且有前一个段落，可以合并到前一个段落
    if (segments.length > 0 && currentSegment.length < idealLength / 2) {
      segments[segments.length - 1] += currentSegment;
    } else {
      segments.push(currentSegment);
    }
  }
  
  // 如果没有分段，返回原文本作为一个段落
  if (segments.length === 0 && text.length > 0) {
    segments.push(text);
  }
  
  return segments;
}

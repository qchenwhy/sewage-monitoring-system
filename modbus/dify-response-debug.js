/**
 * Dify API响应调试脚本
 * 
 * 此脚本用于测试Dify API创建文档的响应结构，确保能够正确提取document ID
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 加载配置
function loadConfig() {
  try {
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configData);
      return config.dify || {};
    }
  } catch (error) {
    console.error('加载配置文件失败:', error);
  }
  return {};
}

const config = loadConfig();

// 测试API响应
async function testDifyAPI() {
  const apiEndpoint = config.apiEndpoint || 'http://localhost/v1';
  const apiKey = config.apiKey || 'dataset-CBdZ3tu2yaTpd1mpjGhsLhaR';
  const datasetId = config.datasetId || 'c94272de-e4a0-4075-b708-db42ee1b3c29';
  
  console.log('使用以下配置测试Dify API:');
  console.log(`API端点: ${apiEndpoint}`);
  console.log(`API密钥: ${apiKey.substring(0, 8)}...`);
  console.log(`数据集ID: ${datasetId}`);
  
  try {
    // 1. 直接测试API连接
    console.log('\n测试API连接...');
    const connectionResponse = await axios.get(`${apiEndpoint}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      validateStatus: () => true
    });
    
    console.log(`API连接响应: ${connectionResponse.status}`);
    console.log(`响应数据: ${JSON.stringify(connectionResponse.data).substring(0, 200)}...`);
    
    // 2. 创建测试文档
    console.log('\n创建测试文档...');
    const documentTitle = `测试文档_${Date.now()}`;
    const documentContent = `# ${documentTitle}\n\n这是一个测试文档，用于调试API响应结构。\n\n创建时间: ${new Date().toISOString()}`;
    
    // API 接口地址
    const apiUrl = `${apiEndpoint}/datasets/${datasetId}/document/create-by-text`;
    
    console.log('请求URL:', apiUrl);
    
    // 估算文档的token数量（简单估算：中文每字约1.5个token，英文每字约0.25个token）
    const estimateTokens = (text) => {
      const chineseCharCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
      const otherCharCount = text.length - chineseCharCount;
      return Math.ceil(chineseCharCount * 1.5 + otherCharCount * 0.25);
    };
    
    // 根据内容长度自适应设置token大小，最小2000，最大30000
    const estimatedTokens = estimateTokens(documentContent);
    const tokenLimit = Math.max(2000, Math.min(30000, estimatedTokens * 1.2)); // 增加20%的余量
    
    console.log(`估算的token数量: ${estimatedTokens}, 设置的max_tokens: ${tokenLimit}`);
    
    // 请求数据
    const requestData = {
      name: documentTitle,
      text: documentContent,
      indexing_technique: "high_quality",
      process_rule: {
        mode: "custom",
        rules: {
          pre_processing_rules: [
            {
              id: "remove_extra_spaces",
              enabled: true
            },
            {
              id: "remove_urls_emails",
              enabled: true
            }
          ],
          segmentation: {
            separator: "THIS_IS_A_UNIQUE_SEPARATOR_THAT_WONT_APPEAR_IN_CONTENT",
            max_tokens: tokenLimit,  // 使用自适应计算的token限制
            parent_mode: "full-doc"  // 设置为全文召回模式
          }
        }
      }
    };
    
    console.log('发送数据:', JSON.stringify(requestData).substring(0, 200));
    
    // 发送请求
    const response = await axios.post(
      apiUrl,
      requestData,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000, // 30秒超时
        validateStatus: () => true
      }
    );
    
    console.log(`创建文档响应码: ${response.status}`);
    
    // 记录完整响应到文件
    const responseLogPath = path.join(__dirname, 'dify-response.json');
    fs.writeFileSync(responseLogPath, JSON.stringify(response.data, null, 2));
    console.log(`完整响应已保存到: ${responseLogPath}`);
    
    // 调试响应结构
    console.log('\n响应数据结构分析:');
    console.log(`响应类型: ${typeof response.data}`);
    if (typeof response.data === 'object') {
      console.log('顶级属性:');
      Object.keys(response.data).forEach(key => {
        console.log(`- ${key}: ${typeof response.data[key]}`);
      });
      
      // 检查document对象
      if (response.data.document) {
        console.log('\ndocument对象顶级属性:');
        Object.keys(response.data.document).forEach(key => {
          console.log(`- ${key}: ${typeof response.data.document[key]}`);
        });
        
        // 检查document.id
        if (response.data.document.id) {
          console.log(`\n文档ID: ${response.data.document.id}`);
        } else {
          console.log('\n错误: document对象中没有id属性');
        }
      } else {
        console.log('\n错误: 响应中没有document对象');
      }
    }
    
    // 检查ID访问路径
    console.log('\n检查ID访问路径:');
    try {
      if (response.data && response.data.id) {
        console.log(`response.data.id = ${response.data.id}`);
      } else {
        console.log('response.data.id 路径不存在');
      }
      
      if (response.data && response.data.document && response.data.document.id) {
        console.log(`response.data.document.id = ${response.data.document.id}`);
      } else {
        console.log('response.data.document.id 路径不存在');
      }
      
      // 检查其他可能的路径
      if (response.data && response.data.document_id) {
        console.log(`response.data.document_id = ${response.data.document_id}`);
      }
      
      if (response.data && response.data.data && response.data.data.id) {
        console.log(`response.data.data.id = ${response.data.data.id}`);
      }
    } catch (pathError) {
      console.error('检查ID路径时出错:', pathError);
    }
    
    // 测试成功的条件
    const hasCorrectId = response.data && response.data.document && response.data.document.id;
    console.log(`\n测试结果: ${hasCorrectId ? '成功' : '失败'}`);
    if (hasCorrectId) {
      console.log('已成功获取文档ID，可以使用以下条件检查:');
      console.log('if (response.data && response.data.document && response.data.document.id)');
    } else {
      console.log('未能获取文档ID，需要进一步分析响应结构');
    }
    
  } catch (error) {
    console.error('测试过程中出错:', error);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
    }
  }
}

// 运行测试
testDifyAPI().catch(console.error); 
/**
 * Dify知识库服务
 * 
 * 提供与Dify知识库的集成，包括:
 * - 将Modbus数据存档同步到Dify知识库
 * - 将系统配置数据同步到Dify知识库
 * - 提供知识库查询和管理功能
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const moment = require('moment');

// 单例模式
let instance = null;

class DifyKnowledgeService {
  constructor() {
    this.config = {
      enabled: false,
      apiEndpoint: 'https://api.dify.ai/v1',
      apiKey: '',
      datasetId: '',
      syncInterval: 3600000, // 默认每小时同步一次
      documentsPerDay: 24    // 每天存储24小时的数据
    };
    
    this.initialized = false;
    this.syncTimer = null;
    this.currentDocumentId = null; // 当天的文档ID
    this.currentDocumentDate = null; // 当天的日期
    this.syncInProgress = false; // 同步锁，防止并发同步
    
    // 加载配置
    this.loadConfig();
  }
  
  /**
   * 获取单例实例
   */
  static getInstance() {
    if (!instance) {
      instance = new DifyKnowledgeService();
    }
    return instance;
  }
  
  /**
   * 加载配置
   */
  async loadConfig() {
    try {
      console.log('已加载Dify配置文件');
      const configPath = path.join(__dirname, 'config.json');
      
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        if (config.dify) {
          this.config = {
            ...this.config,
            ...config.dify
          };
        }
        
        console.log('Dify知识库配置:', {
          apiEndpoint: this.config.apiEndpoint,
          enabled: this.config.enabled,
          hasApiKey: !!this.config.apiKey,
          hasDatasetId: !!this.config.datasetId
        });
      } else {
        console.log('配置文件不存在，使用默认配置');
        this.saveConfig();
      }
      
      if (!this.config.enabled) {
        console.log('Dify知识库服务已禁用，不进行初始化');
      }
    } catch (error) {
      // 简化的错误处理
      console.error('加载配置失败:', error.message);
      console.error('错误堆栈:', error.stack);
      throw error;
    }
  }
  
  /**
   * 获取知识库列表
   */
  async getKnowledgeSets() {
    try {
      console.log('获取知识库列表...');
      
      const response = await axios.get(
        `${this.config.apiEndpoint}/datasets`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`
          }
        }
      );
      
      return response.data.data;
    } catch (error) {
      console.error('获取知识库列表失败:', error);
      throw error;
    }
  }
  
  /**
   * 获取当前知识库信息
   */
  async getKnowledgeInfo() {
    try {
      if (!this.config.datasetId) {
        throw new Error('未配置知识库ID');
      }
      
      // 通过获取文档列表来验证知识库是否存在和可访问
      // 这是因为一些API端点可能不直接支持GET /datasets/:id
      console.log('通过文档列表验证知识库...');
      
      const response = await axios.get(
        `${this.config.apiEndpoint}/datasets/${this.config.datasetId}/documents`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`
          }
        }
      );
      
      // 获取同步状态
      const syncStatus = this.syncTimer ? 'syncing' : (this.initialized ? 'initialized' : 'not_initialized');
      
      // 通过检查最后一个文档确定最后更新时间
      let lastUpdated = null;
      const documents = response.data.data || [];
      if (documents.length > 0) {
        // 找到创建时间最新的文档
        const latestDoc = documents.reduce((latest, doc) => {
          return (!latest || doc.created_at > latest.created_at) ? doc : latest;
        }, null);
        
        if (latestDoc) {
          lastUpdated = latestDoc.created_at; // Unix 时间戳
        }
      }
      
      // 如果存在当前文档ID和日期，则同步状态为"已同步化"
      const isSynchronized = !!this.currentDocumentId && !!this.currentDocumentDate;
      
      // 如果能获取文档列表，则认为知识库存在且可访问
      return {
        id: this.config.datasetId,
        name: "知识库",
        documents: documents,
        documentCount: response.data.total || 0,
        accessible: true,
        updatedAt: lastUpdated || Math.floor(Date.now() / 1000), // 默认为当前时间
        syncStatus: syncStatus,
        isSynchronized: isSynchronized,
        currentDocumentId: this.currentDocumentId,
        currentDocumentDate: this.currentDocumentDate
      };
    } catch (error) {
      console.error('获取知识库信息失败:', error.message);
      if (error.response) {
        console.error('状态码:', error.response.status);
      }
      
      return {
        id: this.config.datasetId,
        accessible: false,
        error: error.message,
        syncStatus: this.syncTimer ? 'syncing' : (this.initialized ? 'initialized' : 'not_initialized'),
        isSynchronized: false,
        updatedAt: Math.floor(Date.now() / 1000) // 当前时间
      };
    }
  }
  
  /**
   * 获取文档列表
   */
  async getDocuments() {
    try {
      // ENHANCED DEBUG
      console.log('========== 获取文档列表请求详情 ==========');
      console.log('请求URL:', `${this.config.apiEndpoint}/datasets/${this.config.datasetId}/documents`);
      console.log('请求头:', JSON.stringify({
        'Authorization': `Bearer ${this.config.apiKey.substring(0, 10)}...`
      }));
      
      if (!this.config.datasetId) {
        throw new Error('未配置知识库ID');
      }
      
      if (!this.config.datasetId) {
        throw new Error('未配置知识库ID');
      }
      
      const response = await axios.get(
        `${this.config.apiEndpoint}/datasets/${this.config.datasetId}/documents`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`
          }
        }
      );
      
      return response.data.data;
    } catch (error) {
      console.error('获取文档列表失败:', error);
      throw error;
    }
  }
  
  /**
   * 获取文档内容
   */
  async getDocumentById(documentId) {
    try {
      if (!this.config.datasetId) {
        throw new Error('未配置知识库ID');
      }
      
      const response = await axios.get(
        `${this.config.apiEndpoint}/datasets/${this.config.datasetId}/documents/${documentId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`
          }
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('获取文档内容失败:', error);
      throw error;
    }
  }

  /**
   * 初始化服务
   */
  async initialize() {
    try {
      if (this.initialized) {
        console.log('Dify知识库服务已初始化');
        return true;
      }
      
      if (!this.config.enabled) {
        console.log('Dify知识库服务已禁用，无法初始化');
        return false;
      }
      
      console.log('初始化Dify知识库服务...');
      
      // 测试API连接
      try {
        const response = await axios.get(
          `${this.config.apiEndpoint}/datasets`,
          {
            headers: {
              'Authorization': `Bearer ${this.config.apiKey}`
            }
          }
        );
        
        console.log('API测试成功:', response.status);
        this.initialized = true;
        
        // 尝试加载已保存的文档ID
        this.loadSavedDocumentId();
        
        return true;
      } catch (error) {
        console.error('API测试失败:', error.message);
        if (error.response) {
          console.error('状态码:', error.response.status);
          console.error('响应数据:', error.response.data);
        }
        return false;
      }
    } catch (error) {
      console.error('初始化失败:', error);
      return false;
    }
  }

  /**
   * 保存配置
   */
  saveConfig() {
    try {
      const configPath = path.join(__dirname, 'config.json');
      
      // 如果文件已存在，读取现有配置
      let fullConfig = {};
      if (fs.existsSync(configPath)) {
        fullConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      }
      
      // 更新dify部分
      fullConfig.dify = { ...this.config };
      
      // 写入文件
      fs.writeFileSync(configPath, JSON.stringify(fullConfig, null, 2), 'utf8');
      console.log('配置已保存到:', configPath);
      return true;
    } catch (error) {
      console.error('保存配置失败:', error);
      return false;
    }
  }

  /**
   * 获取配置
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(updates) {
    this.config = {
      ...this.config,
      ...updates
    };
    
    this.saveConfig();
    return this.config;
  }

  /**
   * 创建空知识库
   * @param {string} name 知识库名称
   * @param {string} description 知识库描述
   */
  async createEmptyKnowledge(name, description = '') {
    try {
      console.log(`创建知识库: ${name}`);
      
      const response = await axios.post(
        `${this.config.apiEndpoint}/datasets`,
        {
          name,
          description
        },
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      // 保存datasetId到配置
      if (response.data && response.data.id) {
        this.config.datasetId = response.data.id;
        this.saveConfig();
      }
      
      console.log('知识库创建成功:', response.data);
      return response.data;
    } catch (error) {
      console.error('创建知识库失败:', error.message);
      
      if (error.response && error.response.status === 400 && 
          error.response.data && error.response.data.params === 'permission') {
        
        console.log('检测到权限参数错误，尝试不带permission参数重新请求...');
        
        try {
          const retryData = {
            name,
            description
          };
          
          const retryResponse = await axios.post(
            `${this.config.apiEndpoint}/datasets`,
            retryData,
            {
              headers: {
                'Authorization': `Bearer ${this.config.apiKey}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          console.log('第二次尝试创建知识库成功:', retryResponse.data);
          return retryResponse.data;
        } catch (retryError) {
          console.error('第二次尝试创建知识库也失败:', retryError.message);
          throw retryError;
        }
      }
      
      throw error;
    }
  }

  /**
   * 同步数据到Dify知识库
   */
  async syncData() {
    // 如果已经有同步操作在进行，则返回
    if (this.syncInProgress) {
      console.log('已有同步操作正在进行中，跳过本次同步请求');
      return {
        success: false,
        error: 'sync_in_progress',
        message: '已有同步操作正在进行中'
      };
    }
    
    // 设置同步锁
    this.syncInProgress = true;
    
    try {
      console.log('开始同步数据到Dify知识库...');
      
      if (!this.initialized) {
        console.log('Dify知识库服务未初始化，尝试初始化...');
        const initialized = await this.initialize();
        if (!initialized) {
          console.log('初始化失败，无法同步数据');
          return {
            success: false,
            error: 'initialization_failed'
          };
        }
      }
      
      // 获取最新数据
      const latestData = await this.getLatestData();
      
      if (!latestData || latestData.length === 0) {
        console.log('没有可同步的数据');
        return {
          success: false,
          error: 'no_data'
        };
      }
      
      console.log(`找到 ${latestData.length} 条数据，准备同步到Dify知识库`);
      
      // 检查当前是否是新的一天，或者是否有当天的文档ID
      const currentDate = moment().format('YYYY-MM-DD');
      const currentHour = moment().hour();
      
      console.log(`当前日期: ${currentDate}, 当前小时: ${currentHour}`);
      console.log(`缓存文档ID: ${this.currentDocumentId}, 缓存日期: ${this.currentDocumentDate}`);
      
      // 如果是新一天的第一个小时，则创建新文档
      if (currentHour === 0 || (this.currentDocumentDate !== currentDate) || !this.currentDocumentId) {
        console.log('需要创建新文档...');
        const result = await this.createNewDocument(latestData, currentDate);
        
        // 即使创建失败，也尝试返回部分文档ID，以便恢复
        if (!result.success && result.partialDocumentId) {
          console.log(`虽然创建文档报告失败，但发现了部分文档ID: ${result.partialDocumentId}`);
          result.recoveredId = result.partialDocumentId;
        }
        
        return result;
      } else {
        // 否则，向现有文档添加分段
        console.log('向现有文档添加分段...');
        const result = await this.addSegmentToDocument(latestData, currentHour);
        
        // 如果文档未完成索引，记录信息但不报错
        if (!result.success && result.retryLater) {
          console.log(`文档 ${result.documentId} 索引未完成，稍后将再次尝试添加分段`);
          
          // 返回一个特殊状态，表示这不是一个实际错误
          return {
            success: false,
            pendingIndexing: true,
            documentId: result.documentId,
            error: result.error,
            hour: currentHour
          };
        }
        
        return result;
      }
    } catch (error) {
      console.error('同步数据失败:', error.message);
      return {
        success: false,
        error: error.message
      };
    } finally {
      // 释放同步锁
      this.syncInProgress = false;
      console.log('[' + moment().format('YYYY-MM-DD HH:mm:ss') + '] Modbus数据同步任务完成');
    }
  }
  
  /**
   * 创建新文档 - 使用create-by-text API
   * @param {Array} data 最新数据
   * @param {string} currentDate 当前日期
   */
  async createNewDocument(data, currentDate) {
    try {
      console.log('使用create-by-text API创建新文档...');
      
      // 用于存储可能的部分文档ID
      let partialDocumentId = null;
      
      // 检查是否已存在当天的文档
      try {
        console.log('检查是否已存在当天的文档...');
        const documents = await this.getDocuments();
        const todayDocuments = documents.filter(doc => 
          doc.name === `Modbus数据_${currentDate}` || 
          (doc.metadata && doc.metadata.date === currentDate)
        );
        
        if (todayDocuments.length > 0) {
          console.log(`找到${todayDocuments.length}个当天的文档，使用第一个`);
          this.currentDocumentId = todayDocuments[0].id;
          this.currentDocumentDate = currentDate;
          
          return {
            success: true,
            documentId: this.currentDocumentId,
            documentTitle: todayDocuments[0].name,
            isNewDocument: false
          };
        } else {
          console.log('未找到当天的文档，将创建新文档');
        }
      } catch (checkError) {
        console.warn('检查现有文档失败，将创建新文档:', checkError.message);
      }
      
      // 构建文档标题和内容
      const documentTitle = `Modbus数据_${currentDate}`;
      const timestamp = new Date().toISOString();
      
      // 提取唯一的数据点名称和ID
      const uniqueDataPoints = [...new Set(data.map(item => item.data_point_name))];
      const uniqueDataPointIds = [...new Set(data.map(item => item.id))];
      
      // 构建文档内容
      let documentContent = `# ${documentTitle}\n\n`;
      
      // 添加结构化元信息，用于准确召回
      documentContent += `## 文档元信息\n\n`;
      documentContent += `- **文档类型**: Modbus设备监控日报\n`;
      documentContent += `- **记录日期**: ${currentDate}\n`;
      documentContent += `- **创建时间**: ${timestamp}\n`;
      documentContent += `- **数据点数量**: ${uniqueDataPoints.length}个\n`;
      documentContent += `- **记录总数**: ${data.length}条\n`;
      documentContent += `- **数据点ID范围**: ${Math.min(...uniqueDataPointIds)} - ${Math.max(...uniqueDataPointIds)}\n`;
      documentContent += `- **监控设备**: ${uniqueDataPoints.join(', ')}\n\n`;
      
      // 添加目录部分
      documentContent += `## 目录\n\n`;
      documentContent += `1. 文档概述\n`;
      documentContent += `2. 数据统计\n`;
      documentContent += `3. 设备列表\n`;
      documentContent += `4. 小时数据\n\n`;
      
      // 文档概述
      documentContent += `## 1. 文档概述\n\n`;
      documentContent += `本文档包含${currentDate}的Modbus设备监控数据，用于设备状态分析和历史记录查询。数据按小时分段记录，保存了各设备的实时状态数据。\n\n`;
      documentContent += `本文档由系统自动生成，记录了全天共24小时的设备监控数据，每小时数据将作为独立段落添加到本文档中。\n\n`;
      
      // 数据统计
      documentContent += `## 2. 数据统计\n\n`;
      documentContent += `- **监控日期**: ${currentDate}\n`;
      documentContent += `- **监控设备数**: ${uniqueDataPoints.length}个\n`;
      documentContent += `- **初始记录数**: ${data.length}条\n`;
      documentContent += `- **数据时间范围**: ${currentDate} 00:00 - 23:59\n\n`;
      
      // 计算数据点的类型分布（如果有type信息）
      const dataPointTypes = {};
      data.forEach(item => {
        if (item.point_type) {
          dataPointTypes[item.point_type] = (dataPointTypes[item.point_type] || 0) + 1;
        }
      });
      
      // 如果有类型信息，添加类型统计
      if (Object.keys(dataPointTypes).length > 0) {
        documentContent += `### 按类型统计\n\n`;
        documentContent += `| 数据点类型 | 数量 |\n`;
        documentContent += `| ---------- | ---- |\n`;
        Object.entries(dataPointTypes).forEach(([type, count]) => {
          documentContent += `| ${type} | ${count} |\n`;
        });
        documentContent += '\n';
      }
      
      // 设备列表
      documentContent += `## 3. 设备列表\n\n`;
      uniqueDataPoints.forEach((name, index) => {
        documentContent += `${index + 1}. ${name}\n`;
      });
      documentContent += `\n`;
      
      // 初始小时数据样例
      documentContent += `## 4. 小时数据\n\n`;
      documentContent += `本日报的小时数据将通过分段方式逐步添加，每小时更新一次。以下是初始数据示例：\n\n`;
      
      // 添加数据表格 (只添加前10条作为示例)
      documentContent += `| 数据点ID | 数据点名称 | 值 | 格式化值 | 数据质量 | 更新时间 |\n`;
      documentContent += `| -------- | ---------- | -- | -------- | -------- | -------- |\n`;
      
      const sampleData = data.slice(0, Math.min(10, data.length));
      sampleData.forEach(item => {
        const updateTime = item.updated_at ? new Date(item.updated_at).toLocaleString() : '-';
        documentContent += `| ${item.id} | ${item.data_point_name} | ${item.value} | ${item.formatted_value || item.value} | ${item.quality || 'good'} | ${updateTime} |\n`;
      });
      
      if (data.length > 10) {
        documentContent += `\n*注: 表格仅显示前10条数据作为示例，完整数据将在小时分段中提供*\n`;
      }
      
      console.log('文档内容预览:');
      console.log(documentContent.substring(0, 300) + '...');
      
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
      
      // 准备更丰富的元数据，提升召回能力
      const metadata = {
        doc_type: "modbus_daily_report",
        date: currentDate,
        timestamp: timestamp,
        device_count: uniqueDataPoints.length,
        record_count: data.length,
        device_list: uniqueDataPoints.join(','),
        device_ids: uniqueDataPointIds.join(','),
        creation_hour: new Date().getHours(),
        system_id: "modbus_monitoring_system",
        data_point_types: Object.keys(dataPointTypes).join(',')
      };
      
      // API 接口地址
      const apiUrl = `${this.config.apiEndpoint}/datasets/${this.config.datasetId}/document/create-by-text`;
      
      console.log('请求URL:', apiUrl);
      
      // 检查是否已经定义了requestData对象，如果未定义则创建
      let requestData;
      if (typeof requestData === 'undefined') {
        console.log('requestData未定义，正在创建...');
        // 请求数据
        requestData = {
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
                
              }
            }
          },
          metadata: metadata
        };
      } else {
        console.log('requestData已定义，继续使用现有定义');
      }
      
      // 验证请求数据
      if (!requestData.text || requestData.text.trim().length < 10) {
        console.error('警告: 请求数据中的文本内容为空或太短!');
        console.error('文本内容长度:', requestData.text ? requestData.text.length : 0);
        console.error('文本内容预览:', requestData.text ? requestData.text.substring(0, 100) : 'null');
      } else {
        console.log('请求数据文本长度验证通过:', requestData.text.length, '字符');
      }
      
      // 打印请求的关键信息，帮助调试
      console.log('请求信息概览:');
      console.log('- 文档标题:', requestData.name);
      console.log('- 索引技术:', requestData.indexing_technique);
      console.log('- 处理模式:', requestData.process_rule.mode);
      console.log('- 分段设置:', JSON.stringify(requestData.process_rule.rules.segmentation));
      
      // 保存请求数据日志，方便问题排查
      try {
        const logDir = path.join(__dirname, 'logs');
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }
        const logPath = path.join(logDir, `request-${currentDate}-${Date.now()}.json`);
        fs.writeFileSync(logPath, JSON.stringify({
          url: apiUrl,
          headers: {
            'Authorization': 'Bearer ***' // 不记录实际API密钥
          },
          data: {
            ...requestData,
            text: documentContent.substring(0, 200) + '...' // 只记录部分文本内容
          }
        }, null, 2));
        console.log(`请求数据已记录到: ${logPath}`);
      } catch (logError) {
        console.error('保存请求日志失败:', logError.message);
      }
      
      // 发送请求
      const response = await axios.post(
        apiUrl,
        requestData,
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000 // 30秒超时
        }
      );
      
      console.log('创建文档响应:', response.status, response.data);
      
      // 增强的调试信息
      console.log('响应数据类型:', typeof response.data);
      if (typeof response.data === 'object') {
        console.log('响应顶级属性:');
        Object.keys(response.data).forEach(key => {
          console.log(`- ${key}: ${typeof response.data[key]}`);
        });
        
        if (response.data.document) {
          console.log('找到document对象');
          if (response.data.document.id) {
            console.log(`找到document.id: ${response.data.document.id}`);
          } else {
            console.log('错误: document对象中没有id属性');
          }
        } else {
          console.log('错误: 响应中没有document对象');
        }
      }
      
      // 尝试获取文档ID - 增加多种可能的路径检查
      let documentId = null;
      
      // 检查主要路径
      if (response.data && response.data.document && response.data.document.id) {
        documentId = response.data.document.id;
        console.log(`从response.data.document.id获取到ID: ${documentId}`);
      } 
      // 尝试备用路径
      else if (response.data && response.data.id) {
        documentId = response.data.id;
        console.log(`从response.data.id获取到ID: ${documentId}`);
      }
      // 检查另一种可能的路径
      else if (response.data && response.data.data && response.data.data.id) {
        documentId = response.data.data.id;
        console.log(`从response.data.data.id获取到ID: ${documentId}`);
      }
      
      // 如果找到了文档ID
      if (documentId) {
        this.currentDocumentId = documentId;
        this.currentDocumentDate = currentDate;
        
        console.log(`文档创建成功! ID: ${this.currentDocumentId}`);
        
        // 保存文档ID到配置（可选）
        const configPath = path.join(__dirname, 'document-tracking.json');
        const trackingData = {
          lastDocumentId: this.currentDocumentId,
          documentDate: currentDate,
          createdAt: new Date().toISOString()
        };
        
        fs.writeFileSync(configPath, JSON.stringify(trackingData, null, 2));
        console.log('已保存文档跟踪信息');
        
        return {
          success: true,
          documentId: this.currentDocumentId,
          documentTitle,
          isNewDocument: true
        };
      } else {
        // 保存响应到日志文件以便进一步分析
        try {
          const errorLogPath = path.join(__dirname, 'error-response.json');
          fs.writeFileSync(errorLogPath, JSON.stringify(response.data, null, 2));
          console.log(`已将错误响应保存到: ${errorLogPath}`);
        } catch (logError) {
          console.error('保存错误日志失败:', logError);
        }
        
        // 尝试从响应中提取可能的文档ID
        if (response.data && response.data.document) {
          if (typeof response.data.document === 'string') {
            partialDocumentId = response.data.document;
            console.log(`从响应中提取到可能的字符串文档ID: ${partialDocumentId}`);
          } else if (response.data.document.id) {
            partialDocumentId = response.data.document.id;
            console.log(`从响应中提取到document.id: ${partialDocumentId}`);
          }
        } else if (response.data && typeof response.data === 'string' && response.data.length > 10) {
          partialDocumentId = response.data;
          console.log(`从响应字符串中提取可能的文档ID: ${partialDocumentId}`);
        } else if (response.data && response.data.batch) {
          partialDocumentId = response.data.batch;
          console.log(`使用batch作为备用ID: ${partialDocumentId}`);
        }
        
        throw new Error('创建文档响应中没有document ID');
      }
    } catch (error) {
      console.error('创建新文档失败:', error.message);
      if (error.response) {
        console.error('状态码:', error.response.status);
        console.error('错误详情:', JSON.stringify(error.response.data));
      }
      
      // 返回带有部分ID的错误结果
      return {
        success: false,
        error: error.message,
        partialDocumentId: partialDocumentId || null
      };
    }
  }
  
  /**
   * 检查文档状态
   * @param {string} documentId 文档ID
   * @returns {Promise<Object>} 文档状态
   */
  async checkDocumentStatus(documentId) {
    try {
      console.log(`检查文档状态: ${documentId}`);
      
      if (!documentId) {
        throw new Error('未提供文档ID');
      }
      
      const apiUrl = `${this.config.apiEndpoint}/datasets/${this.config.datasetId}/documents/${documentId}`;
      
      console.log('请求URL:', apiUrl);
      
      const response = await axios.get(
        apiUrl,
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`
          },
          timeout: 30000 // 30秒超时
        }
      );
      
      console.log('文档状态响应:', response.status);
      
      if (response.data && response.data.indexing_status) {
        console.log(`文档索引状态: ${response.data.indexing_status}`);
        return {
          success: true,
          id: documentId,
          status: response.data.indexing_status,
          isCompleted: response.data.indexing_status === 'completed',
          data: response.data
        };
      }
      
      return {
        success: true,
        id: documentId,
        status: 'unknown',
        isCompleted: false,
        data: response.data
      };
    } catch (error) {
      console.error(`检查文档状态失败: ${error.message}`);
      return {
        success: false,
        id: documentId,
        status: 'error',
        isCompleted: false,
        error: error.message
      };
    }
  }
  
  /**
   * 向文档添加分段
   * @param {Array} data 最新数据
   * @param {number} currentHour 当前小时
   */
  async addSegmentToDocument(data, currentHour) {
    try {
      console.log(`向文档 ${this.currentDocumentId} 添加第 ${currentHour} 小时的分段数据...`);
      
      if (!this.currentDocumentId) {
        throw new Error('没有当前文档ID，无法添加分段');
      }
      
      // 检查文档状态的健壮性修改 - 避免使用可能不支持的GET方法
      let canProceedWithSegment = true;
      
      // 保存待添加分段的指纹，用于去重判断
      const segmentFingerprint = `${this.currentDocumentId}_hour_${currentHour}_${moment().format('YYYY-MM-DD')}`;
      const fingerprintPath = path.join(__dirname, 'segment-fingerprints.json');
      
      // 读取或创建指纹文件
      let fingerprints = {};
      if (fs.existsSync(fingerprintPath)) {
        try {
          const fingerprintData = fs.readFileSync(fingerprintPath, 'utf8');
          fingerprints = JSON.parse(fingerprintData);
        } catch (parseError) {
          console.warn(`解析指纹文件出错: ${parseError.message}，将创建新文件`);
        }
      }
      
      // 检查是否在过去10分钟内添加过该小时的分段
      const currentTime = Date.now();
      const recentTimeThreshold = 10 * 60 * 1000; // 10分钟内的添加视为重复
      
      if (fingerprints[segmentFingerprint] && 
          (currentTime - fingerprints[segmentFingerprint].timestamp) < recentTimeThreshold) {
        console.log(`检测到10分钟内重复添加第 ${currentHour} 小时的分段数据，跳过`);
        return {
          success: true,
          documentId: this.currentDocumentId,
          hour: currentHour,
          segmentsAdded: 0,
          skipped: true,
          message: '短时间内重复添加，已跳过'
        };
      }
      
      try {
        // 使用POST方法检查文档状态(Workaround) - 添加一个空分段检查是否会返回错误
        try {
          // 发送一个简单的API请求，测试文档ID是否有效
          const testResponse = await axios.post(
            `${this.config.apiEndpoint}/datasets/${this.config.datasetId}/documents/${this.currentDocumentId}/segments`,
            { 
              segments: [] // 空分段，仅用于测试连接和权限
            },
            {
              headers: {
                'Authorization': `Bearer ${this.config.apiKey}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          // 如果能成功发送请求，说明文档存在且有权限添加分段
          console.log(`文档 ${this.currentDocumentId} 状态检查通过，可以添加分段`);
        } catch (testError) {
          // 只有特定错误才说明文档不存在或不可添加分段
          if (testError.response && 
              (testError.response.status === 404 || 
               testError.response.status === 403 || 
               testError.response.status === 400)) {
            console.error(`文档 ${this.currentDocumentId} 不存在或无法添加分段: ${testError.message}`);
            canProceedWithSegment = false;
          } else if (testError.response && testError.response.status === 422) {
            // 422表示验证错误，通常是因为segments为空，这是预期的
            console.log(`文档ID有效性验证通过 (422错误是由于空segments导致的预期行为)`);
          } else {
            // 其他错误可能是网络或服务器问题，继续尝试
            console.warn(`文档状态检查过程中出现非致命错误: ${testError.message}`);
          }
        }
      } catch (statusCheckError) {
        // 状态检查失败，但仍然尝试添加分段
        console.warn(`检查文档状态失败，将尝试直接添加分段: ${statusCheckError.message}`);
      }
      
      if (!canProceedWithSegment) {
        return {
          success: false,
          error: '文档不存在或无法添加分段',
          retryLater: false,
          documentId: this.currentDocumentId
        };
      }
      
      // 构建分段内容 - 避免依赖GET方法的重复检查
      const now = new Date();
      const currentDate = moment(now).format('YYYY-MM-DD');
      const timeRange = `${currentHour}:00 - ${currentHour}:59`;
      
      // 生成标准格式的时间戳 YYYY-MM-DD HH:mm:ss 用于关键词
      const formattedTimestamp = moment(now).format('YYYY-MM-DD HH:mm:ss');
      const timestamp = now.toISOString(); // 保留ISO格式用于其他地方
      
      // 提取唯一的数据点名称和数据点ID
      const uniqueDataPoints = [...new Set(data.map(item => item.data_point_name))];
      const uniqueDataPointIds = [...new Set(data.map(item => item.id))];
      
      // 构建更丰富的元数据
      const metadata = {
        recordType: "modbus_hourly_data",
        date: currentDate,
        hour: currentHour,
        timeRange: timeRange,
        timestamp: formattedTimestamp,
        dataPointCount: uniqueDataPoints.length,
        recordCount: data.length,
        dataPointNames: uniqueDataPoints,
        dataPointIds: uniqueDataPointIds,
        fingerprint: `${currentDate}_hour_${currentHour}`  // 添加指纹信息便于后续检查
      };
      
      // 构建分段内容 - 与之前相同 ...
      let segmentContent = '';
      
      // 添加明确的标题和小时标识，便于检索
      segmentContent += `# Modbus设备监控数据 - 第${currentHour}小时数据\n\n`;
      
      // 添加结构化元信息，用于准确召回
      segmentContent += `## 数据元信息\n\n`;
      segmentContent += `- **数据类型**: Modbus实时监控数据\n`;
      segmentContent += `- **记录日期**: ${currentDate}\n`;
      segmentContent += `- **时间段**: ${timeRange}\n`;
      segmentContent += `- **小时标识**: ${currentHour}\n`;
      segmentContent += `- **更新时间**: ${formattedTimestamp}\n`;
      segmentContent += `- **记录数据点**: ${uniqueDataPoints.length}个\n`;
      segmentContent += `- **记录总数**: ${data.length}条\n`;
      
      // 添加数据点列表，增强可搜索性
      segmentContent += `\n### 监控的数据点列表\n\n`;
      uniqueDataPoints.forEach((name, index) => {
        segmentContent += `${index + 1}. ${name}\n`;
      });
      segmentContent += '\n';
      
      // 添加数据概要
      segmentContent += `## 数据记录概要\n\n`;
      
      // 统计各数据点的最大值、最小值和平均值
      const dataStats = {};
      uniqueDataPoints.forEach(name => {
        const pointData = data.filter(item => item.data_point_name === name);
        if (pointData.length > 0) {
          const values = pointData.map(item => parseFloat(item.value)).filter(val => !isNaN(val));
          if (values.length > 0) {
            const min = Math.min(...values);
            const max = Math.max(...values);
            const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
            dataStats[name] = { min, max, avg: avg.toFixed(2) };
          }
        }
      });
      
      // 添加统计表格
      if (Object.keys(dataStats).length > 0) {
        segmentContent += `| 数据点名称 | 最小值 | 最大值 | 平均值 |\n`;
        segmentContent += `| ---------- | ------ | ------ | ------ |\n`;
        
        Object.entries(dataStats).forEach(([name, stats]) => {
          segmentContent += `| ${name} | ${stats.min} | ${stats.max} | ${stats.avg} |\n`;
        });
        
        segmentContent += '\n';
      }
      
      // 添加样例数据（最多5条）
      segmentContent += `## 数据样例 (最多5条)\n\n`;
      segmentContent += `| 数据点ID | 数据点名称 | 值 | 格式化值 | 数据质量 | 更新时间 |\n`;
      segmentContent += `| -------- | ---------- | -- | -------- | -------- | -------- |\n`;
      
      const sampleData = data.slice(0, Math.min(5, data.length));
      sampleData.forEach(item => {
        const updateTime = item.updated_at ? new Date(item.updated_at).toLocaleString() : '-';
        segmentContent += `| ${item.id} | ${item.data_point_name} | ${item.value} | ${item.formatted_value || item.value} | ${item.quality || 'good'} | ${updateTime} |\n`;
      });
      
      console.log('分段内容预览:');
      console.log(segmentContent.substring(0, 300) + '...');
      
      // 先提前更新指纹记录，防止并发调用
      // 更新指纹信息
      fingerprints[segmentFingerprint] = {
        timestamp: Date.now(),
        documentId: this.currentDocumentId,
        hour: currentHour,
        date: currentDate
      };
      
      // 清理过期指纹 (保留最近7天的)
      const expiryTime = Date.now() - 7 * 24 * 60 * 60 * 1000;
      for (const key in fingerprints) {
        if (fingerprints[key].timestamp < expiryTime) {
          delete fingerprints[key];
        }
      }
      
      // 保存指纹文件 - 在API调用前保存，防止并发问题
      fs.writeFileSync(fingerprintPath, JSON.stringify(fingerprints, null, 2));
      console.log(`已提前更新分段指纹信息: ${segmentFingerprint}`);
      
      // API 接口地址
      const apiUrl = `${this.config.apiEndpoint}/datasets/${this.config.datasetId}/documents/${this.currentDocumentId}/segments`;
      
      console.log('请求URL:', apiUrl);
      
      // 构建更强的关键词，便于召回，添加标准格式的时间戳
      const keywords = [
        `Modbus数据`,
        `小时${currentHour}`,
        `时段${currentHour}:00-${currentHour}:59`,
        `日期${currentDate}`,
        `时间戳${formattedTimestamp}`,  // 添加标准格式的时间戳作为关键词
        `${formattedTimestamp}`,        // 直接添加时间戳，提高精确召回率
        `${currentDate}_${currentHour}`, // 日期_小时格式
        ...uniqueDataPoints.map(name => `数据点:${name}`)
      ];
      
      // 再添加各种时间格式的变体，提高时间召回的准确性
      const hourOnly = `${currentHour}:00`;
      const hourPadded = `${currentHour.toString().padStart(2, '0')}:00`;
      const dateHour = `${currentDate} ${hourPadded}`;
      
      keywords.push(hourOnly, hourPadded, dateHour);
      
      // 添加每隔10分钟的时间点作为关键词，以增加时间范围检索的灵活性
      for (let minute = 0; minute < 60; minute += 10) {
        const timePoint = `${currentDate} ${currentHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
        keywords.push(timePoint);
      }
      
      // 构建分段
      const segments = [
        {
          content: segmentContent,
          answer: `这是${currentDate}的第${currentHour}小时(${timeRange})的Modbus设备监控数据，采集于${formattedTimestamp}，包含${uniqueDataPoints.length}个数据点共${data.length}条记录。`,
          keywords: keywords,
          metadata: metadata
        }
      ];
      
      // 请求数据
      const requestData = {
        segments: segments
      };
      
      // 记录关键词信息到日志
      console.log(`分段关键词: ${keywords.slice(0, 10).join(', ')}${keywords.length > 10 ? '...(省略)' : ''}`);
      console.log(`关键词总数: ${keywords.length}`);
      
      // 发送请求
      const response = await axios.post(
        apiUrl,
        requestData,
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000 // 30秒超时
        }
      );
      
      console.log('添加分段响应:', response.status, response.data);
      
      // 输出成功信息
      console.log(`[${formattedTimestamp}] 成功添加分段到文档! ID: ${this.currentDocumentId}, 小时: ${currentHour}`);
      
      return {
        success: true,
        documentId: this.currentDocumentId,
        hour: currentHour,
        segmentsAdded: segments.length,
        timestamp: formattedTimestamp
      };
      
    } catch (error) {
      console.error('添加分段失败:', error.message);
      if (error.response) {
        console.error('状态码:', error.response.status);
        console.error('错误详情:', JSON.stringify(error.response.data));
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * 启动定时同步任务
   */
  startSync() {
    if (this.syncTimer) {
      console.log('同步任务已在运行中');
      return false;
    }
    
    console.log(`启动定时同步任务，间隔: ${this.config.syncInterval}ms`);
    
    // 立即执行一次
    this.syncData()
      .then(result => {
        console.log('初始同步结果:', result);
        console.log('[' + moment().format('YYYY-MM-DD HH:mm:ss') + '] 首次Modbus数据同步任务完成');
      })
      .catch(error => {
        console.error('初始同步失败:', error);
      });
    
    // 设置定时器
    this.syncTimer = setInterval(() => {
      // 检查是否有同步正在进行中
      if (this.syncInProgress) {
        console.log('上一次同步任务尚未完成，跳过本次定时同步');
        return;
      }
      
      console.log('执行定时同步任务...');
      this.syncData()
        .catch(error => {
          console.error('定时同步失败:', error);
        });
    }, this.config.syncInterval);
    
    return true;
  }
  
  /**
   * 停止定时同步任务
   */
  stopSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
      console.log('定时同步任务已停止');
      return true;
    }
    
    console.log('没有运行中的同步任务');
    return false;
  }

  /**
   * 尝试加载保存的文档ID
   */
  loadSavedDocumentId() {
    try {
      const configPath = path.join(__dirname, 'document-tracking.json');
      
      if (fs.existsSync(configPath)) {
        const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const currentDate = moment().format('YYYY-MM-DD');
        
        // 只加载当天的文档ID
        if (data.documentDate === currentDate && data.lastDocumentId) {
          this.currentDocumentId = data.lastDocumentId;
          this.currentDocumentDate = data.documentDate;
          console.log(`已加载保存的文档ID: ${this.currentDocumentId} (${this.currentDocumentDate})`);
          return true;
        } else {
          console.log('保存的文档不是今天的，不加载');
        }
      }
      
      return false;
    } catch (error) {
      console.error('加载保存的文档ID失败:', error.message);
      return false;
    }
  }

  /**
   * 获取最新数据
   */
  async getLatestData() {
    let connection = null;
    try {
      console.log('获取最新数据...');
      
      // 尝试从配置管理器获取数据库配置
      let dbConfig;
      try {
        // 尝试导入配置管理器
        const ConfigManager = require('./config-manager');
        const configManager = new ConfigManager();
        dbConfig = configManager.getDatabaseConfig();
        console.log('成功从配置管理器获取数据库配置');
      } catch (configError) {
        console.warn('未找到配置管理器或获取配置失败:', configError.message);
        console.log('使用默认数据库配置');
        // 使用默认配置
        dbConfig = {
          host: 'localhost',
          user: 'root',
          password: '753456Chen*', // 使用正确的密码
          database: 'mqtt_data'
        };
      }
      
      console.log('数据库连接配置:', {
        host: dbConfig.host,
        user: dbConfig.user,
        database: dbConfig.database
        // 出于安全考虑不打印密码
      });
      
      // 连接数据库
      const mysql = require('mysql2/promise');
      connection = await mysql.createConnection(dbConfig);
      console.log('成功连接到数据库');
      
      // 查询 modbus_data_latest 表
      const [rows] = await connection.execute('SELECT * FROM modbus_data_latest ORDER BY data_point_name');
      
      console.log(`获取到 ${rows.length} 条最新数据`);
      
      // 格式化数据
      const formattedData = rows.map(row => ({
        id: row.id,
        data_point_id: row.data_point_id,
        data_point_name: row.data_point_name,
        value: row.value,
        formatted_value: row.formatted_value || row.value,
        quality: row.quality || 'GOOD',
        updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
      }));
      
      return formattedData;
    } catch (error) {
      console.error('获取最新数据失败:', error.message);
      if (error.code === 'ER_ACCESS_DENIED_ERROR') {
        console.error('数据库访问被拒绝，请检查用户名和密码配置');
      } else if (error.code === 'ECONNREFUSED') {
        console.error('无法连接到数据库服务器，请检查服务器是否运行以及主机和端口配置');
      }
      return [];
    } finally {
      // 确保关闭连接
      if (connection) {
        try {
          await connection.end();
          console.log('数据库连接已关闭');
        } catch (closeError) {
          console.error('关闭数据库连接失败:', closeError.message);
        }
      }
    }
  }

  /**
   * 测试连接
   */
  async testConnection() {
    try {
      console.log(`测试连接: ${this.config.apiEndpoint}`);
      
      // 尝试获取根端点
      const response = await axios.get(this.config.apiEndpoint, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        validateStatus: () => true
      });
      
      console.log(`API连接测试结果: ${response.status}`);
      
      return {
        success: response.status >= 200 && response.status < 300,
        status: response.status,
        data: response.data
      };
    } catch (error) {
      console.error('测试连接失败:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 上传日报到Dify知识库
   * @param {Object} reportData 日报数据对象，包含日期、内容、原始JSON等
   * @returns {Promise<Object>} 上传结果
   */
  async uploadDailyReportToDify(reportData) {
    try {
      console.log('开始上传日报到Dify知识库...');
      
      if (!this.initialized) {
        console.log('Dify知识库服务未初始化，尝试初始化...');
        const initialized = await this.initialize();
        if (!initialized) {
          console.log('初始化失败，无法上传日报');
          return {
            success: false,
            error: 'initialization_failed'
          };
        }
      }
      
      if (!reportData || !reportData.date || !reportData.content) {
        throw new Error('日报数据不完整，至少需要日期和内容');
      }
      
      // 格式化日期
      const reportDate = reportData.date instanceof Date 
        ? moment(reportData.date).format('YYYY-MM-DD') 
        : reportData.date;
      
      // 创建文档标题，明确标识为日报
      const documentTitle = `工作日报_${reportDate}`;
      
      // 准备共用元数据
      const commonMetadata = {
        doc_type: "daily_report",
        date: reportDate,
        timestamp: new Date().toISOString(),
        system_id: "modbus_daily_report_system"
      };
      
      // 准备三段内容，每段都添加相关元数据作为关键词
      
      // 第一段：元数据段
      let segment1 = `# ${documentTitle} - 第1段（元数据）\n\n`;
      segment1 += `## 日报元信息\n\n`;
      segment1 += `- **文档类型**: 工作日报\n`;
      segment1 += `- **日报日期**: ${reportDate}\n`;
      segment1 += `- **生成时间**: ${new Date().toISOString()}\n`;
      segment1 += `- **数据来源**: Dify AI生成\n`;
      segment1 += `- **段落类型**: 元数据段\n\n`;
      segment1 += `## 元数据关键词\n\n`;
      segment1 += `#元数据 #日报基本信息 #${reportDate} #日报元信息 #文档标识\n\n`;
      
      // 第二段：正文段
      let segment2 = `# ${documentTitle} - 第2段（正文）\n\n`;
      segment2 += `## 日报正文\n\n`;
      segment2 += reportData.content + '\n\n';
      segment2 += `## 正文关键词\n\n`;
      segment2 += `#正文 #日报内容 #${reportDate} #工作记录 #工作日报 #日常工作 #设备监控 #数据记录\n\n`;
      
      // 第三段：原始数据和附加信息段
      let segment3 = `# ${documentTitle} - 第3段（原始数据）\n\n`;
      
      // 如果有原始数据，添加数据部分
      if (reportData.originalData) {
        segment3 += `## 原始数据\n\n`;
        segment3 += '```json\n';
        
        // 如果是字符串，直接添加，否则格式化为JSON字符串
        if (typeof reportData.originalData === 'string') {
          segment3 += reportData.originalData;
        } else {
          segment3 += JSON.stringify(reportData.originalData, null, 2);
        }
        
        segment3 += '\n```\n\n';
      }
      
      // 如果有额外信息，添加到文档中
      if (reportData.additionalInfo) {
        segment3 += `## 附加信息\n\n`;
        
        if (typeof reportData.additionalInfo === 'string') {
          segment3 += reportData.additionalInfo + '\n\n';
        } else if (Array.isArray(reportData.additionalInfo)) {
          reportData.additionalInfo.forEach((item, index) => {
            segment3 += `### 信息 ${index + 1}\n\n`;
            segment3 += `${item}\n\n`;
          });
        } else {
          Object.entries(reportData.additionalInfo).forEach(([key, value]) => {
            segment3 += `### ${key}\n\n`;
            segment3 += `${value}\n\n`;
          });
        }
      }
      
      // 添加检索关键词标签
      const tags = reportData.tags || ['日报', reportDate, '工作记录'];
      segment3 += `## 原始数据关键词\n\n`;
      segment3 += tags.map(tag => `#${tag}`).join(' ') + ' #原始数据 #JSON数据 #数据明细 #设备数据 #监控数据\n\n';
      
      // 合并三段内容，添加明确的分隔符
      const separator = "\n\n------- 段落分隔符 -------\n\n";
      let documentContent = segment1 + separator + segment2 + separator + segment3;
      
      console.log('日报文档内容预览 (分段后):');
      console.log('第1段预览: ' + segment1.substring(0, 100) + '...');
      console.log('第2段预览: ' + segment2.substring(0, 100) + '...');
      console.log('第3段预览: ' + segment3.substring(0, 100) + '...');
      
      // 验证文档内容是否为空
      if (!documentContent || documentContent.trim().length < 10) {
        throw new Error('日报文档内容为空或太短，无法上传');
      }
      
      // 记录文档大小，用于调试
      console.log(`文档内容长度: ${documentContent.length} 字符 (分为3段)`);
      
      // 估算文档的token数量（简单估算：中文每字约1.5个token，英文每字约0.25个token）
      const estimateTokens = (text) => {
        const chineseCharCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
        const otherCharCount = text.length - chineseCharCount;
        return Math.ceil(chineseCharCount * 1.5 + otherCharCount * 0.25);
      };
      
      // 计算每段内容的token数
      const segment1Tokens = estimateTokens(segment1);
      const segment2Tokens = estimateTokens(segment2);
      const segment3Tokens = estimateTokens(segment3);
      
      console.log(`估算的token数量: 第1段=${segment1Tokens}, 第2段=${segment2Tokens}, 第3段=${segment3Tokens}`);
      
      // 使用较小的max_tokens值，确保分段有效
      const tokenLimit = 1000; // 固定较小的token限制，确保分段生效
      
      // 准备更丰富的元数据，提升召回能力
      const metadata = {
        ...commonMetadata,
        tags: tags.join(','),
        content_length: documentContent.length,
        segments: 3,
        segment1_tokens: segment1Tokens,
        segment2_tokens: segment2Tokens,
        segment3_tokens: segment3Tokens
      };
      
      // API 接口地址
      const apiUrl = `${this.config.apiEndpoint}/datasets/${this.config.datasetId}/document/create-by-text`;
      
      console.log('请求URL:', apiUrl);
      
      // 创建请求数据
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
              separator: separator,
              max_tokens: tokenLimit,
              parent_mode: "full-doc"
            }
          }
        },
        metadata: metadata
      };
      
      // 验证请求数据
      if (!requestData.text || requestData.text.trim().length < 10) {
        console.error('警告: 请求数据中的文本内容为空或太短!');
        console.error('文本内容长度:', requestData.text ? requestData.text.length : 0);
        console.error('文本内容预览:', requestData.text ? requestData.text.substring(0, 100) : 'null');
      } else {
        console.log('请求数据文本长度验证通过:', requestData.text.length, '字符');
      }
      
      // 打印请求的关键信息，帮助调试
      console.log('请求信息概览:');
      console.log('- 文档标题:', requestData.name);
      console.log('- 索引技术:', requestData.indexing_technique);
      console.log('- 处理模式:', requestData.process_rule.mode);
      console.log('- 分段设置:', JSON.stringify(requestData.process_rule.rules.segmentation));
      
      // 保存请求数据日志，方便问题排查
      try {
        const logDir = path.join(__dirname, 'logs');
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }
        const logPath = path.join(logDir, `request-${reportDate}-${Date.now()}.json`);
        fs.writeFileSync(logPath, JSON.stringify({
          url: apiUrl,
          headers: {
            'Authorization': 'Bearer ***' // 不记录实际API密钥
          },
          data: {
            ...requestData,
            text: '第1段: ' + segment1.substring(0, 100) + '...\n' + 
                  '第2段: ' + segment2.substring(0, 100) + '...\n' + 
                  '第3段: ' + segment3.substring(0, 100) + '...'
          }
        }, null, 2));
        console.log(`请求数据已记录到: ${logPath}`);
      } catch (logError) {
        console.error('保存请求日志失败:', logError.message);
      }
      
      // 发送请求
      const response = await axios.post(
        apiUrl,
        requestData,
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000 // 增加超时时间到60秒，处理大文档
        }
      );
      
      console.log('创建日报文档响应:', response.status);
      console.log('响应详情:', JSON.stringify(response.data).substring(0, 500) + (JSON.stringify(response.data).length > 500 ? '...' : ''));
      
      // 检查是否有score为0的情况，这可能表示文档内容为空
      if (response.data && response.data.document && 
          (response.data.document.score === 0 || response.data.document.score === '0')) {
        console.warn('警告: 文档score为0，这可能表示文档内容没有被正确索引');
        console.warn('建议: 检查文档内容是否包含足够的信息，或API是否正确处理文本');
      }
      
      // 保存完整响应内容，方便问题排查
      try {
        const logDir = path.join(__dirname, 'logs');
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }
        const logPath = path.join(logDir, `response-${reportDate}-${Date.now()}.json`);
        fs.writeFileSync(logPath, JSON.stringify(response.data, null, 2));
        console.log(`响应数据已记录到: ${logPath}`);
      } catch (logError) {
        console.error('保存响应日志失败:', logError.message);
      }
      
      let documentId = null;
      
      // 尝试获取文档ID
      if (response.data && response.data.document && response.data.document.id) {
        documentId = response.data.document.id;
      } else if (response.data && response.data.id) {
        documentId = response.data.id;
      } else if (response.data && response.data.data && response.data.data.id) {
        documentId = response.data.data.id;
      }
      
      if (!documentId) {
        console.error('无法从响应中获取文档ID，响应数据:', JSON.stringify(response.data));
        throw new Error('无法从响应中获取文档ID');
      }
      
      console.log(`日报文档创建成功! ID: ${documentId}`);
      
      // 增加验证步骤，确认文档内容已上传
      try {
        console.log('验证文档内容是否已成功上传...');
        const verifyResponse = await axios.get(
          `${this.config.apiEndpoint}/datasets/${this.config.datasetId}/documents/${documentId}`,
          {
            headers: {
              'Authorization': `Bearer ${this.config.apiKey}`
            },
            timeout: 30000
          }
        );
        
        // 打印验证响应的详细信息
        console.log('验证响应状态码:', verifyResponse.status);
        console.log('验证响应内容概览:', JSON.stringify(verifyResponse.data).substring(0, 300) + '...');
        
        // 检查文档是否包含内容
        const hasContent = verifyResponse.data && 
                        ((verifyResponse.data.text && verifyResponse.data.text.length > 0) || 
                         (verifyResponse.data.content && verifyResponse.data.content.length > 0) ||
                         (verifyResponse.data.segments && verifyResponse.data.segments.length > 0));
        
        if (hasContent) {
          console.log('文档验证成功，包含内容');
        } else {
          console.warn('警告：文档似乎不包含内容');
        }
        
        if (verifyResponse.data && verifyResponse.data.status === 'ready') {
          console.log('文档验证成功，状态为 ready');
        } else if (verifyResponse.data && verifyResponse.data.indexing_status === 'completed') {
          console.log('文档验证成功，索引状态为 completed');
        } else {
          console.log('文档已创建但索引状态未完成，当前状态:', verifyResponse.data?.indexing_status || verifyResponse.data?.status || '未知');
          console.log('请稍后检查文档是否正确索引');
        }
        
        // 保存验证响应日志
        try {
          const logDir = path.join(__dirname, 'logs');
          const verifyLogPath = path.join(logDir, `verify-${reportDate}-${documentId}.json`);
          fs.writeFileSync(verifyLogPath, JSON.stringify(verifyResponse.data, null, 2));
          console.log(`验证响应已保存到: ${verifyLogPath}`);
        } catch (logErr) {
          console.error('保存验证日志失败:', logErr.message);
        }
      } catch (verifyError) {
        console.warn('验证文档上传状态时发生错误:', verifyError.message);
        if (verifyError.response) {
          console.warn('验证请求状态码:', verifyError.response.status);
          console.warn('验证错误详情:', JSON.stringify(verifyError.response.data || {}));
        }
        console.warn('这不一定意味着上传失败，但建议稍后检查文档是否正确索引');
        
        // 尝试使用另一种方式验证
        try {
          console.log('尝试使用文档列表API进行验证...');
          const listResponse = await axios.get(
            `${this.config.apiEndpoint}/datasets/${this.config.datasetId}/documents`,
            {
              headers: {
                'Authorization': `Bearer ${this.config.apiKey}`
              }
            }
          );
          
          const foundDoc = listResponse.data.data.find(doc => doc.id === documentId);
          if (foundDoc) {
            console.log('在文档列表中找到了创建的文档:', foundDoc.name);
            console.log('文档元数据:', JSON.stringify(foundDoc.metadata || {}));
          } else {
            console.warn('警告：在文档列表中未找到创建的文档');
          }
        } catch (listError) {
          console.error('获取文档列表失败:', listError.message);
        }
      }
      
      return {
        success: true,
        documentId: documentId,
        documentTitle: documentTitle,
        date: reportDate
      };
      
    } catch (error) {
      console.error('上传日报到知识库失败:', error.message);
      if (error.response) {
        console.error('状态码:', error.response.status);
        console.error('错误详情:', JSON.stringify(error.response.data));
        
        // 添加常见错误的具体处理
        if (error.response.status === 400) {
          if (error.response.data && error.response.data.message) {
            if (error.response.data.message.includes('pre_processing_rules')) {
              console.error('预处理规则配置错误，请检查process_rule配置');
            } else if (error.response.data.message.includes('too large')) {
              console.error('文档内容过大，超出API限制');
            }
          }
        } else if (error.response.status === 401) {
          console.error('API密钥无效或已过期');
        } else if (error.response.status === 404) {
          console.error('知识库ID不存在');
        } else if (error.response.status === 429) {
          console.error('API请求过于频繁，请稍后再试');
        }
      } else if (error.code === 'ECONNABORTED') {
        console.error('请求超时，可能是因为文档内容过大或网络问题');
      } else if (error.code === 'ECONNREFUSED') {
        console.error('无法连接到API服务器，请检查网络或API端点配置');
      }
      
      return {
        success: false,
        error: error.message,
        documentContent: documentContent ? documentContent.substring(0, 100) + '...' : '无内容'
      };
    }
  }

  /**
   * 获取前一天的数据并生成日报
   * @returns {Promise<Object>} 日报生成结果
   */
  async generateDailyReport() {
    let connection = null;
    try {
      console.log('开始生成日报...');
      
      if (!this.initialized) {
        console.log('Dify知识库服务未初始化，尝试初始化...');
        const initialized = await this.initialize();
        if (!initialized) {
          console.log('初始化失败，无法生成日报');
          return {
            success: false,
            error: 'initialization_failed'
          };
        }
      }
      
      // 获取数据库配置
      let dbConfig;
      try {
        // 尝试导入配置管理器
        const ConfigManager = require('./config-manager');
        const configManager = new ConfigManager();
        dbConfig = configManager.getDatabaseConfig();
        console.log('成功从配置管理器获取数据库配置');
      } catch (configError) {
        console.warn('未找到配置管理器或获取配置失败:', configError.message);
        console.log('使用默认数据库配置');
        // 使用默认配置
        dbConfig = {
          host: 'localhost',
          user: 'root',
          password: '753456Chen*',
          database: 'mqtt_data'
        };
      }
      
      console.log('数据库连接配置:', {
        host: dbConfig.host,
        user: dbConfig.user,
        database: dbConfig.database
      });
      
      // 连接数据库
      const mysql = require('mysql2/promise');
      connection = await mysql.createConnection(dbConfig);
      console.log('成功连接到数据库');
      
      // 计算前一天的日期
      const yesterday = moment().subtract(1, 'days').format('YYYY-MM-DD');
      const yesterdayStart = `${yesterday} 00:00:00`;
      const yesterdayEnd = `${yesterday} 23:59:59`;
      
      console.log(`获取${yesterday}的数据`);
      
      // 查询历史数据表，获取前一天的记录
      const [historyRows] = await connection.execute(
        'SELECT * FROM modbus_data_history WHERE updated_at BETWEEN ? AND ? ORDER BY updated_at',
        [yesterdayStart, yesterdayEnd]
      );
      
      console.log(`获取到 ${historyRows.length} 条历史数据`);
      
      if (historyRows.length === 0) {
        console.log('没有找到前一天的数据，尝试从最新数据表获取');
        
        // 如果历史表没有数据，则从最新数据表获取
        const [latestRows] = await connection.execute('SELECT * FROM modbus_data_latest');
        
        if (latestRows.length === 0) {
          throw new Error('没有找到可用数据来生成日报');
        }
        
        console.log(`从最新数据表获取到 ${latestRows.length} 条数据`);
        historyRows.push(...latestRows);
      }
      
      // 提取唯一的数据点名称
      const uniqueDataPoints = [...new Set(historyRows.map(item => item.data_point_name))];
      
      // 按数据点分组，统计变化
      const dataPointStats = {};
      uniqueDataPoints.forEach(name => {
        const pointData = historyRows.filter(item => item.data_point_name === name);
        
        // 按小时分组
        const hourlyData = {};
        pointData.forEach(item => {
          const hour = new Date(item.updated_at).getHours();
          if (!hourlyData[hour]) {
            hourlyData[hour] = [];
          }
          hourlyData[hour].push(item);
        });
        
        // 计算每个数据点的统计信息
        const values = pointData.map(item => parseFloat(item.value)).filter(val => !isNaN(val));
        
        dataPointStats[name] = {
          count: pointData.length,
          hoursCovered: Object.keys(hourlyData).length,
          min: values.length > 0 ? Math.min(...values) : null,
          max: values.length > 0 ? Math.max(...values) : null,
          avg: values.length > 0 ? (values.reduce((sum, val) => sum + val, 0) / values.length).toFixed(2) : null,
          unit: pointData[0].unit || '',
          lastValue: pointData[pointData.length - 1].value,
          quality: pointData[pointData.length - 1].quality || 'UNKNOWN'
        };
      });
      
      // 构建日报数据对象
      const reportData = {
        date: yesterday,
        dataPoints: uniqueDataPoints.length,
        recordCount: historyRows.length,
        stats: dataPointStats,
        hoursCovered: [...new Set(historyRows.map(item => new Date(item.updated_at).getHours()))].length
      };
      
      // 将数据发送到Dify API获取日报文本
      console.log('将数据发送到Dify API生成日报文本...');
      
      const difyResponse = await this.generateReportTextFromDify(reportData);
      
      if (!difyResponse.success) {
        throw new Error(`生成日报文本失败: ${difyResponse.error}`);
      }
      
      console.log('成功从Dify获取日报文本');
      
      // 构建完整的日报对象
      const dailyReport = {
        date: yesterday,
        content: difyResponse.content,
        originalData: {
          summary: reportData,
          dataPointStats: dataPointStats,
          recordCount: historyRows.length,
          uniqueDataPoints: uniqueDataPoints.length
        },
        tags: ['日报', yesterday, '设备监控', 'Modbus']
      };
      
      // 将日报保存到知识库
      console.log('将日报保存到知识库...');
      
      // 保存到数据库表
      try {
        // 创建日报表（如果不存在）
        await connection.execute(`
          CREATE TABLE IF NOT EXISTS modbus_daily_reports (
            id INT AUTO_INCREMENT PRIMARY KEY,
            report_date DATE NOT NULL,
            report_content TEXT NOT NULL,
            original_json JSON,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY (report_date)
          )
        `);
        
        // 插入或更新日报
        await connection.execute(
          `INSERT INTO modbus_daily_reports (report_date, report_content, original_json)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE report_content = VALUES(report_content), original_json = VALUES(original_json)`,
          [
            yesterday,
            dailyReport.content,
            JSON.stringify(dailyReport.originalData)
          ]
        );
        
        console.log('日报已保存到数据库');
      } catch (dbError) {
        console.error('保存日报到数据库失败:', dbError.message);
      }
      
      // 上传到知识库
      const uploadResult = await this.uploadDailyReportToDify(dailyReport);
      
      if (!uploadResult.success) {
        throw new Error(`上传日报到知识库失败: ${uploadResult.error}`);
      }
      
      console.log(`日报已成功上传到知识库，文档ID: ${uploadResult.documentId}`);
      
      return {
        success: true,
        date: yesterday,
        documentId: uploadResult.documentId,
        documentTitle: uploadResult.documentTitle,
        dataPointCount: uniqueDataPoints.length,
        recordCount: historyRows.length
      };
      
    } catch (error) {
      console.error('生成日报失败:', error.message);
      return {
        success: false,
        error: error.message
      };
    } finally {
      // 确保关闭数据库连接
      if (connection) {
        try {
          await connection.end();
          console.log('数据库连接已关闭');
        } catch (closeError) {
          console.error('关闭数据库连接失败:', closeError.message);
        }
      }
    }
  }

  /**
   * 从Dify API获取日报文本
   * @param {Object} reportData 日报数据
   * @returns {Promise<Object>} 日报文本生成结果
   */
  async generateReportTextFromDify(reportData) {
    try {
      console.log('从Dify API生成日报文本...');
      
      // 构建请求数据
      const requestData = {
        inputs: {
          date: reportData.date,
          dataPoints: reportData.dataPoints,
          recordCount: reportData.recordCount,
          hoursCovered: reportData.hoursCovered,
          dataPointDetails: JSON.stringify(reportData.stats, null, 2)
        },
        query: `请生成一份${reportData.date}的设备监控日报，包含以下内容：
1. 监控概述：监控了${reportData.dataPoints}个数据点，共${reportData.recordCount}条记录，覆盖了${reportData.hoursCovered}个小时
2. 重要数据点状态概述：分析重要设备的运行状态、异常情况
3. 趋势分析：对比前几天数据，分析运行趋势
4. 关键设备状态：列出关键设备的当前状态
5. 建议：根据数据分析，提出运维建议`,
        response_mode: "blocking",
        user: "modbus_system"
      };
      
      // 发送请求到Dify API
      const response = await axios.post(
        `${this.config.apiEndpoint}/chat-messages`,
        requestData,
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000 // 60秒超时
        }
      );
      
      if (!response.data || !response.data.answer) {
        throw new Error('Dify API返回了无效的响应');
      }
      
      return {
        success: true,
        content: response.data.answer,
        messageId: response.data.id || null
      };
      
    } catch (error) {
      console.error('生成日报文本失败:', error.message);
      if (error.response) {
        console.error('状态码:', error.response.status);
        console.error('错误详情:', JSON.stringify(error.response.data));
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 设置日报自动生成任务
   * @param {Object} options 配置选项 {hour: 生成时间(小时), minute: 分钟}
   */
  setupDailyReportSchedule(options = {hour: 7, minute: 0}) {
    // 默认每天早上7点生成
    const hour = options.hour || 7;
    const minute = options.minute || 0;
    
    console.log(`设置日报自动生成任务，时间: ${hour}:${minute}`);
    
    // 使用setInterval检查时间
    this.reportTimer = setInterval(() => {
      const now = new Date();
      
      // 如果当前时间是设定的生成时间，则执行生成任务
      if (now.getHours() === hour && now.getMinutes() === minute) {
        console.log(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] 执行日报生成任务...`);
        
        // 避免重复执行
        if (this.lastReportDate === moment().format('YYYY-MM-DD')) {
          console.log('今天已经生成过日报，跳过');
          return;
        }
        
        this.generateDailyReport()
          .then(result => {
            if (result.success) {
              console.log(`日报生成成功: ${result.documentTitle}`);
              // 记录最后生成日期
              this.lastReportDate = moment().format('YYYY-MM-DD');
            } else {
              console.error(`日报生成失败: ${result.error}`);
            }
          })
          .catch(error => {
            console.error('日报生成任务异常:', error.message);
          });
      }
    }, 60000); // 每分钟检查一次
    
    console.log('日报自动生成任务已设置');
    return true;
  }

  /**
   * 停止日报自动生成任务
   */
  stopDailyReportSchedule() {
    if (this.reportTimer) {
      clearInterval(this.reportTimer);
      this.reportTimer = null;
      console.log('日报自动生成任务已停止');
      return true;
    }
    
    console.log('没有正在运行的日报生成任务');
    return false;
  }

  /**
   * 测试日报生成和上传知识库
   * @param {string} date 指定日期，格式为YYYY-MM-DD，不传则默认为昨天
   * @returns {Promise<Object>} 测试结果
   */
  async testDailyReportGeneration(date) {
    console.log('开始测试日报生成和上传知识库功能...');
    
    try {
      // 如果未提供日期，则使用昨天的日期
      const targetDate = date || moment().subtract(1, 'days').format('YYYY-MM-DD');
      console.log(`将生成${targetDate}的日报`);
      
      // 调用日报生成功能
      const result = await this.generateDailyReport();
      
      if (result.success) {
        console.log('=== 日报生成成功 ===');
        console.log(`日期: ${result.date}`);
        console.log(`文档标题: ${result.documentTitle}`);
        console.log(`文档ID: ${result.documentId}`);
        console.log(`数据点数量: ${result.dataPointCount}`);
        console.log(`记录数量: ${result.recordCount}`);
        console.log('===================');
        
        return {
          success: true,
          ...result
        };
      } else {
        console.error(`日报生成失败: ${result.error}`);
        return result;
      }
    } catch (error) {
      console.error('测试日报生成过程中发生错误:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 使用现有文本内容测试日报上传至知识库
   * @param {Object} options 测试选项，包含{date, content, originalData}
   * @returns {Promise<Object>} 上传结果
   */
  async testUploadReportToKnowledge(options = {}) {
    try {
      console.log('开始测试日报上传至知识库...');
      
      // 准备测试数据
      const date = options.date || moment().subtract(1, 'days').format('YYYY-MM-DD');
      const content = options.content || `# ${date}日报测试内容\n\n这是一个测试日报，生成于${new Date().toLocaleString()}。\n\n## 设备运行情况\n\n所有设备运行正常，未发现异常。`;
      
      // 构建日报对象
      const dailyReport = {
        date: date,
        content: content,
        originalData: options.originalData || {
          testData: true,
          generatedAt: new Date().toISOString(),
          source: "手动测试"
        },
        tags: ['测试', '日报', date]
      };
      
      // 上传到知识库
      console.log('正在上传日报到知识库...');
      const result = await this.uploadDailyReportToDify(dailyReport);
      
      if (result.success) {
        console.log('=== 日报上传成功 ===');
        console.log(`日期: ${date}`);
        console.log(`文档标题: ${result.documentTitle}`);
        console.log(`文档ID: ${result.documentId}`);
        console.log('===================');
        
        return result;
      } else {
        console.error(`日报上传失败: ${result.error}`);
        return result;
      }
    } catch (error) {
      console.error('测试日报上传过程中发生错误:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 诊断指定文档ID的状态和内容
   * @param {string} documentId 文档ID
   * @returns {Promise<Object>} 诊断结果
   */
  async diagnoseDailyReportDocument(documentId) {
    try {
      console.log(`开始诊断文档 ${documentId} 的状态...`);
      
      if (!this.initialized) {
        await this.initialize();
      }
      
      if (!documentId) {
        throw new Error('必须提供文档ID');
      }
      
      const results = {
        documentId: documentId,
        checks: []
      };
      
      // 检查1: 文档元数据和状态
      try {
        console.log('检查文档元数据和状态...');
        const docResponse = await axios.get(
          `${this.config.apiEndpoint}/datasets/${this.config.datasetId}/documents/${documentId}`,
          {
            headers: {
              'Authorization': `Bearer ${this.config.apiKey}`
            },
            validateStatus: () => true // 接受任何状态码
          }
        );
        
        results.checks.push({
          name: '文档元数据检查',
          status: docResponse.status,
          success: docResponse.status >= 200 && docResponse.status < 300,
          details: docResponse.data
        });
        
        if (docResponse.status >= 200 && docResponse.status < 300) {
          // 检查是否有文本内容
          const hasContent = docResponse.data && 
            ((docResponse.data.text && docResponse.data.text.length > 0) || 
             (docResponse.data.content && docResponse.data.content.length > 0) ||
             (docResponse.data.segments && docResponse.data.segments.length > 0));
          
          results.hasContent = hasContent;
          results.indexingStatus = docResponse.data?.indexing_status || docResponse.data?.status || 'unknown';
          
          // 保存响应到日志
          const logDir = path.join(__dirname, 'logs');
          if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
          }
          const logPath = path.join(logDir, `diagnose-doc-${documentId}.json`);
          fs.writeFileSync(logPath, JSON.stringify(docResponse.data, null, 2));
          console.log(`诊断数据已保存到: ${logPath}`);
        }
      } catch (error) {
        results.checks.push({
          name: '文档元数据检查',
          success: false,
          error: error.message
        });
      }
      
      // 新增检查: 文档段落状态
      try {
        console.log('检查文档段落状态...');
        const segmentsResponse = await axios.get(
          `${this.config.apiEndpoint}/datasets/${this.config.datasetId}/documents/${documentId}/segments`,
          {
            headers: {
              'Authorization': `Bearer ${this.config.apiKey}`
            },
            validateStatus: () => true
          }
        );
        
        if (segmentsResponse.status >= 200 && segmentsResponse.status < 300) {
          const segments = segmentsResponse.data.data || [];
          
          results.checks.push({
            name: '文档段落检查',
            status: segmentsResponse.status,
            success: true,
            segmentCount: segments.length,
            details: {
              segmentIds: segments.map(s => s.id),
              segmentPositions: segments.map(s => s.position),
              segmentWordCounts: segments.map(s => s.word_count),
              segmentTokens: segments.map(s => s.tokens),
              segmentStatuses: segments.map(s => s.status)
            }
          });
          
          // 保存段落信息
          results.segmentCount = segments.length;
          results.segmentsCompleted = segments.filter(s => s.status === 'completed').length;
          results.segmentsEnabled = segments.filter(s => s.enabled).length;
          
          // 检查段落中是否包含关键词标记
          const segmentKeywords = {
            segment1Keywords: false, // 元数据段
            segment2Keywords: false, // 正文段
            segment3Keywords: false  // 原始数据段
          };
          
          segments.forEach(segment => {
            const content = segment.content || segment.sign_content || '';
            
            if (content.includes('元数据关键词') || content.includes('#元数据') || content.includes('#日报基本信息')) {
              segmentKeywords.segment1Keywords = true;
            }
            
            if (content.includes('正文关键词') || content.includes('#正文') || content.includes('#日报内容')) {
              segmentKeywords.segment2Keywords = true;
            }
            
            if (content.includes('原始数据关键词') || content.includes('#原始数据') || content.includes('#JSON数据')) {
              segmentKeywords.segment3Keywords = true;
            }
          });
          
          results.segmentKeywords = segmentKeywords;
          results.allSegmentsHaveKeywords = 
            segmentKeywords.segment1Keywords && 
            segmentKeywords.segment2Keywords && 
            segmentKeywords.segment3Keywords;
          
          // 记录分段明细到日志
          const segmentsLogPath = path.join(logDir, `diagnose-segments-${documentId}.json`);
          fs.writeFileSync(segmentsLogPath, JSON.stringify({
            segmentCount: segments.length,
            segments: segments.map(s => ({
              id: s.id,
              position: s.position,
              status: s.status,
              enabled: s.enabled,
              word_count: s.word_count,
              tokens: s.tokens,
              contentPreview: (s.content || s.sign_content || '').substring(0, 200) + '...'
            }))
          }, null, 2));
          console.log(`段落诊断数据已保存到: ${segmentsLogPath}`);
        } else {
          results.checks.push({
            name: '文档段落检查',
            status: segmentsResponse.status,
            success: false,
            error: `获取段落失败: ${segmentsResponse.statusText}`,
            details: segmentsResponse.data
          });
        }
      } catch (error) {
        results.checks.push({
          name: '文档段落检查',
          success: false,
          error: error.message
        });
      }
      
      // 检查2: 文档在列表中是否存在
      try {
        console.log('检查文档是否在列表中...');
        const listResponse = await axios.get(
          `${this.config.apiEndpoint}/datasets/${this.config.datasetId}/documents`,
          {
            headers: {
              'Authorization': `Bearer ${this.config.apiKey}`
            }
          }
        );
        
        const foundDoc = listResponse.data.data.find(doc => doc.id === documentId);
        results.checks.push({
          name: '文档列表检查',
          success: !!foundDoc,
          details: foundDoc || { message: '文档不在列表中' }
        });
        
        if (foundDoc) {
          results.documentInList = true;
          results.documentName = foundDoc.name;
          results.documentMetadata = foundDoc.metadata || {};
        } else {
          results.documentInList = false;
        }
      } catch (error) {
        results.checks.push({
          name: '文档列表检查',
          success: false,
          error: error.message
        });
      }
      
      // 检查3: 尝试使用文档进行查询
      try {
        console.log('测试使用文档进行查询...');
        const queryResponse = await axios.post(
          `${this.config.apiEndpoint}/datasets/${this.config.datasetId}/query`,
          {
            query: '日报内容摘要',
            top_k: 3,
            score_threshold: 0.6
          },
          {
            headers: {
              'Authorization': `Bearer ${this.config.apiKey}`
            },
            validateStatus: () => true
          }
        );
        
        results.checks.push({
          name: '文档查询测试',
          status: queryResponse.status,
          success: queryResponse.status >= 200 && queryResponse.status < 300,
          details: {
            resultCount: queryResponse.data?.data?.length || 0,
            hasResults: (queryResponse.data?.data?.length || 0) > 0
          }
        });
        
        // 查看是否我们的文档在查询结果中
        if (queryResponse.data && queryResponse.data.data) {
          const foundInQuery = queryResponse.data.data.some(item => 
            item.document_id === documentId || item.id === documentId);
          
          results.foundInQuery = foundInQuery;
          
          if (foundInQuery) {
            console.log('文档在查询结果中被找到');
          } else {
            console.log('文档不在查询结果中');
          }
        }
      } catch (error) {
        results.checks.push({
          name: '文档查询测试',
          success: false,
          error: error.message
        });
      }
      
      // 检查4: 尝试使用特定段落关键词进行精确查询
      try {
        console.log('测试使用段落关键词进行精确查询...');
        
        const segmentQueries = [
          { name: '元数据段查询', query: '元数据 日报基本信息' },
          { name: '正文段查询', query: '正文 日报内容 工作记录' },
          { name: '原始数据段查询', query: '原始数据 JSON数据' }
        ];
        
        const segmentQueryResults = [];
        
        for (const queryInfo of segmentQueries) {
          try {
            const response = await axios.post(
              `${this.config.apiEndpoint}/datasets/${this.config.datasetId}/query`,
              {
                query: queryInfo.query,
                top_k: 5,
                score_threshold: 0.5
              },
              {
                headers: {
                  'Authorization': `Bearer ${this.config.apiKey}`
                },
                validateStatus: () => true
              }
            );
            
            const foundInResults = response.data && response.data.data && 
              response.data.data.some(item => item.document_id === documentId || item.id === documentId);
            
            segmentQueryResults.push({
              name: queryInfo.name,
              query: queryInfo.query,
              success: response.status >= 200 && response.status < 300,
              foundInResults: foundInResults,
              resultCount: response.data?.data?.length || 0
            });
          } catch (error) {
            segmentQueryResults.push({
              name: queryInfo.name,
              query: queryInfo.query,
              success: false,
              error: error.message
            });
          }
        }
        
        results.checks.push({
          name: '段落关键词查询测试',
          success: segmentQueryResults.some(r => r.foundInResults),
          details: segmentQueryResults
        });
        
        // 保存段落查询结果
        results.segmentQueryResults = segmentQueryResults;
        results.segmentsFoundInQuery = segmentQueryResults.filter(r => r.foundInResults).length;
      } catch (error) {
        results.checks.push({
          name: '段落关键词查询测试',
          success: false,
          error: error.message
        });
      }
      
      // 汇总诊断结果
      results.summary = {
        allChecksSuccessful: results.checks.every(check => check.success),
        hasContent: results.hasContent || false,
        isInList: results.documentInList || false,
        isQueryable: results.foundInQuery || false,
        segmentCount: results.segmentCount || 0,
        segmentsCompleted: results.segmentsCompleted || 0,
        allSegmentsHaveKeywords: results.allSegmentsHaveKeywords || false,
        segmentsFoundInQuery: results.segmentsFoundInQuery || 0,
        indexingStatus: results.indexingStatus || 'unknown',
        recommendation: ''
      };
      
      // 生成建议
      if (!results.summary.hasContent) {
        results.summary.recommendation += '文档似乎没有内容，建议重新上传或检查API接口。';
      }
      
      if (!results.summary.isInList) {
        results.summary.recommendation += '文档不在列表中，可能没有成功创建。';
      }
      
      if (!results.summary.isQueryable) {
        results.summary.recommendation += '文档无法被查询到，索引可能未完成或内容为空。';
      }
      
      if (results.summary.segmentCount !== 3) {
        results.summary.recommendation += `文档应有3个段落，但实际有${results.summary.segmentCount}个，分段可能未正确应用。`;
      }
      
      if (!results.summary.allSegmentsHaveKeywords) {
        results.summary.recommendation += '有些段落缺少关键词标记，可能影响检索效果。';
      }
      
      if (results.summary.segmentsFoundInQuery === 0) {
        results.summary.recommendation += '使用段落关键词无法查询到文档，检索功能可能未正常工作。';
      }
      
      console.log('诊断完成，结果:', JSON.stringify(results.summary));
      return results;
    } catch (error) {
      console.error('诊断文档失败:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = DifyKnowledgeService; 
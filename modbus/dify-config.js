/**
 * Dify知识库API配置
 */

module.exports = {
  // 是否启用Dify知识库集成
  enabled: process.env.DIFY_ENABLED === 'true' || true,
  
  // Dify API基础URL
  baseURL: process.env.DIFY_BASE_URL || 'http://localhost/v1',
  
  // Dify API密钥
  apiKey: process.env.DIFY_API_KEY || '',
  
  // Dify数据集ID
  datasetId: process.env.DIFY_DATASET_ID || '',
  
  // 上传配置
  upload: {
    // 是否在每日结束时上传
    dailyUpload: true,
    
    // 上传时间（小时，0-23）
    uploadHour: 23
  }
}; 
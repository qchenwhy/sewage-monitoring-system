/**
 * Modbus数据到Dify知识库传输工具
 * 
 * 本脚本将modbus_data_latest表中的数据定期存储到文件系统
 * 并可选择性地上传到Dify知识库
 */

// 导入所需模块
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { promisify } = require('util');
const mkdirAsync = promisify(fs.mkdir);
const writeFileAsync = promisify(fs.writeFile);
const readFileAsync = promisify(fs.readFile);
const existsAsync = promisify(fs.exists);

// 优先加载项目的数据库配置
let dbConfig;
try {
  dbConfig = require('./db-config');
  console.log('已加载数据库配置文件');
} catch (err) {
  console.error('无法加载数据库配置文件:', err.message);
  process.exit(1);
}

// 加载Dify配置
let difyConfig = {};
try {
  difyConfig = require('./dify-config');
  console.log('已加载Dify配置文件');
} catch (err) {
  console.warn('无法加载Dify配置文件，将使用默认配置:', err.message);
}

// 配置信息
const CONFIG = {
  // Dify API配置
  dify: {
    enabled: difyConfig.enabled || (process.env.DIFY_ENABLED === 'true'),
    baseURL: difyConfig.baseURL || process.env.DIFY_BASE_URL || 'http://localhost/v1',
    apiKey: difyConfig.apiKey || process.env.DIFY_API_KEY || '',
    datasetId: difyConfig.datasetId || process.env.DIFY_DATASET_ID || '',
    dailyUpload: difyConfig.upload?.dailyUpload !== undefined ? difyConfig.upload.dailyUpload : true,
    uploadHour: difyConfig.upload?.uploadHour !== undefined ? difyConfig.upload.uploadHour : 23
  },
  
  // 文件存储配置
  storage: {
    directory: process.env.STORAGE_DIR || path.join(__dirname, '..', 'data', 'modbus_archives'),
    indexFileName: 'index.json'
  }
};

/**
 * 主函数 - 存储当前小时的Modbus数据
 */
async function storeModbusDataForCurrentHour() {
  console.log('==========================================');
  console.log('开始执行Modbus数据归档任务...');
  console.log(`当前时间: ${new Date().toISOString()}`);
  
  let connection;
  try {
    // 创建存储目录（如果不存在）
    await ensureDirectoryExists(CONFIG.storage.directory);
    
    // 获取当前时间信息
    const now = new Date();
    const currentHour = now.getHours();
    const dateStr = now.toISOString().split('T')[0]; // 如: 2025-05-12
    
    console.log(`处理 ${dateStr} 的第 ${currentHour} 小时数据`);
    
    // 创建数据库连接
    connection = await dbConfig.getConnection();
    console.log(`已连接到数据库 ${dbConfig.getDatabaseName()}`);
    
    // 查询最新数据
    const [rows] = await connection.execute(
      'SELECT * FROM modbus_data_latest ORDER BY data_point_name'
    );
    
    if (rows.length === 0) {
      console.log('没有找到Modbus数据');
      return;
    }
    
    console.log(`找到 ${rows.length} 条Modbus数据点记录`);
    
    // 准备存储的数据
    const formattedData = rows.map(row => ({
      id: row.id,
      dataPointId: row.data_point_id,
      dataPointIdentifier: row.data_point_identifier,
      dataPointName: row.data_point_name,
      value: row.value,
      formattedValue: row.formatted_value,
      quality: row.quality,
      dataType: row.data_type,
      updatedAt: row.updated_at
    }));
    
    // 文件命名格式: modbus_data_YYYY-MM-DD.json
    const fileName = `modbus_data_${dateStr}.json`;
    const filePath = path.join(CONFIG.storage.directory, fileName);
    
    // 存储数据到文件
    await storeDataToFile(filePath, dateStr, currentHour, formattedData);
    
    // 更新索引文件
    await updateDataIndex(dateStr, currentHour, formattedData.length);
    
    // 如果启用了Dify集成，上传到知识库
    if (CONFIG.dify.enabled && CONFIG.dify.apiKey && CONFIG.dify.datasetId) {
      // 只有在配置的上传小时才上传完整的日数据到Dify
      if (CONFIG.dify.dailyUpload && currentHour === CONFIG.dify.uploadHour) {
        await uploadDataToDify(dateStr);
      }
    }
    
    console.log('Modbus数据归档任务完成');
    
  } catch (error) {
    console.error('Modbus数据归档任务失败:', error);
  } finally {
    // 关闭数据库连接
    if (connection) {
      await connection.end();
      console.log('数据库连接已关闭');
    }
    console.log('==========================================');
  }
}

/**
 * 确保目录存在，如果不存在则创建
 * @param {string} directory 目录路径
 */
async function ensureDirectoryExists(directory) {
  try {
    if (!await existsAsync(directory)) {
      await mkdirAsync(directory, { recursive: true });
      console.log(`创建目录: ${directory}`);
    }
  } catch (error) {
    console.error(`创建目录失败 ${directory}:`, error);
    throw error;
  }
}

/**
 * 将数据存储到文件
 * @param {string} filePath 文件路径
 * @param {string} dateStr 日期字符串 (YYYY-MM-DD)
 * @param {number} hour 小时 (0-23)
 * @param {Array} data 要存储的数据
 */
async function storeDataToFile(filePath, dateStr, hour, data) {
  try {
    // 准备要存储的数据对象
    const hourKey = `hour_${hour}`;
    let fileData = {};
    
    // 如果文件已存在，读取现有内容
    if (await existsAsync(filePath)) {
      const fileContent = await readFileAsync(filePath, 'utf8');
      try {
        fileData = JSON.parse(fileContent);
      } catch (parseError) {
        console.error(`解析现有文件失败 ${filePath}:`, parseError);
        // 如果解析失败，使用空对象继续
        fileData = {};
      }
    }
    
    // 添加当前小时的数据
    fileData[hourKey] = {
      timestamp: new Date().toISOString(),
      recordCount: data.length,
      data: data,
      metadata: {
        dataPointCount: data.length,
        dataPointNames: data.map(item => item.dataPointName).filter((value, index, self) => self.indexOf(value) === index)
      }
    };
    
    // 写入文件
    await writeFileAsync(filePath, JSON.stringify(fileData, null, 2));
    console.log(`成功将 ${data.length} 条数据存储到文件 ${filePath} [${hourKey}]`);
    
    return true;
  } catch (error) {
    console.error(`将数据存储到文件失败 ${filePath}:`, error);
    throw error;
  }
}

/**
 * 更新数据索引文件
 * @param {string} dateStr 日期字符串 (YYYY-MM-DD)
 * @param {number} hour 小时 (0-23)
 * @param {number} recordCount 记录数量
 */
async function updateDataIndex(dateStr, hour, recordCount) {
  try {
    const indexPath = path.join(CONFIG.storage.directory, CONFIG.storage.indexFileName);
    const hourKey = `hour_${hour}`;
    let indexData = {};
    
    // 如果索引文件已存在，读取现有内容
    if (await existsAsync(indexPath)) {
      const indexContent = await readFileAsync(indexPath, 'utf8');
      try {
        indexData = JSON.parse(indexContent);
      } catch (parseError) {
        console.error(`解析索引文件失败:`, parseError);
        // 如果解析失败，使用空对象继续
        indexData = {};
      }
    }
    
    // 更新索引数据
    if (!indexData[dateStr]) {
      indexData[dateStr] = {};
    }
    
    indexData[dateStr][hourKey] = {
      timestamp: new Date().toISOString(),
      recordCount: recordCount,
      fileName: `modbus_data_${dateStr}.json`
    };
    
    // 写入索引文件
    await writeFileAsync(indexPath, JSON.stringify(indexData, null, 2));
    console.log(`成功更新索引文件 ${indexPath}`);
    
    return true;
  } catch (error) {
    console.error(`更新索引文件失败:`, error);
    throw error;
  }
}

/**
 * 上传数据到Dify知识库
 * @param {string} dateStr 日期字符串 (YYYY-MM-DD)
 */
async function uploadDataToDify(dateStr) {
  try {
    if (!CONFIG.dify.enabled || !CONFIG.dify.apiKey || !CONFIG.dify.datasetId) {
      console.log('Dify集成未启用或配置不完整，跳过上传');
      return false;
    }
    
    const filePath = path.join(CONFIG.storage.directory, `modbus_data_${dateStr}.json`);
    if (!await existsAsync(filePath)) {
      console.error(`要上传的文件不存在: ${filePath}`);
      return false;
    }
    
    console.log(`准备上传 ${dateStr} 的数据到Dify知识库...`);
    
    // 检查知识库中是否已存在该日期的文档
    try {
      const checkResponse = await axios({
        method: 'get',
        url: `${CONFIG.dify.baseURL}/datasets/${CONFIG.dify.datasetId}/documents`,
        headers: {
          'Authorization': `Bearer ${CONFIG.dify.apiKey}`
        }
      });
      
      if (checkResponse.data && checkResponse.data.data) {
        const existingDocs = checkResponse.data.data.filter(doc => 
          doc.name === `Modbus数据_${dateStr}` || 
          (doc.metadata && doc.metadata.date === dateStr)
        );
        
        if (existingDocs.length > 0) {
          console.log(`${dateStr} 的Modbus数据已存在于知识库中，文档ID: ${existingDocs[0].id}`);
          return true; // 已存在，无需重复上传
        }
      }
    } catch (checkError) {
      console.warn(`检查已有文档失败，将继续尝试上传: ${checkError.message}`);
    }
    
    // 读取文件内容
    const fileContent = await readFileAsync(filePath, 'utf8');
    const data = JSON.parse(fileContent);
    
    // 准备文档标题和内容
    const documentTitle = `Modbus数据_${dateStr}`;
    const timestamp = new Date().toISOString();
    
    // 提取所有小时的数据点名称、ID和总记录数
    let totalRecords = 0;
    const allDataPointNames = new Set();
    const allDataPointIds = new Set();
    const hourlyStats = {};
    
    Object.entries(data).forEach(([hourKey, hourData]) => {
      const hour = hourKey.replace('hour_', '');
      totalRecords += hourData.recordCount || 0;
      
      // 收集数据点名称
      if (hourData.metadata && hourData.metadata.dataPointNames) {
        hourData.metadata.dataPointNames.forEach(name => allDataPointNames.add(name));
      }
      
      // 收集数据点ID
      if (hourData.data && hourData.data.length > 0) {
        hourData.data.forEach(item => {
          if (item.id) allDataPointIds.add(item.id);
          if (item.dataPointId) allDataPointIds.add(item.dataPointId);
        });
      }
      
      // 收集每小时统计数据
      hourlyStats[hour] = {
        recordCount: hourData.recordCount || 0,
        timestamp: hourData.timestamp,
        dataPointCount: hourData.metadata?.dataPointNames?.length || 0
      };
    });
    
    const uniqueDataPointNames = Array.from(allDataPointNames);
    const uniqueDataPointIds = Array.from(allDataPointIds);
    
    // 为Dify准备格式化的内容 - 优化结构以提高可读性和召回率
    let formattedContent = `# ${documentTitle}\n\n`;
    
    // 添加结构化元信息，用于准确召回
    formattedContent += `## 文档元信息\n\n`;
    formattedContent += `- **文档类型**: Modbus设备日数据汇总\n`;
    formattedContent += `- **记录日期**: ${dateStr}\n`;
    formattedContent += `- **创建时间**: ${timestamp}\n`;
    formattedContent += `- **文档ID**: modbus_daily_${dateStr.replace(/-/g, '')}\n`;
    formattedContent += `- **数据点数量**: ${uniqueDataPointNames.length}个\n`;
    formattedContent += `- **小时记录数**: ${Object.keys(data).length}个\n`;
    formattedContent += `- **总记录数**: ${totalRecords}条\n\n`;
    
    // 添加数据点列表（以便更容易搜索）
    formattedContent += `### 监控设备列表\n\n`;
    uniqueDataPointNames.forEach((name, index) => {
      formattedContent += `${index + 1}. ${name}\n`;
    });
    formattedContent += '\n';
    
    // 添加时间段概览
    formattedContent += `## 时间段概览\n\n`;
    formattedContent += `本文档包含 ${dateStr} 全天24小时的Modbus设备数据记录，按小时分段整理。\n\n`;
    formattedContent += `| 时间段 | 数据点数量 | 记录数 | 记录时间戳 |\n`;
    formattedContent += `| ------ | ---------- | ------ | ---------- |\n`;
    
    // 按小时排序
    Object.entries(hourlyStats)
      .sort(([hourA], [hourB]) => parseInt(hourA) - parseInt(hourB))
      .forEach(([hour, stats]) => {
        const timeRange = `${hour}:00-${hour}:59`;
        formattedContent += `| ${timeRange} | ${stats.dataPointCount} | ${stats.recordCount} | ${stats.timestamp || '-'} |\n`;
      });
    
    formattedContent += '\n';
    
    // 计算数据的基本统计信息（如果数据支持）
    const dataStats = {};
    let hasNumericData = false;
    
    Object.values(data).forEach(hourData => {
      if (hourData.data && hourData.data.length > 0) {
        hourData.data.forEach(item => {
          const pointName = item.dataPointName || item.data_point_name;
          if (!pointName) return;
          
          const value = parseFloat(item.value);
          if (!isNaN(value)) {
            hasNumericData = true;
            if (!dataStats[pointName]) {
              dataStats[pointName] = {
                min: value,
                max: value,
                sum: value,
                count: 1
              };
            } else {
              dataStats[pointName].min = Math.min(dataStats[pointName].min, value);
              dataStats[pointName].max = Math.max(dataStats[pointName].max, value);
              dataStats[pointName].sum += value;
              dataStats[pointName].count++;
            }
          }
        });
      }
    });
    
    // 如果有数值型数据，添加统计部分
    if (hasNumericData && Object.keys(dataStats).length > 0) {
      formattedContent += `## 数据统计分析\n\n`;
      formattedContent += `| 数据点名称 | 最小值 | 最大值 | 平均值 | 样本数 |\n`;
      formattedContent += `| ---------- | ------ | ------ | ------ | ------ |\n`;
      
      Object.entries(dataStats).forEach(([name, stats]) => {
        const avg = (stats.sum / stats.count).toFixed(2);
        formattedContent += `| ${name} | ${stats.min} | ${stats.max} | ${avg} | ${stats.count} |\n`;
      });
      
      formattedContent += '\n';
    }
    
    // 添加每个小时的详细数据（优化格式，减少重复内容）
    formattedContent += `## 详细数据记录\n\n`;
    
    // 按小时排序
    const sortedHours = Object.entries(data).sort(([hourKeyA], [hourKeyB]) => {
      const hourA = parseInt(hourKeyA.replace('hour_', ''));
      const hourB = parseInt(hourKeyB.replace('hour_', ''));
      return hourA - hourB;
    });
    
    sortedHours.forEach(([hourKey, hourData]) => {
      const hour = hourKey.replace('hour_', '');
      const timeRange = `${hour}:00-${hour}:59`;
      
      // 格式化当前小时的数据
      formattedContent += `### ${dateStr} ${timeRange}数据\n\n`;
      
      // 添加小时数据的基本信息
      formattedContent += `- **时间段**: ${dateStr} ${timeRange}\n`;
      formattedContent += `- **记录时间**: ${hourData.timestamp || '-'}\n`;
      formattedContent += `- **数据点数量**: ${hourData.recordCount || 0}\n`;
      
      if (hourData.metadata && hourData.metadata.dataPointNames) {
        const dataPointNames = hourData.metadata.dataPointNames;
        if (dataPointNames.length <= 10) {
          formattedContent += `- **监控点**: ${dataPointNames.join(', ')}\n`;
        } else {
          formattedContent += `- **监控点**: ${dataPointNames.slice(0, 10).join(', ')} 等${dataPointNames.length}个\n`;
        }
      }
      
      formattedContent += '\n';
      
      // 添加样例数据，避免内容过长
      if (hourData.data && hourData.data.length > 0) {
        formattedContent += `数据样例（显示前5条）：\n\n`;
        
        // 添加结构化的数据表
        formattedContent += `| 数据点ID | 数据点名称 | 值 | 格式化值 |\n`;
        formattedContent += `| -------- | ---------- | -- | -------- |\n`;
        
        const sampleData = hourData.data.slice(0, Math.min(5, hourData.data.length));
        sampleData.forEach(item => {
          const id = item.id || item.dataPointId || '-';
          const name = item.dataPointName || item.data_point_name || '-';
          const value = item.value || '-';
          const formattedValue = item.formattedValue || item.formatted_value || value;
          
          formattedContent += `| ${id} | ${name} | ${value} | ${formattedValue} |\n`;
        });
        
        formattedContent += '\n';
      }
    });
    
    // 构建更丰富的元数据对象
    const metadata = {
      source: 'modbus_system',
      document_id: `modbus_daily_${dateStr.replace(/-/g, '')}`,
      date: dateStr,
      file_path: filePath,
      type: 'modbus_daily_summary',
      device_count: uniqueDataPointNames.length,
      hour_count: Object.keys(data).length,
      record_count: totalRecords,
      device_list: uniqueDataPointNames.join(','),
      device_ids: uniqueDataPointIds.join(','),
      timestamp: timestamp,
      hours_recorded: Object.keys(hourlyStats).join(','),
      creation_time: new Date().toISOString(),
      has_numeric_data: hasNumericData
    };
    
    // 上传到Dify知识库
    const response = await axios({
      method: 'post',
      url: `${CONFIG.dify.baseURL}/datasets/${CONFIG.dify.datasetId}/documents`,
      headers: {
        'Authorization': `Bearer ${CONFIG.dify.apiKey}`,
        'Content-Type': 'application/json'
      },
      data: {
        name: documentTitle,
        content: formattedContent,
        metadata: metadata
      }
    });
    
    console.log(`成功上传到Dify知识库，文档ID: ${response.data.id}`);
    return true;
  } catch (error) {
    console.error('上传到Dify知识库失败:', error.response?.data || error.message);
    return false;
  }
}

// 直接执行一次（测试用）
if (require.main === module) {
  storeModbusDataForCurrentHour()
    .then(() => console.log('脚本执行完成'))
    .catch(err => console.error('脚本执行失败:', err));
}

// 导出函数，供其他模块使用
module.exports = {
  storeModbusDataForCurrentHour,
  uploadDataToDify
}; 
/**
 * Modbus数据同步到Dify知识库的定时任务
 * 
 * 该脚本实现每小时将modbus_data_latest表中的数据存入Dify知识库
 * 每天24小时的数据将存入一个文档，使用清晰的命名以便后期准确召回
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const axios = require('axios');
const moment = require('moment');

// 导入配置管理器
const ConfigManager = require('./config-manager');
const configManager = new ConfigManager();

// Dify知识库服务
const DifyService = require('./dify-knowledge-service').getInstance();

// 日志目录
const LOG_DIR = path.join(__dirname, '..', 'logs', 'dify-sync');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 数据存储目录
const DATA_DIR = path.join(__dirname, '..', 'data', 'modbus-hourly');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 日志文件
const getLogFile = () => path.join(LOG_DIR, `dify-sync-${moment().format('YYYY-MM-DD')}.log`);

// 写入日志
function log(message) {
  const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
  const logMessage = `[${timestamp}] ${message}\n`;
  
  console.log(logMessage.trim());
  fs.appendFileSync(getLogFile(), logMessage);
}

// 获取modbus_data_latest表数据
async function getModbusLatestData() {
  let connection;
  const dbConfig = configManager.getDatabaseConfig();
  
  try {
    log('连接数据库...');
    connection = await mysql.createConnection({
      host: dbConfig.host || 'localhost',
      user: dbConfig.user || 'root',
      password: dbConfig.password || '',
      database: dbConfig.database || 'modbus_db'
    });
    
    log('查询modbus_data_latest表数据...');
    const [rows] = await connection.execute('SELECT * FROM modbus_data_latest ORDER BY data_point_name');
    
    log(`获取到 ${rows.length} 条数据`);
    return rows;
  } catch (error) {
    log(`获取数据失败: ${error.message}`);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      log('数据库连接已关闭');
    }
  }
}

// 将每小时数据保存到本地文件
async function saveHourlyDataToFile(data, hour) {
  try {
    const today = moment().format('YYYY-MM-DD');
    const dirPath = path.join(DATA_DIR, today);
    
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    // 格式化数据
    const formattedData = data.map(item => ({
      id: item.id,
      dataPointId: item.data_point_id,
      dataPointName: item.data_point_name,
      value: item.value,
      formattedValue: item.formatted_value,
      quality: item.quality,
      dataType: item.data_type,
      updatedAt: item.updated_at
    }));
    
    // 保存到文件
    const fileName = `hour-${hour.toString().padStart(2, '0')}.json`;
    const filePath = path.join(dirPath, fileName);
    
    fs.writeFileSync(filePath, JSON.stringify(formattedData, null, 2));
    log(`已将第 ${hour} 小时的数据保存到 ${filePath}`);
    
    return {
      filePath,
      count: formattedData.length
    };
  } catch (error) {
    log(`保存小时数据失败: ${error.message}`);
    throw error;
  }
}

// 检查当天的24小时数据是否已完整收集
async function checkDailyDataComplete() {
  const today = moment().format('YYYY-MM-DD');
  const dirPath = path.join(DATA_DIR, today);
  
  if (!fs.existsSync(dirPath)) {
    return false;
  }
  
  const files = fs.readdirSync(dirPath);
  const hourlyFiles = files.filter(file => file.startsWith('hour-') && file.endsWith('.json'));
  
  // 如果有24个小时的文件，认为数据已完整
  return hourlyFiles.length === 24;
}

// 合并当天24小时数据为一个文档
async function mergeDailyData() {
  try {
    const today = moment().format('YYYY-MM-DD');
    const dirPath = path.join(DATA_DIR, today);
    
    if (!fs.existsSync(dirPath)) {
      log(`${today} 的数据目录不存在`);
      return null;
    }
    
    const files = fs.readdirSync(dirPath)
      .filter(file => file.startsWith('hour-') && file.endsWith('.json'))
      .sort();
    
    if (files.length === 0) {
      log(`${today} 没有小时数据文件`);
      return null;
    }
    
    log(`找到 ${files.length} 个小时数据文件，准备合并`);
    
    // 读取并合并所有小时数据
    const dailyData = {};
    
    for (const file of files) {
      const hourMatch = file.match(/hour-(\d{2})\.json/);
      if (!hourMatch) continue;
      
      const hour = parseInt(hourMatch[1]);
      const filePath = path.join(dirPath, file);
      const fileContent = fs.readFileSync(filePath, 'utf8');
      
      try {
        const hourData = JSON.parse(fileContent);
        dailyData[`hour_${hour}`] = {
          timestamp: `${today}T${hour.toString().padStart(2, '0')}:00:00`,
          recordCount: hourData.length,
          data: hourData
        };
      } catch (e) {
        log(`解析 ${file} 失败: ${e.message}`);
      }
    }
    
    // 保存合并后的数据
    const mergedFilePath = path.join(dirPath, `modbus_data_${today}.json`);
    fs.writeFileSync(mergedFilePath, JSON.stringify(dailyData, null, 2));
    
    log(`已将 ${today} 的 ${files.length} 小时数据合并到 ${mergedFilePath}`);
    
    return {
      date: today,
      filePath: mergedFilePath,
      hourCount: files.length,
      hours: Object.keys(dailyData)
    };
  } catch (error) {
    log(`合并日数据失败: ${error.message}`);
    throw error;
  }
}

// 将合并后的数据上传到Dify知识库
async function uploadToDify(mergedData) {
  try {
    if (!DifyService.initialized) {
      log('初始化Dify服务...');
      await DifyService.initialize();
    }
    
    const config = DifyService.getConfig();
    
    if (!config.enabled) {
      log('Dify服务已禁用，无法上传数据');
      return { success: false, error: 'service_disabled' };
    }
    
    if (!config.apiKey || !config.datasetId) {
      log('Dify配置不完整，缺少API密钥或知识库ID');
      return { success: false, error: 'invalid_config' };
    }
    
    // 从合并文件中读取数据
    const fileContent = fs.readFileSync(mergedData.filePath, 'utf8');
    const data = JSON.parse(fileContent);
    
    // 构建文档标题和内容
    const documentTitle = `Modbus数据_${mergedData.date}`;
    
    // 构建文档内容
    let documentContent = `# ${documentTitle}\n\n`;
    documentContent += `收集日期: ${mergedData.date}\n`;
    documentContent += `小时数: ${mergedData.hourCount}\n\n`;
    
    // 添加每小时数据概述
    Object.entries(data).forEach(([hourKey, hourData]) => {
      const hour = hourKey.replace('hour_', '');
      documentContent += `## ${hour}时数据\n\n`;
      documentContent += `- 记录数量: ${hourData.recordCount}\n`;
      documentContent += `- 记录时间: ${hourData.timestamp}\n\n`;
      
      // 添加数据点名称列表（去重）
      const dataPointNames = [...new Set(hourData.data.map(item => item.dataPointName))];
      documentContent += `### 数据点列表\n\n`;
      dataPointNames.forEach(name => {
        documentContent += `- ${name}\n`;
      });
      
      documentContent += '\n';
    });
    
    // 创建临时文件
    const tempDir = path.join(__dirname, '..', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const tempFile = path.join(tempDir, `${documentTitle.replace(/[\\/:*?"<>|]/g, '_')}.md`);
    fs.writeFileSync(tempFile, documentContent, 'utf8');
    
    log(`已创建临时文档: ${tempFile}`);
    
    // 使用表单上传文件
    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('name', documentTitle);
    formData.append('data_source_type', 'upload');
    formData.append('file', fs.createReadStream(tempFile));
    
    log('开始上传到Dify知识库...');
    const response = await axios.post(
      `${config.apiEndpoint}/datasets/${config.datasetId}/documents`,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          ...formData.getHeaders()
        }
      }
    );
    
    // 清理临时文件
    fs.unlinkSync(tempFile);
    
    log(`成功上传到Dify知识库，文档ID: ${response.data.id}`);
    
    return {
      success: true,
      documentId: response.data.id,
      documentTitle
    };
  } catch (error) {
    log(`上传到Dify知识库失败: ${error.message}`);
    
    if (error.response) {
      log(`状态码: ${error.response.status}`);
      log(`错误信息: ${JSON.stringify(error.response.data)}`);
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

// 执行小时定时任务
async function runHourlyTask() {
  try {
    const currentHour = new Date().getHours();
    log(`======== 开始执行第 ${currentHour} 小时数据同步任务 ========`);
    
    // 获取最新数据
    const latestData = await getModbusLatestData();
    
    if (!latestData || latestData.length === 0) {
      log('没有可同步的数据');
      return;
    }
    
    // 保存当前小时数据
    const savedFile = await saveHourlyDataToFile(latestData, currentHour);
    log(`成功保存 ${savedFile.count} 条数据到文件`);
    
    // 检查是否为当天最后一个小时 (23点)
    if (currentHour === 23) {
      log('检测到是当天的最后一个小时，准备合并数据并上传到Dify');
      
      // 等待2分钟确保数据文件写入完成
      log('等待2分钟以确保数据文件写入完成...');
      await new Promise(resolve => setTimeout(resolve, 2 * 60 * 1000));
      
      // 合并当天数据
      const mergedData = await mergeDailyData();
      
      if (mergedData) {
        // 上传到Dify
        const uploadResult = await uploadToDify(mergedData);
        
        if (uploadResult.success) {
          log(`成功将当天数据上传到Dify，文档ID: ${uploadResult.documentId}`);
        } else {
          log(`上传失败: ${uploadResult.error}`);
        }
      }
    }
    
    log(`======== 第 ${currentHour} 小时数据同步任务完成 ========`);
  } catch (error) {
    log(`小时任务执行失败: ${error.message}`);
    log(error.stack);
  }
}

// 启动定时任务
function startSchedule() {
  log('正在启动Modbus数据到Dify知识库的定时同步任务');
  
  // 立即执行一次
  runHourlyTask();
  
  // 设置每小时执行一次
  const scheduleHourlyTask = () => {
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(now.getHours() + 1, 0, 0, 0);
    
    const timeUntilNextHour = nextHour - now;
    log(`下次执行时间: ${nextHour.toLocaleString()}, ${Math.floor(timeUntilNextHour/60000)} 分钟后`);
    
    setTimeout(() => {
      runHourlyTask();
      scheduleHourlyTask(); // 递归调度下一个小时
    }, timeUntilNextHour);
  };
  
  scheduleHourlyTask();
}

// 手动合并与上传功能
async function manualMergeAndUpload(date) {
  try {
    const targetDate = date || moment().format('YYYY-MM-DD');
    log(`======== 手动合并并上传 ${targetDate} 的数据 ========`);
    
    // 设置数据目录
    const dirPath = path.join(DATA_DIR, targetDate);
    
    if (!fs.existsSync(dirPath)) {
      log(`错误: ${targetDate} 的数据目录不存在`);
      return {
        success: false,
        error: 'directory_not_found'
      };
    }
    
    // 合并数据
    const mergedData = await mergeDailyData();
    
    if (!mergedData) {
      log(`错误: 无法合并 ${targetDate} 的数据`);
      return {
        success: false,
        error: 'merge_failed'
      };
    }
    
    // 上传到Dify
    const uploadResult = await uploadToDify(mergedData);
    
    log(`======== 手动合并与上传完成 ========`);
    return uploadResult;
  } catch (error) {
    log(`手动合并与上传失败: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

// 测试Dify连接
async function testDifyConnection() {
  try {
    if (!DifyService.initialized) {
      log('初始化Dify服务...');
      await DifyService.initialize();
    }
    
    const config = DifyService.getConfig();
    
    if (!config.enabled) {
      return {
        success: false,
        error: 'service_disabled',
        message: 'Dify服务已禁用'
      };
    }
    
    if (!config.apiKey) {
      return {
        success: false,
        error: 'missing_api_key',
        message: '缺少API密钥'
      };
    }
    
    // 测试接口连接
    const response = await axios.get(
      `${config.apiEndpoint}/datasets`,
      {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`
        }
      }
    );
    
    return {
      success: true,
      datasets: response.data.data || [],
      message: '连接成功'
    };
  } catch (error) {
    log(`测试Dify连接失败: ${error.message}`);
    
    return {
      success: false,
      error: error.response ? `${error.response.status}: ${JSON.stringify(error.response.data)}` : error.message,
      message: '连接失败'
    };
  }
}

// 导出模块函数
module.exports = {
  startSchedule,
  runHourlyTask,
  manualMergeAndUpload,
  testDifyConnection
};

// 当直接运行脚本时启动定时任务
if (require.main === module) {
  // 检查命令行参数
  const args = process.argv.slice(2);
  
  if (args.includes('--test')) {
    // 测试模式
    testDifyConnection()
      .then(result => {
        console.log('Dify连接测试结果:', result);
        process.exit(0);
      })
      .catch(error => {
        console.error('测试失败:', error);
        process.exit(1);
      });
  } else if (args.includes('--manual')) {
    // 手动模式
    const dateIndex = args.indexOf('--date');
    const date = dateIndex >= 0 && args.length > dateIndex + 1 ? args[dateIndex + 1] : null;
    
    manualMergeAndUpload(date)
      .then(result => {
        console.log('手动上传结果:', result);
        process.exit(0);
      })
      .catch(error => {
        console.error('手动上传失败:', error);
        process.exit(1);
      });
  } else {
    // 正常模式 - 启动定时任务
    startSchedule();
  }
} 
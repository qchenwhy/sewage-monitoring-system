const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// 获取数据点管理器实例
const DataPointManager = require('../modbus/data-point-manager');
const dataPointManager = DataPointManager.getInstance();

// 配置multer用于文件上传
const upload = multer({
  dest: 'uploads/',
  fileFilter: (req, file, cb) => {
    // 只允许Excel文件
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'application/excel'
    ];
    
    if (allowedTypes.includes(file.mimetype) || 
        file.originalname.toLowerCase().endsWith('.xlsx') || 
        file.originalname.toLowerCase().endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('只支持Excel文件格式(.xlsx, .xls)'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB限制
  }
});

// 确保下载目录存在
const downloadsDir = path.join(__dirname, '../downloads');
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

// 数据点Excel模板字段定义
const EXCEL_HEADERS = {
  name: '数据点名称',
  identifier: '标识符',
  address: '地址',
  accessMode: '访问模式',
  readFunctionCode: '读取功能码',
  writeFunctionCode: '写入功能码',
  format: '数据格式',
  scale: '缩放比例',
  unit: '单位',
  description: '描述',
  bitPosition: '位位置',
  sourceDataPointIdentifier: '源数据点标识符',
  pointBitPosition: '点位位置',
  alarmEnabled: '启用告警',
  alarmContent: '告警内容',
  alarmType: '告警类型',
  lowLevelAlarm: '低位告警'
};

// 反向映射（中文列名到英文字段名）
const HEADERS_REVERSE = {};
Object.keys(EXCEL_HEADERS).forEach(key => {
  HEADERS_REVERSE[EXCEL_HEADERS[key]] = key;
});

/**
 * 导出数据点到Excel文件
 */
router.get('/export', (req, res) => {
  try {
    console.log('[数据点批量] 开始导出数据点到Excel...');
    
    // 获取所有数据点
    const dataPoints = dataPointManager.getAllDataPoints();
    console.log(`[数据点批量] 获取到 ${dataPoints.length} 个数据点`);
    
    if (dataPoints.length === 0) {
      return res.status(400).json({
        success: false,
        error: '没有数据点可导出'
      });
    }
    
    // 准备Excel数据
    const excelData = dataPoints.map(dp => {
      const row = {};
      
      // 基本字段
      row[EXCEL_HEADERS.name] = dp.name || '';
      row[EXCEL_HEADERS.identifier] = dp.identifier || '';
      row[EXCEL_HEADERS.address] = dp.address || '';
      row[EXCEL_HEADERS.accessMode] = dp.accessMode || 'read';
      row[EXCEL_HEADERS.readFunctionCode] = dp.readFunctionCode || '';
      row[EXCEL_HEADERS.writeFunctionCode] = dp.writeFunctionCode || '';
      row[EXCEL_HEADERS.format] = dp.format || 'UINT16';
      row[EXCEL_HEADERS.scale] = dp.scale || 1;
      row[EXCEL_HEADERS.unit] = dp.unit || '';
      row[EXCEL_HEADERS.description] = dp.description || '';
      
      // 可选字段
      row[EXCEL_HEADERS.bitPosition] = dp.bitPosition !== undefined ? dp.bitPosition : '';
      row[EXCEL_HEADERS.sourceDataPointIdentifier] = dp.sourceDataPointIdentifier || '';
      row[EXCEL_HEADERS.pointBitPosition] = dp.pointBitPosition !== undefined ? dp.pointBitPosition : '';
      
      // 告警相关字段
      row[EXCEL_HEADERS.alarmEnabled] = dp.alarmEnabled ? '是' : '否';
      row[EXCEL_HEADERS.alarmContent] = dp.alarmContent || '';
      row[EXCEL_HEADERS.alarmType] = dp.alarmType || '';
      row[EXCEL_HEADERS.lowLevelAlarm] = dp.lowLevelAlarm ? '是' : '否';
      
      return row;
    });
    
    // 创建工作簿
    const wb = XLSX.utils.book_new();
    
    // 创建数据工作表
    const ws = XLSX.utils.json_to_sheet(excelData);
    
    // 设置列宽
    const colWidths = [
      { wch: 20 }, // 数据点名称
      { wch: 15 }, // 标识符
      { wch: 10 }, // 地址
      { wch: 12 }, // 访问模式
      { wch: 12 }, // 读取功能码
      { wch: 12 }, // 写入功能码
      { wch: 12 }, // 数据格式
      { wch: 10 }, // 缩放比例
      { wch: 10 }, // 单位
      { wch: 30 }, // 描述
      { wch: 10 }, // 位位置
      { wch: 18 }, // 源数据点标识符
      { wch: 10 }, // 点位位置
      { wch: 10 }, // 启用告警
      { wch: 30 }, // 告警内容
      { wch: 12 }, // 告警类型
      { wch: 10 }  // 低位告警
    ];
    ws['!cols'] = colWidths;
    
    // 添加数据工作表
    XLSX.utils.book_append_sheet(wb, ws, '数据点配置');
    
    // 创建说明工作表
    const instructionData = [
      ['字段名', '说明', '示例值', '必填'],
      ['数据点名称', '人类可读的数据点名称', '污泥回流泵1号', '是'],
      ['标识符', '唯一标识符，用于程序访问', 'WNHL1', '是'],
      ['地址', 'Modbus寄存器地址', '33', '否'],
      ['访问模式', '数据点访问方式', 'read/write/readwrite', '否'],
      ['读取功能码', 'Modbus读取功能码', '3', '否'],
      ['写入功能码', 'Modbus写入功能码', '6', '否'],
      ['数据格式', '数据类型', 'UINT16/INT16/FLOAT32/BIT/POINT', '否'],
      ['缩放比例', '数值缩放倍数', '1', '否'],
      ['单位', '数据单位', 'L/min', '否'],
      ['描述', '数据点详细描述', '污泥回流泵运行状态', '否'],
      ['位位置', 'BIT格式时的位位置(0-15)', '0', '否'],
      ['源数据点标识符', 'POINT格式时的源数据点', 'ZHSC1', '否'],
      ['点位位置', 'POINT格式时的位位置(0-15)', '9', '否'],
      ['启用告警', '是否启用告警功能', '是/否', '否'],
      ['告警内容', '告警消息内容', '设备故障', '否'],
      ['告警类型', 'BIT/POINT类型的告警类型', 'high/low', '否'],
      ['低位告警', '是否为低位告警', '是/否', '否']
    ];
    
    const instructionWs = XLSX.utils.aoa_to_sheet(instructionData);
    instructionWs['!cols'] = [
      { wch: 20 },
      { wch: 40 },
      { wch: 25 },
      { wch: 8 }
    ];
    
    XLSX.utils.book_append_sheet(wb, instructionWs, '字段说明');
    
    // 生成文件名
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = `数据点配置_${timestamp}.xlsx`;
    const filepath = path.join(downloadsDir, filename);
    
    // 写入文件
    XLSX.writeFile(wb, filepath);
    
    console.log(`[数据点批量] Excel文件已生成: ${filepath}`);
    
    // 设置响应头并发送文件
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.sendFile(filepath, (err) => {
      if (err) {
        console.error('[数据点批量] 发送文件失败:', err);
      } else {
        console.log(`[数据点批量] 文件已发送: ${filename}`);
        // 发送完成后删除临时文件
        setTimeout(() => {
          fs.unlink(filepath, (unlinkErr) => {
            if (unlinkErr) {
              console.warn(`[数据点批量] 删除临时文件失败: ${unlinkErr.message}`);
            } else {
              console.log(`[数据点批量] 临时文件已删除: ${filename}`);
            }
          });
        }, 5000); // 5秒后删除
      }
    });
    
  } catch (error) {
    console.error('[数据点批量] 导出失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 批量导入数据点从Excel文件
 */
router.post('/import', upload.single('excelFile'), async (req, res) => {
  let uploadedFilePath = null;
  
  try {
    console.log('[数据点批量] 开始批量导入数据点...');
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: '请选择要上传的Excel文件'
      });
    }
    
    uploadedFilePath = req.file.path;
    console.log(`[数据点批量] 上传文件: ${req.file.originalname}, 临时路径: ${uploadedFilePath}`);
    
    // 读取Excel文件
    const workbook = XLSX.readFile(uploadedFilePath);
    const sheetName = workbook.SheetNames[0]; // 使用第一个工作表
    const worksheet = workbook.Sheets[sheetName];
    
    // 转换为JSON数据
    const rawData = XLSX.utils.sheet_to_json(worksheet);
    console.log(`[数据点批量] 从Excel读取到 ${rawData.length} 行数据`);
    
    if (rawData.length === 0) {
      throw new Error('Excel文件中没有数据');
    }
    
    // 验证和转换数据
    const importResults = {
      total: rawData.length,
      success: 0,
      failed: 0,
      errors: [],
      successItems: [],
      failedItems: []
    };
    
    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      const rowNum = i + 2; // Excel行号（从第2行开始，第1行是标题）
      
      try {
        // 转换Excel行数据为数据点对象
        const dataPoint = convertExcelRowToDataPoint(row, rowNum);
        
        // 验证必填字段
        if (!dataPoint.name || !dataPoint.identifier) {
          throw new Error('数据点名称和标识符是必填项');
        }
        
        // 添加数据点
        const newDataPoint = dataPointManager.addDataPoint(dataPoint);
        
        importResults.success++;
        importResults.successItems.push({
          row: rowNum,
          name: dataPoint.name,
          identifier: dataPoint.identifier
        });
        
        console.log(`[数据点批量] 第${rowNum}行导入成功: ${dataPoint.name} (${dataPoint.identifier})`);
        
      } catch (error) {
        importResults.failed++;
        const errorInfo = {
          row: rowNum,
          name: row[EXCEL_HEADERS.name] || '未知',
          identifier: row[EXCEL_HEADERS.identifier] || '未知',
          error: error.message
        };
        importResults.errors.push(errorInfo);
        importResults.failedItems.push(errorInfo);
        
        console.error(`[数据点批量] 第${rowNum}行导入失败: ${error.message}`);
      }
    }
    
    console.log(`[数据点批量] 导入完成: 成功${importResults.success}个, 失败${importResults.failed}个`);
    
    res.json({
      success: true,
      data: importResults
    });
    
  } catch (error) {
    console.error('[数据点批量] 导入失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    // 清理上传的临时文件
    if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
      fs.unlink(uploadedFilePath, (err) => {
        if (err) {
          console.warn(`[数据点批量] 删除临时文件失败: ${err.message}`);
        } else {
          console.log(`[数据点批量] 临时文件已删除: ${uploadedFilePath}`);
        }
      });
    }
  }
});

/**
 * 下载Excel模板
 */
router.get('/template', (req, res) => {
  try {
    console.log('[数据点批量] 生成Excel模板...');
    
    // 创建示例数据
    const templateData = [
      {
        [EXCEL_HEADERS.name]: '示例数据点1',
        [EXCEL_HEADERS.identifier]: 'SAMPLE1',
        [EXCEL_HEADERS.address]: '100',
        [EXCEL_HEADERS.accessMode]: 'read',
        [EXCEL_HEADERS.readFunctionCode]: '3',
        [EXCEL_HEADERS.writeFunctionCode]: '',
        [EXCEL_HEADERS.format]: 'UINT16',
        [EXCEL_HEADERS.scale]: '1',
        [EXCEL_HEADERS.unit]: 'L/min',
        [EXCEL_HEADERS.description]: '这是一个示例数据点',
        [EXCEL_HEADERS.bitPosition]: '',
        [EXCEL_HEADERS.sourceDataPointIdentifier]: '',
        [EXCEL_HEADERS.pointBitPosition]: '',
        [EXCEL_HEADERS.alarmEnabled]: '否',
        [EXCEL_HEADERS.alarmContent]: '',
        [EXCEL_HEADERS.alarmType]: '',
        [EXCEL_HEADERS.lowLevelAlarm]: '否'
      },
      {
        [EXCEL_HEADERS.name]: '示例BIT数据点',
        [EXCEL_HEADERS.identifier]: 'SAMPLE_BIT',
        [EXCEL_HEADERS.address]: '101',
        [EXCEL_HEADERS.accessMode]: 'read',
        [EXCEL_HEADERS.readFunctionCode]: '3',
        [EXCEL_HEADERS.writeFunctionCode]: '',
        [EXCEL_HEADERS.format]: 'BIT',
        [EXCEL_HEADERS.scale]: '1',
        [EXCEL_HEADERS.unit]: '',
        [EXCEL_HEADERS.description]: 'BIT格式示例',
        [EXCEL_HEADERS.bitPosition]: '0',
        [EXCEL_HEADERS.sourceDataPointIdentifier]: '',
        [EXCEL_HEADERS.pointBitPosition]: '',
        [EXCEL_HEADERS.alarmEnabled]: '是',
        [EXCEL_HEADERS.alarmContent]: '设备故障',
        [EXCEL_HEADERS.alarmType]: 'high',
        [EXCEL_HEADERS.lowLevelAlarm]: '否'
      },
      {
        [EXCEL_HEADERS.name]: '示例POINT数据点',
        [EXCEL_HEADERS.identifier]: 'SAMPLE_POINT',
        [EXCEL_HEADERS.address]: '',
        [EXCEL_HEADERS.accessMode]: 'read',
        [EXCEL_HEADERS.readFunctionCode]: '3',
        [EXCEL_HEADERS.writeFunctionCode]: '',
        [EXCEL_HEADERS.format]: 'POINT',
        [EXCEL_HEADERS.scale]: '1',
        [EXCEL_HEADERS.unit]: '',
        [EXCEL_HEADERS.description]: 'POINT格式示例',
        [EXCEL_HEADERS.bitPosition]: '',
        [EXCEL_HEADERS.sourceDataPointIdentifier]: 'SAMPLE1',
        [EXCEL_HEADERS.pointBitPosition]: '5',
        [EXCEL_HEADERS.alarmEnabled]: '否',
        [EXCEL_HEADERS.alarmContent]: '',
        [EXCEL_HEADERS.alarmType]: '',
        [EXCEL_HEADERS.lowLevelAlarm]: '否'
      }
    ];
    
    // 创建工作簿
    const wb = XLSX.utils.book_new();
    
    // 创建模板工作表
    const ws = XLSX.utils.json_to_sheet(templateData);
    
    // 设置列宽
    const colWidths = [
      { wch: 20 }, { wch: 15 }, { wch: 10 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
      { wch: 10 }, { wch: 30 }, { wch: 10 }, { wch: 18 },
      { wch: 10 }, { wch: 10 }, { wch: 30 }, { wch: 12 },
      { wch: 10 }
    ];
    ws['!cols'] = colWidths;
    
    XLSX.utils.book_append_sheet(wb, ws, '数据点模板');
    
    // 添加说明工作表（与导出功能相同）
    const instructionData = [
      ['字段名', '说明', '示例值', '必填'],
      ['数据点名称', '人类可读的数据点名称', '污泥回流泵1号', '是'],
      ['标识符', '唯一标识符，用于程序访问', 'WNHL1', '是'],
      ['地址', 'Modbus寄存器地址', '33', '否'],
      ['访问模式', '数据点访问方式', 'read/write/readwrite', '否'],
      ['读取功能码', 'Modbus读取功能码', '3', '否'],
      ['写入功能码', 'Modbus写入功能码', '6', '否'],
      ['数据格式', '数据类型', 'UINT16/INT16/FLOAT32/BIT/POINT', '否'],
      ['缩放比例', '数值缩放倍数', '1', '否'],
      ['单位', '数据单位', 'L/min', '否'],
      ['描述', '数据点详细描述', '污泥回流泵运行状态', '否'],
      ['位位置', 'BIT格式时的位位置(0-15)', '0', '否'],
      ['源数据点标识符', 'POINT格式时的源数据点', 'ZHSC1', '否'],
      ['点位位置', 'POINT格式时的位位置(0-15)', '9', '否'],
      ['启用告警', '是否启用告警功能', '是/否', '否'],
      ['告警内容', '告警消息内容', '设备故障', '否'],
      ['告警类型', 'BIT/POINT类型的告警类型', 'high/low', '否'],
      ['低位告警', '是否为低位告警', '是/否', '否']
    ];
    
    const instructionWs = XLSX.utils.aoa_to_sheet(instructionData);
    instructionWs['!cols'] = [
      { wch: 20 }, { wch: 40 }, { wch: 25 }, { wch: 8 }
    ];
    
    XLSX.utils.book_append_sheet(wb, instructionWs, '字段说明');
    
    // 生成文件
    const filename = '数据点导入模板.xlsx';
    const filepath = path.join(downloadsDir, filename);
    
    XLSX.writeFile(wb, filepath);
    
    console.log(`[数据点批量] 模板文件已生成: ${filepath}`);
    
    // 发送文件
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.sendFile(filepath, (err) => {
      if (err) {
        console.error('[数据点批量] 发送模板文件失败:', err);
      } else {
        console.log(`[数据点批量] 模板文件已发送: ${filename}`);
        // 发送完成后删除临时文件
        setTimeout(() => {
          fs.unlink(filepath, (unlinkErr) => {
            if (unlinkErr) {
              console.warn(`[数据点批量] 删除模板文件失败: ${unlinkErr.message}`);
            }
          });
        }, 5000);
      }
    });
    
  } catch (error) {
    console.error('[数据点批量] 生成模板失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 转换Excel行数据为数据点对象
 */
function convertExcelRowToDataPoint(row, rowNum) {
  const dataPoint = {};
  
  // 基本字段
  dataPoint.name = row[EXCEL_HEADERS.name] ? String(row[EXCEL_HEADERS.name]).trim() : '';
  dataPoint.identifier = row[EXCEL_HEADERS.identifier] ? String(row[EXCEL_HEADERS.identifier]).trim() : '';
  dataPoint.address = row[EXCEL_HEADERS.address] ? parseInt(row[EXCEL_HEADERS.address]) : undefined;
  dataPoint.accessMode = row[EXCEL_HEADERS.accessMode] ? String(row[EXCEL_HEADERS.accessMode]).trim() : 'read';
  dataPoint.readFunctionCode = row[EXCEL_HEADERS.readFunctionCode] ? parseInt(row[EXCEL_HEADERS.readFunctionCode]) : undefined;
  dataPoint.writeFunctionCode = row[EXCEL_HEADERS.writeFunctionCode] ? parseInt(row[EXCEL_HEADERS.writeFunctionCode]) : undefined;
  dataPoint.format = row[EXCEL_HEADERS.format] ? String(row[EXCEL_HEADERS.format]).trim() : 'UINT16';
  dataPoint.scale = row[EXCEL_HEADERS.scale] ? parseFloat(row[EXCEL_HEADERS.scale]) : 1;
  dataPoint.unit = row[EXCEL_HEADERS.unit] ? String(row[EXCEL_HEADERS.unit]).trim() : '';
  dataPoint.description = row[EXCEL_HEADERS.description] ? String(row[EXCEL_HEADERS.description]).trim() : '';
  
  // 可选字段
  if (row[EXCEL_HEADERS.bitPosition] !== undefined && row[EXCEL_HEADERS.bitPosition] !== '') {
    dataPoint.bitPosition = parseInt(row[EXCEL_HEADERS.bitPosition]);
  }
  
  if (row[EXCEL_HEADERS.sourceDataPointIdentifier]) {
    dataPoint.sourceDataPointIdentifier = String(row[EXCEL_HEADERS.sourceDataPointIdentifier]).trim();
  }
  
  if (row[EXCEL_HEADERS.pointBitPosition] !== undefined && row[EXCEL_HEADERS.pointBitPosition] !== '') {
    dataPoint.pointBitPosition = parseInt(row[EXCEL_HEADERS.pointBitPosition]);
  }
  
  // 告警相关字段
  const alarmEnabledValue = row[EXCEL_HEADERS.alarmEnabled] ? String(row[EXCEL_HEADERS.alarmEnabled]).trim() : '';
  dataPoint.alarmEnabled = ['是', 'true', '1', 'yes'].includes(alarmEnabledValue.toLowerCase());
  
  if (dataPoint.alarmEnabled) {
    dataPoint.alarmContent = row[EXCEL_HEADERS.alarmContent] ? String(row[EXCEL_HEADERS.alarmContent]).trim() : '';
    dataPoint.alarmType = row[EXCEL_HEADERS.alarmType] ? String(row[EXCEL_HEADERS.alarmType]).trim() : '';
    
    const lowLevelAlarmValue = row[EXCEL_HEADERS.lowLevelAlarm] ? String(row[EXCEL_HEADERS.lowLevelAlarm]).trim() : '';
    dataPoint.lowLevelAlarm = ['是', 'true', '1', 'yes'].includes(lowLevelAlarmValue.toLowerCase());
  }
  
  return dataPoint;
}

module.exports = router; 
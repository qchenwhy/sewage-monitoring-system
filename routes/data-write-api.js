/**
 * 数据写入API路由
 * 处理特定格式的JSON请求，实现对数据点的匹配和写入功能
 */

const express = require('express');
const router = express.Router();
const mqttService = require('../modules/mqtt-service').getInstance();
const dataPointManager = require('../modbus/data-point-manager').getInstance();
const dbManager = require('../modbus/db-manager');

// 水质指标映射表
const WATER_QUALITY_MAPPING = {
  '氨氮': 'NH3N',
  '化学需氧量': 'COD', 
  '总磷': 'TP',
  '总氮': 'TN',
  'pH值': 'PH',
  '溶解氧': 'DO',
  '浊度': 'TURBIDITY',
  '水温': 'TEMP',
  '悬浮物': 'SS',
  '生化需氧量': 'BOD',
  '石油类': 'OIL',
  '挥发酚': 'PHENOL',
  '氰化物': 'CN',
  '硫化物': 'S2',
  '氟化物': 'F',
  '六价铬': 'CR6',
  '总铬': 'CR',
  '铜': 'CU',
  '锌': 'ZN',
  '铅': 'PB',
  '镉': 'CD',
  '汞': 'HG',
  '砷': 'AS'
};

/**
 * 主数据写入API端点
 * POST /api/data-write
 * 支持两种接收格式:
 * 格式1: {"data": "{\"action_type\": \"update\", \"target_object\": \"runtime_parameter\", \"details\": {\"氨氮\": \"23\"}}"}
 * 格式2: {"action_type": "update", "target_object": "runtime_parameter", "details": {"氨氮": "23"}}
 * 格式3: {"parameterModification": {"data": "..."}} (嵌套格式)
 */
router.post('/', async (req, res) => {
  try {
    console.log('收到数据写入请求:', JSON.stringify(req.body, null, 2));
    
    // 解析请求数据 - 支持多种格式
    let parsedData;
    const requestData = req.body;
    
    // 🔧 新增：支持嵌套格式 (parameterModification 包装)
    let actualRequestData = requestData;
    if (requestData.parameterModification) {
      console.log('检测到parameterModification包装格式');
      actualRequestData = requestData.parameterModification;
    }
    
    // 🔧 新增：支持直接JSON格式（不带data字段）
    if (actualRequestData.action_type && actualRequestData.target_object && actualRequestData.details) {
      console.log('检测到直接JSON格式（不带data字段）');
      parsedData = actualRequestData;
    }
    // 原有格式：带data字段的格式
    else if (actualRequestData.data) {
      console.log('检测到带data字段的格式');
      try {
        if (typeof actualRequestData.data === 'string') {
          parsedData = JSON.parse(actualRequestData.data);
        } else {
          parsedData = actualRequestData.data;
        }
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          message: '数据解析失败：data字段不是有效的JSON',
          error: parseError.message
        });
      }
    }
    // 格式错误
    else {
      return res.status(400).json({
        success: false,
        message: '请求格式错误：请使用以下任一格式',
        supportedFormats: [
          {
            name: '带data字段格式',
            example: { data: '{"action_type": "update", "target_object": "runtime_parameter", "details": {"氨氮": "23"}}' }
          },
          {
            name: '直接JSON格式',
            example: { action_type: "update", target_object: "runtime_parameter", details: {"氨氮": "23"} }
          },
          {
            name: '嵌套格式',
            example: { parameterModification: { data: '{"action_type": "update", "target_object": "runtime_parameter", "details": {"氨氮": "23"}}' } }
          }
        ]
      });
    }
    
    // 验证解析后的数据结构
    if (!parsedData.action_type || !parsedData.target_object || !parsedData.details) {
      return res.status(400).json({
        success: false,
        message: '数据格式错误：缺少必要字段',
        required: ['action_type', 'target_object', 'details'],
        received: parsedData
      });
    }
    
    console.log('✅ 成功解析数据:', JSON.stringify(parsedData, null, 2));
    
    // 根据action_type处理不同的操作
    let result;
    switch (parsedData.action_type) {
      case 'update':
        result = await handleUpdateAction(parsedData);
        break;
      case 'write':
        result = await handleWriteAction(parsedData);
        break;
      case 'read':
        result = await handleReadAction(parsedData);
        break;
      default:
        return res.status(400).json({
          success: false,
          message: `不支持的操作类型: ${parsedData.action_type}`,
          supportedActions: ['update', 'write', 'read']
        });
    }
    
    return res.json(result);
  } catch (error) {
    console.error('处理数据写入请求时出错:', error);
    return res.status(500).json({
      success: false,
      message: '服务器处理请求时出错',
      error: error.message
    });
  }
});

/**
 * 处理更新操作
 * @param {Object} data - 解析后的请求数据
 */
async function handleUpdateAction(data) {
  const { target_object, details } = data;
  
  switch (target_object) {
    case 'runtime_parameter':
      return await updateRuntimeParameters(details);
    case 'data_point':
      return await updateDataPoints(details);
    case 'water_quality':
      return await updateWaterQualityData(details);
    default:
      return {
        success: false,
        message: `不支持的目标对象: ${target_object}`,
        supportedTargets: ['runtime_parameter', 'data_point', 'water_quality']
      };
  }
}

/**
 * 处理写入操作
 * @param {Object} data - 解析后的请求数据
 */
async function handleWriteAction(data) {
  const { target_object, details } = data;
  
  switch (target_object) {
    case 'modbus_register':
      return await writeModbusRegisters(details);
    case 'data_point':
      return await writeDataPoints(details);
    default:
      return {
        success: false,
        message: `写入操作不支持的目标对象: ${target_object}`,
        supportedTargets: ['modbus_register', 'data_point']
      };
  }
}

/**
 * 处理读取操作
 * @param {Object} data - 解析后的请求数据
 */
async function handleReadAction(data) {
  const { target_object, details } = data;
  
  switch (target_object) {
    case 'data_point':
      return await readDataPoints(details);
    case 'water_quality':
      return await readWaterQualityData(details);
    default:
      return {
        success: false,
        message: `读取操作不支持的目标对象: ${target_object}`,
        supportedTargets: ['data_point', 'water_quality']
      };
  }
}

/**
 * 更新运行时参数
 * @param {Object} details - 参数详情
 */
async function updateRuntimeParameters(details) {
  const results = [];
  const errors = [];
  
  console.log('开始更新运行时参数:', details);
  
  // 遍历所有参数
  for (const [paramName, paramValue] of Object.entries(details)) {
    try {
      console.log(`处理参数: ${paramName} = ${paramValue}`);
      
      // 🔧 优化：使用新的精准匹配机制
      const matchResult = await findMatchingDataPoints(paramName);
      
      // 🚨 处理匹配错误
      if (matchResult.error) {
        errors.push({
          parameter: paramName,
          value: paramValue,
          error: matchResult.message,
          code: matchResult.code || 'MATCH_ERROR',
          details: matchResult.details,
          suggestions: matchResult.suggestions,
          success: false
        });
        console.error(`❌ 参数 "${paramName}" 匹配失败:`, matchResult.message);
        continue;
      }
      
      // ✅ 匹配成功，进行写入操作
      const matchedDataPoints = matchResult;
      console.log(`✅ 参数 "${paramName}" 成功匹配到 ${matchedDataPoints.length} 个数据点`);
      
      // 对每个匹配的数据点进行写入
      for (const dataPoint of matchedDataPoints) {
        try {
          const writeResult = await writeToDataPoint(dataPoint, paramValue);
          results.push({
            parameter: paramName,
            value: paramValue,
            dataPoint: {
              id: dataPoint.id,
              name: dataPoint.name,
              identifier: dataPoint.identifier,
              format: dataPoint.format,
              unit: dataPoint.unit
            },
            result: writeResult,
            matchType: dataPoint._matchType || '未知匹配类型',
            success: true
          });
          console.log(`✅ 成功写入数据点: ${dataPoint.name} (${dataPoint.identifier})`);
        } catch (writeError) {
          errors.push({
            parameter: paramName,
            value: paramValue,
            dataPoint: {
              id: dataPoint.id,
              name: dataPoint.name,
              identifier: dataPoint.identifier
            },
            error: writeError.message,
            code: 'WRITE_ERROR',
            success: false
          });
          console.error(`❌ 写入数据点失败: ${dataPoint.name}`, writeError.message);
        }
      }
    } catch (error) {
      errors.push({
        parameter: paramName,
        value: paramValue,
        error: error.message,
        code: 'PROCESSING_ERROR',
        success: false
      });
      console.error(`❌ 处理参数失败: ${paramName}`, error.message);
    }
  }
  
  // 🔧 优化：增强返回结果信息
  const totalParameters = Object.keys(details).length;
  const successfulParameters = new Set(results.map(r => r.parameter)).size;
  const failedParameters = new Set(errors.map(e => e.parameter)).size;
  
  return {
    success: errors.length === 0,
    message: errors.length === 0 ? 
      `所有 ${totalParameters} 个参数更新成功` : 
      `${totalParameters} 个参数中，${successfulParameters} 个成功，${failedParameters} 个失败`,
    results: results,
    errors: errors,
    summary: {
      total: totalParameters,
      successful: successfulParameters,
      failed: failedParameters,
      详细统计: {
        成功写入的数据点数量: results.length,
        失败的参数数量: failedParameters,
        匹配错误: errors.filter(e => ['MULTIPLE_MATCHES', 'NO_MATCHES'].includes(e.code)).length,
        写入错误: errors.filter(e => e.code === 'WRITE_ERROR').length,
        处理错误: errors.filter(e => e.code === 'PROCESSING_ERROR').length
      }
    }
  };
}

/**
 * 更新水质数据
 * @param {Object} details - 水质数据详情
 */
async function updateWaterQualityData(details) {
  const results = [];
  const errors = [];
  
  console.log('开始更新水质数据:', details);
  
  // 遍历所有水质参数
  for (const [paramName, paramValue] of Object.entries(details)) {
    try {
      console.log(`处理水质参数: ${paramName} = ${paramValue}`);
      
      // 获取标准化的参数名
      const standardName = WATER_QUALITY_MAPPING[paramName] || paramName;
      
      // 🔧 优化：使用新的精准匹配机制（优先匹配标准名称）
      let matchResult = await findMatchingDataPoints(standardName);
      
      // 如果标准名称没有匹配，尝试原始名称
      if (matchResult.error && matchResult.code === 'NO_MATCHES') {
        console.log(`标准名称 "${standardName}" 未匹配，尝试原始名称 "${paramName}"`);
        matchResult = await findMatchingDataPoints(paramName);
      }
      
      // 🚨 处理匹配错误
      if (matchResult.error) {
        errors.push({
          parameter: paramName,
          standardName: standardName,
          value: paramValue,
          error: matchResult.message,
          code: matchResult.code || 'MATCH_ERROR',
          details: matchResult.details,
          suggestions: matchResult.suggestions,
          success: false
        });
        console.error(`❌ 水质参数 "${paramName}" 匹配失败:`, matchResult.message);
        continue;
      }
      
      // ✅ 匹配成功，进行写入操作
      const matchedDataPoints = matchResult;
      console.log(`✅ 水质参数 "${paramName}" 成功匹配到 ${matchedDataPoints.length} 个数据点`);
      
      // 对每个匹配的数据点进行写入
      for (const dataPoint of matchedDataPoints) {
        try {
          const writeResult = await writeToDataPoint(dataPoint, paramValue);
          
          // 同时更新到数据库
          await updateWaterQualityDatabase(dataPoint, paramValue, paramName);
          
          results.push({
            parameter: paramName,
            standardName: standardName,
            value: paramValue,
            dataPoint: {
              id: dataPoint.id,
              name: dataPoint.name,
              identifier: dataPoint.identifier,
              format: dataPoint.format,
              unit: dataPoint.unit
            },
            result: writeResult,
            matchType: standardName !== paramName ? '标准名称匹配' : dataPoint._matchType || '直接匹配',
            success: true
          });
          console.log(`✅ 成功写入水质数据点: ${dataPoint.name} (${dataPoint.identifier})`);
        } catch (writeError) {
          errors.push({
            parameter: paramName,
            standardName: standardName,
            value: paramValue,
            dataPoint: {
              id: dataPoint.id,
              name: dataPoint.name,
              identifier: dataPoint.identifier
            },
            error: writeError.message,
            code: 'WRITE_ERROR',
            success: false
          });
          console.error(`❌ 写入水质数据点失败: ${dataPoint.name}`, writeError.message);
        }
      }
    } catch (error) {
      errors.push({
        parameter: paramName,
        value: paramValue,
        error: error.message,
        code: 'PROCESSING_ERROR',
        success: false
      });
      console.error(`❌ 处理水质参数失败: ${paramName}`, error.message);
    }
  }
  
  // 🔧 优化：增强返回结果信息
  const totalParameters = Object.keys(details).length;
  const successfulParameters = new Set(results.map(r => r.parameter)).size;
  const failedParameters = new Set(errors.map(e => e.parameter)).size;
  
  return {
    success: errors.length === 0,
    message: errors.length === 0 ? 
      `所有 ${totalParameters} 个水质参数更新成功` : 
      `${totalParameters} 个水质参数中，${successfulParameters} 个成功，${failedParameters} 个失败`,
    results: results,
    errors: errors,
    summary: {
      total: totalParameters,
      successful: successfulParameters,
      failed: failedParameters,
      详细统计: {
        成功写入的数据点数量: results.length,
        失败的参数数量: failedParameters,
        匹配错误: errors.filter(e => ['MULTIPLE_MATCHES', 'NO_MATCHES'].includes(e.code)).length,
        写入错误: errors.filter(e => e.code === 'WRITE_ERROR').length,
        处理错误: errors.filter(e => e.code === 'PROCESSING_ERROR').length,
        标准名称匹配: results.filter(r => r.matchType === '标准名称匹配').length,
        直接匹配: results.filter(r => r.matchType === '直接匹配').length
      }
    }
  };
}

/**
 * 🔧 优化：查找匹配的数据点 - 更精准的匹配机制
 * @param {string} paramName - 参数名称
 * @returns {Array|Object} 匹配的数据点列表或错误对象
 */
async function findMatchingDataPoints(paramName) {
  const allDataPoints = dataPointManager.getAllDataPoints();
  
  console.log(`🔍 开始查找匹配的数据点: "${paramName}"`);
  console.log(`📊 可用数据点总数: ${allDataPoints.length}`);
  
  // 匹配结果容器，按优先级分类
  const matchResults = {
    exactIdentifier: [],     // 完全匹配标识符
    exactName: [],          // 完全匹配名称
    exactNameIgnoreCase: [], // 忽略大小写完全匹配名称
    partialIdentifier: [],   // 部分匹配标识符
    partialName: [],        // 部分匹配名称
    fuzzyName: [],          // 模糊匹配名称
    suggestions: []         // 建议项（相似度匹配）
  };
  
  // 预处理参数名称
  const searchTerm = paramName.trim();
  const searchTermLower = searchTerm.toLowerCase();
  const searchTermUpper = searchTerm.toUpperCase();
  
  // 🔍 第一优先级：完全匹配标识符（区分大小写）
  matchResults.exactIdentifier = allDataPoints.filter(dp => 
    dp.identifier === searchTerm
  );
  
  // 🔍 第二优先级：完全匹配名称（区分大小写）
  matchResults.exactName = allDataPoints.filter(dp => 
    dp.name === searchTerm
  );
  
  // 🔍 第三优先级：完全匹配标识符（忽略大小写）
  if (matchResults.exactIdentifier.length === 0) {
    const exactIdentifierIgnoreCase = allDataPoints.filter(dp => 
      dp.identifier.toLowerCase() === searchTermLower ||
      dp.identifier.toUpperCase() === searchTermUpper
    );
    // 只有在没有完全匹配时才使用忽略大小写匹配
    matchResults.exactIdentifier.push(...exactIdentifierIgnoreCase);
  }
  
  // 🔍 第四优先级：完全匹配名称（忽略大小写）
  if (matchResults.exactName.length === 0) {
    matchResults.exactNameIgnoreCase = allDataPoints.filter(dp => 
      dp.name.toLowerCase() === searchTermLower
    );
  }
  
  // 🔍 第五优先级：部分匹配标识符（包含关系）
  if (matchResults.exactIdentifier.length === 0 && matchResults.exactName.length === 0) {
    matchResults.partialIdentifier = allDataPoints.filter(dp => {
      const identifier = dp.identifier.toLowerCase();
      return identifier.includes(searchTermLower) && identifier !== searchTermLower;
    });
  }
  
  // 🔍 第六优先级：部分匹配名称（包含关系）
  if (matchResults.exactIdentifier.length === 0 && matchResults.exactName.length === 0 && 
      matchResults.exactNameIgnoreCase.length === 0) {
    matchResults.partialName = allDataPoints.filter(dp => {
      const name = dp.name.toLowerCase();
      return (name.includes(searchTermLower) || searchTermLower.includes(name)) && 
             name !== searchTermLower;
    });
  }
  
  // 🔍 第七优先级：模糊匹配（基于相似度）
  if (Object.values(matchResults).flat().length === 0) {
    const fuzzyMatches = allDataPoints.filter(dp => {
      const nameSimilarity = calculateSimilarity(searchTermLower, dp.name.toLowerCase());
      const identifierSimilarity = calculateSimilarity(searchTermLower, dp.identifier.toLowerCase());
      const maxSimilarity = Math.max(nameSimilarity, identifierSimilarity);
      return maxSimilarity >= 0.7; // 只接受70%以上相似度
    });
    
    // 按相似度排序
    matchResults.fuzzyName = fuzzyMatches.sort((a, b) => {
      const similarityA = Math.max(
        calculateSimilarity(searchTermLower, a.name.toLowerCase()),
        calculateSimilarity(searchTermLower, a.identifier.toLowerCase())
      );
      const similarityB = Math.max(
        calculateSimilarity(searchTermLower, b.name.toLowerCase()),
        calculateSimilarity(searchTermLower, b.identifier.toLowerCase())
      );
      return similarityB - similarityA;
    });
  }
  
  // 🔍 生成建议项（用于错误信息）
  matchResults.suggestions = await getSuggestions(searchTerm);
  
  // 📊 打印匹配统计
  console.log(`🔍 匹配结果统计:`);
  console.log(`  ✅ 完全匹配标识符: ${matchResults.exactIdentifier.length} 个`);
  console.log(`  ✅ 完全匹配名称: ${matchResults.exactName.length} 个`);
  console.log(`  ✅ 忽略大小写匹配名称: ${matchResults.exactNameIgnoreCase.length} 个`);
  console.log(`  🟡 部分匹配标识符: ${matchResults.partialIdentifier.length} 个`);
  console.log(`  🟡 部分匹配名称: ${matchResults.partialName.length} 个`);
  console.log(`  🟠 模糊匹配: ${matchResults.fuzzyName.length} 个`);
  console.log(`  💡 建议项: ${matchResults.suggestions.length} 个`);
  
  // 🚨 确定最终匹配结果（按优先级）
  let finalMatches = [];
  let matchType = '';
  
  if (matchResults.exactIdentifier.length > 0) {
    finalMatches = matchResults.exactIdentifier;
    matchType = '完全匹配标识符';
  } else if (matchResults.exactName.length > 0) {
    finalMatches = matchResults.exactName;
    matchType = '完全匹配名称';
  } else if (matchResults.exactNameIgnoreCase.length > 0) {
    finalMatches = matchResults.exactNameIgnoreCase;
    matchType = '忽略大小写匹配名称';
  } else if (matchResults.partialIdentifier.length > 0) {
    finalMatches = matchResults.partialIdentifier;
    matchType = '部分匹配标识符';
  } else if (matchResults.partialName.length > 0) {
    finalMatches = matchResults.partialName;
    matchType = '部分匹配名称';
  } else if (matchResults.fuzzyName.length > 0) {
    finalMatches = matchResults.fuzzyName;
    matchType = '模糊匹配';
  }
  
  // 去重处理
  const uniqueMatches = finalMatches.filter((dp, index, self) => 
    index === self.findIndex(d => d.id === dp.id)
  );
  
  console.log(`🎯 最终匹配结果: ${uniqueMatches.length} 个 (${matchType})`);
  
  // 🚨 关键改进：严格的多匹配项错误处理
  // 🔧 新增：降低多匹配容忍度，任何超过5个匹配项的情况都视为过于模糊
  const maxAllowedMatches = matchType.includes('完全匹配') ? 1 : 3; // 完全匹配只允许1个，其他最多3个
  
  if (uniqueMatches.length > maxAllowedMatches) {
    console.error(`❌ 检测到过多匹配项 (${uniqueMatches.length}个)，超过允许的最大值 (${maxAllowedMatches}个)`);
    
    // 构建详细的错误信息
    const matchDetails = uniqueMatches.slice(0, 10).map((dp, index) => ({ // 只显示前10个
      序号: index + 1,
      ID: dp.id,
      标识符: dp.identifier,
      名称: dp.name,
      描述: dp.description || '无描述',
      格式: dp.format || '未知',
      单位: dp.unit || '无单位'
    }));
    
    return {
      error: true,
      code: 'TOO_MANY_MATCHES',
      message: `参数 "${paramName}" 匹配到了 ${uniqueMatches.length} 个数据点，过于模糊无法确定唯一目标`,
      details: {
        searchTerm: paramName,
        matchType: matchType,
        matchCount: uniqueMatches.length,
        maxAllowed: maxAllowedMatches,
        displayedMatches: matchDetails.length,
        totalMatches: uniqueMatches.length,
        matches: matchDetails,
        解决方案: [
          '使用更具体和精确的数据点标识符',
          '使用完整的数据点名称而不是模糊关键词',
          '参考下方的建议精确匹配项',
          `当前搜索词"${paramName}"过于通用，请提供更具体的名称`
        ],
        精确匹配建议: uniqueMatches.slice(0, 5).map(dp => ({
          建议使用标识符: dp.identifier,
          建议使用完整名称: dp.name,
          数据点描述: dp.description || '无描述'
        }))
      },
      suggestions: matchResults.suggestions.slice(0, 3)
    };
  }
  
  // 🚨 标准多匹配项错误处理（2-maxAllowedMatches个匹配项）
  if (uniqueMatches.length > 1) {
    console.error(`❌ 检测到多个匹配项，无法确定唯一数据点`);
    
    // 构建详细的错误信息
    const matchDetails = uniqueMatches.map((dp, index) => ({
      序号: index + 1,
      ID: dp.id,
      标识符: dp.identifier,
      名称: dp.name,
      描述: dp.description || '无描述',
      格式: dp.format || '未知',
      单位: dp.unit || '无单位',
      访问模式: dp.accessMode || '未知'
    }));
    
    return {
      error: true,
      code: 'MULTIPLE_MATCHES',
      message: `参数 "${paramName}" 找到 ${uniqueMatches.length} 个匹配的数据点，无法确定唯一目标`,
      details: {
        searchTerm: paramName,
        matchType: matchType,
        matchCount: uniqueMatches.length,
        matches: matchDetails,
        解决方案: [
          '请使用更精确的数据点标识符或名称',
          '检查是否存在重复的数据点配置',
          '使用完整的数据点名称而不是部分名称',
          '参考下方建议的精确匹配项'
        ],
        建议的精确匹配项: matchDetails.map(dp => ({
          建议使用: dp.标识符,
          完整名称: dp.名称,
          描述: dp.描述
        }))
      },
      suggestions: matchResults.suggestions.slice(0, 3) // 只返回前3个建议
    };
  }
  
  // 🚨 未找到匹配项的错误处理
  if (uniqueMatches.length === 0) {
    console.error(`❌ 未找到匹配的数据点: "${paramName}"`);
    
    return {
      error: true,
      code: 'NO_MATCHES',
      message: `参数 "${paramName}" 未找到匹配的数据点`,
      details: {
        searchTerm: paramName,
        totalDataPoints: allDataPoints.length,
        解决方案: [
          '检查参数名称拼写是否正确',
          '确认数据点是否已在系统中配置',
          '尝试使用数据点的完整标识符',
          '参考下方的建议项'
        ],
        建议项: matchResults.suggestions.slice(0, 5).map(s => ({
          标识符: s.identifier,
          名称: s.name,
          相似度: `${(s.similarity * 100).toFixed(1)}%`,
          建议原因: s.similarity > 0.8 ? '高度相似' : s.similarity > 0.5 ? '中等相似' : '低相似度'
        }))
      },
      suggestions: matchResults.suggestions.slice(0, 5)
    };
  }
  
  // ✅ 成功找到唯一匹配项
  const matchedPoint = uniqueMatches[0];
  console.log(`✅ 成功找到唯一匹配项:`);
  console.log(`   📍 ID: ${matchedPoint.id}`);
  console.log(`   🏷️ 标识符: ${matchedPoint.identifier}`);
  console.log(`   📝 名称: ${matchedPoint.name}`);
  console.log(`   🔧 格式: ${matchedPoint.format || '未知'}`);
  console.log(`   📏 单位: ${matchedPoint.unit || '无单位'}`);
  console.log(`   🔑 访问模式: ${matchedPoint.accessMode || '未知'}`);
  
  // 🔧 修复：在返回前添加matchType信息
  uniqueMatches.forEach(match => {
    match._matchType = matchType; // 添加匹配类型信息
  });
  
  return uniqueMatches;
}

/**
 * 获取建议的数据点
 * @param {string} paramName - 参数名称
 * @returns {Array} 建议的数据点列表
 */
async function getSuggestions(paramName) {
  const allDataPoints = dataPointManager.getAllDataPoints();
  const suggestions = [];
  
  // 查找相似的数据点
  const similarPoints = allDataPoints.filter(dp => {
    const nameSimilarity = calculateSimilarity(paramName, dp.name);
    const identifierSimilarity = calculateSimilarity(paramName, dp.identifier);
    return nameSimilarity > 0.3 || identifierSimilarity > 0.3;
  }).slice(0, 5); // 限制为5个建议
  
  suggestions.push(...similarPoints.map(dp => ({
    id: dp.id,
    name: dp.name,
    identifier: dp.identifier,
    similarity: Math.max(
      calculateSimilarity(paramName, dp.name),
      calculateSimilarity(paramName, dp.identifier)
    )
  })));
  
  // 按相似度排序
  suggestions.sort((a, b) => b.similarity - a.similarity);
  
  return suggestions;
}

/**
 * 计算字符串相似度
 * @param {string} str1 - 字符串1
 * @param {string} str2 - 字符串2
 * @returns {number} 相似度(0-1)
 */
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = getEditDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * 计算编辑距离
 * @param {string} str1 - 字符串1
 * @param {string} str2 - 字符串2
 * @returns {number} 编辑距离
 */
function getEditDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * 写入数据到数据点
 * @param {Object} dataPoint - 数据点对象
 * @param {string|number} value - 要写入的值
 * @returns {Object} 写入结果
 */
async function writeToDataPoint(dataPoint, value) {
  console.log(`写入数据点: ${dataPoint.name} (${dataPoint.identifier}) = ${value}`);
  
  // 数据类型转换
  let convertedValue;
  try {
    convertedValue = convertValueByFormat(value, dataPoint.format, dataPoint.scale);
  } catch (conversionError) {
    throw new Error(`数据类型转换失败: ${conversionError.message}`);
  }
  
  try {
    // 1. 通过MQTT发布数据更新消息
    const mqttResult = await publishDataToMQTT(dataPoint, convertedValue);
    
    // 2. 直接更新数据库
    await updateDataPointInDatabase(dataPoint, value, convertedValue);
    
    // 3. 记录写入操作到数据库
    await recordWriteOperation(dataPoint, value, convertedValue);
    
    return {
      success: true,
      originalValue: value,
      convertedValue: convertedValue,
      mqttResult: mqttResult,
      timestamp: new Date().toISOString(),
      method: 'MQTT_PUBLISH'
    };
  } catch (writeError) {
    console.error(`写入数据点失败:`, writeError);
    throw new Error(`写入失败: ${writeError.message}`);
  }
}

/**
 * 通过MQTT发布数据更新消息
 * @param {Object} dataPoint - 数据点对象
 * @param {number} value - 转换后的值
 * @returns {Object} MQTT发布结果
 */
async function publishDataToMQTT(dataPoint, value) {
  try {
    // 检查MQTT服务是否可用
    if (!mqttService || !mqttService.client || !mqttService.client.connected) {
      console.warn('MQTT服务未连接，跳过MQTT发布');
      return { success: false, reason: 'MQTT服务未连接' };
    }
    
    // 🔧 修改：使用统一固定的MQTT主题
    const topic = 'data/mqtt';
    
    // 🔧 修改：使用简单的标识符键值对格式
    const message = {
      [dataPoint.identifier]: value
    };
    
    console.log(`发布MQTT消息到统一主题: ${topic}`, message);
    
    // 发布消息
    const published = mqttService.publish(topic, message, false);
    
    if (published) {
      console.log(`✅ 成功发布MQTT消息到统一主题: ${dataPoint.identifier} = ${value}`);
      return { 
        success: true, 
        topic: topic, 
        message: message,
        timestamp: new Date().toISOString()
      };
    } else {
      console.warn(`❌ MQTT消息发布失败: ${dataPoint.identifier} = ${value}`);
      return { success: false, reason: 'MQTT发布失败' };
    }
  } catch (error) {
    console.error('MQTT发布过程中出错:', error);
    return { success: false, reason: error.message };
  }
}

/**
 * 直接更新数据点在数据库中的值
 * @param {Object} dataPoint - 数据点对象
 * @param {string|number} originalValue - 原始值
 * @param {number} convertedValue - 转换后的值
 */
async function updateDataPointInDatabase(dataPoint, originalValue, convertedValue) {
  if (!dbManager.initialized) {
    console.warn('数据库管理器未初始化，跳过数据库更新');
    return;
  }
  
  try {
    const timestamp = new Date();
    const formattedValue = `${convertedValue} ${dataPoint.unit || ''}`.trim();
    
    // 更新最新值表
    await dbManager.pool.query(`
      INSERT INTO modbus_data_latest (
        data_point_id, data_point_identifier, data_point_name,
        raw_value, value, formatted_value, quality,
        data_type, unit, description, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        raw_value = VALUES(raw_value),
        value = VALUES(value),
        formatted_value = VALUES(formatted_value),
        quality = VALUES(quality),
        data_type = VALUES(data_type),
        updated_at = VALUES(updated_at)
    `, [
      dataPoint.id,
      dataPoint.identifier,
      dataPoint.name,
      JSON.stringify({ originalValue, convertedValue }),
      convertedValue,
      formattedValue,
      'GOOD',
      'API_WRITE',
      dataPoint.unit || '',
      dataPoint.description || '',
      timestamp
    ]);
    
    console.log(`✅ 数据库已更新: ${dataPoint.identifier} = ${convertedValue}`);
    
    // 重要：更新ModbusService的数据缓存，确保前端能显示最新值
    await updateModbusServiceCache(dataPoint, convertedValue, formattedValue, timestamp);
    
  } catch (dbError) {
    console.error('更新数据库失败:', dbError);
    throw new Error(`数据库更新失败: ${dbError.message}`);
  }
}

/**
 * 更新ModbusService的数据缓存
 * @param {Object} dataPoint - 数据点对象
 * @param {number} convertedValue - 转换后的值
 * @param {string} formattedValue - 格式化的值
 * @param {Date} timestamp - 时间戳
 */
async function updateModbusServiceCache(dataPoint, convertedValue, formattedValue, timestamp) {
  try {
    console.log(`🔄 开始更新ModbusService缓存: ${dataPoint.name} (${dataPoint.identifier}) = ${convertedValue}`);
    
    // 获取ModbusService实例
    const ModbusService = require('../modbus/modbus-service');
    const modbusService = ModbusService.getInstance();
    
    if (!modbusService) {
      console.warn('❌ 无法获取ModbusService实例，跳过缓存更新');
      return;
    }
    
    console.log(`📊 ModbusService状态:`);
    console.log(`  - 连接状态: ${modbusService.isConnected}`);
    console.log(`  - 数据源类型: ${modbusService.dataSourceType}`);
    console.log(`  - ModbusTCP实例: ${modbusService.modbusTCP ? '存在' : '不存在'}`);
    console.log(`  - MQTT服务实例: ${modbusService.mqttService ? '存在' : '不存在'}`);
    
    // 准备数据值对象
    const dataValue = {
      value: convertedValue,
      formatted: formattedValue,
      timestamp: timestamp.toISOString(),
      quality: 'GOOD',
      source: 'api_write'
    };
    
    // 无论什么情况，都确保内部缓存存在并更新
    console.log(`📝 确保内部缓存存在并更新...`);
    if (!modbusService._dataCache) {
      console.log(`🔧 创建ModbusService内部缓存`);
      modbusService._dataCache = {};
    }
    
    // 使用数据点名称作为主键，同时也用identifier作为备用键
    modbusService._dataCache[dataPoint.name] = dataValue;
    modbusService._dataCache[dataPoint.identifier] = dataValue;
    
    console.log(`✅ 已更新ModbusService内部缓存:`);
    console.log(`  - 键名: ${dataPoint.name} 和 ${dataPoint.identifier}`);
    console.log(`  - 值: ${convertedValue}`);
    console.log(`  - 缓存大小: ${Object.keys(modbusService._dataCache).length} 个条目`);
    
    // 如果有ModbusTCP实例，也更新它的缓存
    if (modbusService.modbusTCP) {
      console.log(`📝 更新ModbusTCP缓存...`);
      
      // 确保dataValues对象存在
      if (!modbusService.modbusTCP.dataValues) {
        console.log(`🔧 初始化ModbusTCP.dataValues对象`);
        modbusService.modbusTCP.dataValues = {};
      }
      
      // 更新ModbusTCP的数据缓存
      modbusService.modbusTCP.dataValues[dataPoint.name] = {
        ...dataValue,
        transactionId: Date.now() // 使用时间戳作为事务ID
      };
      
      console.log(`✅ 已更新ModbusTCP缓存: ${dataPoint.name} = ${convertedValue}`);
    }
    
    // 如果使用MQTT数据源，更新ModbusService内部的MQTT服务缓存
    if (modbusService.dataSourceType === 'mqtt' && modbusService.mqttService) {
      console.log(`📝 更新ModbusService内部的MQTT缓存...`);
      
      // 确保MQTT服务的dataValues存在
      if (!modbusService.mqttService.dataValues) {
        console.log(`🔧 初始化MQTT服务dataValues对象`);
        modbusService.mqttService.dataValues = {};
      }
      
      // 更新MQTT服务的数据缓存
      modbusService.mqttService.dataValues[dataPoint.identifier] = {
        ...dataValue,
        topic: `data/modbus/${dataPoint.identifier}`
      };
      
      console.log(`✅ 已更新ModbusService内部MQTT缓存: ${dataPoint.identifier} = ${convertedValue}`);
    }
    
    // 触发数据更新事件，通知其他组件
    if (modbusService.emit) {
      modbusService.emit('dataUpdate', dataPoint.name, dataValue);
      console.log(`✅ 已触发数据更新事件: ${dataPoint.name}`);
    }
    
    // 通知单点报警系统数据更新
    try {
      // 尝试获取MQTT服务实例并调用单点报警的数据更新处理
      if (mqttService && mqttService.onDataUpdate && typeof mqttService.onDataUpdate === 'function') {
        mqttService.onDataUpdate(dataPoint.identifier, convertedValue, timestamp);
        console.log(`✅ 已通知单点报警系统数据更新: ${dataPoint.identifier} = ${convertedValue}`);
      } else {
        console.log(`⚠️ 单点报警系统数据更新回调不可用`);
      }
    } catch (singlePointError) {
      console.warn(`⚠️ 通知单点报警系统失败:`, singlePointError.message);
    }
    
    // 验证缓存是否真的更新了
    console.log(`🔍 验证缓存更新结果:`);
    if (modbusService._dataCache) {
      console.log(`  - 内部缓存键名: [${Object.keys(modbusService._dataCache).join(', ')}]`);
      console.log(`  - ${dataPoint.name} 存在: ${dataPoint.name in modbusService._dataCache ? '是' : '否'}`);
      console.log(`  - ${dataPoint.identifier} 存在: ${dataPoint.identifier in modbusService._dataCache ? '是' : '否'}`);
    }
    
    console.log(`🎉 ModbusService缓存更新完成`);
    
    // 🚀 添加WebSocket推送逻辑，将数据实时推送到前端
    console.log(`🚀 开始推送数据到前端WebSocket客户端...`);
    
    try {
      // 准备要发送的数据，模拟MQTT数据格式
      const websocketData = {
        type: 'modbus_data',
        identifier: dataPoint.identifier,
        data: {
          [dataPoint.identifier]: convertedValue
        },
        value: convertedValue,
        timestamp: timestamp.toISOString(),
        source: 'api_write'
      };
      
      console.log(`📤 准备发送WebSocket数据:`, websocketData);
      
      // 通过MQTT服务发送WebSocket消息
      if (mqttService && mqttService.sendToWebSocketClients) {
        mqttService.sendToWebSocketClients(websocketData);
        console.log(`✅ 已通过MQTT服务发送WebSocket消息`);
      } else {
        console.warn(`⚠️ MQTT服务不可用，无法发送WebSocket消息`);
      }
      
      // 同时发送data_points格式的消息，确保前端兼容性
      const dataPointsMessage = {
        type: 'data_points',
        identifier: 'api_write',
        data: {
          [dataPoint.identifier]: convertedValue,
          [dataPoint.name]: convertedValue
        },
        timestamp: timestamp.toISOString()
      };
      
      if (mqttService && mqttService.sendToWebSocketClients) {
        mqttService.sendToWebSocketClients(dataPointsMessage);
        console.log(`✅ 已发送data_points格式的WebSocket消息`);
      }
      
      console.log(`🎉 WebSocket数据推送完成`);
      
    } catch (wsError) {
      console.error('❌ WebSocket推送失败:', wsError);
      // 不抛出错误，因为这不应该影响主要的写入操作
    }
    
  } catch (error) {
    console.error('❌ 更新ModbusService缓存失败:', error);
    // 不抛出错误，因为这不应该影响主要的写入操作
  }
}

/**
 * 根据数据格式转换值
 * @param {string|number} value - 原始值
 * @param {string} format - 数据格式
 * @param {number} scale - 比例因子
 * @returns {number} 转换后的值
 */
function convertValueByFormat(value, format, scale = 1) {
  let numericValue;
  
  // 转换为数值
  if (typeof value === 'string') {
    numericValue = parseFloat(value);
    if (isNaN(numericValue)) {
      throw new Error(`无法将 "${value}" 转换为数值`);
    }
  } else {
    numericValue = Number(value);
  }
  
  // 应用比例因子
  const scaledValue = numericValue * scale;
  
  // 根据格式处理
  switch (format) {
    case 'UINT16':
      if (scaledValue < 0 || scaledValue > 65535) {
        throw new Error(`UINT16 值超出范围: ${scaledValue} (应在 0-65535 之间)`);
      }
      return Math.round(scaledValue);
    
    case 'INT16':
      if (scaledValue < -32768 || scaledValue > 32767) {
        throw new Error(`INT16 值超出范围: ${scaledValue} (应在 -32768-32767 之间)`);
      }
      return Math.round(scaledValue);
    
    case 'UINT32':
      if (scaledValue < 0 || scaledValue > 4294967295) {
        throw new Error(`UINT32 值超出范围: ${scaledValue} (应在 0-4294967295 之间)`);
      }
      return Math.round(scaledValue);
    
    case 'INT32':
      if (scaledValue < -2147483648 || scaledValue > 2147483647) {
        throw new Error(`INT32 值超出范围: ${scaledValue} (应在 -2147483648-2147483647 之间)`);
      }
      return Math.round(scaledValue);
    
    case 'FLOAT32':
    case 'FLOAT':
      return scaledValue;
    
    case 'BIT':
      return scaledValue ? 1 : 0;
    
    case 'POINT':
      return scaledValue ? 1 : 0;
    
    default:
      return scaledValue;
  }
}

/**
 * 记录写入操作到数据库 - 优化版本
 * 在插入前先对数值进行比较，只有当数值发生变化才执行插入指令
 * @param {Object} dataPoint - 数据点对象
 * @param {string|number} originalValue - 原始值
 * @param {number} convertedValue - 转换后的值
 */
async function recordWriteOperation(dataPoint, originalValue, convertedValue) {
  if (!dbManager.initialized) {
    console.warn('数据库管理器未初始化，跳过记录写入操作');
    return;
  }
  
  try {
    const timestamp = new Date();
    const formattedValue = `${convertedValue} ${dataPoint.unit || ''}`.trim();
    
    // 🔧 优化：查询最新值，进行数值比较
    const [existingRows] = await dbManager.pool.query(
      'SELECT value, formatted_value, updated_at FROM modbus_data_latest WHERE data_point_identifier = ? LIMIT 1',
      [dataPoint.identifier]
    );
    
    let shouldInsertHistory = true;
    let changeDescription = `通过API写入: ${originalValue} -> ${convertedValue}`;
    
    if (existingRows.length > 0) {
      const existingRecord = existingRows[0];
      const existingValue = parseFloat(existingRecord.value);
      const newValue = parseFloat(convertedValue);
      
      // 数值比较 - 使用相对和绝对容差
      const absoluteTolerance = 0.001; // 绝对容差
      const relativeTolerance = 0.0001; // 相对容差 0.01%
      
      if (!isNaN(existingValue) && !isNaN(newValue)) {
        const absoluteDiff = Math.abs(newValue - existingValue);
        const relativeDiff = Math.abs(newValue - existingValue) / Math.max(Math.abs(newValue), Math.abs(existingValue), 1);
        
        // 如果数值变化在容差范围内，且格式化值也相同，则跳过历史记录插入
        if (absoluteDiff < absoluteTolerance || relativeDiff < relativeTolerance) {
          if (existingRecord.formatted_value === formattedValue) {
            shouldInsertHistory = false;
            console.log(`⏭️ 数值未发生显著变化，跳过历史记录插入: ${dataPoint.identifier} (${existingValue} -> ${newValue})`);
          }
        } else {
          changeDescription = `数值变化: ${existingValue} -> ${newValue} (差异: ${absoluteDiff.toFixed(6)})`;
          console.log(`✅ 检测到数值变化，将插入历史记录: ${dataPoint.identifier} - ${changeDescription}`);
        }
      } else {
        // 非数值比较，进行字符串比较
        if (String(existingRecord.value) === String(convertedValue) && 
            existingRecord.formatted_value === formattedValue) {
          shouldInsertHistory = false;
          console.log(`⏭️ 字符串值未变化，跳过历史记录插入: ${dataPoint.identifier}`);
        } else {
          changeDescription = `值变化: ${existingRecord.value} -> ${convertedValue}`;
          console.log(`✅ 检测到值变化，将插入历史记录: ${dataPoint.identifier} - ${changeDescription}`);
        }
      }
      
      // 检查强制插入间隔（避免长时间无记录）
      const timeSinceLastUpdate = timestamp - new Date(existingRecord.updated_at);
      const forceInsertInterval = 30 * 60 * 1000; // 30分钟强制插入一次
      
      if (!shouldInsertHistory && timeSinceLastUpdate > forceInsertInterval) {
        shouldInsertHistory = true;
        changeDescription = `定时强制插入: ${formattedValue} (距上次更新${Math.round(timeSinceLastUpdate/60000)}分钟)`;
        console.log(`⏰ 触发强制插入: ${dataPoint.identifier} - ${changeDescription}`);
      }
    } else {
      // 首次记录，必须插入
      changeDescription = `初始数据: ${originalValue} -> ${convertedValue}`;
      console.log(`🆕 首次记录数据点，将插入历史记录: ${dataPoint.identifier}`);
    }
    
    // 只有在数值变化时才插入历史记录
    if (shouldInsertHistory) {
      await dbManager.pool.query(`
        INSERT INTO modbus_data_history (
          data_point_id, data_point_identifier, data_point_name,
          raw_value, value, formatted_value, quality,
          data_type, change_description, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        dataPoint.id,
        dataPoint.identifier,
        dataPoint.name,
        JSON.stringify({ originalValue, convertedValue }),
        convertedValue,
        formattedValue,
        'GOOD',
        'WRITE_OPERATION',
        changeDescription,
        timestamp
      ]);
      
      console.log(`✅ 历史记录已插入: ${dataPoint.identifier} = ${convertedValue}`);
    } else {
      console.log(`⏭️ 跳过历史记录插入: ${dataPoint.identifier} = ${convertedValue}`);
    }
    
    // 更新最新值表 - 无论是否插入历史记录都要更新
    await dbManager.pool.query(`
      INSERT INTO modbus_data_latest (
        data_point_id, data_point_identifier, data_point_name,
        raw_value, value, formatted_value, quality,
        data_type, unit, description, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        raw_value = VALUES(raw_value),
        value = VALUES(value),
        formatted_value = VALUES(formatted_value),
        quality = VALUES(quality),
        data_type = VALUES(data_type),
        updated_at = VALUES(updated_at)
    `, [
      dataPoint.id,
      dataPoint.identifier,
      dataPoint.name,
      JSON.stringify({ originalValue, convertedValue }),
      convertedValue,
      formattedValue,
      'GOOD',
      'WRITE_OPERATION',
      dataPoint.unit || '',
      dataPoint.description || '',
      timestamp
    ]);
    
    console.log(`✅ 最新值表已更新: ${dataPoint.identifier} = ${convertedValue}`);
    
  } catch (dbError) {
    console.error('记录写入操作到数据库失败:', dbError);
    throw new Error(`数据库操作失败: ${dbError.message}`);
  }
}

/**
 * 更新水质数据到数据库 - 优化版本
 * 在插入前先对数值进行比较，只有当数值发生变化才执行插入指令
 * @param {Object} dataPoint - 数据点对象
 * @param {string|number} value - 值
 * @param {string} paramName - 参数名称
 */
async function updateWaterQualityDatabase(dataPoint, value, paramName) {
  if (!dbManager.initialized) {
    console.warn('数据库管理器未初始化，跳过水质数据库更新');
    return;
  }
  
  try {
    const timestamp = new Date();
    const standardName = WATER_QUALITY_MAPPING[paramName] || paramName;
    const numericValue = parseFloat(value) || 0;
    const formattedValue = `${value} ${dataPoint.unit || ''}`.trim();
    
    // 🔧 优化：查询最新值，进行数值比较
    const [existingRows] = await dbManager.pool.query(
      'SELECT value, formatted_value, updated_at FROM modbus_data_latest WHERE data_point_identifier = ? LIMIT 1',
      [dataPoint.identifier]
    );
    
    let shouldInsertHistory = true;
    let changeDescription = `水质数据更新: ${paramName} (${standardName})`;
    
    if (existingRows.length > 0) {
      const existingRecord = existingRows[0];
      const existingValue = parseFloat(existingRecord.value);
      const newValue = numericValue;
      
      // 水质数据的数值比较 - 使用更严格的容差
      const absoluteTolerance = 0.01; // 水质数据绝对容差
      const relativeTolerance = 0.001; // 相对容差 0.1%
      
      if (!isNaN(existingValue) && !isNaN(newValue)) {
        const absoluteDiff = Math.abs(newValue - existingValue);
        const relativeDiff = Math.abs(newValue - existingValue) / Math.max(Math.abs(newValue), Math.abs(existingValue), 1);
        
        // 如果数值变化在容差范围内，且格式化值也相同，则跳过历史记录插入
        if (absoluteDiff < absoluteTolerance || relativeDiff < relativeTolerance) {
          if (existingRecord.formatted_value === formattedValue) {
            shouldInsertHistory = false;
            console.log(`⏭️ 水质数据未发生显著变化，跳过历史记录插入: ${paramName} (${existingValue} -> ${newValue})`);
          }
        } else {
          changeDescription = `水质数据变化: ${paramName} ${existingValue} -> ${newValue} (差异: ${absoluteDiff.toFixed(4)})`;
          console.log(`✅ 检测到水质数据变化，将插入历史记录: ${paramName} - ${changeDescription}`);
        }
      } else {
        // 非数值比较
        if (String(existingRecord.value) === String(numericValue) && 
            existingRecord.formatted_value === formattedValue) {
          shouldInsertHistory = false;
          console.log(`⏭️ 水质数据值未变化，跳过历史记录插入: ${paramName}`);
        } else {
          changeDescription = `水质数据变化: ${paramName} ${existingRecord.value} -> ${numericValue}`;
          console.log(`✅ 检测到水质数据变化，将插入历史记录: ${paramName} - ${changeDescription}`);
        }
      }
      
      // 检查强制插入间隔（水质数据可能需要更长的间隔）
      const timeSinceLastUpdate = timestamp - new Date(existingRecord.updated_at);
      const forceInsertInterval = 60 * 60 * 1000; // 60分钟强制插入一次
      
      if (!shouldInsertHistory && timeSinceLastUpdate > forceInsertInterval) {
        shouldInsertHistory = true;
        changeDescription = `水质数据定时强制插入: ${paramName} = ${value} (距上次更新${Math.round(timeSinceLastUpdate/60000)}分钟)`;
        console.log(`⏰ 触发水质数据强制插入: ${paramName} - ${changeDescription}`);
      }
    } else {
      // 首次记录，必须插入
      changeDescription = `水质数据初始记录: ${paramName} (${standardName}) = ${value}`;
      console.log(`🆕 首次记录水质数据，将插入历史记录: ${paramName}`);
    }
    
    // 只有在数值变化时才插入历史记录
    if (shouldInsertHistory) {
      await dbManager.pool.query(`
        INSERT INTO modbus_data_history (
          data_point_id, data_point_identifier, data_point_name,
          raw_value, value, formatted_value, quality,
          data_type, change_description, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        dataPoint.id,
        dataPoint.identifier,
        dataPoint.name,
        JSON.stringify({ paramName, standardName, value }),
        numericValue,
        formattedValue,
        'GOOD',
        'WATER_QUALITY',
        changeDescription,
        timestamp
      ]);
      
      console.log(`✅ 水质历史数据已插入: ${paramName} = ${value}`);
    } else {
      console.log(`⏭️ 跳过水质历史记录插入: ${paramName} = ${value}`);
    }
    
    // 更新最新值表 - 无论是否插入历史记录都要更新
    await dbManager.pool.query(`
      INSERT INTO modbus_data_latest (
        data_point_id, data_point_identifier, data_point_name,
        raw_value, value, formatted_value, quality,
        data_type, unit, description, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        raw_value = VALUES(raw_value),
        value = VALUES(value),
        formatted_value = VALUES(formatted_value),
        quality = VALUES(quality),
        data_type = VALUES(data_type),
        updated_at = VALUES(updated_at)
    `, [
      dataPoint.id,
      dataPoint.identifier,
      dataPoint.name,
      JSON.stringify({ paramName, standardName, value }),
      numericValue,
      formattedValue,
      'GOOD',
      'WATER_QUALITY',
      dataPoint.unit || '',
      dataPoint.description || '',
      timestamp
    ]);
    
    console.log(`✅ 水质最新值表已更新: ${paramName} = ${value}`);
    
  } catch (dbError) {
    console.error('更新水质数据到数据库失败:', dbError);
    throw new Error(`水质数据库操作失败: ${dbError.message}`);
  }
}

// 获取所有可用的数据点
router.get('/data-points', (req, res) => {
  try {
    const dataPoints = dataPointManager.getAllDataPoints();
    
    // 按类型分组
    const groupedDataPoints = {
      writable: dataPoints.filter(dp => dp.accessMode === 'write' || dp.accessMode === 'readwrite'),
      readable: dataPoints.filter(dp => dp.accessMode === 'read' || dp.accessMode === 'readwrite'),
      waterQuality: dataPoints.filter(dp => {
        const name = dp.name.toLowerCase();
        const identifier = dp.identifier.toLowerCase();
        return Object.keys(WATER_QUALITY_MAPPING).some(key => 
          name.includes(key.toLowerCase()) || identifier.includes(WATER_QUALITY_MAPPING[key].toLowerCase())
        );
      })
    };
    
    res.json({
      success: true,
      data: {
        total: dataPoints.length,
        grouped: groupedDataPoints,
        waterQualityMapping: WATER_QUALITY_MAPPING
      }
    });
  } catch (error) {
    console.error('获取数据点列表失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取API使用说明
router.get('/help', (req, res) => {
  res.json({
    success: true,
    documentation: {
      endpoint: '/api/data-write',
      description: '数据写入API，支持多种格式的数据写入操作',
      requestFormat: {
        method: 'POST',
        contentType: 'application/json',
        body: {
          data: '{"action_type": "update", "target_object": "runtime_parameter", "details": {"氨氮": "23"}}'
        }
      },
      supportedActions: [
        {
          action_type: 'update',
          target_object: 'runtime_parameter',
          description: '更新运行时参数',
          example: '{"action_type": "update", "target_object": "runtime_parameter", "details": {"氨氮": "23", "总磷": "1.5"}}'
        },
        {
          action_type: 'update',
          target_object: 'water_quality',
          description: '更新水质数据',
          example: '{"action_type": "update", "target_object": "water_quality", "details": {"化学需氧量": "45", "pH值": "7.2"}}'
        },
        {
          action_type: 'write',
          target_object: 'data_point',
          description: '直接写入数据点',
          example: '{"action_type": "write", "target_object": "data_point", "details": {"NH3N": "23", "ZHSR1": "100"}}'
        }
      ],
      waterQualityMapping: WATER_QUALITY_MAPPING,
      responseFormat: {
        success: 'boolean',
        message: 'string',
        results: 'array',
        errors: 'array',
        summary: 'object'
      }
    }
  });
});

module.exports = router; 
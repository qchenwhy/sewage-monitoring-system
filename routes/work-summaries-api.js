/**
 * 工作总结API路由
 */
const express = require('express');
const router = express.Router();
const workSummaryService = require('../modbus/work-summary-service');

// 初始化服务
(async () => {
  try {
    await workSummaryService.initialize();
  } catch (error) {
    console.error('初始化工作总结服务失败:', error);
  }
})();

// 获取工作总结列表
router.get('/', async (req, res) => {
  try {
    const { limit = 10, offset = 0, startDate, endDate } = req.query;
    
    const options = {
      limit: parseInt(limit),
      offset: parseInt(offset),
      startDate,
      endDate
    };
    
    const result = await workSummaryService.getSummaryList(options);
    
    res.json({
      success: true,
      data: result.summaries,
      total: result.total,
      pagination: {
        limit: options.limit,
        offset: options.offset
      }
    });
  } catch (error) {
    console.error('获取工作总结列表失败:', error);
    res.status(500).json({
      success: false,
      error: '获取工作总结列表失败: ' + error.message
    });
  }
});

// 生成指定日期的工作总结
router.post('/generate', async (req, res) => {
  try {
    const { date } = req.body;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        error: '日期参数必须提供'
      });
    }
    
    const result = await workSummaryService.generateSummary(date);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        summaryId: result.summaryId
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message || result.error || '生成工作总结失败'
      });
    }
  } catch (error) {
    console.error('生成工作总结失败:', error);
    res.status(500).json({
      success: false,
      error: '生成工作总结失败: ' + error.message
    });
  }
});

// 获取指定ID的工作总结详情
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: '无效的工作总结ID'
      });
    }
    
    const summary = await workSummaryService.getSummaryById(id);
    
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('获取工作总结详情失败:', error);
    res.status(500).json({
      success: false,
      error: '获取工作总结详情失败: ' + error.message
    });
  }
});

// 按日期获取工作总结
router.get('/by-date/:date', async (req, res) => {
  try {
    const { date } = req.params;
    
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        error: '无效的日期格式，应为YYYY-MM-DD'
      });
    }
    
    const summary = await workSummaryService.getSummaryByDate(date);
    
    if (!summary) {
      return res.status(404).json({
        success: false,
        error: `未找到 ${date} 的工作总结`
      });
    }
    
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('按日期获取工作总结失败:', error);
    res.status(500).json({
      success: false,
      error: '按日期获取工作总结失败: ' + error.message
    });
  }
});

// 删除工作总结
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: '无效的工作总结ID'
      });
    }
    
    await workSummaryService.deleteSummary(id);
    
    res.json({
      success: true,
      message: `已成功删除ID为 ${id} 的工作总结`
    });
  } catch (error) {
    console.error('删除工作总结失败:', error);
    res.status(500).json({
      success: false,
      error: '删除工作总结失败: ' + error.message
    });
  }
});

module.exports = router; 
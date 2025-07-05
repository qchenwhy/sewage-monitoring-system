const express = require('express');
const router = express.Router();
const webScraperService = require('../modbus/web-scraper-service').getInstance();

// 调试路由日志
console.log('========= 网页爬取路由模块加载 =========');
console.log('- 当前时间:', new Date().toISOString());

// 获取网页爬取服务状态
router.get('/status', (req, res) => {
  try {
    const status = webScraperService.getStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('获取网页爬取服务状态失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 初始化网页爬取服务
router.post('/initialize', async (req, res) => {
  try {
    console.log('收到初始化网页爬取服务请求:', req.body);
    
    const config = req.body;
    
    // 验证必要配置
    if (!config.url) {
      return res.status(400).json({
        success: false,
        error: '缺少目标网页URL配置'
      });
    }
    
    // 初始化服务
    await webScraperService.initialize(config);
    
    res.json({
      success: true,
      message: '网页爬取服务初始化成功',
      status: webScraperService.getStatus()
    });
  } catch (error) {
    console.error('初始化网页爬取服务失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 启动网页爬取服务（包括登录和定时任务）
router.post('/start', async (req, res) => {
  try {
    console.log('收到启动网页爬取服务请求');
    
    if (!webScraperService.initialized) {
      return res.status(400).json({
        success: false,
        error: '服务未初始化，请先调用初始化接口'
      });
    }
    
    // 如果开启了调试模式，总是尝试打开登录页面（即使没有配置用户名密码）
    if (webScraperService.config.debugMode && !webScraperService.isLoggedIn) {
      console.log('[启动服务] 调试模式已开启，打开登录页面供手动登录...');
      try {
        // 只用loginUrl，不做自动推断
        const loginUrl = webScraperService.config.loginUrl;
        if (!loginUrl) throw new Error('未配置登录页面URL');
        await webScraperService.page.goto(loginUrl, { 
          waitUntil: 'networkidle2',
          timeout: webScraperService.config.timeout 
        });
        console.log('[启动服务] 已打开登录页面，请手动完成登录');
        // 如果配置了用户名密码，尝试自动填写
        if (webScraperService.config.username && webScraperService.config.password) {
          await webScraperService.login();
        }
      } catch (error) {
        console.warn('[启动服务] 打开登录页面失败:', error.message);
      }
    } 
    // 如果需要登录且不是调试模式，先执行自动登录
    else if (webScraperService.config.username && !webScraperService.isLoggedIn) {
      await webScraperService.login();
    }
    
    // 启动定时任务
    await webScraperService.startScheduledTasks();
    
    res.json({
      success: true,
      message: '网页爬取服务启动成功',
      status: webScraperService.getStatus()
    });
  } catch (error) {
    console.error('启动网页爬取服务失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 停止网页爬取服务
router.post('/stop', async (req, res) => {
  try {
    console.log('收到停止网页爬取服务请求');
    
    await webScraperService.stop();
    
    res.json({
      success: true,
      message: '网页爬取服务已停止',
      status: webScraperService.getStatus()
    });
  } catch (error) {
    console.error('停止网页爬取服务失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 重启网页爬取服务
router.post('/restart', async (req, res) => {
  try {
    console.log('收到重启网页爬取服务请求');
    
    await webScraperService.restart();
    
    res.json({
      success: true,
      message: '网页爬取服务重启成功',
      status: webScraperService.getStatus()
    });
  } catch (error) {
    console.error('重启网页爬取服务失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 手动执行一次数据爬取
router.post('/scrape', async (req, res) => {
  try {
    console.log('收到手动爬取数据请求');
    
    const result = await webScraperService.manualScrape();
    
    if (result.success) {
      res.json({
        success: true,
        message: '数据爬取成功',
        data: result.data,
        timestamp: result.timestamp
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        timestamp: result.timestamp
      });
    }
  } catch (error) {
    console.error('手动爬取数据失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 更新配置
router.put('/config', (req, res) => {
  try {
    console.log('收到更新网页爬取配置请求:', req.body);
    
    const newConfig = webScraperService.updateConfig(req.body);
    
    res.json({
      success: true,
      message: '配置更新成功',
      config: newConfig
    });
  } catch (error) {
    console.error('更新网页爬取配置失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取当前配置
router.get('/config', (req, res) => {
  try {
    const config = webScraperService.config || {};
    
    // 隐藏敏感信息
    const safeConfig = { ...config };
    if (safeConfig.password) {
      safeConfig.password = '***';
    }
    
    res.json({
      success: true,
      config: safeConfig
    });
  } catch (error) {
    console.error('获取网页爬取配置失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 测试登录
router.post('/test-login', async (req, res) => {
  try {
    console.log('收到测试登录请求');
    
    if (!webScraperService.initialized) {
      return res.status(400).json({
        success: false,
        error: '服务未初始化'
      });
    }
    
    // 执行登录测试
    await webScraperService.login();
    
    res.json({
      success: true,
      message: '登录测试成功',
      isLoggedIn: webScraperService.isLoggedIn
    });
  } catch (error) {
    console.error('测试登录失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 刷新页面
router.post('/refresh', async (req, res) => {
  try {
    console.log('收到手动刷新页面请求');
    
    if (!webScraperService.initialized) {
      return res.status(400).json({
        success: false,
        error: '服务未初始化'
      });
    }
    
    await webScraperService.refreshPage();
    
    res.json({
      success: true,
      message: '页面刷新成功',
      status: webScraperService.getStatus()
    });
  } catch (error) {
    console.error('手动刷新页面失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取爬取的数据（从数据库）
router.get('/data', async (req, res) => {
  try {
    console.log('收到获取爬取数据请求');
    
    // 获取数据库管理器
    let dbManager;
    try {
      dbManager = require('../modbus/db-manager');
    } catch (err) {
      console.error('加载数据库管理器失败:', err);
      return res.status(500).json({
        success: false,
        error: '数据库管理器加载失败'
      });
    }
    
    // 确保数据库已初始化
    if (!dbManager.initialized) {
      const mysql = require('mysql2/promise');
      await dbManager.initialize(mysql);
    }
    
    // 查询网页爬取的数据点
    const query = `
      SELECT * FROM modbus_data_latest 
      WHERE data_point_identifier LIKE 'WEB_%' 
      ORDER BY updated_at DESC
    `;
    
    const [rows] = await dbManager.pool.query(query);
    
    res.json({
      success: true,
      data: rows,
      count: rows.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('获取爬取数据失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取配置模板
router.get('/config-template', (req, res) => {
  try {
    const template = {
      url: 'http://example.com/data-page',
      loginUrl: 'http://example.com/login',
      username: 'your_username',
      password: 'your_password',
      skipLogin: false, // 设为true可跳过登录直接爬取数据
      debugMode: false, // 设为true开启调试模式（非无头模式）
      selectors: {
        usernameField: '#username',
        passwordField: '#password',
        loginButton: '#loginBtn',
        captchaImage: null,
        dataTable: 'table.data-table',
        dataRows: 'tbody tr'
      },
      refreshInterval: 300000,
      scrapeInterval: 60000,
      headless: true,
      viewport: { width: 1920, height: 1080 },
      timeout: 30000,
      dataMapping: {
        '化学需氧量': 'COD',
        '氨氮': 'NH3N',
        '总磷': 'TP',
        '总氮': 'TN',
        'pH值': 'PH',
        '溶解氧': 'DO',
        '浊度': 'TURBIDITY',
        '水温': 'TEMP'
      }
    };
    
    res.json({
      success: true,
      template: template,
      description: {
        url: '目标数据页面URL',
        loginUrl: '登录页面URL（可选，如果与数据页面相同可不填）',
        username: '登录用户名',
        password: '登录密码',
        skipLogin: '是否跳过登录直接爬取数据（适用于无需登录的页面或已登录状态）',
        debugMode: '调试模式，开启后自动使用非无头模式便于调试',
        selectors: {
          usernameField: '用户名输入框的CSS选择器',
          passwordField: '密码输入框的CSS选择器',
          loginButton: '登录按钮的CSS选择器',
          captchaImage: '验证码图片的CSS选择器（可选）',
          dataTable: '数据表格的CSS选择器',
          dataRows: '数据行的CSS选择器'
        },
        refreshInterval: '页面刷新间隔（毫秒）',
        scrapeInterval: '数据爬取间隔（毫秒）',
        headless: '是否无头模式运行',
        viewport: '浏览器视口大小',
        timeout: '操作超时时间（毫秒）',
        dataMapping: '数据字段映射，将网页上的字段名映射为标准名称'
      },
      troubleshooting: {
        loginFailed: '如果登录失败，可以尝试：1. 设置 debugMode: true 查看页面；2. 设置 skipLogin: true 跳过登录；3. 检查选择器是否正确',
        sliderCaptcha: '如果遇到滑块验证，建议设置 headless: false 或 debugMode: true，手动完成验证',
        noData: '如果无法获取数据，检查 dataTable 和 dataRows 选择器是否正确'
      }
    });
  } catch (error) {
    console.error('获取配置模板失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 检测页面结构（用于调试）
router.post('/detect-page', async (req, res) => {
  try {
    console.log('收到检测页面结构请求:', req.body);
    
    if (!webScraperService.initialized) {
      return res.status(400).json({
        success: false,
        error: '服务未初始化'
      });
    }
    
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({
        success: false,
        error: '缺少URL参数'
      });
    }
    
    // 导航到指定页面
    await webScraperService.page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: webScraperService.config.timeout
    });
    
    // 等待页面加载
    await webScraperService.waitForTimeout(3000);
    
    // 检测页面结构
    const pageInfo = await webScraperService.detectPageStructure();
    
    // 获取页面上的所有表格和表单元素
    const pageElements = await webScraperService.page.evaluate(() => {
      const elements = {
        tables: [],
        forms: [],
        inputs: [],
        buttons: []
      };
      
      // 获取表格信息
      const tables = document.querySelectorAll('table');
      tables.forEach((table, index) => {
        const rows = table.querySelectorAll('tr');
        elements.tables.push({
          index: index,
          selector: `table:nth-child(${index + 1})`,
          rowCount: rows.length,
          className: table.className,
          id: table.id
        });
      });
      
      // 获取表单信息
      const forms = document.querySelectorAll('form');
      forms.forEach((form, index) => {
        elements.forms.push({
          index: index,
          selector: `form:nth-child(${index + 1})`,
          className: form.className,
          id: form.id,
          action: form.action
        });
      });
      
      // 获取输入框信息
      const inputs = document.querySelectorAll('input');
      inputs.forEach((input, index) => {
        elements.inputs.push({
          index: index,
          type: input.type,
          name: input.name,
          id: input.id,
          className: input.className,
          placeholder: input.placeholder
        });
      });
      
      // 获取按钮信息
      const buttons = document.querySelectorAll('button, input[type="submit"]');
      buttons.forEach((button, index) => {
        elements.buttons.push({
          index: index,
          text: button.textContent || button.value,
          className: button.className,
          id: button.id,
          type: button.type
        });
      });
      
      return elements;
    });
    
    res.json({
      success: true,
      pageInfo: pageInfo,
      elements: pageElements,
      suggestions: {
        loginSelectors: {
          usernameField: pageElements.inputs.find(input => 
            input.type === 'text' && (
              input.name?.includes('user') || 
              input.id?.includes('user') || 
              input.placeholder?.includes('用户')
            )
          ),
          passwordField: pageElements.inputs.find(input => input.type === 'password'),
          loginButton: pageElements.buttons.find(button => 
            button.text?.includes('登录') || 
            button.text?.includes('登陆') || 
            button.text?.includes('Login')
          )
        },
        dataSelectors: {
          dataTable: pageElements.tables.length > 0 ? pageElements.tables[0] : null
        }
      }
    });
  } catch (error) {
    console.error('检测页面结构失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router; 
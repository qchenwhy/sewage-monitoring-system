/**
 * 网页爬取服务
 * 支持自动登录、页面刷新保持会话、数据提取和存储
 */

const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

class WebScraperService {
  constructor() {
    this.browser = null;
    this.page = null;
    this.isLoggedIn = false;
    this.config = null;
    this.refreshTimer = null;
    this.scrapeTimer = null;
    this.loginCheckTimer = null; // 新增：登录状态检测定时器
    this.dbManager = null;
    this.initialized = false;
    
    // 默认配置
    this.defaultConfig = {
      url: '',
      loginUrl: '',
      username: '',
      password: '',
      skipLogin: false, // 新增：跳过登录直接爬取数据
      selectors: {
        usernameField: '#username',
        passwordField: '#password',
        loginButton: '#loginBtn',
        captchaImage: null,
        dataTable: 'table',
        dataRows: 'tr'
      },
      refreshInterval: 300000, // 5分钟刷新一次页面
      scrapeInterval: 60000,   // 1分钟爬取一次数据
      headless: true,
      debugMode: false, // 新增：调试模式，设为true时自动设置headless为false
      viewport: { width: 1024, height: 768 }, // 降低到更小的分辨率
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      timeout: 30000,
      retryAttempts: 3,
      dataMapping: {
        // 数据字段映射配置
        // 例如: { '化学需氧量': 'COD', '氨氮': 'NH3N', '总磷': 'TP' }
      }
    };
  }

  /**
   * 初始化服务
   */
  async initialize(config = {}) {
    try {
      console.log('[网页爬取服务] 开始初始化...');
      
      // 合并配置
      this.config = { ...this.defaultConfig, ...config };
      
      // 验证必要配置
      if (!this.config.url) {
        throw new Error('缺少目标网页URL配置');
      }
      
      // 初始化数据库管理器
      if (!this.dbManager) {
        try {
          this.dbManager = require('./db-manager');
          if (!this.dbManager.initialized) {
            const mysql = require('mysql2/promise');
            await this.dbManager.initialize(mysql);
          }
        } catch (err) {
          console.warn('[网页爬取服务] 数据库管理器初始化失败:', err.message);
        }
      }
      
      // 启动浏览器
      await this.startBrowser();
      
      this.initialized = true;
      console.log('[网页爬取服务] 初始化完成');
      
      return true;
    } catch (error) {
      console.error('[网页爬取服务] 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 兼容性等待方法
   */
  async waitForTimeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 启动浏览器
   */
  async startBrowser() {
    try {
      console.log('[网页爬取服务] 启动浏览器...');
      const headlessMode = this.config.debugMode ? false : this.config.headless;
      if (this.config.debugMode) {
        console.log('[网页爬取服务] 调试模式已开启，使用非无头模式');
      }
      
      // 获取分辨率配置，默认使用更小的分辨率让元素显示更大
      const viewportWidth = this.config.viewportWidth || this.config.viewport?.width || 1024;
      const viewportHeight = this.config.viewportHeight || this.config.viewport?.height || 768;
      
      console.log(`[网页爬取服务] 设置浏览器分辨率: ${viewportWidth}x${viewportHeight}`);
      
      // 新增：支持自定义浏览器路径
      const chromePath = this.config.executablePath || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      this.browser = await puppeteer.launch({
        headless: headlessMode,
        executablePath: chromePath,
        defaultViewport: null,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--start-maximized',
          `--window-size=${viewportWidth},${viewportHeight}`,  // 使用配置的分辨率
          '--force-device-scale-factor=1.5',  // 强制设备缩放比例为1.5，让元素显示更大
          '--high-dpi-support=1',  // 启用高DPI支持
          '--disable-web-security',  // 禁用web安全限制
          '--disable-features=VizDisplayCompositor',  // 禁用某些可能影响显示的功能
          '--disable-background-timer-throttling',  // 禁用后台定时器限制
          '--disable-renderer-backgrounding',  // 禁用渲染器后台化
          '--disable-backgrounding-occluded-windows',  // 禁用被遮挡窗口的后台化
          '--force-prefers-reduced-motion',  // 强制减少动画
          '--disable-ipc-flooding-protection'  // 禁用IPC洪水保护
        ]
      });

      this.page = await this.browser.newPage();
      
      // 设置视口 - 使用配置的分辨率
      await this.page.setViewport({
        width: viewportWidth,
        height: viewportHeight,
        deviceScaleFactor: 1.5  // 增加缩放比例让元素显示更大
      });

      // 设置用户代理
      await this.page.setUserAgent(this.config.userAgent);
      
      // 注入自动点击实时监控的代码
      await this.page.evaluateOnNewDocument(() => {
        function insertMovePanel() {
          if (!document.getElementById('move-panel') && document.body) {
            const panel = document.createElement('div');
            panel.id = 'move-panel';
            panel.innerHTML = `
              <button id="mv-left" title="左">←</button>
              <button id="mv-up" title="上">↑</button>
              <button id="mv-down" title="下">↓</button>
              <button id="mv-right" title="右">→</button>
            `;
            document.body.appendChild(panel);
            function scrollByDir(dx, dy) {
              window.scrollBy({ left: dx, top: dy, behavior: 'smooth' });
            }
            document.getElementById('mv-left').onclick = () => scrollByDir(-200, 0);
            document.getElementById('mv-right').onclick = () => scrollByDir(200, 0);
            document.getElementById('mv-up').onclick = () => scrollByDir(0, -200);
            document.getElementById('mv-down').onclick = () => scrollByDir(0, 200);
          }
        }
        function insertStyle() {
          if (!document.getElementById('move-panel-style') && document.head) {
            const style = document.createElement('style');
            style.id = 'move-panel-style';
            style.innerHTML = `
              #move-panel {
                position: fixed !important;
                top: 20px !important;
                left: 20px !important;
                right: auto !important;
                z-index: 2147483647 !important;
                background: rgba(0,0,0,0.5);
                border-radius: 8px;
                padding: 8px 12px;
                display: flex;
                gap: 6px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                user-select: none;
              }
              #move-panel button {
                background: #fff;
                border: 1px solid #ccc;
                border-radius: 4px;
                width: 28px;
                height: 28px;
                font-size: 18px;
                cursor: pointer;
                opacity: 0.85;
                transition: background 0.2s;
              }
              #move-panel button:hover {
                background: #007bff;
                color: #fff;
                opacity: 1;
              }
            `;
            document.head.appendChild(style);
          }
        }
        // 轮询插入，直到成功
        const timer = setInterval(() => {
          insertStyle();
          insertMovePanel();
          if (document.getElementById('move-panel') && document.getElementById('move-panel-style')) {
            clearInterval(timer);
          }
        }, 500);
        
        // 整体缩放页面内容以适配窗口宽度
        function scaleToFit() {
          const body = document.body;
          if (!body) return;
          const scale = window.innerWidth / body.scrollWidth;
          const finalScale = scale < 1 ? scale : 1;
          body.style.transform = `scale(${finalScale})`;
          body.style.transformOrigin = 'top left';
          body.style.width = `${100 / finalScale}%`;
          body.style.height = `${100 / finalScale}%`;
        }
        window.addEventListener('DOMContentLoaded', scaleToFit);
        window.addEventListener('resize', scaleToFit);
        setTimeout(scaleToFit, 2000);
        
        // 强化的自动点击实时监控功能
        function clickRealtimeMonitor() {
          console.log('[自动点击] 开始查找实时监控菜单...');
          
          // 多种可能的选择器
          const selectors = [
            '#top-menu ul li',
            '#side-menu li', 
            '.nav li',
            '.menu li',
            'li a',
            'a[href*="EnterpriseRealtimeData"]',
            'a[href*="实时监控"]',
            '[onclick*="实时监控"]'
          ];
          
          let found = false;
          
          for (const selector of selectors) {
            try {
              const menuItems = document.querySelectorAll(selector);
              console.log(`[自动点击] 检查选择器 ${selector}，找到 ${menuItems.length} 个元素`);
              
              for (const item of menuItems) {
                const text = item.textContent || item.innerText || '';
                const href = item.href || '';
                const onclick = item.getAttribute('onclick') || '';
                
                // 检查是否包含实时监控相关文本或链接
                if (text.includes('实时监控') || 
                    text.includes('实时数据') || 
                    text.includes('RealTime') ||
                    href.includes('EnterpriseRealtimeData') ||
                    onclick.includes('实时监控')) {
                  
                  console.log(`[自动点击] 找到实时监控菜单: ${text.trim()}`);
                  
                  // 尝试点击
                  try {
                    item.click();
                    console.log('[自动点击] 成功点击实时监控菜单');
                    found = true;
                    break;
                  } catch (clickError) {
                    console.warn('[自动点击] 点击失败，尝试其他方式:', clickError);
                    
                    // 尝试触发事件
                    try {
                      const event = new MouseEvent('click', {
                        view: window,
                        bubbles: true,
                        cancelable: true
                      });
                      item.dispatchEvent(event);
                      console.log('[自动点击] 通过事件触发成功');
                      found = true;
                      break;
                    } catch (eventError) {
                      console.warn('[自动点击] 事件触发也失败:', eventError);
                    }
                  }
                }
              }
              
              if (found) break;
            } catch (error) {
              console.warn(`[自动点击] 选择器 ${selector} 查找失败:`, error);
            }
          }
          
          return found;
        }
        
        // 带重试的自动点击函数
        function autoClickWithRetry() {
          let attempts = 0;
          const maxAttempts = 10;
          const retryInterval = 2000; // 2秒重试一次
          
          function tryClick() {
            attempts++;
            console.log(`[自动点击] 第 ${attempts} 次尝试点击实时监控...`);
            
            const success = clickRealtimeMonitor();
            
            if (success) {
              console.log('[自动点击] 实时监控菜单点击成功！');
              return;
            }
            
            if (attempts < maxAttempts) {
              console.log(`[自动点击] 第 ${attempts} 次尝试失败，${retryInterval/1000}秒后重试...`);
              setTimeout(tryClick, retryInterval);
            } else {
              console.warn('[自动点击] 达到最大重试次数，停止尝试');
            }
          }
          
          // 开始第一次尝试
          tryClick();
        }
        
        // 监听页面加载完成
        window.addEventListener('load', () => {
          console.log('[自动点击] 页面加载完成，3秒后开始自动点击实时监控...');
          setTimeout(autoClickWithRetry, 3000);
        });
        
        // 监听DOM内容加载完成
        window.addEventListener('DOMContentLoaded', () => {
          console.log('[自动点击] DOM加载完成，5秒后开始自动点击实时监控...');
          setTimeout(autoClickWithRetry, 5000);
        });
        
        // 兜底方案：定时检查iframe是否已加载实时监控页面
        let checkCount = 0;
        const checkInterval = setInterval(() => {
          checkCount++;
          
          // 检查是否已经有实时监控的iframe
          const iframe = document.querySelector('iframe.J_iframe');
          if (iframe && iframe.src && iframe.src.includes('EnterpriseRealtimeData')) {
            console.log('[自动点击] 检测到实时监控iframe已加载，停止检查');
            clearInterval(checkInterval);
            return;
          }
          
          // 如果超过30次检查（约1分钟）还没有加载，尝试再次点击
          if (checkCount >= 30) {
            console.log('[自动点击] 长时间未检测到实时监控iframe，尝试再次点击...');
            autoClickWithRetry();
            checkCount = 0; // 重置计数
          }
        }, 2000);
        
        // 5分钟后停止检查
        setTimeout(() => {
          clearInterval(checkInterval);
          console.log('[自动点击] 停止iframe检查');
        }, 300000);
      });

      console.log('[网页爬取服务] 浏览器启动成功');
    } catch (error) {
      console.error('[网页爬取服务] 启动浏览器失败:', error);
      throw error;
    }
  }

  /**
   * 自动登录
   */
  async login() {
    try {
      console.log('[网页爬取服务] 开始自动登录...');
      
      if (!this.config.loginUrl && !this.config.username) {
        console.log('[网页爬取服务] 未配置登录信息，跳过登录');
        this.isLoggedIn = true;
        return true;
      }

      // 新增：如果配置了跳过登录选项
      if (this.config.skipLogin) {
        console.log('[网页爬取服务] 配置为跳过登录，直接标记为已登录');
        this.isLoggedIn = true;
        return true;
      }
      
      // 只用loginUrl，不做自动推断
      const loginUrl = this.config.loginUrl;
      if (!loginUrl) throw new Error('未配置登录页面URL');
      
      // 导航到登录页面
      await this.page.goto(loginUrl, { 
        waitUntil: 'networkidle2',
        timeout: this.config.timeout 
      });
      
      console.log('[网页爬取服务] 已导航到登录页面');
      
      // 增强：先检测页面结构
      const pageInfo = await this.detectPageStructure();
      console.log('[网页爬取服务] 页面结构检测结果:', pageInfo);
      
      // 如果检测到滑块验证，提示用户
      if (pageInfo.hasSliderCaptcha) {
        console.warn('[网页爬取服务] 检测到滑块验证，建议使用非无头模式或跳过登录');
        if (this.config.headless) {
          throw new Error('检测到滑块验证，无头模式下无法处理，请设置 headless: false 或 skipLogin: true');
        }
      }
      
      // 尝试等待登录表单加载，使用更灵活的选择器
      let usernameSelector = this.config.selectors.usernameField;
      let passwordSelector = this.config.selectors.passwordField;
      let loginButtonSelector = this.config.selectors.loginButton;
      
      // 如果默认选择器不存在，尝试常见的选择器
      try {
        await this.page.waitForSelector(usernameSelector, { timeout: 5000 });
      } catch (error) {
        console.log('[网页爬取服务] 默认用户名选择器不存在，尝试常见选择器...');
        const commonSelectors = [
          'input[name="username"]', 'input[name="user"]', 'input[name="account"]',
          'input[type="text"]', 'input[placeholder*="用户"]', 'input[placeholder*="账号"]',
          '#user', '#account', '.username', '.user-input'
        ];
        
        for (const selector of commonSelectors) {
          try {
            await this.page.waitForSelector(selector, { timeout: 2000 });
            usernameSelector = selector;
            console.log(`[网页爬取服务] 找到用户名输入框: ${selector}`);
            break;
          } catch (e) {
            continue;
          }
        }
      }
      
      // 填写用户名
      await this.page.type(usernameSelector, this.config.username);
      console.log('[网页爬取服务] 已填写用户名');
      
      // 类似地处理密码输入框
      try {
        await this.page.waitForSelector(passwordSelector, { timeout: 5000 });
      } catch (error) {
        console.log('[网页爬取服务] 默认密码选择器不存在，尝试常见选择器...');
        const commonSelectors = [
          'input[name="password"]', 'input[name="pwd"]', 'input[type="password"]',
          'input[placeholder*="密码"]', '#pwd', '#pass', '.password', '.pwd-input'
        ];
        
        for (const selector of commonSelectors) {
          try {
            await this.page.waitForSelector(selector, { timeout: 2000 });
            passwordSelector = selector;
            console.log(`[网页爬取服务] 找到密码输入框: ${selector}`);
            break;
          } catch (e) {
            continue;
          }
        }
      }
      
      // 填写密码
      await this.page.type(passwordSelector, this.config.password);
      console.log('[网页爬取服务] 已填写密码');
      
      // 处理验证码（如果存在）
      if (this.config.selectors.captchaImage || pageInfo.hasCaptcha) {
        await this.handleCaptcha();
      }
      
      // 如果检测到滑块，给用户时间手动处理
      if (pageInfo.hasSliderCaptcha && !this.config.headless) {
        console.log('[网页爬取服务] 检测到滑块验证，请手动完成滑块验证...');
        await this.waitForTimeout(15000); // 等待15秒供用户操作
      }
      
      // 查找登录按钮
      try {
        await this.page.waitForSelector(loginButtonSelector, { timeout: 5000 });
      } catch (error) {
        console.log('[网页爬取服务] 默认登录按钮选择器不存在，尝试常见选择器...');
        const commonSelectors = [
          'button[type="submit"]', 'input[type="submit"]', 'button:contains("登录")',
          'button:contains("登陆")', 'button:contains("Login")', '.login-btn', '.submit-btn',
          '#submit', '#login', '.btn-login'
        ];
        
        for (const selector of commonSelectors) {
          try {
            await this.page.waitForSelector(selector, { timeout: 2000 });
            loginButtonSelector = selector;
            console.log(`[网页爬取服务] 找到登录按钮: ${selector}`);
            break;
          } catch (e) {
            continue;
          }
        }
      }
      
      // 点击登录按钮
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: this.config.timeout }),
        this.page.click(loginButtonSelector)
      ]);
      
      console.log('[网页爬取服务] 已点击登录按钮');
      
      // 验证登录是否成功
      await this.waitForTimeout(3000);
      const currentUrl = this.page.url();
      
      // 简单的登录成功判断（可根据实际情况调整）
      if (currentUrl !== loginUrl && !currentUrl.includes('login')) {
        this.isLoggedIn = true;
        console.log('[网页爬取服务] 登录成功');
        return true;
      } else {
        throw new Error('登录失败，可能是用户名密码错误或需要验证码');
      }
      
    } catch (error) {
      console.error('[网页爬取服务] 登录失败:', error);
      this.isLoggedIn = false;
      
      // 如果登录失败，提供跳过登录的建议
      if (error.message.includes('Waiting for selector') || error.message.includes('滑块')) {
        console.log('[网页爬取服务] 建议：可以尝试设置 skipLogin: true 直接爬取数据页面');
      }
      
      throw error;
    }
  }

  /**
   * 处理验证码（简单实现，可扩展）
   */
  async handleCaptcha() {
    try {
      console.log('[网页爬取服务] 检测到验证码，尝试处理...');
      
      // 这里可以实现验证码识别逻辑
      // 目前只是等待用户手动输入（如果是非headless模式）
      if (!this.config.headless) {
        console.log('[网页爬取服务] 请手动输入验证码...');
        await this.waitForTimeout(30000); // 等待30秒供用户输入
      } else {
        console.warn('[网页爬取服务] 无头模式下无法处理验证码');
      }
      
    } catch (error) {
      console.error('[网页爬取服务] 处理验证码失败:', error);
    }
  }

  /**
   * 导航到数据页面
   */
  async navigateToDataPage() {
    try {
      if (this.page.url() !== this.config.url) {
        console.log('[网页爬取服务] 导航到数据页面...');
        await this.page.goto(this.config.url, {
          waitUntil: 'networkidle2',
          timeout: this.config.timeout
        });
      }
      
      // 等待数据表格加载
      await this.page.waitForSelector(this.config.selectors.dataTable, {
        timeout: this.config.timeout
      });
      
      console.log('[网页爬取服务] 数据页面加载完成');
      return true;
    } catch (error) {
      console.error('[网页爬取服务] 导航到数据页面失败:', error);
      throw error;
    }
  }

  /**
   * 直接爬取数据（无需登录）
   */
  async scrapeDataDirectly() {
    try {
      console.log('[网页爬取服务] 开始直接爬取数据（跳过登录）...');
      
      // 直接导航到数据页面
      await this.page.goto(this.config.url, {
        waitUntil: 'networkidle2',
        timeout: this.config.timeout
      });
      
      console.log('[网页爬取服务] 已导航到数据页面');
      
      // 等待页面加载
      await this.waitForTimeout(3000);
      
      // 检测页面结构
      const pageInfo = await this.detectPageStructure();
      console.log('[网页爬取服务] 页面结构检测:', pageInfo);
      
      // 尝试查找数据表格
      let dataTableSelector = this.config.selectors.dataTable;
      
      try {
        await this.page.waitForSelector(dataTableSelector, { timeout: 10000 });
      } catch (error) {
        console.log('[网页爬取服务] 默认数据表格选择器不存在，尝试常见选择器...');
        const commonTableSelectors = [
          'table', '.table', '.data-table', '.result-table',
          '[class*="table"]', '[id*="table"]', '.grid', '.data-grid'
        ];
        
        for (const selector of commonTableSelectors) {
          try {
            await this.page.waitForSelector(selector, { timeout: 3000 });
            dataTableSelector = selector;
            console.log(`[网页爬取服务] 找到数据表格: ${selector}`);
            break;
          } catch (e) {
            continue;
          }
        }
      }
      
      // 提取数据
      const data = await this.extractDataFromPage(dataTableSelector);
      
      console.log('[网页爬取服务] 直接爬取到数据:', Object.keys(data).length, '个参数');
      
      // 保存数据到数据库
      if (Object.keys(data).length > 0) {
        await this.saveDataToDatabase(data);
      }
      
      return data;
    } catch (error) {
      console.error('[网页爬取服务] 直接爬取数据失败:', error);
      throw error;
    }
  }

  /**
   * 从页面提取数据的通用方法
   */
  async extractDataFromPage(tableSelector) {
    try {
      console.log('[网页爬取服务] 开始提取数据...');
      
      // 首先检查当前页面状态
      const currentUrl = this.page.url();
      console.log('[网页爬取服务] 当前页面URL:', currentUrl);
      
      // 等待页面基本加载完成
      await this.waitForTimeout(3000);
      
      // 检查是否已经有实时监控iframe
      let hasRealtimeIframe = false;
      try {
        const iframe = await this.page.$('iframe.J_iframe');
        if (iframe) {
          const src = await iframe.evaluate(el => el.src);
          console.log('[网页爬取服务] 找到iframe，src:', src);
          hasRealtimeIframe = src && (
            src.includes('EnterpriseRealtimeData') ||
            src.includes('EnterPriseRealTimeData') ||
            src.includes('enterpriserealtimedata') ||
            src.toLowerCase().includes('realtimedata')
          );
        }
      } catch (error) {
        console.log('[网页爬取服务] 检查iframe失败:', error.message);
      }
      
      // 如果没有实时监控iframe，主动触发点击
      if (!hasRealtimeIframe) {
        console.log('[网页爬取服务] 未找到实时监控iframe，尝试主动点击菜单...');
        
        // 先输出页面上所有可能的菜单元素用于调试
        const menuDebugInfo = await this.page.evaluate(() => {
          const allLinks = document.querySelectorAll('a, li, span, div');
          const menuItems = [];
          
          allLinks.forEach((element, index) => {
            const text = (element.textContent || element.innerText || '').trim();
            const href = element.href || '';
            const onclick = element.getAttribute('onclick') || '';
            const className = element.className || '';
            const id = element.id || '';
            
            if (text.includes('实时') || text.includes('监控') || text.includes('数据') ||
                href.includes('EnterpriseRealtimeData') || onclick.includes('实时') ||
                onclick.includes('监控') || onclick.includes('EnterpriseRealtimeData')) {
              menuItems.push({
                index,
                tagName: element.tagName,
                text: text.substring(0, 50),
                href,
                onclick: onclick.substring(0, 100),
                className,
                id
              });
            }
          });
          
          return menuItems;
        });
        
        console.log('[网页爬取服务] 找到的可能菜单项:', menuDebugInfo);
        
        const clickSuccess = await this.page.evaluate(() => {
          console.log('[主动点击] 开始查找实时监控菜单...');
          
          // 扩展的选择器列表
          const selectors = [
            'a[href*="EnterpriseRealtimeData"]',
            'a[href*="EnterPriseRealTimeData"]',
            '*[onclick*="EnterpriseRealtimeData"]',
            '*[onclick*="EnterPriseRealTimeData"]',
            'a[onclick*="实时监控"]',
            'li[onclick*="实时监控"]',
            '#top-menu ul li a',
            '#top-menu li a', 
            '#side-menu li a',
            '.nav li a',
            '.menu li a',
            'a[href*="实时监控"]',
            'a:contains("实时监控")',
            'li:contains("实时监控")',
            'span:contains("实时监控")'
          ];
          
          let found = false;
          
          // 首先尝试最直接的方法
          const directElements = document.querySelectorAll('*');
          for (const element of directElements) {
            const text = (element.textContent || element.innerText || '').trim();
            const href = element.href || '';
            const onclick = element.getAttribute('onclick') || '';
            
            if ((text === '实时监控' || text === '实时数据') ||
                href.includes('EnterpriseRealtimeData') ||
                href.includes('EnterPriseRealTimeData') ||
                href.includes('enterpriserealtimedata') ||
                href.toLowerCase().includes('realtimedata') ||
                onclick.includes('EnterpriseRealtimeData') ||
                onclick.includes('EnterPriseRealTimeData')) {
              
              console.log(`[主动点击] 找到直接匹配元素: "${text}", href="${href}", onclick="${onclick}"`);
              
              try {
                element.click();
                console.log('[主动点击] 直接点击成功');
                found = true;
                break;
              } catch (clickError) {
                console.warn('[主动点击] 直接点击失败:', clickError);
                
                try {
                  if (onclick) {
                    eval(onclick);
                    console.log('[主动点击] onclick执行成功');
                    found = true;
                    break;
                  }
                } catch (evalError) {
                  console.warn('[主动点击] onclick执行失败:', evalError);
                }
              }
            }
          }
          
          if (!found) {
            // 如果直接方法失败，尝试选择器方法
            for (const selector of selectors) {
              try {
                const elements = document.querySelectorAll(selector);
                console.log(`[主动点击] 检查选择器 ${selector}，找到 ${elements.length} 个元素`);
                
                for (const element of elements) {
                  const text = (element.textContent || element.innerText || '').trim();
                  const href = element.href || '';
                  const onclick = element.getAttribute('onclick') || '';
                  
                  console.log(`[主动点击] 检查元素: 文本="${text}", href="${href}", onclick="${onclick}"`);
                  
                  // 检查是否包含实时监控相关内容
                  if (text.includes('实时监控') || 
                      text.includes('实时数据') || 
                      text.includes('RealTime') ||
                      href.includes('EnterpriseRealtimeData') ||
                      href.includes('EnterPriseRealTimeData') ||
                      href.includes('enterpriserealtimedata') ||
                      href.toLowerCase().includes('realtimedata') ||
                      onclick.includes('EnterpriseRealtimeData') ||
                      onclick.includes('EnterPriseRealTimeData')) {
                    
                    console.log(`[主动点击] 找到实时监控菜单: "${text}"`);
                    
                    try {
                      element.click();
                      console.log('[主动点击] 普通点击成功');
                      found = true;
                      break;
                    } catch (clickError) {
                      console.warn('[主动点击] 普通点击失败，尝试事件触发:', clickError);
                      
                      try {
                        const event = new MouseEvent('click', {
                          view: window,
                          bubbles: true,
                          cancelable: true
                        });
                        element.dispatchEvent(event);
                        console.log('[主动点击] 事件触发成功');
                        found = true;
                        break;
                      } catch (eventError) {
                        console.warn('[主动点击] 事件触发失败:', eventError);
                        
                        try {
                          if (onclick) {
                            eval(onclick);
                            console.log('[主动点击] onclick执行成功');
                            found = true;
                            break;
                          }
                        } catch (evalError) {
                          console.warn('[主动点击] onclick执行失败:', evalError);
                        }
                      }
                    }
                  }
                }
                
                if (found) break;
              } catch (error) {
                console.warn(`[主动点击] 选择器 ${selector} 处理失败:`, error);
              }
            }
          }
          
          return found;
        });
        
        if (clickSuccess) {
          console.log('[网页爬取服务] 主动点击成功，等待iframe加载...');
          // 等待iframe加载，并验证点击是否真正生效
          await this.waitForTimeout(3000);
          
          // 验证点击是否生效
          const iframeAfterClick = await this.page.evaluate(() => {
            const iframe = document.querySelector('iframe.J_iframe');
            return iframe ? iframe.src : null;
          });
          
          console.log('[网页爬取服务] 点击后iframe状态:', iframeAfterClick);
          
          // 如果iframe还没有变化，尝试其他点击方式
          if (iframeAfterClick && !iframeAfterClick.toLowerCase().includes('realtimedata')) {
            console.log('[网页爬取服务] iframe未变化，尝试其他点击方式...');
            
            // 尝试直接导航到实时监控页面
            const directUrl = 'http://219.146.185.5:8006/Web6/MonitorControl/Enterprise/EnterPriseRealTimeData.aspx';
            console.log('[网页爬取服务] 尝试直接导航到:', directUrl);
            
            try {
              await this.page.evaluate((url) => {
                const iframe = document.querySelector('iframe.J_iframe');
                if (iframe) {
                  iframe.src = url;
                  console.log('[直接导航] 已设置iframe src为:', url);
                }
              }, directUrl);
              
              await this.waitForTimeout(5000); // 等待页面加载
            } catch (error) {
              console.warn('[网页爬取服务] 直接导航失败:', error.message);
            }
          }
          
          await this.waitForTimeout(5000); // 额外等待时间
        } else {
          console.warn('[网页爬取服务] 主动点击失败，尝试继续处理...');
          
          // 如果点击失败，输出页面HTML用于调试
          const pageContent = await this.page.content();
          console.log('[网页爬取服务] 页面HTML（前3000字符）:', pageContent.substring(0, 3000));
          
          // 尝试直接设置iframe src
          console.log('[网页爬取服务] 尝试直接设置iframe src...');
          const directUrl = 'http://219.146.185.5:8006/Web6/MonitorControl/Enterprise/EnterPriseRealTimeData.aspx';
          
          try {
            await this.page.evaluate((url) => {
              const iframe = document.querySelector('iframe.J_iframe');
              if (iframe) {
                iframe.src = url;
                console.log('[直接设置] 已设置iframe src为:', url);
              }
            }, directUrl);
            
            await this.waitForTimeout(8000); // 等待页面加载
          } catch (error) {
            console.warn('[网页爬取服务] 直接设置iframe失败:', error.message);
          }
        }
      }
      
      // 再次检查iframe
      console.log('[网页爬取服务] 检查iframe加载状态...');
      
      // 等待iframe元素出现
      try {
        await this.page.waitForSelector('iframe.J_iframe', { timeout: 15000 });
        console.log('[网页爬取服务] 找到iframe元素');
      } catch (error) {
        console.error('[网页爬取服务] 未找到iframe元素:', error.message);
        
        // 输出当前页面信息用于调试
        const pageContent = await this.page.content();
        console.log('[网页爬取服务] 当前页面标题:', await this.page.title());
        console.log('[网页爬取服务] 页面中的iframe数量:', (pageContent.match(/<iframe/g) || []).length);
        
        // 尝试查找所有iframe
        const allIframes = await this.page.$$eval('iframe', iframes => 
          iframes.map(iframe => ({
            src: iframe.src,
            id: iframe.id,
            className: iframe.className
          }))
        );
        console.log('[网页爬取服务] 所有iframe:', allIframes);
        
        throw new Error('未找到iframe元素，可能实时监控菜单点击失败');
      }
      
      // 等待实时监控iframe加载
      console.log('[网页爬取服务] 等待实时监控iframe加载...');
      
      // 添加详细的iframe状态监控
      let checkCount = 0;
      const maxChecks = 45; // 45秒，每秒检查一次
      
      const waitResult = await Promise.race([
        this.page.waitForFunction(() => {
          const iframe = document.querySelector('iframe.J_iframe');
          const result = iframe && iframe.src && (
            iframe.src.includes('EnterpriseRealtimeData') || 
            iframe.src.includes('EnterPriseRealTimeData') ||
            iframe.src.includes('enterpriserealtimedata') ||
            iframe.src.toLowerCase().includes('realtimedata')
          );
          if (result) {
            console.log('[等待检查] 实时监控iframe已加载:', iframe.src);
          } else {
            console.log('[等待检查] iframe状态:', iframe ? iframe.src : '无iframe');
          }
          return result;
        }, { timeout: 45000 }),
        
        // 并行监控iframe变化
        (async () => {
          while (checkCount < maxChecks) {
            try {
              const currentIframeSrc = await this.page.evaluate(() => {
                const iframe = document.querySelector('iframe.J_iframe');
                return iframe ? iframe.src : null;
              });
              
              console.log(`[iframe监控] 第${checkCount + 1}次检查，当前iframe src:`, currentIframeSrc);
              
              if (currentIframeSrc && (
                currentIframeSrc.includes('EnterpriseRealtimeData') || 
                currentIframeSrc.includes('EnterPriseRealTimeData') ||
                currentIframeSrc.includes('enterpriserealtimedata') ||
                currentIframeSrc.toLowerCase().includes('realtimedata')
              )) {
                console.log('[iframe监控] 检测到实时监控iframe已加载！');
                return true;
              }
              
              checkCount++;
              await this.waitForTimeout(1000); // 每秒检查一次
            } catch (error) {
              console.warn('[iframe监控] 检查失败:', error.message);
              checkCount++;
              await this.waitForTimeout(1000);
            }
          }
          return false;
        })()
      ]);
      
      if (!waitResult) {
        // 输出调试信息
        const iframes = await this.page.$$eval('iframe', iframes => 
          iframes.map(iframe => ({
            src: iframe.src,
            id: iframe.id,
            className: iframe.className
          }))
        );
        console.log('[网页爬取服务] 当前页面所有iframe:', iframes);
        
        throw new Error('等待实时监控iframe超时，可能菜单点击未生效');
      }

      // 获取所有frame
      const frames = await this.page.frames();
      console.log('[网页爬取服务] 页面frame数量:', frames.length);
      
      // 找到实时监控的frame
      const targetFrame = frames.find(frame => {
        const url = frame.url();
        console.log('[网页爬取服务] 检查frame URL:', url);
        return url.includes('EnterpriseRealtimeData') || 
               url.includes('EnterPriseRealTimeData') ||
               url.includes('enterpriserealtimedata') ||
               url.toLowerCase().includes('realtimedata');
      });

      if (!targetFrame) {
        const frameUrls = frames.map(frame => frame.url());
        console.log('[网页爬取服务] 所有frame URLs:', frameUrls);
        throw new Error('未找到实时监控iframe');
      }

      console.log('[网页爬取服务] 找到实时监控iframe，URL:', targetFrame.url());
      
      // 等待iframe内容加载
      await this.waitForTimeout(5000);
      
      // 等待数据容器加载，使用更灵活的选择器
      const dataSelectors = [
        'div.Infos',
        '.Infos', 
        '.shuju',
        '.content',
        'ul.shuju1',
        'li'
      ];
      
      let dataContainer = null;
      for (const selector of dataSelectors) {
        try {
          await targetFrame.waitForSelector(selector, { timeout: 10000 });
          dataContainer = selector;
          console.log(`[网页爬取服务] 找到数据容器: ${selector}`);
          break;
        } catch (error) {
          console.log(`[网页爬取服务] 选择器 ${selector} 未找到，尝试下一个...`);
        }
      }
      
      if (!dataContainer) {
        // 输出iframe内容用于调试
        const iframeContent = await targetFrame.content();
        console.log('[网页爬取服务] iframe内容（前2000字符）:', iframeContent.substring(0, 2000));
        throw new Error('未找到数据容器');
      }
      
      // 提取数据
      const data = await targetFrame.evaluate(() => {
        const extractedData = {};
        const timestamp = new Date().toISOString();
        
        // 查找所有包含数据的元素
        const dataElements = document.querySelectorAll('.Infos, .shuju li, ul.shuju1 li');
        
        console.log(`[数据提取] 找到 ${dataElements.length} 个数据元素`);
        
        dataElements.forEach((element, index) => {
          try {
            // 获取参数名称
            let paramName = '';
            let paramValue = '';
            let paramUnit = '';
            
            // 方法1：从.Infos元素中提取
            const infosDiv = element.querySelector('.Infos');
            if (infosDiv) {
              const text = infosDiv.textContent || infosDiv.innerText || '';
              console.log(`[数据提取] Infos文本: ${text}`);
              
              // 提取参数名和单位，格式如：氨氮(mg/l)
              const match = text.match(/^([^(]+)\(([^)]+)\)/);
              if (match) {
                paramName = match[1].trim();
                paramUnit = match[2].trim();
              } else {
                paramName = text.trim();
              }
            }
            
            // 方法2：直接从元素文本中提取
            if (!paramName) {
              const fullText = element.textContent || element.innerText || '';
              const lines = fullText.split('\n').map(line => line.trim()).filter(line => line);
              
              for (const line of lines) {
                if (line.includes('(') && line.includes(')')) {
                  const match = line.match(/^([^(]+)\(([^)]+)\)/);
                  if (match) {
                    paramName = match[1].trim();
                    paramUnit = match[2].trim();
                    break;
                  }
                }
              }
            }
            
            // 提取数值
            const valueElements = element.querySelectorAll('.span2, .span1, span');
            valueElements.forEach(span => {
              const spanText = (span.textContent || span.innerText || '').trim();
              // 检查是否为数值（包含小数点、百分号等）
              if (/^[\d.,%]+$/.test(spanText) && spanText !== '') {
                if (!paramValue || spanText.length > paramValue.length) {
                  paramValue = spanText;
                }
              }
            });
            
            // 如果没有找到span中的值，尝试从整个元素文本中提取数值
            if (!paramValue) {
              const fullText = element.textContent || element.innerText || '';
              const numbers = fullText.match(/[\d.]+/g);
              if (numbers && numbers.length > 0) {
                // 选择最大的数值作为参数值
                paramValue = numbers.reduce((max, current) => 
                  parseFloat(current) > parseFloat(max) ? current : max
                );
              }
            }
            
            // 保存数据
            if (paramName && paramValue) {
              const key = paramName.replace(/[^\w\u4e00-\u9fa5]/g, '_'); // 清理键名
              extractedData[key] = {
                originalName: paramName,
                value: parseFloat(paramValue.replace(/[%,]/g, '')) || paramValue,
                unit: paramUnit,
                timestamp: timestamp,
                rawText: element.textContent || element.innerText || ''
              };
              
              console.log(`[数据提取] 提取到数据: ${paramName} = ${paramValue} ${paramUnit}`);
            }
          } catch (error) {
            console.warn(`[数据提取] 处理第${index}个元素时出错:`, error);
          }
        });
        
        // 如果没有提取到数据，尝试更通用的方法
        if (Object.keys(extractedData).length === 0) {
          console.log('[数据提取] 使用通用方法重新提取...');
          
          // 查找所有可能包含数据的文本
          const allText = document.body.textContent || document.body.innerText || '';
          const lines = allText.split('\n').map(line => line.trim()).filter(line => line);
          
          lines.forEach(line => {
            // 匹配格式：参数名(单位) 数值
            const match = line.match(/([^(]+)\(([^)]+)\)\s*([\d.,%]+)/);
            if (match) {
              const paramName = match[1].trim();
              const paramUnit = match[2].trim();
              const paramValue = match[3].trim();
              
              const key = paramName.replace(/[^\w\u4e00-\u9fa5]/g, '_');
              extractedData[key] = {
                originalName: paramName,
                value: parseFloat(paramValue.replace(/[%,]/g, '')) || paramValue,
                unit: paramUnit,
                timestamp: timestamp,
                rawText: line
              };
              
              console.log(`[数据提取] 通用方法提取到: ${paramName} = ${paramValue} ${paramUnit}`);
            }
          });
        }
        
        console.log(`[数据提取] 总共提取到 ${Object.keys(extractedData).length} 个参数`);
        return extractedData;
      });

      if (!data || Object.keys(data).length === 0) {
        // 如果还是没有数据，输出iframe内容用于调试
        const iframeContent = await targetFrame.content();
        console.log('[网页爬取服务] iframe完整内容:', iframeContent);
        throw new Error('未找到数据内容');
      }

      console.log('[网页爬取服务] 数据提取成功，提取到参数:', Object.keys(data));
      return data;
    } catch (error) {
      console.error('[网页爬取服务] 提取数据失败:', error);
      throw error;
    }
  }

  /**
   * 爬取水质数据
   */
  async scrapeWaterQualityData() {
    try {
      console.log('[网页爬取服务] 开始爬取水质数据...');
      
      // 如果配置为跳过登录，直接爬取数据
      if (this.config.skipLogin) {
        return await this.scrapeDataDirectly();
      }
      
      // 确保在正确的页面
      await this.navigateToDataPage();
      
      // 等待数据加载
      await this.waitForTimeout(2000);
      
      // 使用通用的数据提取方法
      const data = await this.extractDataFromPage(this.config.selectors.dataTable);
      
      console.log('[网页爬取服务] 爬取到数据:', Object.keys(data).length, '个参数');
      console.log('[网页爬取服务] 数据详情:', data);
      
      // 保存数据到数据库
      if (Object.keys(data).length > 0) {
        await this.saveDataToDatabase(data);
      }
      
      return data;
    } catch (error) {
      console.error('[网页爬取服务] 爬取数据失败:', error);
      throw error;
    }
  }

  /**
   * 保存数据到数据库
   */
  async saveDataToDatabase(data) {
    try {
      if (!this.dbManager) {
        console.warn('[网页爬取服务] 数据库管理器未初始化，跳过数据保存');
        return;
      }
      
      console.log('[网页爬取服务] 保存数据到数据库...');
      
      // 🔧 修复重复插入问题：只使用一种保存方式
      // 优先尝试通过API保存，如果失败则使用直接保存
      try {
        await this.writeDataThroughAPI(data);
        console.log('[网页爬取服务] ✅ 通过API保存数据成功，跳过直接保存');
      } catch (apiError) {
        console.warn('[网页爬取服务] ⚠️ API保存失败，使用直接保存作为备用:', apiError.message);
        await this.saveDataDirectlyToDatabase(data);
      }
      
    } catch (error) {
      console.error('[网页爬取服务] 保存数据失败:', error);
      throw error;
    }
  }

  /**
   * 🚀 新增：通过数据写入API将爬取的数据写入到前端和数据库
   * @param {Object} data - 爬取的数据
   */
  async writeDataThroughAPI(data) {
    try {
      console.log('[网页爬取服务] 🚀 开始通过数据写入API处理爬取的数据...');
      
      // 🎯 智能数据映射：根据配置的映射表转换参数名
      const mappedData = this.applyDataMapping(data);
      
      // 准备API请求数据，使用水质数据格式
      const apiRequestData = {
        action_type: 'update',
        target_object: 'water_quality', // 使用水质数据目标对象
        details: {}
      };
      
      // 将映射后的数据转换为API格式
      for (const [mappedName, dataInfo] of Object.entries(mappedData)) {
        const paramValue = dataInfo.value;
        
        console.log(`[网页爬取服务] 处理映射后的参数: ${mappedName} = ${paramValue} (原始: ${dataInfo.originalName})`);
        
        // 使用映射后的参数名作为键
        apiRequestData.details[mappedName] = paramValue;
      }
      
      console.log('[网页爬取服务] 准备发送到API的数据:', apiRequestData);
      
      // 调用数据写入API
      const axios = require('axios');
      const apiUrl = 'http://localhost:3000/api/data-write';
      
      const response = await axios.post(apiUrl, {
        data: JSON.stringify(apiRequestData)
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });
      
      if (response.data.success) {
        console.log('[网页爬取服务] ✅ 数据写入API调用成功');
        console.log('[网页爬取服务] API响应摘要:', {
          成功数量: response.data.summary?.successful || 0,
          失败数量: response.data.summary?.failed || 0,
          总数量: response.data.summary?.total || 0
        });
        
        // 输出成功写入的数据点
        if (response.data.results && response.data.results.length > 0) {
          console.log('[网页爬取服务] 成功写入的数据点:');
          response.data.results.forEach(result => {
            console.log(`  - ${result.parameter}: ${result.value} -> ${result.dataPoint.name} (${result.dataPoint.identifier})`);
          });
        }
        
        // 输出失败的数据点
        if (response.data.errors && response.data.errors.length > 0) {
          console.log('[网页爬取服务] 未能匹配的参数:');
          response.data.errors.forEach(error => {
            console.log(`  - ${error.parameter}: ${error.value} (${error.error})`);
            if (error.suggestions && error.suggestions.length > 0) {
              console.log(`    建议: ${error.suggestions.map(s => s.name).join(', ')}`);
            }
          });
        }
      } else {
        // API调用失败时抛出异常，让上层使用备用方法
        throw new Error(`数据写入API调用失败: ${response.data.message || '未知错误'}`);
      }
      
    } catch (error) {
      console.error('[网页爬取服务] ❌ 通过API写入数据失败:', error.message);
      // 重新抛出异常，让上层的saveDataToDatabase使用备用方法  
      throw error;
    }
  }

  /**
   * 🎯 应用数据映射：将爬取的参数名映射到系统数据点标识符
   * @param {Object} data - 原始爬取的数据
   * @returns {Object} 映射后的数据
   */
  applyDataMapping(data) {
    const mappedData = {};
    const dataMapping = this.config.dataMapping || {};
    
    console.log('[网页爬取服务] 🎯 开始应用数据映射...');
    console.log('[网页爬取服务] 配置的映射表:', dataMapping);
    
    for (const [identifier, dataInfo] of Object.entries(data)) {
      const originalName = dataInfo.originalName || identifier;
      let mappedName = originalName;
      
      // 1. 精确匹配映射表
      if (dataMapping[originalName]) {
        mappedName = dataMapping[originalName];
        console.log(`[网页爬取服务] 精确映射: "${originalName}" -> "${mappedName}"`);
      }
      // 2. 模糊匹配映射表（包含关系）
      else {
        for (const [mapKey, mapValue] of Object.entries(dataMapping)) {
          if (originalName.includes(mapKey) || mapKey.includes(originalName)) {
            mappedName = mapValue;
            console.log(`[网页爬取服务] 模糊映射: "${originalName}" 包含 "${mapKey}" -> "${mappedName}"`);
            break;
          }
        }
      }
      
      // 3. 如果没有找到映射，使用原始名称
      if (mappedName === originalName) {
        console.log(`[网页爬取服务] 无映射: "${originalName}" 保持不变`);
      }
      
      // 保存映射后的数据，保留原始信息
      mappedData[mappedName] = {
        ...dataInfo,
        mappedName: mappedName,
        originalIdentifier: identifier
      };
    }
    
    console.log('[网页爬取服务] 映射完成，映射后的参数:', Object.keys(mappedData));
    return mappedData;
  }

  /**
   * 直接保存数据到数据库（备用方法）
   * @param {Object} data - 爬取的数据
   */
  async saveDataDirectlyToDatabase(data) {
    try {
      console.log('[网页爬取服务] 📝 开始直接保存数据到数据库（备用方法）...');
      
      // 准备数据点配置和值
      const dataPointsToSave = [];
      const valuesToSave = {};
      
      for (const [identifier, dataInfo] of Object.entries(data)) {
        // 创建数据点配置
        const dataPointId = `WEB_${identifier}`;
        const dataPoint = {
          id: dataPointId,
          identifier: dataPointId,
          name: dataInfo.originalName || identifier,
          format: 'FLOAT32',
          unit: dataInfo.unit || '',
          description: `网页爬取 - ${dataInfo.originalName || identifier}`,
          dataSource: 'WEB_SCRAPER'
        };
        
        dataPointsToSave.push(dataPoint);
        
        // 准备值对象 - 关键修复：使用dataPoint.identifier作为键
        valuesToSave[dataPointId] = {
          value: dataInfo.value,
          formattedValue: `${dataInfo.value}${dataInfo.unit ? ' ' + dataInfo.unit : ''}`,
          quality: 'GOOD',
          timestamp: dataInfo.timestamp,
          rawValue: { 
            value: dataInfo.value,
            originalName: dataInfo.originalName,
            unit: dataInfo.unit,
            source: 'web_scraper'
          }
        };
        
        console.log(`[网页爬取服务] 准备保存数据点: ${dataPointId}, 值: ${dataInfo.value}`);
      }
      
      console.log('[网页爬取服务] 数据点配置:', dataPointsToSave);
      console.log('[网页爬取服务] 值配置:', Object.keys(valuesToSave));
      
      // 保存到数据库
      const saveResult = await this.dbManager.storeLatestValues(dataPointsToSave, valuesToSave);
      
      if (saveResult.success) {
        console.log('[网页爬取服务] ✅ 数据直接保存到数据库成功');
        console.log(`[网页爬取服务] 保存结果: 插入${saveResult.insertedCount}条, 更新${saveResult.updatedCount}条`);
      } else {
        console.warn('[网页爬取服务] ⚠️ 数据直接保存到数据库失败:', saveResult.error);
      }
      
    } catch (error) {
      console.error('[网页爬取服务] ❌ 直接保存数据到数据库失败:', error);
    }
  }

  /**
   * 刷新页面保持会话
   */
  async refreshPage() {
    try {
      console.log('[网页爬取服务] 刷新页面保持会话...');
      
      if (!this.page) {
        console.warn('[网页爬取服务] 页面不存在，跳过刷新');
        return;
      }
      
      await this.page.reload({ waitUntil: 'networkidle2' });
      console.log('[网页爬取服务] 页面刷新完成');
      
      // 检查是否需要重新登录
      await this.waitForTimeout(2000);
      const currentUrl = this.page.url();
      
      if (currentUrl.includes('login') || currentUrl.includes('signin')) {
        console.log('[网页爬取服务] 检测到需要重新登录');
        this.isLoggedIn = false;
        await this.login();
      }
      
    } catch (error) {
      console.error('[网页爬取服务] 刷新页面失败:', error);
      
      // 如果刷新失败，尝试重新启动浏览器
      try {
        await this.restart();
      } catch (restartError) {
        console.error('[网页爬取服务] 重启失败:', restartError);
      }
    }
  }

  /**
   * 启动定时任务
   */
  async startScheduledTasks() {
    try {
      console.log('[网页爬取服务] 启动定时任务...');
      
      // 在调试模式下，启动登录状态检测定时器
      if (this.config.debugMode && !this.isLoggedIn) {
        this.loginCheckTimer = setInterval(async () => {
          try {
            const loginSuccess = await this.checkManualLoginStatus();
            if (loginSuccess) {
              console.log('[网页爬取服务] 检测到手动登录成功，停止登录检测定时器');
              if (this.loginCheckTimer) {
                clearInterval(this.loginCheckTimer);
                this.loginCheckTimer = null;
              }
            }
          } catch (error) {
            console.error('[网页爬取服务] 登录状态检测失败:', error);
          }
        }, 10000); // 每10秒检测一次登录状态
        
        console.log('[网页爬取服务] 登录状态检测定时器已启动（调试模式）');
      }
      
      // 启动页面刷新定时器
      if (this.config.refreshInterval > 0) {
        this.refreshTimer = setInterval(async () => {
          try {
            await this.refreshPage();
          } catch (error) {
            console.error('[网页爬取服务] 定时刷新失败:', error);
          }
        }, this.config.refreshInterval);
        
        console.log(`[网页爬取服务] 页面刷新定时器已启动，间隔: ${this.config.refreshInterval}ms`);
      }
      
      // 启动数据爬取定时器
      if (this.config.scrapeInterval > 0) {
        this.scrapeTimer = setInterval(async () => {
          try {
            // 在调试模式下，如果还未登录，跳过爬取
            if (this.config.debugMode && !this.isLoggedIn) {
              console.log('[网页爬取服务] 调试模式下未登录，跳过本次数据爬取');
              return;
            }
            
            await this.scrapeWaterQualityData();
          } catch (error) {
            console.error('[网页爬取服务] 定时爬取失败:', error);
          }
        }, this.config.scrapeInterval);
        
        console.log(`[网页爬取服务] 数据爬取定时器已启动，间隔: ${this.config.scrapeInterval}ms`);
      }
      
    } catch (error) {
      console.error('[网页爬取服务] 启动定时任务失败:', error);
      throw error;
    }
  }

  /**
   * 停止定时任务
   */
  stopScheduledTasks() {
    try {
      console.log('[网页爬取服务] 停止定时任务...');
      
      if (this.loginCheckTimer) {
        clearInterval(this.loginCheckTimer);
        this.loginCheckTimer = null;
        console.log('[网页爬取服务] 登录状态检测定时器已停止');
      }
      
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer);
        this.refreshTimer = null;
        console.log('[网页爬取服务] 页面刷新定时器已停止');
      }
      
      if (this.scrapeTimer) {
        clearInterval(this.scrapeTimer);
        this.scrapeTimer = null;
        console.log('[网页爬取服务] 数据爬取定时器已停止');
      }
      
    } catch (error) {
      console.error('[网页爬取服务] 停止定时任务失败:', error);
    }
  }

  /**
   * 重启服务
   */
  async restart() {
    try {
      console.log('[网页爬取服务] 重启服务...');
      
      // 停止定时任务
      this.stopScheduledTasks();
      
      // 关闭浏览器
      await this.closeBrowser();
      
      // 重新启动
      await this.startBrowser();
      
      if (this.config.username) {
        await this.login();
      }
      
      // 重新启动定时任务
      await this.startScheduledTasks();
      
      console.log('[网页爬取服务] 服务重启完成');
    } catch (error) {
      console.error('[网页爬取服务] 重启服务失败:', error);
      throw error;
    }
  }

  /**
   * 关闭浏览器
   */
  async closeBrowser() {
    try {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.page = null;
        this.isLoggedIn = false;
        console.log('[网页爬取服务] 浏览器已关闭');
      }
    } catch (error) {
      console.error('[网页爬取服务] 关闭浏览器失败:', error);
    }
  }

  /**
   * 停止服务
   */
  async stop() {
    try {
      console.log('[网页爬取服务] 停止服务...');
      
      // 停止定时任务
      this.stopScheduledTasks();
      
      // 关闭浏览器
      await this.closeBrowser();
      
      this.initialized = false;
      console.log('[网页爬取服务] 服务已停止');
    } catch (error) {
      console.error('[网页爬取服务] 停止服务失败:', error);
    }
  }

  /**
   * 获取服务状态
   */
  getStatus() {
    return {
      initialized: this.initialized,
      isLoggedIn: this.isLoggedIn,
      browserRunning: !!this.browser,
      pageLoaded: !!this.page,
      refreshTimerActive: !!this.refreshTimer,
      scrapeTimerActive: !!this.scrapeTimer,
      loginCheckTimerActive: !!this.loginCheckTimer, // 新增：登录检测定时器状态
      config: {
        url: this.config?.url,
        refreshInterval: this.config?.refreshInterval,
        scrapeInterval: this.config?.scrapeInterval,
        headless: this.config?.headless,
        debugMode: this.config?.debugMode // 新增：调试模式状态
      }
    };
  }

  /**
   * 手动执行一次数据爬取
   */
  async manualScrape() {
    try {
      console.log('[网页爬取服务] 手动执行数据爬取...');
      
      if (!this.initialized) {
        throw new Error('服务未初始化');
      }
      
      if (!this.isLoggedIn && this.config.username) {
        await this.login();
      }
      
      const data = await this.scrapeWaterQualityData();
      return {
        success: true,
        data: data,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('[网页爬取服务] 手动爬取失败:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig) {
    try {
      console.log('[网页爬取服务] 更新配置...');
      
      this.config = { ...this.config, ...newConfig };
      
      // 如果定时器间隔发生变化，重启定时任务
      if (newConfig.refreshInterval !== undefined || newConfig.scrapeInterval !== undefined) {
        this.stopScheduledTasks();
        this.startScheduledTasks();
      }
      
      console.log('[网页爬取服务] 配置更新完成');
      return this.config;
    } catch (error) {
      console.error('[网页爬取服务] 更新配置失败:', error);
      throw error;
    }
  }

  /**
   * 检测页面结构
   */
  async detectPageStructure() {
    try {
      const pageInfo = await this.page.evaluate(() => {
        const info = {
          title: document.title,
          url: window.location.href,
          hasSliderCaptcha: false,
          hasCaptcha: false,
          hasLoginForm: false,
          availableSelectors: []
        };
        
        // 检测滑块验证
        const sliderSelectors = [
          '.slider', '.slide-verify', '.captcha-slider', '.drag-slider',
          '[class*="slider"]', '[class*="slide"]', '[id*="slider"]'
        ];
        
        for (const selector of sliderSelectors) {
          if (document.querySelector(selector)) {
            info.hasSliderCaptcha = true;
            break;
          }
        }
        
        // 检测验证码
        const captchaSelectors = [
          'img[src*="captcha"]', 'img[src*="verify"]', '.captcha-img',
          '[class*="captcha"]', '[id*="captcha"]'
        ];
        
        for (const selector of captchaSelectors) {
          if (document.querySelector(selector)) {
            info.hasCaptcha = true;
            break;
          }
        }
        
        // 检测登录表单
        const loginSelectors = [
          'form', 'input[type="password"]', 'input[name="username"]',
          'input[name="password"]', '.login-form'
        ];
        
        for (const selector of loginSelectors) {
          if (document.querySelector(selector)) {
            info.hasLoginForm = true;
            info.availableSelectors.push(selector);
          }
        }
        
        return info;
      });
      
      return pageInfo;
    } catch (error) {
      console.error('[网页爬取服务] 页面结构检测失败:', error);
      return {
        hasSliderCaptcha: false,
        hasCaptcha: false,
        hasLoginForm: false,
        availableSelectors: []
      };
    }
  }

  /**
   * 检测是否已经手动登录成功
   */
  async checkManualLoginStatus() {
    try {
      if (!this.page) {
        return false;
      }
      
      const currentUrl = this.page.url();
      console.log('[登录检测] 当前页面URL:', currentUrl);
      
      // 如果当前页面不是登录页面，且能访问到数据页面，认为已登录
      if (!currentUrl.includes('login') && !currentUrl.includes('signin') && !currentUrl.includes('Login')) {
        // 尝试访问数据页面验证登录状态
        try {
          if (currentUrl !== this.config.url) {
            await this.page.goto(this.config.url, {
              waitUntil: 'networkidle2',
              timeout: this.config.timeout
            });
          }
          
          // 等待页面加载
          await this.waitForTimeout(3000);
          
          const finalUrl = this.page.url();
          if (!finalUrl.includes('login') && !finalUrl.includes('signin') && !finalUrl.includes('Login')) {
            console.log('[登录检测] 检测到已手动登录成功');
            this.isLoggedIn = true;
            return true;
          }
        } catch (error) {
          console.warn('[登录检测] 验证登录状态失败:', error.message);
        }
      }
      
      return false;
    } catch (error) {
      console.error('[登录检测] 检测登录状态失败:', error);
      return false;
    }
  }
}

// 单例模式
let instance = null;

module.exports = {
  getInstance: () => {
    if (!instance) {
      instance = new WebScraperService();
    }
    return instance;
  },
  WebScraperService
}; 
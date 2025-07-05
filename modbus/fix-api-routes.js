/**
 * Modbus API路由修复工具
 * 
 * 这个脚本用于解决API路由404错误问题，检查并修复路由注册
 */

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

console.log('========================================');
console.log('   Modbus API路由修复和测试工具');
console.log('========================================');

// 数据库配置
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '753456Chen*',
  database: 'mqtt_data',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0
};

// 创建Express应用
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 创建MySQL连接池并添加到应用中
async function setupDatabase() {
  try {
    console.log('创建MySQL连接池...');
    const pool = mysql.createPool(dbConfig).promise();
    
    // 测试连接
    const [rows] = await pool.query('SELECT 1 as test');
    if (rows[0].test === 1) {
      console.log('✓ 数据库连接成功');
    }
    
    // 添加到应用中
    app.locals.pool = pool;
    return true;
  } catch (error) {
    console.error('数据库连接失败:', error);
    return false;
  }
}

// 手动定义关键API路由
function setupDirectRoutes() {
  console.log('\n设置直接路由（绕过模块导入）...');
  const router = express.Router();
  
  // 最新值路由（旧）
  router.get('/values/latest', async (req, res) => {
    try {
      console.log('处理 GET /values/latest 请求');
      const pool = req.app.locals.pool;
      
      if (!pool) {
        return res.status(500).json({
          success: false,
          message: '数据库连接未初始化',
          code: 'DB_NOT_INITIALIZED'
        });
      }
      
      const [rows] = await pool.query('SELECT * FROM modbus_data_latest ORDER BY data_point_name');
      res.json({
        success: true,
        data: rows,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('处理 /values/latest 请求失败:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });
  
  // 最新值路由（新）
  router.get('/latest-values', async (req, res) => {
    try {
      console.log('处理 GET /latest-values 请求');
      const pool = req.app.locals.pool;
      
      if (!pool) {
        return res.status(500).json({
          success: false,
          message: '数据库连接未初始化',
          code: 'DB_NOT_INITIALIZED'
        });
      }
      
      const [rows] = await pool.query('SELECT * FROM modbus_data_latest ORDER BY data_point_name');
      res.json({
        success: true,
        data: rows,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('处理 /latest-values 请求失败:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });
  
  // 历史数据路由（旧）
  router.get('/values/history', async (req, res) => {
    try {
      console.log('处理 GET /values/history 请求');
      const { identifier, startTime, endTime, limit } = req.query;
      const limitValue = parseInt(limit || '100', 10);
      
      if (!identifier) {
        return res.status(400).json({
          success: false,
          message: '请提供数据点标识符'
        });
      }
      
      if (!startTime || !endTime) {
        return res.status(400).json({
          success: false,
          message: '请提供开始和结束时间'
        });
      }
      
      const pool = req.app.locals.pool;
      
      if (!pool) {
        return res.status(500).json({
          success: false,
          message: '数据库连接未初始化',
          code: 'DB_NOT_INITIALIZED'
        });
      }
      
      const query = `
        SELECT * FROM modbus_data_history 
        WHERE data_point_identifier = ? 
        AND timestamp BETWEEN ? AND ? 
        ORDER BY timestamp DESC 
        LIMIT ?
      `;
      
      const [rows] = await pool.query(query, [identifier, startTime, endTime, limitValue]);
      
      res.json({
        success: true,
        data: rows,
        count: rows.length,
        identifier: identifier,
        timeRange: {
          start: startTime,
          end: endTime
        }
      });
    } catch (error) {
      console.error('处理 /values/history 请求失败:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });
  
  // 历史数据路由（新）
  router.get('/history/:identifier', async (req, res) => {
    try {
      const { identifier } = req.params;
      const { startTime, endTime, limit } = req.query;
      const limitValue = parseInt(limit || '100', 10);
      
      console.log(`处理 GET /history/${identifier} 请求`);
      
      if (!startTime || !endTime) {
        return res.status(400).json({
          success: false,
          message: '请提供开始和结束时间'
        });
      }
      
      const pool = req.app.locals.pool;
      
      if (!pool) {
        return res.status(500).json({
          success: false,
          message: '数据库连接未初始化',
          code: 'DB_NOT_INITIALIZED'
        });
      }
      
      const query = `
        SELECT * FROM modbus_data_history 
        WHERE data_point_identifier = ? 
        AND timestamp BETWEEN ? AND ? 
        ORDER BY timestamp DESC 
        LIMIT ?
      `;
      
      const [rows] = await pool.query(query, [identifier, startTime, endTime, limitValue]);
      
      res.json({
        success: true,
        data: rows,
        count: rows.length,
        identifier: identifier
      });
    } catch (error) {
      console.error(`处理 /history/${req.params.identifier} 请求失败:`, error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });
  
  // 添加路由测试接口
  router.get('/test', (req, res) => {
    res.json({
      success: true,
      message: '路由测试成功',
      routes: [
        { path: '/values/latest', method: 'GET' },
        { path: '/latest-values', method: 'GET' },
        { path: '/values/history', method: 'GET' },
        { path: '/history/:identifier', method: 'GET' }
      ]
    });
  });
  
  // 挂载路由
  app.use('/api/modbus', router);
  console.log('✓ 直接路由设置完成');
}

// 测试路由
async function testRoutes() {
  console.log('\n测试API路由...');
  
  // 定义要测试的路由
  const routesToTest = [
    { path: '/api/modbus/test', description: '路由测试接口' },
    { path: '/api/modbus/values/latest', description: '获取最新值（旧路径）' },
    { path: '/api/modbus/latest-values', description: '获取最新值（新路径）' },
    { path: '/api/modbus/values/history?identifier=TEST_DP1&startTime=2023-01-01T00:00:00.000Z&endTime=2025-01-01T00:00:00.000Z', description: '获取历史数据（旧路径）' },
    { path: '/api/modbus/history/TEST_DP1?startTime=2023-01-01T00:00:00.000Z&endTime=2025-01-01T00:00:00.000Z', description: '获取历史数据（新路径）' }
  ];
  
  // 创建测试请求处理函数
  function requestHandler(req, res) {
    const url = req.url;
    console.log(`收到请求: ${req.method} ${url}`);
    
    // 分发到实际路由处理函数
    const match = app._router.match(req);
    
    if (match && match.route) {
      console.log(`✓ 路由匹配成功: ${match.route.path}`);
      
      // 调用实际的路由处理函数
      try {
        app._router.handle(req, res);
      } catch (error) {
        console.error(`处理请求失败: ${error.message}`);
        res.statusCode = 500;
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    } else {
      console.log(`✗ 路由匹配失败`);
      res.statusCode = 404;
      res.end(JSON.stringify({ success: false, error: 'Route not found' }));
    }
  }
  
  // 遍历测试路由
  for (const route of routesToTest) {
    const url = new URL(`http://localhost:3000${route.path}`);
    
    console.log(`\n测试路由: ${route.path} (${route.description})`);
    
    // 创建模拟请求
    const req = {
      method: 'GET',
      url: url.pathname + url.search,
      path: url.pathname,
      headers: {},
      query: Object.fromEntries(url.searchParams),
      params: {},
      app: app,
      baseUrl: '/api/modbus'
    };
    
    // 解析路径参数
    const segments = url.pathname.split('/');
    if (segments.length > 3 && segments[2] === 'history') {
      req.params.identifier = segments[3];
    }
    
    // 创建模拟响应
    const res = {
      statusCode: 200,
      setHeader: () => {},
      getHeader: () => {},
      redirect: () => {},
      end: (data) => {
        try {
          const result = JSON.parse(data);
          console.log(`响应状态码: ${res.statusCode}`);
          
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`✓ 路由响应成功`);
            if (result.data) {
              console.log(`数据记录数: ${Array.isArray(result.data) ? result.data.length : 'N/A'}`);
            }
          } else {
            console.log(`✗ 路由响应错误: ${result.message || result.error || '未知错误'}`);
          }
        } catch (error) {
          console.log(`无法解析响应: ${error.message}`);
          console.log(`原始响应: ${data}`);
        }
      },
      json: (data) => {
        console.log(`响应状态码: ${res.statusCode}`);
        
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`✓ 路由响应成功`);
          if (data.data) {
            console.log(`数据记录数: ${Array.isArray(data.data) ? data.data.length : 'N/A'}`);
          }
        } else {
          console.log(`✗ 路由响应错误: ${data.message || data.error || '未知错误'}`);
        }
      },
      status: function(code) {
        this.statusCode = code;
        return this;
      }
    };
    
    // 发送请求到路由处理函数
    requestHandler(req, res);
  }
}

// 生成解决方案建议
function generateSolutions() {
  console.log('\n========================================');
  console.log('   问题解决方案');
  console.log('========================================');
  
  console.log('\n1. 修复应用程序中的路由注册:');
  console.log('   - 确保正确导入并注册了路由模块');
  console.log('   - 重启应用服务器以应用路由更改');
  
  console.log('\n2. 使用直接路由:');
  console.log('   - 将以下代码添加到app.js中:');
  console.log(`
// 添加直接数据库访问路由
app.get('/api/modbus/values/latest', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const [rows] = await pool.query('SELECT * FROM modbus_data_latest ORDER BY data_point_name');
    res.json({
      success: true,
      data: rows,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('获取最新数据失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.get('/api/modbus/latest-values', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const [rows] = await pool.query('SELECT * FROM modbus_data_latest ORDER BY data_point_name');
    res.json({
      success: true,
      data: rows,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('获取最新数据失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});
  `);
  
  console.log('\n3. 前端解决方案:');
  console.log('   - 在前端增加路径有效性检查和备用访问路径已经实现');
  console.log('   - 确保数据库中有测试数据，可以使用 modbus/insert-test-data.js 脚本');
  
  console.log('\n4. 路由注册检查:');
  console.log('   - 使用 modbus/fix-routes.js 脚本检查路由注册情况');
  console.log('   - 确认路由在应用启动日志中正确注册');
}

// 主函数
async function main() {
  try {
    // 设置数据库
    const dbConnected = await setupDatabase();
    if (!dbConnected) {
      console.error('无法继续，数据库连接失败');
      process.exit(1);
    }
    
    // 设置直接路由
    setupDirectRoutes();
    
    // 测试路由
    await testRoutes();
    
    // 生成解决方案建议
    generateSolutions();
    
  } catch (error) {
    console.error('运行过程中发生错误:', error);
  }
}

// 运行主函数
main().catch(console.error); 
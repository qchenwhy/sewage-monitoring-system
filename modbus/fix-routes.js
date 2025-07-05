/**
 * Modbus路由检查和修复工具
 * 
 * 用于检查路由注册情况，解决404错误问题
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');

console.log('========================================');
console.log('   Modbus 路由检查和修复工具');
console.log('========================================');

// 加载路由文件路径
const routesPath = path.join(__dirname, '..', 'routes', 'modbus-routes.js');
console.log(`检查路由文件: ${routesPath}`);

// 检查文件是否存在
if (!fs.existsSync(routesPath)) {
  console.error(`错误: 路由文件不存在: ${routesPath}`);
  process.exit(1);
}

// 尝试加载路由模块
try {
  console.log('尝试加载路由模块...');
  const modbusRoutes = require('../routes/modbus-routes');
  
  // 检查路由栈
  console.log('检查路由栈...');
  if (modbusRoutes.stack) {
    console.log(`路由栈大小: ${modbusRoutes.stack.length}`);
    
    // 打印所有路由
    console.log('\n已注册的路由:');
    modbusRoutes.stack.forEach(layer => {
      if (layer.route) {
        const path = layer.route.path;
        const methods = Object.keys(layer.route.methods)
          .filter(method => layer.route.methods[method])
          .map(method => method.toUpperCase())
          .join(', ');
        
        console.log(`[${methods}] ${path}`);
      }
    });
  } else {
    console.log('警告: 无法直接访问路由栈');
  }
  
  // 创建测试应用
  console.log('\n创建测试应用检查路由注册...');
  const app = express();
  app.use('/api/modbus', modbusRoutes);
  
  // 检查路由匹配
  function checkRoute(method, path) {
    const routes = app._router.stack
      .filter(layer => layer.route)
      .map(layer => layer.route)
      .filter(route => route.methods[method.toLowerCase()]);
    
    const fullPath = '/api/modbus' + path;
    const foundRoute = routes.find(route => {
      return app._router.match(fullPath, method);
    });
    
    return !!foundRoute;
  }
  
  // 检查关键路由
  const routesToCheck = [
    { method: 'GET', path: '/values/latest' },
    { method: 'GET', path: '/latest-values' },
    { method: 'GET', path: '/values/history' },
    { method: 'GET', path: '/history/test' },
    { method: 'POST', path: '/values/store' },
    { method: 'POST', path: '/store-latest-values' }
  ];
  
  console.log('\n检查关键路由匹配:');
  routesToCheck.forEach(route => {
    const available = checkRoute(route.method, route.path);
    console.log(`[${route.method}] ${route.path}: ${available ? '✓ 可用' : '✗ 不可用'}`);
  });
  
  console.log('\n路由检查完成。');
  console.log('\n解决方案建议:');
  console.log('1. 确保服务器已重启，使路由修改生效');
  console.log('2. 如果仍有问题，检查 routes/modbus-routes.js 中的路由定义顺序');
  console.log('3. 确保 MySQL 数据库和表已正确初始化');
  console.log('4. 使用 GET /api/modbus/db/init 初始化数据库表');
  
} catch (error) {
  console.error('加载路由模块时出错:', error);
  console.log('\n可能的问题:');
  console.log('1. 路由文件中有语法错误');
  console.log('2. 路由文件中使用了不存在的依赖');
  console.log('3. 模块导出方式不正确');
}

console.log('\n========================================');

// 创建Express应用
const app = express();
const port = 3001; // 使用不同的端口，避免与主服务冲突

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

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

// 初始化数据库
async function initDatabase() {
  try {
    // 创建连接池
    console.log('正在创建MySQL连接池...');
    const pool = mysql.createPool(dbConfig);
    
    // 测试连接
    const [result] = await pool.execute('SELECT 1');
    if (result[0]['1'] === 1) {
      console.log('✓ 数据库连接成功');
      
      // 设置到app上下文中
      app.locals.pool = pool;
      return true;
    }
    return false;
  } catch (error) {
    console.error('数据库连接失败:', error);
    return false;
  }
}

// 添加路由
app.get('/api/status', (req, res) => {
  res.json({
    status: '修复服务运行中',
    time: new Date().toISOString()
  });
});

// 最新值路由（旧路径，这是我们需要修复的路由）
app.get('/api/modbus/values/latest', async (req, res) => {
  try {
    console.log('[修复服务] 处理 GET /api/modbus/values/latest 请求');
    const pool = req.app.locals.pool;
    
    if (!pool) {
      return res.status(500).json({
        success: false,
        message: '数据库连接未初始化'
      });
    }
    
    // 查询modbus_data_latest表
    const [rows] = await pool.query('SELECT * FROM modbus_data_latest ORDER BY data_point_name');
    console.log(`[修复服务] 查询到 ${rows.length} 条数据记录`);
    
    // 返回结果
    res.json({
      success: true,
      data: rows,
      timestamp: new Date().toISOString(),
      source: '修复服务'
    });
  } catch (error) {
    console.error('[修复服务] 查询数据失败:', error);
    res.status(500).json({
      success: false,
      message: `查询数据失败: ${error.message}`,
      source: '修复服务'
    });
  }
});

// 历史数据路由（旧路径）
app.get('/api/modbus/values/history', async (req, res) => {
  try {
    console.log('[修复服务] 处理 GET /api/modbus/values/history 请求');
    const { identifier, startTime, endTime, limit } = req.query;
    const limitValue = parseInt(limit || '100', 10);
    
    // 参数验证
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
        message: '数据库连接未初始化'
      });
    }
    
    // 查询历史数据
    const query = `
      SELECT * FROM modbus_data_history 
      WHERE data_point_identifier = ? 
      AND timestamp BETWEEN ? AND ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `;
    
    const [rows] = await pool.query(query, [identifier, startTime, endTime, limitValue]);
    console.log(`[修复服务] 查询到 ${rows.length} 条历史数据记录`);
    
    // 返回结果
    res.json({
      success: true,
      data: rows,
      count: rows.length,
      identifier: identifier,
      timeRange: {
        start: startTime,
        end: endTime
      },
      source: '修复服务'
    });
  } catch (error) {
    console.error('[修复服务] 查询历史数据失败:', error);
    res.status(500).json({
      success: false,
      message: `查询历史数据失败: ${error.message}`,
      source: '修复服务'
    });
  }
});

// 存储数据点值路由
app.post('/api/modbus/values/store', async (req, res) => {
  try {
    console.log('[修复服务] 处理 POST /api/modbus/values/store 请求');
    const { values } = req.body;
    
    if (!values || !Array.isArray(values) || values.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供要存储的数据点值数组'
      });
    }
    
    const pool = req.app.locals.pool;
    
    if (!pool) {
      return res.status(500).json({
        success: false,
        message: '数据库连接未初始化'
      });
    }
    
    console.log(`[修复服务] 准备存储 ${values.length} 条数据点值记录`);
    let successCount = 0;
    let errors = [];
    
    // 遍历所有数据点并存储
    for (const value of values) {
      const { identifier, name, value: dpValue, formattedValue, quality } = value;
      
      if (!identifier) {
        errors.push({
          message: '缺少标识符',
          value
        });
        continue;
      }
      
      try {
        // 插入历史记录
        const historyQuery = `
          INSERT INTO modbus_data_history
          (data_point_id, data_point_identifier, data_point_name, raw_value, value, 
           formatted_value, quality, read_time_ms, data_type, timestamp) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;
        
        await pool.query(historyQuery, [
          identifier,  // 直接使用标识符作为ID
          identifier,
          name || identifier,
          JSON.stringify({value: dpValue}),
          typeof dpValue === 'number' ? dpValue : null,
          formattedValue || String(dpValue),
          quality || 'UNKNOWN',
          0,  // 读取时间默认为0
          'UNKNOWN'  // 数据类型默认为UNKNOWN
        ]);
        
        // 更新或插入最新值
        const latestQuery = `
          REPLACE INTO modbus_data_latest
          (data_point_id, data_point_identifier, data_point_name, raw_value, value, 
           formatted_value, quality, data_type) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        await pool.query(latestQuery, [
          identifier,
          identifier,
          name || identifier,
          JSON.stringify({value: dpValue}),
          typeof dpValue === 'number' ? dpValue : null,
          formattedValue || String(dpValue),
          quality || 'UNKNOWN',
          'UNKNOWN'
        ]);
        
        successCount++;
        console.log(`[修复服务] 数据点 ${identifier} 存储成功`);
      } catch (error) {
        console.error(`[修复服务] 存储数据点 ${identifier} 失败:`, error);
        errors.push({
          identifier,
          error: error.message
        });
      }
    }
    
    console.log(`[修复服务] 存储完成，成功: ${successCount}, 失败: ${errors.length}`);
    
    // 返回结果
    res.json({
      success: true,
      message: `成功存储了 ${successCount} 个数据点的值`,
      count: successCount,
      errors: errors.length > 0 ? errors : null,
      timestamp: new Date().toISOString(),
      source: '修复服务'
    });
  } catch (error) {
    console.error('[修复服务] 存储数据点值失败:', error);
    res.status(500).json({
      success: false,
      message: `存储数据失败: ${error.message}`,
      source: '修复服务'
    });
  }
});

// 启动服务器
async function startServer() {
  // 初始化数据库
  const dbReady = await initDatabase();
  if (!dbReady) {
    console.error('无法初始化数据库，服务将无法正常工作');
    // 仍然启动服务，但部分功能会受限
  }
  
  // 启动服务器
  app.listen(port, () => {
    console.log(`========================================`);
    console.log(`修复服务已在端口 ${port} 上启动`);
    console.log(`处理以下路由:`);
    console.log(`- GET http://localhost:${port}/api/modbus/values/latest`);
    console.log(`- GET http://localhost:${port}/api/modbus/values/history`);
    console.log(`- GET http://localhost:${port}/api/status`);
    console.log(`========================================`);
    console.log(`请配置前端代码使用此服务，或设置代理将这些请求转发到这个端口`);
    console.log(`========================================`);
  });
}

// 启动服务
startServer().catch(err => {
  console.error('启动服务失败:', err);
}); 
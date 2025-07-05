/**
 * 注册工作内容管理路由和页面
 */
const express = require('express');
const path = require('path');
const fs = require('fs');

/**
 * 注册工作内容管理路由和页面
 * @param {Object} app - Express应用实例
 */
function registerWorkRoutes(app) {
  if (!app || typeof app.use !== 'function') {
    console.error('无法注册工作内容路由：无效的Express应用实例');
    return false;
  }

  try {
    console.log('正在注册工作内容管理路由和页面...');

    // 注册工作内容页面路由
    app.get('/work-tasks', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'work-tasks.html'));
    });

    // 获取SQL文件路径
    const sqlFilePath = path.join(__dirname, 'sql', 'work_tasks.sql');
    
    // 检查SQL文件是否存在
    if (!fs.existsSync(sqlFilePath)) {
      console.error('工作内容SQL文件不存在:', sqlFilePath);
    } else {
      console.log('工作内容SQL文件存在:', sqlFilePath);
    }

    // 检查路由模块是否存在
    const routeModulePath = path.join(__dirname, 'routes', 'workTaskRoutes.js');
    if (!fs.existsSync(routeModulePath)) {
      console.error('工作内容路由模块不存在:', routeModulePath);
    } else {
      console.log('工作内容路由模块存在:', routeModulePath);
      
      // 导入路由模块
      const workTaskRoutes = require('./routes/workTaskRoutes');
      
      // 注册API路由
      app.use('/api/work-tasks', workTaskRoutes);
      console.log('工作内容API路由已注册: /api/work-tasks');
    }

    console.log('工作内容管理路由和页面注册完成');
    return true;
  } catch (error) {
    console.error('注册工作内容路由和页面时发生错误:', error);
    return false;
  }
}

module.exports = registerWorkRoutes; 
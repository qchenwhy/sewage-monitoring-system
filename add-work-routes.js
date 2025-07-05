/**
 * 工作内容路由注册脚本
 * 在应用启动时自动注册工作内容管理相关的路由
 */

// 导入工作内容路由模块
const workTaskRoutes = require('./routes/workTaskRoutes');

/**
 * 注册工作内容路由到应用中
 * @param {Object} app - Express应用实例
 */
function registerWorkTaskRoutes(app) {
  if (!app || typeof app.use !== 'function') {
    console.error('无法注册工作内容路由：无效的Express应用实例');
    return false;
  }

  try {
    // 注册工作内容管理路由
    app.use('/api/work-tasks', workTaskRoutes);
    console.log('工作内容管理路由已注册: /api/work-tasks');
    return true;
  } catch (error) {
    console.error('注册工作内容路由时发生错误:', error);
    return false;
  }
}

module.exports = registerWorkTaskRoutes; 
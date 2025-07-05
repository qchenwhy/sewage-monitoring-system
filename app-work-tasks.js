/**
 * 添加工作内容管理路由到app.js
 */
const fs = require('fs');
const path = require('path');

const APP_JS_PATH = path.join(__dirname, 'app.js');

function main() {
  try {
    console.log('开始修改app.js添加工作内容管理路由...');
    
    // 读取app.js
    if (!fs.existsSync(APP_JS_PATH)) {
      console.error('app.js文件不存在');
      return;
    }
    
    let content = fs.readFileSync(APP_JS_PATH, 'utf8');
    
    // 检查是否已添加工作内容路由
    if (content.includes('/work-tasks') || content.includes('workTaskRoutes')) {
      console.log('工作内容路由已存在，无需重复添加');
      return;
    }
    
    // 备份app.js
    const backupPath = `${APP_JS_PATH}.${Date.now()}.bak`;
    fs.writeFileSync(backupPath, content, 'utf8');
    console.log(`已备份app.js到: ${backupPath}`);
    
    // 寻找合适的位置添加页面路由
    const pageRoutePosition = content.indexOf('app.get(\'/modbus');
    if (pageRoutePosition === -1) {
      console.log('找不到合适的位置添加页面路由');
      return;
    }
    
    // 找到'/modbus'路由的结尾
    const endOfModbusRoute = content.indexOf('});', pageRoutePosition);
    if (endOfModbusRoute === -1) {
      console.log('找不到/modbus路由的结尾');
      return;
    }
    
    // 在/modbus路由后插入工作内容路由
    const beforeInsert = content.substring(0, endOfModbusRoute + 3);
    const afterInsert = content.substring(endOfModbusRoute + 3);
    
    const routesToInsert = `

// 添加工作内容管理页面路由
app.get('/work-tasks', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/work-tasks.html'));
});`;
    
    // 寻找合适的位置添加API路由
    const apiRoutePosition = content.indexOf('app.use(\'/api');
    if (apiRoutePosition === -1) {
      console.log('找不到合适的位置添加API路由');
      return;
    }
    
    // 在第一个app.use('/api之前插入工作内容API路由
    const beforeApiInsert = content.substring(0, apiRoutePosition);
    const afterApiInsert = content.substring(apiRoutePosition);
    
    const apiRoutesToInsert = `
// 导入工作内容管理API路由
const workTaskRoutes = require('./routes/workTaskRoutes');

// 注册工作内容管理API路由
app.use('/api/work-tasks', workTaskRoutes);

`;
    
    // 组合新内容
    const newContent = beforeInsert + routesToInsert + afterInsert;
    const finalContent = beforeApiInsert + apiRoutesToInsert + afterApiInsert;
    
    // 写回文件
    fs.writeFileSync(APP_JS_PATH, finalContent, 'utf8');
    console.log('成功添加工作内容管理路由到app.js');
  } catch (error) {
    console.error('修改app.js时出错:', error);
  }
}

main(); 
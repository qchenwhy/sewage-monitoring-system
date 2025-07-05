/**
 * 应用工作内容功能的脚本
 * 在现有Express应用中安装工作内容功能
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// 应用文件路径
const APP_FILE_PATH = path.join(__dirname, 'app.js');

// IIFE主函数
(async function() {
  try {
    console.log('开始安装工作内容功能...');
    
    // 1. 检查app.js是否存在
    if (!fs.existsSync(APP_FILE_PATH)) {
      throw new Error('找不到应用主文件: app.js');
    }
    
    // 2. 检查是否已经应用过工作内容功能
    const appContent = fs.readFileSync(APP_FILE_PATH, 'utf8');
    if (appContent.includes('initWorkTasks') || appContent.includes('工作内容功能初始化')) {
      console.log('工作内容功能已安装，无需重复安装');
      return;
    }
    
    // 3. 添加初始化代码
    await addInitCode();
    
    console.log('工作内容功能安装完成！');
    console.log('请重启应用以使更改生效');
  } catch (error) {
    console.error('安装工作内容功能失败:', error);
  }
})();

/**
 * 在应用启动代码中添加初始化代码
 */
async function addInitCode() {
  return new Promise((resolve, reject) => {
    try {
      // 读取app.js内容
      const appContent = fs.readFileSync(APP_FILE_PATH, 'utf8');
      
      // 寻找合适的位置添加导入代码
      const lines = appContent.split('\n');
      let requireSection = -1;
      let serverListenSection = -1;
      
      // 查找合适的导入位置和服务器启动位置
      for (let i = 0; i < lines.length; i++) {
        // 寻找最后一个require语句后
        if (lines[i].includes('require(')) {
          requireSection = i;
        }
        
        // 寻找服务器启动语句
        if (lines[i].includes('server.listen(') || lines[i].includes('app.listen(')) {
          serverListenSection = i;
          break;
        }
      }
      
      if (requireSection === -1) {
        requireSection = 10; // 如果找不到require语句，放在文件开头附近
      }
      
      if (serverListenSection === -1) {
        throw new Error('找不到服务器启动代码');
      }
      
      // 添加导入代码
      lines.splice(requireSection + 1, 0, 
        '// 导入工作内容功能初始化脚本',
        'const initWorkTasks = require(\'./init-work-tasks\');'
      );
      
      // 添加初始化代码
      lines.splice(serverListenSection, 0, 
        '// 初始化工作内容功能',
        'initWorkTasks(app).then(success => {',
        '  console.log(\'工作内容功能初始化\' + (success ? \'成功\' : \'失败\'));',
        '}).catch(err => {',
        '  console.error(\'工作内容功能初始化出错:\', err);',
        '});',
        ''
      );
      
      // 写回文件
      fs.writeFileSync(APP_FILE_PATH + '.bak', appContent, 'utf8'); // 备份原文件
      fs.writeFileSync(APP_FILE_PATH, lines.join('\n'), 'utf8');
      
      console.log('成功添加工作内容初始化代码');
      resolve();
    } catch (error) {
      reject(error);
    }
  });
} 
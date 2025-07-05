/**
 * 工作内容功能验证脚本
 */
const fs = require('fs');
const path = require('path');

console.log('=== 工作内容功能验证开始 ===');

// 检查必要文件
const requiredFiles = [
  { path: './sql/work_tasks.sql', name: 'SQL定义文件' },
  { path: './routes/workTaskRoutes.js', name: '路由文件' },
  { path: './public/work-tasks.html', name: '前端HTML页面' },
  { path: './public/work-tasks.js', name: '前端JavaScript文件' }
];

let allFilesExist = true;
for (const file of requiredFiles) {
  if (fs.existsSync(file.path)) {
    console.log(`✓ ${file.name}存在: ${file.path}`);
  } else {
    console.log(`✗ ${file.name}不存在: ${file.path}`);
    allFilesExist = false;
  }
}

if (!allFilesExist) {
  console.log('\n⚠️ 缺少部分必要文件，功能可能无法正常工作');
} else {
  console.log('\n✓ 所有必要文件都已存在');
}

// 检查app.js中的路由注册
const appJsPath = './app.js';
if (fs.existsSync(appJsPath)) {
  const appContent = fs.readFileSync(appJsPath, 'utf8');
  const hasPageRoute = appContent.includes('/work-tasks');
  const hasApiRoute = appContent.includes('workTaskRoutes');
  
  console.log(`\n应用主文件检查:`);
  console.log(`${hasPageRoute ? '✓' : '✗'} 页面路由注册（/work-tasks）`);
  console.log(`${hasApiRoute ? '✓' : '✗'} API路由注册（workTaskRoutes）`);
  
  if (!hasPageRoute || !hasApiRoute) {
    console.log('\n⚠️ app.js中可能未正确注册路由，请手动检查');
  }
} else {
  console.log('\n✗ 找不到app.js文件，无法验证路由注册');
}

console.log('\n=== 工作内容功能验证结束 ===');
console.log('\n如需使用工作内容管理功能，请访问:');
console.log('http://服务器地址:端口/work-tasks');
console.log('\n如遇到问题，请参考work-tasks-README.md文件中的说明进行排查'); 
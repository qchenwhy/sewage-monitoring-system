/**
 * 工作内容数据库设置脚本
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql');
const readline = require('readline');

// 创建用于读取用户输入的接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 提示用户输入
function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function main() {
  console.log('=== 工作内容数据库设置开始 ===');
  
  try {
    // 获取数据库连接信息
    console.log('请输入数据库连接信息:');
    const host = await prompt('数据库主机 (默认: localhost): ') || 'localhost';
    const user = await prompt('数据库用户名 (默认: root): ') || 'root';
    const password = await prompt('数据库密码: ');
    const database = await prompt('数据库名称 (默认: mqtt_data): ') || 'mqtt_data';
    
    // 配置数据库连接
    const dbConfig = {
      host,
      user,
      password,
      database,
      multipleStatements: true // 允许执行多条SQL语句
    };

    console.log(`\n数据库配置: ${dbConfig.user}@${dbConfig.host}/${dbConfig.database}`);
    
    // 读取SQL文件
    const sqlFilePath = path.join(__dirname, 'sql', 'work_tasks.sql');
    console.log(`\n读取SQL文件: ${sqlFilePath}`);
    
    if (!fs.existsSync(sqlFilePath)) {
      throw new Error(`SQL文件不存在: ${sqlFilePath}`);
    }
    
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
    console.log(`SQL文件读取成功: ${sqlContent.length} 字节`);
    
    // 创建数据库连接
    console.log('\n连接数据库...');
    const connection = mysql.createConnection(dbConfig);
    
    // 执行SQL语句
    await new Promise((resolve, reject) => {
      connection.connect((err) => {
        if (err) {
          reject(new Error(`数据库连接失败: ${err.message}`));
          return;
        }
        
        console.log('数据库连接成功，执行SQL...');
        connection.query(sqlContent, (error, results) => {
          connection.end();
          
          if (error) {
            reject(new Error(`SQL执行失败: ${error.message}`));
            return;
          }
          
          console.log('SQL执行成功!');
          resolve(results);
        });
      });
    });
    
    console.log('\n=== 工作内容数据库设置完成 ===');
    console.log('表结构已成功创建!');
  } catch (error) {
    console.error(`\n错误: ${error.message}`);
    console.log('\n数据库设置失败。如需手动设置，请使用以下命令:');
    console.log(`mysql -u用户名 -p数据库名 < sql/work_tasks.sql`);
  } finally {
    rl.close();
  }
}

main().catch(console.error); 
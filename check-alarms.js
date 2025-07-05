const mysql = require('mysql2/promise');
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '753456Chen*',  // 从代码中找到的实际密码
  database: 'mqtt_data'
};

async function checkAlarms() {
  let connection;
  
  try {
    console.log('连接到数据库...');
    connection = await mysql.createConnection(dbConfig);
    
    console.log('查询最近的告警记录...');
    const [rows] = await connection.execute('SELECT * FROM modbus_alarms ORDER BY id DESC LIMIT 10');
    
    console.log(`\n找到 ${rows.length} 条告警记录:\n`);
    
    if (rows.length > 0) {
      // 格式化显示
      console.log('ID\t标识符\t\t告警内容\t\t触发时间\t\t状态');
      console.log('-'.repeat(100));
      
      rows.forEach(alarm => {
        console.log(`${alarm.id}\t${alarm.alarm_identifier}\t\t${alarm.alarm_content.substring(0, 20)}...\t${new Date(alarm.triggered_time).toLocaleString()}\t${alarm.status}`);
      });
    } else {
      console.log('没有找到告警记录');
    }
    
    // 查询总数
    const [countResult] = await connection.execute('SELECT COUNT(*) as total FROM modbus_alarms');
    console.log(`\n数据库中共有 ${countResult[0].total} 条告警记录`);
    
    // 查询当前活跃告警
    const [activeAlarms] = await connection.execute('SELECT * FROM modbus_alarms WHERE status="active"');
    console.log(`当前有 ${activeAlarms.length} 条活跃告警`);
    
  } catch (error) {
    console.error('查询告警记录失败:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('数据库连接已关闭');
    }
  }
}

checkAlarms(); 
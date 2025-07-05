/**
 * 工作任务数据库迁移脚本
 * 用于执行modbus_data_latest表的迁移操作，添加工作内容相关字段
 */

const { migrateDatabase } = require('./modbus/db-migration');

console.log('开始执行工作任务数据库迁移...');

migrateDatabase()
  .then(result => {
    if (result) {
      console.log('工作任务数据库迁移成功完成');
      process.exit(0);
    } else {
      console.error('工作任务数据库迁移失败');
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('工作任务数据库迁移过程中发生未捕获的错误:', err);
    process.exit(1);
  }); 
/**
 * Modbus 连接重置工具
 * 
 * 此脚本用于强制重置ModbusService的连接状态，解决连接卡死的问题
 */

const modbusService = require('./modbus-service').getInstance();

console.log('====================================================');
console.log('           Modbus 连接状态重置工具                  ');
console.log('====================================================');

// 获取当前连接状态
const currentStatus = modbusService.getConnectionStatus();
console.log('当前连接状态:');
console.log(`- 连接状态: ${currentStatus.isConnected ? '已连接' : '未连接'}`);
console.log(`- 主机: ${currentStatus.config.host}`);
console.log(`- 端口: ${currentStatus.config.port}`);
console.log(`- 单元ID: ${currentStatus.config.unitId}`);
console.log(`- 最后错误: ${currentStatus.lastError ? currentStatus.lastError.message : '无'}`);

// 强制断开连接
console.log('\n开始重置连接状态...');

// 执行重置过程
async function resetConnection() {
  try {
    // 1. 先尝试正常断开连接
    console.log('1. 尝试断开当前连接...');
    try {
      await modbusService.disconnect();
      console.log('   ✓ 成功断开连接');
    } catch (disconnectError) {
      console.error(`   ✗ 断开连接失败: ${disconnectError.message}`);
      console.log('   继续执行强制重置...');
    }
    
    // 2. 强制清理内部状态
    console.log('2. 强制清理内部状态...');
    modbusService.isConnected = false;
    modbusService.isPolling = false;
    
    // 清理所有定时器
    if (modbusService.reconnectTimer) {
      clearTimeout(modbusService.reconnectTimer);
      modbusService.reconnectTimer = null;
      console.log('   ✓ 已清理重连定时器');
    }
    
    if (modbusService.pollingTimer) {
      clearInterval(modbusService.pollingTimer);
      modbusService.pollingTimer = null;
      console.log('   ✓ 已清理轮询定时器');
    }
    
    // 3. 强制清理ModbusTCP实例
    if (modbusService.modbusTCP) {
      console.log('3. 强制清理ModbusTCP实例...');
      
      try {
        // 清理ModbusTCP的定时器
        if (modbusService.modbusTCP.keepAliveTimer) {
          clearInterval(modbusService.modbusTCP.keepAliveTimer);
          modbusService.modbusTCP.keepAliveTimer = null;
          console.log('   ✓ 已清理保活定时器');
        }
        
        if (modbusService.modbusTCP.pollingTimer) {
          clearInterval(modbusService.modbusTCP.pollingTimer);
          modbusService.modbusTCP.pollingTimer = null;
          console.log('   ✓ 已清理ModbusTCP轮询定时器');
        }
        
        // 关闭Socket连接
        if (modbusService.modbusTCP.socket) {
          modbusService.modbusTCP.socket.destroy();
          modbusService.modbusTCP.socket = null;
          console.log('   ✓ 已销毁Socket');
        }
        
        // 重置连接标志
        modbusService.modbusTCP.connected = false;
        console.log('   ✓ 已重置ModbusTCP连接标志');
      } catch (cleanupError) {
        console.error(`   ✗ 清理ModbusTCP实例时出错: ${cleanupError.message}`);
      }
      
      // 彻底删除ModbusTCP实例
      modbusService.modbusTCP = null;
      console.log('   ✓ 已删除ModbusTCP实例');
    } else {
      console.log('3. 跳过ModbusTCP清理 (实例不存在)');
    }
    
    // 4. 更新轮询配置为禁用状态
    console.log('4. 更新轮询配置...');
    modbusService.configManager.updatePollingConfig({ enabled: false });
    console.log('   ✓ 已将轮询配置更新为禁用状态');
    
    // 5. 重置所有连接相关标志
    console.log('5. 重置连接状态标志...');
    modbusService.isConnected = false;
    modbusService.reconnectAttempts = 0;
    modbusService.manualDisconnect = false;
    modbusService.connectionStartTime = null;
    console.log('   ✓ 已重置连接状态标志');
    
    // 6. 再次检查状态
    const newStatus = modbusService.getConnectionStatus();
    console.log('\n重置后的连接状态:');
    console.log(`- 连接状态: ${newStatus.isConnected ? '已连接' : '未连接'}`);
    
    console.log('\n重置完成！');
    console.log('====================================================');
    console.log('现在可以通过API或网页界面尝试重新建立连接。');
    
    // 7. 可选：尝试重新连接
    const shouldReconnect = process.argv.includes('--reconnect');
    if (shouldReconnect) {
      console.log('\n尝试自动重新连接...');
      const config = modbusService.getConnectionConfigFromManager();
      try {
        const result = await modbusService.connect(config);
        if (result.success) {
          console.log(`✓ 重新连接成功! ${config.host}:${config.port}`);
        } else {
          console.error(`✗ 重新连接失败: ${result.error || '未知错误'}`);
        }
      } catch (reconnectError) {
        console.error(`✗ 重新连接过程中发生错误: ${reconnectError.message}`);
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error(`执行重置过程中发生错误: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// 执行重置
resetConnection(); 
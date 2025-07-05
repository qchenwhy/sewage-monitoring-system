# Modbus告警系统修复指南

本文档介绍了对Modbus告警系统的修复，解决了两个主要问题：
1. 告警列表中的发生时间显示为"Invalid Date"而不是实际触发时间
2. Modbus页面的告警消息没有传递到chat.html前端

## 修复内容

我们实施了以下修复：

### 1. 告警时间显示问题修复
- 添加了安全的时间格式化函数`formatAlarmDateTime`
- 修补了`triggerAlarm`方法，确保正确记录首次触发时间
- 改进了告警存储机制，使用标准ISO时间格式

### 2. 告警消息传递到chat.html修复
- 添加了新的前端脚本`alarm-fix.js`，实现告警接收和显示
- 实现了通过LocalStorage进行告警状态共享
- 添加了告警API轮询机制，确保定时获取最新告警

### 3. 全面修复脚本
- 创建了`fix-all-alarms.js`一站式修复脚本
- 修补了核心告警方法以增强可靠性
- 实现了告警状态的重置和初始化

## 使用方法

### 自动修复
系统启动时会自动执行修复脚本，无需手动操作。

### 手动测试

1. **测试告警时间显示：**
   ```javascript
   // 在浏览器控制台执行
   fetch('/api/modbus/alarm/test', {
     method: 'POST',
     headers: {'Content-Type': 'application/json'},
     body: JSON.stringify({content: '测试告警' + new Date().toLocaleTimeString()})
   }).then(res => res.json()).then(console.log);
   ```

2. **测试告警消息传递：**
   ```javascript
   // 在浏览器控制台执行
   localStorage.setItem('alarmState', JSON.stringify({
     activeAlarms: ['测试告警-' + new Date().toLocaleTimeString()],
     alarmFirstTriggerTime: {
       ['测试告警-' + new Date().toLocaleTimeString()]: new Date().toISOString()
     },
     timestamp: new Date().toISOString()
   }));
   ```

3. **使用调试面板测试：**
   - 在chat.html页面右下角点击"告警调试"按钮
   - 点击"测试localStorage"按钮生成测试告警

## 故障排查

### 告警时间仍显示Invalid Date

请检查：
1. 控制台是否有时间格式错误
2. 修改`public/js/modbus.js`中的`formatAlarmDateTime`函数，增加更多调试信息
3. 检查原始时间字符串格式

### 告警未传递到chat.html

请检查：
1. 浏览器控制台是否有错误信息
2. LocalStorage状态：`localStorage.getItem('alarmState')`
3. 告警API响应：`fetch('/api/modbus/alarms/active').then(r=>r.json()).then(console.log)`
4. 检查网络请求是否有跨域问题

## 服务器重启测试

完整测试修复效果，建议执行以下步骤：
1. 重启服务器
2. 打开modbus页面触发告警
3. 打开chat.html页面查看告警是否显示
4. 检查告警列表中的时间格式是否正确

## 其他修复文件

修复包含了以下新文件：
- `public/alarm-fix.js` - 前端告警修复
- `modbus/modbus-reset.js` - 告警状态重置工具
- `modbus/fix-all-alarms.js` - 全面修复脚本
- `docs/alarm-fix-guide.md` - 本文档

如有问题，请联系系统管理员。 
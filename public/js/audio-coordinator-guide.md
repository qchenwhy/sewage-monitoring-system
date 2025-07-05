# 音频播放协调器使用指南

## 概述

音频播放协调器(`audio-playback-coordinator.js`)是一个用于解决计时器音频和对话语音播放冲突的解决方案。该协调器通过队列管理、优先级控制和状态跟踪，确保两套音频播放系统能够和谐共存而不互相干扰。

## 主要特性

1. **统一接口**：提供标准化的音频播放接口，适用于计时器和对话框
2. **优先级控制**：自动管理不同类型音频的播放优先级
3. **队列管理**：当多个音频请求同时到达时，通过队列确保有序播放
4. **资源隔离**：避免不同音频系统之间的资源冲突
5. **降级处理**：在任何组件失败时提供多层备用方案
6. **兼容性增强**：确保与现有音频播放逻辑兼容

## 安装方法

协调器已经通过以下方式安装到系统中：

1. 添加了`audio-playback-coordinator.js`脚本到项目中
2. 在`chat.html`文件中引入了该脚本
3. 修改了`chat-settings-fix.js`以支持协调器
4. 修改了`chat-dialog-audio-fix.js`以支持协调器

## 使用方法

### 对于开发者

音频协调器通过全局`AudioCoordinator`对象提供API:

```javascript
// 播放计时器音频
AudioCoordinator.playTimerAudio('/audio/alert.mp3', '计时器提醒消息');

// 播放对话语音
AudioCoordinator.playDialogAudio('/audio/tts_response.mp3');

// 检查状态
if (AudioCoordinator.isTimerAudioPlaying()) {
    console.log('计时器音频正在播放');
}

// 暂停计时器音频
AudioCoordinator.pauseTimerAudio();

// 清空队列
AudioCoordinator.clearTimerAudioQueue();

// 测试协调功能
AudioCoordinator.testCoordination();
```

### 对于用户

作为最终用户，您无需进行任何特殊操作。音频协调器会在后台自动工作，确保：

1. 当您正在听计时器提醒时，如果收到聊天回复，回复音频会优先播放
2. 当您正在听聊天回复时，计时器提醒会被加入队列，待回复结束后播放
3. 如果同时有多个计时器到期，它们的提醒会按顺序播放，而不是混杂在一起

## 工作原理

音频协调器通过以下方式实现音频播放的协调：

1. **函数包装**：包装关键函数如`speakMessage`、`handleAudioEvent`和`setupTimerReminders`
2. **状态跟踪**：实时记录当前有哪些音频正在播放
3. **优先级策略**：默认对话语音优先于计时器音频
4. **队列处理**：当有音频需要等待时，将其放入相应队列
5. **安全播放**：使用独立的Audio实例避免资源冲突
6. **错误处理**：在任何环节出错时提供降级策略

## 测试方法

可以通过以下方式测试音频协调器是否正常工作：

1. **浏览器控制台测试**：
   ```javascript
   // 打开开发者工具，运行以下命令
   AudioCoordinator.testCoordination();
   ```

2. **同时触发测试**：
   - 创建一个短时间的计时器（如10秒）
   - 在计时器即将到期时，发送聊天消息
   - 观察音频是否按照预期的优先级和顺序播放

3. **手动API测试**：
   ```javascript
   // 测试计时器音频
   AudioCoordinator.playTimerAudio('/audio/Broadcastalert.mp3', '测试计时器提醒');
   
   // 测试语音合成
   AudioCoordinator.speakText('这是一条测试消息');
   ```

## 问题排查

如果遇到音频播放问题，请检查：

1. **浏览器控制台**：查找带有`[音频协调器]`前缀的日志信息
2. **音频状态**：使用`AudioCoordinator.isTimerAudioPlaying()`和`AudioCoordinator.isDialogAudioPlaying()`检查当前状态
3. **队列内容**：如果音频未播放，可能在队列中等待
4. **浏览器策略**：某些浏览器要求用户先交互后才能播放音频

## 调试技巧

1. 启用详细日志：
   ```javascript
   // 在控制台中运行
   window.chatDebugMode = true;
   ```

2. 检查队列状态：
   ```javascript
   // 在控制台中运行
   console.log('计时器音频队列:', AudioCoordinator._state.timerAudioQueue);
   console.log('对话音频队列:', AudioCoordinator._state.dialogAudioQueue);
   ```

3. 手动触发队列处理：
   ```javascript
   // 强制处理队列
   AudioCoordinator._processQueue();
   ```

## 注意事项

1. 音频协调器默认给对话语音更高的优先级
2. 计时器的提醒可能会被延迟，直到当前对话语音播放完成
3. 如果遇到音频无法播放的情况，可能是浏览器的自动播放限制所致
4. 协调器在页面加载时需要一小段时间进行初始化，请等待初始化完成后再测试

## 未来优化方向

1. 添加用户可配置的优先级设置
2. 实现音频混合模式，同时播放多种音频但调整音量
3. 添加可视化界面显示当前音频状态和队列
4. 优化移动设备上的音频播放体验

## 技术支持

如有任何问题，请联系技术支持团队，并提供以下信息：
1. 浏览器控制台日志（特别是带有`[音频协调器]`前缀的信息）
2. 问题复现步骤
3. 浏览器和设备信息 
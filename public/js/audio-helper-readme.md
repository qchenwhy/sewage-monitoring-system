# 音频循环播放功能实现说明

## 功能概述

我们已经实现了一个完整的音频循环播放系统，通过`AudioHelper`工具对原有的`AudioAutoplay`功能进行扩展，提供了更加丰富和易用的音频循环播放能力。

## 主要文件

1. **audio-helper.js**: 
   - 封装了`AudioAutoplay`的循环播放功能
   - 增加了淡入淡出效果支持
   - 提供了音量控制功能
   - 实现了更简洁的API接口

2. **loop-audio-demo.html**:
   - 提供了完整的演示和使用示例
   - 包含基本和高级功能的展示
   - 提供实时调整参数的交互界面

## 功能特性

### 基本功能

- **开始循环播放**: 指定音频URL进行循环播放
- **停止循环播放**: 停止当前正在循环的音频
- **状态查询**: 检查当前是否有音频在循环播放

### 高级功能

- **淡入效果**: 音频播放开始时的音量渐变效果，提供更好的用户体验
- **淡出效果**: 音频停止时的音量渐变效果，避免突然停止的不适感
- **音量控制**: 实时调整循环播放的音量大小
- **播放状态切换**: 一键切换音频的播放/停止状态

## 使用方法

### 引入文件

```html
<!-- 首先引入基础库 -->
<script src="/js/audio-autoplay.js"></script>
<!-- 然后引入扩展工具 -->
<script src="/js/audio-helper.js"></script>
```

### 基本用法

```javascript
// 开始循环播放
AudioHelper.startLoop('/audio/alert.mp3');

// 停止循环播放
AudioHelper.stopLoop();

// 检查是否正在循环播放
if (AudioHelper.isLooping()) {
  console.log('当前有音频正在循环播放');
}
```

### 高级用法

```javascript
// 带淡入效果的循环播放
AudioHelper.startLoop('/audio/alert.mp3', { 
  fadeIn: 1000,  // 1秒淡入
  volume: 0.7    // 音量70%
});

// 带淡出效果的停止
AudioHelper.stopLoop({ 
  fadeOut: 3000  // 3秒淡出
});

// 调整当前播放音量
AudioHelper.setVolume(0.5);

// 切换播放状态
AudioHelper.toggleLoop('/audio/alert.mp3', { 
  fadeIn: 1000, 
  fadeOut: 1000,
  volume: 0.8
});

// 获取当前状态信息
const status = AudioHelper.getStatus();
console.log(`
  是否正在播放: ${status.isLooping}
  当前音频: ${status.currentAudio}
  当前音量: ${status.volume}
`);
```

## 注意事项

1. **浏览器策略**: 为符合浏览器自动播放策略，首次播放前可能需要用户交互
2. **移动设备**: 在移动设备上，熄屏状态可能会中断音频循环播放
3. **资源使用**: 不再需要时，应调用`stopLoop`方法停止播放，释放资源
4. **依赖关系**: `AudioHelper`依赖于`AudioAutoplay`，必须先加载基础库

## 兼容性

- 支持现代浏览器（Chrome、Firefox、Safari、Edge）
- 支持移动设备（iOS、Android）
- 针对移动端做了特殊优化，解决了自动播放限制问题

## 示例集成

`loop-audio-demo.html`提供了一个完整的演示，展示了如何集成和使用这些功能。你可以通过这个演示页面测试不同的选项和效果，了解API的具体用法。 
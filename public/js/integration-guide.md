# 语音识别功能分离指南

本文档提供了将`chat.html`中的语音识别功能分离到独立JS文件的步骤指南。

## 步骤概览

1. 添加新的JS文件引用
2. 禁用原有的录音功能初始化
3. 删除或禁用原有的录音处理相关函数
4. 修改WebSocket处理逻辑(可选)

## 详细步骤

### 1. 添加新的JS文件引用

在`chat.html`的`</head>`标签前添加以下内容:

```html
<script src="/js/speech-recognition.js"></script>
<script src="/js/speech-recognition-bridge.js"></script>
```

### 2. 禁用原有的录音功能初始化

找到`initRecordingFeature`函数，将整个函数内容替换为：

```javascript
function initRecordingFeature() {
    console.log('使用外部语音识别模块...');
    // 录音功能已由外部模块提供，此处仅保留函数框架以兼容现有代码
}
```

### 3. 删除或禁用原有的录音处理相关函数

由于所有录音处理逻辑已经转移到外部模块中，原有的`processRecording`、`startRecording`、`stopRecording`等函数可以删除或保留空函数框架。

如果您的现有代码中有其他部分依赖这些函数，可以保留函数名但使其不执行任何实际操作：

```javascript
// 如果其他代码仍调用这些函数，可以保留空函数框架
function startRecording() { 
    console.log('startRecording被调用，但录音功能已由外部模块提供');
    // 实际功能已由speech-recognition.js模块提供
}

function stopRecording() {
    console.log('stopRecording被调用，但录音功能已由外部模块提供');
    // 实际功能已由speech-recognition.js模块提供
}

function processRecording() {
    console.log('processRecording被调用，但录音功能已由外部模块提供');
    // 实际功能已由speech-recognition.js模块提供
}
```

如果确定没有其他代码依赖这些函数，可以完全删除它们。

### 4. 修改WebSocket处理逻辑(可选)

如果您在WebSocket的`onmessage`事件处理中有针对语音识别的处理，可以保留它，因为新模块也会使用相同的WebSocket连接接收识别结果。

在`ws.onmessage`事件处理函数中，确保检查`window.isProcessingAjaxRecognition`的逻辑是在外部模块添加了这个变量的情况下才执行：

```javascript
if (data.type === 'asr_result') {
    // 如果AJAX请求正在处理，跳过WebSocket更新
    if (typeof window.isProcessingAjaxRecognition !== 'undefined' && 
        window.isProcessingAjaxRecognition === true) {
        console.log('AJAX识别请求正在处理中，跳过WebSocket asr_result更新');
    } else {
        updateRecognitionText(data);
    }
}
```

## 注意事项

1. 确保新的JS文件可以被正确访问，即放在正确的目录下
2. 这种方式保留了原有功能的框架，只是将实际实现替换为外部模块
3. 如果在开发过程中遇到问题，检查控制台是否有相关错误信息

## 验证安装

完成上述步骤后，打开`chat.html`页面，观察控制台输出，应该能看到类似以下内容：

```
正在初始化语音识别桥接脚本...
语音识别模块初始化完成
```

然后尝试使用录音按钮，查看是否能正常工作。

## 示例页面

我们还提供了一个示例页面`/js/example.html`，它展示了如何在一个简单的HTML页面中使用这个语音识别模块。可以通过这个示例页面来测试模块是否正常工作，并了解如何在其他页面中集成该模块。 
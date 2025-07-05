# 聊天消息分类功能

本模块实现了对聊天消息进行硬编码分类，并连接到不同的Dify API接口，从而提高响应速度和准确性。

## 功能特点

1. **五种消息分类**：
   - 系统参数查询：识别关键词如"型号"、"参数"、"状态"、"运行时间"、"操作手册"等
   - 数据更改：识别关键词如"设置"、"输入"、"写入"、"添加"、"新建"等
   - 计时指令：识别关键词如"计时"、"倒计时"、"设置计时器"、"提醒"等
   - 问候语：识别关键词如"你好"、"好啊"、"你是谁"、"在吗"等
   - 通用智能应答：当无法确定属于前四类时，使用通用处理

2. **不同API接口集成**：
   - 每种分类连接到特定的Dify API接口
   - 问候语直接由系统处理，无需调用外部API

3. **保留原有功能**：
   - 维持前端界面和用户体验不变
   - 保持语音合成、会话连续性等原有功能

## 安装指南

### 方法一：使用安装脚本（推荐）

1. 确保Node.js环境已安装
2. 运行安装脚本：
   ```bash
   node install.js
   ```
3. 脚本将自动：
   - 备份原有文件
   - 创建消息分类器模块
   - 修改app.js和chat.html文件
   - 保持原有功能不受影响

4. 重启服务器：
   ```bash
   npm restart
   # 或
   node app.js
   ```

### 方法二：手动安装

如果自动安装失败，您可以手动执行以下步骤：

1. 备份原有文件：
   ```bash
   cp app.js app.js.bak
   cp public/chat.html public/chat.html.bak
   ```

2. 创建消息分类器文件：
   - 创建`message-classifier.js`文件
   - 复制`message-classifier.js`中的代码

3. 修改app.js：
   - 引入消息分类模块
   - 替换聊天请求处理部分代码

4. 修改chat.html：
   - 添加chat_response处理逻辑

## 消息分类逻辑

1. **系统参数查询**：
   - 关键词：型号、参数、状态、运行时间、操作手册
   - API：http://5ca6-218-57-212-166.ngrok-free.app/v1
   - API Key：app-c4nsE8BRWPTvHfVOOZjxAMe7

2. **数据更改**：
   - 关键词：设置、输入、写入、添加、新建、创建、增加、记录、记住等
   - API：http://5ca6-218-57-212-166.ngrok-free.app/v1
   - API Key：app-wnuHyMsy5CpzBaWUCu4aOVof

3. **计时指令**：
   - 关键词：计时、倒计时、设置计时器、提醒、告知
   - API：http://5ca6-218-57-212-166.ngrok-free.app/v1
   - API Key：app-2x8qQKmixHT0xnq77KsRBVqG

4. **问候语**：
   - 关键词：你好、好啊、你是谁、在吗等
   - 处理：本地随机回复，不调用API

5. **通用智能应答**：
   - 当消息不属于以上四类时使用
   - API：http://5ca6-218-57-212-166.ngrok-free.app/v1
   - API Key：app-noztD5mGi319kxZ7W3B6CtMI

## 恢复原始文件

如需恢复原始文件，使用备份目录中的文件：
```bash
cp backups/backup-[timestamp]/app.js.bak app.js
cp backups/backup-[timestamp]/chat.html.bak public/chat.html
```

## 问题排查

如果安装后出现问题：

1. 检查控制台错误信息
2. 确认文件修改是否成功
3. 检查API接口是否可访问
4. 恢复备份文件并重试

## 自定义设置

如需修改关键词或API配置，请编辑`message-classifier.js`文件：

```javascript
// 关键词定义
const KEYWORDS = {
  // 可以添加或修改关键词
};

// API配置
const API_CONFIG = {
  // 可以修改API URL和Key
};
``` 
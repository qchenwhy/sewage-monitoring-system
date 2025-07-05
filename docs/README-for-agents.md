# 🤖 AI Agent 快速开发指南

## 📋 项目概览

**wzh17** 是一个基于Node.js的工业数据采集和可视化系统，主要功能包括：
- MQTT/Modbus数据采集
- 实时数据推送（WebSocket）
- 数据库存储和查询（MySQL）
- Web界面管理
- AI对话和语音合成
- 3D可视化（规划中的远程渲染架构）

## 🚀 快速开始

### 1. 项目启动
```bash
cd /d/HBuilderX/project/wzh17
node app.js
# 访问：http://localhost:3000
```

### 2. 核心文件
- `app.js` - 主服务器入口
- `modbus/db-manager.js` - 数据库连接池（推荐使用）
- `routes/` - API路由目录
- `public/` - 前端页面目录

### 3. 技术栈速查
```json
{
  "后端": "Express.js + MySQL + WebSocket",
  "前端": "原生HTML/JS + Bootstrap",
  "数据库": "MySQL (使用连接池)",
  "实时通信": "WebSocket + MQTT",
  "文件处理": "xlsx + multer"
}
```

## 💡 开发模式

### 🔄 标准开发流程
1. **创建路由** → `routes/feature-name.js`
2. **创建前端** → `public/feature-name.html`
3. **注册路由** → 在`app.js`中添加
4. **测试功能** → 访问对应URL

### 📝 代码模板

#### 路由模板
```javascript
const express = require('express');
const router = express.Router();
const dbManager = require('../modbus/db-manager');

router.get('/api/data', async (req, res) => {
  try {
    const result = await dbManager.query('SELECT * FROM table_name');
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
```

#### 前端模板
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>功能页面</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body>
    <div class="container mt-4">
        <h1>功能标题</h1>
        <button id="actionBtn" class="btn btn-primary">执行操作</button>
        <div id="result"></div>
    </div>
    
    <script>
        document.getElementById('actionBtn').addEventListener('click', async () => {
            try {
                const response = await fetch('/api/data');
                const result = await response.json();
                document.getElementById('result').innerHTML = JSON.stringify(result, null, 2);
            } catch (error) {
                console.error('错误:', error);
            }
        });
    </script>
</body>
</html>
```

## ⚠️ 重要约定

### ✅ 必须遵循
- **数据库访问**：使用`dbManager`而非直接连接
- **错误处理**：所有API都要有try-catch
- **响应格式**：`{success: boolean, data?: any, error?: string}`
- **中文界面**：所有用户界面使用中文

### ❌ 避免事项
- 不要修改`app.js`的核心功能
- 不要直接创建MySQL连接
- 不要破坏现有API的兼容性
- 不要创建过于复杂的重构

## 🎯 常见任务

### 📊 数据查询API
```javascript
router.get('/api/data/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const sql = 'SELECT * FROM table_name WHERE id = ?';
    const result = await dbManager.query(sql, [id]);
    res.json({ success: true, data: result[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

### 📝 数据创建API
```javascript
router.post('/api/data', async (req, res) => {
  try {
    const { name, value } = req.body;
    const sql = 'INSERT INTO table_name (name, value) VALUES (?, ?)';
    const result = await dbManager.query(sql, [name, value]);
    res.json({ success: true, data: { id: result.insertId } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

### 📁 文件上传处理
```javascript
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

router.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    // 处理文件逻辑
    res.json({ success: true, message: '上传成功' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

### 🔄 WebSocket广播
```javascript
// 在需要推送数据的地方
function broadcastData(data) {
  if (typeof wss !== 'undefined') {
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'data_update',
          data: data,
          timestamp: Date.now()
        }));
      }
    });
  }
}
```

## 🏗️ 远程渲染架构

### 架构概述
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   数据服务器     │    │   渲染服务器     │    │   客户端终端     │
│   (app.js)      │◄──►│   (port 3001)   │◄──►│   (浏览器)      │
│   port 3000     │    │   3D渲染+编码    │    │   视频播放      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 实现阶段
1. **Phase 1**: 单服务器3D可视化（高配置电脑）
2. **Phase 2**: 双服务器架构（数据+渲染分离）
3. **Phase 3**: 云渲染优化（低延迟交互）

## 📚 参考资源

### 详细文档
- `docs/agent-programming-guide.json` - 完整技术规范
- `docs/agent-coding-instructions.md` - 详细开发指导
- `package.json` - 依赖包清单

### 现有功能参考
- `routes/workTaskRoutes.js` - 工作任务管理
- `routes/data-point-batch.js` - 批量数据处理
- `public/modbus.html` - Modbus数据管理界面

### 数据库相关
- `modbus/db-config.js` - 数据库配置
- `modbus/db-manager.js` - 连接池管理
- `sql/` - 数据库脚本目录

## 🔧 调试技巧

### 常见问题
1. **依赖缺失** → 运行`npm install`
2. **数据库连接失败** → 检查`modbus/db-config.js`
3. **路由404** → 确认在`app.js`中注册了路由
4. **WebSocket断开** → 检查客户端重连机制

### 测试方法
```bash
# 启动服务器
node app.js

# 测试API
curl http://localhost:3000/api/test

# 查看日志
# 控制台输出包含详细的错误信息
```

## 🎯 开发建议

1. **从小功能开始**：先实现基础CRUD，再扩展复杂功能
2. **参考现有代码**：查看`routes/`目录下的现有实现
3. **保持一致性**：遵循现有的命名和结构规范
4. **及时测试**：每个功能完成后立即测试
5. **文档同步**：重要功能要更新相关文档

---

**记住**：这个项目注重稳定性和兼容性，优先扩展而非重构，确保新功能不影响现有系统的正常运行。 
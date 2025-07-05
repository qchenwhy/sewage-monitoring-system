# Agent编程指导说明

## 🎯 总体指导原则

### 1. **最小化修改原则**
- 优先扩展现有功能，避免重构核心代码
- 新功能通过新增文件实现，减少对现有文件的修改
- 保持现有API和数据结构的兼容性
- 遵循中文注释和用户反馈的要求

### 2. **架构一致性**
- 遵循现有的模块化结构（routes/, modbus/, public/）
- 使用统一的数据库访问模式（db-manager连接池）
- 保持WebSocket和REST API的设计模式
- 确保新功能与现有功能的无缝集成

### 3. **远程渲染架构支持**
- 为3D可视化功能预留远程渲染接口
- 设计可扩展的服务器架构
- 支持单服务器和双服务器部署模式
- 考虑云渲染的扩展可能性

## 📁 代码组织规范

### 目录结构规则
```
wzh17/
├── app.js                 # 主服务器入口，端口3000
├── routes/               # API路由模块
│   ├── workTaskRoutes.js
│   ├── data-point-batch.js
│   └── [新功能路由].js
├── modbus/              # 业务逻辑模块
│   ├── db-manager.js    # 数据库连接池管理
│   ├── db-config.js     # 数据库配置
│   └── [业务服务].js
├── public/              # 前端静态文件
│   ├── [功能页面].html
│   ├── js/             # JavaScript文件
│   └── css/            # 样式文件
├── docs/                # 文档和配置
├── sql/                 # 数据库脚本
└── remote-rendering/    # 远程渲染模块（可选）
    ├── server/          # 渲染服务器（端口3001）
    ├── client/          # 客户端页面
    └── shared/          # 共享模块
```

### 新功能开发流程
1. **后端API**: 在`routes/`创建路由文件
2. **前端页面**: 在`public/`创建HTML文件
3. **业务逻辑**: 在`modbus/`创建服务模块（如需要）
4. **数据库**: 在`sql/`创建迁移脚本（如需要）
5. **集成**: 在`app.js`中注册路由
6. **测试**: 验证功能完整性
7. **文档**: 更新相关文档

## 🔧 技术实现规范

### 数据库访问模式
```javascript
// ✅ 推荐：使用连接池
const dbManager = require('./modbus/db-manager');
const result = await dbManager.query(sql, params);

// ❌ 避免：直接创建连接
const mysql = require('mysql2');
const connection = mysql.createConnection(config);
```

### API响应格式
```javascript
// 成功响应
res.json({
  success: true,
  data: result,
  message: '操作成功'
});

// 错误响应
res.status(500).json({
  success: false,
  error: error.message,
  code: 'ERROR_CODE'
});
```

### WebSocket消息格式
```javascript
// 标准消息格式
{
  type: 'data_update',
  timestamp: Date.now(),
  data: { /* 具体数据 */ }
}
```

### 文件上传处理
```javascript
// 使用multer处理文件上传
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    // 处理上传的文件
    const file = req.file;
    // ... 业务逻辑
    res.json({ success: true, message: '上传成功' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

## 🎨 远程渲染架构指导

### 服务器分工
- **数据服务器(3000)**: 处理MQTT/Modbus数据、数据库操作、业务API
- **渲染服务器(3001)**: 3D场景渲染、视频编码、交互处理
- **客户端**: 视频播放、交互捕获、数据面板

### 关键技术栈
- **渲染**: Puppeteer + Three.js + WebGL
- **编码**: FFmpeg + H.264
- **传输**: WebRTC/HLS + WebSocket
- **交互**: 预测渲染 + 延迟补偿

### 实现优先级
1. **Phase 1**: 单服务器3D可视化（高配置电脑）
2. **Phase 2**: 远程渲染架构（多用户支持）
3. **Phase 3**: 云渲染优化（低延迟交互）

### 远程渲染实现模板
```javascript
// 渲染服务器基础结构
const express = require('express');
const puppeteer = require('puppeteer');
const WebSocket = require('ws');

class RenderingServer {
  constructor() {
    this.app = express();
    this.wss = new WebSocket.Server({ port: 3002 });
    this.browser = null;
  }

  async initialize() {
    this.browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    this.app.listen(3001, () => {
      console.log('渲染服务器启动在端口3001');
    });
  }

  async createRenderingSession(sceneConfig) {
    const page = await this.browser.newPage();
    // 设置3D场景
    // 配置视频流
    // 返回会话ID
  }
}
```

## ⚠️ 注意事项

### 性能考虑
- 大数据量操作使用分页和流式处理
- WebSocket连接数量监控和管理
- 3D渲染资源使用优化
- 数据库查询优化，避免N+1问题

### 兼容性保证
- 保持现有功能正常运行
- 新功能向后兼容
- 渐进式架构升级
- 考虑不同浏览器的兼容性

### 错误处理
- 统一的异常捕获和日志记录
- 用户友好的错误提示
- 系统故障恢复机制
- 详细的错误日志用于调试

### 安全考虑
- 输入验证和参数化查询
- 文件上传类型和大小限制
- API访问控制和速率限制
- 敏感信息的加密存储

## 🚀 开发建议

### 1. **先验证再实现**
- 小规模测试后再全面开发
- 使用MVP（最小可行产品）方法
- 渐进式功能增强

### 2. **模块化设计**
- 功能独立，接口清晰
- 易于测试和维护
- 支持热插拔和扩展

### 3. **文档同步**
- 代码和文档同步更新
- API文档使用标准格式
- 包含使用示例和错误处理

### 4. **性能监控**
- 关注系统资源使用情况
- 监控数据库连接池状态
- 记录关键操作的执行时间

### 5. **用户体验**
- 操作反馈和状态显示
- 加载动画和进度提示
- 错误信息清晰易懂

## 📝 代码模板和示例

### 标准路由模板
```javascript
const express = require('express');
const router = express.Router();
const dbManager = require('../modbus/db-manager');

// GET 查询数据
router.get('/api/data', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    
    const sql = 'SELECT * FROM table_name LIMIT ? OFFSET ?';
    const result = await dbManager.query(sql, [parseInt(limit), offset]);
    
    res.json({
      success: true,
      data: result,
      pagination: { page: parseInt(page), limit: parseInt(limit) }
    });
  } catch (error) {
    console.error('查询数据失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST 创建数据
router.post('/api/data', async (req, res) => {
  try {
    const { name, value } = req.body;
    
    // 输入验证
    if (!name || !value) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数'
      });
    }
    
    const sql = 'INSERT INTO table_name (name, value) VALUES (?, ?)';
    const result = await dbManager.query(sql, [name, value]);
    
    res.status(201).json({
      success: true,
      data: { id: result.insertId },
      message: '创建成功'
    });
  } catch (error) {
    console.error('创建数据失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
```

### 前端页面模板
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>功能页面</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body>
    <div class="container mt-4">
        <h1>功能页面</h1>
        
        <!-- 操作按钮 -->
        <div class="mb-3">
            <button id="loadDataBtn" class="btn btn-primary">加载数据</button>
            <button id="addDataBtn" class="btn btn-success">添加数据</button>
        </div>
        
        <!-- 数据表格 -->
        <div class="table-responsive">
            <table class="table table-striped">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>名称</th>
                        <th>值</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody id="dataTableBody">
                    <!-- 数据行将在这里动态生成 -->
                </tbody>
            </table>
        </div>
        
        <!-- 状态提示 -->
        <div id="statusMessage" class="alert" style="display: none;"></div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        // 显示状态消息
        function showMessage(message, type = 'info') {
            const messageDiv = document.getElementById('statusMessage');
            messageDiv.className = `alert alert-${type}`;
            messageDiv.textContent = message;
            messageDiv.style.display = 'block';
            
            setTimeout(() => {
                messageDiv.style.display = 'none';
            }, 3000);
        }
        
        // 加载数据
        async function loadData() {
            try {
                const response = await fetch('/api/data');
                const result = await response.json();
                
                if (result.success) {
                    renderTable(result.data);
                    showMessage('数据加载成功', 'success');
                } else {
                    showMessage(result.error, 'danger');
                }
            } catch (error) {
                showMessage('加载数据失败: ' + error.message, 'danger');
            }
        }
        
        // 渲染表格
        function renderTable(data) {
            const tbody = document.getElementById('dataTableBody');
            tbody.innerHTML = '';
            
            data.forEach(item => {
                const row = tbody.insertRow();
                row.innerHTML = `
                    <td>${item.id}</td>
                    <td>${item.name}</td>
                    <td>${item.value}</td>
                    <td>
                        <button class="btn btn-sm btn-warning" onclick="editItem(${item.id})">编辑</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteItem(${item.id})">删除</button>
                    </td>
                `;
            });
        }
        
        // 事件监听
        document.getElementById('loadDataBtn').addEventListener('click', loadData);
        
        // 页面加载时自动加载数据
        document.addEventListener('DOMContentLoaded', loadData);
    </script>
</body>
</html>
```

## 🔍 质量检查清单

在完成代码开发后，请确保：

- [ ] 代码遵循现有的命名规范和结构
- [ ] 使用了数据库连接池而非直接连接
- [ ] 包含适当的错误处理和用户反馈
- [ ] API响应格式统一且包含状态信息
- [ ] 前端页面具有良好的用户体验
- [ ] 新功能不影响现有功能的正常运行
- [ ] 代码包含必要的注释和文档
- [ ] 进行了基本的功能测试

通过遵循这些指导原则，Agent可以高效地扩展系统功能，同时保持代码质量和架构一致性。 
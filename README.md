# 污水处理站监控系统

## 项目简介

这是一个基于Node.js的污水处理站实时监控系统，提供设备数据采集、实时监控、报警管理和3D可视化大屏功能。

## 主要功能

### 核心功能
- **实时数据监控**：96个设备数据点的实时采集和显示
- **设备状态管理**：设备运行状态监控和控制
- **报警系统**：智能报警检测和通知
- **数据存储**：MySQL数据库存储历史数据
- **WebSocket通信**：实时数据推送

### 可视化功能
- **2D监控界面**：传统的监控面板
- **3D可视化大屏**：基于Three.js的3D场景展示
- **数据图表**：实时数据曲线和统计图表
- **设备分布图**：污水处理设备的空间布局

## 技术架构

### 后端技术
- **Node.js + Express**：Web服务器框架
- **MySQL**：数据库存储
- **WebSocket**：实时通信
- **Modbus协议**：设备数据采集

### 前端技术
- **HTML5 + CSS3 + JavaScript**：基础前端技术
- **Three.js**：3D图形渲染
- **Chart.js**：数据图表展示
- **WebSocket Client**：实时数据接收

### 部署技术
- **Docker**：容器化部署
- **Docker Compose**：多容器编排

## 项目结构

```
wzh18/
├── app.js                 # 主应用程序
├── package.json           # 项目依赖配置
├── init-database.js       # 数据库初始化脚本
├── public/               # 静态资源文件
│   ├── css/             # 样式文件
│   ├── js/              # 前端JavaScript
│   └── images/          # 图片资源
├── routes/              # 路由文件
├── services/            # 业务服务
├── modules/             # 功能模块
├── config/              # 配置文件
├── docs/                # 文档
├── sql/                 # SQL脚本
└── docker-compose.yml   # Docker编排文件
```

## 快速开始

### 环境要求
- Node.js 14.x 或更高版本
- MySQL 5.7 或更高版本
- Git

### 安装步骤

1. **克隆项目**
```bash
git clone https://github.com/your-username/wzh18.git
cd wzh18
```

2. **安装依赖**
```bash
npm install
```

3. **配置数据库**
```bash
# 创建数据库
mysql -u root -p
CREATE DATABASE sewage_monitoring;

# 初始化数据库
node init-database.js
```

4. **启动服务**
```bash
npm start
# 或者
node app.js
```

5. **访问系统**
- 主监控界面：http://localhost:3000
- 3D可视化大屏：http://localhost:3000/3d-dashboard.html

### Docker部署

1. **使用Docker Compose**
```bash
docker-compose up -d
```

2. **访问服务**
- 应用：http://localhost:3000
- 数据库：localhost:3306

## 功能特性

### 数据监控
- 96个数据点实时监控
- COD、pH、流量、水位等关键参数
- 设备运行状态显示
- 历史数据查询

### 报警系统
- 智能阈值检测
- 多级报警机制
- 声光报警提示
- 报警历史记录

### 3D可视化
- Three.js 3D场景渲染
- 设备3D模型展示
- 实时数据3D可视化
- 交互式场景操作

## 开发指南

### 目录说明
- `app.js`：主应用入口
- `routes/`：API路由定义
- `services/`：业务逻辑服务
- `public/`：前端静态文件
- `config/`：配置文件
- `docs/`：项目文档

### 开发环境
```bash
# 开发模式启动
npm run dev

# 生产模式启动
npm start
```

### 数据库管理
```bash
# 重置数据库
node init-database.js --reset

# 备份数据库
npm run backup
```

## 部署说明

### 生产环境部署
1. 配置环境变量
2. 构建Docker镜像
3. 使用Docker Compose部署
4. 配置反向代理（可选）

### 性能优化
- 数据库索引优化
- WebSocket连接池管理
- 静态资源CDN加速
- 缓存策略配置

## 维护指南

### 日志管理
- 应用日志：`logs/app.log`
- 错误日志：`logs/error.log`
- 访问日志：`logs/access.log`

### 监控指标
- 系统资源使用率
- 数据库连接状态
- WebSocket连接数
- API响应时间

## 贡献指南

1. Fork本项目
2. 创建功能分支
3. 提交代码更改
4. 发起Pull Request

## 许可证

本项目采用MIT许可证，详见LICENSE文件。

## 联系方式

如有问题或建议，请联系项目维护者。

---

**注意**：本项目为污水处理站监控系统，请确保在合适的网络环境中部署和使用。

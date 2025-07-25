# 工作内容管理功能使用说明

## 功能概述

工作内容管理功能允许用户管理两类工作内容：

1. **常规工作内容**：长期的、固定的或周期性的工作，如每日设备巡检、每周设备定检等
2. **临时工作内容**：临时添加的特定日期和时间的工作

系统提供直观的用户界面，方便用户添加、编辑、删除和查看工作内容，还能跟踪工作状态。

## 功能特点

- 支持常规工作设置不同周期（每日、每周、每月、自定义）
- 支持临时工作设置状态（待处理、进行中、已完成、已取消）
- 可查看指定日期的工作计划
- 支持设置工作优先级
- 支持设置工作开始和结束时间
- 直观的界面显示，包括状态、优先级和时间等信息

## 使用方法

### 访问功能

通过浏览器访问 `/work-tasks` 路径即可打开工作内容管理页面。

### 查看工作内容

系统提供三种视图模式：

1. **今日工作**：显示今日（或选定日期）的工作计划，包括来自常规和临时工作的所有项目
2. **常规工作**：显示所有常规工作内容
3. **临时工作**：显示所有临时工作内容

使用顶部导航栏可以在这三种视图之间切换。

### 添加工作内容

1. 点击界面右上方的"添加工作"按钮
2. 选择工作类型（常规/临时）
3. 填写工作信息，如标题、描述、时间等
4. 点击"保存"按钮

#### 常规工作内容

添加常规工作内容时，需要设置以下信息：

- 标题和描述
- 周期类型：
  - 每日：每天都会出现的工作
  - 每周：每周特定星期几出现的工作
  - 每月：每月特定日期出现的工作
  - 自定义：自定义多个特定日期的工作
- 开始和结束时间
- 状态（活跃/禁用）
- 优先级

#### 临时工作内容

添加临时工作内容时，需要设置以下信息：

- 标题和描述
- 日期
- 开始和结束时间
- 状态（待处理/进行中/已完成/已取消）
- 优先级

### 编辑工作内容

1. 在工作项右侧点击编辑按钮（铅笔图标）
2. 修改相关信息
3. 点击"保存"按钮

### 删除工作内容

1. 在工作项右侧点击删除按钮（垃圾桶图标）
2. 在确认对话框中点击"删除"按钮

### 更新临时工作状态

在今日工作视图中，临时工作项目会显示状态按钮，可以直接点击更新其状态：

- 待处理
- 进行中 
- 完成

## 技术实现

系统采用以下技术实现：

- 前端：HTML, CSS, JavaScript, Bootstrap 5, Flatpickr（日期选择器）
- 后端：Node.js, Express
- 数据库：MySQL

数据库中包含以下两个表：

1. `regular_work_tasks`：存储常规工作内容
2. `temporary_work_tasks`：存储临时工作内容

以及一个视图：

- `daily_work_plan`：合并今日的常规和临时工作内容

## 故障排除

如遇问题，请检查：

1. 数据库连接是否正常
2. 数据库表结构是否正确
3. 服务器日志中是否有错误信息
4. 浏览器控制台是否有报错

## 配置说明

数据库配置在 `routes/workTaskRoutes.js` 文件中，可根据实际环境修改以下配置：

```javascript
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '753456Chen*',
  database: process.env.DB_NAME || 'mqtt_data',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});
```

如果需要修改配置，可以通过环境变量或直接修改代码设置。 
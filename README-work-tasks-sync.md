# 工作任务同步功能

该功能用于每天定时将常规工作任务和临时工作任务同步到modbus_data_latest表，实现工作内容的集中管理和可视化展示。

## 功能概述

1. **数据库扩展**：
   - 扩展了modbus_data_latest表，添加了工作内容、工作类型、工作状态和任务ID字段
   - 支持存储常规工作和临时工作信息

2. **定时同步**：
   - 每天早上7点自动执行同步任务
   - 从regular_work_tasks和temporary_work_tasks表提取当天适用的工作任务
   - 将工作任务分配到modbus_data_latest表中的数据点

3. **工作任务管理**：
   - 提供Web界面查看和管理工作任务
   - 支持筛选不同类型和状态的工作任务
   - 支持更新工作任务的完成状态

4. **API接口**：
   - 提供手动同步工作任务的API
   - 提供更新工作任务状态的API
   - 提供查询带工作任务的数据点的API

## 文件结构

- `modbus/db-migration.js` - 数据库迁移脚本
- `modbus/work-task-sync-service.js` - 工作任务同步服务
- `public/work-tasks-view.html` - 工作任务管理页面
- `run-work-task-migration.js` - 迁移启动脚本
- `setup-work-tasks.sh` - Linux部署脚本
- `setup-work-tasks.bat` - Windows部署脚本

## 部署方法

### 方法一：使用部署脚本

在Windows系统上：
```
.\setup-work-tasks.bat
```

在Linux系统上：
```
chmod +x setup-work-tasks.sh
./setup-work-tasks.sh
```

### 方法二：手动部署

1. 执行数据库迁移
```
node run-work-task-migration.js
```

2. 重启服务器
```
# 停止当前服务
taskkill /F /IM node.exe   # Windows
pkill -f "node app.js"     # Linux

# 启动服务
node app.js
```

## 访问方式

工作任务管理页面：`http://localhost:3000/work-tasks-view`

## API接口说明

### 1. 手动同步工作任务

- **接口**：`POST /api/modbus/work-tasks/sync`
- **描述**：手动触发工作任务同步
- **返回示例**：
```json
{
  "success": true,
  "message": "工作任务同步成功",
  "date": "2023-05-21",
  "regularTasksCount": 5,
  "tempTasksCount": 3
}
```

### 2. 获取工作任务同步状态

- **接口**：`GET /api/modbus/work-tasks/sync/status`
- **描述**：获取工作任务同步服务的状态
- **返回示例**：
```json
{
  "success": true,
  "initialized": true,
  "syncActive": true,
  "syncHour": 7,
  "syncMinute": 0,
  "lastSyncDate": "2023-05-21",
  "timestamp": "2023-05-21T10:30:45.123Z"
}
```

### 3. 更新工作任务状态

- **接口**：`PUT /api/modbus/work-tasks/status/:id`
- **描述**：更新指定数据点的工作任务状态
- **参数**：
  - `id`：数据点ID（路径参数）
  - `status`：任务状态（请求体），可选值：`pending`、`completed`、`cancelled`
- **返回示例**：
```json
{
  "success": true,
  "message": "工作任务状态已更新",
  "data": {
    "dataPointId": "DP001",
    "status": "completed",
    "timestamp": "2023-05-21T10:35:12.456Z"
  }
}
```

### 4. 获取带工作任务的数据点列表

- **接口**：`GET /api/modbus/data-points/with-tasks`
- **描述**：获取包含工作任务的数据点列表
- **查询参数**：
  - `workType`：工作类型，可选值：`regular`、`temporary`
  - `status`：工作状态，可选值：`pending`、`completed`、`cancelled`
- **返回示例**：
```json
{
  "success": true,
  "dataPoints": [
    {
      "id": 1,
      "data_point_id": "DP001",
      "data_point_identifier": "temp_sensor_1",
      "data_point_name": "温度传感器1",
      "work_content": "检查传感器连接",
      "work_type": "regular",
      "work_status": "pending",
      "task_id": 101,
      "updated_at": "2023-05-21T07:00:12.345Z",
      "value": 25.5,
      "formatted_value": "25.5℃",
      "quality": "GOOD"
    }
  ],
  "count": 1,
  "timestamp": "2023-05-21T10:40:23.789Z"
}
```
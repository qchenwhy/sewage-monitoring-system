# 本地API解决方案

## 问题描述

系统尝试连接本地Dify API端点 `http://localhost/v1`，但连接失败，导致无法创建知识库和获取文档列表。

## 可能的原因

1. 本地没有运行Dify API服务
2. 本地Dify API服务运行在不同端口
3. API密钥格式不正确
4. 网络或防火墙问题
5. 404/405错误可能表明API路径不正确

## 解决方案

### 1. 确认本地API服务

确保本地Dify API服务正在运行，可以通过以下命令检查:

```bash
curl http://localhost/v1
```

如果服务正常，应该返回类似以下内容:

```json
{
  "welcome": "Dify OpenAPI",
  "api_version": "v1",
  "server_version": "1.x.x"
}
```

### 2. 检查API密钥

确保API密钥格式正确，不应包含前缀如"BEAR"，正确格式应为:

```
dataset-CBdZ3tu2yaTpd1mpjGhsLhaR
```

### 3. 本地代理解决方案

如果本地API服务运行在其他端口，可以使用以下方法:

1. 修改配置文件中的API端点指向正确端口
2. 使用代理转发请求

### 4. 访问调试工具

我们提供了以下调试工具帮助确认问题:

- API测试页面: http://localhost:3000/dify-test.html
- 本地API调试: http://localhost:3000/local-api-debug.html

### 5. 配置文件默认设置

确认配置文件(modbus/config.json)中保持以下设置:

```json
{
  "dify": {
    "enabled": true,
    "apiEndpoint": "http://localhost/v1",
    "apiKey": "dataset-CBdZ3tu2yaTpd1mpjGhsLhaR",
    "datasetId": "a085d987-4fe8-497d-9c91-74450ccce956", 
    "syncInterval": 3600000,
    "documentsPerDay": 24,
    "debug": true
  }
}
```

## 定时任务

定时任务脚本位于 `modbus/modbus-data-to-dify.js`，启动方式:

```bash
node modbus/modbus-data-to-dify.js
```

该脚本会每小时从modbus_data_latest表中获取数据并同步到Dify知识库。

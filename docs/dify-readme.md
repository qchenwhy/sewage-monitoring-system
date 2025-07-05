# Dify知识库集成功能

本模块提供将Modbus数据自动同步到Dify知识库的功能，实现数据的长期存储和智能检索。

## 快速开始

### 安装依赖

```bash
npm install axios@0.27.2 form-data@4.0.0 moment@2.29.4 node-cron@3.0.2
```

### 基本配置

1. 访问管理界面: `http://[系统地址]/dify-knowledge`
2. 配置API连接参数:
   - API地址: 通常为 `http://localhost/v1`
   - API密钥: 从Dify平台获取
   - 知识库ID: 从Dify平台获取或使用系统创建功能
3. 保存配置并启动同步

## 主要功能

- 创建和管理知识库
- 配置API连接参数
- 自动定时同步数据
- 手动同步数据
- 查看知识库文档列表和内容

## 文件结构

- `modbus/dify-knowledge-service.js`: 核心服务实现
- `modbus/modbus-data-scheduler.js`: 定时任务调度器
- `modbus/config.json`: 配置文件
- `public/dify-knowledge.html`: 管理界面

## 详细文档

更详细的使用说明请参考:
- [完整使用指南](./dify-knowledge-guide.md)
- [依赖清单](./dify-dependencies.json)

## 注意事项

- 确保系统能够正常访问Dify API
- 文档索引需要一定时间，在索引完成前无法添加新分段
- 定期检查同步状态和日志，确保数据正常同步 
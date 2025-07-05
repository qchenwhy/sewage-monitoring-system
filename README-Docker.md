# WZH17 工业物联网系统 Docker 部署指南

## 📋 系统要求

- Docker Engine 20.0+ 
- Docker Compose 2.0+
- 至少 4GB 可用内存
- 至少 10GB 可用磁盘空间

## 🚀 快速部署

### Windows 系统
```bash
# 双击运行部署脚本
docker-deploy.bat
```

### Linux/macOS 系统
```bash
# 给脚本执行权限
chmod +x docker-deploy.sh

# 运行部署脚本
./docker-deploy.sh
```

### 手动部署
```bash
# 1. 创建必要目录
mkdir -p data logs uploads downloads backups audio temp sql

# 2. 构建并启动服务
docker-compose up -d --build

# 3. 查看服务状态
docker-compose ps
```

## 🌐 访问地址

- **主应用**: http://localhost:3000
- **Modbus管理**: http://localhost:3000/modbus
- **工作任务**: http://localhost:3000/work-tasks-view
- **MySQL数据库**: localhost:3306
- **Redis缓存**: localhost:6379

## 📊 服务组件

| 服务 | 端口 | 说明 |
|------|------|------|
| app | 3000 | 主应用服务 |
| mysql | 3306 | MySQL 8.0 数据库 |
| redis | 6379 | Redis 缓存服务 |
| mqtt | 1883 | MQTT 消息服务 |

## 🔧 配置说明

### 环境变量配置
默认配置已在 `docker-compose.yml` 中设置，如需修改可编辑该文件或使用 `docker.env` 文件。

主要配置项：
- **数据库**: `DB_HOST=mysql`, `DB_PASSWORD=wzh123456`
- **应用端口**: `PORT=3000`
- **Modbus设备**: `MODBUS_HOST=192.168.1.100`

### 数据持久化
以下目录会被持久化保存：
- `./data` - 应用数据
- `./logs` - 日志文件
- `./uploads` - 上传文件
- `./downloads` - 下载文件
- `./backups` - 备份文件
- `mysql_data` - 数据库数据
- `redis_data` - Redis数据

## 📋 常用命令

```bash
# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f app      # 应用日志
docker-compose logs -f mysql    # 数据库日志
docker-compose logs -f redis    # Redis日志

# 重启服务
docker-compose restart

# 停止服务
docker-compose down

# 重新构建并启动
docker-compose up -d --build

# 进入应用容器
docker-compose exec app sh

# 进入数据库容器
docker-compose exec mysql mysql -u root -p

# 清理所有数据（注意：会删除所有数据）
docker-compose down -v
```

## 🔧 故障排除

### 1. 端口冲突
如果端口被占用，可修改 `docker-compose.yml` 中的端口映射：
```yaml
ports:
  - "3001:3000"  # 修改为其他端口
```

### 2. 内存不足
增加 Docker 可用内存或添加内存限制：
```yaml
deploy:
  resources:
    limits:
      memory: 1G
```

### 3. 数据库连接失败
检查数据库是否启动完成：
```bash
docker-compose logs mysql
```

### 4. 权限问题（Linux）
设置目录权限：
```bash
sudo chown -R $USER:$USER data logs uploads downloads backups audio temp
chmod -R 755 data logs uploads downloads backups audio temp
```

## 🔄 数据迁移

### 导出现有数据
```bash
# 导出数据库
docker-compose exec mysql mysqldump -u root -pwzh123456 mqtt_data > backup.sql

# 备份文件
tar -czf data_backup.tar.gz data uploads downloads backups
```

### 导入数据
```bash
# 导入数据库
docker-compose exec -T mysql mysql -u root -pwzh123456 mqtt_data < backup.sql

# 恢复文件
tar -xzf data_backup.tar.gz
```

## 🎯 生产环境优化

### 1. 安全配置
- 修改默认密码
- 使用 HTTPS
- 配置防火墙
- 定期更新镜像

### 2. 性能优化
```yaml
# 在 docker-compose.yml 中添加
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
    reservations:
      memory: 1G
```

### 3. 监控配置
可集成 Prometheus + Grafana 进行监控：
```yaml
prometheus:
  image: prom/prometheus
  ports:
    - "9090:9090"
```

## 📞 技术支持

如遇问题，请查看：
1. 应用日志：`docker-compose logs -f app`
2. 系统资源：`docker stats`
3. 网络连接：`docker network ls`

## 🔒 安全注意事项

1. **修改默认密码**：部署后请立即修改数据库密码
2. **网络隔离**：生产环境建议使用内部网络
3. **数据备份**：定期备份重要数据
4. **SSL证书**：生产环境配置 HTTPS
5. **访问控制**：配置适当的防火墙规则 
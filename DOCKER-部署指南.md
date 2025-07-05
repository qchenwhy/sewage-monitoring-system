# Docker 部署完整指南

## 📋 部署前准备

### 1. 环境检查
```bash
# 检查Docker是否安装
docker --version
docker-compose --version

# 检查Docker服务状态
docker info
```

### 2. 项目文件确认
确保项目目录包含以下文件：
```
wzh17/
├── Dockerfile                    # 主Dockerfile
├── Dockerfile.local             # 国内镜像版
├── Dockerfile.simple            # 简化版
├── docker-compose.yml           # 主配置文件
├── docker-compose-local.yml     # 国内镜像版
├── docker-compose-offline.yml   # 离线版
├── docker-compose-simple.yml    # 简化版
├── .dockerignore                # 忽略文件
├── daemon.json                  # Docker配置
└── package.json                 # 项目依赖
```

## 🚀 部署步骤详解

### 方案1：标准部署（需要国外网络）

#### 步骤1：停止现有服务
```bash
# 如果有运行中的容器，先停止
docker-compose down
```

#### 步骤2：构建并启动服务
```bash
# 构建镜像并启动所有服务
docker-compose up -d --build

# 查看启动状态
docker-compose ps
docker-compose logs
```

#### 步骤3：验证部署
```bash
# 检查服务状态
docker-compose ps

# 查看应用日志
docker-compose logs app

# 查看数据库日志
docker-compose logs mysql
```

### 方案2：国内网络部署（推荐）

#### 步骤1：配置镜像加速器
```bash
# 1. 复制daemon.json到Docker配置目录
# Windows: C:\Users\%USERNAME%\.docker\daemon.json
# Linux/Mac: /etc/docker/daemon.json

# 2. 重启Docker服务
```

#### 步骤2：使用国内镜像部署
```bash
# 使用国内镜像源部署
docker-compose -f docker-compose-local.yml up -d --build
```

### 方案3：简化部署（仅应用服务）

#### 步骤1：使用简化配置
```bash
# 只启动应用，不包含MySQL和Redis
docker-compose -f docker-compose-simple.yml up -d --build
```

#### 步骤2：配置外部数据库
需要手动配置MySQL数据库连接

## 🔧 常用Docker命令

### 服务管理
```bash
# 启动所有服务
docker-compose up -d

# 停止所有服务
docker-compose down

# 重启特定服务
docker-compose restart app

# 查看服务状态
docker-compose ps
```

### 日志查看
```bash
# 查看所有服务日志
docker-compose logs

# 查看特定服务日志
docker-compose logs app
docker-compose logs mysql

# 实时跟踪日志
docker-compose logs -f app
```

### 进入容器
```bash
# 进入应用容器
docker-compose exec app sh

# 进入MySQL容器
docker-compose exec mysql bash
```

### 数据管理
```bash
# 查看数据卷
docker volume ls

# 备份数据卷
docker run --rm -v wzh17_mysql_data:/data -v $(pwd):/backup alpine tar czf /backup/mysql_backup.tar.gz -C /data .

# 恢复数据卷
docker run --rm -v wzh17_mysql_data:/data -v $(pwd):/backup alpine tar xzf /backup/mysql_backup.tar.gz -C /data
```

## 🌐 网络配置

### 端口映射
- **应用服务**: http://localhost:3000
- **MySQL数据库**: localhost:3306
- **Redis缓存**: localhost:6379
- **MQTT服务**: localhost:1883

### 内部网络
容器间通过内部网络 `wzh_network` 通信：
- app 容器可通过 `mysql` 主机名访问数据库
- app 容器可通过 `redis` 主机名访问缓存

## 🔍 故障排除

### 1. 镜像拉取失败
```bash
# 检查网络连接
ping docker.io

# 使用国内镜像
docker-compose -f docker-compose-local.yml up -d --build

# 手动拉取镜像
docker pull node:18-alpine
docker pull mysql:8.0
docker pull redis:7-alpine
```

### 2. 端口冲突
```bash
# 检查端口占用
netstat -an | findstr 3000
netstat -an | findstr 3306

# 修改docker-compose.yml中的端口映射
```

### 3. 数据库连接失败
```bash
# 检查MySQL容器状态
docker-compose logs mysql

# 进入MySQL容器检查
docker-compose exec mysql mysql -u root -p
```

### 4. 应用启动失败
```bash
# 查看应用日志
docker-compose logs app

# 检查环境变量
docker-compose exec app env

# 重新构建镜像
docker-compose build --no-cache app
```

## 📊 性能监控

### 资源使用
```bash
# 查看容器资源使用
docker stats

# 查看特定容器资源
docker stats wzh17_app_1
```

### 健康检查
```bash
# 查看容器健康状态
docker-compose ps

# 手动健康检查
curl http://localhost:3000
```

## 🎯 生产环境建议

### 1. 安全配置
- 修改默认密码
- 配置防火墙规则
- 使用HTTPS证书
- 定期更新镜像

### 2. 备份策略
- 定期备份数据卷
- 备份配置文件
- 设置自动备份脚本

### 3. 监控告警
- 配置日志收集
- 设置性能监控
- 配置故障告警

## 📝 部署检查清单

- [ ] Docker和docker-compose已安装
- [ ] 网络连接正常
- [ ] 端口未被占用
- [ ] 配置文件正确
- [ ] 数据目录权限正确
- [ ] 防火墙规则配置
- [ ] 备份策略设置

## 🆘 技术支持

如遇到问题：
1. 查看容器日志: `docker-compose logs`
2. 检查容器状态: `docker-compose ps`
3. 重启服务: `docker-compose restart`
4. 完全重新部署: `docker-compose down && docker-compose up -d --build` 
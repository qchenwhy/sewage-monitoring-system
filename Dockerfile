# 使用 Node.js 18 LTS 作为基础镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 安装必要的系统依赖
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# 设置 Puppeteer 使用系统安装的 Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装项目依赖
RUN npm ci --only=production

# 复制项目文件
COPY . .

# 创建必要的目录
RUN mkdir -p logs uploads downloads temp data backups audio public/recordings

# 设置目录权限
RUN chmod -R 755 logs uploads downloads temp data backups audio public/recordings

# 暴露端口
EXPOSE 3000

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const http = require('http'); \
    const options = { host: 'localhost', port: process.env.PORT || 3000, path: '/', timeout: 2000 }; \
    const req = http.request(options, (res) => { \
      process.exit(res.statusCode === 200 ? 0 : 1); \
    }); \
    req.on('error', () => process.exit(1)); \
    req.end();"

# 启动应用
CMD ["npm", "start"] 
# syntax=docker/dockerfile:1

# ===== 构建阶段 =====
FROM node:20-alpine AS build
WORKDIR /app
# 启用 corepack 以使用 pnpm
RUN corepack enable
# 先只装依赖，利用 Docker 层缓存
COPY package.json ./
RUN pnpm install --no-frozen-lockfile
# 再拷贝源码并构建
COPY . .
RUN pnpm run build

# ===== 运行阶段：nginx 提供静态文件 =====
FROM nginx:alpine
# 构建产物拷到 nginx 静态目录
COPY --from=build /app/dist /usr/share/nginx/html
# 自定义 nginx 配置（SPA history 路由 fallback + gzip）
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

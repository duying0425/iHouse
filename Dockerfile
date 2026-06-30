# syntax=docker/dockerfile:1

# ===== 构建阶段 =====
FROM node:20-alpine AS build
RUN apk add --no-cache git
RUN corepack enable

# clone 仓库（main 分支，浅克隆）
RUN git clone --depth=1 --branch main \
      "https://github.com/duying0425/iHouse.git" /repo

WORKDIR /repo

# 装依赖并构建
RUN pnpm install --no-frozen-lockfile
RUN pnpm run build

# ===== 运行阶段：nginx 提供静态文件 =====
FROM nginx:alpine
COPY --from=build /repo/dist /usr/share/nginx/html
COPY --from=build /repo/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

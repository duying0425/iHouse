# syntax=docker/dockerfile:1

# 居所图鉴 (iHouse) Docker 部署镜像
# 使用本地源码构建（构建上下文 = 仓库根目录）。
# 部署：git clone 本仓库 → docker compose up -d --build
# 更新：git pull → docker compose build → docker compose up -d

# ===== 构建阶段 =====
FROM node:20-alpine AS build

# python3/make/g++: better-sqlite3 原生编译
RUN apk add --no-cache python3 make g++
# 固定 pnpm 版本：pnpm 11+ 需要 Node 22，本镜像为 Node 20
RUN corepack enable && corepack prepare pnpm@10.18.2 --activate

# 复制本地源码（.dockerignore 已排除依赖、构建产物、数据目录和所有 .env 密钥文件）
WORKDIR /repo
COPY . .

# 构建前端
RUN pnpm install --no-frozen-lockfile
RUN pnpm run build

# 安装后端依赖（better-sqlite3 需原生编译）
WORKDIR /repo/server
RUN npm install --omit=dev

# ===== 运行阶段 =====
FROM node:20-alpine
WORKDIR /app

# wget 用于容器健康检查
RUN apk add --no-cache wget

COPY --from=build /repo/dist ./dist
COPY --from=build /repo/server ./server

ENV PORT=3000
ENV DATA_DIR=/app/server/data
ENV TZ=Asia/Shanghai

EXPOSE 3000

# 健康检查：每 30 秒请求 /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT}/api/health" || exit 1

CMD ["node", "server/index.js"]

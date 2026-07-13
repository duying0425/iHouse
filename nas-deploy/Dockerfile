# syntax=docker/dockerfile:1

# 居所图鉴 (iHouse) NAS 部署镜像
# 此 Dockerfile 会从 GitHub 自动拉取最新代码并构建，无需本地源码。
# 配合同目录 docker-compose.yml 使用，详见其中的部署说明。

# ===== 构建阶段 =====
FROM node:20-alpine AS build

# git: clone 仓库；python3/make/g++: better-sqlite3 原生编译
RUN apk add --no-cache git python3 make g++
# 固定 pnpm 版本：pnpm 11+ 需要 Node 22，本镜像为 Node 20
RUN corepack enable && corepack prepare pnpm@10.18.2 --activate

# CACHEBUST：更新代码时在 docker-compose.yml 中改这个值即可打破缓存重新拉取源码
ARG CACHEBUST=1
# clone 仓库（浅克隆，可通过 build-arg 切换分支）
ARG GIT_REPO=https://github.com/duying0425/iHouse.git
ARG GIT_BRANCH=main
RUN echo "cache bust: $CACHEBUST" && git clone --depth=1 --branch ${GIT_BRANCH} "${GIT_REPO}" /repo

# 构建前端
WORKDIR /repo
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

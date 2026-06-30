# syntax=docker/dockerfile:1

# ===== 构建阶段 =====
FROM node:20-alpine AS build
# git: clone 仓库；python3/make/g++: better-sqlite3 原生编译
RUN apk add --no-cache git python3 make g++
RUN corepack enable

# clone 仓库（main 分支，浅克隆）
RUN git clone --depth=1 --branch main \
      "https://github.com/duying0425/iHouse.git" /repo

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
COPY --from=build /repo/dist ./dist
COPY --from=build /repo/server ./server
ENV PORT=3000
ENV DATA_DIR=/app/server/data
EXPOSE 3000
CMD ["node", "server/index.js"]

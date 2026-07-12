# iHouse · 居所图鉴 — 技术架构文档

> 版本：v2 · 最后更新：2026-07-01

## 1. 总体架构

```
┌─────────────────────────────────────────────────────┐
│  浏览器（多设备）                                    │
│  ┌───────────────────────────────────────────────┐  │
│  │ React SPA（Vite 构建）                         │  │
│  │  ├─ zustand store（持久化中间件）              │  │
│  │  ├─ serverStorage 适配器（服务器优先+IDB缓存） │  │
│  │  └─ IndexedDB（本地缓存/离线兜底）            │  │
│  └───────────────────────────────────────────────┘  │
│              ↕ HTTP (/api/home)                      │
└─────────────────────────────────────────────────────┘
                  ↕
┌─────────────────────────────────────────────────────┐
│  Node.js 服务端（Express）                          │
│  ├─ GET  /api/home      读取全部数据                │
│  ├─ PUT  /api/home      整体覆盖写入                │
│  ├─ GET  /api/health    健康检查                    │
│  └─ 静态文件服务（dist/，SPA fallback）             │
│              ↕                                       │
│  SQLite（better-sqlite3，WAL 模式）                 │
│  └─ home 表：单行（id=1）存全量 JSON                │
└─────────────────────────────────────────────────────┘
              ↕ 挂载 volume
┌─────────────────────────────────────────────────────┐
│  ./data/home.db  （持久化，NAS 上挂载到卷）         │
└─────────────────────────────────────────────────────┘
```

## 2. 技术栈

### 前端
- **React 18 + TypeScript**：UI 框架
- **Vite**：构建工具，dev server 代理 `/api` 到 3000 端口
- **Tailwind CSS**：样式，暖色调（cream/ink/clay）自定义主题
- **zustand + persist 中间件**：状态管理 + 持久化
- **React Router**：路由
- **window.print() + @media print CSS**：PDF 导出（原生打印方案）

### 后端
- **Node.js 20 + Express**：HTTP 服务
- **better-sqlite3**：同步 SQLite 驱动，WAL 模式提升并发
- 单文件 `server/index.js`，约 85 行，零冗余

### 部署
- **Docker 多阶段构建**：build 阶段 git clone + pnpm build + npm install；runtime 阶段仅 dist/ + server/
- **Synology Container Manager**：`nas-deploy/` 目录自包含，只导入 compose YAML，Dockerfile 内 `git clone` 拉代码

## 3. 关键设计

### 3.1 存储方案：服务器优先 + 本地缓存

**为什么不用纯本地？** 多设备（电脑录入、手机查阅）需要共享同一份数据。

**为什么不用纯服务器？** 服务器宕机时本地仍可离线浏览/录入，联网后自动同步。

**实现**（`src/serverStorage.ts`）：
- `getItem`：先 `fetch('/api/home')`，成功则刷新本地 IndexedDB 缓存并返回；失败回退到 IndexedDB
- `setItem`：立即写 IndexedDB + 600ms 防抖同步到服务器
- `visibilitychange` 监听：页面隐藏时用 `keepalive: true` 尽力推送最后一次变更
- 单用户场景采用 **last-write-wins**，不做冲突合并

**SQLite 单行存储**：整个 Home 对象序列化为 JSON 存入 `home` 表 `id=1` 行。读写都是整体覆盖，简单可靠，单用户场景下无并发问题。

### 3.2 状态管理（`src/store.ts`）

zustand + persist 中间件，关键点：
- `partialize`：排除 `_hasHydrated` 标志，不持久化
- `onRehydrateStorage`：水合完成后置 `_hasHydrated = true`，门控首屏避免示例数据闪现
- `migrate`：v1 → v2 schema 迁移（`overviewImage/detailImage` 合并为 `images[]`，`item.floorPlanPos` 迁移为 `areaImageId/areaImagePos`）
- `version: 2`：persist 版本号

### 3.3 图片处理

- **上传/粘贴压缩**（`src/utils/compressImage.ts`）：canvas 缩放 + `toDataURL('image/jpeg', 0.82-0.85)`
  - 户型图 ≤2000px
  - 区域图 ≤1600px
  - 物品图 ≤1200px
- **存储为 base64**：直接嵌入 JSON，随 Home 一起存 SQLite，无需独立文件存储
- **代价**：SQLite 单行可能达到几 MB（含多张图），`express.json({ limit: "256mb" })` 放宽请求体限制

### 3.4 PDF 导出

**组件**：`src/components/PrintExportRenderer.tsx`

**原理**：
1. `createPortal` 把所有页面挂到 `document.body` 下的 `#print-export-root`
2. 每页 A4 原尺寸（210mm × 297mm），`PageFrame` 传 `print` prop 跳过缩放 transform
3. 500ms 后调用 `window.print()`
4. `@media print` CSS：`body * { visibility: hidden }`，仅 `#print-export-root` 可见，每页 `page-break-after: always`
5. `afterprint` 事件清理 DOM

**优点**：文字矢量、图片原生渲染、秒级完成
**缺点**：版式依赖浏览器打印引擎，不同浏览器略有差异

### 3.5 维护提醒

**模块**：`src/utils/maintenance.ts`

**原理**：
- Item 携带 `maintenanceCycle`（天）和 `lastMaintenanceDate`（YYYY-MM-DD）两个可选字段
- `getMaintenanceStatus(item, now)` 计算下次维护日 = `lastMaintenanceDate + cycle 天`，与今天比较得出 5 档状态：`none / ok / due-soon(≤7天) / overdue / pending-setup`
- 日期按「天」零时计算（避免时区把当天算成 -1），`parseDateDay` 严格校验 YYYY-MM-DD 格式
- 首页 `maintenanceAlerts` 用 `useMemo` 汇总所有需提醒物品，按 `overdue → due-soon → pending-setup` 紧急度排序
- 表单内 `MaintenancePreview` 实时预览：用户填周期/日期时即可看到下次到期日与状态

**测试**：`src/utils/maintenance.test.ts` 24 个用例覆盖状态计算、跨年/闰年日期、边界条件、文案生成。

### 3.6 路由与页面

```
/                → 首页（户型图 + 区域列表 + 维护提醒面板）
/setup           → 户型设置（导入户型图、数据维护）
/search          → 检索
/area/:id        → 区域详情（区域图 + 物品列表）
/item/:id        → 物品详情（含维护徽标 + 高亮提醒）
/item/new?area=  → 新增物品
/item/:id/edit   → 编辑物品
/export          → 导出 PDF
```

## 4. 项目结构

```
iHouse/
├── src/                          # 前端源码
│   ├── components/
│   │   ├── FloorPlan.tsx         # 户型图 + 区域锚点
│   │   ├── AreaImageCanvas.tsx   # 区域图 + 物品位置标注
│   │   ├── ItemForm.tsx          # 物品录入（含粘贴上传、压缩、维护周期）
│   │   ├── SafeImage.tsx         # 图片带占位/兜底
│   │   ├── ItemCard.tsx
│   │   ├── TopBar.tsx / PageLayout.tsx / Empty.tsx
│   │   ├── export/
│   │   │   └── PdfPages.tsx      # PDF 各页组件（封面/户型/区域/物品）
│   │   └── PrintExportRenderer.tsx # 原生打印导出（window.print）
│   ├── pages/                    # 路由页面
│   ├── data/seed.ts              # 示例数据（含维护周期演示）
│   ├── lib/utils.ts              # cn 类名合并
│   ├── utils/
│   │   ├── compressImage.ts      # 图片压缩
│   │   ├── upload.ts             # 图片上传到服务器
│   │   ├── maintenance.ts        # 维护状态计算（5 档）
│   │   └── *.test.ts             # 单元测试
│   ├── store.ts                  # zustand store（persist + serverStorage）
│   ├── serverStorage.ts          # 服务器优先 + IndexedDB 缓存适配器
│   ├── uiStore.ts                # UI 状态（非持久化）
│   ├── types.ts                  # 类型定义
│   ├── App.tsx / main.tsx
│   └── index.css                 # Tailwind + @media print
├── server/
│   ├── index.js                  # Express + better-sqlite3
│   ├── utils.js                  # 后端工具（含测试）
│   ├── package.json
│   └── data/                     # SQLite 数据库（.gitignore）
├── docs/                         # 文档
│   ├── PRD.md
│   ├── architecture.md
│   └── changelog.md
├── nas-deploy/                   # NAS 部署（自包含）
│   ├── Dockerfile                # 多阶段构建（git clone → build → 运行）
│   └── docker-compose.yml        # Container Manager 导入用
├── README.md
├── package.json / pnpm-lock.yaml
├── tsconfig.json / vite.config.ts
├── tailwind.config.js / postcss.config.js
└── eslint.config.js
```

## 5. 部署架构

### 5.1 本地开发

```bash
pnpm install
cd server && npm install && cd ..
# 终端1：后端
cd server && node index.js    # :3000
# 终端2：前端
pnpm dev                       # :5173，/api 代理到 3000
```

### 5.2 生产（单进程）

```bash
pnpm build                     # dist/
cd server && npm install
node server/index.js           # :3000，同时提供 API + 静态前端
```

### 5.3 Docker / NAS

部署文件集中在 `nas-deploy/` 目录，自包含（不依赖本地源码，Dockerfile 内 `git clone` 拉取最新代码）。

```dockerfile
# nas-deploy/Dockerfile — 多阶段：build 阶段 clone + 构建，runtime 阶段仅运行时
FROM node:20-alpine AS build
RUN apk add --no-cache git python3 make g++
RUN corepack enable
ARG GIT_REPO=https://github.com/duying0425/iHouse.git
ARG GIT_BRANCH=main
RUN git clone --depth=1 --branch ${GIT_BRANCH} "${GIT_REPO}" /repo
WORKDIR /repo
RUN pnpm install --no-frozen-lockfile
RUN pnpm run build
WORKDIR /repo/server
RUN npm install --omit=dev

FROM node:20-alpine
RUN apk add --no-cache wget
WORKDIR /app
COPY --from=build /repo/dist ./dist
COPY --from=build /repo/server ./server
ENV PORT=3000
ENV DATA_DIR=/app/server/data
ENV TZ=Asia/Shanghai
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT}/api/health" || exit 1
CMD ["node", "server/index.js"]
```

**NAS 部署要点**：
- Synology Container Manager 只支持导入 compose YAML，不能执行命令
- 因此 Dockerfile 内 `git clone` 拉代码，compose 文件只需 `build: { context: . }`
- 数据卷挂载 `./data:/app/server/data`，重建容器不丢数据
- 更新：代码推到 GitHub 后，在 Container Manager 对项目停止 → 构建 → 启动

## 6. 数据迁移与备份

### 6.1 跨环境迁移
- **方式一（推荐，完整迁移）**：直接拷贝 `server/data/` 整个目录到新环境（含 `home.db` + `images/`）。NAS 部署时打包为 zip 通过 File Station 上传解压。
- **方式二（仅结构数据）**：「设置 → 数据维护 → 导出 JSON」，新环境「导入备份」。⚠️ 图片已提取为独立文件，JSON 不含图片数据，需单独拷贝 `images/` 目录。
- **方式三（纯前端迁移）**：浏览器 IndexedDB 缓存会在首次访问时自动读取并同步到新服务器（不含图片文件）

### 6.2 Schema 迁移
persist 中间件 `version: 2` + `migrate` 函数自动处理 v1 → v2：
- `area.overviewImage/detailImage` → `area.images[]`
- `item.floorPlanPos` → `item.areaImageId/areaImagePos`

## 7. 已知限制

- SQLite 单行存全量 JSON：单用户场景够用，但全量写入开销随数据增长而增加（目前几 MB 量级无问题）
- 图片存 base64：体积膨胀约 33%，但简化了存储（无独立文件管理）
- last-write-wins：多设备同时编辑可能互相覆盖（单用户家庭场景风险低）
- 离屏截图方案已完全废弃，统一使用浏览器原生打印，保障导出效率与文字矢量清晰度

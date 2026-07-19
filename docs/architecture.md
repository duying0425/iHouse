# iHouse · 居所图鉴 — 技术架构文档

> 版本：v3 · 最后更新：2026-07-19

## 1. 总体架构

```text
┌──────────────────────────────────────────────────────────┐
│ 浏览器（多设备）                                         │
│ React SPA                                                │
│ ├─ ItemForm：拍照/上传、AI 手动触发、仅空字段回填        │
│ ├─ zustand + serverStorage：服务器优先、IDB 离线缓存     │
│ └─ authStore：Bearer Token + 当前房屋上下文              │
└───────────────┬──────────────────────────────────────────┘
                │ 同源 HTTP /api/*
┌───────────────▼──────────────────────────────────────────┐
│ Node.js 20 + Express                                     │
│ ├─ /api/auth/*、/api/me：账户与会话                      │
│ ├─ /api/houses/*：房屋、成员、数据与 ZIP 备份            │
│ ├─ /api/upload、/api/images/*：图片存取                  │
│ ├─ /api/ai/recognize-item：鉴权、图片读取、上游代理      │
│ ├─ /api/query/*：结构化检索                              │
│ └─ dist/ 静态文件与 SPA fallback                         │
└───────┬───────────────────────────────┬──────────────────┘
        │                               │ 仅用户点击 AI 识别
        │                               ▼
        │                      Chat Completions 兼容 AI API
        │                      图片 data URL + iHouse 提示协议
        ▼
SQLite（WAL）+ 图片文件
server/data/home.db
server/data/images/
```

## 2. 技术栈

### 前端
- **React 18 + TypeScript**：UI 框架
- **Vite**：构建工具，dev server 代理 `/api` 到 3000 端口
- **Tailwind CSS**：样式，暖色调（cream/ink/clay）自定义主题
- **zustand + persist 中间件**：状态管理 + 持久化
- **React Router**：路由

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
- `server/index.js` 路由层
- `server/auth.js`：鉴权模块（scrypt 密码哈希、token 生成与校验、分享码、用户名/密码格式校验、`createAuthMiddleware` 中间件工厂）。
- `server/index.js` 中的 Cloudflare Turnstile 验证：当环境配置了 `TURNSTILE_SITE_KEY` 与 `TURNSTILE_SECRET_KEY` 时，在登录与注册接口自动启用人机验证，调用上游 `TURNSTILE_VERIFY_URL` 验证 Token。
- `server/utils.js`：Base64 提取、`collectImageRefs` 图片引用收集工具（含单元测试）
- `server/query.js`：结构化查询纯函数模块（含单元测试），未来 AI 工具可直接复用
- `server/ai-recognition.js`：iHouse 识别提示协议、Chat Completions 调用、图片安全读取、返回解析与确定性规范化
- `server/ai-assistant.js`：语音智能查找助理，整合物品位置索引并通过 LLM 实现模糊匹配与智能纠错，自带思考链清理与文本兜底机制
- `server/ai-tts.js`：语音合成（TTS）接口，实现 OpenAI 音频合成接口规范的代理转发（如 VoxCPM），并自动兼容浏览器本地发音
- **dotenv**：本地开发从根目录 `.env` 读取 AI 配置；生产由 Docker Compose 注入环境变量

### 部署
- **Docker 多阶段构建**：build 阶段 COPY 本地源码 + pnpm build + npm install；runtime 阶段仅 dist/ + server/
- **Docker Compose**：`Dockerfile` 与 `docker-compose.yml` 位于仓库根目录，`git clone` 后 `docker compose up -d --build` 即可；更新时 `git pull` → `docker compose build`
- **部署手册**：`docs/deployment.md` 记录生产环境变量、HTTPS、NAS、备份、升级、回滚与排障

## 3. 关键设计

### 3.1 存储方案：服务器优先 + 本地缓存

**为什么不用纯本地？** 多设备（电脑录入、手机查阅）需要共享同一份数据。

**为什么不用纯服务器？** 服务器宕机时本地仍可离线浏览/录入，联网后自动同步。

**实现**（`src/serverStorage.ts`）：
- `getItem`：根据当前房屋请求 `/api/houses/:id/data`，成功则刷新该房屋的 IndexedDB 缓存并返回；失败回退到对应房屋缓存
- `setItem`：立即写 IndexedDB + 600ms 防抖同步到服务器
- `visibilitychange` 监听：页面隐藏时用 `keepalive: true` 尽力推送最后一次变更
- 同一房屋采用 **last-write-wins**，不做复杂冲突合并

**SQLite + JSON 文档列**：SQLite 是真实数据库；每套房屋的 Home 对象序列化为 JSON 存入 `houses.data TEXT`。`users/sessions/house_members` 使用关系表，房屋业务文档按房屋整体覆盖。旧 `home(id=1)` 表仅保留给历史单房屋数据迁移。

### 3.2 状态管理（`src/store.ts`）

zustand + persist 中间件，关键点：
- `partialize`：排除 `_hasHydrated` 标志，不持久化
- `onRehydrateStorage`：水合完成后置 `_hasHydrated = true`，门控首屏避免示例数据闪现
- `migrate`：v1 → v2 处理区域多图；v2 → v3 增加房屋文档版本和正式物品收纳关系
- `version: 3`：persist 版本号；`normalizeHomeData` 同时清理悬空/循环引用，并把收纳子树归一到容器所在区域

### 3.3 图片处理

- **上传/粘贴压缩**（`src/utils/compressImage.ts`）：canvas 缩放 + `toDataURL('image/jpeg', 0.82-0.85)`
  - 户型图 ≤2000px
  - 区域图 ≤1600px
  - 物品图 ≤1200px
- **存储为图片文件**：前端上传压缩后的 base64，服务端按内容哈希写入 `server/data/images/`，Home JSON 只保留 `/api/images/...` URL
- **兼容旧数据**：服务端仍可识别 Home JSON 中的 base64，并在写入或备份导入时提取为图片文件；`express.json({ limit: "256mb" })` 兼容迁移请求

### 3.4 AI 图片识别

**前端模块**：`src/utils/aiRecognition.ts` + `src/components/ItemForm.tsx`
**后端模块**：`server/ai-recognition.js` + `POST /api/ai/recognize-item`

调用链：

1. 浏览器先按既有流程压缩并上传主图，表单持有 `/api/images/<hash>.<ext>` 或离线 data URL。
2. 用户点击“AI 识别”，前端通过 `authFetch` 发送图片引用；没有登录时由统一鉴权返回 401。
3. 后端只接受受控 data URL 或本服务 `/api/images/` 文件，最大 10MB；不抓取任意外部 URL，避免 SSRF。
4. 后端把图片转换成 `data:image/...;base64`，以标准 Chat Completions 图片消息调用配置的上游模型。
5. 系统提示固定角色、事实优先和 JSON-only；任务提示定义主物品选择、iHouse 六分类边界、字段证据标准和固定 10 键协议。
6. 返回层兼容纯 JSON、Markdown 代码块或前后带少量说明的内容，再验证名称、分类、未知值、标签、规格、估价、置信度和备注。
7. 前端在响应到达时重新读取最新表单，只填空字段；若识别期间图片已更换则丢弃旧结果。

稳定性与安全边界：

- API Key 仅从 `AI_API_KEY`/`NEW_API_KEY` 服务端环境变量读取，不进入前端 bundle。
- `AI_API_URL` 优先于 `AI_API_BASE_URL`；根地址会自动补全 `/v1/chat/completions`。
- 请求默认 60 秒超时，可配置 5-120 秒；网络错误及 429/5xx 瞬时状态最多重试一次。
- 上游 401/403、429、超时、无效响应和未识别到物品映射为稳定的中文错误，不回传上游正文。
- 不使用 `/v1/responses`、file_id、PDF/Office、tool calling 或 Structured Outputs，保持与当前 New API 能力一致。
- AI 是辅助录入而非事实来源；估价取区间中值并保留原区间，保存前由用户核对。

### 3.5 PDF 导出

**组件**：`src/components/PrintExportRenderer.tsx`

**原理**：
1. `createPortal` 把所有页面挂到 `document.body` 下的 `#print-export-root`
2. `exportModel.ts` 先生成与 UI 解耦的逻辑页：详细档案为 A4，紧凑模式为 A5
3. 小册子逻辑页补齐四的倍数，按「末页+首页 / 第 2 页+倒数第 2 页」规则拼成 A4 横向正反面
4. 等待 `document.fonts.ready`、全部图片 `load/error/decode` 和两个布局帧后调用 `window.print()`
5. 导出器按所选模式注入明确的 `@page` A4 横向/纵向规则；`@media print` 仅显示打印容器并强制逐面分页
6. `afterprint` 或窗口重新聚焦后清理 DOM

**优点**：文字矢量、图片原生渲染、秒级完成
**缺点**：版式依赖浏览器打印引擎，不同浏览器略有差异

### 3.6 维护提醒

**模块**：`src/utils/maintenance.ts`

**原理**：
- Item 携带 `maintenanceCycle`（天）和 `lastMaintenanceDate`（YYYY-MM-DD）两个可选字段
- `getMaintenanceStatus(item, now)` 计算下次维护日 = `lastMaintenanceDate + cycle 天`，与今天比较得出 5 档状态：`none / ok / due-soon(≤7天) / overdue / pending-setup`
- 日期按「天」零时计算（避免时区把当天算成 -1），`parseDateDay` 严格校验 YYYY-MM-DD 格式
- 首页 `maintenanceAlerts` 用 `useMemo` 汇总所有需提醒物品，按 `overdue → due-soon → pending-setup` 紧急度排序
- 表单内 `MaintenancePreview` 实时预览：用户填周期/日期时即可看到下次到期日与状态

**测试**：`src/utils/maintenance.test.ts` 24 个用例覆盖状态计算、跨年/闰年日期、边界条件、文案生成。

### 3.7 结构化查询 API（自然语言助手预留）

**模块**：`server/query.js`（纯函数）+ `server/index.js` 路由层

**背景**：房屋数据 API `/api/houses/:id/data` 返回整个 JSON blob，对人类前端够用，但 AI 工具调用需要精简、可过滤的语义端点。新增 `/api/query/*` 一组接口作为未来智能化的数据访问层。

**设计要点**：
- **纯函数 + 路由层分离**：核心查询逻辑（`buildSummary` / `listAreas` / `getAreaById` / `searchItems` / `getItemById` / `listLocations`）抽到 `server/query.js` 作为纯函数，不依赖数据库与 HTTP，路由层只负责读取 DB、调用纯函数、附带 `updatedAt`。便于单元测试，也便于未来 AI Agent 直接 `import` 复用。
- **统一返回格式**：`{ ok, ..., updatedAt }`，调用方可判断数据新鲜度
- **物品搜索**：关键词匹配覆盖 名称 / 品牌 / 规格 / 备注 / 使用说明 / 快捷清单 / 容器路径与容器内位置，全小写子串匹配
- **位置索引**：`/api/query/locations` 返回区域坐标或正式容器关系（`containerItemId/containerName/containerSlot/locationPath`）
- **访问隔离**：所有端点要求 Bearer Token，并通过必填的 `houseId`（查询参数或 `x-house-id` 请求头）校验房屋成员权限

**端点清单**：

| 端点 | 参数 | 用途 |
|---|---|---|
| `GET /api/query/summary` | `?houseId=` | 全屋概览（区域数/物品数/分类分布/Top 品牌/需维护数） |
| `GET /api/query/areas` | `?houseId=&withItems=1` | 区域列表（默认精简，不含物品） |
| `GET /api/query/areas/:areaId` | `?houseId=` | 区域详情 |
| `GET /api/query/items` | `?houseId=&area=&category=&brand=&q=` | 物品搜索（组合过滤） |
| `GET /api/query/items/:itemId` | `?houseId=` | 物品详情 + 所属区域 + 区域图位置 |
| `GET /api/query/locations` | `?houseId=&area=&category=` | 物品位置索引 |

**测试**：`server/query.test.js` 37 个用例，覆盖空 home 容错、组合过滤、快捷清单与正式容器路径搜索、位置字段、404 路径等。

### 3.8 路由与页面

```
/                → 首页（户型图 + 区域列表 + 维护提醒面板）
/setup           → 户型设置（导入户型图、数据维护）
/search          → 检索
/area/:id        → 区域详情（区域图 + 物品列表）
/area/:areaId/item/:itemId     → 物品详情（含维护徽标 + 高亮提醒）
/area/:areaId/item/new         → 新增物品（拍照后可 AI 识别）
/area/:areaId/item/:itemId/edit → 在详情页进入编辑状态
/export          → 导出 PDF
```

### 3.9 测试体系

测试框架为 **Vitest 4.x**，分三层覆盖：

**第一层：前端纯函数单元测试**
- `src/utils/compressImage.ts` / `upload.ts` / `maintenance.ts`（24 用例）/ `homeData.ts`（3 用例，残缺数据规范化）
- `src/utils/aiRecognition.test.ts`：AI 响应字段映射、仅空字段回填与已有内容保护。
- `src/components/itemFormValue.test.ts`：物品表单值初始映射与内容清单 `normalizeContents` 数据预处理逻辑测试。
- `src/serverStorage.test.ts` 跨房屋缓存隔离
- `src/components/export/exportModel.test.ts` 导出页模型与小册子拼版
- `src/lib/cn.test.ts` 类名合并

**第二层：后端纯函数单元测试**
- `server/utils.test.js`（12 用例）：Base64 提取 + `collectImageRefs` 图片引用收集
- `server/query.test.js`（34 用例）：结构化查询纯函数，覆盖空 home 容错、组合过滤、储物单元搜索、Top 10 截断、404 路径
- `server/auth.test.js`（30 用例）：密码 scrypt 哈希/校验、token 生成与过期、分享码（去混淆字符集）、houseId、用户名/密码格式校验、`createAuthMiddleware` 中间件 6 种分支（无头/格式错/token 不存在/过期删除/有效/大小写）
- `server/ai-recognition.test.js`：专用提示协议、Chat Completions 图片结构、未知值/分类/标签/置信度/价格规范化、图片 URL 安全与环境变量解析

**第三层：端到端 API 集成测试**（`server/api.test.js`、`server/api-turnstile.test.js`，共 76 用例）
- 用 `mkdtempSync` 创建临时数据目录 + 随机端口启动真实 server 子进程。
- `beforeAll` 轮询 `/api/health` 等待就绪，`afterAll` SIGTERM 清理 + 删除临时目录。
- **业务集成覆盖**：注册 → 登录 → 建房 → 写数据 → 查询 → 加入审批 → 备份往返 → 修改密码 → 登出。
- **人机验证覆盖**（`api-turnstile.test.js`）：通过本地 Mock Turnstile 响应服务，验证在启用人机验证时，注册和登录接口对于 Token 缺失、Token 非法、Token 合法时的各种响应码与流程。
- 权限隔离：非成员读他人房屋 403、非 admin 不能导入备份 403、不能移除最后一个 admin 400、重复申请 409。
- 备份往返一致性：导出 zip → FormData 上传回导入接口 → 读取数据验证完全一致。
- 设 `DEBUG_SERVER=1` 环境变量可查看 server 子进程日志便于排查。

**运行方式**：

```bash
pnpm test                                    # 全部测试
pnpm test server/auth.test.js                # 仅鉴权单元测试
pnpm test server/api.test.js                 # 仅 API 集成测试
pnpm test server/api-turnstile.test.js       # 仅人机验证集成测试
$env:DEBUG_SERVER=1; pnpm test server/api.test.js   # 带 server 日志
```

**当前规模**：18 个测试文件、275+ 个用例；AI 相关逻辑、人机验证与原有 HTTP 链路均纳入回归测试。

## 4. 项目结构

```
iHouse/
├── src/                          # 前端源码
│   ├── components/
│   │   ├── FloorPlan.tsx         # 户型图 + 区域锚点
│   │   ├── AreaImageCanvas.tsx   # 区域图 + 物品位置标注
│   │   ├── ItemForm.tsx          # 物品录入（含 AI 识别、上传、维护周期）
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
│   │   ├── homeData.ts           # 房屋数据规范化（补齐残缺字段防白屏）
│   │   ├── aiRecognition.ts      # AI 请求、响应类型与仅空字段回填
│   │   └── *.test.ts             # 单元测试
│   ├── store.ts                  # zustand store（persist + serverStorage）
│   ├── serverStorage.ts          # 服务器优先 + IndexedDB 缓存适配器
│   ├── uiStore.ts                # UI 状态（非持久化）
│   ├── types.ts                  # 类型定义
│   ├── App.tsx / main.tsx
│   └── index.css                 # Tailwind + @media print
├── server/
│   ├── index.js                  # Express + better-sqlite3，路由层
│   ├── auth.js                   # 鉴权模块（密码哈希 / token / 分享码 / 中间件）
│   ├── utils.js                  # Base64 提取、图片引用收集工具
│   ├── query.js                  # 结构化查询纯函数（summary/areas/items/locations）
│   ├── ai-recognition.js         # AI 提示协议、上游调用、校验与规范化
│   ├── ai-assistant.js           # 语音智能查找助理，整合清单并调用大模型
│   ├── ai-tts.js                 # 语音合成代理转发模块 (如对接 VoxCPM)
│   ├── utils.test.js             # utils.js 测试（12 用例）
│   ├── query.test.js             # query.js 测试（34 用例）
│   ├── auth.test.js              # auth.js 测试（30 用例）
│   ├── api.test.js               # 端到端 API 集成测试（69 用例）
│   ├── api-turnstile.test.js     # 人机验证集成测试（7 用例）
│   ├── ai-recognition.test.js    # AI 服务端单元测试
│   ├── ai-assistant.test.js      # 智能助理与语音代理服务端测试 (7 用例)
│   ├── package.json
│   └── data/                     # SQLite 数据库 + 图片文件（.gitignore）
├── docs/                         # 文档
│   ├── PRD.md
│   ├── architecture.md
│   ├── deployment.md             # 服务器部署、备份、升级与排障
│   └── changelog.md
├── Dockerfile                    # 多阶段构建（COPY 本地源码 → build → 运行）
├── docker-compose.yml            # Docker Compose 部署配置
├── .env.example                  # AI 环境变量模板
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
cd server && npm ci && cd ..
# 终端1：后端
cd server && node index.js    # :3000
# 终端2：前端
pnpm dev                       # :5173，/api 代理到 3000
```

### 5.2 生产（单进程）

```bash
pnpm build                     # dist/
cd server && npm ci
node server/index.js           # :3000，同时提供 API + 静态前端
```

### 5.3 Docker / NAS

`Dockerfile` 与 `docker-compose.yml` 位于仓库根目录，使用本地源码构建（不在容器内 `git clone`，构建上下文即仓库根本身）。

```dockerfile
# Dockerfile — 多阶段：build 阶段 COPY 源码 + 构建，runtime 阶段仅运行时
FROM node:20-alpine AS build
RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@10.18.2 --activate
WORKDIR /repo
COPY . .
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

**部署 / 更新要点**：
- 部署：`git clone` → `cp .env.example .env` → 填写 AI 配置 → `docker compose up -d --build`
- 更新：`git pull` → `docker compose build` → `docker compose up -d`（源码变更会自动触发重建，无需 `--no-cache`）
- 数据卷挂载 `./server/data:/app/server/data`，重建容器不丢数据；该目录已在 `.gitignore` / `.dockerignore` 中
- `.env` 由 Compose 解析并把白名单变量注入运行容器；`.dockerignore` 排除根目录和 `server/` 下所有 `.env*`，密钥不进入构建上下文
- 固定 `pnpm@10.18.2`：pnpm 11+ 需要 Node 22，而镜像为 `node:20-alpine`

完整生产步骤见 [`docs/deployment.md`](./deployment.md)，包括 Synology、Nginx/Caddy、HTTPS、冷备份、恢复、回滚和 AI 排障。

## 6. 数据迁移与备份

### 6.1 跨环境迁移
- **整个实例迁移**：停止服务后拷贝 `server/data/` 整个目录到新环境，保留 `home.db`、WAL/SHM（若存在）与 `images/`；这会迁移用户、成员关系和全部房屋。
- **单房屋迁移**：“户型设置 → 数据维护 → 导出 ZIP”，在目标房屋中由管理员导入；ZIP 包含 `home.json`、当前房屋引用图片和 manifest，但不包含用户与成员关系。
- **浏览器缓存兜底**：IndexedDB 不是正式备份，无法保证包含服务器图片或最新的多用户元数据。

### 6.2 Schema 迁移
persist 中间件 `version: 3` + `migrate`/`normalizeHomeData` 自动处理：
- `area.overviewImage/detailImage` → `area.images[]`
- `item.floorPlanPos` → `item.areaImageId/areaImagePos`
- v2 文档补 `schemaVersion: 3`；原有物品不变，新增 `containerItemId/containerSlot` 均为可选字段
- 修复悬空与循环容器引用；跨区域引用的子物品迁到容器区域并清除失效图坐标
- 服务器数据、离线 IndexedDB 缓存和导入备份均经过同一规范化入口；SQLite 表结构无需迁移

## 7. 已知限制

- SQLite 每套房屋以一份 JSON 文档整体写入：家庭场景够用，但全量写入开销随数据增长而增加
- last-write-wins：多设备同时编辑可能互相覆盖（单用户家庭场景风险低）
- 离屏截图方案已完全废弃，统一使用浏览器原生打印，保障导出效率与文字矢量清晰度
- AI 识别依赖第三方上游的模型能力、网络、额度和价格知识，结果与估价必须人工核对；上游不可用时手工录入不受影响
- 单房屋 ZIP 不包含账户、会话和成员关系，完整灾难恢复必须备份整个 `server/data/`

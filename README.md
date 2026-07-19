# iHouse · 居所图鉴

居家设施与物品管理应用：导入户型图 → 划分区域 → 每个区域可有多张图（总图/设施图/某面墙等）→ 在区域图上标注每件物品的具体位置 → 导出 PDF 打印归档。

数据存储在服务器（SQLite），支持**多设备共享同一份数据**；物品拍照后可按需点击 **AI 识别**，自动补齐空白档案字段。

## 文档

完整文档在 [`docs/`](./docs) 目录：

- [PRD.md](./docs/PRD.md) — 产品需求文档：原始设想、核心场景、功能清单、数据模型
- [architecture.md](./docs/architecture.md) — 技术架构：前后端结构、存储方案、PDF 导出两方案对比、部署架构
- [deployment.md](./docs/deployment.md) — 服务器部署手册：AI 配置、Docker/NAS、HTTPS、备份恢复、升级与排障
- [changelog.md](./docs/changelog.md) — 迭代记录：功能演进时间线

## 功能特性

- **户型图 + 区域**：导入自己的户型图，划分入户玄关、主卧、客厅、餐厅、厨房、卫生间等区域，拖拽调整区域锚点。
- **区域多图**：每个区域支持上传一张或多张图（区域总图、设施图、某面墙等），可编辑标签；多选上传自动保持顺序。
- **物品位置标注**：录入物品时直接在区域图上点选位置，红色标记点直观展示物品所处位置；物品详情、区域页、PDF 导出均会显示标注。
- **物品档案与收纳关系**：完整物品支持品牌、照片、维护等全部档案字段，也可收纳于衣柜、橱柜等另一件正式物品；储物空间仍保留适合小物品的快捷清单。物品可关联、移出或跨区域移动，正式档案始终只有一份。
- **AI 图片识别**：拍照或上传主图后手动触发，识别名称、项目分类、品牌、标签、规格、估价、备注及储物容器内部快捷清单；只填空字段，不覆盖用户内容，服务端校验模型 JSON 并保护 API Key。
- **维护提醒**：为定期维护设备（净水器滤芯、空调清洗、热水器镁棒等）设置维护周期与上次维护日期，首页自动汇总「已过期 / 即将到期 / 待首次维护」列表，详情页显示状态徽标与高亮提醒。
- **图片压缩**：上传/粘贴时自动压缩（canvas 缩放 + JPEG），避免存储爆满。
- **多设备共享**：数据存服务器 SQLite，所有设备访问同一份数据；本地 IndexedDB 作缓存，离线仍可用，联网自动同步。
- **数据备份**：按房屋一键导出完整 ZIP（`home.json` + 引用图片 + manifest），可跨设备/环境导入恢复；完整实例可冷备份 `server/data/`。
- **PDF 导出（小册子 / 详细档案）**：默认把紧凑 A5 阅读页自动拼成 A4 横向双面折页，也可输出 A4 纵向详细档案；长说明、清单和所有图片自动续页。打印前会等待字体与图片完成载入，文字保持矢量清晰。
- **检索**：按关键词、分类、品牌、区域筛选物品。
- **结构化查询 API**：提供 `/api/query/*` 端点（summary/areas/items/locations），按区域/分类/品牌/关键词过滤，为未来接入 AI 智能化提供数据访问层。
- **单元测试与集成测试**：vitest 覆盖前后端关键模块与完整 HTTP 链路，包括 AI 输出规范化、空字段回填、查询、鉴权、人机验证、备份与端到端 API，共 275+ 个测试。

## 技术栈

**前端**：React + TypeScript + Vite + Tailwind CSS + zustand + vitest

**后端**：Node.js + Express + better-sqlite3（SQLite `houses.data` 保存每套房屋的 JSON 文档，图片保存为独立文件）

## 环境要求

| 工具 | 版本 | 说明 |
|------|------|------|
| Node.js | ≥ 20（推荐 20.x） | better-sqlite3 为原生模块，需匹配 Node ABI；Vite 6 要求 Node 18+ |
| pnpm | 10.18.2（推荐） | 与 Dockerfile 固定版本一致；使用仓库根目录 `pnpm-lock.yaml` |
| npm | ≥ 10 | 后端依赖使用 `server/package-lock.json`，部署/CI 推荐 `npm ci` |

> **包管理器说明**：前端用 pnpm，后端用 npm；两边均有各自 lockfile。混用是项目约定，非疏漏。

## 快速开始（换环境接手）

```bash
git clone https://github.com/duying0425/iHouse.git
cd iHouse
pnpm install            # 前端依赖
cd server && npm ci && cd ..        # 后端依赖
# 启动后端（终端1）
cd server && node index.js
# 启动前端（终端2）
pnpm dev
```

前端 http://localhost:5173/ ，API 自动代理到后端 3000 端口。

> 数据恢复：若之前导出过房屋 ZIP 备份，进入“户型设置 → 数据维护 → 导入 ZIP”即可恢复结构与图片；完整实例迁移请恢复 `server/data/`。

## 本地开发

需要同时启动前端 dev server 和后端服务：

```bash
# 1. 安装前端依赖
pnpm install

# 2. 安装后端依赖
cd server && npm ci && cd ..

# 3. 启动后端（默认 3000 端口）
cd server && node index.js


# 3. 启动后端（默认 3000 端口）
cd server && node index.js

# 4. 另开终端启动前端（vite 会把 /api 代理到 3000）
pnpm dev
```

前端默认运行在 http://localhost:5173/ ，API 自动代理到 http://localhost:3000 。

**环境变量**（可选，后端 `server/index.js` 读取）：

| 变量 | 默认值 | 作用 |
|------|--------|------|
| `PORT` | `3000` | 后端监听端口；改后需同步改 `vite.config.ts` 的 `proxy./api` 目标 |
| `DATA_DIR` | `server/data` | SQLite 数据库目录，可指向持久化卷（Docker 部署用） |
| `AI_API_BASE_URL` | 无 | AI 服务根地址，后端自动补全 `/v1/chat/completions` |
| `AI_API_URL` | 无 | 可选的完整 Chat Completions 地址；设置后优先于 `AI_API_BASE_URL` |
| `AI_API_KEY` | 无 | AI 服务密钥，仅后端读取，不会发送到浏览器 |
| `AI_MODEL` | `openai/gpt-5.6-sol` | 图片识别模型 ID |
| `AI_TIMEOUT_MS` | `60000` | 单次 AI 识别超时（5000-120000 毫秒） |
| `TURNSTILE_SITE_KEY` | 无 | 可选：Cloudflare Turnstile 站点密钥（前端显示验证组件使用） |
| `TURNSTILE_SECRET_KEY` | 无 | 可选：Cloudflare Turnstile 机密密钥（后端校验使用） |
| `TURNSTILE_VERIFY_URL` | `https://challenges.cloudflare.com/turnstile/v0/siteverify` | 可选：人机验证校验接口（适合国内使用反向代理/镜像） |

```bash
# 示例：自定义端口和数据目录
PORT=8180 DATA_DIR=/var/lib/ihouse node server/index.js
```

### AI 图片识别配置

复制根目录的 `.env.example` 为 `.env`，填写服务地址和 Key 后重启后端：

```bash
AI_API_BASE_URL=https://your-new-api.example.com
AI_API_KEY=your-api-key
AI_MODEL=openai/gpt-5.6-sol
```

本地 `node server/index.js` 和 `docker compose up -d --build` 都会使用这组配置。录入或编辑物品时，先拍照/上传主图，再点击“AI 识别”；结果只填充空字段，已有内容不会被覆盖。价格来自 AI 估价区间的中值，原始区间会同时写入空白备注，保存前请人工核对。

`.env` 同时被 `.gitignore` 与 `.dockerignore` 排除，真实 Key 不会提交到 Git 或进入镜像构建上下文。点击识别时对应主图会发送到所配置的 AI 服务；未点击时不会发送。生产部署的完整配置、HTTPS 与排障见 [服务器部署手册](./docs/deployment.md)。

## 后端 API

后端提供两套 API：

### 基础数据 API（前端使用）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/houses/:id/data` | 读取指定房屋数据（需登录及房屋权限） |
| PUT | `/api/houses/:id/data` | 整体覆盖指定房屋数据（需登录及房屋权限） |
| POST | `/api/upload` | 上传单张图片，返回 `/api/images/<hash>.<ext>` URL |
| POST | `/api/ai/recognize-item` | 识别已上传的物品主图并返回建议字段（需登录及 AI 环境变量） |
| POST | `/api/ai/assistant` | 智能语音/文本查找助理，模糊检索及推理纠错物品位置（需登录及 AI 环境变量） |
| POST | `/api/ai/tts` | 文本转语音代理接口，可对接外部 VoxCPM 服务实现声音克隆（需登录） |
| GET | `/api/images/<file>` | 访问已上传的图片 |

### 结构化查询 API（为 AI 智能化预留）

按语义维度切分，支持精简过滤，便于 LLM 工具调用。核心逻辑在 [`server/query.js`](./server/query.js) 作为纯函数实现，可独立测试与复用。

| 方法 | 路径 | 参数 | 说明 |
|---|---|---|---|
| GET | `/api/query/summary` | `?houseId=` | 全屋概览：区域数、物品数、分类分布、Top 品牌、需维护数 |
| GET | `/api/query/areas` | `?houseId=&withItems=1` | 区域列表（默认精简，不含物品） |
| GET | `/api/query/areas/:areaId` | `?houseId=` | 单个区域详情（含物品与区域图） |
| GET | `/api/query/items` | `?houseId=&area=&category=&brand=&q=` | 物品列表/搜索，支持组合过滤 |
| GET | `/api/query/items/:itemId` | `?houseId=` | 物品详情（附带所属区域、区域图位置上下文） |
| GET | `/api/query/locations` | `?houseId=&area=&category=` | 物品位置索引（用于"东西放哪了"类查询） |

所有查询端点统一返回 `{ ok, ..., updatedAt }` 结构，便于调用方判断数据新鲜度。物品搜索的关键词匹配覆盖：名称/品牌/规格/备注/使用说明/快捷清单/容器名称与容器内位置；位置接口返回 `containerItemId/containerName/containerSlot/locationPath`。

## 构建

```bash
pnpm build      # 构建前端到 dist/
cd server && npm ci        # 安装后端依赖
node server/index.js       # 启动服务（同时提供前端静态文件 + API）
```

服务默认监听 3000 端口，访问 http://localhost:3000 即可。

## Docker / NAS 部署

`Dockerfile` 和 `docker-compose.yml` 位于仓库根目录，使用本地源码构建。首次部署先创建生产 `.env`：

```bash
git clone https://github.com/duying0425/iHouse.git
cd iHouse
cp .env.example .env
chmod 600 .env
# 编辑 .env，填写 AI_API_BASE_URL / AI_API_KEY
docker compose config --quiet
docker compose up -d --build
# 访问 http://<NAS_IP>:8180
```

更新前先备份 `server/data/`，再执行：

```bash
git pull --ff-only
docker compose build --pull
docker compose up -d
```

数据持久化在 `./server/data`，AI 配置由 Compose 从根目录 `.env` 注入。完整的端口调整、Synology、Nginx/Caddy HTTPS、备份恢复、回滚和故障排查步骤见 [服务器部署手册](./docs/deployment.md)。

### 将现有数据导入 NAS

迁移单套房屋时，推荐在“户型设置 → 数据维护”导出完整 ZIP，再在服务器上的目标房屋导入；ZIP 已包含该房屋引用的图片。迁移整个实例（含用户、成员关系和所有房屋）时，需要迁移完整 `server/data/`。

**迁移步骤**：

1. **停止旧服务**：避免复制 SQLite WAL 写入中的不一致状态
2. **打包本地数据**：将项目 `server/data/` 目录打包为 `data.zip`
   - 内含 `home.db`（SQLite 数据库）和 `images/` 文件夹（所有图片文件）
3. **上传到 NAS**：用 Synology File Station 将 `data.zip` 上传到仓库根目录（如 `/volume1/docker/ihouse/`）
4. **解压**：解压到 `server/data/` 目录
   - 确认目录结构为 `/volume1/docker/ihouse/server/data/home.db` 和 `/volume1/docker/ihouse/server/data/images/`
5. **启动容器**：`docker compose up -d --build`，容器会自动读取 `server/data/` 中的数据

> 如果容器已在运行，需先 `docker compose down` → 替换 `server/data/` 目录内容 → 再 `docker compose up -d`。

## 数据存储说明

- **服务器为数据源头**：SQLite 的 `houses` 表管理房屋与权限元数据，`houses.data TEXT` 保存序列化后的 Home JSON 文档；图片文件位于 `server/data/images/`，多设备共享。
- **本地缓存兜底**：浏览器 IndexedDB 缓存最新数据，服务器不可用时仍可离线使用，联网后自动同步（600ms 防抖）。
- **图片压缩**：浏览器先压缩（户型图 ≤2000px、区域图 ≤1600px、物品图 ≤1200px，JPEG 0.82-0.85），上传后保存为图片文件，JSON 中记录 `/api/images/...` URL。
- **旧数据迁移**：Home 文档带 `schemaVersion: 3`；加载旧 v1/v2 数据或 IndexedDB 缓存时自动规范化并升级，不需要修改 SQLite 表结构。
- 在“户型设置 → 数据维护”可导出/导入当前房屋的完整 ZIP 备份（含图片）；账号和成员关系需通过整个 `server/data/` 冷备份保护。

## 项目结构

```
├── src/                  # 前端源码
│   ├── components/       # 组件
│   │   ├── FloorPlan.tsx         # 户型图 + 区域锚点
│   │   ├── AreaImageCanvas.tsx   # 区域图 + 物品位置标注
│   │   ├── ItemForm.tsx          # 物品录入（含 AI 识别、上传、维护周期）
│   │   ├── SafeImage.tsx         # 图片带占位/兜底
│   │   ├── export/PdfPages.tsx   # PDF 各页组件（封面/户型/区域/物品）
│   │   └── PrintExportRenderer.tsx # 原生打印导出（window.print）
│   ├── pages/            # 页面（首页、设置、检索、区域详情、物品、导出）
│   ├── store.ts          # zustand store（persist + serverStorage）
│   ├── serverStorage.ts  # 服务器优先 + IndexedDB 缓存的存储适配器
│   ├── utils/            # 工具
│   │   ├── compressImage.ts      # 图片压缩
│   │   ├── upload.ts             # 图片上传到服务器
│   │   ├── maintenance.ts        # 维护状态计算（过期/即将到期/正常）
│   │   ├── homeData.ts           # 房屋数据规范化（补齐残缺字段防白屏）
│   │   ├── aiRecognition.ts      # AI 识别请求与仅空字段回填
│   │   └── *.test.ts             # 单元测试
│   └── types.ts          # 类型定义
├── server/               # 后端服务
│   ├── index.js          # Express + better-sqlite3，API + 静态文件服务
│   ├── auth.js           # 鉴权模块（密码哈希 / token / 分享码 / 中间件）
│   ├── utils.js          # 后端工具函数（Base64 提取、图片引用收集）
│   ├── query.js          # 结构化查询纯函数（summary/areas/items/locations）
│   ├── ai-recognition.js # AI 提示词、上游调用、输出规范化与图片安全校验
│   ├── auth.test.js      # 鉴权单元测试（30 个用例）
│   ├── api.test.js       # 端到端 API 集成测试（59 个用例，子进程+临时DB）
│   └── package.json
├── docs/                 # 文档（PRD / 架构 / 部署手册 / 迭代记录）
├── .env.example          # AI 服务端配置模板（真实 .env 不提交）
├── Dockerfile            # Docker 多阶段构建（本地源码构建）
├── docker-compose.yml    # Docker Compose 部署配置
├── vitest.config.ts      # 单元测试配置
└── vite.config.ts        # 含 /api 代理配置
```

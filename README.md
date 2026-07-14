# iHouse · 居所图鉴

居家设施与物品管理应用：导入户型图 → 划分区域 → 每个区域可有多张图（总图/设施图/某面墙等）→ 在区域图上标注每件物品的具体位置 → 导出 PDF 打印归档。

数据存储在服务器（SQLite），支持**多设备共享同一份数据**。

## 文档

完整文档在 [`docs/`](./docs) 目录：

- [PRD.md](./docs/PRD.md) — 产品需求文档：原始设想、核心场景、功能清单、数据模型
- [architecture.md](./docs/architecture.md) — 技术架构：前后端结构、存储方案、PDF 导出两方案对比、部署架构
- [changelog.md](./docs/changelog.md) — 迭代记录：功能演进时间线

## 功能特性

- **户型图 + 区域**：导入自己的户型图，划分入户玄关、主卧、客厅、餐厅、厨房、卫生间等区域，拖拽调整区域锚点。
- **区域多图**：每个区域支持上传一张或多张图（区域总图、设施图、某面墙等），可编辑标签；多选上传自动保持顺序。
- **物品位置标注**：录入物品时直接在区域图上点选位置，红色标记点直观展示物品所处位置；物品详情、区域页、PDF 导出均会显示标注。
- **物品档案**：名称/分类/品牌/规格/购入日期/价格/备注/主图/附属图册/使用说明/储物单元内部清单，字段齐全；手机端录入支持**拍照**或**相册上传**两种方式（独立按钮，兼容 Edge mobile）。
- **维护提醒**：为定期维护设备（净水器滤芯、空调清洗、热水器镁棒等）设置维护周期与上次维护日期，首页自动汇总「已过期 / 即将到期 / 待首次维护」列表，详情页显示状态徽标与高亮提醒。
- **图片压缩**：上传/粘贴时自动压缩（canvas 缩放 + JPEG），避免存储爆满。
- **多设备共享**：数据存服务器 SQLite，所有设备访问同一份数据；本地 IndexedDB 作缓存，离线仍可用，联网自动同步。
- **数据备份**：一键导出 JSON 备份，可跨设备/环境导入恢复。
- **PDF 导出（小册子 / 详细档案）**：默认把紧凑 A5 阅读页自动拼成 A4 横向双面折页，也可输出 A4 纵向详细档案；长说明、清单和所有图片自动续页。打印前会等待字体与图片完成载入，文字保持矢量清晰。
- **检索**：按关键词、分类、品牌、区域筛选物品。
- **结构化查询 API**：提供 `/api/query/*` 端点（summary/areas/items/locations），按区域/分类/品牌/关键词过滤，为未来接入 AI 智能化提供数据访问层。
- **单元测试与集成测试**：vitest 覆盖前后端关键模块与完整 HTTP 链路——前端工具函数（图片压缩、上传、维护状态计算、导出拼版、跨房屋同步、数据规范化、类名合并）、后端工具函数（Base64 提取、图片引用收集）、结构化查询纯函数、鉴权模块（密码哈希 / token / 分享码 / 鉴权中间件 6 种分支）、端到端 API 集成测试（注册/登录/登出/改密、房屋 CRUD、查询 API、成员管理审批流、备份导出导入往返、权限隔离 403/409/400 边界），180 个测试全过。

## 技术栈

**前端**：React + TypeScript + Vite + Tailwind CSS + zustand + vitest

**后端**：Node.js + Express + better-sqlite3（SQLite 单行存储全部数据，含 base64 图片）

## 环境要求

| 工具 | 版本 | 说明 |
|------|------|------|
| Node.js | ≥ 20（推荐 20.x） | better-sqlite3 为原生模块，需匹配 Node ABI；Vite 6 要求 Node 18+ |
| pnpm | 9.x | `pnpm-lock.yaml` 为 lockfileVersion 9.0。**勿用 pnpm 11+**，它要求 Node ≥22.13，与 Node 20 冲突 |
| npm | ≥ 10 | 后端依赖用 npm 安装（`server/` 无 lockfile，跟随系统 npm） |

> **包管理器说明**：前端用 pnpm（有 `pnpm-lock.yaml`），后端用 npm（`server/` 无 lockfile）。混用是项目约定，非疏漏。
> 若已装新版 pnpm，可 `npm install -g pnpm@9` 降级；或改用 Node 22+ 后再用 pnpm 11。

## 快速开始（换环境接手）

```bash
git clone https://github.com/duying0425/iHouse.git
cd iHouse
pnpm install            # 前端依赖
cd server && npm install && cd ..   # 后端依赖
# 启动后端（终端1）
cd server && node index.js
# 启动前端（终端2）
pnpm dev
```

前端 http://localhost:5173/ ，API 自动代理到后端 3000 端口。

> 数据恢复：若之前导出过 JSON 备份，进入「设置 → 数据维护 → 导入备份」即可恢复；或直接在原浏览器打开，IndexedDB 缓存会自动同步到新服务器。

## 本地开发

需要同时启动前端 dev server 和后端服务：

```bash
# 1. 安装前端依赖
pnpm install

# 2. 安装后端依赖
cd server && npm install && cd ..

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

```bash
# 示例：自定义端口和数据目录
PORT=8180 DATA_DIR=/var/lib/ihouse node server/index.js
```

## 后端 API

后端提供两套 API：

### 基础数据 API（前端使用）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/houses/:id/data` | 读取指定房屋数据（需登录及房屋权限） |
| PUT | `/api/houses/:id/data` | 整体覆盖指定房屋数据（需登录及房屋权限） |
| POST | `/api/upload` | 上传单张图片，返回 `/api/images/<hash>.<ext>` URL |
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

所有查询端点统一返回 `{ ok, ..., updatedAt }` 结构，便于调用方判断数据新鲜度。物品搜索的关键词匹配覆盖：名称/品牌/规格/备注/使用说明/储物单元内部清单。

## 构建

```bash
pnpm build      # 构建前端到 dist/
cd server && npm install   # 安装后端依赖
node server/index.js       # 启动服务（同时提供前端静态文件 + API）
```

服务默认监听 3000 端口，访问 http://localhost:3000 即可。

## Docker / NAS 部署

`Dockerfile` 和 `docker-compose.yml` 位于仓库根目录，使用本地源码构建（不在容器内 git clone）。

**部署流程**（NAS / 任意装了 Docker 的服务器）：

```bash
git clone https://github.com/duying0425/iHouse.git
cd iHouse
docker compose up -d --build          # 首次构建约 3-5 分钟
# 访问 http://<NAS_IP>:8180
```

**更新流程**（手动拉取最新代码后重建）：

```bash
git pull && docker compose build && docker compose up -d
```

数据持久化在 `./server/data`（已在 `.gitignore` / `.dockerignore` 中，`git pull` 不会影响数据）。

```yaml
# docker-compose.yml
services:
  ihouse:
    build:
      context: .
      dockerfile: Dockerfile
    image: ihouse:latest
    container_name: ihouse
    restart: unless-stopped
    ports:
      - "8180:3000"
    volumes:
      - ./server/data:/app/server/data
    environment:
      - TZ=Asia/Shanghai
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      start_period: 10s
      retries: 3
```

- 访问：`http://<NAS_IP>:8180`
- 数据持久化：`./server/data` 目录（SQLite 数据库 + 图片文件），重建容器不丢失
- 更新：`git pull` 拉最新代码后 `docker compose build && docker compose up -d`

### 将现有数据导入 NAS

本地已录入的数据需要一并迁移到 NAS，包括 **SQLite 数据库** 和 **图片文件** 两部分（缺一不可）。

> ⚠️ 仅导出 JSON 备份是不够的 — 图片已提取为独立文件存储在 `images/` 目录，不在 JSON 中。JSON 导入只会恢复结构数据，图片会丢失。

**迁移步骤**：

1. **打包本地数据**：将项目 `server/data/` 目录打包为 `data.zip`
   - 内含 `home.db`（SQLite 数据库）和 `images/` 文件夹（所有图片文件）
2. **上传到 NAS**：用 Synology File Station 将 `data.zip` 上传到仓库根目录（如 `/volume1/docker/ihouse/`）
3. **解压**：解压到 `server/data/` 目录
   - 确认目录结构为 `/volume1/docker/ihouse/server/data/home.db` 和 `/volume1/docker/ihouse/server/data/images/`
4. **启动容器**：`docker compose up -d --build`，容器会自动读取 `server/data/` 中的数据

> 如果容器已在运行，需先 `docker compose down` → 替换 `server/data/` 目录内容 → 再 `docker compose up -d`。

## 数据存储说明

- **服务器为数据源头**：SQLite 存储全部数据（户型图、区域、物品、base64 图片），多设备共享。
- **本地缓存兜底**：浏览器 IndexedDB 缓存最新数据，服务器不可用时仍可离线使用，联网后自动同步（600ms 防抖）。
- **图片压缩**：上传/粘贴时自动压缩为 base64 存储（户型图 ≤2000px、区域图 ≤1600px、物品图 ≤1200px，JPEG 0.82-0.85）。
- **旧数据迁移**：浏览器里原有的 IndexedDB 数据会在首次访问时自动读取并同步到服务器。
- 在「户型设置 → 数据维护」可导出/导入 JSON 备份。

## 项目结构

```
├── src/                  # 前端源码
│   ├── components/       # 组件
│   │   ├── FloorPlan.tsx         # 户型图 + 区域锚点
│   │   ├── AreaImageCanvas.tsx   # 区域图 + 物品位置标注
│   │   ├── ItemForm.tsx          # 物品录入（含粘贴上传、压缩、维护周期）
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
│   │   └── *.test.ts             # 单元测试
│   └── types.ts          # 类型定义
├── server/               # 后端服务
│   ├── index.js          # Express + better-sqlite3，API + 静态文件服务
│   ├── auth.js           # 鉴权模块（密码哈希 / token / 分享码 / 中间件）
│   ├── utils.js          # 后端工具函数（Base64 提取、图片引用收集）
│   ├── query.js          # 结构化查询纯函数（summary/areas/items/locations）
│   ├── auth.test.js      # 鉴权单元测试（30 个用例）
│   ├── api.test.js       # 端到端 API 集成测试（59 个用例，子进程+临时DB）
│   └── package.json
├── docs/                 # 文档（PRD / 架构 / 迭代记录）
├── Dockerfile            # Docker 多阶段构建（本地源码构建）
├── docker-compose.yml    # Docker Compose 部署配置
├── vitest.config.ts      # 单元测试配置
└── vite.config.ts        # 含 /api 代理配置
```

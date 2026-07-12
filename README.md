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
- **物品档案**：名称/分类/品牌/规格/购入日期/价格/备注/主图/附属图册/使用说明/储物单元内部清单，字段齐全。
- **维护提醒**：为定期维护设备（净水器滤芯、空调清洗、热水器镁棒等）设置维护周期与上次维护日期，首页自动汇总「已过期 / 即将到期 / 待首次维护」列表，详情页显示状态徽标与高亮提醒。
- **图片压缩**：上传/粘贴时自动压缩（canvas 缩放 + JPEG），避免存储爆满。
- **多设备共享**：数据存服务器 SQLite，所有设备访问同一份数据；本地 IndexedDB 作缓存，离线仍可用，联网自动同步。
- **数据备份**：一键导出 JSON 备份，可跨设备/环境导入恢复。
- **PDF 导出（原生打印·秒级）**：调用浏览器原生打印，在打印对话框选「另存为 PDF」即可保存；文字矢量、图片直接渲染。按 封面 → 户型图 → 区域 → 物品 的层级生成图鉴，区域页图片标注所有设备位置序号，与物品清单对照。
- **检索**：按关键词、分类、品牌、区域筛选物品。
- **单元测试**：vitest 覆盖工具函数（图片处理、上传、维护状态计算、cn 等），41 个测试全过。

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

## 构建

```bash
pnpm build      # 构建前端到 dist/
cd server && npm install   # 安装后端依赖
node server/index.js       # 启动服务（同时提供前端静态文件 + API）
```

服务默认监听 3000 端口，访问 http://localhost:3000 即可。

## Docker / NAS 部署

项目提供独立的 `nas-deploy/` 部署目录，适配 Synology Container Manager（只支持导入 compose YAML、不能执行命令的场景）。

**NAS 上准备一个目录**（如 `/docker/ihouse/`），将仓库 `nas-deploy/` 文件夹内的 `Dockerfile` 和 `docker-compose.yml` 上传到该目录，然后在 Container Manager 导入 compose 文件即可。Dockerfile 会自动 `git clone` 仓库并构建。

```yaml
# nas-deploy/docker-compose.yml
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
      - ./data:/app/server/data
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
- 数据持久化：`./data` 目录（SQLite 数据库 + 图片文件），重建容器不丢失
- 更新：代码推到 GitHub 后，在 Container Manager 对项目停止 → 构建 → 启动

### 将现有数据导入 NAS

本地已录入的数据需要一并迁移到 NAS，包括 **SQLite 数据库** 和 **图片文件** 两部分（缺一不可）。

> ⚠️ 仅导出 JSON 备份是不够的 — 图片已提取为独立文件存储在 `images/` 目录，不在 JSON 中。JSON 导入只会恢复结构数据，图片会丢失。

**迁移步骤**：

1. **打包本地数据**：将项目 `server/data/` 目录打包为 `data.zip`
   - 内含 `home.db`（SQLite 数据库）和 `images/` 文件夹（所有图片文件）
2. **上传到 NAS**：用 Synology File Station 将 `data.zip` 上传到项目目录（如 `/docker/ihouse/`）
3. **解压**：File Station 中右键 `data.zip` → 解压 → 解压到 `data/` 文件夹
   - 确认目录结构为 `/docker/ihouse/data/home.db` 和 `/docker/ihouse/data/images/`
4. **启动容器**：在 Container Manager 中启动项目，容器会自动读取 `data/` 中的数据

> 如果容器已在运行，需先 **停止** → 替换 `data/` 目录内容 → 再 **启动**。

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
│   │   └── *.test.ts             # 单元测试
│   └── types.ts          # 类型定义
├── server/               # 后端服务
│   ├── index.js          # Express + better-sqlite3，API + 静态文件服务
│   ├── utils.js          # 后端工具函数（含单元测试）
│   └── package.json
├── docs/                 # 文档（PRD / 架构 / 迭代记录）
├── nas-deploy/           # NAS 部署（Dockerfile + docker-compose.yml，自包含 git clone 构建）
├── vitest.config.ts      # 单元测试配置
└── vite.config.ts        # 含 /api 代理配置
```

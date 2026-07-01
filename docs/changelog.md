# iHouse · 居所图鉴 — 迭代记录

> 按时间倒序，最近在上。

## 2026-07-01 · docs: 文档整理

**Commit**: `ab7eda5` / 后续 docs 提交
**变更**：
- 新增 `docs/PRD.md`：产品需求文档（原始设想、核心场景、功能清单、数据模型、非功能性需求、边界）
- 新增 `docs/architecture.md`：技术架构（前后端结构、存储方案、PDF 导出两方案对比、部署架构、数据迁移）
- 新增 `docs/changelog.md`：本文件
- 完善 `README.md`：打印导出说明、换环境快速接手指南、项目结构更新
- 修复 `tsconfig.json`：移除 TS 7.x 已废弃的 `baseUrl`（`paths` 配合 `moduleResolution: "bundler"` 可独立工作）

---

## 2026-07-01 · feat(pdf): 新增「打印导出」，浏览器原生渲染秒级完成

**Commit**: `6a4eccc`
**背景**：html2canvas 逐页截图方案在大体积图片（5MB+）+ 多页（30+）时每页要 1-2 分钟，用户体验差。
**变更**：
- 新增 `src/components/PrintExportRenderer.tsx`：用 `createPortal` 挂载所有页面到 `document.body`，500ms 后调 `window.print()`
- `src/index.css` 增加 `@media print` 块：`body * { visibility: hidden }`，仅 `#print-export-root` 可见，每页 `page-break-after: always`
- `PdfPages.tsx` 的 `PageFrame` 增加 `print` prop：跳过缩放 transform，直接 A4 原尺寸
- `ExportPage.tsx` 提供两个按钮：「打印导出（快·推荐）」和「下载 PDF（慢）」
**效果**：秒级完成，文字矢量、图片原生渲染。

---

## 2026-07-01 · fix(pdf): 修复 PdfExportRenderer 在 StrictMode 下卡死

**Commit**: `9cdf532`
**问题**：开发模式下（React StrictMode 双调用 useEffect），原 `phaseRef` 状态机 + cleanup 逻辑导致 `cancelled=true` 永远成立，导出流程根本启动不了，UI 一直转圈。
**修复**：重写为单 async `for` 循环 + 三个 ref：
- `startedRef`：保证只启动一次
- `cancelledRef`：cleanup 时置 true，循环每轮检查
- `pageReadyRef`：callback ref 模式，等当前页 DOM 挂载完成再截图

---

## 2026-07-01 · perf(pdf): 逐页离屏渲染导出，大幅提升速度

**Commit**: `838edea`
**背景**：原方案一次性渲染所有页再统一截图，DOM 节点过多导致卡顿。
**变更**：
- 改为逐页离屏渲染：渲染一页 → 截图 → 卸载 → 下一页
- `src/utils/pdf.ts` 调参：scale 1.5→1，JPEG 质量 0.88→0.8，imageTimeout 15s→10s，`removeContainer: true`，timeout 90s→60s

---

## 2026-07-01 · docs: 更新 README 反映全栈架构

**Commit**: `d3e1c59`
**变更**：README 从纯前端说明改为全栈说明，补充后端启动、API、数据存储位置等。

---

## 2026-07-01 · feat: 数据库迁移到服务器（多设备共享）+ 修复 PDF 导出

**Commit**: `b20cd63`
**背景**：原方案数据存浏览器 IndexedDB，多设备无法共享。
**变更**：
- 新增 `server/index.js`：Express + better-sqlite3，`GET/PUT /api/home`，SQLite 单行存储全量 JSON，WAL 模式
- 新增 `src/serverStorage.ts`：服务器优先 + IndexedDB 缓存的 StateStorage 适配器，600ms 防抖同步，`visibilitychange` 时 `keepalive` 推送
- 修改 `src/store.ts`：`storage` 从 `idbStorage` 换成 `serverStorage`，加 `_hasHydrated` 门控、`partialize` 排除标志位
- `server/index.js` 同时提供静态文件服务（dist/）+ SPA fallback
- `vite.config.ts` 配置 `/api` 代理到 3000
- 修复 PDF 导出相关问题

---

## 2026-07-01 · fix(docker): 改用 Dockerfile 内 git clone 模式适配 NAS

**Commit**: `742f511`
**背景**：Synology Container Manager 只支持导入 compose YAML，不支持在 NAS 上执行 git clone 命令。
**变更**：
- `Dockerfile` 改为多阶段：build 阶段 `git clone --depth=1 --branch main` 拉代码 → `pnpm install` → `pnpm build` → `cd server && npm install --omit=dev`；runtime 阶段仅 COPY dist/ 和 server/
- `docker-compose.yml` 简化：`build: { context: . }` + 端口映射 `8180:3000` + 数据卷 `./data:/app/server/data`
- 新增 `.dockerignore`：排除 node_modules、dist、.git、.pnpm-store、.trae、server/node_modules、server/data

---

## 2026-07-01 · feat: 支持 Docker / NAS 部署

**Commit**: `5569725`
**变更**：首次加入 `Dockerfile` 和 `docker-compose.yml`，支持容器化部署。

---

## 2026-07-01 · feat(pdf): 区域页图片标注所有设备位置

**Commit**: `4547d63`
**背景**：用户提出「导出 PDF 中，每个区域首页的图要标识出图中所有的设备」。
**变更**：
- `src/components/export/PdfPages.tsx` 的 `AreaPage` 在区域图上叠加渲染所有物品的红色编号标记点
- 标记序号与下方物品清单表对应，方便对照查阅

---

## 2026-07-01 · chore: remove "compress existing images" from data maintenance

**Commit**: `5a608ef`
**变更**：移除数据维护页的「压缩已有图片」功能（上传时已自动压缩，存量压缩场景少且耗时）。

---

## 2026-07-01 · init: 居所图鉴 iHouse - 家居设施与物品管理应用

**Commit**: `772ed29`
**变更**：项目初始化，包含完整核心功能：
- 户型图管理（导入、区域锚点）
- 区域划分（预置 + 自定义）
- 区域多图（AreaImage[]，可编辑标签）
- 物品录入（含粘贴上传、自动压缩、位置标注）
- 检索（关键词/分类/品牌/区域/排序）
- PDF 导出（封面 → 户型图 → 区域 → 物品，jsPDF + html2canvas）
- 数据导出/导入 JSON 备份
- zustand + persist + IndexedDB 持久化（v1 schema）
- Tailwind 暖色调主题（cream/ink/clay），衬线标题
- React Router 路由

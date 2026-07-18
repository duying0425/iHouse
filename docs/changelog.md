# iHouse · 居所图鉴 — 迭代记录

> 按时间倒序，最近在上。

## 2026-07-18 · feat: 登录人机验证、上传 Loading 提示与 AI 储物识别规范化

**背景**：为进一步加强系统在公网部署时的安全性，防止接口滥用及爆破；同时提升多图/大图上传及表单录入时的交互顺畅度，并让储物物品的 AI 识别自动生成内部快捷清单。

**功能变更**：

- **Cloudflare Turnstile 登录拦截**：在原有的注册拦截基础上，人机验证（Turnstile）支持延伸至登录接口 `/api/auth/login`。双向配置密钥后，登录页面同样强校验验证 Token，防止撞库和爆破。
- **自动填充吸收器**：在 `SetupPage` 账号管理区块增加隐藏的用户名 `username` 输入框，专门用以吸收浏览器的过度自动填充行为，彻底解决浏览器密码管理器污染项目常规输入框的遗留缺陷。
- **全局上传加载指示器 (Loading)**：
  - 户型图上传时显示整版毛玻璃磨砂遮罩与 Spinner，避免上传大尺寸户型图时造成界面无响应假象。
  - 区域图画廊上传时，图片上传状态以 Loading 列表项展示。
  - 物品主图与画廊图上传时增加 Skeleton 骨架载入动画。
- **AI 储物清单识别规范化 (contents)**：
  - 物品 AI 识别提示词及解析模块增加对储物空间内部物品清单的识别，能够直接在返回 JSON 中返回 `contents` 数组。
  - 规范化层 `normalizeRecognition` 会自动过滤未命名的无效子物品，并将提取出的快捷清单返回给前端。
  - 前端在回填时，会对识别出的 `contents` 分配唯一的 `cnt-` 前缀 ID，自动以“追加且不与已有物品名称冲突”的原则合并入表单。
- **表单交互体验优化**：
  - 修复多次打开物品编辑时表单遗留状态的 bug，在开启编辑状态时确定性重置表单为数据库最新状态。
  - 储物单元快捷清单添加新行时，自动聚焦至新增行的名称输入框，提升录入连贯性。

**验证**：
- 新增 `server/api-turnstile.test.js` 专门对 Turnstile 启用后的 Token 缺失、错误和正确场景做端到端 API 强校验；
- 新增 `src/components/itemFormValue.test.ts` 测试表单默认映射与 `normalizeContents` 清单数据规范化工具；
- 整合后总测试用例增加到 275 个，Vitest 回归测试和 pnpm lint 校验均 100% 通过。

---

## 2026-07-16 · feat(ai): 物品图片 AI 识别与生产部署文档

**背景**：物品拍照后仍需手工填写名称、分类、品牌、规格等字段；同时项目准备部署到服务器，需要把 AI 密钥、图片数据边界、Docker/NAS、备份恢复和升级排障形成可执行手册。

**功能变更**：

- 物品主图区域新增手动“AI 识别”按钮，带加载、成功、失败和图片更换保护；识别结果只填写空字段，不覆盖已有内容。
- 自动建议名称、iHouse 六类分类、品牌、检索标签、规格、价格和备注；价格取估价区间中值，原区间保留在备注供人工核对。
- 新增 `src/utils/aiRecognition.ts`，封装鉴权请求、响应类型和确定性空字段回填。
- 新增鉴权接口 `POST /api/ai/recognize-item`；API Key 仅由服务端环境变量读取。
- 新增 `server/ai-recognition.js`：iHouse 专用系统/任务提示协议，明确主物品选择、分类边界、图片证据标准和固定 JSON 输出。
- 兼容代码块与前后多余文字，对未知值、非法分类、标签、规格、百分比置信度和估价区间做服务端规范化。
- 图片只允许本服务上传文件或受控 data URL，拒绝任意外部图片抓取；限制 10MB，并处理超时、上游鉴权、限流、瞬时错误和无效响应。
- 新增 `.env.example`，支持 `AI_API_BASE_URL`/`AI_API_URL`、`AI_API_KEY`、`AI_MODEL`、`AI_TIMEOUT_MS`；Docker Compose 同步注入。

**部署与文档**：

- 新增 `docs/deployment.md`，覆盖 Linux/Synology 首次部署、AI 验证、端口与 HTTPS、Nginx/Caddy、单房屋 ZIP、完整实例冷备份、恢复、升级、回滚、运维和故障排查。
- `.dockerignore` 排除根目录及 `server/` 下 `.env*`，避免真实密钥进入 Docker 构建上下文或镜像层。
- 同步 README、PRD、架构文档、Compose 注释和环境变量模板；修正旧的 JSON 备份描述为当前完整房屋 ZIP。
- 明确数据边界：业务数据保存在自部署服务器，只有用户主动点击 AI 识别时对应图片才发送到配置的第三方上游。

**验证**：AI 单元测试、前端回填测试、原有 API 集成测试、TypeScript 检查、变更文件 lint、生产构建和 Compose 配置校验均通过。

---

## 2026-07-15 · feat(storage): 正式物品收纳关系与 v3 数据迁移

**背景**：原 `contents` 仅能保存名称、数量、备注，放在衣柜里的挂烫机无法拥有独立品牌、照片和维护档案。
**变更**：
- Item 新增 `containerItemId/containerSlot`；储物空间可新建完整物品或关联已有物品，快捷清单继续服务于无需档案的小物品。
- 新增原子移动逻辑：物品可移出到任意区域，跨区域移动容器时完整收纳子树随行；拒绝自引用和循环收纳。
- 删除容器默认保留正式子物品并提升到上一级位置，快捷清单随容器删除；删除确认明确告知影响。
- 详情页新增位置路径、移动面板和内部档案列表；检索与结构化查询 API 返回容器路径。
- Home JSON 文档升级到 `schemaVersion: 3`，兼容服务器 `houses.data`、离线 IndexedDB 和旧备份；SQLite 表结构无需变更。
- 新增位置关系与迁移测试，测试总数 180 → 191；通过 lint、生产构建和完整测试。

---

## 2026-07-14 · test: 鉴权与端到端 API 集成测试 + 文档同步

**背景**：上一轮完成多用户账号系统、多房屋隔离、备份导入导出后，关键安全模块 `server/auth.js` 与完整 API 路由层缺乏自动化测试覆盖，回归风险高。本次系统性补齐测试并刷新全部文档。
**变更**：
- 新增 `server/auth.test.js`（30 用例）：覆盖 `hashPassword`/`verifyPassword`（正确/错误/非法格式/中文符号）、`generateToken`/`tokenExpiry`、`generateShareCode`（去混淆字符集 I/O/0/1）、`generateHouseId`、`isValidUsername`/`isValidPassword`、`createAuthMiddleware` 中间件 6 种分支（无 Authorization 头 / 非 Bearer 格式 / token 不存在 / token 过期触发删除 / 有效 token 设置 `req.user`/`req.token` / Bearer 大小写不敏感）
- 新增 `server/api.test.js`（59 用例）：端到端 HTTP 集成测试，用 `mkdtempSync` 创建临时数据目录 + 随机端口启动真实 server 子进程，`beforeAll` 轮询 `/api/health` 等待就绪、`afterAll` SIGTERM 清理。覆盖健康检查、注册/登录/登出、修改密码（旧密码失效/新密码可用）、房屋 CRUD、查询 API（summary/areas/items/locations + 组合过滤 + 404/400 边界）、成员管理（分享码查询/申请加入/重复申请 409/审批/审批后可访问/退出/最后管理员保护）、备份导出导入往返（zip 导出 → FormData 上传回导入 → 数据一致性校验 / 非 zip 拒绝 400）、权限隔离（非成员读他人房屋 403 / 非 admin 不能导入 403 / 旧版 `/api/home` 已停用 410）
- 扩展 `server/utils.test.js`（5 → 12 用例）：新增 `collectImageRefs` 7 个测试（嵌套对象数组遍历、去重、外部 URL 与 base64 过滤、null/undefined/原始类型容错、多扩展名保留）
- 整合既有未提交改动：`src/utils/homeData.ts`（房屋数据规范化，补齐残缺 area/item 字段防白屏）+ `homeData.test.ts`（3 用例）+ `src/serverStorage.ts` 接入 `normalizeHomeData`
- 文档同步：README 测试段落 81 → 180、项目结构补 auth.js/auth.test.js/api.test.js/homeData.ts；PRD 第 6 节移除"不做多用户账号系统"（已实现）；architecture 新增 3.8 测试体系章节（三层测试架构）、架构图 SQLite 改为多表（users/sessions/houses/house_members）、后端模块表补 auth.js；changelog 补本次记录
**效果**：测试总数 81 → 180（+99），关键安全模块与完整 API 路由层实现自动化回归保护；`pnpm lint` 0 error 0 warning。

---

## 2026-07-14 · feat(export): 自适应无图布局与小册子导出

**变更**：
- 网页端按实际媒体内容自适应：无主图物品卡片收紧、定位图自动前移、无区域图页面改为紧凑摘要；图片载入增加稳定占位、失败和超时降级。
- 默认导出改为 A5 阅读页，并自动补齐四的倍数、拼成 A4 横向双面小册子；保留 A4 纵向详细档案模式。
- 导出完整保留区域图、附属相册、长说明和内部物品清单，通过续页避免截断；打印前等待字体与图片载入完成。
- 修复按区域导出错位、切换房屋时防抖数据串写；停用无鉴权旧 `/api/home`，结构化查询 API 加入登录与房屋权限校验。
- 新增导出模型与跨房屋读写同步回归测试；测试总数 75 → 81。

---

## 2026-07-13 · feat(api): 新增 /api/query/* 结构化查询接口 + 测试完善

**Commit**: `8fcd00e` / `（本次）`
**背景**：基础 API `/api/home` 返回完整 JSON blob，适合前端整体加载；但未来接入 AI 助手（"电池在哪个抽屉？""哪些设备该维护了？"）需要精简、可过滤的语义端点。
**变更**：
- `server/index.js`：新增 6 个查询端点（summary/areas/areas/:id/items/items/:id/locations），支持 `?area=&category=&brand=&q=` 组合过滤
- `src/components/ItemForm.tsx`：图片上传区和附属图册区分别新增独立的「拍照」按钮（`capture="environment"` 调起后置摄像头），解决 Edge mobile 不带 capture 时不提供拍照选项的问题
- **本次新增**：
  - `server/query.js`：将查询逻辑从路由层抽为纯函数模块（buildSummary/listAreas/getAreaById/searchItems/getItemById/listLocations），不依赖 DB 与 HTTP，便于未来 AI Agent 直接 import 复用与单元测试
  - `server/index.js` 路由层重构为「读 DB → 调用纯函数 → 附带 updatedAt」的薄包装
  - `server/query.test.js`：新增 34 个测试用例，覆盖空 home 容错、分类/品牌/关键词组合过滤、储物单元 contents 搜索、Top 10 截断、404 路径、字段完整性等
- 文档同步更新：README / PRD / architecture / changelog
**效果**：测试总数 41 → 75（+34）；后端测试覆盖从 utils.js 扩展到 query.js；为 AI 接入预留数据访问层。

---

## 2026-07-10 · feat(maintenance): 新增物品维护提醒功能

**Commit**: `cd6ac2a`
**背景**：居家设备（净水器滤芯、空调清洗、热水器镁棒、油烟机油网等）需要定期维护，纯档案不够，要能主动提醒到期。
**变更**：
- `src/types.ts`：Item 新增 `maintenanceCycle`（天）、`lastMaintenanceDate`（YYYY-MM-DD）两个可选字段
- 新增 `src/utils/maintenance.ts`：5 档状态计算（none/ok/due-soon/overdue/pending-setup）+ 日期工具（parseDateDay/formatDateDay/daysBetween）+ 周期预设 + 周期文案 + 状态展示色
- `src/components/ItemForm.tsx`：新增「维护提醒」录入区（5 个预设按钮 + 自定义天数 + 上次维护日期 + 实时预览下次到期日）
- `src/pages/ItemFormPage.tsx` / `ItemDetailPage.tsx`：保存时传递新字段
- `src/pages/ItemDetailPage.tsx`：标题下维护徽标 + 过期/即将到期高亮提醒卡（带「去更新」）+ 信息表加维护周期/上次/下次维护行
- `src/pages/HomePage.tsx`：新增维护提醒面板，自动汇总过期/即将到期/待首次维护，按紧急度排序，点击直达详情
- `src/data/seed.ts`：给空调/油烟机/热水器加维护周期，演示过期与即将到期
- 新增 `src/utils/maintenance.test.ts`：24 个单元测试覆盖状态计算、跨年/闰年、边界、文案
**效果**：首页一打开即可看到「X 件已过期 · Y 件即将到期」，点击直达对应物品；详情页有醒目提醒卡。测试总数 17 → 41。

---

## 2026-07-10 · docs: 更新所有文档反映维护提醒与最新架构

**Commit**: `8fb419d`
**背景**：维护提醒功能提交后，需要同步刷新 README/PRD/architecture/changelog，保证下一环境接入时文档与代码一致。
**变更**：
- `README.md`：功能清单加「物品档案」「维护提醒」「单元测试」；修正 PDF 描述（移除已删除的 html2canvas 慢方案）；技术栈移除 jsPDF/html2canvas；项目结构补 SafeImage/upload/maintenance/utils.js/docs/vitest.config.ts
- `docs/PRD.md`：3.3 物品字段补全（使用说明/contents）；新增 3.4 维护提醒章节；数据模型补 maintenanceCycle/lastMaintenanceDate/contents/usage；从「不做」移除「维护周期提醒」（已实现）；后续方向加「主动通知」
- `docs/architecture.md`：新增 3.5 维护提醒设计；项目结构补全；路由说明加维护面板/徽标
- `docs/changelog.md`：补本次迭代记录

---

## 2026-07-10 · chore: 修复 upload.test.ts 中 any 类型 lint 错误

**Commit**: `e7b3f13`
**变更**：3 处 `as any` 改为 `as typeof globalThis.fetch`，lint 错误归零。

---

## 2026-07-01 · refactor(pdf): 移除 html2canvas 慢方案，统一用原生打印

**背景**：html2canvas 逐页截图方案在大体积图片 + 多页时每页 1-2 分钟，且 `animate-ping` CSS 动画会卡死截图；原生打印方案已足够好。
**变更**：
- 删除 `src/components/PdfExportRenderer.tsx`、`src/utils/pdf.ts`
- 卸载依赖 `html2canvas`、`jspdf`
- `ExportPage.tsx` 移除「下载 PDF（慢）」按钮及相关 state/handler，仅保留「打印 / 导出 PDF」
- `PrintExportRenderer.tsx` 清理过时注释
- 同步更新 README / PRD / architecture 文档

---

## 2026-07-01 · fix(pdf): 修复打印填不满 A4 + 关闭打印框卡 UI

**问题 1**：打印预览内容缩在左上角，右侧/下方白边。
**根因**：`@page { margin: 0 }` 被嵌套在 `@media print` 内，Chrome/Edge 忽略非顶层 `@page`；`#print-export-root` 用 `position: absolute` 但无显式 width，shrink-to-fit 不可靠；`.print-page` 用 mm 在不同 DPI 下换算偏差。
**修复**：`@page` 提到顶层；`#print-export-root` 用 `width: 100%`；`.print-page` 改用 `100vw × 100vh` 撑满 `@page`。

**问题 2**：关闭打印对话框（不点打印）后页面卡在「打印中…」。
**根因**：仅监听 `afterprint`，Chrome/Edge 关闭打印预览窗口时该事件不可靠，兜底 60s。
**修复**：改用 `afterprint` + `focus` 双信号，兜底缩到 5s，`done` 标志保证只清理一次。

---

## 2026-07-01 · perf(pdf): 打印 CSS 强制保留背景色

**问题**：打印导出的图鉴「掉色」、版式散架（封面边框、区域底色、表格分隔线全没了）。
**根因**：浏览器打印默认剥离背景色和边框色。
**修复**：`@media print` 加 `print-color-adjust: exact`（含 `-webkit-` 前缀）。

---

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

import express from "express";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { extractBase64Images } from "./utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 数据目录：可挂载为 volume 持久化
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const IMAGES_DIR = path.join(DATA_DIR, "images");
fs.mkdirSync(IMAGES_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "home.db");
// 前端构建产物目录
const DIST_DIR = path.join(__dirname, "..", "dist");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS home (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT,
    updated_at TEXT
  )
`);

// extractBase64Images is imported from ./utils.js


// 备份并迁移旧数据库中的 Base64 数据
function migrateBase64ToFiles() {
  const row = db.prepare("SELECT data FROM home WHERE id = 1").get();
  if (!row || !row.data) return;

  let homeData;
  try {
    homeData = JSON.parse(row.data);
  } catch (e) {
    console.error("解析数据库数据失败，跳过迁移:", e);
    return;
  }

  console.log("正在检查并迁移旧数据中的 Base64 图片...");
  const changed = extractBase64Images(homeData, IMAGES_DIR);
  if (changed) {
    try {
      const backupPath = `${DB_PATH}.bak`;
      fs.copyFileSync(DB_PATH, backupPath);
      console.log(`已成功备份数据库至 ${backupPath}`);
    } catch (err) {
      console.error("数据库备份失败，停止迁移以保护数据:", err);
      return;
    }

    const updatedData = JSON.stringify(homeData);
    db.prepare("UPDATE home SET data = ? WHERE id = 1").run(updatedData);
    console.log("数据迁移完成！所有 Base64 图片已被提取为本地物理文件。");
  } else {
    console.log("数据检查完成，未发现 Base64 图片，无需迁移。");
  }
}

migrateBase64ToFiles();

const app = express();
// base64 图片可能较大，放宽 body 限制
app.use(express.json({ limit: "256mb" }));

// 简单日志
app.use((req, _res, next) => {
  if (req.path.startsWith("/api")) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

/* ============ API ============ */

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// 服务上传的图片
app.use("/api/images", express.static(IMAGES_DIR));

// 独立上传图片接口
app.post("/api/upload", (req, res) => {
  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ error: "Missing image data" });
  }

  if (image.startsWith("data:image/")) {
    const matches = image.match(/^data:image\/([a-zA-Z+0-9]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: "Invalid base64 image data" });
    }
    let ext = matches[1];
    if (ext.includes("+")) {
      ext = ext.split("+")[0];
    }
    const dataBuffer = Buffer.from(matches[2], "base64");
    const hash = crypto.createHash("md5").update(dataBuffer).digest("hex");
    const filename = `${hash}.${ext}`;
    const filePath = path.join(IMAGES_DIR, filename);

    try {
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, dataBuffer);
      }
      return res.json({ url: `/api/images/${filename}` });
    } catch (err) {
      console.error("保存上传的图片失败:", err);
      return res.status(500).json({ error: "Failed to save image" });
    }
  } else {
    return res.json({ url: image });
  }
});

// 读取全部数据
app.get("/api/home", (_req, res) => {
  const row = db.prepare("SELECT data FROM home WHERE id = 1").get();
  if (!row || !row.data) return res.json(null);
  try {
    res.json(JSON.parse(row.data));
  } catch {
    res.json(null);
  }
});

// 保存全部数据（整体覆盖且拦截清洗残留的 base64）
app.put("/api/home", (req, res) => {
  const homeData = req.body ?? null;
  if (homeData) {
    extractBase64Images(homeData, IMAGES_DIR);
  }
  const data = JSON.stringify(homeData);
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO home (id, data, updated_at) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run(data, now);
  res.json({ ok: true, data: homeData, updated_at: now });
});

/* ============ 结构化查询 API ============ */
/* 为未来接入 AI 智能化提供精简、可检索的数据访问层。
 * 与 /api/home（返回完整 JSON blob）不同，这里按语义维度切分，
 * 支持按区域 / 分类 / 品牌 / 关键词过滤，便于 LLM 工具调用。
 */

// 从数据库读取并解析 home 数据；同时返回 updated_at
function getHomeRow() {
  const row = db.prepare("SELECT data, updated_at FROM home WHERE id = 1").get();
  if (!row || !row.data) return null;
  try {
    return { home: JSON.parse(row.data), updatedAt: row.updated_at };
  } catch {
    return null;
  }
}

// 全屋概览：区域数、物品数、分类分布、Top 品牌、需维护数等
app.get("/api/query/summary", (_req, res) => {
  const row = getHomeRow();
  if (!row) return res.json({ ok: false, error: "no data" });
  const { home, updatedAt } = row;
  const areas = home.areas ?? [];
  const items = areas.flatMap((a) => a.items ?? []);

  const categoryCount = {};
  const brandCount = {};
  let needsMaintenance = 0;

  for (const it of items) {
    if (it.category) categoryCount[it.category] = (categoryCount[it.category] ?? 0) + 1;
    if (it.brand) brandCount[it.brand] = (brandCount[it.brand] ?? 0) + 1;
    if (it.maintenanceCycle) needsMaintenance += 1;
  }

  res.json({
    ok: true,
    title: home.title,
    subtitle: home.subtitle,
    areaCount: areas.length,
    itemCount: items.length,
    categories: categoryCount,
    topBrands: Object.entries(brandCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count })),
    needsMaintenance,
    updatedAt,
  });
});

// 区域列表：默认精简（不含物品），?withItems=1 时附带物品
app.get("/api/query/areas", (req, res) => {
  const row = getHomeRow();
  if (!row) return res.json({ ok: false, error: "no data" });
  const withItems = req.query.withItems === "1";
  const areas = (row.home.areas ?? []).map((a) => {
    const base = {
      id: a.id,
      name: a.name,
      description: a.description,
      itemCount: (a.items ?? []).length,
      imageCount: (a.images ?? []).length,
      floorPlanPos: a.floorPlanPos,
    };
    if (withItems) base.items = a.items ?? [];
    return base;
  });
  res.json({ ok: true, areas, updatedAt: row.updatedAt });
});

// 单个区域详情：含物品与区域图
app.get("/api/query/areas/:areaId", (req, res) => {
  const row = getHomeRow();
  if (!row) return res.json({ ok: false, error: "no data" });
  const area = (row.home.areas ?? []).find((a) => a.id === req.params.areaId);
  if (!area) return res.status(404).json({ ok: false, error: "area not found" });
  res.json({ ok: true, area, updatedAt: row.updatedAt });
});

// 物品列表 / 搜索：支持 ?area=, ?category=, ?brand=, ?q= 组合过滤
app.get("/api/query/items", (req, res) => {
  const row = getHomeRow();
  if (!row) return res.json({ ok: false, error: "no data" });
  const { area, category, brand, q } = req.query;
  const keyword = typeof q === "string" ? q.trim().toLowerCase() : "";

  const results = [];
  for (const a of row.home.areas ?? []) {
    if (area && a.id !== area) continue;
    for (const it of a.items ?? []) {
      if (category && it.category !== category) continue;
      if (brand && it.brand !== brand) continue;
      if (keyword) {
        const haystack = [
          it.name,
          it.brand,
          it.spec,
          it.remark,
          it.usage,
          ...(it.contents ?? []).map((c) => `${c.name} ${c.quantity ?? ""} ${c.remark ?? ""}`),
        ].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(keyword)) continue;
      }
      results.push({ ...it, areaId: a.id, areaName: a.name });
    }
  }
  res.json({ ok: true, count: results.length, items: results, updatedAt: row.updatedAt });
});

// 单个物品详情：附带所属区域信息
app.get("/api/query/items/:itemId", (req, res) => {
  const row = getHomeRow();
  if (!row) return res.json({ ok: false, error: "no data" });
  for (const a of row.home.areas ?? []) {
    const item = (a.items ?? []).find((i) => i.id === req.params.itemId);
    if (item) {
      return res.json({
        ok: true,
        item,
        area: {
          id: a.id,
          name: a.name,
          description: a.description,
        },
        // 物品在区域图上的位置上下文
        areaImage: (a.images ?? []).find((img) => img.id === item.areaImageId) ?? null,
        updatedAt: row.updatedAt,
      });
    }
  }
  res.status(404).json({ ok: false, error: "item not found" });
});

// 物品位置索引：物品 + 所属区域 + 区域图位置（用于"东西放哪了"类查询）
app.get("/api/query/locations", (req, res) => {
  const row = getHomeRow();
  if (!row) return res.json({ ok: false, error: "no data" });
  const { area, category } = req.query;
  const locations = [];
  for (const a of row.home.areas ?? []) {
    if (area && a.id !== area) continue;
    for (const it of a.items ?? []) {
      if (category && it.category !== category) continue;
      locations.push({
        itemId: it.id,
        name: it.name,
        category: it.category,
        brand: it.brand,
        areaId: a.id,
        areaName: a.name,
        areaImageId: it.areaImageId ?? null,
        areaImagePos: it.areaImagePos ?? null,
        // 如果物品本身是储物单元，附带其内部物品清单
        contents: it.contents ?? [],
      });
    }
  }
  res.json({ ok: true, count: locations.length, locations, updatedAt: row.updatedAt });
});

/* ============ 静态前端 ============ */

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  // SPA history 路由 fallback
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
} else {
  console.warn("[warn] dist/ 目录不存在，前端未构建。仅 API 可用。");
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`iHouse 服务已启动: http://0.0.0.0:${PORT}`);
  console.log(`数据库: ${DB_PATH}`);
  console.log(`前端: ${DIST_DIR}`);
});

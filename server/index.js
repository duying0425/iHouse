import express from "express";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 数据目录：可挂载为 volume 持久化
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

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

// 保存全部数据（整体覆盖）
app.put("/api/home", (req, res) => {
  const data = JSON.stringify(req.body ?? null);
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO home (id, data, updated_at) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run(data, now);
  res.json({ ok: true, updated_at: now });
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

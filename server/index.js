import express from "express";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import crypto from "crypto";

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

// 提取数据中的 Base64 图片并保存为物理文件
function extractBase64Images(obj) {
  let changed = false;
  if (!obj || typeof obj !== "object") return changed;

  for (const key in obj) {
    if (typeof obj[key] === "string" && obj[key].startsWith("data:image/")) {
      const base64Str = obj[key];
      const matches = base64Str.match(/^data:image\/([a-zA-Z+0-9]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        let ext = matches[1];
        if (ext.includes("+")) {
          ext = ext.split("+")[0];
        }
        const dataBuffer = Buffer.from(matches[2], "base64");
        const hash = crypto.createHash("md5").update(dataBuffer).digest("hex");
        const filename = `${hash}.${ext}`;
        const filePath = path.join(IMAGES_DIR, filename);

        if (!fs.existsSync(filePath)) {
          fs.writeFileSync(filePath, dataBuffer);
        }
        obj[key] = `/api/images/${filename}`;
        changed = true;
      }
    } else if (Array.isArray(obj[key])) {
      for (let i = 0; i < obj[key].length; i++) {
        if (typeof obj[key][i] === "string" && obj[key][i].startsWith("data:image/")) {
          const base64Str = obj[key][i];
          const matches = base64Str.match(/^data:image\/([a-zA-Z+0-9]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            let ext = matches[1];
            if (ext.includes("+")) {
              ext = ext.split("+")[0];
            }
            const dataBuffer = Buffer.from(matches[2], "base64");
            const hash = crypto.createHash("md5").update(dataBuffer).digest("hex");
            const filename = `${hash}.${ext}`;
            const filePath = path.join(IMAGES_DIR, filename);

            if (!fs.existsSync(filePath)) {
              fs.writeFileSync(filePath, dataBuffer);
            }
            obj[key][i] = `/api/images/${filename}`;
            changed = true;
          }
        } else if (typeof obj[key][i] === "object") {
          const childChanged = extractBase64Images(obj[key][i]);
          if (childChanged) changed = true;
        }
      }
    } else if (typeof obj[key] === "object") {
      const childChanged = extractBase64Images(obj[key]);
      if (childChanged) changed = true;
    }
  }
  return changed;
}

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
  const changed = extractBase64Images(homeData);
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
    extractBase64Images(homeData);
  }
  const data = JSON.stringify(homeData);
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO home (id, data, updated_at) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run(data, now);
  res.json({ ok: true, data: homeData, updated_at: now });
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

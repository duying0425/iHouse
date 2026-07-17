import express from "express";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import crypto from "crypto";
import JSZip from "jszip";
import multer from "multer";
import dotenv from "dotenv";
import { extractBase64Images, collectImageRefs, finalizeTempImages, cleanupTempImages } from "./utils.js";
import {
  AiRecognitionError,
  recognizeItemFromImage,
  resolveImageDataUrl,
} from "./ai-recognition.js";
import {
  buildSummary,
  listAreas,
  getAreaById,
  searchItems,
  getItemById,
  listLocations,
} from "./query.js";
import {
  hashPassword,
  verifyPassword,
  generateToken,
  tokenExpiry,
  generateShareCode,
  generateHouseId,
  createAuthMiddleware,
  isValidUsername,
  isValidPassword,
} from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 本地开发读取仓库根目录 .env；系统环境变量和 Docker environment 始终优先。
dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });
dotenv.config({ path: path.join(__dirname, ".env"), quiet: true });

const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || "";
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || "";

// 数据目录：可挂载为 volume 持久化
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const IMAGES_DIR = path.join(DATA_DIR, "images");
fs.mkdirSync(IMAGES_DIR, { recursive: true });

// 临时图片目录：上传时先写到这里，房屋数据 PUT 时再"转正"到正式目录。
// 未被转正的 tmp 文件由 cleanupTempImages 周期性清理（默认 24h）。
const IMAGES_TMP_DIR = path.join(IMAGES_DIR, "tmp");
fs.mkdirSync(IMAGES_TMP_DIR, { recursive: true });
// 临时图片最大存活时长：24 小时
const TMP_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// 清理周期：1 小时
const TMP_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

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
  );

  -- 多用户账户系统
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- 房屋（多户隔离）
  CREATE TABLE IF NOT EXISTS houses (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    share_code TEXT UNIQUE NOT NULL,
    data TEXT,
    updated_at TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- 房屋成员关系
  CREATE TABLE IF NOT EXISTS house_members (
    house_id TEXT REFERENCES houses(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
    joined_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (house_id, user_id)
  );

  -- 会话 token
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );
`);

// 鉴权中间件（提前声明：/api/upload 等接口需要用到）
const requireAuth = createAuthMiddleware(db);

// 文件上传（zip 备份导入用），内存存储，256MB 上限
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 256 * 1024 * 1024 },
});

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

/**
 * 旧版数据自动迁移到多用户系统。
 * 触发条件：home 表有数据 + users 表为空 + houses 表为空。
 * 行为：创建默认 admin 账户 + 默认房屋，把 home.data 搬到 houses.data。
 * 用于 Docker 镜像升级场景，避免用户手动备份再导入。
 */
function migrateOldHomeToMultiUser() {
  const homeRow = db.prepare("SELECT data FROM home WHERE id = 1").get();
  if (!homeRow || !homeRow.data) return; // 没有旧数据，无需迁移

  const userCount = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  if (userCount > 0) return; // 已有用户，跳过（不重复迁移）

  const houseCount = db.prepare("SELECT COUNT(*) AS c FROM houses").get().c;
  if (houseCount > 0) return; // 已有房屋，跳过

  // 从旧数据中提取房屋名（title 字段）
  let houseName = "我的家";
  try {
    const oldState = JSON.parse(homeRow.data);
    if (oldState && typeof oldState.title === "string" && oldState.title.trim()) {
      houseName = oldState.title.trim().slice(0, 100);
    }
  } catch {
    /* ignore parse error, use default name */
  }

  // 生成 12 位默认密码（避免硬编码弱密码）
  const defaultPassword = crypto.randomBytes(6).toString("hex");
  const passwordHash = hashPassword(defaultPassword);
  const houseId = generateHouseId();
  const shareCode = generateShareCode();
  const now = new Date().toISOString();

  const migrate = db.transaction(() => {
    const info = db
      .prepare(
        "INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)"
      )
      .run("admin", passwordHash, "管理员");
    const userId = info.lastInsertRowid;

    db.prepare(
      `INSERT INTO houses (id, name, share_code, data, updated_at, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(houseId, houseName, shareCode, homeRow.data, now, userId, now);

    db.prepare(
      `INSERT INTO house_members (house_id, user_id, role, status, joined_at, created_at)
       VALUES (?, ?, 'admin', 'approved', ?, ?)`
    ).run(houseId, userId, now, now);
  });
  migrate();

  console.log("");
  console.log("==========================================================");
  console.log("  ✓ 旧版数据已自动迁移到多用户系统");
  console.log("==========================================================");
  console.log(`  默认管理员账号:  admin`);
  console.log(`  默认密码:         ${defaultPassword}`);
  console.log(`  房屋名:           ${houseName}`);
  console.log(`  分享码:           ${shareCode}`);
  console.log("  ⚠ 请登录后立即在「设置」中修改密码！");
  console.log("==========================================================");
  console.log("");
}

migrateOldHomeToMultiUser();

// 启动时清理一次过期的临时图片，并设定周期清理
// （上传后未被保存引用的 tmp 文件会留存到此处被删除）
const initialRemoved = cleanupTempImages(IMAGES_TMP_DIR, TMP_MAX_AGE_MS);
if (initialRemoved > 0) {
  console.log(`[tmp-cleanup] 启动时清理了 ${initialRemoved} 个过期临时图片`);
}
setInterval(() => {
  const n = cleanupTempImages(IMAGES_TMP_DIR, TMP_MAX_AGE_MS);
  if (n > 0) {
    console.log(`[tmp-cleanup] 清理了 ${n} 个过期临时图片`);
  }
}, TMP_CLEANUP_INTERVAL_MS).unref();

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
app.use("/api/images", express.static(IMAGES_DIR, {
  setHeaders: (res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'");
  }
}));

// 独立上传图片接口（需登录）
// 上传的图片先落入 tmp 子目录，URL 形如 /api/images/tmp/xxx.jpg。
// 当用户保存物品/房屋数据（PUT /api/houses/:id/data）时，
// finalizeTempImages 会自动把引用到的 tmp 文件复制到正式目录并把 URL 改写为
// /api/images/xxx.jpg。未被保存引用的 tmp 文件由 cleanupTempImages 定期清理。
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

app.post("/api/upload", requireAuth, (req, res) => {
  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ error: "Missing image data" });
  }

  if (image.startsWith("data:image/")) {
    const matches = image.match(/^data:image\/([a-zA-Z+0-9]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: "Invalid base64 image data" });
    }
    let ext = matches[1].toLowerCase();
    if (ext.includes("+")) {
      ext = ext.split("+")[0];
    }
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return res.status(400).json({ error: "Unsupported image format" });
    }
    const dataBuffer = Buffer.from(matches[2], "base64");
    if (dataBuffer.length > 10 * 1024 * 1024) {
      return res.status(413).json({ error: "图片文件过大，限制在 10MB 以内" });
    }
    const hash = crypto.createHash("md5").update(dataBuffer).digest("hex");
    const filename = `${hash}.${ext}`;
    const filePath = path.join(IMAGES_TMP_DIR, filename);

    try {
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, dataBuffer);
      }
      return res.json({ url: `/api/images/tmp/${filename}` });
    } catch (err) {
      console.error("保存上传的图片失败:", err);
      return res.status(500).json({ error: "Failed to save image" });
    }
  } else {
    return res.json({ url: image });
  }
});

// 根据已上传的物品图片识别档案字段。API Key 仅在服务端读取，不下发到浏览器。
app.post("/api/ai/recognize-item", requireAuth, async (req, res) => {
  try {
    const imageDataUrl = resolveImageDataUrl(req.body?.image, IMAGES_DIR);
    const result = await recognizeItemFromImage(imageDataUrl);
    return res.json({ ok: true, result });
  } catch (error) {
    if (error instanceof AiRecognitionError) {
      if (error.status >= 500) {
        console.error(`[AI recognition] ${error.code}: ${error.message}`);
      }
      return res.status(error.status).json({
        ok: false,
        error: error.message,
        code: error.code,
      });
    }
    console.error("[AI recognition] 未预期错误:", error);
    return res.status(500).json({
      ok: false,
      error: "AI 识别失败，请稍后重试",
      code: "AI_RECOGNITION_FAILED",
    });
  }
});

// 旧版单房屋接口已停用。旧表仅保留用于迁移和旧备份兼容，禁止通过网络读写。
app.all("/api/home", (_req, res) => {
  res.status(410).json({
    ok: false,
    error: "旧版 /api/home 已停用，请使用 /api/houses/:id/data",
  });
});

/* ============ 结构化查询 API ============ */
/* 为未来接入 AI 智能化提供精简、可检索的数据访问层。
 * 与房屋数据接口（返回完整 JSON blob）不同，这里按语义维度切分，
 * 支持按区域 / 分类 / 品牌 / 关键词过滤，便于 LLM 工具调用。
 * 核心逻辑抽取到 ./query.js 作为纯函数，便于复用与单元测试。
 */

// 从数据库读取并解析 home 数据；同时返回 updated_at
function getQueryHouseRow(req, res) {
  const houseId = String(req.query.houseId || req.headers["x-house-id"] || "").trim();
  if (!houseId) {
    res.status(400).json({ ok: false, error: "缺少 houseId" });
    return null;
  }
  if (!canAccessHouse(houseId, req.user.id)) {
    res.status(403).json({ ok: false, error: "无权访问该房屋" });
    return null;
  }
  const row = db
    .prepare("SELECT data, updated_at FROM houses WHERE id = ?")
    .get(houseId);
  if (!row || !row.data) return null;
  try {
    return { home: JSON.parse(row.data), updatedAt: row.updated_at };
  } catch {
    return null;
  }
}

// 在结果上附带 updatedAt，统一返回格式
function withUpdatedAt(result, updatedAt) {
  return { ...result, updatedAt };
}

// 全屋概览：区域数、物品数、分类分布、Top 品牌、需维护数等
app.get("/api/query/summary", requireAuth, (req, res) => {
  const row = getQueryHouseRow(req, res);
  if (res.headersSent) return;
  if (!row) return res.json({ ok: false, error: "no data" });
  res.json(withUpdatedAt(buildSummary(row.home), row.updatedAt));
});

// 区域列表：默认精简（不含物品），?withItems=1 时附带物品
app.get("/api/query/areas", requireAuth, (req, res) => {
  const row = getQueryHouseRow(req, res);
  if (res.headersSent) return;
  if (!row) return res.json({ ok: false, error: "no data" });
  const result = listAreas(row.home, { withItems: req.query.withItems === "1" });
  res.json(withUpdatedAt(result, row.updatedAt));
});

// 单个区域详情：含物品与区域图
app.get("/api/query/areas/:areaId", requireAuth, (req, res) => {
  const row = getQueryHouseRow(req, res);
  if (res.headersSent) return;
  if (!row) return res.json({ ok: false, error: "no data" });
  const result = getAreaById(row.home, req.params.areaId);
  if (!result.ok) return res.status(404).json(result);
  res.json(withUpdatedAt(result, row.updatedAt));
});

// 物品列表 / 搜索：支持 ?area=, ?category=, ?brand=, ?q= 组合过滤
app.get("/api/query/items", requireAuth, (req, res) => {
  const row = getQueryHouseRow(req, res);
  if (res.headersSent) return;
  if (!row) return res.json({ ok: false, error: "no data" });
  const result = searchItems(row.home, {
    area: req.query.area,
    category: req.query.category,
    brand: req.query.brand,
    q: req.query.q,
  });
  res.json(withUpdatedAt(result, row.updatedAt));
});

// 单个物品详情：附带所属区域信息
app.get("/api/query/items/:itemId", requireAuth, (req, res) => {
  const row = getQueryHouseRow(req, res);
  if (res.headersSent) return;
  if (!row) return res.json({ ok: false, error: "no data" });
  const result = getItemById(row.home, req.params.itemId);
  if (!result.ok) return res.status(404).json(result);
  res.json(withUpdatedAt(result, row.updatedAt));
});

// 物品位置索引：物品 + 所属区域 + 区域图位置（用于"东西放哪了"类查询）
app.get("/api/query/locations", requireAuth, (req, res) => {
  const row = getQueryHouseRow(req, res);
  if (res.headersSent) return;
  if (!row) return res.json({ ok: false, error: "no data" });
  const result = listLocations(row.home, {
    area: req.query.area,
    category: req.query.category,
  });
  res.json(withUpdatedAt(result, row.updatedAt));
});

/* ============ 账户与房屋系统 ============ */

// 取当前用户在某房屋的成员记录（含 role + status），无记录返回 null
function getMembership(houseId, userId) {
  return db
    .prepare(
      `SELECT role, status, joined_at FROM house_members
       WHERE house_id = ? AND user_id = ?`
    )
    .get(houseId, userId) || null;
}

// 检查当前用户能否访问该房屋数据（admin 或 approved member）
function canAccessHouse(houseId, userId) {
  const m = getMembership(houseId, userId);
  if (!m) return false;
  if (m.status !== "approved") return false;
  return true;
}

/* ---- 认证 ---- */
app.get("/api/auth/config", (_req, res) => {
  res.json({
    turnstileEnabled: !!(TURNSTILE_SITE_KEY && TURNSTILE_SECRET_KEY),
    turnstileSiteKey: TURNSTILE_SITE_KEY,
  });
});

app.post("/api/auth/register", async (req, res) => {
  const { username, password, displayName, turnstileToken } = req.body || {};
  if (TURNSTILE_SITE_KEY && TURNSTILE_SECRET_KEY) {
    if (!turnstileToken) {
      return res.status(400).json({ ok: false, error: "人机验证未完成，请重试" });
    }
    try {
      const verifyUrl = process.env.TURNSTILE_VERIFY_URL || "https://challenges.cloudflare.com/turnstile/v0/siteverify";
      const verifyRes = await fetch(verifyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: TURNSTILE_SECRET_KEY,
          response: turnstileToken,
          remoteip: req.ip,
        }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.success) {
        return res.status(400).json({ ok: false, error: "人机验证失败，请重试" });
      }
    } catch (err) {
      console.error("Turnstile verification error:", err);
      return res.status(500).json({ ok: false, error: "人机验证服务不可用，请稍后再试" });
    }
  }

  if (!isValidUsername(username)) {
    return res.status(400).json({ ok: false, error: "用户名格式不合法（3-32 字符，支持字母数字下划线中文）" });
  }
  if (!isValidPassword(password)) {
    return res.status(400).json({ ok: false, error: "密码长度需 6-128 位" });
  }
  // 用户名唯一性检查
  const exists = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (exists) {
    return res.status(409).json({ ok: false, error: "用户名已被占用" });
  }
  const hash = hashPassword(password);
  const info = db
    .prepare("INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)")
    .run(username, hash, displayName || null);
  const userId = info.lastInsertRowid;
  const token = generateToken();
  db.prepare(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)"
  ).run(token, userId, tokenExpiry());
  res.json({
    ok: true,
    token,
    user: { id: userId, username, displayName: displayName || null },
  });
});

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "请输入用户名和密码" });
  }
  const row = db.prepare("SELECT id, username, display_name, password_hash FROM users WHERE username = ?").get(username);
  if (!row || !verifyPassword(password, row.password_hash)) {
    return res.status(401).json({ ok: false, error: "用户名或密码错误" });
  }
  const token = generateToken();
  db.prepare(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)"
  ).run(token, row.id, tokenExpiry());
  res.json({
    ok: true,
    token,
    user: { id: row.id, username: row.username, displayName: row.display_name },
  });
});

app.post("/api/auth/logout", requireAuth, (req, res) => {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(req.token);
  res.json({ ok: true });
});

// 修改密码
app.post("/api/auth/change-password", requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ ok: false, error: "请输入当前密码和新密码" });
  }
  if (!isValidPassword(newPassword)) {
    return res.status(400).json({ ok: false, error: "新密码长度需 6-128 位" });
  }
  const row = db
    .prepare("SELECT password_hash FROM users WHERE id = ?")
    .get(req.user.id);
  if (!row || !verifyPassword(currentPassword, row.password_hash)) {
    return res.status(400).json({ ok: false, error: "当前密码错误" });
  }
  const newHash = hashPassword(newPassword);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
    newHash,
    req.user.id
  );
  res.json({ ok: true });
});

app.get("/api/me", requireAuth, (req, res) => {
  const houses = db
    .prepare(
      `SELECT h.id, h.name, h.share_code, hm.role, hm.status, hm.joined_at, h.updated_at
       FROM house_members hm
       JOIN houses h ON h.id = hm.house_id
       WHERE hm.user_id = ?
       ORDER BY hm.created_at DESC`
    )
    .all(req.user.id);
  res.json({
    ok: true,
    user: req.user,
    houses: houses.map((h) => ({
      id: h.id,
      name: h.name,
      shareCode: h.share_code,
      role: h.role,
      status: h.status,
      joinedAt: h.joined_at,
      updatedAt: h.updated_at,
    })),
  });
});

/* ---- 房屋 ---- */
app.get("/api/houses", requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT h.id, h.name, h.share_code, hm.role, hm.status, hm.joined_at, h.updated_at
       FROM house_members hm
       JOIN houses h ON h.id = hm.house_id
       WHERE hm.user_id = ?
       ORDER BY hm.created_at DESC`
    )
    .all(req.user.id);
  const houses = rows.map((h) => {
    const membersCount = db
      .prepare("SELECT COUNT(*) AS c FROM house_members WHERE house_id = ? AND status = 'approved'")
      .get(h.id).c;
    return {
      id: h.id,
      name: h.name,
      shareCode: h.share_code,
      role: h.role,
      status: h.status,
      joinedAt: h.joined_at,
      updatedAt: h.updated_at,
      membersCount,
    };
  });
  res.json({ ok: true, houses });
});

app.post("/api/houses", requireAuth, (req, res) => {
  const { name } = req.body || {};
  if (!name || typeof name !== "string" || name.trim().length === 0 || name.length > 100) {
    return res.status(400).json({ ok: false, error: "房屋名称不合法（1-100 字符）" });
  }
  // 生成唯一 share_code（重试 5 次）
  let shareCode = "";
  for (let i = 0; i < 5; i++) {
    const code = generateShareCode();
    const exists = db.prepare("SELECT id FROM houses WHERE share_code = ?").get(code);
    if (!exists) { shareCode = code; break; }
  }
  if (!shareCode) {
    return res.status(500).json({ ok: false, error: "生成分享码失败，请重试" });
  }
  const houseId = generateHouseId();
  const now = new Date().toISOString();
  const initialData = JSON.stringify({
    schemaVersion: 3,
    title: name,
    subtitle: "居所图鉴",
    floorPlanImage: "",
    areas: [],
  });
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO houses (id, name, share_code, data, updated_at, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(houseId, name.trim(), shareCode, initialData, now, req.user.id, now);
    db.prepare(
      `INSERT INTO house_members (house_id, user_id, role, status, joined_at)
       VALUES (?, ?, 'admin', 'approved', ?)`
    ).run(houseId, req.user.id, now);
  });
  tx();
  res.json({
    ok: true,
    house: {
      id: houseId,
      name: name.trim(),
      shareCode,
      role: "admin",
      status: "approved",
      updatedAt: now,
    },
  });
});

// 通过分享码获取房屋公开信息（用于加入前预览）
app.get("/api/houses/lookup", requireAuth, (req, res) => {
  const code = String(req.query.code || "").trim().toUpperCase();
  if (!code) return res.status(400).json({ ok: false, error: "请输入分享码" });
  const row = db
    .prepare("SELECT id, name FROM houses WHERE share_code = ?")
    .get(code);
  if (!row) return res.status(404).json({ ok: false, error: "分享码无效" });
  // 已存在的成员关系
  const membership = getMembership(row.id, req.user.id);
  res.json({
    ok: true,
    house: { id: row.id, name: row.name },
    membership: membership || null,
  });
});

// 申请加入房屋
app.post("/api/houses/join", requireAuth, (req, res) => {
  const { shareCode } = req.body || {};
  if (!shareCode) return res.status(400).json({ ok: false, error: "请输入分享码" });
  const code = String(shareCode).trim().toUpperCase();
  const row = db.prepare("SELECT id, name FROM houses WHERE share_code = ?").get(code);
  if (!row) return res.status(404).json({ ok: false, error: "分享码无效" });
  const existing = getMembership(row.id, req.user.id);
  if (existing) {
    return res.status(409).json({
      ok: false,
      error: `已存在申请记录（状态：${existing.status}）`,
      membership: existing,
    });
  }
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO house_members (house_id, user_id, role, status, created_at)
     VALUES (?, ?, 'member', 'pending', ?)`
  ).run(row.id, req.user.id, now);
  res.json({ ok: true, houseId: row.id, houseName: row.name, status: "pending" });
});

// 房屋详情（仅 admin/member 可访问）
app.get("/api/houses/:id", requireAuth, (req, res) => {
  if (!canAccessHouse(req.params.id, req.user.id)) {
    return res.status(403).json({ ok: false, error: "无权访问该房屋" });
  }
  const row = db.prepare("SELECT id, name, share_code, updated_at FROM houses WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ ok: false, error: "房屋不存在" });
  const membership = getMembership(row.id, req.user.id);
  res.json({
    ok: true,
    house: {
      id: row.id,
      name: row.name,
      shareCode: row.share_code,
      updatedAt: row.updated_at,
    },
    myRole: membership?.role,
    myStatus: membership?.status,
  });
});

// 读取房屋数据（替代原 /api/home）
app.get("/api/houses/:id/data", requireAuth, (req, res) => {
  if (!canAccessHouse(req.params.id, req.user.id)) {
    return res.status(403).json({ ok: false, error: "无权访问该房屋" });
  }
  const row = db.prepare("SELECT data, updated_at FROM houses WHERE id = ?").get(req.params.id);
  if (!row || !row.data) return res.json(null);
  try {
    res.json(JSON.parse(row.data));
  } catch {
    res.json(null);
  }
});

// 更新房屋数据
app.put("/api/houses/:id/data", requireAuth, (req, res) => {
  if (!canAccessHouse(req.params.id, req.user.id)) {
    return res.status(403).json({ ok: false, error: "无权修改该房屋" });
  }
  const homeData = req.body ?? null;
  if (homeData) {
    // 1) 内嵌的 base64 数据落盘为正式图片
    extractBase64Images(homeData, IMAGES_DIR);
    // 2) 把引用的 tmp 临时图片转正（复制到正式目录并改写 URL）
    finalizeTempImages(homeData, IMAGES_DIR, IMAGES_TMP_DIR);
  }
  const data = JSON.stringify(homeData);
  const now = new Date().toISOString();
  db.prepare("UPDATE houses SET data = ?, updated_at = ? WHERE id = ?").run(data, now, req.params.id);
  res.json({ ok: true, updatedAt: now });
});

/* ---- 备份：导出/导入 zip（home.json + images/） ---- */

// 导出当前房屋 zip 备份
app.get("/api/houses/:id/backup", requireAuth, async (req, res) => {
  const houseId = req.params.id;
  if (!canAccessHouse(houseId, req.user.id)) {
    return res.status(403).json({ ok: false, error: "无权访问该房屋" });
  }
  const row = db.prepare("SELECT name, data FROM houses WHERE id = ?").get(houseId);
  if (!row) return res.status(404).json({ ok: false, error: "房屋不存在" });

  let homeState = null;
  try {
    homeState = row.data ? JSON.parse(row.data) : null;
  } catch {
    homeState = null;
  }

  const zip = new JSZip();
  // home.json：该房屋的完整状态
  zip.file("home.json", JSON.stringify(homeState, null, 2));

  // 收集所有引用的图片，写入 images/
  let imageCount = 0;
  if (homeState) {
    const refs = collectImageRefs(homeState);
    for (const fname of refs) {
      // 路径安全：仅允许文件名，禁止任何路径分隔符
      if (/[\\/]/.test(fname)) continue;
      const fp = path.join(IMAGES_DIR, fname);
      if (fs.existsSync(fp)) {
        zip.file(`images/${fname}`, await fs.promises.readFile(fp));
        imageCount++;
      }
    }
  }

  // 元数据
  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        version: 1,
        format: "ihouse-house-backup",
        exportedAt: new Date().toISOString(),
        houseId,
        houseName: row.name,
        imageCount,
      },
      null,
      2
    )
  );

  const ts = new Date().toISOString().slice(0, 10);
  const safeName = (row.name || "house").replace(/[^\w\u4e00-\u9fa5-]/g, "_").slice(0, 40);
  const filename = `ihouse-${safeName}-${ts}.zip`;

  const buf = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.setHeader("Content-Length", String(buf.length));
  res.end(buf);
});

// 导入 zip 备份到当前房屋（仅 admin 可用）
app.post(
  "/api/houses/:id/backup/import",
  requireAuth,
  upload.single("file"),
  async (req, res) => {
    const houseId = req.params.id;
    const membership = getMembership(houseId, req.user.id);
    if (!membership || membership.role !== "admin" || membership.status !== "approved") {
      return res.status(403).json({ ok: false, error: "仅该房屋管理员可导入备份" });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, error: "未收到文件" });
    }

    let zip;
    try {
      zip = await JSZip.loadAsync(req.file.buffer);
    } catch {
      return res.status(400).json({ ok: false, error: "无法解析 zip 文件" });
    }

    // 1) 读 home.json（或兼容旧版 home.db → 提取 home 表 data 字段）
    let homeState = null;
    const homeJsonFile = zip.file("home.json");
    if (homeJsonFile) {
      try {
        homeState = JSON.parse(await homeJsonFile.async("string"));
      } catch {
        return res.status(400).json({ ok: false, error: "home.json 解析失败" });
      }
    } else {
      const homeDbFile = zip.file("home.db") || zip.file("home.db.bak");
      if (homeDbFile) {
        try {
          const dbBuf = await homeDbFile.async("nodebuffer");
          const tmpDbPath = path.join(DATA_DIR, `.import-${Date.now()}.db`);
          fs.writeFileSync(tmpDbPath, dbBuf);
          let extracted = null;
          try {
            const tmpDb = new Database(tmpDbPath, { readonly: true });
            const row = tmpDb.prepare("SELECT data FROM home WHERE id = 1").get();
            if (row && row.data) extracted = JSON.parse(row.data);
            tmpDb.close();
          } finally {
            try { fs.unlinkSync(tmpDbPath); } catch { /* ignore */ }
          }
          homeState = extracted;
        } catch (e) {
          return res.status(400).json({ ok: false, error: `旧版 db 解析失败: ${e.message}` });
        }
      } else {
        return res.status(400).json({ ok: false, error: "zip 中缺少 home.json 或 home.db" });
      }
    }

    // 2) 解压 images/* 到 IMAGES_DIR（路径安全：仅文件名）
    let imageCount = 0;
    const imageFiles = Object.keys(zip.files).filter((p) => p.startsWith("images/"));
    for (const relPath of imageFiles) {
      const entry = zip.files[relPath];
      if (entry.dir) continue;
      const fname = path.basename(relPath);
      if (!fname || fname.includes("..") || fname.includes("/") || fname.includes("\\")) continue;
      const ext = path.extname(fname).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext.slice(1))) continue;
      const dest = path.join(IMAGES_DIR, fname);
      const buf = await entry.async("nodebuffer");
      fs.writeFileSync(dest, buf);
      imageCount++;
    }

    // 3) 清洗 home state 中残留的 base64（迁移老数据用）
    if (homeState) extractBase64Images(homeState, IMAGES_DIR);

    // 4) 写入 houses.data
    const now = new Date().toISOString();
    db.prepare("UPDATE houses SET data = ?, updated_at = ? WHERE id = ?").run(
      JSON.stringify(homeState),
      now,
      houseId
    );

    res.json({
      ok: true,
      updatedAt: now,
      imageCount,
      hasHomeState: homeState != null,
    });
  }
);

/* ---- 成员管理 ---- */
app.get("/api/houses/:id/members", requireAuth, (req, res) => {
  const membership = getMembership(req.params.id, req.user.id);
  if (!membership || membership.status !== "approved") {
    return res.status(403).json({ ok: false, error: "无权访问" });
  }
  // 非 admin 只能看到 approved 成员；admin 能看到所有（含 pending/rejected）
  const showAll = membership.role === "admin";
  const rows = db
    .prepare(
      `SELECT hm.user_id, hm.role, hm.status, hm.joined_at, hm.created_at,
              u.username, u.display_name
       FROM house_members hm
       JOIN users u ON u.id = hm.user_id
       WHERE hm.house_id = ?
       ${showAll ? "" : "AND hm.status = 'approved'"}
       ORDER BY hm.created_at ASC`
    )
    .all(req.params.id);
  res.json({
    ok: true,
    members: rows.map((r) => ({
      userId: r.user_id,
      username: r.username,
      displayName: r.display_name,
      role: r.role,
      status: r.status,
      joinedAt: r.joined_at,
    })),
    myRole: membership.role,
  });
});

app.post("/api/houses/:id/members/:userId/approve", requireAuth, (req, res) => {
  const houseId = req.params.id;
  const targetUserId = Number(req.params.userId);
  const adminM = getMembership(houseId, req.user.id);
  if (!adminM || adminM.role !== "admin" || adminM.status !== "approved") {
    return res.status(403).json({ ok: false, error: "仅管理员可审批" });
  }
  const target = getMembership(houseId, targetUserId);
  if (!target) return res.status(404).json({ ok: false, error: "申请记录不存在" });
  if (target.status !== "pending") {
    return res.status(409).json({ ok: false, error: `该申请当前状态：${target.status}` });
  }
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE house_members SET status = 'approved', joined_at = ? WHERE house_id = ? AND user_id = ?"
  ).run(now, houseId, targetUserId);
  res.json({ ok: true });
});

app.post("/api/houses/:id/members/:userId/reject", requireAuth, (req, res) => {
  const houseId = req.params.id;
  const targetUserId = Number(req.params.userId);
  const adminM = getMembership(houseId, req.user.id);
  if (!adminM || adminM.role !== "admin" || adminM.status !== "approved") {
    return res.status(403).json({ ok: false, error: "仅管理员可审批" });
  }
  const target = getMembership(houseId, targetUserId);
  if (!target) return res.status(404).json({ ok: false, error: "申请记录不存在" });
  if (target.status !== "pending") {
    return res.status(409).json({ ok: false, error: `该申请当前状态：${target.status}` });
  }
  db.prepare(
    "UPDATE house_members SET status = 'rejected' WHERE house_id = ? AND user_id = ?"
  ).run(houseId, targetUserId);
  res.json({ ok: true });
});

// 移除成员 / 退出房屋
app.delete("/api/houses/:id/members/:userId", requireAuth, (req, res) => {
  const houseId = req.params.id;
  const targetUserId = Number(req.params.userId);
  const me = getMembership(houseId, req.user.id);
  // admin 可移除任何人；member 可移除自己（退出）
  const isAdmin = me?.role === "admin" && me.status === "approved";
  const isSelf = req.user.id === targetUserId;
  if (!isAdmin && !isSelf) {
    return res.status(403).json({ ok: false, error: "无权操作" });
  }
  const target = getMembership(houseId, targetUserId);
  if (!target) return res.status(404).json({ ok: false, error: "成员不存在" });
  // 不允许移除最后一个 admin（避免房屋无人管理）
  if (target.role === "admin") {
    const adminCount = db
      .prepare("SELECT COUNT(*) AS c FROM house_members WHERE house_id = ? AND role = 'admin' AND status = 'approved'")
      .get(houseId).c;
    if (adminCount <= 1) {
      return res.status(400).json({ ok: false, error: "不能移除最后一个管理员" });
    }
  }
  db.prepare("DELETE FROM house_members WHERE house_id = ? AND user_id = ?").run(houseId, targetUserId);
  res.json({ ok: true });
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

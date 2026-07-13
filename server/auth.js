import crypto from "crypto";
import { randomBytes } from "crypto";

/* ============ 密码哈希（scrypt） ============ */
const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_LEN = 16;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

/** 哈希密码，返回 "saltHex:hashHex" 格式字符串 */
export function hashPassword(password) {
  const salt = randomBytes(SCRYPT_SALT_LEN);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

/** 校验密码 */
export function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string") return false;
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
    // 恒定时间比较，避免 timing attack
    return crypto.timingSafeEqual(hash, expected);
  } catch {
    return false;
  }
}

/* ============ Token ============ */
const TOKEN_BYTES = 32;
const TOKEN_TTL_DAYS = 7;

export function generateToken() {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

export function tokenExpiry() {
  const d = new Date();
  d.setDate(d.getDate() + TOKEN_TTL_DAYS);
  return d.toISOString();
}

/* ============ 分享码（6 位，去除易混淆字符） ============ */
const SHARE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 无 I/O/0/1
export function generateShareCode() {
  const bytes = randomBytes(6);
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += SHARE_CODE_ALPHABET[bytes[i] % SHARE_CODE_ALPHABET.length];
  }
  return s;
}

/* ============ 短 UUID（用于 house id） ============ */
export function generateHouseId() {
  // 8 位小写字母数字
  return randomBytes(4).toString("hex");
}

/* ============ 认证中间件 ============ */
export function createAuthMiddleware(db) {
  return function requireAuth(req, res, next) {
    const header = req.headers.authorization || "";
    const m = header.match(/^Bearer\s+(.+)$/i);
    if (!m) {
      return res.status(401).json({ ok: false, error: "未登录" });
    }
    const token = m[1];
    const row = db
      .prepare(
        `SELECT s.user_id, s.expires_at, u.username, u.display_name
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = ?`
      )
      .get(token);
    if (!row) {
      return res.status(401).json({ ok: false, error: "会话不存在" });
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
      return res.status(401).json({ ok: false, error: "会话已过期" });
    }
    req.user = {
      id: row.user_id,
      username: row.username,
      displayName: row.display_name,
    };
    req.token = token;
    next();
  };
}

/* ============ 用户名格式校验 ============ */
export function isValidUsername(username) {
  if (typeof username !== "string") return false;
  // 3-32 字符，字母数字下划线中文
  return /^[a-zA-Z0-9_\u4e00-\u9fa5]{3,32}$/.test(username);
}

export function isValidPassword(password) {
  if (typeof password !== "string") return false;
  return password.length >= 6 && password.length <= 128;
}

import fs from "fs";
import path from "path";
import crypto from "crypto";

/**
 * 提取数据中的 Base64 图片并保存为物理文件。
 * 把 base64 数据字符串替换为 /api/images/xxx.ext 形式的 URL。
 * @param {object} obj - 要遍历和修改的 JSON 对象
 * @param {string} imagesDir - 保存物理图片的目录
 * @returns {boolean} 是否发生了修改
 */
export function extractBase64Images(obj, imagesDir) {
  let changed = false;
  if (!obj || typeof obj !== "object") return changed;

  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    const value = obj[key];

    if (typeof value === "string" && value.startsWith("data:image/")) {
      const replaced = replaceBase64(value, imagesDir);
      if (replaced !== value) {
        obj[key] = replaced;
        changed = true;
      }
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (typeof item === "string" && item.startsWith("data:image/")) {
          const replaced = replaceBase64(item, imagesDir);
          if (replaced !== item) {
            value[i] = replaced;
            changed = true;
          }
        } else if (item && typeof item === "object") {
          if (extractBase64Images(item, imagesDir)) changed = true;
        }
      }
    } else if (value && typeof value === "object") {
      if (extractBase64Images(value, imagesDir)) changed = true;
    }
  }
  return changed;
}

const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

function replaceBase64(str, imagesDir) {
  const matches = str.match(/^data:image\/([a-zA-Z+0-9]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) return str;
  let ext = matches[1].toLowerCase();
  if (ext.includes("+")) ext = ext.split("+")[0];
  if (!ALLOWED_EXTENSIONS.has(ext)) return str;

  const dataBuffer = Buffer.from(matches[2], "base64");
  if (dataBuffer.length > 10 * 1024 * 1024) return str;

  const hash = crypto.createHash("md5").update(dataBuffer).digest("hex");
  const filename = `${hash}.${ext}`;
  const filePath = path.join(imagesDir, filename);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, dataBuffer);
  }
  return `/api/images/${filename}`;
}


/**
 * 把数据中引用的 /api/images/tmp/xxx 临时图片转正为 /api/images/xxx。
 * 转正方式：将 tmp 目录下的物理文件复制到正式目录（保留 tmp 副本，
 * 让前端已持有的 tmp URL 在 24h 清理窗口内依然可访问）。
 * 重复内容（md5 同名）跳过写入。
 * @param {object} obj - 要遍历和修改的 JSON 对象
 * @param {string} imagesDir - 正式图片目录
 * @param {string} tmpDir - 临时图片目录（imagesDir/tmp）
 * @returns {boolean} 是否发生了修改
 */
export function finalizeTempImages(obj, imagesDir, tmpDir) {
  let changed = false;
  if (!obj || typeof obj !== "object") return changed;

  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    const value = obj[key];

    if (typeof value === "string") {
      const replaced = finalizeOne(value, imagesDir, tmpDir);
      if (replaced !== value) {
        obj[key] = replaced;
        changed = true;
      }
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (typeof item === "string") {
          const replaced = finalizeOne(item, imagesDir, tmpDir);
          if (replaced !== item) {
            value[i] = replaced;
            changed = true;
          }
        } else if (item && typeof item === "object") {
          if (finalizeTempImages(item, imagesDir, tmpDir)) changed = true;
        }
      }
    } else if (value && typeof value === "object") {
      if (finalizeTempImages(value, imagesDir, tmpDir)) changed = true;
    }
  }
  return changed;
}

function finalizeOne(str, imagesDir, tmpDir) {
  // 仅匹配合法的文件名（哈希+后缀），防止目录穿越
  const m = str.match(/^\/api\/images\/tmp\/([a-zA-Z0-9_\-\.]+)$/);
  if (!m) return str;
  const filename = m[1];
  const srcPath = path.join(tmpDir, filename);
  const destPath = path.join(imagesDir, filename);
  if (!fs.existsSync(srcPath)) {
    // 源文件已不在此前会话的 tmp 中。
    return str;
  }
  if (!fs.existsSync(destPath)) {
    try {
      fs.copyFileSync(srcPath, destPath);
    } catch (err) {
      console.warn("[finalizeTempImages] 复制失败:", err);
      return str;
    }
  }
  return `/api/images/${filename}`;
}

/**
 * 清理临时图片目录中超过 maxAgeMs 的文件。
 * @param {string} tmpDir - 临时图片目录
 * @param {number} maxAgeMs - 最大存活时长（毫秒）
 * @returns {number} 删除的文件数
 */
export function cleanupTempImages(tmpDir, maxAgeMs) {
  if (!fs.existsSync(tmpDir)) return 0;
  const now = Date.now();
  let removed = 0;
  let entries = [];
  try {
    entries = fs.readdirSync(tmpDir);
  } catch {
    return 0;
  }
  for (const name of entries) {
    const filePath = path.join(tmpDir, name);
    try {
      const stat = fs.statSync(filePath);
      if (stat.isFile() && now - stat.mtimeMs > maxAgeMs) {
        fs.unlinkSync(filePath);
        removed++;
      }
    } catch {
      // 单文件失败不影响其它
    }
  }
  return removed;
}

/**
 * 收集 home state 中所有引用的图片文件名。
 * 仅匹配形如 "/api/images/xxx.ext" 的字符串。
 * @param {object} obj - home state
 * @returns {Set<string>} 图片文件名集合（不含路径前缀）
 */
export function collectImageRefs(obj) {
  const refs = new Set();
  const pattern = /^\/api\/images\/(.+)$/;

  function walk(v) {
    if (!v) return;
    if (typeof v === "string") {
      const m = v.match(pattern);
      if (m) refs.add(m[1]);
      return;
    }
    if (Array.isArray(v)) {
      for (const it of v) walk(it);
      return;
    }
    if (typeof v === "object") {
      for (const k in v) {
        if (Object.prototype.hasOwnProperty.call(v, k)) walk(v[k]);
      }
    }
  }

  walk(obj);
  return refs;
}

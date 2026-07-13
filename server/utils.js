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

function replaceBase64(str, imagesDir) {
  const matches = str.match(/^data:image\/([a-zA-Z+0-9]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) return str;
  let ext = matches[1];
  if (ext.includes("+")) ext = ext.split("+")[0];
  const dataBuffer = Buffer.from(matches[2], "base64");
  const hash = crypto.createHash("md5").update(dataBuffer).digest("hex");
  const filename = `${hash}.${ext}`;
  const filePath = path.join(imagesDir, filename);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, dataBuffer);
  }
  return `/api/images/${filename}`;
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

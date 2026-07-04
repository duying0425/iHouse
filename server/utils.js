import fs from "fs";
import path from "path";
import crypto from "crypto";

/**
 * 提取数据中的 Base64 图片并保存为物理文件
 * @param {object} obj - 要遍历和修改的 JSON 对象
 * @param {string} imagesDir - 保存物理图片的目录
 * @returns {boolean} 是否发生了修改
 */
export function extractBase64Images(obj, imagesDir) {
  let changed = false;
  if (!obj || typeof obj !== "object") return changed;

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      if (typeof value === "string" && value.startsWith("data:image/")) {
        const matches = value.match(/^data:image\/([a-zA-Z+0-9]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          let ext = matches[1];
          if (ext.includes("+")) {
            ext = ext.split("+")[0];
          }
          const dataBuffer = Buffer.from(matches[2], "base64");
          const hash = crypto.createHash("md5").update(dataBuffer).digest("hex");
          const filename = `${hash}.${ext}`;
          const filePath = path.join(imagesDir, filename);

          if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, dataBuffer);
          }
          obj[key] = `/api/images/${filename}`;
          changed = true;
        }
      } else if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const item = value[i];
          if (typeof item === "string" && item.startsWith("data:image/")) {
            const matches = item.match(/^data:image\/([a-zA-Z+0-9]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
              let ext = matches[1];
              if (ext.includes("+")) {
                ext = ext.split("+")[0];
              }
              const dataBuffer = Buffer.from(matches[2], "base64");
              const hash = crypto.createHash("md5").update(dataBuffer).digest("hex");
              const filename = `${hash}.${ext}`;
              const filePath = path.join(imagesDir, filename);

              if (!fs.existsSync(filePath)) {
                fs.writeFileSync(filePath, dataBuffer);
              }
              value[i] = `/api/images/${filename}`;
              changed = true;
            }
          } else if (item && typeof item === "object") {
            const childChanged = extractBase64Images(item, imagesDir);
            if (childChanged) changed = true;
          }
        }
      } else if (value && typeof value === "object") {
        const childChanged = extractBase64Images(value, imagesDir);
        if (childChanged) changed = true;
      }
    }
  }
  return changed;
}

/**
 * 压缩图片：通过 canvas 缩放 + 转 JPEG。
 * 用户上传的原图可能好几 MB（base64 后更大），
 * 压缩后通常只有几百 KB，大幅降低存储压力。
 *
 * @param input 原始文件，或 base64 data URL 字符串
 * @param maxDim 最长边像素上限（默认 1600）
 * @param quality JPEG 质量 0-1（默认 0.82）
 * @returns 压缩后的 data URL
 */
export function compressImage(
  input: File | Blob | string,
  maxDim = 1600,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve, reject) => {
    const onLoad = (dataUrl: string) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          // canvas 不可用，回退原图
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        try {
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch {
          resolve(dataUrl);
        }
      };
      img.onerror = () => reject(new Error("图片加载失败"));
      img.src = dataUrl;
    };

    if (typeof input === "string") {
      onLoad(input);
    } else {
      const reader = new FileReader();
      reader.onload = () => onLoad(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(input);
    }
  });
}

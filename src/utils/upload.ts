/**
 * 上传图片辅助函数。
 * 如果是 base64 数据（以 data:image/ 开头），则尝试上传到后端 /api/upload 接口：
 * - 成功：返回后端返回的图片 URL（如 /api/images/xxx.jpg）
 * - 失败（如离线状态）：回退并直接返回原 base64 数据，作为离线兜底暂存在客户端
 * 如果已经是 URL，则直接返回。
 */
export async function uploadImage(base64OrUrl: string): Promise<string> {
  if (!base64OrUrl) return "";
  if (!base64OrUrl.startsWith("data:image/")) {
    return base64OrUrl;
  }

  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ image: base64OrUrl }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.url) {
        return data.url;
      }
    }
  } catch (err) {
    console.warn("[uploadImage] 上传失败，将回退使用本地 Base64 数据:", err);
  }

  return base64OrUrl;
}

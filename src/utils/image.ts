// 远程图片生成辅助
// 统一通过远程图片生成接口为区域/物品提供配图

const BASE =
  "https://remote-pod.enterprise.trae.cn/api/ide/v1/text_to_image";

export type ImageSize =
  | "square_hd"
  | "square"
  | "portrait_4_3"
  | "portrait_16_9"
  | "landscape_4_3"
  | "landscape_16_9";

/** 生成远程图片 URL */
export function imageOf(prompt: string, size: ImageSize = "landscape_4_3"): string {
  return `${BASE}?prompt=${encodeURIComponent(prompt)}&image_size=${size}`;
}

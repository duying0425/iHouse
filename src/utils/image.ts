// 远程图片生成辅助
// 统一通过远程图片生成接口为区域/物品提供配图

// const BASE =
//   "https://remote-pod.enterprise.trae.cn/api/ide/v1/text_to_image";

export type ImageSize =
  | "square_hd"
  | "square"
  | "portrait_4_3"
  | "portrait_16_9"
  | "landscape_4_3"
  | "landscape_16_9";

const DEMO_IMAGE_MAP: Record<string, string> = {
  // Area Overviews
  "入户玄关全景": "/demo-images/entryway_overview.png",
  "整洁厨房全景": "/demo-images/kitchen_overview.png",
  "温馨餐厅全景": "/demo-images/dining_overview.png",
  "温馨主卧全景": "/demo-images/bedroom_overview.png",
  "整洁卫生间全景": "/demo-images/bathroom_overview.png",
  "简约次卧全景": "/demo-images/bedroom_overview.png",
  "明亮客厅全景": "/demo-images/living_overview.png",
  "南向阳台全景": "/demo-images/balcony_overview.png",
  "布局示意": "/demo-images/facility_layout.png",
  "平面标注": "/demo-images/facility_layout.png",

  // Items
  "鞋柜": "/demo-images/cabinet.png",
  "整体橱柜": "/demo-images/cabinet.png",
  "衣柜": "/demo-images/cabinet.png",
  "餐边柜": "/demo-images/cabinet.png",
  "储物柜": "/demo-images/cabinet.png",
  "门锁": "/demo-images/smart_lock.png",
  "穿衣镜": "/demo-images/mirror.png",
  "冰箱": "/demo-images/refrigerator.png",
  "燃气灶": "/demo-images/stove_hood.png",
  "抽油烟机": "/demo-images/stove_hood.png",
};

/** 生成远程图片 URL */
export function imageOf(prompt: string, _size: ImageSize = "landscape_4_3"): string {
  void _size;
  for (const [key, value] of Object.entries(DEMO_IMAGE_MAP)) {
    if (prompt.includes(key)) {
      return value;
    }
  }
  // 由于远程接口不可达，返回空字串使前端能够立即渲染精美的分类占位图
  return "";
}

/** 识别是否为演示环境下生成的不可达占位图 URL */
export function isMockImage(url?: string): boolean {
  if (!url) return true;
  return url.includes("remote-pod.enterprise.trae.cn") || url.includes("text_to_image");
}


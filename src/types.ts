// 居所图鉴 - 数据类型定义

/** 锚点坐标（相对户型图的百分比 0-100） */
export interface AnchorPosition {
  x: number;
  y: number;
}

/** 物品/设施分类 */
export type Category =
  | "家电"
  | "家具"
  | "储物"
  | "装饰"
  | "管线设施"
  | "其他";

export const CATEGORIES: Category[] = [
  "家电",
  "家具",
  "储物",
  "装饰",
  "管线设施",
  "其他",
];

/** 分类对应的展示色（用于卡片左上角色标） */
export const CATEGORY_COLOR: Record<Category, string> = {
  家电: "#A86B3C",
  家具: "#3D5A4A",
  储物: "#8C5630",
  装饰: "#D97A3C",
  管线设施: "#5C7A6A",
  其他: "#6B6258",
};

/** 储物单元内部存放的物品条目（如抽屉里的电池、冰箱里的饮料） */
export interface StorageEntry {
  id: string;
  name: string;
  /** 数量（自由文本，如 "4节"、"2个"） */
  quantity?: string;
  /** 备注（如 "放于冷藏室门板"） */
  remark?: string;
}

/** 物品/设施 */
export interface Item {
  id: string;
  areaId: string;
  name: string;
  category: Category;
  brand?: string;
  spec?: string;
  purchaseDate?: string; // YYYY-MM-DD
  price?: number;
  remark?: string;
  image: string;
  gallery?: string[];
  /** 物品在所属区域某张图上的位置（关联到 AreaImage） */
  areaImageId?: string;
  areaImagePos?: AnchorPosition;
  /** 当物品为储物单元（抽屉/冰箱/柜子等）时，内部存放的物品清单 */
  contents?: StorageEntry[];
}

/** 区域内的一张图（总图 / 设施图 / 某面墙等，每个区域可有一张或多张） */
export interface AreaImage {
  id: string;
  url: string;
  label?: string; // 如：总图、设施图、东墙
}

/** 区域 */
export interface Area {
  id: string;
  name: string;
  /** 在整屋户型图上的锚点位置 */
  floorPlanPos: AnchorPosition;
  /** 户型图上该区域的矩形边界（百分比）用于高亮 */
  bounds?: { x: number; y: number; w: number; h: number };
  /** 区域图片（1 张或多张），物品位置标在这些图上 */
  images: AreaImage[];
  description?: string;
  items: Item[];
}

/** 整屋 */
export interface Home {
  title: string;
  subtitle?: string;
  floorPlanImage: string;
  areas: Area[];
}

/** 检索条件 */
export interface SearchQuery {
  keyword?: string;
  areaIds?: string[];
  categories?: Category[];
  brands?: string[];
  sortBy?: "name" | "purchaseDate" | "price";
  sortOrder?: "asc" | "desc";
}

/** 检索结果项（物品 + 所属区域信息） */
export interface SearchResult {
  item: Item;
  area: Area;
}

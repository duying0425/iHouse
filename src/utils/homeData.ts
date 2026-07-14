import { CATEGORIES, type Area, type Category, type Home, type Item } from "@/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function fallbackAreaPosition(index: number, total: number) {
  if (total === 1) return { x: 50, y: 50 };
  return {
    x: 20 + (index % 3) * 30,
    y: 25 + Math.min(Math.floor(index / 3), 2) * 30,
  };
}

function normalizeItem(value: unknown, areaId: string, index: number): Item {
  const item = isRecord(value) ? value : {};
  const category = CATEGORIES.includes(item.category as Category)
    ? item.category as Category
    : "其他";
  const gallery = Array.isArray(item.gallery)
    ? item.gallery.filter((image): image is string => typeof image === "string")
    : undefined;
  return {
    ...item,
    id: typeof item.id === "string" && item.id ? item.id : `${areaId}-item-${index + 1}`,
    areaId,
    name: typeof item.name === "string" && item.name ? item.name : "未命名物品",
    category,
    image: typeof item.image === "string" ? item.image : "",
    gallery,
  } as Item;
}

function normalizeArea(value: unknown, index: number, total: number): Area {
  const area = isRecord(value) ? value : {};
  const id = typeof area.id === "string" && area.id ? area.id : `area-${index + 1}`;
  const fallbackPos = fallbackAreaPosition(index, total);
  const position = isRecord(area.floorPlanPos) ? area.floorPlanPos : {};
  const images = Array.isArray(area.images)
    ? area.images
        .filter(isRecord)
        .map((image, imageIndex) => ({
          id: typeof image.id === "string" && image.id ? image.id : `${id}-image-${imageIndex + 1}`,
          url: typeof image.url === "string" ? image.url : "",
          label: typeof image.label === "string" ? image.label : undefined,
        }))
        .filter((image) => image.url)
    : [];
  const items = Array.isArray(area.items)
    ? area.items.map((item, itemIndex) => normalizeItem(item, id, itemIndex))
    : [];
  return {
    ...area,
    id,
    name: typeof area.name === "string" && area.name ? area.name : `区域 ${index + 1}`,
    floorPlanPos: {
      x: finiteNumber(position.x, fallbackPos.x),
      y: finiteNumber(position.y, fallbackPos.y),
    },
    images,
    items,
  } as Area;
}

/** 将旧版、导入或测试产生的残缺房屋数据补齐为前端可安全渲染的结构。 */
export function normalizeHomeData(value: unknown): Home | null {
  if (!isRecord(value)) return null;
  const rawAreas = Array.isArray(value.areas) ? value.areas : [];
  return {
    ...value,
    title: typeof value.title === "string" && value.title ? value.title : "我的居所",
    subtitle: typeof value.subtitle === "string" ? value.subtitle : undefined,
    floorPlanImage: typeof value.floorPlanImage === "string" ? value.floorPlanImage : "",
    areas: rawAreas.map((area, index) => normalizeArea(area, index, rawAreas.length)),
  } as Home;
}

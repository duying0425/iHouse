import { CATEGORIES, type Area, type Category, type Home, type Item } from "@/types";

export const CURRENT_HOME_SCHEMA_VERSION = 3;

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
    containerItemId:
      typeof item.containerItemId === "string" && item.containerItemId
        ? item.containerItemId
        : undefined,
    containerSlot:
      typeof item.containerSlot === "string" && item.containerSlot.trim()
        ? item.containerSlot.trim()
        : undefined,
  } as Item;
}

function normalizeArea(value: unknown, index: number, total: number): Area {
  const area = isRecord(value) ? value : {};
  const id = typeof area.id === "string" && area.id ? area.id : `area-${index + 1}`;
  const fallbackPos = fallbackAreaPosition(index, total);
  const position = isRecord(area.floorPlanPos) ? area.floorPlanPos : {};
  const bounds = isRecord(area.bounds)
    ? {
        x: finiteNumber(area.bounds.x, 0),
        y: finiteNumber(area.bounds.y, 0),
        w: finiteNumber(area.bounds.w, 0),
        h: finiteNumber(area.bounds.h, 0),
      }
    : undefined;

  let floorPlanPos = {
    x: finiteNumber(position.x, fallbackPos.x),
    y: finiteNumber(position.y, fallbackPos.y),
  };
  if (bounds) {
    floorPlanPos = {
      x: bounds.x + bounds.w / 2,
      y: bounds.y + bounds.h / 2,
    };
  }

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
    floorPlanPos,
    bounds: bounds ?? undefined,
    images,
    items,
  } as Area;
}

/**
 * 修复导入数据或旧缓存中的悬空/循环容器关系，并保证一整棵收纳树属于同一区域。
 * contained item 的区域图坐标会被清除，其位置由容器继承。
 */
function normalizeContainerRelations(areas: Area[]): Area[] {
  const items = areas.flatMap((area) => area.items);
  const index = new Map(items.map((item) => [item.id, item]));
  const originalArea = new Map<string, string>();
  for (const area of areas) {
    for (const item of area.items) originalArea.set(item.id, area.id);
  }

  // 先清理悬空、自引用与循环。清除当前节点即可打断整条环。
  for (const item of items) {
    if (!item.containerItemId) continue;
    const seen = new Set<string>([item.id]);
    let parentId: string | undefined = item.containerItemId;
    while (parentId) {
      if (seen.has(parentId)) {
        item.containerItemId = undefined;
        item.containerSlot = undefined;
        break;
      }
      seen.add(parentId);
      const parent = index.get(parentId);
      if (!parent) {
        item.containerItemId = undefined;
        item.containerSlot = undefined;
        break;
      }
      parentId = parent.containerItemId;
    }
  }

  const areaMemo = new Map<string, string>();
  const resolveArea = (item: Item): string => {
    const cached = areaMemo.get(item.id);
    if (cached) return cached;
    const parent = item.containerItemId ? index.get(item.containerItemId) : undefined;
    const areaId = parent
      ? resolveArea(parent)
      : originalArea.get(item.id) ?? areas[0]?.id ?? "";
    areaMemo.set(item.id, areaId);
    return areaId;
  };

  const byArea = new Map<string, Item[]>();
  for (const item of items) {
    const areaId = resolveArea(item);
    const normalized: Item = item.containerItemId
      ? { ...item, areaId, areaImageId: undefined, areaImagePos: undefined }
      : { ...item, areaId };
    const list = byArea.get(areaId) ?? [];
    list.push(normalized);
    byArea.set(areaId, list);
  }
  return areas.map((area) => ({ ...area, items: byArea.get(area.id) ?? [] }));
}

/** 将旧版、导入或测试产生的残缺房屋数据补齐为前端可安全渲染的结构。 */
export function normalizeHomeData(value: unknown): Home | null {
  if (!isRecord(value)) return null;
  const rawAreas = Array.isArray(value.areas) ? value.areas : [];
  const areas = rawAreas.map((area, index) => normalizeArea(area, index, rawAreas.length));
  return {
    ...value,
    schemaVersion: CURRENT_HOME_SCHEMA_VERSION,
    title: typeof value.title === "string" && value.title ? value.title : "我的居所",
    subtitle: typeof value.subtitle === "string" ? value.subtitle : undefined,
    floorPlanImage: typeof value.floorPlanImage === "string" ? value.floorPlanImage : "",
    areas: normalizeContainerRelations(areas),
  } as Home;
}

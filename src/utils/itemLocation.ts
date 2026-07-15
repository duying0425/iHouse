import type { Area, Item, ItemDestination } from "@/types";

export interface ItemWithArea {
  item: Item;
  area: Area;
}

export type ItemLocationSegment =
  | { kind: "area"; id: string; name: string }
  | { kind: "item"; id: string; areaId: string; name: string };

function itemIndex(areas: Area[]) {
  const index = new Map<string, ItemWithArea>();
  for (const area of areas) {
    for (const item of area.items) index.set(item.id, { item, area });
  }
  return index;
}

export function findItemInAreas(areas: Area[], itemId: string): ItemWithArea | undefined {
  return itemIndex(areas).get(itemId);
}

export function getDirectContainedItems(areas: Area[], containerItemId: string): Item[] {
  return areas
    .flatMap((area) => area.items)
    .filter((item) => item.containerItemId === containerItemId)
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

export function getDescendantIds(areas: Area[], containerItemId: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const item of areas.flatMap((area) => area.items)) {
    if (!item.containerItemId) continue;
    const list = children.get(item.containerItemId) ?? [];
    list.push(item.id);
    children.set(item.containerItemId, list);
  }
  const result = new Set<string>();
  const queue = [...(children.get(containerItemId) ?? [])];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (result.has(id)) continue;
    result.add(id);
    queue.push(...(children.get(id) ?? []));
  }
  return result;
}

/** 从所在区域开始，生成可用于展示和导航的位置链。 */
export function getItemLocationTrail(areas: Area[], itemId: string): ItemLocationSegment[] {
  const index = itemIndex(areas);
  const found = index.get(itemId);
  if (!found) return [];
  const containers: ItemLocationSegment[] = [];
  const seen = new Set<string>([itemId]);
  let current = found.item;
  while (current.containerItemId) {
    if (seen.has(current.containerItemId)) break;
    seen.add(current.containerItemId);
    const parent = index.get(current.containerItemId);
    if (!parent) break;
    containers.unshift({
      kind: "item",
      id: parent.item.id,
      areaId: parent.area.id,
      name: parent.item.name,
    });
    current = parent.item;
  }
  return [
    { kind: "area", id: found.area.id, name: found.area.name },
    ...containers,
  ];
}

/** 从所在区域开始，生成“主卧 → 衣柜 → 收纳箱”的可读位置链。 */
export function getItemLocationPath(areas: Area[], itemId: string): string[] {
  return getItemLocationTrail(areas, itemId).map((segment) => segment.name);
}

/**
 * 原子移动一件物品及其完整收纳子树。
 * 跨区域时子树会一起迁移，且清除属于旧区域图片的坐标。
 */
export function moveItemInAreas(
  areas: Area[],
  itemId: string,
  destination: ItemDestination
): { areas: Area[]; item: Item } {
  const index = itemIndex(areas);
  const source = index.get(itemId);
  if (!source) throw new Error("未找到要移动的物品");

  const descendants = getDescendantIds(areas, itemId);
  const movingIds = new Set([itemId, ...descendants]);
  let targetAreaId: string;

  if (destination.kind === "container") {
    const container = index.get(destination.containerItemId);
    if (!container) throw new Error("目标储物空间不存在");
    if (movingIds.has(container.item.id)) {
      throw new Error("不能把物品收纳到自身或其下级物品中");
    }
    targetAreaId = container.area.id;
  } else {
    if (!areas.some((area) => area.id === destination.areaId)) {
      throw new Error("目标区域不存在");
    }
    targetAreaId = destination.areaId;
  }

  const moving = areas
    .flatMap((area) => area.items)
    .filter((item) => movingIds.has(item.id))
    .map((item) => {
      const isRoot = item.id === itemId;
      const base: Item = {
        ...item,
        areaId: targetAreaId,
        // 移动子树后，旧图坐标都不再可靠。
        areaImageId: undefined,
        areaImagePos: undefined,
      };
      if (!isRoot) return base;
      if (destination.kind === "container") {
        return {
          ...base,
          containerItemId: destination.containerItemId,
          containerSlot: destination.containerSlot?.trim() || undefined,
        };
      }
      return {
        ...base,
        containerItemId: undefined,
        containerSlot: undefined,
        areaImageId: destination.areaImageId,
        areaImagePos: destination.areaImagePos,
      };
    });

  const nextAreas = areas.map((area) => {
    const remaining = area.items.filter((item) => !movingIds.has(item.id));
    return area.id === targetAreaId
      ? { ...area, items: [...remaining, ...moving] }
      : { ...area, items: remaining };
  });
  const movedItem = moving.find((item) => item.id === itemId)!;
  return { areas: nextAreas, item: movedItem };
}

/** 删除容器时保留正式子物品，并将直接子物品提升到被删容器的上一级。 */
export function removeItemFromAreas(
  areas: Area[],
  itemId: string
): { areas: Area[]; releasedCount: number } {
  const index = itemIndex(areas);
  const target = index.get(itemId);
  if (!target) return { areas, releasedCount: 0 };
  let releasedCount = 0;
  const parentId = target.item.containerItemId;
  return {
    areas: areas.map((area) => ({
      ...area,
      items: area.items
        .filter((item) => item.id !== itemId)
        .map((item) => {
          if (item.containerItemId !== itemId) return item;
          releasedCount += 1;
          return {
            ...item,
            containerItemId: parentId,
            containerSlot: undefined,
          };
        }),
    })),
    releasedCount,
  };
}

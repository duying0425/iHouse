import type { Home, Item, SearchResult } from "@/types";

export type ExportLayout = "booklet" | "archive";
export type ExportRange = "all" | "area" | "search";

export interface ExportSelection {
  range: ExportRange;
  selectedAreaIds: string[];
  searchResults?: SearchResult[] | null;
}

export interface ItemRef {
  areaId: string;
  itemId: string;
  itemNumber: number;
}

export type ArchivePageDesc =
  | { kind: "cover" }
  | { kind: "floorplan" }
  | {
      kind: "area";
      areaId: string;
      areaNumber: number;
      itemStart: number;
      itemEnd: number;
    }
  | {
      kind: "area-gallery";
      areaId: string;
      areaNumber: number;
      imageStart: number;
      imageEnd: number;
    }
  | {
      kind: "area-cont";
      areaId: string;
      areaNumber: number;
      itemStart: number;
      itemEnd: number;
    }
  | ({ kind: "item" } & ItemRef)
  | ({
      kind: "item-notes";
      usageChunk?: string;
      contentStart: number;
      contentEnd: number;
      continuation: number;
    } & ItemRef)
  | ({
      kind: "item-gallery";
      galleryStart: number;
      galleryEnd: number;
      continuation: number;
    } & ItemRef);

export type CompactPageDesc =
  | { kind: "compact-cover" }
  | { kind: "compact-floorplan" }
  | { kind: "compact-area"; areaId: string; areaNumber: number }
  | {
      kind: "compact-area-gallery";
      areaId: string;
      areaNumber: number;
      imageStart: number;
      imageEnd: number;
    }
  | {
      kind: "compact-items";
      eyebrow: string;
      title: string;
      items: ItemRef[];
    }
  | ({
      kind: "compact-item-notes";
      usageChunk?: string;
      contentStart: number;
      contentEnd: number;
      continuation: number;
    } & ItemRef)
  | ({
      kind: "compact-item-gallery";
      galleryStart: number;
      galleryEnd: number;
      continuation: number;
    } & ItemRef)
  | { kind: "compact-blank" };

export type ExportPageDesc = ArchivePageDesc | CompactPageDesc;

export interface BookletSide {
  side: "front" | "back";
  sheet: number;
  left: CompactPageDesc;
  right: CompactPageDesc;
  leftPageNumber?: number;
  rightPageNumber?: number;
}

function selectedAreas(home: Home, selection: ExportSelection) {
  if (selection.range === "all") return home.areas;
  if (selection.range === "area") {
    const ids = new Set(selection.selectedAreaIds);
    return home.areas.filter((area) => ids.has(area.id));
  }
  return [];
}

function hasSelection(home: Home, selection: ExportSelection) {
  if (selection.range === "search") {
    return (selection.searchResults?.length ?? 0) > 0;
  }
  if (selection.range === "area") return selectedAreas(home, selection).length > 0;
  return true;
}

export function splitText(text: string | undefined, maxChars: number): string[] {
  const source = text?.trim();
  if (!source) return [];
  const chunks: string[] = [];
  let rest = source;
  while (rest.length > maxChars) {
    const minBreak = Math.floor(maxChars * 0.58);
    const window = rest.slice(0, maxChars + 1);
    let cut = -1;
    for (const separator of ["\n", "。", "；", ";", "，", ",", " "]) {
      cut = Math.max(cut, window.lastIndexOf(separator));
    }
    if (cut < minBreak) cut = maxChars;
    else cut += 1;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function appendArchiveItemPages(
  pages: ArchivePageDesc[],
  ref: ItemRef,
  item: Item
) {
  pages.push({ kind: "item", ...ref });

  const usageChunks = splitText(item.usage, 1100);
  const contents = item.contents ?? [];
  const noteCount = Math.max(usageChunks.length, Math.ceil(contents.length / 22));
  for (let index = 0; index < noteCount; index += 1) {
    pages.push({
      kind: "item-notes",
      ...ref,
      usageChunk: usageChunks[index],
      contentStart: index * 22,
      contentEnd: Math.min(contents.length, (index + 1) * 22),
      continuation: index + 1,
    });
  }

  const gallery = item.gallery ?? [];
  for (let start = 0, continuation = 1; start < gallery.length; start += 6, continuation += 1) {
    pages.push({
      kind: "item-gallery",
      ...ref,
      galleryStart: start,
      galleryEnd: Math.min(gallery.length, start + 6),
      continuation,
    });
  }
}

export function buildArchivePages(
  home: Home,
  selection: ExportSelection
): ArchivePageDesc[] {
  if (!hasSelection(home, selection)) return [];
  const pages: ArchivePageDesc[] = [{ kind: "cover" }];

  if (selection.range === "search") {
    (selection.searchResults ?? []).forEach((result, index) => {
      appendArchiveItemPages(
        pages,
        { areaId: result.area.id, itemId: result.item.id, itemNumber: index + 1 },
        result.item
      );
    });
    return pages;
  }

  pages.push({ kind: "floorplan" });
  for (const area of selectedAreas(home, selection)) {
    const areaNumber = home.areas.findIndex((candidate) => candidate.id === area.id) + 1;
    const firstCapacity = area.images.length === 0 ? 18 : 10;
    pages.push({
      kind: "area",
      areaId: area.id,
      areaNumber,
      itemStart: 0,
      itemEnd: Math.min(area.items.length, firstCapacity),
    });

    for (let start = 2; start < area.images.length; start += 4) {
      pages.push({
        kind: "area-gallery",
        areaId: area.id,
        areaNumber,
        imageStart: start,
        imageEnd: Math.min(area.images.length, start + 4),
      });
    }

    for (let start = firstCapacity; start < area.items.length; start += 22) {
      pages.push({
        kind: "area-cont",
        areaId: area.id,
        areaNumber,
        itemStart: start,
        itemEnd: Math.min(area.items.length, start + 22),
      });
    }

    area.items.forEach((item, index) => {
      appendArchiveItemPages(
        pages,
        { areaId: area.id, itemId: item.id, itemNumber: index + 1 },
        item
      );
    });
  }
  return pages;
}

function compactItemCost(item: Item) {
  return item.image ? 2 : 1;
}

const COMPACT_PAGE_CAPACITY = 8;

function packCompactItems(refs: ItemRef[], home: Home): ItemRef[][] {
  const groups: ItemRef[][] = [];
  let group: ItemRef[] = [];
  let cost = 0;
  for (const ref of refs) {
    const item = home.areas
      .find((area) => area.id === ref.areaId)
      ?.items.find((candidate) => candidate.id === ref.itemId);
    if (!item) continue;
    const nextCost = compactItemCost(item);
    if (group.length > 0 && cost + nextCost > COMPACT_PAGE_CAPACITY) {
      groups.push(group);
      group = [];
      cost = 0;
    }
    group.push(ref);
    cost += nextCost;
  }
  if (group.length > 0) groups.push(group);
  return groups;
}

function appendCompactItemDetails(
  pages: CompactPageDesc[],
  ref: ItemRef,
  item: Item
) {
  const usageChunks = splitText(item.usage, 460);
  const contents = item.contents ?? [];
  const noteCount = Math.max(usageChunks.length, Math.ceil(contents.length / 8));
  for (let index = 0; index < noteCount; index += 1) {
    pages.push({
      kind: "compact-item-notes",
      ...ref,
      usageChunk: usageChunks[index],
      contentStart: index * 8,
      contentEnd: Math.min(contents.length, (index + 1) * 8),
      continuation: index + 1,
    });
  }
  const gallery = item.gallery ?? [];
  for (let start = 0, continuation = 1; start < gallery.length; start += 4, continuation += 1) {
    pages.push({
      kind: "compact-item-gallery",
      ...ref,
      galleryStart: start,
      galleryEnd: Math.min(gallery.length, start + 4),
      continuation,
    });
  }
}

export function buildCompactPages(
  home: Home,
  selection: ExportSelection
): CompactPageDesc[] {
  if (!hasSelection(home, selection)) return [];
  const pages: CompactPageDesc[] = [{ kind: "compact-cover" }];

  if (selection.range === "search") {
    const results = selection.searchResults ?? [];
    const refs = results.map((result, index) => ({
      areaId: result.area.id,
      itemId: result.item.id,
      itemNumber: index + 1,
    }));
    for (const items of packCompactItems(refs, home)) {
      pages.push({
        kind: "compact-items",
        eyebrow: "Search Results",
        title: "检索结果",
        items,
      });
    }
    results.forEach((result, index) => {
      appendCompactItemDetails(pages, refs[index], result.item);
    });
    return pages;
  }

  pages.push({ kind: "compact-floorplan" });
  for (const area of selectedAreas(home, selection)) {
    const areaNumber = home.areas.findIndex((candidate) => candidate.id === area.id) + 1;
    pages.push({ kind: "compact-area", areaId: area.id, areaNumber });

    for (let start = 2; start < area.images.length; start += 4) {
      pages.push({
        kind: "compact-area-gallery",
        areaId: area.id,
        areaNumber,
        imageStart: start,
        imageEnd: Math.min(area.images.length, start + 4),
      });
    }

    const refs = area.items.map((item, index) => ({
      areaId: area.id,
      itemId: item.id,
      itemNumber: index + 1,
    }));
    for (const items of packCompactItems(refs, home)) {
      pages.push({
        kind: "compact-items",
        eyebrow: `Area ${String(areaNumber).padStart(2, "0")}`,
        title: `${area.name}物品`,
        items,
      });
    }
    area.items.forEach((item, index) => {
      appendCompactItemDetails(pages, refs[index], item);
    });
  }
  return pages;
}

export function imposeBooklet(logicalPages: CompactPageDesc[]): BookletSide[] {
  const padded = [...logicalPages];
  while (padded.length % 4 !== 0) padded.push({ kind: "compact-blank" });
  const sides: BookletSide[] = [];
  const total = padded.length;
  for (let sheet = 0; sheet < total / 4; sheet += 1) {
    const frontLeft = total - 1 - sheet * 2;
    const frontRight = sheet * 2;
    const backLeft = sheet * 2 + 1;
    const backRight = total - 2 - sheet * 2;
    sides.push({
      side: "front",
      sheet: sheet + 1,
      left: padded[frontLeft],
      right: padded[frontRight],
      leftPageNumber: frontLeft < logicalPages.length ? frontLeft + 1 : undefined,
      rightPageNumber: frontRight < logicalPages.length ? frontRight + 1 : undefined,
    });
    sides.push({
      side: "back",
      sheet: sheet + 1,
      left: padded[backLeft],
      right: padded[backRight],
      leftPageNumber: backLeft < logicalPages.length ? backLeft + 1 : undefined,
      rightPageNumber: backRight < logicalPages.length ? backRight + 1 : undefined,
    });
  }
  return sides;
}

export function labelOf(page: ExportPageDesc): string {
  switch (page.kind) {
    case "cover":
    case "compact-cover":
      return "封面";
    case "floorplan":
    case "compact-floorplan":
      return "户型图";
    case "area":
    case "area-cont":
    case "area-gallery":
    case "compact-area":
    case "compact-area-gallery":
      return "区域";
    case "compact-items":
      return "物品清单";
    case "item":
    case "item-notes":
    case "item-gallery":
    case "compact-item-notes":
    case "compact-item-gallery":
      return "物品";
    case "compact-blank":
      return "空白补页";
  }
}

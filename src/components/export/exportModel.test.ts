import { describe, expect, it } from "vitest";
import type { Area, Home, Item } from "@/types";
import {
  buildArchivePages,
  buildCompactPages,
  imposeBooklet,
  type CompactPageDesc,
} from "./exportModel";

function item(id: string, areaId: string, image = ""): Item {
  return { id, areaId, name: id, category: "其他", image };
}

function area(id: string, itemCount = 1): Area {
  return {
    id,
    name: id,
    floorPlanPos: { x: 50, y: 50 },
    images: [],
    items: Array.from({ length: itemCount }, (_, index) => item(`${id}-${index + 1}`, id)),
  };
}

function homeWith(areas: Area[]): Home {
  return { title: "测试居所", floorPlanImage: "", areas };
}

describe("export page model", () => {
  it("按区域选择时始终按 areaId 取数据，不会错用过滤后的索引", () => {
    const home = homeWith([area("living"), area("bedroom")]);
    const pages = buildArchivePages(home, {
      range: "area",
      selectedAreaIds: ["bedroom"],
    });
    const areaPages = pages.filter((page) => page.kind === "area");
    const itemPages = pages.filter((page) => page.kind === "item");
    expect(areaPages).toEqual([expect.objectContaining({ areaId: "bedroom", areaNumber: 2 })]);
    expect(itemPages).toEqual([expect.objectContaining({ areaId: "bedroom", itemId: "bedroom-1" })]);
  });

  it("详细档案会为所有区域图、相册、长说明和长清单创建续页", () => {
    const room = area("room");
    room.images = Array.from({ length: 7 }, (_, index) => ({ id: `photo-${index}`, url: `/${index}.jpg` }));
    room.items[0] = {
      ...room.items[0],
      usage: "说明。".repeat(900),
      contents: Array.from({ length: 45 }, (_, index) => ({ id: String(index), name: `物品 ${index}` })),
      gallery: Array.from({ length: 13 }, (_, index) => `/gallery-${index}.jpg`),
    };
    const pages = buildArchivePages(homeWith([room]), { range: "all", selectedAreaIds: [] });
    expect(pages.filter((page) => page.kind === "area-gallery")).toHaveLength(2);
    expect(pages.filter((page) => page.kind === "item-gallery")).toHaveLength(3);
    expect(pages.filter((page) => page.kind === "item-notes").length).toBeGreaterThanOrEqual(3);
    const galleryPages = pages.filter((page) => page.kind === "item-gallery");
    expect(galleryPages.at(-1)).toEqual(expect.objectContaining({ galleryStart: 12, galleryEnd: 13 }));
  });

  it("小册子把无图物品按半宽卡片打包，有图物品按整行卡片计算", () => {
    const room = area("room", 0);
    room.items = [
      item("a", "room"),
      item("b", "room"),
      item("c", "room"),
      item("d", "room"),
      item("photo", "room", "/photo.jpg"),
      item("e", "room"),
      item("f", "room"),
      item("g", "room"),
    ];
    const pages = buildCompactPages(homeWith([room]), { range: "all", selectedAreaIds: [] });
    const itemPages = pages.filter((page) => page.kind === "compact-items");
    expect(itemPages.map((page) => page.items.map((ref) => ref.itemId))).toEqual([
      ["a", "b", "c", "d", "photo", "e", "f"],
      ["g"],
    ]);
  });

  it("按四的倍数补页并生成正确的正反面小册子拼版顺序", () => {
    const logical = Array.from({ length: 7 }, (_, index) => ({
      kind: "compact-area" as const,
      areaId: `p${index + 1}`,
      areaNumber: index + 1,
    }));
    const sides = imposeBooklet(logical);
    const id = (page: CompactPageDesc) => page.kind === "compact-area" ? page.areaId : "blank";
    expect(sides.map((side) => [id(side.left), id(side.right)])).toEqual([
      ["blank", "p1"],
      ["p2", "p7"],
      ["p6", "p3"],
      ["p4", "p5"],
    ]);
  });
});

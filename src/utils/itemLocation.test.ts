import { describe, expect, it } from "vitest";
import type { Area, Item } from "@/types";
import {
  getItemLocationPath,
  getItemLocationTrail,
  moveItemInAreas,
  removeItemFromAreas,
} from "./itemLocation";

const item = (id: string, areaId: string, patch: Partial<Item> = {}): Item => ({
  id,
  areaId,
  name: id,
  category: "其他",
  image: "",
  ...patch,
});

function fixture(): Area[] {
  return [
    {
      id: "bedroom",
      name: "主卧",
      floorPlanPos: { x: 10, y: 10 },
      images: [{ id: "bedroom-image", url: "bedroom.jpg" }],
      items: [
        item("wardrobe", "bedroom", { name: "衣柜" }),
        item("steamer", "bedroom", {
          name: "挂烫机",
          areaImageId: "bedroom-image",
          areaImagePos: { x: 20, y: 30 },
        }),
        item("box", "bedroom", { name: "收纳箱", containerItemId: "wardrobe" }),
        item("iron", "bedroom", { name: "熨斗", containerItemId: "box" }),
      ],
    },
    {
      id: "living",
      name: "客厅",
      floorPlanPos: { x: 80, y: 80 },
      images: [{ id: "living-image", url: "living.jpg" }],
      items: [item("cabinet", "living", { name: "客厅柜" })],
    },
  ];
}

describe("itemLocation", () => {
  it("把已有物品收纳进正式物品并清除直接区域坐标", () => {
    const result = moveItemInAreas(fixture(), "steamer", {
      kind: "container",
      containerItemId: "wardrobe",
      containerSlot: "右侧下层",
    });
    expect(result.item).toMatchObject({
      areaId: "bedroom",
      containerItemId: "wardrobe",
      containerSlot: "右侧下层",
    });
    expect(result.item.areaImageId).toBeUndefined();
    expect(result.item.areaImagePos).toBeUndefined();
    expect(getItemLocationPath(result.areas, "steamer")).toEqual(["主卧", "衣柜"]);
  });

  it("跨区域移动容器时连同完整收纳子树一起移动", () => {
    const result = moveItemInAreas(fixture(), "wardrobe", {
      kind: "container",
      containerItemId: "cabinet",
    });
    const livingIds = result.areas.find((area) => area.id === "living")!.items.map((entry) => entry.id);
    expect(livingIds).toEqual(expect.arrayContaining(["wardrobe", "box", "iron"]));
    expect(result.areas.find((area) => area.id === "bedroom")!.items.map((entry) => entry.id))
      .not.toEqual(expect.arrayContaining(["wardrobe", "box", "iron"]));
    expect(getItemLocationPath(result.areas, "iron")).toEqual([
      "客厅",
      "客厅柜",
      "衣柜",
      "收纳箱",
    ]);
    expect(getItemLocationTrail(result.areas, "iron")).toEqual([
      { kind: "area", id: "living", name: "客厅" },
      { kind: "item", id: "cabinet", areaId: "living", name: "客厅柜" },
      { kind: "item", id: "wardrobe", areaId: "living", name: "衣柜" },
      { kind: "item", id: "box", areaId: "living", name: "收纳箱" },
    ]);
  });

  it("拒绝把容器放进自己的下级物品", () => {
    expect(() => moveItemInAreas(fixture(), "wardrobe", {
      kind: "container",
      containerItemId: "iron",
    })).toThrow("不能把物品收纳到自身或其下级物品中");
  });

  it("移出储物空间后可成为其他区域的独立物品", () => {
    const contained = moveItemInAreas(fixture(), "steamer", {
      kind: "container",
      containerItemId: "wardrobe",
    });
    const result = moveItemInAreas(contained.areas, "steamer", {
      kind: "area",
      areaId: "living",
    });
    expect(result.item.areaId).toBe("living");
    expect(result.item.containerItemId).toBeUndefined();
    expect(result.areas.find((area) => area.id === "living")!.items.some((entry) => entry.id === "steamer"))
      .toBe(true);
  });

  it("删除容器时保留子物品并提升到上一级", () => {
    const result = removeItemFromAreas(fixture(), "box");
    const iron = result.areas.flatMap((area) => area.items).find((entry) => entry.id === "iron")!;
    expect(result.releasedCount).toBe(1);
    expect(iron.containerItemId).toBe("wardrobe");
    expect(result.areas.flatMap((area) => area.items).some((entry) => entry.id === "box")).toBe(false);
  });
});

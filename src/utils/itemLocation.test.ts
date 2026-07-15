import { describe, expect, it } from "vitest";
import type { Area, Item } from "@/types";
import {
  findItemInAreas,
  getDirectContainedItems,
  getDescendantIds,
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

  it("移动到区域时携带新的区域图坐标", () => {
    const result = moveItemInAreas(fixture(), "iron", {
      kind: "area",
      areaId: "living",
      areaImageId: "living-image",
      areaImagePos: { x: 55, y: 65 },
    });
    expect(result.item.areaId).toBe("living");
    expect(result.item.containerItemId).toBeUndefined();
    expect(result.item.areaImageId).toBe("living-image");
    expect(result.item.areaImagePos).toEqual({ x: 55, y: 65 });
  });

  it("移动不存在的物品时抛出错误", () => {
    expect(() => moveItemInAreas(fixture(), "ghost", { kind: "area", areaId: "living" }))
      .toThrow("未找到要移动的物品");
  });

  it("移动到不存在的区域时抛出错误", () => {
    expect(() => moveItemInAreas(fixture(), "steamer", { kind: "area", areaId: "ghost-area" }))
      .toThrow("目标区域不存在");
  });

  it("移动到不存在的容器时抛出错误", () => {
    expect(() => moveItemInAreas(fixture(), "steamer", {
      kind: "container",
      containerItemId: "ghost-container",
    })).toThrow("目标储物空间不存在");
  });

  it("containerSlot 空白字符串被清理为 undefined", () => {
    const result = moveItemInAreas(fixture(), "steamer", {
      kind: "container",
      containerItemId: "wardrobe",
      containerSlot: "   ",
    });
    expect(result.item.containerSlot).toBeUndefined();
  });
});

describe("深度嵌套场景", () => {
  function deepFixture(): Area[] {
    return [
      {
        id: "bedroom",
        name: "主卧",
        floorPlanPos: { x: 10, y: 10 },
        images: [],
        items: [
          item("wardrobe", "bedroom", { name: "衣柜" }),
          item("box", "bedroom", { name: "收纳箱", containerItemId: "wardrobe" }),
          item("pouch", "bedroom", { name: "小袋", containerItemId: "box" }),
          item("key", "bedroom", { name: "钥匙", containerItemId: "pouch" }),
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

  it("getDescendantIds 返回所有层级的后代", () => {
    const ids = getDescendantIds(deepFixture(), "wardrobe");
    expect([...ids].sort()).toEqual(["box", "key", "pouch"]);
  });

  it("getItemLocationTrail 生成完整 4 层位置链", () => {
    const trail = getItemLocationTrail(deepFixture(), "key");
    expect(trail).toEqual([
      { kind: "area", id: "bedroom", name: "主卧" },
      { kind: "item", id: "wardrobe", areaId: "bedroom", name: "衣柜" },
      { kind: "item", id: "box", areaId: "bedroom", name: "收纳箱" },
      { kind: "item", id: "pouch", areaId: "bedroom", name: "小袋" },
    ]);
  });

  it("getItemLocationPath 返回可读路径", () => {
    expect(getItemLocationPath(deepFixture(), "key")).toEqual([
      "主卧", "衣柜", "收纳箱", "小袋",
    ]);
  });

  it("跨区域移动 4 层容器时整棵子树一起迁移", () => {
    const result = moveItemInAreas(deepFixture(), "wardrobe", {
      kind: "container",
      containerItemId: "cabinet",
    });
    const livingItems = result.areas.find((area) => area.id === "living")!.items.map((entry) => entry.id);
    expect(livingItems).toEqual(expect.arrayContaining(["wardrobe", "box", "pouch", "key"]));
    const bedroomItems = result.areas.find((area) => area.id === "bedroom")!.items.map((entry) => entry.id);
    expect(bedroomItems).not.toEqual(expect.arrayContaining(["wardrobe", "box", "pouch", "key"]));
    expect(getItemLocationPath(result.areas, "key")).toEqual([
      "客厅", "客厅柜", "衣柜", "收纳箱", "小袋",
    ]);
  });

  it("删除中间容器时直接子物品提升到上一级，孙辈保持不变", () => {
    const result = removeItemFromAreas(deepFixture(), "box");
    const pouch = result.areas.flatMap((area) => area.items).find((entry) => entry.id === "pouch")!;
    const key = result.areas.flatMap((area) => area.items).find((entry) => entry.id === "key")!;
    expect(result.releasedCount).toBe(1);
    expect(pouch.containerItemId).toBe("wardrobe");
    expect(key.containerItemId).toBe("pouch");
  });
});

describe("边界场景", () => {
  it("getItemLocationTrail 不存在的物品返回空数组", () => {
    expect(getItemLocationTrail(fixture(), "ghost")).toEqual([]);
  });

  it("removeItemFromAreas 不存在的物品返回原数据且 releasedCount=0", () => {
    const original = fixture();
    const result = removeItemFromAreas(original, "ghost");
    expect(result.releasedCount).toBe(0);
    expect(result.areas).toEqual(original);
  });

  it("removeItemFromAreas 删除没有子物品的容器时 releasedCount=0", () => {
    const result = removeItemFromAreas(fixture(), "iron");
    expect(result.releasedCount).toBe(0);
    expect(result.areas.flatMap((area) => area.items).some((entry) => entry.id === "iron")).toBe(false);
  });

  it("getDirectContainedItems 按名称排序返回", () => {
    const areas: Area[] = [
      {
        id: "room",
        name: "房间",
        floorPlanPos: { x: 50, y: 50 },
        images: [],
        items: [
          item("container", "room", { name: "容器" }),
          item("z-item", "room", { name: "Z物品", containerItemId: "container" }),
          item("a-item", "room", { name: "A物品", containerItemId: "container" }),
          item("m-item", "room", { name: "M物品", containerItemId: "container" }),
        ],
      },
    ];
    const children = getDirectContainedItems(areas, "container");
    expect(children.map((entry) => entry.name)).toEqual(["A物品", "M物品", "Z物品"]);
  });

  it("findItemInAreas 返回物品与区域", () => {
    const found = findItemInAreas(fixture(), "wardrobe");
    expect(found?.item.id).toBe("wardrobe");
    expect(found?.area.id).toBe("bedroom");
  });

  it("findItemInAreas 不存在的物品返回 undefined", () => {
    expect(findItemInAreas(fixture(), "ghost")).toBeUndefined();
  });
});

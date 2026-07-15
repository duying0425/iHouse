import { describe, expect, it } from "vitest";
import { normalizeHomeData } from "./homeData";

describe("normalizeHomeData", () => {
  it("补齐残缺区域，避免读取 images 和 floorPlanPos 时白屏", () => {
    const home = normalizeHomeData({
      title: "My Home",
      floorPlanImage: "builtin-floorplan",
      areas: [{ id: "a1", name: "Living Room", items: [] }],
    });

    expect(home?.areas[0]).toEqual(expect.objectContaining({
      id: "a1",
      images: [],
      items: [],
      floorPlanPos: { x: 50, y: 50 },
    }));
  });

  it("补齐残缺物品字段并修正 areaId", () => {
    const home = normalizeHomeData({
      areas: [{ id: "room", items: [{ id: "item", name: "测试" }] }],
    });
    expect(home?.areas[0].items[0]).toEqual(expect.objectContaining({
      id: "item",
      areaId: "room",
      category: "其他",
      image: "",
    }));
  });

  it("非对象输入返回 null", () => {
    expect(normalizeHomeData(null)).toBeNull();
    expect(normalizeHomeData("invalid")).toBeNull();
  });

  it("v2 房屋文档加载后升级为 v3 且旧物品无损", () => {
    const home = normalizeHomeData({
      title: "旧房屋",
      floorPlanImage: "",
      areas: [{
        id: "room",
        name: "房间",
        floorPlanPos: { x: 50, y: 50 },
        images: [],
        items: [{ id: "old", name: "旧物品", category: "家电", image: "" }],
      }],
    });
    expect(home?.schemaVersion).toBe(3);
    expect(home?.areas[0].items[0]).toMatchObject({ id: "old", areaId: "room", name: "旧物品" });
  });

  it("修复悬空关系，并将跨区域的收纳物品迁到容器区域", () => {
    const home = normalizeHomeData({
      title: "测试",
      floorPlanImage: "",
      areas: [
        {
          id: "a",
          name: "A",
          floorPlanPos: { x: 10, y: 10 },
          images: [],
          items: [{ id: "container", name: "柜子", category: "储物", image: "" }],
        },
        {
          id: "b",
          name: "B",
          floorPlanPos: { x: 20, y: 20 },
          images: [{ id: "b-image", url: "b.jpg" }],
          items: [
            {
              id: "child",
              name: "子物品",
              category: "家电",
              image: "",
              containerItemId: "container",
              areaImageId: "b-image",
              areaImagePos: { x: 1, y: 2 },
            },
            { id: "orphan", name: "悬空物品", category: "其他", image: "", containerItemId: "missing" },
          ],
        },
      ],
    });
    const areaA = home!.areas.find((area) => area.id === "a")!;
    const child = areaA.items.find((entry) => entry.id === "child")!;
    const orphan = home!.areas.flatMap((area) => area.items).find((entry) => entry.id === "orphan")!;
    expect(child.areaId).toBe("a");
    expect(child.areaImageId).toBeUndefined();
    expect(orphan.containerItemId).toBeUndefined();
  });

  it("迁移时打断循环收纳关系", () => {
    const home = normalizeHomeData({
      areas: [{
        id: "room",
        name: "房间",
        floorPlanPos: { x: 50, y: 50 },
        images: [],
        items: [
          { id: "a", name: "A", category: "储物", image: "", containerItemId: "b" },
          { id: "b", name: "B", category: "储物", image: "", containerItemId: "a" },
        ],
      }],
    });
    const [a, b] = home!.areas[0].items;
    expect(a.containerItemId).toBeUndefined();
    expect(b.containerItemId).toBe("a");
  });
});

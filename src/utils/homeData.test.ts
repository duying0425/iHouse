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

  it("对于已有 bounds 的区域，自动将其锚点 floorPlanPos 对齐到 bounds 的中心点", () => {
    const home = normalizeHomeData({
      areas: [
        {
          id: "room",
          floorPlanPos: { x: 0, y: 0 },
          bounds: { x: 10, y: 20, w: 30, h: 40 },
        },
      ],
    });
    expect(home?.areas[0].floorPlanPos).toEqual({ x: 25, y: 40 });
  });

  it("bounds 处于 0-100 边界时，锚点仍对齐到中心", () => {
    const home = normalizeHomeData({
      areas: [
        {
          id: "full",
          floorPlanPos: { x: 12, y: 34 },
          bounds: { x: 0, y: 0, w: 100, h: 100 },
        },
      ],
    });
    expect(home?.areas[0].floorPlanPos).toEqual({ x: 50, y: 50 });
  });

  it("bounds 位于右下角时，锚点为中心点而非原 floorPlanPos", () => {
    const home = normalizeHomeData({
      areas: [
        {
          id: "corner",
          floorPlanPos: { x: 5, y: 5 },
          bounds: { x: 90, y: 90, w: 10, h: 10 },
        },
      ],
    });
    expect(home?.areas[0].floorPlanPos).toEqual({ x: 95, y: 95 });
  });

  it("bounds 含 NaN/Infinity 时回退为 0，锚点对齐到 (0,0)", () => {
    const home = normalizeHomeData({
      areas: [
        {
          id: "bad",
          bounds: { x: NaN, y: Infinity, w: "30" as unknown as number, h: undefined as unknown as number },
        },
      ],
    });
    expect(home?.areas[0].bounds).toEqual({ x: 0, y: 0, w: 0, h: 0 });
    expect(home?.areas[0].floorPlanPos).toEqual({ x: 0, y: 0 });
  });

  it("无 bounds 的区域保留原 floorPlanPos，不受其他区域影响", () => {
    const home = normalizeHomeData({
      areas: [
        { id: "with-bounds", floorPlanPos: { x: 1, y: 1 }, bounds: { x: 20, y: 20, w: 40, h: 40 } },
        { id: "without-bounds", floorPlanPos: { x: 70, y: 30 } },
      ],
    });
    expect(home?.areas[0].floorPlanPos).toEqual({ x: 40, y: 40 });
    expect(home?.areas[1].floorPlanPos).toEqual({ x: 70, y: 30 });
    expect(home?.areas[1].bounds).toBeUndefined();
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

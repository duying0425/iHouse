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
});

import { describe, it, expect } from "vitest";
import {
  buildSummary,
  listAreas,
  getAreaById,
  searchItems,
  getItemById,
  listLocations,
} from "./query.js";

// 测试夹具：两个区域，含不同分类/品牌/储物单元/维护周期
const HOME = {
  title: "测试之家",
  subtitle: "测试用",
  floorPlanImage: "/api/images/floor.png",
  areas: [
    {
      id: "area-living",
      name: "客厅",
      description: "客厅区域",
      floorPlanPos: { x: 50, y: 50 },
      images: [
        { id: "img-living-1", url: "/api/images/l1.png", label: "总图" },
        { id: "img-living-2", url: "/api/images/l2.png", label: "设施图" },
      ],
      items: [
        {
          id: "item-sofa",
          areaId: "area-living",
          name: "三人沙发",
          category: "家具",
          brand: "宜家",
          spec: "210cm",
          image: "/api/images/sofa.png",
          areaImageId: "img-living-1",
          areaImagePos: { x: 30, y: 60 },
          maintenanceCycle: 365,
          lastMaintenanceDate: "2025-01-01",
        },
        {
          id: "item-tv",
          areaId: "area-living",
          name: "电视",
          category: "家电",
          brand: "小米",
          image: "/api/images/tv.png",
          areaImageId: "img-living-1",
          areaImagePos: { x: 50, y: 40 },
        },
        {
          id: "item-drawer",
          areaId: "area-living",
          name: "抽屉柜",
          category: "储物",
          image: "/api/images/drawer.png",
          contents: [
            { id: "cnt-1", name: "电池", quantity: "4节", remark: "5号" },
            { id: "cnt-2", name: "螺丝刀", quantity: "1把" },
          ],
        },
      ],
    },
    {
      id: "area-kitchen",
      name: "厨房",
      floorPlanPos: { x: 40, y: 30 },
      images: [{ id: "img-kit-1", url: "/api/images/k1.png" }],
      items: [
        {
          id: "item-fridge",
          areaId: "area-kitchen",
          name: "冰箱",
          category: "家电",
          brand: "海尔",
          spec: "双开门",
          image: "/api/images/fridge.png",
          areaImageId: "img-kit-1",
          areaImagePos: { x: 70, y: 50 },
          usage: "冷藏 4°C，冷冻 -18°C",
          maintenanceCycle: 180,
          lastMaintenanceDate: "2026-01-01",
          contents: [
            { id: "cnt-3", name: "牛奶", quantity: "2盒", remark: "冷藏室" },
          ],
        },
      ],
    },
  ],
};

function homeWithContainedItem() {
  const home = structuredClone(HOME);
  home.areas[0].items.push({
    id: "item-steamer",
    areaId: "area-living",
    name: "挂烫机",
    category: "家电",
    brand: "飞利浦",
    image: "/api/images/steamer.png",
    containerItemId: "item-drawer",
    containerSlot: "右侧下层",
  });
  return home;
}

describe("buildSummary", () => {
  it("返回正确的区域数和物品数", () => {
    const s = buildSummary(HOME);
    expect(s.ok).toBe(true);
    expect(s.areaCount).toBe(2);
    expect(s.itemCount).toBe(4);
    expect(s.title).toBe("测试之家");
    expect(s.subtitle).toBe("测试用");
  });

  it("统计分类分布", () => {
    const s = buildSummary(HOME);
    expect(s.categories).toEqual({
      家具: 1,
      家电: 2,
      储物: 1,
    });
  });

  it("Top 品牌按数量降序", () => {
    const s = buildSummary(HOME);
    const names = s.topBrands.map((b) => b.name);
    // 小米/海尔/宜家都是 1，顺序不保证但都在前 3
    expect(names).toHaveLength(3);
    expect(names).toContain("宜家");
    expect(names).toContain("小米");
    expect(names).toContain("海尔");
  });

  it("统计需维护物品数（有 maintenanceCycle）", () => {
    const s = buildSummary(HOME);
    expect(s.needsMaintenance).toBe(2); // 沙发 + 冰箱
  });

  it("空 home 容错", () => {
    expect(buildSummary(null).areaCount).toBe(0);
    expect(buildSummary({}).itemCount).toBe(0);
    expect(buildSummary({ areas: [] }).categories).toEqual({});
  });

  it("品牌计数不超过 Top 10", () => {
    const areas = Array.from({ length: 12 }, (_, i) => ({
      id: `a${i}`,
      name: `区域${i}`,
      items: [{ id: `i${i}`, name: `物品${i}`, brand: `品牌${i}`, image: "x" }],
    }));
    const s = buildSummary({ areas });
    expect(s.topBrands).toHaveLength(10);
  });
});

describe("listAreas", () => {
  it("默认精简模式，不返回物品", () => {
    const r = listAreas(HOME);
    expect(r.ok).toBe(true);
    expect(r.areas).toHaveLength(2);
    const living = r.areas.find((a) => a.id === "area-living");
    expect(living.itemCount).toBe(3);
    expect(living.imageCount).toBe(2);
    expect(living.floorPlanPos).toEqual({ x: 50, y: 50 });
    expect(living.items).toBeUndefined();
  });

  it("withItems=true 时附带物品", () => {
    const r = listAreas(HOME, { withItems: true });
    const living = r.areas.find((a) => a.id === "area-living");
    expect(living.items).toHaveLength(3);
    expect(living.items[0].name).toBe("三人沙发");
  });

  it("空 home 返回空数组", () => {
    expect(listAreas(null).areas).toEqual([]);
    expect(listAreas({}).areas).toEqual([]);
  });
});

describe("getAreaById", () => {
  it("存在的区域返回详情", () => {
    const r = getAreaById(HOME, "area-kitchen");
    expect(r.ok).toBe(true);
    expect(r.area.name).toBe("厨房");
    expect(r.area.items).toHaveLength(1);
    expect(r.area.images[0].url).toBe("/api/images/k1.png");
  });

  it("不存在的区域返回 ok:false", () => {
    const r = getAreaById(HOME, "nope");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("area not found");
  });

  it("空 home 时返回 not found", () => {
    expect(getAreaById(null, "x").ok).toBe(false);
  });
});

describe("searchItems", () => {
  it("无过滤返回全部物品，附带 areaId/areaName", () => {
    const r = searchItems(HOME);
    expect(r.count).toBe(4);
    expect(r.items.every((it) => it.areaId && it.areaName)).toBe(true);
  });

  it("按区域过滤", () => {
    const r = searchItems(HOME, { area: "area-living" });
    expect(r.count).toBe(3);
    expect(r.items.every((it) => it.areaId === "area-living")).toBe(true);
  });

  it("按分类过滤", () => {
    const r = searchItems(HOME, { category: "家电" });
    expect(r.count).toBe(2);
    expect(r.items.map((i) => i.name).sort()).toEqual(["冰箱", "电视"]);
  });

  it("按品牌过滤", () => {
    const r = searchItems(HOME, { brand: "海尔" });
    expect(r.count).toBe(1);
    expect(r.items[0].name).toBe("冰箱");
  });

  it("关键词搜索匹配物品名称（小写不敏感）", () => {
    const r = searchItems(HOME, { q: "沙" });
    expect(r.count).toBe(1);
    expect(r.items[0].name).toBe("三人沙发");
  });

  it("关键词搜索匹配储物单元内容", () => {
    // 抽屉柜内部有"电池"
    const r = searchItems(HOME, { q: "电池" });
    expect(r.count).toBe(1);
    expect(r.items[0].name).toBe("抽屉柜");
  });

  it("关键词搜索匹配使用说明", () => {
    const r = searchItems(HOME, { q: "冷藏" });
    expect(r.count).toBe(1);
    expect(r.items[0].name).toBe("冰箱");
  });

  it("正式收纳物品可通过容器名称检索并返回位置路径", () => {
    const r = searchItems(homeWithContainedItem(), { q: "抽屉柜" });
    const steamer = r.items.find((item) => item.id === "item-steamer");
    expect(steamer).toMatchObject({
      containerItemId: "item-drawer",
      containerName: "抽屉柜",
      locationPath: ["客厅", "抽屉柜"],
    });
  });

  it("关键词前后空白被裁剪", () => {
    expect(searchItems(HOME, { q: "  沙发  " }).count).toBe(1);
  });

  it("组合过滤：区域 + 分类", () => {
    const r = searchItems(HOME, { area: "area-living", category: "家电" });
    expect(r.count).toBe(1);
    expect(r.items[0].name).toBe("电视");
  });

  it("无匹配时返回空", () => {
    expect(searchItems(HOME, { q: "不存在的物品" }).count).toBe(0);
    expect(searchItems(HOME, { brand: "未知品牌" }).items).toEqual([]);
  });

  it("空 home 返回空", () => {
    expect(searchItems(null).count).toBe(0);
  });
});

describe("getItemById", () => {
  it("存在的物品返回详情 + 所属区域 + 区域图", () => {
    const r = getItemById(HOME, "item-fridge");
    expect(r.ok).toBe(true);
    expect(r.item.name).toBe("冰箱");
    expect(r.area.name).toBe("厨房");
    expect(r.areaImage.id).toBe("img-kit-1");
    expect(r.areaImage.url).toBe("/api/images/k1.png");
  });

  it("物品没有 areaImageId 时 areaImage 为 null", () => {
    const r = getItemById(HOME, "item-drawer");
    expect(r.ok).toBe(true);
    expect(r.areaImage).toBeNull();
  });

  it("收纳物品详情附带直接容器和完整位置路径", () => {
    const r = getItemById(homeWithContainedItem(), "item-steamer");
    expect(r.container).toEqual({ id: "item-drawer", name: "抽屉柜" });
    expect(r.locationPath).toEqual(["客厅", "抽屉柜"]);
  });

  it("不存在的物品返回 not found", () => {
    const r = getItemById(HOME, "nope");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("item not found");
  });

  it("空 home 时返回 not found", () => {
    expect(getItemById(null, "x").ok).toBe(false);
  });
});

describe("listLocations", () => {
  it("返回全部物品位置索引", () => {
    const r = listLocations(HOME);
    expect(r.count).toBe(4);
    expect(r.locations.every((l) => l.areaName && l.areaId)).toBe(true);
  });

  it("位置索引字段完整", () => {
    const r = listLocations(HOME);
    const sofa = r.locations.find((l) => l.itemId === "item-sofa");
    expect(sofa).toMatchObject({
      name: "三人沙发",
      category: "家具",
      brand: "宜家",
      areaName: "客厅",
      areaImageId: "img-living-1",
      areaImagePos: { x: 30, y: 60 },
    });
  });

  it("储物单元附带内部物品清单 contents", () => {
    const r = listLocations(HOME);
    const drawer = r.locations.find((l) => l.itemId === "item-drawer");
    expect(drawer.contents).toHaveLength(2);
    expect(drawer.contents[0].name).toBe("电池");
  });

  it("正式收纳物品的位置索引包含容器信息", () => {
    const r = listLocations(homeWithContainedItem());
    const steamer = r.locations.find((location) => location.itemId === "item-steamer");
    expect(steamer).toMatchObject({
      containerItemId: "item-drawer",
      containerName: "抽屉柜",
      containerSlot: "右侧下层",
      locationPath: ["客厅", "抽屉柜"],
    });
  });

  it("按区域过滤", () => {
    const r = listLocations(HOME, { area: "area-kitchen" });
    expect(r.count).toBe(1);
    expect(r.locations[0].name).toBe("冰箱");
  });

  it("按分类过滤", () => {
    const r = listLocations(HOME, { category: "储物" });
    expect(r.count).toBe(1);
    expect(r.locations[0].name).toBe("抽屉柜");
  });

  it("无 areaImagePos 时返回 null", () => {
    const r = listLocations(HOME);
    const drawer = r.locations.find((l) => l.itemId === "item-drawer");
    expect(drawer.areaImagePos).toBeNull();
    expect(drawer.areaImageId).toBeNull();
  });

  it("空 home 返回空", () => {
    expect(listLocations(null).count).toBe(0);
  });
});

describe("深度嵌套容器场景", () => {
  function deepNestedHome() {
    const home = structuredClone(HOME);
    home.areas[0].items.push(
      {
        id: "item-wardrobe",
        areaId: "area-living",
        name: "衣柜",
        category: "家具",
        image: "/api/images/wardrobe.png",
      },
      {
        id: "item-box",
        areaId: "area-living",
        name: "收纳箱",
        category: "储物",
        image: "/api/images/box.png",
        containerItemId: "item-wardrobe",
      },
      {
        id: "item-pouch",
        areaId: "area-living",
        name: "小袋",
        category: "储物",
        image: "/api/images/pouch.png",
        containerItemId: "item-box",
        containerSlot: "左侧口袋",
      }
    );
    return home;
  }

  it("containerContext 返回完整 3 层容器名路径", () => {
    const r = getItemById(deepNestedHome(), "item-pouch");
    expect(r.locationPath).toEqual(["客厅", "衣柜", "收纳箱"]);
    expect(r.container).toEqual({ id: "item-box", name: "收纳箱" });
  });

  it("searchItems 关键词命中 containerSlot", () => {
    const r = searchItems(deepNestedHome(), { q: "左侧口袋" });
    expect(r.count).toBe(1);
    expect(r.items[0].id).toBe("item-pouch");
  });

  it("listLocations 返回深层物品的完整位置路径", () => {
    const r = listLocations(deepNestedHome());
    const pouch = r.locations.find((l) => l.itemId === "item-pouch");
    expect(pouch).toMatchObject({
      containerItemId: "item-box",
      containerName: "收纳箱",
      containerSlot: "左侧口袋",
      locationPath: ["客厅", "衣柜", "收纳箱"],
    });
  });

  it("searchItems 通过祖先容器名称检索到深层物品", () => {
    const r = searchItems(deepNestedHome(), { q: "衣柜" });
    const ids = r.items.map((entry) => entry.id);
    expect(ids).toContain("item-wardrobe");
    expect(ids).toContain("item-box");
    expect(ids).toContain("item-pouch");
  });
});

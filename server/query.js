/**
 * 结构化查询纯函数模块
 *
 * 所有函数均不访问数据库、不触发副作用，接收 home 数据对象返回结构化结果。
 * 便于在 /api/query/* 路由层与未来 AI 工具调用中复用，也便于单元测试。
 */

/**
 * @typedef {Object} Item
 * @property {string} id
 * @property {string} areaId
 * @property {string} name
 * @property {string} category
 * @property {string} [brand]
 * @property {string} [spec]
 * @property {string} [remark]
 * @property {string} [usage]
 * @property {string} image
 * @property {string[]} [gallery]
 * @property {string} [areaImageId]
 * @property {{x:number,y:number}} [areaImagePos]
 * @property {string} [containerItemId]
 * @property {string} [containerSlot]
 * @property {Array<{id:string,name:string,quantity?:string,remark?:string}>} [contents]
 * @property {number} [maintenanceCycle]
 * @property {string} [lastMaintenanceDate]
 */

/**
 * @typedef {Object} AreaImage
 * @property {string} id
 * @property {string} url
 * @property {string} [label]
 */

/**
 * @typedef {Object} Area
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 * @property {{x:number,y:number}} floorPlanPos
 * @property {AreaImage[]} [images]
 * @property {Item[]} [items]
 */

/**
 * @typedef {Object} Home
 * @property {string} title
 * @property {string} [subtitle]
 * @property {string} floorPlanImage
 * @property {Area[]} [areas]
 */

/**
 * 安全读取 home.areas 数组
 * @param {Home|null|undefined} home
 * @returns {Area[]}
 */
function getAreas(home) {
  return (home && home.areas) || [];
}

function buildItemIndex(home) {
  const index = new Map();
  for (const area of getAreas(home)) {
    for (const item of area.items || []) index.set(item.id, { item, area });
  }
  return index;
}

function containerContext(item, index) {
  const names = [];
  const seen = new Set([item.id]);
  let parentId = item.containerItemId;
  let directContainer = null;
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = index.get(parentId);
    if (!parent) break;
    if (!directContainer) directContainer = parent;
    names.unshift(parent.item.name);
    parentId = parent.item.containerItemId;
  }
  return {
    container: directContainer
      ? { id: directContainer.item.id, name: directContainer.item.name }
      : null,
    containerNames: names,
  };
}

/**
 * 全屋概览：区域数、物品数、分类分布、Top 品牌、需维护数
 * @param {Home} home
 */
export function buildSummary(home) {
  const areas = getAreas(home);
  const items = areas.flatMap((a) => a.items || []);

  const categoryCount = {};
  const brandCount = {};
  let needsMaintenance = 0;

  for (const it of items) {
    if (it.category) categoryCount[it.category] = (categoryCount[it.category] || 0) + 1;
    if (it.brand) brandCount[it.brand] = (brandCount[it.brand] || 0) + 1;
    if (it.maintenanceCycle) needsMaintenance += 1;
  }

  return {
    ok: true,
    title: home && home.title,
    subtitle: home && home.subtitle,
    areaCount: areas.length,
    itemCount: items.length,
    categories: categoryCount,
    topBrands: Object.entries(brandCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count })),
    needsMaintenance,
  };
}

/**
 * 区域列表：默认精简（不含物品），withItems=true 时附带物品
 * @param {Home} home
 * @param {{withItems?:boolean}} [opts]
 */
export function listAreas(home, opts = {}) {
  const withItems = opts.withItems === true;
  const areas = getAreas(home).map((a) => {
    const base = {
      id: a.id,
      name: a.name,
      description: a.description,
      itemCount: (a.items || []).length,
      imageCount: (a.images || []).length,
      floorPlanPos: a.floorPlanPos,
    };
    if (withItems) base.items = a.items || [];
    return base;
  });
  return { ok: true, areas };
}

/**
 * 单个区域详情
 * @param {Home} home
 * @param {string} areaId
 * @returns {{ok:boolean, area?:Area, error?:string}}
 */
export function getAreaById(home, areaId) {
  const area = getAreas(home).find((a) => a.id === areaId);
  if (!area) return { ok: false, error: "area not found" };
  return { ok: true, area };
}

/**
 * 物品搜索过滤条件
 * @typedef {{area?:string, category?:string, brand?:string, q?:string}} ItemFilters
 */

/**
 * 收集物品的可搜索文本（小写）
 * @param {Item} it
 */
function itemSearchText(it, containerNames = []) {
  return [
    it.name,
    it.brand,
    it.spec,
    it.remark,
    it.usage,
    ...containerNames,
    it.containerSlot,
    ...(it.contents || []).map((c) => `${c.name} ${c.quantity || ""} ${c.remark || ""}`),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * 物品列表 / 搜索：支持 area/category/brand/q 组合过滤
 * @param {Home} home
 * @param {ItemFilters} [filters]
 */
export function searchItems(home, filters = {}) {
  const { area, category, brand, q } = filters;
  const keyword = typeof q === "string" ? q.trim().toLowerCase() : "";

  const items = [];
  const index = buildItemIndex(home);
  for (const a of getAreas(home)) {
    if (area && a.id !== area) continue;
    for (const it of a.items || []) {
      if (category && it.category !== category) continue;
      if (brand && it.brand !== brand) continue;
      const context = containerContext(it, index);
      if (keyword && !itemSearchText(it, context.containerNames).includes(keyword)) continue;
      items.push({
        ...it,
        areaId: a.id,
        areaName: a.name,
        containerName: context.container?.name,
        locationPath: [a.name, ...context.containerNames],
      });
    }
  }
  return { ok: true, count: items.length, items };
}

/**
 * 单个物品详情：附带所属区域与区域图上下文
 * @param {Home} home
 * @param {string} itemId
 * @returns {{ok:boolean, item?:Item, area?:object, areaImage?:AreaImage|null, error?:string}}
 */
export function getItemById(home, itemId) {
  const index = buildItemIndex(home);
  for (const a of getAreas(home)) {
    const item = (a.items || []).find((i) => i.id === itemId);
    if (item) {
      const context = containerContext(item, index);
      const areaImage = (a.images || []).find((img) => img.id === item.areaImageId) || null;
      return {
        ok: true,
        item,
        area: {
          id: a.id,
          name: a.name,
          description: a.description,
        },
        areaImage,
        container: context.container,
        locationPath: [a.name, ...context.containerNames],
      };
    }
  }
  return { ok: false, error: "item not found" };
}

/**
 * 物品位置索引：物品 + 所属区域 + 区域图位置
 * 用于"东西放哪了"类查询
 * @param {Home} home
 * @param {{area?:string, category?:string}} [filters]
 */
export function listLocations(home, filters = {}) {
  const { area, category } = filters;
  const locations = [];
  const index = buildItemIndex(home);
  for (const a of getAreas(home)) {
    if (area && a.id !== area) continue;
    for (const it of a.items || []) {
      if (category && it.category !== category) continue;
      const context = containerContext(it, index);
      locations.push({
        itemId: it.id,
        name: it.name,
        category: it.category,
        brand: it.brand,
        areaId: a.id,
        areaName: a.name,
        areaImageId: it.areaImageId || null,
        areaImagePos: it.areaImagePos || null,
        containerItemId: it.containerItemId || null,
        containerName: context.container?.name || null,
        containerSlot: it.containerSlot || null,
        locationPath: [a.name, ...context.containerNames],
        contents: it.contents || [],
      });
    }
  }
  return { ok: true, count: locations.length, locations };
}

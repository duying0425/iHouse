import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  AnchorPosition,
  Area,
  AreaImage,
  Bounds,
  Home,
  Item,
  ItemDestination,
  SearchQuery,
  SearchResult,
} from "@/types";
import { cloneSeed, collectBrands, genId } from "@/data/seed";
import { serverStorage, setReloading } from "@/serverStorage";
import { normalizeHomeData } from "@/utils/homeData";
import {
  getDirectContainedItems,
  getItemLocationPath,
  moveItemInAreas,
  removeItemFromAreas,
} from "@/utils/itemLocation";

let reloadGeneration = 0;

/**
 * 持久化存储：服务器优先 + 本地 IndexedDB 缓存。
 * 服务器是多设备共享的数据源头；本地缓存用于离线兜底。
 * 旧版本数据存在 IndexedDB 中，getItem 回退到本地缓存时自动读取并同步到服务器。
 * 详见 serverStorage.ts。
 */

interface HomeState extends Home {
  // 数据是否已从服务器/本地缓存加载完成（用于门控首屏，避免示例数据闪现）
  _hasHydrated: boolean;

  /** 重新拉取当前房屋数据（用于切换房屋后重置 store） */
  reloadCurrentHouse: () => Promise<void>;

  // 读取
  getArea: (areaId: string) => Area | undefined;
  getItem: (areaId: string, itemId: string) =>
    { item: Item; area: Area } | undefined;
  getContainedItems: (containerItemId: string) => Item[];
  allBrands: () => string[];
  search: (query: SearchQuery) => SearchResult[];

  // 录入 / 编辑 / 删除
  addItem: (areaId: string, item: Omit<Item, "id" | "areaId">) => Item;
  updateItem: (areaId: string, itemId: string, patch: Partial<Item>) => void;
  moveItem: (itemId: string, destination: ItemDestination) => Item;
  removeItem: (areaId: string, itemId: string) => void;

  addArea: (area: Omit<Area, "id" | "items">) => Area;
  updateArea: (areaId: string, patch: Partial<Area>) => void;
  removeArea: (areaId: string) => void;

  // 区域图片管理（每个区域可有多张图）
  addAreaImage: (areaId: string, image: Omit<AreaImage, "id">) => AreaImage;
  updateAreaImage: (
    areaId: string,
    imageId: string,
    patch: Partial<AreaImage>
  ) => void;
  removeAreaImage: (areaId: string, imageId: string) => void;

  // 户型图与区域位置
  setFloorPlanImage: (image: string) => void;
  setHomeTitle: (title: string) => void;
  updateAreaPos: (areaId: string, pos: AnchorPosition) => void;
  updateAreaBounds: (areaId: string, bounds: Bounds | null) => void;
  clearAllAreas: () => void;
  startBlank: () => void;

  resetDemo: () => void;

  /** 导出全部数据为 JSON 字符串 */
  exportData: () => string;
  /** 从 JSON 字符串导入数据（覆盖当前数据） */
  importData: (json: string) => void;
}

export const useHomeStore = create<HomeState>()(
  persist(
    (set, get) => ({
      ...cloneSeed(),
      _hasHydrated: false,

      reloadCurrentHouse: async () => {
        const generation = ++reloadGeneration;
        // 切换房屋时：先重置为空状态，标记为未水合，再触发 persist 重新拉取
        // 用 isReloading 标志防止 set 触发 setItem 把 seed 同步到服务器
        setReloading(true);
        set({ ...cloneSeed(), _hasHydrated: false });
        try {
          await useHomeStore.persist.rehydrate();
        } finally {
          // 仅最后一次切换可以结束 loading；较早请求晚返回时不得覆盖新房屋状态。
          if (generation === reloadGeneration) {
            setReloading(false);
            // 显式标记水合完成，不依赖 onRehydrateStorage 回调
            // （该回调在某些时序下可能不触发，导致页面永久卡在 loading）
            set({ _hasHydrated: true });
          }
        }
      },

      getArea: (areaId) => get().areas.find((a) => a.id === areaId),

      getItem: (areaId, itemId) => {
        const area = get().areas.find((a) => a.id === areaId);
        if (!area) return undefined;
        const item = area.items.find((i) => i.id === itemId);
        if (!item) return undefined;
        return { item, area };
      },

      getContainedItems: (containerItemId) =>
        getDirectContainedItems(get().areas, containerItemId),

      allBrands: () => collectBrands(get().areas),

      search: (query) => {
        const { areas } = get();
        const kw = query.keyword?.trim().toLowerCase();
        const results: SearchResult[] = [];
        areas.forEach((area) => {
          // 区域筛选
          if (query.areaIds && query.areaIds.length > 0 && !query.areaIds.includes(area.id)) {
            return;
          }
          area.items.forEach((item) => {
            // 分类筛选
            if (query.categories && query.categories.length > 0 && !query.categories.includes(item.category)) {
              return;
            }
            // 品牌筛选
            if (query.brands && query.brands.length > 0 && (!item.brand || !query.brands.includes(item.brand))) {
              return;
            }
            // 关键词匹配（含储物单元内部物品清单 contents）
            if (kw) {
              const contentParts = (item.contents ?? []).flatMap((c) => [
                c.name,
                c.remark,
              ]);
              const tagParts = item.tags ?? [];
              const hay = [
                item.name,
                item.brand,
                item.spec,
                item.remark,
                item.usage,
                ...tagParts,
                ...getItemLocationPath(areas, item.id),
                ...contentParts,
              ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
              if (!hay.includes(kw)) return;
            }
            results.push({ item, area });
          });
        });

        // 排序
        const sortBy = query.sortBy || "name";
        const order = query.sortOrder === "desc" ? -1 : 1;
        results.sort((a, b) => {
          let va: string | number = "";
          let vb: string | number = "";
          if (sortBy === "name") {
            va = a.item.name;
            vb = b.item.name;
          } else if (sortBy === "purchaseDate") {
            va = a.item.purchaseDate || "";
            vb = b.item.purchaseDate || "";
          } else if (sortBy === "price") {
            va = a.item.price ?? 0;
            vb = b.item.price ?? 0;
          }
          if (va < vb) return -1 * order;
          if (va > vb) return 1 * order;
          return 0;
        });
        return results;
      },

      addItem: (areaId, data) => {
        const item: Item = { ...data, id: genId("item"), areaId };
        set((state) => ({
          areas: state.areas.map((a) =>
            a.id === areaId ? { ...a, items: [...a.items, item] } : a
          ),
        }));
        return item;
      },

      updateItem: (areaId, itemId, patch) => {
        set((state) => ({
          areas: state.areas.map((a) =>
            a.id === areaId
              ? {
                  ...a,
                  items: a.items.map((i) =>
                    i.id === itemId ? { ...i, ...patch } : i
                  ),
                }
              : a
          ),
        }));
      },

      moveItem: (itemId, destination) => {
        const result = moveItemInAreas(get().areas, itemId, destination);
        set({ areas: result.areas });
        return result.item;
      },

      removeItem: (areaId, itemId) => {
        void areaId;
        set((state) => ({ areas: removeItemFromAreas(state.areas, itemId).areas }));
      },

      addArea: (data) => {
        const area: Area = { ...data, id: genId("area"), items: [] };
        set((state) => ({ areas: [...state.areas, area] }));
        return area;
      },

      updateArea: (areaId, patch) => {
        set((state) => ({
          areas: state.areas.map((a) =>
            a.id === areaId ? { ...a, ...patch } : a
          ),
        }));
      },

      removeArea: (areaId) => {
        set((state) => ({
          areas: state.areas.filter((a) => a.id !== areaId),
        }));
      },

      addAreaImage: (areaId, image) => {
        const newImage: AreaImage = { ...image, id: genId("aimg") };
        set((state) => ({
          areas: state.areas.map((a) =>
            a.id === areaId ? { ...a, images: [...a.images, newImage] } : a
          ),
        }));
        return newImage;
      },

      updateAreaImage: (areaId, imageId, patch) => {
        set((state) => ({
          areas: state.areas.map((a) =>
            a.id === areaId
              ? {
                  ...a,
                  images: a.images.map((img) =>
                    img.id === imageId ? { ...img, ...patch } : img
                  ),
                }
              : a
          ),
        }));
      },

      removeAreaImage: (areaId, imageId) => {
        set((state) => ({
          areas: state.areas.map((a) => {
            if (a.id !== areaId) return a;
            // 删除图片时，把引用了这张图的物品位置也清空
            const items = a.items.map((i) =>
              i.areaImageId === imageId
                ? { ...i, areaImageId: undefined, areaImagePos: undefined }
                : i
            );
            return {
              ...a,
              images: a.images.filter((img) => img.id !== imageId),
              items,
            };
          }),
        }));
      },

      setFloorPlanImage: (image) => {
        set({ floorPlanImage: image });
      },

      setHomeTitle: (title) => {
        set({ title });
      },

      updateAreaPos: (areaId, pos) => {
        set((state) => ({
          areas: state.areas.map((a) =>
            a.id === areaId
              ? {
                  ...a,
                  floorPlanPos: pos,
                  bounds: a.bounds
                    ? (() => {
                        const w = a.bounds.w;
                        const h = a.bounds.h;
                        const x = Math.max(0, Math.min(100 - w, pos.x - w / 2));
                        const y = Math.max(0, Math.min(100 - h, pos.y - h / 2));
                        return { x, y, w, h };
                      })()
                    : undefined,
                }
              : a
          ),
        }));
      },

      updateAreaBounds: (areaId, bounds) => {
        set((state) => ({
          areas: state.areas.map((a) =>
            a.id === areaId
              ? {
                  ...a,
                  bounds: bounds ?? undefined,
                  floorPlanPos: bounds
                    ? { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 }
                    : a.floorPlanPos,
                }
              : a
          ),
        }));
      },

      clearAllAreas: () => {
        set({ areas: [] });
      },

      /** 清空区域并切换为空白户型图（用户将上传自己的户型图） */
      startBlank: () => {
        set({
          schemaVersion: 3,
          title: "我的居所",
          subtitle: "居所图鉴 · 居家设施与物品档案",
          floorPlanImage: "",
          areas: [],
        });
      },

      resetDemo: () => {
        set({ ...cloneSeed() });
      },

      exportData: () => {
        const { title, subtitle, floorPlanImage, areas } = get();
        return JSON.stringify(
          { schemaVersion: 3, title, subtitle, floorPlanImage, areas },
          null,
          2
        );
      },

      importData: (json) => {
        const data = normalizeHomeData(JSON.parse(json));
        if (!data) throw new Error("备份数据格式无效");
        set({
          schemaVersion: 3,
          title: data.title,
          subtitle: data.subtitle ?? "居所图鉴",
          floorPlanImage: data.floorPlanImage,
          areas: data.areas,
        });
      },
    }),
    {
      name: "home-atlas",
      version: 3,
      storage: createJSONStorage(() => serverStorage),
      // 禁用自动 rehydrate：由 App.tsx 监听 currentHouseId 后手动触发
      // 避免 currentHouseId 为空时的无意义 rehydrate 与后续竞态
      skipHydration: true,
      migrate: (persistedState: unknown, fromVersion: number) => {
        const state = (persistedState || {}) as Partial<Home>;
        if (fromVersion < 2 && state.areas) {
          // v1 -> v2：把 area.overviewImage/detailImage 合并为 images[]
          // 把 item.floorPlanPos 迁移为 areaImageId/areaImagePos
          state.areas = state.areas.map((a) => {
            const oldA = a as Area & {
              overviewImage?: string;
              detailImage?: string;
            };
            const images: AreaImage[] = [];
            if (oldA.images && oldA.images.length > 0) {
              images.push(...oldA.images);
            } else {
              if (oldA.overviewImage) {
                images.push({
                  id: genId("aimg"),
                  url: oldA.overviewImage,
                  label: "总图",
                });
              }
              if (oldA.detailImage) {
                images.push({
                  id: genId("aimg"),
                  url: oldA.detailImage,
                  label: "设施图",
                });
              }
            }
            const firstImageId = images[0]?.id;
            const items = a.items.map((i) => {
              const oldI = i as Item & { floorPlanPos?: AnchorPosition };
              if (oldI.areaImageId || oldI.areaImagePos) return i;
              const pos = oldI.floorPlanPos;
              if (firstImageId && pos) {
                return {
                  ...i,
                  areaImageId: firstImageId,
                  areaImagePos: pos,
                } as Item;
              }
              // 不再保留旧字段 floorPlanPos
              return { ...i } as Item;
            });
            // 不再保留旧字段 overviewImage/detailImage
            const rest: Area = {
              id: a.id,
              name: a.name,
              floorPlanPos: a.floorPlanPos,
              bounds: a.bounds,
              images,
              description: a.description,
              items,
            };
            return rest;
          });
        }
        const normalized = normalizeHomeData({ ...state, schemaVersion: 3 });
        return (normalized ?? state) as HomeState;
      },
      onRehydrateStorage: () => (state) => {
        if (state) state._hasHydrated = true;
      },
      partialize: (state) => {
        const { _hasHydrated, ...rest } = state;
        void _hasHydrated;
        return rest as HomeState;
      },
    }
  )
);

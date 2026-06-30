import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  AnchorPosition,
  Area,
  AreaImage,
  Home,
  Item,
  SearchQuery,
  SearchResult,
} from "@/types";
import { cloneSeed, collectBrands, genId } from "@/data/seed";
import { serverStorage } from "@/serverStorage";

/**
 * 持久化存储：服务器优先 + 本地 IndexedDB 缓存。
 * 服务器是多设备共享的数据源头；本地缓存用于离线兜底。
 * 旧版本数据存在 IndexedDB 中，getItem 回退到本地缓存时自动读取并同步到服务器。
 * 详见 serverStorage.ts。
 */

interface HomeState extends Home {
  // 数据是否已从服务器/本地缓存加载完成（用于门控首屏，避免示例数据闪现）
  _hasHydrated: boolean;

  // 读取
  getArea: (areaId: string) => Area | undefined;
  getItem: (areaId: string, itemId: string) =>
    { item: Item; area: Area } | undefined;
  allBrands: () => string[];
  search: (query: SearchQuery) => SearchResult[];

  // 录入 / 编辑 / 删除
  addItem: (areaId: string, item: Omit<Item, "id" | "areaId">) => Item;
  updateItem: (areaId: string, itemId: string, patch: Partial<Item>) => void;
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

      getArea: (areaId) => get().areas.find((a) => a.id === areaId),

      getItem: (areaId, itemId) => {
        const area = get().areas.find((a) => a.id === areaId);
        if (!area) return undefined;
        const item = area.items.find((i) => i.id === itemId);
        if (!item) return undefined;
        return { item, area };
      },

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
            // 关键词匹配
            if (kw) {
              const hay = [item.name, item.brand, item.spec, item.remark, area.name]
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

      removeItem: (areaId, itemId) => {
        set((state) => ({
          areas: state.areas.map((a) =>
            a.id === areaId
              ? { ...a, items: a.items.filter((i) => i.id !== itemId) }
              : a
          ),
        }));
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
            a.id === areaId ? { ...a, floorPlanPos: pos } : a
          ),
        }));
      },

      clearAllAreas: () => {
        set({ areas: [] });
      },

      /** 清空区域并切换为空白户型图（用户将上传自己的户型图） */
      startBlank: () => {
        set({
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
          { version: 2, title, subtitle, floorPlanImage, areas },
          null,
          2
        );
      },

      importData: (json) => {
        const data = JSON.parse(json) as Partial<Home>;
        set({
          title: data.title ?? "我的居所",
          subtitle: data.subtitle ?? "居所图鉴",
          floorPlanImage: data.floorPlanImage ?? "",
          areas: data.areas ?? [],
        });
      },
    }),
    {
      name: "home-atlas",
      version: 2,
      storage: createJSONStorage(() => serverStorage),
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
        return state as HomeState;
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

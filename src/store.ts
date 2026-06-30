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
import { compressImage } from "@/utils/compressImage";

/**
 * 基于 IndexedDB 的持久化存储。
 * 之所以不用 localStorage：用户上传的图片是 base64 data URL，
 * 单张可达数 MB，几张图就会撑爆 localStorage 的 5-10MB 配额，
 * 导致 QuotaExceededError —— 表现为「保存没反应 + 刷新后图片丢失」。
 * IndexedDB 配额通常是几百 MB 到 GB 级，能容纳大量图片。
 */
const idbStorage = {
  _db: null as IDBDatabase | null,
  _ready: null as Promise<IDBDatabase> | null,
  open(): Promise<IDBDatabase> {
    if (this._db) return Promise.resolve(this._db);
    if (this._ready) return this._ready;
    this._ready = new Promise((resolve, reject) => {
      const req = indexedDB.open("home-atlas-db", 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("kv")) {
          db.createObjectStore("kv");
        }
      };
      req.onsuccess = () => {
        this._db = req.result;
        resolve(req.result);
      };
      req.onerror = () => reject(req.error);
    });
    return this._ready;
  },
  async getItem(name: string): Promise<string | null> {
    try {
      const db = await this.open();
      const val = await new Promise<string | null>((resolve) => {
        const tx = db.transaction("kv", "readonly");
        const req = tx.objectStore("kv").get(name);
        req.onsuccess = () => resolve((req.result as string) ?? null);
        req.onerror = () => resolve(null);
      });
      if (val) return val;
      // IndexedDB 里没有，尝试从旧 localStorage 迁移过来
      try {
        const old = localStorage.getItem(name);
        if (old) {
          await this.setItem(name, old);
          localStorage.removeItem(name);
        }
        return old;
      } catch {
        return null;
      }
    } catch {
      return null;
    }
  },
  async setItem(name: string, value: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").put(value, name);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
  async removeItem(name: string): Promise<void> {
    try {
      const db = await this.open();
      return new Promise((resolve) => {
        const tx = db.transaction("kv", "readwrite");
        tx.objectStore("kv").delete(name);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      // ignore
    }
  },
};

interface HomeState extends Home {
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

  /**
   * 清洗已有数据：把所有 base64 图片重新压缩一遍。
   * 返回处理前后的总字节数，便于展示效果。
   */
  compressExistingImages: () => Promise<{ before: number; after: number }>;

  /** 导出全部数据为 JSON 字符串 */
  exportData: () => string;
  /** 从 JSON 字符串导入数据（覆盖当前数据） */
  importData: (json: string) => void;
}

export const useHomeStore = create<HomeState>()(
  persist(
    (set, get) => ({
      ...cloneSeed(),

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

      compressExistingImages: async () => {
        const state = get();
        // 统计字节数（base64 长度近似）
        const byteLen = (s?: string) => (s ? Math.round(s.length * 0.75) : 0);
        let before = 0;
        let after = 0;

        // 收集所有 base64 图片，记录来源
        type Src =
          | { kind: "floor" }
          | { kind: "areaImage"; areaId: string; imageId: string }
          | { kind: "item"; areaId: string; itemId: string; field: "image" | "gallery" };
        const tasks: { src: Src; url: string; maxDim: number }[] = [];

        const collect = (url: string | undefined): string | null =>
          url && url.startsWith("data:image/") ? url : null;

        const fp = collect(state.floorPlanImage);
        if (fp) {
          before += byteLen(fp);
          tasks.push({ src: { kind: "floor" }, url: fp, maxDim: 2000 });
        }

        state.areas.forEach((a) => {
          a.images.forEach((img) => {
            const u = collect(img.url);
            if (u) {
              before += byteLen(u);
              tasks.push({
                src: { kind: "areaImage", areaId: a.id, imageId: img.id },
                url: u,
                maxDim: 1600,
              });
            }
          });
          a.items.forEach((it) => {
            const u = collect(it.image);
            if (u) {
              before += byteLen(u);
              tasks.push({
                src: { kind: "item", areaId: a.id, itemId: it.id, field: "image" },
                url: u,
                maxDim: 1200,
              });
            }
            (it.gallery ?? []).forEach((g) => {
              const gu = collect(g);
              if (gu) {
                before += byteLen(gu);
                tasks.push({
                  src: { kind: "item", areaId: a.id, itemId: it.id, field: "gallery" },
                  url: gu,
                  maxDim: 1200,
                });
              }
            });
          });
        });

        if (tasks.length === 0) return { before, after };

        // 并行压缩（最多 4 个并发，避免卡 UI）
        const results = new Map<number, string>();
        const CONCURRENCY = 4;
        let cursor = 0;
        const worker = async () => {
          while (cursor < tasks.length) {
            const i = cursor++;
            try {
              const out = await compressImage(tasks[i].url, tasks[i].maxDim, 0.82);
              // 只有真正变小才采用
              results.set(i, out.length < tasks[i].url.length ? out : tasks[i].url);
            } catch {
              results.set(i, tasks[i].url);
            }
          }
        };
        await Promise.all(
          Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, worker)
        );

        // 统计 after + 应用到状态
        let newFloorPlan = state.floorPlanImage;
        const areaMap = new Map<string, Area>();

        tasks.forEach((t, i) => {
          const out = results.get(i)!;
          after += byteLen(out);
          const s = t.src;
          if (s.kind === "floor") {
            newFloorPlan = out;
          } else if (s.kind === "areaImage") {
            const a = areaMap.get(s.areaId) ?? state.areas.find((x) => x.id === s.areaId)!;
            areaMap.set(s.areaId, {
              ...a,
              images: a.images.map((im) =>
                im.id === s.imageId ? { ...im, url: out } : im
              ),
            });
          } else {
            const a = areaMap.get(s.areaId) ?? state.areas.find((x) => x.id === s.areaId)!;
            areaMap.set(s.areaId, {
              ...a,
              items: a.items.map((it) =>
                it.id === s.itemId
                  ? s.field === "image"
                    ? { ...it, image: out }
                    : { ...it, gallery: (it.gallery ?? []).map((g) => (g === t.url ? out : g)) }
                  : it
              ),
            });
          }
        });

        set({
          floorPlanImage: newFloorPlan,
          areas: state.areas.map((a) => areaMap.get(a.id) ?? a),
        });

        return { before, after };
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
      storage: createJSONStorage(() => idbStorage),
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
    }
  )
);

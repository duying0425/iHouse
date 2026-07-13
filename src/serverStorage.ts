import type { StateStorage } from "zustand/middleware";
import { useAuthStore } from "@/authStore";

/**
 * 服务器优先的持久化存储（多房屋 + 鉴权版本）。
 *
 * - getItem: 先向服务器拉取当前房屋最新数据；服务器不可用时回退到本地 IndexedDB 缓存
 * - setItem: 立即写入本地缓存 + 防抖同步到服务器
 *
 * 服务器是数据源头（多设备共享），IndexedDB 仅作本地缓存与离线兜底。
 * 同一房屋内采用 last-write-wins，不做冲突合并。
 *
 * 切换房屋：通过 setHouseContext(newId) 改变后续 getItem/setItem 的目标房屋，
 * 然后 store.persist.rehydrate() 重新拉取数据。
 */

/* ===== 当前房屋上下文 ===== */
let currentHouseId: string | null = null;
// 标记：正在 reload 房屋数据期间，禁止 setItem 把 seed/空数据同步到服务器
let isReloading = false;

export function setHouseContext(houseId: string | null) {
  currentHouseId = houseId;
}

export function getCurrentHouseId() {
  return currentHouseId;
}

export function setReloading(v: boolean) {
  isReloading = v;
}

/** 带 token 的 fetch；token 缺失时仍发请求（让后端 401 拦截） */
function authedFetch(input: RequestInfo, init: RequestInit = {}) {
  const token = useAuthStore.getState().token;
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

/* ===== 本地 IndexedDB 缓存（按房屋隔离） ===== */
const idbCache = {
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
      return new Promise<string | null>((resolve) => {
        const tx = db.transaction("kv", "readonly");
        const req = tx.objectStore("kv").get(name);
        req.onsuccess = () => resolve((req.result as string) ?? null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  },
  async setItem(name: string, value: string): Promise<void> {
    try {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("kv", "readwrite");
        tx.objectStore("kv").put(value, name);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // 缓存写入失败不影响主流程
    }
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

/** 当前房屋的本地缓存 key */
function cacheKey(name: string): string {
  return currentHouseId ? `${name}-${currentHouseId}` : name;
}

/* ===== 防抖同步到服务器 ===== */
const SYNC_DEBOUNCE = 600;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let pendingValue: string | null = null;

function scheduleSync(value: string) {
  pendingValue = value;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void flushSync();
  }, SYNC_DEBOUNCE);
}

async function flushSync() {
  if (pendingValue == null) return;
  if (!currentHouseId) return;
  const value = pendingValue;
  try {
    const parsed = JSON.parse(value);
    const res = await authedFetch(`/api/houses/${currentHouseId}/data`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.state),
    });
    if (res.status === 401) {
      // 会话失效，触发重新登录
      const auth = useAuthStore.getState();
      if (auth.token) {
        await auth.logout();
      }
      return;
    }
    if (res.ok) {
      const data = await res.json();
      if (data && data.ok) {
        // 同步成功；后端可能清洗了 base64 → 物理文件 URL，
        // 但我们采用 last-write-wins，不主动拉取覆盖本地状态。
      }
    }
  } catch (e) {
    // 服务器不可用：数据已在本地缓存，下次在线时会再次尝试同步
    console.warn("[serverStorage] 同步到服务器失败，已保留本地缓存", e);
  }
}

// 页面隐藏时尽力同步最后一次变更
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && pendingValue && currentHouseId) {
      try {
        const parsed = JSON.parse(pendingValue);
        void authedFetch(`/api/houses/${currentHouseId}/data`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.state),
          keepalive: true,
        });
      } catch {
        // ignore
      }
    }
  });
}

/* ===== 对外暴露的 StateStorage ===== */
export const serverStorage: StateStorage = {
  async getItem(name) {
    if (!currentHouseId) {
      // 未选择房屋：返回 null，让 store 用 seed/demo 数据
      return null;
    }
    // 服务器优先
    try {
      const res = await authedFetch(`/api/houses/${currentHouseId}/data`);
      if (res.status === 401) {
        // 会话失效：让 authStore 处理
        return null;
      }
      if (res.ok) {
        const state = await res.json();
        if (state && state.areas !== undefined) {
          // 检测是否是 v1 格式（旧字段存在但 images 数组缺失）
          // v1: area 有 overviewImage/detailImage 字段，无 images 数组
          // v2: area 有 images 数组
          const isV1 = Array.isArray(state.areas) && state.areas.some(
            (a: { overviewImage?: unknown; detailImage?: unknown; images?: unknown[] }) =>
              (a.overviewImage || a.detailImage) && !Array.isArray(a.images)
          );
          const wrapped = JSON.stringify({ state, version: isV1 ? 1 : 2 });
          // 刷新本地缓存
          idbCache.setItem(cacheKey(name), wrapped);
          return wrapped;
        }
        // 房屋无数据：返回 null（store 会保留 seed 状态）
        return null;
      }
    } catch {
      // 服务器不可用，走本地缓存
    }
    return idbCache.getItem(cacheKey(name));
  },
  async setItem(name, value) {
    if (!currentHouseId) return;
    // reload 期间不写缓存也不同步（防止 seed 覆盖真实数据）
    if (isReloading) return;
    // 立即写本地缓存
    idbCache.setItem(cacheKey(name), value);
    // 防抖同步到服务器
    scheduleSync(value);
  },
  async removeItem(name) {
    if (!currentHouseId) return;
    idbCache.removeItem(cacheKey(name));
  },
};

import type { StateStorage } from "zustand/middleware";

/**
 * 服务器优先的持久化存储：
 * - getItem: 先向服务器拉取最新数据；服务器不可用时回退到本地 IndexedDB 缓存
 * - setItem: 立即写入本地 IndexedDB 缓存 + 防抖同步到服务器
 *
 * 服务器是数据源头（多设备共享），IndexedDB 仅作本地缓存与离线兜底。
 * 单用户场景，采用 last-write-wins，不做冲突合并。
 */

/* ===== 本地 IndexedDB 缓存（离线兜底） ===== */
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
  const value = pendingValue;
  try {
    const parsed = JSON.parse(value);
    const res = await fetch("/api/home", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.state),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.data) {
        const nextStateJson = JSON.stringify(data.data);
        const currentStateJson = JSON.stringify(parsed.state);
        if (nextStateJson !== currentStateJson) {
          const name = "home-atlas";
          const wrapped = JSON.stringify({ state: data.data, version: 2 });
          await idbCache.setItem(name, wrapped);
          
          const { useHomeStore } = await import("@/store");
          useHomeStore.setState(data.data);
        }
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
    if (document.visibilityState === "hidden" && pendingValue) {
      try {
        const parsed = JSON.parse(pendingValue);
        void fetch("/api/home", {
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
    // 服务器优先
    try {
      const res = await fetch("/api/home");
      if (res.ok) {
        const state = await res.json();
        if (state && state.areas !== undefined) {
          const wrapped = JSON.stringify({ state, version: 2 });
          // 刷新本地缓存
          idbCache.setItem(name, wrapped);
          return wrapped;
        }
      }
    } catch {
      // 服务器不可用，走本地缓存
    }
    return idbCache.getItem(name);
  },
  async setItem(name, value) {
    // 立即写本地缓存
    idbCache.setItem(name, value);
    // 防抖同步到服务器
    scheduleSync(value);
  },
  async removeItem(name) {
    idbCache.removeItem(name);
  },
};

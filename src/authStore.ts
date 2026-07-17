import { create } from "zustand";
import { setHouseContext } from "@/serverStorage";

/**
 * 账户认证状态。
 * Token 与当前房屋 ID 持久化到 localStorage；
 * 用户对象不持久化，启动时通过 GET /api/me 重新拉取（保证最新）。
 *
 * 切换房屋时同步调用 setHouseContext，让 serverStorage 知道后续请求路由到哪个房屋。
 * 真正的 store 重新水合由 App.tsx 监听 currentHouseId 触发。
 */

export interface AuthUser {
  id: number;
  username: string;
  displayName: string | null;
}

export interface MyHouse {
  id: string;
  name: string;
  shareCode: string;
  role: "admin" | "member";
  status: "pending" | "approved" | "rejected";
  joinedAt: string | null;
  updatedAt: string | null;
  membersCount?: number;
}

const TOKEN_KEY = "ihouse.token";
const HOUSE_KEY = "ihouse.currentHouseId";

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function readCurrentHouseId(): string | null {
  try {
    return localStorage.getItem(HOUSE_KEY);
  } catch {
    return null;
  }
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  houses: MyHouse[];
  currentHouseId: string | null;
  /** 已加载过 /api/me，用于路由守卫判断 */
  initialized: boolean;

  // 内部 setter
  setToken: (t: string | null) => void;
  setUser: (u: AuthUser | null) => void;
  setHouses: (h: MyHouse[]) => void;
  setCurrentHouseId: (id: string | null) => void;
  setInitialized: (v: boolean) => void;

  // 业务方法
  /** 拉取当前用户与房屋列表，返回是否仍处于已登录状态 */
  loadMe: () => Promise<boolean>;
  login: (username: string, password: string, turnstileToken?: string) => Promise<void>;
  register: (
    username: string,
    password: string,
    displayName?: string,
    turnstileToken?: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshHouses: () => Promise<void>;
  createHouse: (name: string) => Promise<MyHouse>;
  joinHouse: (shareCode: string) => Promise<{ houseId: string; houseName: string }>;
  switchHouse: (id: string) => void;
}

function authHeaders(token: string | null): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: readToken(),
  user: null,
  houses: [],
  currentHouseId: readCurrentHouseId(),
  initialized: false,

  setToken: (t) => {
    if (t) {
      try { localStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ }
    } else {
      try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    }
    set({ token: t });
  },
  setUser: (u) => set({ user: u }),
  setHouses: (h) => set({ houses: h }),
  setCurrentHouseId: (id) => {
    if (id) {
      try { localStorage.setItem(HOUSE_KEY, id); } catch { /* ignore */ }
    } else {
      try { localStorage.removeItem(HOUSE_KEY); } catch { /* ignore */ }
    }
    set({ currentHouseId: id });
  },
  setInitialized: (v) => set({ initialized: v }),

  loadMe: async () => {
    const token = get().token;
    if (!token) {
      set({ initialized: true, user: null, houses: [], currentHouseId: null });
      return false;
    }
    try {
      const res = await fetch("/api/me", { headers: authHeaders(token) });
      if (res.status === 401) {
        // token 失效
        get().setToken(null);
        set({ initialized: true, user: null, houses: [], currentHouseId: null });
        try { localStorage.removeItem(HOUSE_KEY); } catch { /* ignore */ }
        return false;
      }
      if (!res.ok) throw new Error("拉取用户信息失败");
      const data = await res.json();
      const houses: MyHouse[] = data.houses || [];
      // 选择默认房屋：保留之前的 currentHouseId（若仍有效），否则取第一个 approved
      let currentHouseId = get().currentHouseId;
      const stillValid = houses.find(
        (h) => h.id === currentHouseId && h.status === "approved"
      );
      if (!stillValid) {
        const firstApproved = houses.find((h) => h.status === "approved");
        currentHouseId = firstApproved?.id ?? null;
        if (currentHouseId) {
          try { localStorage.setItem(HOUSE_KEY, currentHouseId); } catch { /* ignore */ }
        } else {
          try { localStorage.removeItem(HOUSE_KEY); } catch { /* ignore */ }
        }
      }
      set({
        user: data.user,
        houses,
        currentHouseId,
        initialized: true,
      });
      setHouseContext(currentHouseId);
      return true;
    } catch {
      set({ initialized: true });
      return false;
    }
  },

  login: async (username, password, turnstileToken) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: authHeaders(null),
      body: JSON.stringify({ username, password, turnstileToken }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "登录失败");
    get().setToken(data.token);
    set({ user: data.user });
    await get().loadMe();
  },

  register: async (username, password, displayName, turnstileToken) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: authHeaders(null),
      body: JSON.stringify({ username, password, displayName, turnstileToken }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "注册失败");
    get().setToken(data.token);
    set({ user: data.user });
    await get().loadMe();
  },

  logout: async () => {
    const token = get().token;
    try {
      if (token) {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: authHeaders(token),
        });
      }
    } catch {
      /* ignore */
    }
    get().setToken(null);
    set({ user: null, houses: [], currentHouseId: null, initialized: true });
    try { localStorage.removeItem(HOUSE_KEY); } catch { /* ignore */ }
    setHouseContext(null);
  },

  refreshHouses: async () => {
    const token = get().token;
    if (!token) return;
    const res = await fetch("/api/houses", { headers: authHeaders(token) });
    if (!res.ok) return;
    const data = await res.json();
    set({ houses: data.houses || [] });
  },

  createHouse: async (name) => {
    const token = get().token;
    if (!token) throw new Error("未登录");
    const res = await fetch("/api/houses", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "创建房屋失败");
    await get().refreshHouses();
    // 自动切换到新建房屋
    get().switchHouse(data.house.id);
    return data.house;
  },

  joinHouse: async (shareCode) => {
    const token = get().token;
    if (!token) throw new Error("未登录");
    const res = await fetch("/api/houses/join", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ shareCode }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "申请加入失败");
    await get().refreshHouses();
    return { houseId: data.houseId, houseName: data.houseName };
  },

  switchHouse: (id) => {
    get().setCurrentHouseId(id);
    setHouseContext(id);
  },
}));

/**
 * 给所有需要鉴权的 fetch 请求附带 Authorization 头。
 * 如果 token 不存在，返回不带鉴权头的 HeadersInit（由后端 401 拦截）。
 */
export function authFetch(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
  const token = useAuthStore.getState().token;
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

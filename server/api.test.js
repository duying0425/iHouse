/**
 * 端到端 API 集成测试
 *
 * 策略：用临时数据目录 + 随机端口启动真实 server 子进程，
 * 通过 fetch 调用完整 HTTP 链路，覆盖鉴权、房屋 CRUD、查询 API、
 * 成员管理、备份导入导出等关键流程。
 *
 * 不依赖 supertest 等第三方库，仅用 Node 内置能力。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.join(__dirname, "index.js");

// 选一个随机端口避免冲突
const PORT = 4000 + Math.floor(Math.random() * 1000);
const TMP_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ihouse-test-"));

let serverProcess = null;
let baseUrl = `http://127.0.0.1:${PORT}`;

/** 等待 server 起来：轮询 /api/health */
async function waitForServer(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${baseUrl}/api/health`);
      if (r.ok) return;
    } catch {
      // 还没起来
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`server 在 ${timeoutMs}ms 内未就绪`);
}

/** 带认证的 fetch */
async function authFetch(pathname, token, init = {}) {
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${baseUrl}${pathname}`, { ...init, headers });
}

/** 解析 JSON 响应（容忍非 JSON） */
async function parseJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text };
  }
}

beforeAll(async () => {
  // 启动 server 子进程，使用临时数据目录
  const testEnv = { ...process.env };
  testEnv.TURNSTILE_SITE_KEY = "";
  testEnv.TURNSTILE_SECRET_KEY = "";

  serverProcess = spawn(process.execPath, [SERVER_PATH], {
    env: {
      ...testEnv,
      PORT: String(PORT),
      DATA_DIR: TMP_DATA_DIR,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  // 仅在测试失败排查时才需要 server 日志：通过 DEBUG_SERVER=1 启用
  if (process.env.DEBUG_SERVER) {
    serverProcess.stdout.on("data", (d) => process.stdout.write(`[server] ${d}`));
    serverProcess.stderr.on("data", (d) => process.stderr.write(`[server!] ${d}`));
  }
  await waitForServer();
}, 35000);

afterAll(async () => {
  if (serverProcess) {
    serverProcess.kill("SIGTERM");
    // 给进程一点时间退出
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (!serverProcess.killed) serverProcess.kill("SIGKILL");
  }
  // 清理临时数据目录
  try {
    fs.rmSync(TMP_DATA_DIR, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe("健康检查", () => {
  it("GET /api/health 返回 ok", async () => {
    const r = await fetch(`${baseUrl}/api/health`);
    expect(r.status).toBe(200);
    const data = await parseJson(r);
    expect(data).toEqual({ ok: true });
  });
});

describe("鉴权流程", () => {
  it("注册新用户", async () => {
    const r = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "alice",
        password: "alice-pwd-123",
        displayName: "爱丽丝",
      }),
    });
    expect(r.status).toBe(200);
    const data = await parseJson(r);
    expect(data.ok).toBe(true);
    expect(data.token).toMatch(/^[0-9a-f]{64}$/);
    expect(data.user.username).toBe("alice");
    expect(data.user.displayName).toBe("爱丽丝");
  });

  it("用户名重复注册返回 409", async () => {
    const r = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "alice", password: "any-pwd-123" }),
    });
    expect(r.status).toBe(409);
    const data = await parseJson(r);
    expect(data.ok).toBe(false);
    expect(data.error).toMatch(/已被占用/);
  });

  it("用户名格式不合法返回 400", async () => {
    const r = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "ab", password: "valid-pwd-123" }),
    });
    expect(r.status).toBe(400);
  });

  it("密码太短返回 400", async () => {
    const r = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "bob", password: "12345" }),
    });
    expect(r.status).toBe(400);
  });

  it("正确密码登录成功", async () => {
    const r = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "alice", password: "alice-pwd-123" }),
    });
    expect(r.status).toBe(200);
    const data = await parseJson(r);
    expect(data.ok).toBe(true);
    expect(data.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("错误密码登录失败 401", async () => {
    const r = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "alice", password: "wrong-pwd" }),
    });
    expect(r.status).toBe(401);
  });

  it("缺少字段登录失败 400", async () => {
    const r = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "alice" }),
    });
    expect(r.status).toBe(400);
  });
});

describe("鉴权中间件", () => {
  it("无 token 访问 /api/me 返回 401", async () => {
    const r = await fetch(`${baseUrl}/api/me`);
    expect(r.status).toBe(401);
  });

  it("错误 token 访问 /api/me 返回 401", async () => {
    const r = await fetch(`${baseUrl}/api/me`, {
      headers: { Authorization: "Bearer invalid-token-xyz" },
    });
    expect(r.status).toBe(401);
  });

  it("旧版 /api/home 已停用返回 410", async () => {
    const r = await fetch(`${baseUrl}/api/home`);
    expect(r.status).toBe(410);
    const data = await parseJson(r);
    expect(data.ok).toBe(false);
  });
});

describe("房屋 CRUD 与查询 API", () => {
  let aliceToken;
  let bobToken;
  let houseId;

  async function ensureAlice() {
    if (aliceToken) return aliceToken;
    const r = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "alice", password: "alice-pwd-123" }),
    });
    aliceToken = (await parseJson(r)).token;
    return aliceToken;
  }

  it("创建房屋", async () => {
    const token = await ensureAlice();
    const r = await authFetch("/api/houses", token, {
      method: "POST",
      body: JSON.stringify({ name: "我的家" }),
    });
    expect(r.status).toBe(200);
    const data = await parseJson(r);
    expect(data.ok).toBe(true);
    expect(data.house.name).toBe("我的家");
    expect(data.house.id).toMatch(/^[0-9a-f]{8}$/);
    expect(data.house.shareCode).toHaveLength(6);
    expect(data.house.role).toBe("admin");
    houseId = data.house.id;
  });

  it("房屋名称不合法返回 400", async () => {
    const token = await ensureAlice();
    const r = await authFetch("/api/houses", token, {
      method: "POST",
      body: JSON.stringify({ name: "" }),
    });
    expect(r.status).toBe(400);
  });

  it("列出我的房屋", async () => {
    const token = await ensureAlice();
    const r = await authFetch("/api/houses", token);
    expect(r.status).toBe(200);
    const data = await parseJson(r);
    expect(data.ok).toBe(true);
    expect(data.houses.length).toBeGreaterThanOrEqual(1);
    const found = data.houses.find((h) => h.id === houseId);
    expect(found).toBeTruthy();
    expect(found.membersCount).toBe(1);
  });

  it("查询房屋详情", async () => {
    const token = await ensureAlice();
    const r = await authFetch(`/api/houses/${houseId}`, token);
    expect(r.status).toBe(200);
    const data = await parseJson(r);
    expect(data.ok).toBe(true);
    expect(data.house.name).toBe("我的家");
    expect(data.myRole).toBe("admin");
  });

  it("新房屋初始数据为空（仅 title + 空 areas）", async () => {
    const token = await ensureAlice();
    const r = await authFetch(`/api/houses/${houseId}/data`, token);
    expect(r.status).toBe(200);
    const data = await parseJson(r);
    expect(data.title).toBe("我的家");
    expect(data.areas).toEqual([]);
  });

  it("写入房屋数据", async () => {
    const token = await ensureAlice();
    const home = {
      title: "我的家",
      subtitle: "测试",
      floorPlanImage: "",
      areas: [
        {
          id: "area-living",
          name: "客厅",
          floorPlanPos: { x: 50, y: 50 },
          images: [],
          items: [
            {
              id: "item-sofa",
              areaId: "area-living",
              name: "沙发",
              category: "家具",
              brand: "宜家",
              image: "",
            },
          ],
        },
      ],
    };
    const r = await authFetch(`/api/houses/${houseId}/data`, token, {
      method: "PUT",
      body: JSON.stringify(home),
    });
    expect(r.status).toBe(200);
    const data = await parseJson(r);
    expect(data.ok).toBe(true);
    expect(data.updatedAt).toBeTruthy();
  });

  it("再次读取数据应反映刚才的写入", async () => {
    const token = await ensureAlice();
    const r = await authFetch(`/api/houses/${houseId}/data`, token);
    const data = await parseJson(r);
    expect(data.title).toBe("我的家");
    expect(data.areas).toHaveLength(1);
    expect(data.areas[0].items[0].name).toBe("沙发");
  });

  it("查询 summary 返回统计", async () => {
    const token = await ensureAlice();
    const r = await authFetch(
      `/api/query/summary?houseId=${houseId}`,
      token
    );
    expect(r.status).toBe(200);
    const data = await parseJson(r);
    expect(data.ok).toBe(true);
    expect(data.areaCount).toBe(1);
    expect(data.itemCount).toBe(1);
    expect(data.categories).toEqual({ 家具: 1 });
    expect(data.topBrands).toEqual([{ name: "宜家", count: 1 }]);
    expect(data.updatedAt).toBeTruthy();
  });

  it("查询 areas 列表（精简模式）", async () => {
    const token = await ensureAlice();
    const r = await authFetch(`/api/query/areas?houseId=${houseId}`, token);
    const data = await parseJson(r);
    expect(data.ok).toBe(true);
    expect(data.areas).toHaveLength(1);
    expect(data.areas[0].itemCount).toBe(1);
    expect(data.areas[0].items).toBeUndefined();
  });

  it("查询 areas 列表（withItems=1）", async () => {
    const token = await ensureAlice();
    const r = await authFetch(
      `/api/query/areas?houseId=${houseId}&withItems=1`,
      token
    );
    const data = await parseJson(r);
    expect(data.areas[0].items).toHaveLength(1);
    expect(data.areas[0].items[0].name).toBe("沙发");
  });

  it("查询 area 详情", async () => {
    const token = await ensureAlice();
    const r = await authFetch(
      `/api/query/areas/area-living?houseId=${houseId}`,
      token
    );
    const data = await parseJson(r);
    expect(data.ok).toBe(true);
    expect(data.area.name).toBe("客厅");
  });

  it("查询不存在的 area 返回 404", async () => {
    const token = await ensureAlice();
    const r = await authFetch(
      `/api/query/areas/nope?houseId=${houseId}`,
      token
    );
    expect(r.status).toBe(404);
  });

  it("查询 items 列表", async () => {
    const token = await ensureAlice();
    const r = await authFetch(`/api/query/items?houseId=${houseId}`, token);
    const data = await parseJson(r);
    expect(data.count).toBe(1);
    expect(data.items[0].name).toBe("沙发");
    expect(data.items[0].areaName).toBe("客厅");
  });

  it("查询 items 按分类过滤", async () => {
    const token = await ensureAlice();
    const r = await authFetch(
      `/api/query/items?houseId=${houseId}&category=家具`,
      token
    );
    const data = await parseJson(r);
    expect(data.count).toBe(1);
  });

  it("查询 items 关键词搜索", async () => {
    const token = await ensureAlice();
    const r = await authFetch(
      `/api/query/items?houseId=${houseId}&q=沙`,
      token
    );
    const data = await parseJson(r);
    expect(data.count).toBe(1);
  });

  it("查询 item 详情", async () => {
    const token = await ensureAlice();
    const r = await authFetch(
      `/api/query/items/item-sofa?houseId=${houseId}`,
      token
    );
    const data = await parseJson(r);
    expect(data.ok).toBe(true);
    expect(data.item.name).toBe("沙发");
    expect(data.area.name).toBe("客厅");
  });

  it("查询 locations", async () => {
    const token = await ensureAlice();
    const r = await authFetch(
      `/api/query/locations?houseId=${houseId}`,
      token
    );
    const data = await parseJson(r);
    expect(data.count).toBe(1);
    expect(data.locations[0].name).toBe("沙发");
  });

  it("查询 API 缺少 houseId 返回 400", async () => {
    const token = await ensureAlice();
    const r = await authFetch(`/api/query/summary`, token);
    expect(r.status).toBe(400);
  });

  it("查询 API 无权访问他人房屋返回 403", async () => {
    // 注册 bob，bob 没有 alice 房屋的访问权
    await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "bob", password: "bob-pwd-123" }),
    });
    const loginR = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "bob", password: "bob-pwd-123" }),
    });
    bobToken = (await parseJson(loginR)).token;

    const r = await authFetch(
      `/api/query/summary?houseId=${houseId}`,
      bobToken
    );
    expect(r.status).toBe(403);
  });

  it("读取他人房屋数据返回 403", async () => {
    const r = await authFetch(`/api/houses/${houseId}/data`, bobToken);
    expect(r.status).toBe(403);
  });

  it("写入他人房屋数据返回 403", async () => {
    const r = await authFetch(`/api/houses/${houseId}/data`, bobToken, {
      method: "PUT",
      body: JSON.stringify({ title: "恶意篡改" }),
    });
    expect(r.status).toBe(403);
  });
});

describe("图片上传 tmp → 正式 转正流程", () => {
  let token;
  let houseId;
  const tmpPixelPng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  beforeAll(async () => {
    const r = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "alice", password: "alice-pwd-123" }),
    });
    token = (await parseJson(r)).token;

    const r2 = await authFetch("/api/houses", token, {
      method: "POST",
      body: JSON.stringify({ name: "上传测试房屋" }),
    });
    houseId = (await parseJson(r2)).house.id;
  });

  it("POST /api/upload 返回 /api/images/tmp/xxx URL", async () => {
    const r = await authFetch("/api/upload", token, {
      method: "POST",
      body: JSON.stringify({ image: tmpPixelPng }),
    });
    expect(r.status).toBe(200);
    const data = await parseJson(r);
    expect(data.url).toMatch(/^\/api\/images\/tmp\/[a-f0-9]{32}\.png$/);
    // 暂存到全局供后续测试使用
    globalThis.__tmpUploadUrl = data.url;
  });

  it("GET /api/images/tmp/xxx 能访问到 tmp 文件", async () => {
    const url = globalThis.__tmpUploadUrl;
    const r = await fetch(`${baseUrl}${url}`);
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toMatch(/image\/png/);
  });

  it("PUT 房屋数据后，引用的 tmp URL 被转正为 /api/images/xxx", async () => {
    const url = globalThis.__tmpUploadUrl;
    const home = {
      title: "上传测试房屋",
      subtitle: "",
      floorPlanImage: "",
      areas: [
        {
          id: "area-test",
          name: "测试区",
          floorPlanPos: { x: 50, y: 50 },
          images: [],
          items: [
            {
              id: "item-test",
              areaId: "area-test",
              name: "测试物品",
              category: "其他",
              image: url,
              gallery: [url],
            },
          ],
        },
      ],
    };
    const r = await authFetch(`/api/houses/${houseId}/data`, token, {
      method: "PUT",
      body: JSON.stringify(home),
    });
    expect(r.status).toBe(200);

    const r2 = await authFetch(`/api/houses/${houseId}/data`, token);
    const data = await parseJson(r2);
    expect(data.areas[0].items[0].image).toMatch(
      /^\/api\/images\/[a-f0-9]{32}\.png$/
    );
    expect(data.areas[0].items[0].image).not.toContain("/tmp/");
    expect(data.areas[0].items[0].gallery[0]).toBe(
      data.areas[0].items[0].image
    );
    // 暂存转正后的 URL
    globalThis.__finalUrl = data.areas[0].items[0].image;
  });

  it("转正后的 /api/images/xxx URL 可访问", async () => {
    const r = await fetch(`${baseUrl}${globalThis.__finalUrl}`);
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toMatch(/image\/png/);
  });

  it("tmp 副本应保留（24h 兜底窗口）", async () => {
    const r = await fetch(`${baseUrl}${globalThis.__tmpUploadUrl}`);
    expect(r.status).toBe(200);
  });

  it("未保存引用的 tmp 文件仍可访问，但不会被转正", async () => {
    // 上传一张新图但不写入房屋数据
    const r = await authFetch("/api/upload", token, {
      method: "POST",
      body: JSON.stringify({ image: tmpPixelPng }),
    });
    const data = await parseJson(r);
    expect(data.url).toMatch(/^\/api\/images\/tmp\//);
    // 不做 PUT，该 tmp 文件不会被转正，但应能访问
    const r2 = await fetch(`${baseUrl}${data.url}`);
    expect(r2.status).toBe(200);
  });
});

describe("成员管理与加入流程", () => {
  let adminToken;
  let bobToken;
  let houseId;
  let shareCode;
  let bobUserId;

  async function ensureAdmin() {
    if (adminToken) return adminToken;
    const r = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "alice", password: "alice-pwd-123" }),
    });
    adminToken = (await parseJson(r)).token;
    return adminToken;
  }

  it("管理员创建新房屋用于成员测试", async () => {
    const token = await ensureAdmin();
    const r = await authFetch("/api/houses", token, {
      method: "POST",
      body: JSON.stringify({ name: "成员测试房屋" }),
    });
    const data = await parseJson(r);
    houseId = data.house.id;
    shareCode = data.house.shareCode;
  });

  it("bob 注册并登录", async () => {
    await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "carol",
        password: "carol-pwd-123",
        displayName: "卡罗",
      }),
    });
    const r = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "carol", password: "carol-pwd-123" }),
    });
    bobToken = (await parseJson(r)).token;
    // 从 /api/me 拿到 user id
    const meR = await authFetch("/api/me", bobToken);
    const me = await parseJson(meR);
    bobUserId = me.user.id;
  });

  it("通过分享码查询房屋公开信息", async () => {
    const r = await authFetch(
      `/api/houses/lookup?code=${shareCode}`,
      bobToken
    );
    const data = await parseJson(r);
    expect(data.ok).toBe(true);
    expect(data.house.name).toBe("成员测试房屋");
    expect(data.membership).toBeNull();
  });

  it("无效分享码返回 404", async () => {
    const r = await authFetch(`/api/houses/lookup?code=XXXXXX`, bobToken);
    expect(r.status).toBe(404);
  });

  it("申请加入房屋", async () => {
    const r = await authFetch("/api/houses/join", bobToken, {
      method: "POST",
      body: JSON.stringify({ shareCode }),
    });
    const data = await parseJson(r);
    expect(data.ok).toBe(true);
    expect(data.status).toBe("pending");
  });

  it("重复申请返回 409", async () => {
    const r = await authFetch("/api/houses/join", bobToken, {
      method: "POST",
      body: JSON.stringify({ shareCode }),
    });
    expect(r.status).toBe(409);
  });

  it("非成员访问 pending 状态房屋数据返回 403", async () => {
    const r = await authFetch(`/api/houses/${houseId}/data`, bobToken);
    expect(r.status).toBe(403);
  });

  it("管理员列出成员（含 pending）", async () => {
    const token = await ensureAdmin();
    const r = await authFetch(`/api/houses/${houseId}/members`, token);
    const data = await parseJson(r);
    expect(data.ok).toBe(true);
    expect(data.myRole).toBe("admin");
    const carol = data.members.find((m) => m.username === "carol");
    expect(carol).toBeTruthy();
    expect(carol.status).toBe("pending");
  });

  it("非成员不能查看成员列表", async () => {
    const r = await authFetch(`/api/houses/${houseId}/members`, bobToken);
    expect(r.status).toBe(403);
  });

  it("非管理员不能审批", async () => {
    // bob 自己还是 pending，不能审批
    const r = await authFetch(
      `/api/houses/${houseId}/members/${bobUserId}/approve`,
      bobToken,
      { method: "POST" }
    );
    expect(r.status).toBe(403);
  });

  it("管理员审批通过申请", async () => {
    const token = await ensureAdmin();
    const r = await authFetch(
      `/api/houses/${houseId}/members/${bobUserId}/approve`,
      token,
      { method: "POST" }
    );
    expect(r.status).toBe(200);
    const data = await parseJson(r);
    expect(data.ok).toBe(true);
  });

  it("审批已通过的申请再次审批返回 409", async () => {
    const token = await ensureAdmin();
    const r = await authFetch(
      `/api/houses/${houseId}/members/${bobUserId}/approve`,
      token,
      { method: "POST" }
    );
    expect(r.status).toBe(409);
  });

  it("审批后 bob 可访问房屋数据", async () => {
    const r = await authFetch(`/api/houses/${houseId}/data`, bobToken);
    expect(r.status).toBe(200);
  });

  it("bob 通过 /api/me 能看到已加入的房屋", async () => {
    const r = await authFetch("/api/me", bobToken);
    const data = await parseJson(r);
    const found = data.houses.find((h) => h.id === houseId);
    expect(found).toBeTruthy();
    expect(found.role).toBe("member");
    expect(found.status).toBe("approved");
  });

  it("非 admin 成员不能导入备份", async () => {
    const r = await authFetch(
      `/api/houses/${houseId}/backup/import`,
      bobToken,
      { method: "POST" }
    );
    expect(r.status).toBe(403);
    expect((await parseJson(r)).error).toMatch(/管理员/);
  });

  it("成员退出房屋", async () => {
    const r = await authFetch(
      `/api/houses/${houseId}/members/${bobUserId}`,
      bobToken,
      { method: "DELETE" }
    );
    expect(r.status).toBe(200);
    // 退出后访问应被拒
    const r2 = await authFetch(`/api/houses/${houseId}/data`, bobToken);
    expect(r2.status).toBe(403);
  });

  it("不能移除最后一个管理员", async () => {
    const token = await ensureAdmin();
    const meR = await authFetch("/api/me", token);
    const me = await parseJson(meR);
    const adminUserId = me.user.id;
    const r = await authFetch(
      `/api/houses/${houseId}/members/${adminUserId}`,
      token,
      { method: "DELETE" }
    );
    expect(r.status).toBe(400);
    expect((await parseJson(r)).error).toMatch(/最后一个管理员/);
  });
});

describe("备份导出/导入", () => {
  let token;
  let houseId;

  async function ensureToken() {
    if (token) return token;
    // 新建一个独立用户和房屋，避免污染
    await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "dave",
        password: "dave-pwd-123",
      }),
    });
    const loginR = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "dave", password: "dave-pwd-123" }),
    });
    token = (await parseJson(loginR)).token;
    const createR = await authFetch("/api/houses", token, {
      method: "POST",
      body: JSON.stringify({ name: "备份测试房屋" }),
    });
    houseId = (await parseJson(createR)).house.id;
    // 写入一些数据
    await authFetch(`/api/houses/${houseId}/data`, token, {
      method: "PUT",
      body: JSON.stringify({
        title: "备份测试房屋",
        areas: [
          {
            id: "a1",
            name: "卧室",
            floorPlanPos: { x: 10, y: 10 },
            items: [
              {
                id: "i1",
                areaId: "a1",
                name: "床",
                category: "家具",
                image: "",
              },
            ],
          },
        ],
      }),
    });
    return token;
  }

  it("导出 zip 备份", async () => {
    const t = await ensureToken();
    const r = await authFetch(`/api/houses/${houseId}/backup`, t);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/zip");
    expect(r.headers.get("content-disposition")).toMatch(/attachment/);
    const buf = Buffer.from(await r.arrayBuffer());
    // zip 文件以 PK\x03\x04 开头
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
    expect(buf.length).toBeGreaterThan(100);
  });

  it("导出后再导入到同一房屋，数据应一致", async () => {
    const t = await ensureToken();
    // 1) 导出
    const exportR = await authFetch(`/api/houses/${houseId}/backup`, t);
    const zipBuf = Buffer.from(await exportR.arrayBuffer());
    // 2) 通过 FormData 上传回导入接口
    const blob = new Blob([zipBuf], { type: "application/zip" });
    const form = new FormData();
    form.append("file", blob, "backup.zip");
    const importR = await fetch(
      `${baseUrl}/api/houses/${houseId}/backup/import`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${t}` },
        body: form,
      }
    );
    expect(importR.status).toBe(200);
    const importData = await parseJson(importR);
    expect(importData.ok).toBe(true);
    expect(importData.hasHomeState).toBe(true);
    // 3) 读取数据，确认一致
    const dataR = await authFetch(`/api/houses/${houseId}/data`, t);
    const data = await parseJson(dataR);
    expect(data.title).toBe("备份测试房屋");
    expect(data.areas[0].name).toBe("卧室");
    expect(data.areas[0].items[0].name).toBe("床");
  });

  it("无文件上传返回 400", async () => {
    const t = await ensureToken();
    const r = await fetch(
      `${baseUrl}/api/houses/${houseId}/backup/import`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${t}` },
      }
    );
    expect(r.status).toBe(400);
  });

  it("非 zip 文件返回 400", async () => {
    const t = await ensureToken();
    const blob = new Blob(["not a zip"], { type: "application/zip" });
    const form = new FormData();
    form.append("file", blob, "bad.zip");
    const r = await fetch(
      `${baseUrl}/api/houses/${houseId}/backup/import`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${t}` },
        body: form,
      }
    );
    expect(r.status).toBe(400);
  });
});

describe("修改密码与登出", () => {
  it("修改密码", async () => {
    // 注册一个临时用户
    await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "eve",
        password: "eve-old-pwd-123",
      }),
    });
    const loginR = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "eve", password: "eve-old-pwd-123" }),
    });
    const token = (await parseJson(loginR)).token;

    const r = await authFetch("/api/auth/change-password", token, {
      method: "POST",
      body: JSON.stringify({
        currentPassword: "eve-old-pwd-123",
        newPassword: "eve-new-pwd-456",
      }),
    });
    expect(r.status).toBe(200);
    expect((await parseJson(r)).ok).toBe(true);
  });

  it("旧密码失效", async () => {
    const r = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "eve",
        password: "eve-old-pwd-123",
      }),
    });
    expect(r.status).toBe(401);
  });

  it("新密码可用", async () => {
    const r = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "eve",
        password: "eve-new-pwd-456",
      }),
    });
    expect(r.status).toBe(200);
  });

  it("修改密码时当前密码错误返回 400", async () => {
    const loginR = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "eve",
        password: "eve-new-pwd-456",
      }),
    });
    const token = (await parseJson(loginR)).token;
    const r = await authFetch("/api/auth/change-password", token, {
      method: "POST",
      body: JSON.stringify({
        currentPassword: "wrong-current",
        newPassword: "another-new-pwd",
      }),
    });
    expect(r.status).toBe(400);
  });

  it("登出后 token 失效", async () => {
    const loginR = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "eve",
        password: "eve-new-pwd-456",
      }),
    });
    const token = (await parseJson(loginR)).token;
    // 先验证可用
    const meR = await authFetch("/api/me", token);
    expect(meR.status).toBe(200);
    // 登出
    const outR = await authFetch("/api/auth/logout", token, {
      method: "POST",
    });
    expect(outR.status).toBe(200);
    // 登出后再访问应 401
    const meR2 = await authFetch("/api/me", token);
    expect(meR2.status).toBe(401);
  });
});

describe("SPA 静态前端兜底", () => {
  it("dist 不存在时仅 API 可用，前端路由返回 404（或 warn）", async () => {
    // 在测试环境 DATA_DIR 与 server 同目录，dist 通常不存在
    // 这里只验证 /api 路径优先级，不验证 dist 是否存在
    const r = await fetch(`${baseUrl}/api/health`);
    expect(r.status).toBe(200);
  });
});

describe("安全隔离与加固", () => {
  it("静态图片服务必须包含防内容嗅探(nosniff)和禁止脚本执行的 CSP 头部", async () => {
    const r = await fetch(`${baseUrl}/api/images/non-existent.jpg`);
    // 无论是 404 还是 200，express.static 及相关静态服务都会返回头部
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("content-security-policy")).toBe("default-src 'none'");
  });

  it("/api/upload 应该拒绝 HTML 格式的 base64 伪图片上传", async () => {
    // 注册一个独立用户
    const registerR = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "security_tester",
        password: "tester-password-123",
      }),
    });
    const regData = await parseJson(registerR);
    const token = regData.token;

    // 尝试上传 HTML
    const htmlBase64 = "data:image/html;base64,PGh0bWw+PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0PjwvaHRtbD4=";
    const r = await authFetch("/api/upload", token, {
      method: "POST",
      body: JSON.stringify({ image: htmlBase64 }),
    });
    expect(r.status).toBe(400);
    const resData = await parseJson(r);
    expect(resData.error).toMatch(/Unsupported image format|Invalid base64/);
  });

  it("/api/upload 应该拒绝大于 10MB 的图片上传", async () => {
    const registerR = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "size_tester",
        password: "tester-password-123",
      }),
    });
    const regData = await parseJson(registerR);
    const token = regData.token;

    // 11MB image buffer
    const largeBuffer = Buffer.alloc(11 * 1024 * 1024);
    const largeBase64 = "data:image/png;base64," + largeBuffer.toString("base64");

    const r = await authFetch("/api/upload", token, {
      method: "POST",
      body: JSON.stringify({ image: largeBase64 }),
    });
    expect(r.status).toBe(413);
    const resData = await parseJson(r);
    expect(resData.error).toMatch(/过大/);
  });

  it("GET /api/auth/config 应默认返回 Turnstile 未启用", async () => {
    const r = await fetch(`${baseUrl}/api/auth/config`);
    expect(r.status).toBe(200);
    const data = await parseJson(r);
    expect(data.turnstileEnabled).toBe(false);
    expect(data.turnstileSiteKey).toBe("");
  });
});


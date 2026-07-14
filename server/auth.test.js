import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  hashPassword,
  verifyPassword,
  generateToken,
  tokenExpiry,
  generateShareCode,
  generateHouseId,
  createAuthMiddleware,
  isValidUsername,
  isValidPassword,
} from "./auth.js";

describe("hashPassword / verifyPassword", () => {
  it("hashPassword 返回 saltHex:hashHex 格式", () => {
    const stored = hashPassword("hunter222");
    expect(stored).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    const [salt, hash] = stored.split(":");
    expect(salt.length).toBe(32); // 16 字节盐 = 32 hex
    expect(hash.length).toBe(128); // 64 字节哈希 = 128 hex
  });

  it("同密码两次哈希结果不同（盐随机）", () => {
    const a = hashPassword("same-password");
    const b = hashPassword("same-password");
    expect(a).not.toBe(b);
  });

  it("verifyPassword 正确密码返回 true", () => {
    const stored = hashPassword("correct-pwd-123");
    expect(verifyPassword("correct-pwd-123", stored)).toBe(true);
  });

  it("verifyPassword 错误密码返回 false", () => {
    const stored = hashPassword("correct-pwd-123");
    expect(verifyPassword("wrong-pwd", stored)).toBe(false);
  });

  it("verifyPassword 对空/非法存储格式返回 false", () => {
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("x", null)).toBe(false);
    expect(verifyPassword("x", undefined)).toBe(false);
    expect(verifyPassword("x", "not-a-valid-format")).toBe(false);
    expect(verifyPassword("x", "abc")).toBe(false);
    expect(verifyPassword("x", "abc:def:ghi")).toBe(false);
  });

  it("verifyPassword 对非法 hex 字符串不抛错", () => {
    expect(verifyPassword("x", "zzzz:yyyy")).toBe(false);
  });

  it("支持中文与符号密码", () => {
    const pwd = "密码@#$%^&*!中文";
    const stored = hashPassword(pwd);
    expect(verifyPassword(pwd, stored)).toBe(true);
    expect(verifyPassword("其他密码", stored)).toBe(false);
  });
});

describe("generateToken", () => {
  it("返回 64 位 hex 字符串（32 字节）", () => {
    const t = generateToken();
    expect(t).toMatch(/^[0-9a-f]{64}$/);
  });

  it("两次生成的 token 不同", () => {
    expect(generateToken()).not.toBe(generateToken());
  });
});

describe("tokenExpiry", () => {
  it("返回 ISO 字符串，约为当前时间 +7 天", () => {
    const before = Date.now();
    const expiry = tokenExpiry();
    const after = Date.now();
    const expiryMs = new Date(expiry).getTime();
    expect(typeof expiry).toBe("string");
    // 7 天 = 7*24*3600*1000 ms
    const sevenDays = 7 * 24 * 3600 * 1000;
    expect(expiryMs).toBeGreaterThanOrEqual(before + sevenDays - 1000);
    expect(expiryMs).toBeLessThanOrEqual(after + sevenDays + 1000);
  });
});

describe("generateShareCode", () => {
  it("返回 6 位字符", () => {
    const code = generateShareCode();
    expect(code).toHaveLength(6);
  });

  it("仅使用去混淆字符集（无 I/O/0/1）", () => {
    const allowed = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (let i = 0; i < 50; i++) {
      const code = generateShareCode();
      for (const ch of code) {
        expect(allowed).toContain(ch);
      }
    }
  });

  it("两次生成大概率不同", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateShareCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe("generateHouseId", () => {
  it("返回 8 位小写 hex", () => {
    const id = generateHouseId();
    expect(id).toMatch(/^[0-9a-f]{8}$/);
  });

  it("两次生成不同", () => {
    expect(generateHouseId()).not.toBe(generateHouseId());
  });
});

describe("isValidUsername", () => {
  it("接受合法用户名（字母、数字、下划线、中文，3-32 字符）", () => {
    expect(isValidUsername("admin")).toBe(true);
    expect(isValidUsername("user_01")).toBe(true);
    expect(isValidUsername("张三丰")).toBe(true);
    expect(isValidUsername("abc123_中文")).toBe(true);
    expect(isValidUsername("a".repeat(32))).toBe(true);
  });

  it("拒绝太短（<3 字符）", () => {
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("")).toBe(false);
    expect(isValidUsername("张三")).toBe(false); // 中文 2 字也不够
  });

  it("拒绝太长（>32 字符）", () => {
    expect(isValidUsername("a".repeat(33))).toBe(false);
  });

  it("拒绝非字符串", () => {
    expect(isValidUsername(null)).toBe(false);
    expect(isValidUsername(undefined)).toBe(false);
    expect(isValidUsername(123)).toBe(false);
    expect(isValidUsername({})).toBe(false);
  });

  it("拒绝特殊字符（仅允许字母数字下划线中文）", () => {
    expect(isValidUsername("ab-cd")).toBe(false);
    expect(isValidUsername("ab@cd")).toBe(false);
    expect(isValidUsername("ab.cd")).toBe(false);
    expect(isValidUsername("ab cd")).toBe(false);
  });
});

describe("isValidPassword", () => {
  it("接受 6-128 位密码", () => {
    expect(isValidPassword("123456")).toBe(true);
    expect(isValidPassword("a".repeat(128))).toBe(true);
    expect(isValidPassword("密码@123")).toBe(true);
  });

  it("拒绝 <6 位", () => {
    expect(isValidPassword("12345")).toBe(false);
    expect(isValidPassword("")).toBe(false);
  });

  it("拒绝 >128 位", () => {
    expect(isValidPassword("a".repeat(129))).toBe(false);
  });

  it("拒绝非字符串", () => {
    expect(isValidPassword(null)).toBe(false);
    expect(isValidPassword(undefined)).toBe(false);
    expect(isValidPassword(123456)).toBe(false);
  });
});

describe("createAuthMiddleware", () => {
  // 创建 mock db：db.prepare(sql) 返回 statement 对象，含 .get() 和 .run() 方法
  function makeMockDb({ tokenRow = null } = {}) {
    const calls = { deleteCalls: 0, getCalls: 0 };
    const statement = {
      get: vi.fn(() => {
        calls.getCalls++;
        return tokenRow;
      }),
      run: vi.fn(() => {
        calls.deleteCalls++;
        return {};
      }),
    };
    const db = {
      prepare: vi.fn(() => statement),
      _statement: statement,
      _calls: calls,
    };
    return db;
  }

  function makeRes() {
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };
    return res;
  }

  it("无 Authorization 头返回 401", () => {
    const db = makeMockDb();
    const middleware = createAuthMiddleware(db);
    const req = { headers: {} };
    const res = makeRes();
    const next = vi.fn();
    middleware(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/未登录/);
    expect(next).not.toHaveBeenCalled();
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("Authorization 头格式不对（无 Bearer 前缀）返回 401", () => {
    const db = makeMockDb();
    const middleware = createAuthMiddleware(db);
    const req = { headers: { authorization: "Basic abc" } };
    const res = makeRes();
    const next = vi.fn();
    middleware(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("token 在数据库中不存在返回 401", () => {
    const db = makeMockDb({ tokenRow: null });
    const middleware = createAuthMiddleware(db);
    const req = { headers: { authorization: "Bearer nonexistent" } };
    const res = makeRes();
    const next = vi.fn();
    middleware(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/会话不存在/);
    expect(db._calls.getCalls).toBe(1);
    expect(db._calls.deleteCalls).toBe(0);
    expect(next).not.toHaveBeenCalled();
  });

  it("token 已过期返回 401 并删除该 token", () => {
    const expiredRow = {
      user_id: 5,
      expires_at: new Date(Date.now() - 86400 * 1000).toISOString(),
      username: "admin",
      display_name: "管理员",
    };
    const db = makeMockDb({ tokenRow: expiredRow });
    const middleware = createAuthMiddleware(db);
    const req = { headers: { authorization: "Bearer expired-token" } };
    const res = makeRes();
    const next = vi.fn();
    middleware(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/已过期/);
    expect(db._calls.deleteCalls).toBe(1);
    expect(next).not.toHaveBeenCalled();
  });

  it("有效 token 设置 req.user 与 req.token 并调用 next", () => {
    const validRow = {
      user_id: 42,
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      username: "alice",
      display_name: "Alice",
    };
    const db = makeMockDb({ tokenRow: validRow });
    const middleware = createAuthMiddleware(db);
    const req = { headers: { authorization: "Bearer valid-token" } };
    const res = makeRes();
    const next = vi.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200); // 未改
    expect(req.user).toEqual({
      id: 42,
      username: "alice",
      displayName: "Alice",
    });
    expect(req.token).toBe("valid-token");
    expect(db._calls.deleteCalls).toBe(0); // 未删除
  });

  it("Bearer 大小写不敏感", () => {
    const validRow = {
      user_id: 1,
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      username: "u",
      display_name: null,
    };
    const db = makeMockDb({ tokenRow: validRow });
    const middleware = createAuthMiddleware(db);
    const req = { headers: { authorization: "bearer valid-token" } };
    const res = makeRes();
    const next = vi.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.token).toBe("valid-token");
  });
});

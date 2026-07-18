/**
 * Cloudflare Turnstile 人机验证端到端集成测试
 *
 * 策略：启动一个模拟 Cloudflare Turnstile 校验服务的 HTTP mock 服务，
 * 然后以启用 Turnstile 的环境变量配置启动独立的 iHouse 服务器子进程，
 * 验证注册和登录接口下，Token 缺失、校验失败和校验成功的处理逻辑。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import http from "http";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.join(__dirname, "index.js");

// 随机端口避免冲突
const PORT = 6000 + Math.floor(Math.random() * 1000);
const MOCK_TURNSTILE_PORT = PORT + 1;
const TMP_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ihouse-test-turnstile-"));

let serverProcess = null;
let turnstileMockServer = null;
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

beforeAll(async () => {
  // 1. 启动 mock Turnstile 服务器
  turnstileMockServer = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      try {
        const data = JSON.parse(body);
        if (data.response === "valid-token") {
          res.end(JSON.stringify({ success: true }));
        } else {
          res.end(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }));
        }
      } catch (err) {
        res.end(JSON.stringify({ success: false }));
      }
    });
  });

  await new Promise((resolve) => {
    turnstileMockServer.listen(MOCK_TURNSTILE_PORT, "127.0.0.1", resolve);
  });

  // 2. 启动 iHouse 服务器
  const testEnv = { ...process.env };
  testEnv.TURNSTILE_SITE_KEY = "test-site-key";
  testEnv.TURNSTILE_SECRET_KEY = "test-secret-key";
  testEnv.TURNSTILE_VERIFY_URL = `http://127.0.0.1:${MOCK_TURNSTILE_PORT}/verify`;

  serverProcess = spawn(process.execPath, [SERVER_PATH], {
    env: {
      ...testEnv,
      PORT: String(PORT),
      DATA_DIR: TMP_DATA_DIR,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  await waitForServer();
}, 35000);

afterAll(async () => {
  if (serverProcess) {
    serverProcess.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (!serverProcess.killed) serverProcess.kill("SIGKILL");
  }
  if (turnstileMockServer) {
    await new Promise((resolve) => turnstileMockServer.close(resolve));
  }
  try {
    fs.rmSync(TMP_DATA_DIR, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe("Cloudflare Turnstile 人机验证流程", () => {
  it("GET /api/auth/config 应返回 Turnstile 启用及 Site Key", async () => {
    const r = await fetch(`${baseUrl}/api/auth/config`);
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(data.turnstileEnabled).toBe(true);
    expect(data.turnstileSiteKey).toBe("test-site-key");
  });

  describe("注册接口 (/api/auth/register)", () => {
    it("缺失 turnstileToken 应返回 400 人机验证未完成", async () => {
      const r = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "turnstile_reg_1",
          password: "password123",
        }),
      });
      expect(r.status).toBe(400);
      const data = await r.json();
      expect(data.error).toMatch(/人机验证未完成/);
    });

    it("携带错误 turnstileToken 应返回 400 人机验证失败", async () => {
      const r = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "turnstile_reg_2",
          password: "password123",
          turnstileToken: "invalid-token",
        }),
      });
      expect(r.status).toBe(400);
      const data = await r.json();
      expect(data.error).toMatch(/人机验证失败/);
    });

    it("携带正确 turnstileToken 应成功注册 200", async () => {
      const r = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "turnstile_reg_3",
          password: "password123",
          turnstileToken: "valid-token",
        }),
      });
      expect(r.status).toBe(200);
      const data = await r.json();
      expect(data.ok).toBe(true);
      expect(data.token).toBeDefined();
    });
  });

  describe("登录接口 (/api/auth/login)", () => {
    it("缺失 turnstileToken 应返回 400 人机验证未完成", async () => {
      const r = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "turnstile_reg_3",
          password: "password123",
        }),
      });
      expect(r.status).toBe(400);
      const data = await r.json();
      expect(data.error).toMatch(/人机验证未完成/);
    });

    it("携带错误 turnstileToken 应返回 400 人机验证失败", async () => {
      const r = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "turnstile_reg_3",
          password: "password123",
          turnstileToken: "invalid-token",
        }),
      });
      expect(r.status).toBe(400);
      const data = await r.json();
      expect(data.error).toMatch(/人机验证失败/);
    });

    it("携带正确 turnstileToken 且密码正确应成功登录 200", async () => {
      const r = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "turnstile_reg_3",
          password: "password123",
          turnstileToken: "valid-token",
        }),
      });
      expect(r.status).toBe(200);
      const data = await r.json();
      expect(data.ok).toBe(true);
      expect(data.token).toBeDefined();
    });
  });
});

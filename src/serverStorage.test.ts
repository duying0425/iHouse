import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("serverStorage house isolation", () => {
  beforeEach(() => vi.resetModules());

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("切换房屋后仍把每次防抖内容写回原房屋", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { serverStorage, setHouseContext } = await import("./serverStorage");
    const wrappedA = JSON.stringify({ state: { title: "A" }, version: 2 });
    const wrappedB = JSON.stringify({ state: { title: "B" }, version: 2 });

    setHouseContext("house-a");
    await serverStorage.setItem("home", wrappedA);
    setHouseContext("house-b");
    await serverStorage.setItem("home", wrappedB);
    await new Promise((resolve) => setTimeout(resolve, 650));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requests = fetchMock.mock.calls.map(([url, init]) => ({
      url,
      body: JSON.parse(String((init as RequestInit).body)),
    }));
    expect(requests).toEqual(expect.arrayContaining([
      { url: "/api/houses/house-a/data", body: { title: "A" } },
      { url: "/api/houses/house-b/data", body: { title: "B" } },
    ]));
  });

  it("忽略切换房屋后才返回的旧房屋读取结果", async () => {
    let resolveA: ((value: unknown) => void) | undefined;
    const responseA = new Promise((resolve) => { resolveA = resolve; });
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("house-a")) return responseA;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ title: "B", areas: [] }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { serverStorage, setHouseContext } = await import("./serverStorage");

    setHouseContext("house-a");
    const pendingA = serverStorage.getItem("home");
    setHouseContext("house-b");
    const valueB = await serverStorage.getItem("home");
    resolveA?.({
      ok: true,
      status: 200,
      json: async () => ({ title: "A", areas: [] }),
    });

    expect(JSON.parse(String(valueB)).state.title).toBe("B");
    await expect(pendingA).resolves.toBeNull();
  });
});

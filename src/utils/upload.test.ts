import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { uploadImage } from "./upload";

describe("uploadImage utility", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Suppress console.warn during tests
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("should return empty string if no input is provided", async () => {
    const result = await uploadImage("");
    expect(result).toBe("");
  });

  it("should return the original URL immediately if input is not base64", async () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    const inputUrl = "http://example.com/image.jpg";
    const result = await uploadImage(inputUrl);

    expect(result).toBe(inputUrl);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should upload base64 image and return new URL on successful response", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({ url: "/api/images/uploaded_hash.png" })
    };
    const mockFetch = vi.fn().mockResolvedValue(mockResponse);
    globalThis.fetch = mockFetch as typeof globalThis.fetch;

    const base64Input = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const result = await uploadImage(base64Input);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/upload");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ image: base64Input }));
    expect(result).toBe("/api/images/uploaded_hash.png");
  });

  it("should fallback to base64 if fetch response is not ok", async () => {
    const mockResponse = {
      ok: false
    };
    const mockFetch = vi.fn().mockResolvedValue(mockResponse);
    globalThis.fetch = mockFetch as typeof globalThis.fetch;

    const base64Input = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const result = await uploadImage(base64Input);

    expect(result).toBe(base64Input);
  });

  it("should fallback to base64 on network/fetch errors", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network Error"));
    globalThis.fetch = mockFetch as typeof globalThis.fetch;

    const base64Input = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const result = await uploadImage(base64Input);

    expect(result).toBe(base64Input);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("[uploadImage] 上传失败，将回退使用本地 Base64 数据:"),
      expect.any(Error)
    );
  });
});

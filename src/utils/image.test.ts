import { describe, it, expect } from "vitest";
import { imageOf } from "./image";

describe("imageOf utility", () => {
  const BASE_URL = "https://remote-pod.enterprise.trae.cn/api/ide/v1/text_to_image";

  it("should construct default URL with prompt and landscape_4_3 size", () => {
    const result = imageOf("modern kitchen");
    expect(result).toBe(`${BASE_URL}?prompt=modern%20kitchen&image_size=landscape_4_3`);
  });

  it("should properly encode special characters in prompt", () => {
    const result = imageOf("living room & dining table?");
    expect(result).toBe(`${BASE_URL}?prompt=living%20room%20%26%20dining%20table%3F&image_size=landscape_4_3`);
  });

  it("should construct URL with custom size parameters", () => {
    const result = imageOf("cozy bedroom", "square_hd");
    expect(result).toBe(`${BASE_URL}?prompt=cozy%20bedroom&image_size=square_hd`);
  });
});

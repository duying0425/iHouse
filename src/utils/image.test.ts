import { describe, it, expect } from "vitest";
import { imageOf } from "./image";

describe("imageOf utility", () => {
  it("should return mapped demo image path when prompt matches a key in DEMO_IMAGE_MAP", () => {
    const result = imageOf("入户玄关全景");
    expect(result).toBe("/demo-images/entryway_overview.png");
  });

  it("should return empty string as fallback when prompt has no match in DEMO_IMAGE_MAP", () => {
    const result = imageOf("modern kitchen");
    expect(result).toBe("");
  });
});

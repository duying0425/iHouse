import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn class merging utility", () => {
  it("should combine basic class strings", () => {
    expect(cn("class1", "class2")).toBe("class1 class2");
  });

  it("should ignore falsy values", () => {
    expect(cn("class1", null, undefined, false, "", "class2")).toBe("class1 class2");
  });

  it("should merge tailwind conflicts correctly (tailwind-merge)", () => {
    // px-2 and py-1 combined with p-4 should resolve to p-4 (or keep custom overrides depending on tailwind spec)
    // Normally, p-4 overrides px-2 and py-1 in tailwind-merge
    expect(cn("px-2 py-1", "p-4")).toBe("p-4");
    
    // bg-red-500 overwritten by bg-blue-500
    expect(cn("bg-red-500", "bg-blue-500")).toBe("bg-blue-500");
  });

  it("should handle nested arrays and object inputs", () => {
    expect(cn(["class1", "class2"], { "class-active": true, "class-inactive": false })).toBe(
      "class1 class2 class-active"
    );
  });
});

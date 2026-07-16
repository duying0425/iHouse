import { describe, expect, it } from "vitest";
import { resizeBounds } from "./FloorPlan";
import type { Bounds } from "@/types";

describe("resizeBounds utility", () => {
  const start: Bounds = { x: 10, y: 10, w: 20, h: 20 };

  it("should support moving bounds as a whole", () => {
    const res = resizeBounds(start, "move", 5, -5);
    expect(res).toEqual({ x: 15, y: 5, w: 20, h: 20 });
  });

  it("should keep bounds within 0-100 when moving", () => {
    const resLeft = resizeBounds(start, "move", -20, 0);
    expect(resLeft.x).toBe(0);
    expect(resLeft.w).toBe(20);

    const resRight = resizeBounds(start, "move", 90, 0);
    expect(resRight.x).toBe(80); // 100 - 20
    expect(resRight.w).toBe(20);
  });

  it("should anchor right edge and pull left edge for w/nw/sw handles", () => {
    // 拉动左边缘：w -> x + dx, w -> w - dx
    // dx = 5, 右边缘固定在 30
    const resW = resizeBounds(start, "w", 5, 0);
    expect(resW).toEqual({ x: 15, y: 10, w: 15, h: 20 });
  });

  it("should anchor left edge and pull right edge for e/ne/se handles", () => {
    // 拉动右边缘：e -> w + dx, 左边缘固定在 10
    const resE = resizeBounds(start, "e", 5, 0);
    expect(resE).toEqual({ x: 10, y: 10, w: 25, h: 20 });
  });

  it("should respect MIN_SIZE when pulling left edge past right edge", () => {
    // 往右过度拉伸左边缘 (dx = 30)
    // 原本 x=10, w=20, 右边缘在 30
    // 应该被限制为最大 x = 30 - MIN_SIZE (2) = 28, 宽度 = 2
    const resW = resizeBounds(start, "w", 30, 0);
    expect(resW).toEqual({ x: 28, y: 10, w: 2, h: 20 });
  });

  it("should respect MIN_SIZE when pulling right edge past left edge", () => {
    // 往左过度拉伸右边缘 (dx = -30)
    // 宽度应为 MIN_SIZE = 2, 左边缘固定在 10
    const resE = resizeBounds(start, "e", -30, 0);
    expect(resE).toEqual({ x: 10, y: 10, w: 2, h: 20 });
  });

  it("should respect boundary limits 0-100 when stretching", () => {
    const resW = resizeBounds(start, "w", -50, 0);
    expect(resW.x).toBe(0);
    expect(resW.w).toBe(30); // 30 - 0
  });
});

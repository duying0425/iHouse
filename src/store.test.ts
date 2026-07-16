import { beforeEach, describe, expect, it, vi } from "vitest";

// 用内存存储替换 serverStorage，避免触发 fetch/IndexedDB
const memoryStore = new Map<string, string>();
vi.mock("@/serverStorage", () => ({
  serverStorage: {
    getItem: vi.fn(async (name: string) => memoryStore.get(name) ?? null),
    setItem: vi.fn(async (name: string, value: string) => {
      memoryStore.set(name, value);
    }),
    removeItem: vi.fn(async (name: string) => {
      memoryStore.delete(name);
    }),
  },
  setReloading: vi.fn(),
}));

import { useHomeStore } from "./store";
import type { Area } from "@/types";

function area(id: string, patch: Partial<Area> = {}): Area {
  return {
    id,
    name: id,
    floorPlanPos: { x: 50, y: 50 },
    images: [],
    items: [],
    ...patch,
  };
}

function currentArea(id: string): Area | undefined {
  return useHomeStore.getState().areas.find((a) => a.id === id);
}

describe("store 区域锚点与边界双向同步", () => {
  beforeEach(() => {
    memoryStore.clear();
    useHomeStore.setState({
      areas: [
        area("a", { floorPlanPos: { x: 50, y: 50 }, bounds: { x: 40, y: 40, w: 20, h: 20 } }),
        area("b", { floorPlanPos: { x: 10, y: 10 } }),
      ],
    });
  });

  describe("updateAreaPos", () => {
    it("更新 floorPlanPos 并同步 bounds 中心到新锚点", () => {
      useHomeStore.getState().updateAreaPos("a", { x: 30, y: 30 });
      const a = currentArea("a")!;
      expect(a.floorPlanPos).toEqual({ x: 30, y: 30 });
      // bounds 保持 w/h，x/y 以 pos 为中心
      expect(a.bounds).toEqual({ x: 20, y: 20, w: 20, h: 20 });
    });

    it("拖到左上边界时，bounds 被 clamp 到 (0,0)", () => {
      useHomeStore.getState().updateAreaPos("a", { x: 0, y: 0 });
      const a = currentArea("a")!;
      expect(a.floorPlanPos).toEqual({ x: 10, y: 10 });
      // pos - w/2 = 0 - 10 = -10 → clamp 到 0
      expect(a.bounds).toEqual({ x: 0, y: 0, w: 20, h: 20 });
    });

    it("拖到右下边界时，bounds 被 clamp 到 (100-w, 100-h)", () => {
      useHomeStore.getState().updateAreaPos("a", { x: 100, y: 100 });
      const a = currentArea("a")!;
      expect(a.floorPlanPos).toEqual({ x: 90, y: 90 });
      // pos - w/2 = 100 - 10 = 90；100 - w = 80 → clamp 到 80
      expect(a.bounds).toEqual({ x: 80, y: 80, w: 20, h: 20 });
    });

    it("无 bounds 的区域仅更新 floorPlanPos，不创建 bounds", () => {
      useHomeStore.getState().updateAreaPos("b", { x: 75, y: 25 });
      const b = currentArea("b")!;
      expect(b.floorPlanPos).toEqual({ x: 75, y: 25 });
      expect(b.bounds).toBeUndefined();
    });

    it("锚点拖动后 floorPlanPos 与 bounds 中心保持一致，避免重载后跳变", () => {
      useHomeStore.getState().updateAreaPos("a", { x: 60, y: 70 });
      const a = currentArea("a")!;
      const center = { x: a.bounds!.x + a.bounds!.w / 2, y: a.bounds!.y + a.bounds!.h / 2 };
      expect(a.floorPlanPos).toEqual(center);
    });
  });

  describe("updateAreaBounds", () => {
    it("更新 bounds 并同步 floorPlanPos 到中心点", () => {
      useHomeStore.getState().updateAreaBounds("a", { x: 10, y: 10, w: 40, h: 60 });
      const a = currentArea("a")!;
      expect(a.bounds).toEqual({ x: 10, y: 10, w: 40, h: 60 });
      expect(a.floorPlanPos).toEqual({ x: 30, y: 40 });
    });

    it("传入 null 清除 bounds，保留原 floorPlanPos", () => {
      useHomeStore.getState().updateAreaBounds("a", null);
      const a = currentArea("a")!;
      expect(a.bounds).toBeUndefined();
      expect(a.floorPlanPos).toEqual({ x: 50, y: 50 });
    });

    it("为无 bounds 的区域设置 bounds 后，floorPlanPos 对齐到中心", () => {
      useHomeStore.getState().updateAreaBounds("b", { x: 0, y: 0, w: 20, h: 20 });
      const b = currentArea("b")!;
      expect(b.bounds).toEqual({ x: 0, y: 0, w: 20, h: 20 });
      expect(b.floorPlanPos).toEqual({ x: 10, y: 10 });
    });

    it("修改 bounds 后 floorPlanPos 与 bounds 中心始终一致", () => {
      useHomeStore.getState().updateAreaBounds("a", { x: 80, y: 80, w: 10, h: 10 });
      const a = currentArea("a")!;
      expect(a.floorPlanPos).toEqual({ x: 85, y: 85 });
    });
  });

  describe("双向一致性", () => {
    it("updateAreaPos 后再 updateAreaBounds，两者中心一致", () => {
      useHomeStore.getState().updateAreaPos("a", { x: 20, y: 20 });
      useHomeStore.getState().updateAreaBounds("a", { x: 5, y: 5, w: 10, h: 10 });
      const a = currentArea("a")!;
      expect(a.floorPlanPos).toEqual({ x: 10, y: 10 });
      expect(a.bounds).toEqual({ x: 5, y: 5, w: 10, h: 10 });
    });

    it("updateAreaBounds 后再 updateAreaPos，pos 与 bounds 中心一致", () => {
      useHomeStore.getState().updateAreaBounds("a", { x: 10, y: 10, w: 20, h: 20 });
      useHomeStore.getState().updateAreaPos("a", { x: 50, y: 50 });
      const a = currentArea("a")!;
      const center = { x: a.bounds!.x + a.bounds!.w / 2, y: a.bounds!.y + a.bounds!.h / 2 };
      expect(a.floorPlanPos).toEqual(center);
    });
  });
});

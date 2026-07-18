import { describe, expect, it } from "vitest";
import { normalizeContents, itemToFormValue } from "./itemFormValue";
import type { StorageEntry } from "@/types";

describe("normalizeContents utility", () => {
  it("should return undefined for empty contents list", () => {
    expect(normalizeContents([])).toBeUndefined();
  });

  it("should return undefined if all items have empty names", () => {
    const input: StorageEntry[] = [
      { id: "1", name: "", quantity: "10", remark: "foo" },
      { id: "2", name: "   ", quantity: "", remark: "" }
    ];
    expect(normalizeContents(input)).toBeUndefined();
  });

  it("should filter out empty items and keep valid ones", () => {
    const input: StorageEntry[] = [
      { id: "1", name: "  Valid Item  ", quantity: " 5 pcs ", remark: " some note " },
      { id: "2", name: "", quantity: "10", remark: "ignored" }
    ];
    const output = normalizeContents(input);
    expect(output).toBeDefined();
    expect(output).toHaveLength(1);
    expect(output![0]).toEqual({
      id: "1",
      name: "Valid Item",
      quantity: "5 pcs",
      remark: "some note"
    });
  });

  it("should trim and map empty strings/remarks to undefined", () => {
    const input: StorageEntry[] = [
      { id: "1", name: "Valid Item", quantity: "   ", remark: "" }
    ];
    const output = normalizeContents(input);
    expect(output).toEqual([
      { id: "1", name: "Valid Item", quantity: undefined, remark: undefined }
    ]);
  });
});

describe("itemToFormValue utility", () => {
  it("should return default values when input is undefined", () => {
    const val = itemToFormValue(undefined);
    expect(val.name).toBe("");
    expect(val.category).toBe("家电");
    expect(val.contents).toEqual([]);
  });

  it("should map standard item values correctly", () => {
    const val = itemToFormValue({
      name: "Refrigerator",
      category: "家电",
      contents: [{ id: "1", name: "Apple", quantity: "5" }]
    });
    expect(val.name).toBe("Refrigerator");
    expect(val.category).toBe("家电");
    expect(val.contents).toEqual([{ id: "1", name: "Apple", quantity: "5" }]);
  });
});

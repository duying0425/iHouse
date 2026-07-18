import { describe, expect, it } from "vitest";
import { itemToFormValue } from "@/components/itemFormValue";
import { applyRecognitionToEmptyFields, type ItemRecognition } from "@/utils/aiRecognition";

const recognition: ItemRecognition = {
  name: "落地扇",
  category: "家电",
  brand: "美的",
  type: "电风扇",
  subtype: "落地扇",
  tags: ["风扇", "立式风扇"],
  spec: "FS40",
  estimatedPriceRange: "150-400元",
  estimatedPrice: 275,
  confidence: 0.85,
  notes: "白色三叶设计",
};

describe("AI 识别表单回填", () => {
  it("填充空字段并保留估价区间说明", () => {
    const result = applyRecognitionToEmptyFields(itemToFormValue(), recognition, true);
    expect(result.value).toMatchObject({
      name: "落地扇",
      category: "家电",
      brand: "美的",
      tags: "风扇, 立式风扇",
      spec: "FS40",
      price: "275",
      remark: "白色三叶设计；AI 预估价格区间：150-400元",
    });
    expect(result.filled).toEqual(["名称", "分类", "品牌", "标签", "规格", "价格", "备注"]);
  });

  it("不覆盖用户已有内容或已有档案分类", () => {
    const current = itemToFormValue({
      name: "我的风扇",
      category: "其他",
      brand: "未知",
      price: 199,
      remark: "客厅使用",
    });
    const result = applyRecognitionToEmptyFields(current, recognition, false);
    expect(result.value.name).toBe("我的风扇");
    expect(result.value.category).toBe("其他");
    expect(result.value.brand).toBe("未知");
    expect(result.value.price).toBe("199");
    expect(result.value.remark).toBe("客厅使用");
    expect(result.filled).toEqual(["标签", "规格"]);
  });

  it("如果识别结果包含 contents 且当前表单 contents 为空，则自动追加并生成 ID，不覆盖已有的同名项", () => {
    const recognitionWithContents: ItemRecognition = {
      ...recognition,
      category: "储物",
      contents: [
        { name: "螺丝刀", quantity: "2把", remark: "十字" },
        { name: "电池", quantity: "5节" }
      ]
    };
    
    // 假设已有 "电池" 项
    const current = itemToFormValue({
      contents: [{ id: "existing-1", name: "电池", quantity: "1节" }]
    });

    const result = applyRecognitionToEmptyFields(current, recognitionWithContents, false);
    expect(result.value.contents).toHaveLength(2); // existing 电池 + new 螺丝刀
    expect(result.value.contents[0]).toMatchObject({ id: "existing-1", name: "电池", quantity: "1节" });
    expect(result.value.contents[1].name).toBe("螺丝刀");
    expect(result.value.contents[1].quantity).toBe("2把");
    expect(result.value.contents[1].id).toMatch(/^cnt-/);
    expect(result.filled).toContain("内部快捷清单");
  });
});

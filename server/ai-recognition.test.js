import { describe, expect, it } from "vitest";
import {
  estimatedPriceMidpoint,
  getAiConfig,
  ITEM_RECOGNITION_PROMPT,
  ITEM_RECOGNITION_SYSTEM_PROMPT,
  normalizeRecognition,
  recognizeItemFromImage,
  resolveImageDataUrl,
} from "./ai-recognition.js";

const PIXEL_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("AI 物品识别", () => {
  it("兼容代码块并规范化模型结果", () => {
    const result = normalizeRecognition(`\n\`\`\`json\n{
      "brand": "美的",
      "type": "电风扇",
      "subtype": "落地扇",
      "estimated_price": "150-400元",
      "confidence": 1.2,
      "notes": "白色三叶"
    }\n\`\`\`\n`);
    expect(result).toMatchObject({
      name: "落地扇",
      category: "家电",
      brand: "美的",
      tags: ["电风扇"],
      estimatedPriceRange: "150-400元",
      estimatedPrice: 275,
      confidence: 1,
    });
  });

  it("按项目语义处理未知值、百分比置信度和搜索标签", () => {
    const result = normalizeRecognition({
      name: "透明收纳箱",
      category: "自定义类别",
      brand: "无法判断",
      type: "收纳箱",
      subtype: "透明收纳箱",
      tags: ["整理箱", "透明收纳箱", "未知"],
      spec: "不详",
      estimated_price: "50-100元",
      confidence: "85%",
      notes: "none",
    });
    expect(result).toMatchObject({
      category: "储物",
      brand: null,
      tags: ["整理箱", "收纳箱"],
      spec: null,
      confidence: 0.85,
      notes: null,
    });
  });

  it("提示词包含 iHouse 分类边界、主物品选择和严格输出协议", () => {
    expect(ITEM_RECOGNITION_SYSTEM_PROMPT).toMatch(/iHouse 居所物品档案系统/);
    expect(ITEM_RECOGNITION_PROMPT).toMatch(/主要物品选择/);
    expect(ITEM_RECOGNITION_PROMPT).toMatch(/管线设施/);
    expect(ITEM_RECOGNITION_PROMPT).toMatch(/必须恰好包含以下 11 个键/);
  });

  it("正确换算普通区间和万元区间中值", () => {
    expect(estimatedPriceMidpoint("100-300元")).toBe(200);
    expect(estimatedPriceMidpoint("0.8-1.2万元")).toBe(10000);
    expect(estimatedPriceMidpoint(null)).toBeNull();
  });

  it("接受 data URL 并拒绝任意远程图片", () => {
    expect(resolveImageDataUrl(PIXEL_PNG, "/unused")).toBe(PIXEL_PNG);
    expect(() => resolveImageDataUrl("https://example.com/item.png", "/unused"))
      .toThrow(/仅支持刚拍摄或上传/);
    expect(() => resolveImageDataUrl("/api/images/non-existent.png", "/unused"))
      .toThrow(/图片文件不存在，请重新上传/);
    expect(() => resolveImageDataUrl("/api/images/tmp/non-existent.png", "/unused"))
      .toThrow(/图片文件不存在，请重新上传/);
  });

  it("支持 base URL 配置并保持默认模型", () => {
    expect(getAiConfig({ AI_API_KEY: "test-key", AI_API_BASE_URL: "https://ai.example.com" }))
      .toMatchObject({
        endpoint: "https://ai.example.com/v1/chat/completions",
        model: "openai/gpt-5.6-sol",
      });
  });

  it("按 Chat Completions 图片结构调用上游并解析结果", async () => {
    let captured;
    const fetchImpl = async (url, init) => {
      captured = { url, init, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              name: "落地扇",
              category: "家电",
              brand: "美的",
              type: "电风扇",
              subtype: "落地扇",
              tags: ["风扇"],
              spec: null,
              estimated_price: "150-400元",
              confidence: 0.85,
              notes: "白色外壳",
            }),
          },
        }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const result = await recognizeItemFromImage(PIXEL_PNG, {
      fetchImpl,
      config: {
        apiKey: "secret-key",
        endpoint: "https://ai.example.com/v1/chat/completions",
        model: "openai/gpt-5.6-sol",
        timeoutMs: 5000,
      },
    });

    expect(result.name).toBe("落地扇");
    expect(captured.url).toBe("https://ai.example.com/v1/chat/completions");
    expect(captured.init.headers.Authorization).toBe("Bearer secret-key");
    expect(captured.body.messages[0]).toMatchObject({
      role: "system",
      content: ITEM_RECOGNITION_SYSTEM_PROMPT,
    });
    expect(captured.body.messages[1].content[1]).toEqual({
      type: "image_url",
      image_url: { url: PIXEL_PNG, detail: "auto" },
    });
  });

  it("正确提取并规范化储物内部快捷清单 contents", () => {
    const result = normalizeRecognition({
      name: "收纳柜",
      category: "储物",
      brand: "宜家",
      type: "收纳柜",
      subtype: "储物柜",
      tags: ["置物架"],
      spec: null,
      estimated_price: "200-300元",
      confidence: 0.9,
      notes: "白色",
      contents: [
        { name: "螺丝刀", quantity: "2把", remark: "十字" },
        { name: " 电池 ", qty: "5节" },
        { name: "", quantity: "ignored" }
      ]
    });
    expect(result.contents).toHaveLength(2);
    expect(result.contents[0]).toEqual({ name: "螺丝刀", quantity: "2把", remark: "十字" });
    expect(result.contents[1]).toEqual({ name: "电池", quantity: "5节", remark: null });
  });
});

import { authFetch } from "@/authStore";
import type { ItemFormValue } from "@/components/itemFormValue";
import { CATEGORIES, type Category } from "@/types";

export interface ItemRecognition {
  name: string;
  category: Category;
  brand: string | null;
  type: string | null;
  subtype: string | null;
  tags: string[];
  spec: string | null;
  estimatedPriceRange: string | null;
  estimatedPrice: number | null;
  confidence: number | null;
  notes: string | null;
}

interface RecognitionResponse {
  ok?: boolean;
  result?: ItemRecognition;
  error?: string;
}

export async function recognizeItemImage(image: string): Promise<ItemRecognition> {
  const response = await authFetch("/api/ai/recognize-item", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image }),
  });

  let data: RecognitionResponse = {};
  try {
    data = await response.json();
  } catch {
    // 统一在下方给出可读错误，不把 HTML/代理错误直接展示给用户。
  }
  if (!response.ok) {
    throw new Error(data.error || `AI 识别失败（HTTP ${response.status}）`);
  }
  if (!data.result || typeof data.result.name !== "string") {
    throw new Error("AI 返回的识别结果格式不正确，请重试");
  }
  return data.result;
}

export interface AppliedRecognition {
  value: ItemFormValue;
  filled: string[];
}

/**
 * 只回填尚未填写的表单字段。categoryCanAutofill 只会在新建表单且用户尚未手选分类时为 true。
 */
export function applyRecognitionToEmptyFields(
  current: ItemFormValue,
  recognition: ItemRecognition,
  categoryCanAutofill: boolean
): AppliedRecognition {
  const next = { ...current };
  const filled: string[] = [];

  const fillText = (key: "name" | "brand" | "tags" | "spec" | "price" | "remark", label: string, value: string | null | undefined) => {
    if (!next[key].trim() && value?.trim()) {
      next[key] = value.trim();
      filled.push(label);
    }
  };

  fillText("name", "名称", recognition.name);
  if (categoryCanAutofill && CATEGORIES.includes(recognition.category)) {
    next.category = recognition.category;
    filled.push("分类");
  }
  fillText("brand", "品牌", recognition.brand);

  const tags = [...new Set(
    (recognition.tags || [])
      .map((tag) => tag.trim())
      .filter(Boolean)
      .filter((tag) => tag !== recognition.name)
  )].slice(0, 5);
  fillText("tags", "标签", tags.join(", "));
  fillText("spec", "规格", recognition.spec);

  if (!next.price.trim() && Number.isFinite(recognition.estimatedPrice) && recognition.estimatedPrice! >= 0) {
    next.price = String(Math.round(recognition.estimatedPrice!));
    filled.push("价格");
  }

  const remarkParts = [
    recognition.notes,
    recognition.estimatedPriceRange
      ? `AI 预估价格区间：${recognition.estimatedPriceRange}`
      : null,
  ].filter((part): part is string => Boolean(part?.trim()));
  fillText("remark", "备注", remarkParts.join("；"));

  return { value: next, filled };
}

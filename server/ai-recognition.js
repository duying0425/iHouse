import fs from "fs";
import path from "path";

const CATEGORIES = ["家电", "家具", "储物", "装饰", "管线设施", "其他"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_UPSTREAM_BODY_LENGTH = 1024 * 1024;

export const ITEM_RECOGNITION_SYSTEM_PROMPT = [
  "你是 iHouse 居所物品档案系统的图片识别器。",
  "你的任务是把一张物品主图转换成可保存、可检索的家庭物品档案建议。",
  "准确性优先于字段完整度：只输出图片能够支持的事实；不能确认时使用 null，禁止为了填满字段而猜测。",
  "输出必须是单个合法 JSON 对象，不得输出解释、Markdown、代码块或 JSON 之外的任何字符。",
].join("\n");

export const ITEM_RECOGNITION_PROMPT = [
  "请识别图片中的一个主要物品，并按以下 iHouse 规则返回档案建议。",
  "",
  "【主要物品选择】",
  "1. 优先选择拍摄主体：通常是画面居中、占比最大、对焦最清楚或标签最清晰的物品。",
  "2. 忽略背景中的墙面、地板、桌面和陪衬物；若多个物品同等显著，只选最居中者，并在 notes 说明画面存在多个候选。",
  "3. 若无法确定任何主要物品，name、type、subtype、brand、spec、estimated_price 均返回 null，confidence 返回 0。",
  "",
  "【iHouse 分类定义】",
  '- 家电：以用电、燃气或智能控制实现主要功能的设备，例如冰箱、风扇、电视、台灯。',
  '- 家具：用于坐卧、工作、用餐或承托的大中型耐用品，例如沙发、床、桌、椅。',
  '- 储物：主要用途是收纳的容器或单元，例如衣柜、鞋柜、收纳箱、置物架、抽屉。',
  '- 装饰：主要用途是美化空间的物品，例如挂画、摆件、花瓶、地毯。',
  '- 管线设施：与房屋供水、供电、燃气、排水、采暖等系统连接的固定设施，例如阀门、插座、地漏、水表。',
  '- 其他：日用品、耗材、工具以及不属于以上类别的物品。',
  "分类必须严格使用以上六个值之一；可识别物品时不得自造分类。",
  "",
  "【字段规则】",
  '- name：适合档案列表展示的简洁中文名，优先使用明确的细分类名；不包含品牌、颜色、位置和“一个/一台”等数量词。',
  '- category：严格从“家电”“家具”“储物”“装饰”“管线设施”“其他”中选择；无法识别主要物品时为 null。',
  "- brand：仅当 logo、包装或铭牌文字可见，或品牌标识具有高度唯一性时填写；不能仅凭外形或颜色猜品牌。",
  '- type：通用品类名称，例如“电风扇”“沙发”“洗衣液”。',
  '- subtype：能可靠判断时填写更细子类，例如“落地扇”“布艺三人沙发”；否则为 null。',
  "- tags: 最多 5 个有检索价值的中文别名；不得放入品牌、颜色、材质描述、营销词或与 name 完全相同的词。",
  "- spec: 仅填写图片文字或结构能明确确认的型号、容量、尺寸、功率等；把多个规格合并成简短字符串，不能确认则为 null。",
  '- estimated_price：按中国大陆常见新品零售价保守估算，只能输出“最低整数-最高整数元”的区间，最低值不得高于最高值；古董、定制品、无法判断品类或差异过大时为 null。',
  "- confidence：0 到 1 的数字，表示对主要物品名称与品类判断的总体把握，不代表品牌置信度。",
  "- notes：不超过 80 个中文字符，只记录关键可见特征、多物品歧义或不确定项；不要重复其他字段，不要声称看到了实际不可见的信息。",
  '- contents：仅当主要物品为储物类（如抽屉、收纳箱、鞋柜、衣柜、置物架等，或敞开的冰箱），且其内部装载/陈列的物品在图片中清晰可见时填写。返回一个数组，数组元素为对象，结构如：{"name": "物品名称", "quantity": "数量，无则为 null", "remark": "备注/规格，无则为 null"}。如果不是此类物品或内部物品不可见，则必须为 []。',
  "",
  "【输出协议】",
  "必须恰好包含以下 11 个键，不得增删键；未知字符串字段使用 null，列表未知时使用 []：",
  '{"name":null,"category":null,"brand":null,"type":null,"subtype":null,"tags":[],"spec":null,"estimated_price":null,"confidence":0,"notes":null,"contents":[]}',
  "输出的第一个字符必须是 {，最后一个字符必须是 }。",
].join("\n");

export class AiRecognitionError extends Error {
  constructor(message, status = 502, code = "AI_RECOGNITION_FAILED") {
    super(message);
    this.name = "AiRecognitionError";
    this.status = status;
    this.code = code;
  }
}

function textOrNull(value, maxLength = 200) {
  if (typeof value !== "string") return null;
  const valueTrimmed = value.trim();
  if (!valueTrimmed || /^(null|n\/?a|none|unknown|未知|不详|不确定|无法判断|无法识别|无)$/i.test(valueTrimmed)) return null;
  return valueTrimmed.slice(0, maxLength);
}

function inferCategory(text) {
  if (/冰箱|冰柜|空调|电视|洗衣机|烘干机|风扇|电扇|微波炉|烤箱|灶|油烟机|热水器|电饭|吸尘|吹风|灯|音箱|路由器|加湿器|净化器|扫地机器人|咖啡机|洗碗机|家电/.test(text)) return "家电";
  if (/沙发|餐桌|书桌|床头柜|桌|椅|床|凳|茶几|书架|家具/.test(text)) return "家具";
  if (/衣柜|鞋柜|橱柜|储物柜|柜|收纳箱|工具箱|箱|盒|篮|抽屉|置物架|收纳|储物/.test(text)) return "储物";
  if (/挂画|装饰画|摆件|花瓶|地毯|窗帘|雕塑|装饰/.test(text)) return "装饰";
  if (/管道|管线|阀门|阀|水表|电表|燃气表|插座|开关|地漏|水龙头|龙头|暖气|散热器|设施/.test(text)) return "管线设施";
  return "其他";
}

export function estimatedPriceMidpoint(value) {
  const priceText = textOrNull(value, 100);
  if (!priceText) return null;
  const matches = [...priceText.replace(/,/g, "").matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  if (matches.length === 0 || matches.some((number) => !Number.isFinite(number))) return null;
  const multiplier = /万\s*元|万元/.test(priceText) ? 10000 : 1;
  const estimate = matches.length >= 2 ? (matches[0] + matches[1]) / 2 : matches[0];
  const result = Math.round(estimate * multiplier);
  return result >= 0 && result <= 100000000 ? result : null;
}

function parseJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") {
    throw new AiRecognitionError("AI 返回了无法解析的识别结果", 502, "INVALID_AI_RESPONSE");
  }

  const trimmed = value.trim().replace(/^\uFEFF/, "");
  const candidates = [trimmed];
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) candidates.push(fenced[1]);
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      // 继续尝试兼容代码块或前后带说明的返回值。
    }
  }
  throw new AiRecognitionError("AI 返回的内容不是有效 JSON，请重试", 502, "INVALID_AI_JSON");
}

export function normalizeRecognition(rawValue) {
  const raw = parseJsonObject(rawValue);
  const brand = textOrNull(raw.brand, 100);
  const type = textOrNull(raw.type, 100);
  const subtype = textOrNull(raw.subtype, 120);
  const name = textOrNull(raw.name, 120) || subtype || type;
  if (!name) {
    throw new AiRecognitionError("没有从图片中识别到明确的物品", 422, "ITEM_NOT_RECOGNIZED");
  }

  const rawCategory = textOrNull(raw.category, 20);
  const category = CATEGORIES.includes(rawCategory)
    ? rawCategory
    : inferCategory([name, type, subtype].filter(Boolean).join(" "));
  const spec = textOrNull(raw.spec, 200);
  const estimatedPriceRange = textOrNull(raw.estimated_price ?? raw.estimatedPrice, 100);
  const confidenceText = String(raw.confidence ?? "").trim();
  const confidenceValue = typeof raw.confidence === "number"
    ? raw.confidence
    : Number.parseFloat(confidenceText) / (confidenceText.endsWith("%") ? 100 : 1);
  const confidence = Number.isFinite(confidenceValue)
    ? Math.max(0, Math.min(1, confidenceValue))
    : null;
  const notes = textOrNull(raw.notes, 500);

  const rawTags = Array.isArray(raw.tags)
    ? raw.tags
    : typeof raw.tags === "string"
      ? raw.tags.split(/[,，、\s]+/)
      : [];
  // type/subtype 是项目搜索的高价值别名，即使模型漏给 tags 也确定性补齐。
  const tags = [...new Set([...rawTags, type, subtype]
    .map((tag) => textOrNull(tag, 30))
    .filter((tag) => tag && tag !== name && tag !== brand && tag !== category))]
    .slice(0, 5);

  const rawContents = Array.isArray(raw.contents) ? raw.contents : [];
  const contents = rawContents
    .map((c) => {
      if (!c || typeof c !== "object") return null;
      const contentName = textOrNull(c.name, 100);
      if (!contentName) return null;
      return {
        name: contentName,
        quantity: textOrNull(c.quantity ?? c.qty, 50),
        remark: textOrNull(c.remark, 100),
      };
    })
    .filter(Boolean);

  return {
    name,
    category,
    brand,
    type,
    subtype,
    tags,
    spec,
    estimatedPriceRange,
    estimatedPrice: estimatedPriceMidpoint(estimatedPriceRange),
    confidence,
    notes,
    contents,
  };
}

export function extractCompletionContent(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const joined = content
      .map((part) => (part && part.type === "text" && typeof part.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n");
    if (joined) return joined;
  }
  throw new AiRecognitionError("AI 服务未返回识别内容", 502, "EMPTY_AI_RESPONSE");
}

function normalizeEndpoint(rawValue) {
  const raw = String(rawValue || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  if (/\/v1\/chat\/completions$/i.test(raw)) return raw;
  if (/\/v1$/i.test(raw)) return `${raw}/chat/completions`;
  return `${raw}/v1/chat/completions`;
}

export function getAiConfig(env = process.env) {
  const apiKey = String(env.AI_API_KEY || env.NEW_API_KEY || "").trim();
  const endpoint = normalizeEndpoint(
    env.AI_API_URL || env.AI_API_BASE_URL || env.NEW_API_BASE_URL || ""
  );
  const model = String(env.AI_MODEL || "openai/gpt-5.6-sol").trim();
  const parsedTimeout = Number(env.AI_TIMEOUT_MS || 60000);
  const timeoutMs = Number.isFinite(parsedTimeout)
    ? Math.max(5000, Math.min(120000, parsedTimeout))
    : 60000;

  if (!apiKey || !endpoint) {
    throw new AiRecognitionError(
      "AI 识别尚未配置，请在服务端设置 AI_API_KEY 和 AI_API_BASE_URL",
      503,
      "AI_NOT_CONFIGURED"
    );
  }
  let endpointUrl;
  try {
    endpointUrl = new URL(endpoint);
  } catch {
    throw new AiRecognitionError("AI_API_BASE_URL 配置无效", 503, "INVALID_AI_CONFIG");
  }
  if (!/^https?:$/.test(endpointUrl.protocol)) {
    throw new AiRecognitionError("AI API 地址必须使用 HTTP 或 HTTPS", 503, "INVALID_AI_CONFIG");
  }
  if (!model) {
    throw new AiRecognitionError("AI_MODEL 配置不能为空", 503, "INVALID_AI_CONFIG");
  }
  return { apiKey, endpoint: endpointUrl.toString(), model, timeoutMs };
}

function upstreamErrorMessage(status) {
  if (status === 401 || status === 403) return "AI 服务鉴权失败，请检查 AI_API_KEY";
  if (status === 408 || status === 504) return "AI 服务响应超时，请稍后重试";
  if (status === 429) return "AI 服务请求过于频繁，请稍后重试";
  return `AI 服务暂时不可用（HTTP ${status}）`;
}

export async function recognizeItemFromImage(imageDataUrl, options = {}) {
  const config = options.config || getAiConfig(options.env);
  const fetchImpl = options.fetchImpl || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const requestBody = {
    model: config.model,
    messages: [
      {
        role: "system",
        content: ITEM_RECOGNITION_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: [
          { type: "text", text: ITEM_RECOGNITION_PROMPT },
          { type: "image_url", image_url: { url: imageDataUrl, detail: "auto" } },
        ],
      },
    ],
  };

  try {
    let response;
    let lastNetworkError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        response = await fetchImpl(config.endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
        lastNetworkError = null;
      } catch (error) {
        lastNetworkError = error;
        if (controller.signal.aborted || attempt === 1) throw error;
        continue;
      }

      if (response.ok || attempt === 1 || ![429, 500, 502, 503, 504].includes(response.status)) break;
      // 释放第一次响应体后重试一次瞬时错误。
      await response.text().catch(() => "");
    }
    if (!response) throw lastNetworkError || new Error("AI request failed");

    const responseText = (await response.text()).slice(0, MAX_UPSTREAM_BODY_LENGTH);
    if (!response.ok) {
      throw new AiRecognitionError(upstreamErrorMessage(response.status), 502, "AI_UPSTREAM_ERROR");
    }

    let payload;
    try {
      payload = JSON.parse(responseText);
    } catch {
      throw new AiRecognitionError("AI 服务返回了无效响应", 502, "INVALID_AI_RESPONSE");
    }
    return normalizeRecognition(extractCompletionContent(payload));
  } catch (error) {
    if (error instanceof AiRecognitionError) throw error;
    if (controller.signal.aborted || error?.name === "AbortError") {
      throw new AiRecognitionError("AI 识别超时，请稍后重试", 504, "AI_TIMEOUT");
    }
    throw new AiRecognitionError("无法连接 AI 服务，请检查 API 地址或网络", 502, "AI_CONNECTION_FAILED");
  } finally {
    clearTimeout(timer);
  }
}

function mimeFromExtension(extension) {
  return {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
  }[extension.toLowerCase()] || null;
}

function validateImageBuffer(buffer) {
  if (!buffer.length) {
    throw new AiRecognitionError("图片内容为空", 400, "INVALID_IMAGE");
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new AiRecognitionError("图片过大，请压缩到 10MB 以内", 413, "IMAGE_TOO_LARGE");
  }
}

export function resolveImageDataUrl(imageValue, imagesDir) {
  const image = typeof imageValue === "string" ? imageValue.trim() : "";
  if (!image) throw new AiRecognitionError("请先拍照或上传图片", 400, "IMAGE_REQUIRED");

  const dataMatch = image.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (dataMatch) {
    const encoded = dataMatch[2].replace(/\s/g, "");
    if (encoded.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4) {
      throw new AiRecognitionError("图片过大，请压缩到 10MB 以内", 413, "IMAGE_TOO_LARGE");
    }
    const buffer = Buffer.from(encoded, "base64");
    validateImageBuffer(buffer);
    return `data:${dataMatch[1].toLowerCase()};base64,${buffer.toString("base64")}`;
  }

  let pathname = image.split("?")[0];
  if (/^https?:\/\//i.test(image)) {
    try {
      pathname = new URL(image).pathname;
    } catch {
      throw new AiRecognitionError("图片地址无效", 400, "INVALID_IMAGE_URL");
    }
  }
  const localMatch = pathname.match(/^\/api\/images\/(tmp\/)?([a-zA-Z0-9][a-zA-Z0-9._-]{0,199})$/);
  if (!localMatch) {
    throw new AiRecognitionError(
      "AI 识别仅支持刚拍摄或上传到本服务的图片，请重新上传后再试",
      400,
      "UNSUPPORTED_IMAGE_URL"
    );
  }

  const isTmp = !!localMatch[1];
  const filename = localMatch[2];
  const mime = mimeFromExtension(path.extname(filename));
  if (!mime) throw new AiRecognitionError("不支持该图片格式", 400, "UNSUPPORTED_IMAGE_FORMAT");
  const filePath = isTmp ? path.join(imagesDir, "tmp", filename) : path.join(imagesDir, filename);
  const expectedDir = isTmp ? path.resolve(imagesDir, "tmp") : path.resolve(imagesDir);
  if (path.dirname(filePath) !== expectedDir || !fs.existsSync(filePath)) {
    throw new AiRecognitionError("图片文件不存在，请重新上传", 404, "IMAGE_NOT_FOUND");
  }
  const buffer = fs.readFileSync(filePath);
  validateImageBuffer(buffer);
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

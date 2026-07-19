import { getAiConfig, AiRecognitionError } from "./ai-recognition.js";

// AI 助手系统提示词
const ASSISTANT_SYSTEM_PROMPT = `你是 iHouse 居所物品图鉴系统的智能查找助理。你的任务是帮助用户查找家里的物品。

核心要求：
1. 你的回答必须是中文，语气应当简明、友好、口语化，非常适合转换为语音播放给用户听。
2. 用户的输入来自语音转文字，可能存在音近字错别字（如将“感冒药”误写为“感冒要”、“布洛芬”误写为“不如风”），你必须利用常识和下方清单进行智能纠错。
3. 如果找到了匹配或相关的物品，请明确告诉用户该物品在哪个【区域】以及其【收纳位置/容器路径】。如果有剩余数量或维护提醒，可以精简提起。
4. 回答必须是单个合法的 JSON 对象，不得输出 Markdown 标记、\`\`\` 格式或任何解释性前缀/尾缀。

JSON 格式要求：
{
  "answer": "对用户提问的自然语言回答，描述物品的具体位置。要求口语化且简练。",
  "matchedItemIds": ["匹配到的物品的 itemId 数组，无匹配则为 []"]
}`;

/**
 * 运行智能助理查询
 * @param {string} query 用户口语化提问
 * @param {Array} locations 结构化位置索引列表 (由 listLocations 获得)
 * @param {Object} [options] 配置项
 * @returns {Promise<{answer: string, matchedItemIds: string[]}>}
 */
export async function runAssistant(query, locations, options = {}) {
  const config = options.config || getAiConfig(options.env);
  const fetchImpl = options.fetchImpl || fetch;

  const serializedLocations = JSON.stringify(locations, null, 2);
  const userMessage = [
    "【居所物品位置清单】：",
    serializedLocations,
    "",
    "【用户提问】：",
    query,
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  const requestBody = {
    model: config.model,
    messages: [
      { role: "system", content: ASSISTANT_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
  };

  try {
    let response;
    let lastNetworkError;

    // 支持一次重试
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
      await response.text().catch(() => "");
    }

    clearTimeout(timer);

    if (!response) {
      throw lastNetworkError || new Error("AI 助手请求失败");
    }

    const responseText = await response.text();
    if (!response.ok) {
      throw new AiRecognitionError(
        `AI 服务请求失败 (HTTP ${response.status})`,
        502,
        "AI_UPSTREAM_ERROR"
      );
    }

    let payload;
    try {
      payload = JSON.parse(responseText);
    } catch {
      throw new AiRecognitionError("AI 服务返回了无效响应", 502, "INVALID_AI_RESPONSE");
    }

    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new AiRecognitionError("AI 服务未返回任何内容", 502, "EMPTY_AI_RESPONSE");
    }

    // 解析 JSON 响应
    return parseAssistantResponse(content);
  } catch (error) {
    clearTimeout(timer);
    if (error.name === "AbortError" || error.code === "ETIMEDOUT") {
      throw new AiRecognitionError("AI 服务响应超时，请稍后重试", 504, "AI_TIMEOUT");
    }
    throw error;
  }
}

/**
 * 健壮地解析大模型返回的 JSON 回答
 * @param {string} rawContent 
 * @returns {{answer: string, matchedItemIds: string[]}}
 */
function parseAssistantResponse(rawContent) {
  // 1. 剥离 <think>...</think> 思考过程标记
  const cleanContent = rawContent.replace(/<think>[\s\S]*?<\/think>/i, "").trim();

  const trimmed = cleanContent.trim();
  const candidates = [trimmed];

  // 尝试剥离 Markdown 围栏
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) {
    candidates.push(fenced[1]);
  }

  // 提取首个 { 和最末个 } 之间的内容
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const str of candidates) {
    try {
      const parsed = JSON.parse(str);
      if (parsed && typeof parsed === "object") {
        return {
          answer: String(parsed.answer || "").trim(),
          matchedItemIds: Array.isArray(parsed.matchedItemIds)
            ? parsed.matchedItemIds.map(String)
            : [],
        };
      }
    } catch {
      // 继续尝试其他候选
    }
  }

  // 兜底方案：如果模型没有返回 JSON 格式，直接把去除了思考过程的文本作为答复返回给用户
  if (cleanContent) {
    return {
      answer: cleanContent,
      matchedItemIds: [],
    };
  }

  throw new AiRecognitionError(
    `AI 助手返回的格式不符合要求: ${rawContent.slice(0, 100)}`,
    502,
    "INVALID_AI_RESPONSE"
  );
}

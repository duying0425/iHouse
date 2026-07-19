function normalizeTtsEndpoint(rawValue) {
  const raw = String(rawValue || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  if (/\/v1\/audio\/speech$/i.test(raw)) return raw;
  if (/\/v1$/i.test(raw)) return `${raw}/audio/speech`;
  return `${raw}/v1/audio/speech`;
}

export function getTtsConfig(env = process.env) {
  const ttsUrl = env.TTS_API_URL || "";
  const apiKey = env.TTS_API_KEY || "";
  const model = env.TTS_MODEL || "voxcpm";
  const voice = env.TTS_VOICE || "default";

  if (!ttsUrl) {
    return null; // 未配置 TTS，允许前端使用浏览器本地合成作为兜底
  }

  // 规范化 TTS 端点
  const endpoint = normalizeTtsEndpoint(ttsUrl);
  return { endpoint, apiKey, model, voice };
}

/**
 * 代理请求外部 TTS 语音合成服务并返回音频流
 * @param {string} text 需要朗读的文字
 * @param {Object} [options]
 * @returns {Promise<{ stream: ReadableStream, contentType: string }>}
 */
export async function synthesizeSpeech(text, options = {}) {
  const config = options.config || getTtsConfig(options.env || process.env);
  if (!config) {
    throw new Error("TTS 服务未配置，请设置 TTS_API_URL");
  }

  const fetchImpl = options.fetchImpl || fetch;

  const requestBody = {
    model: config.model,
    input: text,
    voice: config.voice,
  };

  const headers = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const response = await fetchImpl(config.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`TTS 服务返回错误 (HTTP ${response.status}): ${errorText.slice(0, 200)}`);
  }

  const contentType = response.headers.get("content-type") || "audio/mpeg";
  
  // Node.js 18+ Response.body is a ReadableStream (web stream)
  return {
    stream: response.body,
    contentType,
  };
}

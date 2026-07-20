function normalizeTranscriptionEndpoint(rawValue) {
  const raw = String(rawValue || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  if (/\/audio\/transcriptions$/i.test(raw)) return raw;
  if (/\/v1$/i.test(raw)) return `${raw}/audio/transcriptions`;
  return `${raw}/v1/audio/transcriptions`;
}

function normalizeTimeout(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return 60_000;
  return Math.min(120_000, Math.max(5_000, parsed));
}

export class SpeechTranscriptionError extends Error {
  constructor(message, status = 500, code = "SPEECH_TRANSCRIPTION_FAILED") {
    super(message);
    this.name = "SpeechTranscriptionError";
    this.status = status;
    this.code = code;
  }
}

export function getSpeechTranscriptionConfig(env = process.env) {
  const apiUrl = env.STT_API_URL || "";
  if (!apiUrl) return null;

  const endpoint = normalizeTranscriptionEndpoint(apiUrl);
  try {
    const parsed = new URL(endpoint);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error("unsupported protocol");
  } catch {
    throw new SpeechTranscriptionError(
      "STT_API_URL 配置无效",
      503,
      "INVALID_STT_CONFIG"
    );
  }

  return {
    endpoint,
    apiKey: env.STT_API_KEY || "",
    model: env.STT_MODEL || "whisper-1",
    timeoutMs: normalizeTimeout(env.STT_TIMEOUT_MS),
  };
}

/**
 * 调用 OpenAI 兼容的 /v1/audio/transcriptions 接口。
 */
export async function transcribeSpeech(audioBuffer, options = {}) {
  const config = options.config || getSpeechTranscriptionConfig(options.env || process.env);
  if (!config) {
    throw new SpeechTranscriptionError(
      "语音转写服务未配置，请设置 STT_API_URL",
      503,
      "STT_NOT_CONFIGURED"
    );
  }

  if (!audioBuffer?.length) {
    throw new SpeechTranscriptionError("录音内容为空", 400, "EMPTY_AUDIO");
  }

  const fetchImpl = options.fetchImpl || fetch;
  const form = new FormData();
  const mimeType = options.mimeType || "audio/webm";
  const filename = options.filename || "speech.webm";
  form.append("file", new Blob([audioBuffer], { type: mimeType }), filename);
  form.append("model", config.model);
  form.append("language", "zh");
  form.append("response_format", "json");

  const headers = {};
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  let response;
  try {
    response = await fetchImpl(config.endpoint, {
      method: "POST",
      headers,
      body: form,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new SpeechTranscriptionError(
        "语音转写超时，请稍后重试",
        504,
        "STT_TIMEOUT"
      );
    }
    throw new SpeechTranscriptionError(
      "无法连接语音转写服务，请检查 STT 配置或网络",
      502,
      "STT_NETWORK_ERROR"
    );
  } finally {
    clearTimeout(timeout);
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // 统一在下方转换成稳定的中文错误，避免返回上游正文。
  }

  if (!response.ok) {
    const status = response.status === 401 || response.status === 403 ? 502 : response.status;
    throw new SpeechTranscriptionError(
      response.status === 429
        ? "语音转写请求过于频繁，请稍后重试"
        : `语音转写服务暂时不可用 (HTTP ${response.status})`,
      status >= 400 && status <= 599 ? status : 502,
      "STT_UPSTREAM_ERROR"
    );
  }

  const text = typeof data?.text === "string" ? data.text.trim() : "";
  if (!text) {
    throw new SpeechTranscriptionError(
      "没有识别到清晰的语音，请靠近麦克风再试一次",
      422,
      "STT_EMPTY_RESULT"
    );
  }

  return text;
}

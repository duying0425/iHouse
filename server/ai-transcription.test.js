import { describe, expect, it } from "vitest";
import {
  getSpeechTranscriptionConfig,
  SpeechTranscriptionError,
  transcribeSpeech,
} from "./ai-transcription.js";

describe("移动端语音转写", () => {
  it("规范化 OpenAI 兼容接口配置", () => {
    expect(
      getSpeechTranscriptionConfig({
        STT_API_URL: "https://speech.example.com/v1/",
        STT_API_KEY: "secret",
        STT_MODEL: "whisper-large-v3",
        STT_TIMEOUT_MS: "90000",
      })
    ).toEqual({
      endpoint: "https://speech.example.com/v1/audio/transcriptions",
      apiKey: "secret",
      model: "whisper-large-v3",
      timeoutMs: 90000,
    });
  });

  it("未配置 STT_API_URL 时保持可选能力", () => {
    expect(getSpeechTranscriptionConfig({})).toBeNull();
  });

  it("上传音频并返回清理后的转写文本", async () => {
    let captured = null;
    const fetchImpl = async (url, init) => {
      captured = { url, init };
      return new Response(JSON.stringify({ text: "  感冒药放在哪里  " }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const text = await transcribeSpeech(Buffer.from("fake-audio"), {
      config: {
        endpoint: "https://speech.example.com/v1/audio/transcriptions",
        apiKey: "secret",
        model: "whisper-1",
        timeoutMs: 5000,
      },
      filename: "speech.webm",
      mimeType: "audio/webm",
      fetchImpl,
    });

    expect(text).toBe("感冒药放在哪里");
    expect(captured.url).toBe("https://speech.example.com/v1/audio/transcriptions");
    expect(captured.init.headers.Authorization).toBe("Bearer secret");
    expect(captured.init.body.get("model")).toBe("whisper-1");
    expect(captured.init.body.get("language")).toBe("zh");
    expect(captured.init.body.get("file").type).toBe("audio/webm");
  });

  it("把上游限流转换为稳定错误", async () => {
    const promise = transcribeSpeech(Buffer.from("fake-audio"), {
      config: {
        endpoint: "https://speech.example.com/v1/audio/transcriptions",
        apiKey: "",
        model: "whisper-1",
        timeoutMs: 5000,
      },
      fetchImpl: async () => new Response("rate limited", { status: 429 }),
    });

    await expect(promise).rejects.toMatchObject({
      name: "SpeechTranscriptionError",
      status: 429,
      code: "STT_UPSTREAM_ERROR",
    });
  });

  it("拒绝空白转写结果", async () => {
    const promise = transcribeSpeech(Buffer.from("fake-audio"), {
      config: {
        endpoint: "https://speech.example.com/v1/audio/transcriptions",
        apiKey: "",
        model: "whisper-1",
        timeoutMs: 5000,
      },
      fetchImpl: async () => new Response(JSON.stringify({ text: "   " }), { status: 200 }),
    });

    await expect(promise).rejects.toBeInstanceOf(SpeechTranscriptionError);
    await expect(promise).rejects.toMatchObject({
      status: 422,
      code: "STT_EMPTY_RESULT",
    });
  });
});

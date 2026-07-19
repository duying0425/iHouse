import { describe, expect, it } from "vitest";
import { runAssistant } from "./ai-assistant.js";
import { getTtsConfig, synthesizeSpeech } from "./ai-tts.js";

describe("AI 助手与语音合成测试", () => {
  describe("AI Assistant 智能助手", () => {
    it("正确组装 Prompt 并解析 Mock 成功响应", async () => {
      const mockLocations = [
        {
          itemId: "item-1",
          name: "黑色的雨伞",
          category: "其他",
          brand: "天堂伞",
          areaName: "玄关",
          locationPath: ["玄关"],
        },
      ];

      let capturedRequest = null;
      const fetchImpl = async (url, init) => {
        capturedRequest = { url, init, body: JSON.parse(init.body) };
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    answer: "您的黑色雨伞放在玄关。",
                    matchedItemIds: ["item-1"],
                  }),
                },
              },
            ],
          }),
          { status: 200 }
        );
      };

      const env = {
        AI_API_KEY: "test-key",
        AI_API_BASE_URL: "https://ai.example.com",
      };

      const result = await runAssistant("雨伞在哪", mockLocations, {
        fetchImpl,
        env,
      });

      expect(capturedRequest.url).toBe("https://ai.example.com/v1/chat/completions");
      expect(capturedRequest.body.messages[0].role).toBe("system");
      expect(capturedRequest.body.messages[1].content).toContain("黑色的雨伞");
      expect(capturedRequest.body.messages[1].content).toContain("雨伞在哪");

      expect(result).toEqual({
        answer: "您的黑色雨伞放在玄关。",
        matchedItemIds: ["item-1"],
      });
    });

    it("解析带有 Markdown 格式和多余文字的 JSON 回复", async () => {
      const mockLocations = [];
      const fetchImpl = async () => {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "这是我的分析结果：\n```json\n{\n  \"answer\": \"没找到任何相关的药。\",\n  \"matchedItemIds\": []\n}\n```\n希望对你有帮助！",
                },
              },
            ],
          }),
          { status: 200 }
        );
      };

      const env = {
        AI_API_KEY: "test-key",
        AI_API_BASE_URL: "https://ai.example.com",
      };

      const result = await runAssistant("感冒药在哪", mockLocations, {
        fetchImpl,
        env,
      });

      expect(result).toEqual({
        answer: "没找到任何相关的药。",
        matchedItemIds: [],
      });
    });

    it("过滤 <think> 思考过程并解析 JSON", async () => {
      const mockLocations = [];
      const fetchImpl = async () => {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "<think>用户想寻找感冒药，我在清单里搜寻。</think>```json\n{\n  \"answer\": \"在电视柜里。\",\n  \"matchedItemIds\": [\"item-2\"]\n}\n```",
                },
              },
            ],
          }),
          { status: 200 }
        );
      };

      const result = await runAssistant("感冒药在哪", mockLocations, {
        fetchImpl,
        env: { AI_API_KEY: "key", AI_API_BASE_URL: "https://ai.com" },
      });

      expect(result).toEqual({
        answer: "在电视柜里。",
        matchedItemIds: ["item-2"],
      });
    });

    it("当返回纯文本而非 JSON 时能够优雅兜底并清除思考过程", async () => {
      const mockLocations = [];
      const fetchImpl = async () => {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "<think>思考中...</think>感冒药可能在客厅医药箱里。",
                },
              },
            ],
          }),
          { status: 200 }
        );
      };

      const result = await runAssistant("感冒药在哪", mockLocations, {
        fetchImpl,
        env: { AI_API_KEY: "key", AI_API_BASE_URL: "https://ai.com" },
      });

      expect(result).toEqual({
        answer: "感冒药可能在客厅医药箱里。",
        matchedItemIds: [],
      });
    });
  });

  describe("TTS 语音合成代理", () => {
    it("正确获取和规范化 TTS 配置", () => {
      const env = {
        TTS_API_URL: "http://localhost:5000",
        TTS_API_KEY: "tts-secret",
        TTS_MODEL: "custom-vox",
        TTS_VOICE: "clone-me",
      };

      const config = getTtsConfig(env);
      expect(config).toEqual({
        endpoint: "http://localhost:5000/v1/audio/speech",
        apiKey: "tts-secret",
        model: "custom-vox",
        voice: "clone-me",
      });
    });

    it("在未配置 TTS_API_URL 时返回 null 兜底", () => {
      const config = getTtsConfig({});
      expect(config).toBeNull();
    });

    it("正确发送 POST 请求到 TTS 端点并返回流", async () => {
      let capturedRequest = null;
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("fake audio stream"));
          controller.close();
        },
      });

      const fetchImpl = async (url, init) => {
        capturedRequest = { url, init, body: JSON.parse(init.body) };
        return new Response(mockStream, {
          status: 200,
          headers: { "content-type": "audio/wav" },
        });
      };

      const config = {
        endpoint: "http://localhost:5000/v1/audio/speech",
        apiKey: "tts-secret",
        model: "voxcpm",
        voice: "default",
      };

      const { stream, contentType } = await synthesizeSpeech("找物品的回复", {
        config,
        fetchImpl,
      });

      expect(capturedRequest.url).toBe("http://localhost:5000/v1/audio/speech");
      expect(capturedRequest.init.headers["Authorization"]).toBe("Bearer tts-secret");
      expect(capturedRequest.body).toEqual({
        model: "voxcpm",
        input: "找物品的回复",
        voice: "default",
      });
      expect(contentType).toBe("audio/wav");
      expect(stream).toBeDefined();
    });
  });
});

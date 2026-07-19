import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, Volume2, VolumeX, Sparkles, X, Loader2, ArrowRight } from "lucide-react";
import { useAuthStore, authFetch } from "@/authStore";
import { useHomeStore } from "@/store";
import type { Item } from "@/types";
import ItemCard from "@/components/ItemCard";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  matchedItems?: { item: Item; areaName: string; containerName: string }[];
}

interface VoiceAssistantProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function VoiceAssistant({ isOpen, onClose }: VoiceAssistantProps) {
  const { currentHouseId } = useAuthStore();
  const areas = useHomeStore((s) => s.areas);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "你好！我是你的居所智能助理。你可以直接用语音问我物品的位置，例如：“我的感冒药放在哪里了？”",
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isTtsEnabled, setIsTtsEnabled] = useState(() => {
    return localStorage.getItem("ihouse_tts_enabled") !== "false";
  });

  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 初始化语音识别
  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const isRecognitionSupported = !!SpeechRecognition;

  useEffect(() => {
    if (isRecognitionSupported) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = "zh-CN";

      rec.onstart = () => {
        setIsRecording(true);
      };

      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInputText(transcript);
          handleSendQuery(transcript, true);
        }
      };

      rec.onerror = (event: any) => {
        console.error("语音识别错误:", event.error);
        setIsRecording(false);
      };

      rec.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = rec;
    }
  }, [isRecognitionSupported]);

  // 对话滚动置底
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // 根据 itemId 数组找到本地 store 里的物品详情
  const resolveMatchedItems = (itemIds: string[]) => {
    const resolved: { item: Item; areaName: string; containerName: string }[] = [];
    itemIds.forEach((id) => {
      for (const area of areas) {
        const item = area.items.find((it) => it.id === id);
        if (item) {
          let containerName = "";
          if (item.containerItemId) {
            for (const a of areas) {
              const c = a.items.find((it) => it.id === item.containerItemId);
              if (c) {
                containerName = c.name;
                break;
              }
            }
          }
          resolved.push({ item, areaName: area.name, containerName });
          break;
        }
      }
    });
    return resolved;
  };

  // 触发语音合成 (TTS) 播报
  const playSpeech = async (text: string) => {
    if (!isTtsEnabled) return;

    // 停止正在播放的音频
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    try {
      // 1. 尝试调用后端 TTS 接口
      const response = await authFetch("/api/ai/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.play().catch((e) => console.warn("音频播放失败:", e));
      } else if (response.status === 404) {
        // TTS 未配置 (TTS_NOT_CONFIGURED)，回退到浏览器本地 SpeechSynthesis
        fallbackToBrowserSpeech(text);
      } else {
        console.warn("后端 TTS 服务异常，尝试回退到浏览器本地朗读");
        fallbackToBrowserSpeech(text);
      }
    } catch (err) {
      console.warn("后端 TTS 请求出错，尝试回退到浏览器本地朗读:", err);
      fallbackToBrowserSpeech(text);
    }
  };

  // 浏览器本地 SpeechSynthesis 兜底
  const fallbackToBrowserSpeech = (text: string) => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel(); // 终止前一次发音
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "zh-CN";
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  // 发送查询到 AI 助手
  const handleSendQuery = async (queryText: string, isVoice = false) => {
    const textToSend = queryText.trim();
    if (!textToSend || isLoading) return;

    setInputText("");
    const userMsgId = Date.now().toString();
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", text: textToSend },
    ]);

    setIsLoading(true);

    try {
      const response = await authFetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: textToSend, houseId: currentHouseId }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "请求失败");
      }

      const resData = await response.json();
      const aiResponse = resData.result;

      const matchedItems = resolveMatchedItems(aiResponse.matchedItemIds);

      const aiMsgId = (Date.now() + 1).toString();
      setMessages((prev) => [
        ...prev,
        {
          id: aiMsgId,
          role: "assistant",
          text: aiResponse.answer,
          matchedItems,
        },
      ]);

      // 仅在是语音查询，且全局语音播放开启时才自动播报
      if (isVoice) {
        playSpeech(aiResponse.answer);
      }
    } catch (error: any) {
      console.error("AI 助手发生错误:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          text: `出错了：${error.message || "无法连接 AI 助理服务，请检查网络或 AI 接口配置。"}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMicClick = () => {
    if (!isRecognitionSupported) {
      alert("当前浏览器不支持原生语音转文字，请手动输入文字进行提问。");
      return;
    }

    if (isRecording) {
      recognitionRef.current?.stop();
    } else {
      // 停止正在播放的语音
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }

      recognitionRef.current?.start();
    }
  };

  const toggleTts = () => {
    const newVal = !isTtsEnabled;
    setIsTtsEnabled(newVal);
    localStorage.setItem("ihouse_tts_enabled", String(newVal));
    if (!newVal) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30 backdrop-blur-sm animate-fadeIn">
      {/* 遮罩关闭 */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* 助手面板 */}
      <div className="relative flex h-full w-full max-w-md flex-col border-l border-line bg-paper shadow-2xl animate-slideLeft">
        {/* 头部 */}
        <header className="flex h-16 items-center justify-between border-b border-line px-4 bg-cream/30">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded bg-clay-500 text-cream">
              <Sparkles size={16} className="animate-pulse" />
            </span>
            <div>
              <h2 className="font-serif text-sm font-semibold text-ink">智能查找助理</h2>
              <p className="text-3xs text-ink/40">语音询问 · 大模型纠错匹配</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTts}
              title={isTtsEnabled ? "关闭语音播报" : "开启语音播报"}
              className={cn(
                "p-2 rounded hover:bg-clay-100/50 transition-colors",
                isTtsEnabled ? "text-clay-600" : "text-ink/30"
              )}
            >
              {isTtsEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded text-ink/40 hover:bg-clay-100/50 hover:text-ink transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* 消息历史 */}
        <main className="flex-1 overflow-y-auto p-4 space-y-4 bg-cream/10">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex flex-col gap-1 max-w-[85%]",
                msg.role === "user" ? "ml-auto items-end" : "mr-auto items-start"
              )}
            >
              {/* 气泡与手动朗读按钮 */}
              <div className="flex items-center gap-1.5 max-w-full">
                <div
                  className={cn(
                    "p-3 rounded-lg text-sm shadow-sm leading-relaxed",
                    msg.role === "user"
                      ? "bg-clay-500 text-cream rounded-br-none"
                      : "bg-paper border border-line text-ink rounded-bl-none"
                  )}
                >
                  {msg.text}
                </div>
                {msg.role === "assistant" && (
                  <button
                    onClick={() => playSpeech(msg.text)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink/30 hover:text-clay-500 hover:bg-clay-100/50 transition-colors"
                    title="朗读此条回复"
                  >
                    <Volume2 size={13} />
                  </button>
                )}
              </div>

              {/* 命中物品展示 */}
              {msg.matchedItems && msg.matchedItems.length > 0 && (
                <div className="mt-2 w-full space-y-2 max-w-sm">
                  <p className="text-3xs font-semibold uppercase tracking-wider text-ink/40 pl-1">
                    查找到的物品：
                  </p>
                  {msg.matchedItems.map(({ item, areaName, containerName }) => (
                    <div key={item.id} className="rounded-lg shadow-sm overflow-hidden" onClick={onClose}>
                      <ItemCard
                        item={item}
                        areaName={areaName}
                        containerName={containerName}
                        viewMode="list"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Loading */}
          {isLoading && (
            <div className="flex items-center gap-2 text-ink/40 text-xs pl-1">
              <Loader2 className="animate-spin" size={14} />
              <span>智能助理思考中...</span>
            </div>
          )}
          <div ref={chatEndRef} />
        </main>

        {/* 底部输入栏 */}
        <footer className="border-t border-line p-3 bg-paper">
          {/* 麦克风录音中展示 */}
          {isRecording && (
            <div className="mb-3 flex items-center justify-between rounded-lg bg-clay-50 border border-clay-200 p-3 text-sm text-clay-700 animate-pulse">
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-red-500 animate-ping" />
                <span>正在倾听，请说话...</span>
              </div>
              <button
                onClick={handleMicClick}
                className="text-xs font-semibold text-clay-600 hover:text-clay-800"
              >
                说完了
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            {/* 麦克风按钮 */}
            <button
              onClick={handleMicClick}
              title={isRecording ? "停止录音" : "语音输入"}
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-sm transition-all",
                isRecording
                  ? "bg-red-500 text-white animate-pulse"
                  : "bg-clay-100 hover:bg-clay-200 text-ink/70 hover:text-ink"
              )}
            >
              {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
            </button>

            {/* 文字输入 */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendQuery(inputText, false);
              }}
              className="flex flex-1 items-center gap-2"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={
                  isRecording
                    ? "正在监听..."
                    : isRecognitionSupported
                    ? "输入或按左侧麦克风说话..."
                    : "输入你想查找的物品..."
                }
                disabled={isRecording}
                className="flex-1 rounded-full border border-line bg-cream/30 px-4 py-2.5 text-sm text-ink placeholder:text-ink/35 focus:border-clay-400 focus:outline-none focus:bg-paper"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || isLoading || isRecording}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-clay-500 text-cream shadow-sm hover:bg-clay-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <Send size={16} />
              </button>
            </form>
          </div>
        </footer>
      </div>
    </div>
  );
}

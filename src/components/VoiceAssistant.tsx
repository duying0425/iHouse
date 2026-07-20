import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, Volume2, VolumeX, Sparkles, X, Loader2, ChevronDown } from "lucide-react";
import { useAuthStore, authFetch } from "@/authStore";
import { useHomeStore } from "@/store";
import type { Item } from "@/types";
import ItemCard from "@/components/ItemCard";
import { cn } from "@/lib/utils";

// 解析简单的 Markdown 格式（粗体、换行、无序列表）
function renderMarkdown(text: string) {
  const lines = text.split("\n");
  return lines.map((line, lineIdx) => {
    let currentLine = line;
    let isListItem = false;

    if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
      isListItem = true;
      currentLine = line.trim().substring(2);
    }

    const parts = currentLine.split(/(\*\*.*?\*\*)/g);
    const content = parts.map((part, partIdx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={partIdx} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });

    if (isListItem) {
      return (
        <div key={lineIdx} className="flex items-start gap-1.5 pl-2 mt-1">
          <span className="text-ink/40 mt-1.5 h-1.5 w-1.5 rounded-full bg-ink/30 shrink-0" />
          <span className="flex-1">{content}</span>
        </div>
      );
    }

    return (
      <div key={lineIdx} className={lineIdx > 0 ? "min-h-[1rem]" : ""}>
        {content}
      </div>
    );
  });
}

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  matchedItems?: { item: Item; areaName: string; containerName: string }[];
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
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
  const [recordingMode, setRecordingMode] = useState<"browser" | "server" | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isTtsEnabled, setIsTtsEnabled] = useState(() => {
    return localStorage.getItem("ihouse_tts_enabled") !== "false";
  });
  const [platformWarning, setPlatformWarning] = useState<string | null>(null);
  const [speechConfigLoaded, setSpeechConfigLoaded] = useState(false);
  const [transcriptionEnabled, setTranscriptionEnabled] = useState(false);

  const hasResultRef = useRef<boolean>(false);
  const manualStopRef = useRef<boolean>(false);
  const recognitionHadErrorRef = useRef<boolean>(false);
  const recordingModeRef = useRef<"browser" | "server" | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const transcriptionAbortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const historyPushedRef = useRef(false);

  // 初始化语音识别
  const SpeechRecognition =
    typeof window !== "undefined"
      ? (window as unknown as Record<string, new () => SpeechRecognitionInstance>).SpeechRecognition ||
        (window as unknown as Record<string, new () => SpeechRecognitionInstance>).webkitSpeechRecognition
      : null;
  const isRecognitionSupported = !!SpeechRecognition;
  const isServerRecordingSupported =
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;
  const isMobile =
    typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const canUseVoice =
    isRecognitionSupported || (transcriptionEnabled && isServerRecordingSupported);

  const isSecure = typeof window !== "undefined" && window.isSecureContext;
  const isLocalhost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");
  const showSecurityWarning = !isSecure && !isLocalhost;

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    authFetch("/api/ai/speech-config")
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!cancelled) {
          setTranscriptionEnabled(response.ok && data.transcriptionEnabled === true);
          setSpeechConfigLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTranscriptionEnabled(false);
          setSpeechConfigLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!speechConfigLoaded || !isMobile || transcriptionEnabled) {
      setPlatformWarning(null);
      return;
    }
    setPlatformWarning(
      "当前未配置服务端语音转写。安卓浏览器的原生识别可能依赖外部在线服务，即使显示麦克风按钮也可能无法返回结果；仍可使用文字输入。"
    );
  }, [isMobile, speechConfigLoaded, transcriptionEnabled]);

  const discardMediaCapture = useCallback(() => {
    if (recordingTimerRef.current !== null) {
      window.clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onerror = null;
      recorder.onstop = null;
      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // ignore
        }
      }
    }
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    recordingModeRef.current = null;
  }, []);

  const requestClose = useCallback(() => {
    const shouldConsumeHistoryEntry =
      historyPushedRef.current &&
      Boolean(window.history.state?.ihouseVoiceAssistant);
    historyPushedRef.current = false;
    onClose();
    if (shouldConsumeHistoryEntry) {
      window.history.back();
    }
  }, [onClose]);

  // 移动端将面板作为一层历史记录：安卓系统返回键先关闭面板，而不是离开当前页面。
  useEffect(() => {
    if (!isOpen) return;

    if (!window.history.state?.ihouseVoiceAssistant) {
      window.history.pushState(
        { ...window.history.state, ihouseVoiceAssistant: true },
        "",
        window.location.href
      );
    }
    historyPushedRef.current = true;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handlePopState = () => {
      historyPushedRef.current = false;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, requestClose]);

  // 组件卸载时清理录音资源
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
      discardMediaCapture();
      transcriptionAbortRef.current?.abort();
    };
  }, [discardMediaCapture]);

  // 在关闭助手面板时进行清理
  useEffect(() => {
    if (!isOpen) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
      setIsRecording(false);
      setRecordingMode(null);
      setErrorMsg(null);
      discardMediaCapture();
      transcriptionAbortRef.current?.abort();
      transcriptionAbortRef.current = null;
      setIsTranscribing(false);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    }
  }, [discardMediaCapture, isOpen]);

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

      let resData: { result?: { answer: string; matchedItemIds: string[] }; error?: string } = {};
      try {
        resData = await response.json();
      } catch {
        // 防止解析 HTML/非 JSON 错误响应时报错
      }

      if (!response.ok) {
        throw new Error(resData.error || `请求失败 (HTTP ${response.status})`);
      }

      const aiResponse = resData.result;
      if (!aiResponse) {
        throw new Error("AI 助手响应数据格式不正确");
      }

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
    } catch (error) {
      console.error("AI 助手发生错误:", error);
      const message = error instanceof Error ? error.message : "无法连接 AI 助理服务，请检查网络或 AI 接口配置。";
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          text: `出错了：${message}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const uploadSpeechRecording = async (audioBlob: Blob) => {
    if (audioBlob.size < 512) {
      setErrorMsg("录音时间太短，请按下麦克风后完整说出要查找的物品。");
      return;
    }

    setIsTranscribing(true);
    setErrorMsg(null);
    const controller = new AbortController();
    transcriptionAbortRef.current = controller;

    try {
      const mimeType = audioBlob.type.split(";")[0] || "audio/webm";
      const extension = mimeType === "audio/mp4"
        ? "m4a"
        : mimeType === "audio/mpeg"
        ? "mp3"
        : mimeType === "audio/wav" || mimeType === "audio/x-wav"
        ? "wav"
        : mimeType === "audio/ogg"
        ? "ogg"
        : "webm";
      const form = new FormData();
      form.append("file", audioBlob, `speech.${extension}`);

      const response = await authFetch("/api/ai/transcribe", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `语音转写失败 (HTTP ${response.status})`);
      }

      const transcript = typeof data.text === "string" ? data.text.trim() : "";
      if (!transcript) throw new Error("没有识别到清晰的语音，请重新录制");
      setInputText(transcript);
      await handleSendQuery(transcript, true);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("服务端语音转写失败:", error);
      setErrorMsg(error instanceof Error ? error.message : "语音转写失败，请稍后重试");
    } finally {
      if (transcriptionAbortRef.current === controller) {
        transcriptionAbortRef.current = null;
        setIsTranscribing(false);
      }
    }
  };

  const startServerRecording = async () => {
    if (!transcriptionEnabled) {
      setErrorMsg("服务端语音转写尚未配置，请暂时使用文字输入。");
      return;
    }
    if (!isServerRecordingSupported) {
      setErrorMsg("当前浏览器无法录制音频，请升级浏览器或使用文字输入。");
      return;
    }

    try {
      setErrorMsg(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const preferredTypes = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ];
      const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recordingModeRef.current = "server";
      setRecordingMode("server");

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onerror = (event: Event) => {
        console.error("MediaRecorder error:", event);
        setErrorMsg("录音过程中发生错误，请检查麦克风权限后重试。");
        setIsRecording(false);
        setRecordingMode(null);
        discardMediaCapture();
      };
      recorder.onstop = () => {
        if (recordingTimerRef.current !== null) {
          window.clearTimeout(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        const chunks = audioChunksRef.current;
        audioChunksRef.current = [];
        const recordedType = recorder.mimeType || mimeType || "audio/webm";

        mediaRecorderRef.current = null;
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        recordingModeRef.current = null;
        setIsRecording(false);
        setRecordingMode(null);

        void uploadSpeechRecording(new Blob(chunks, { type: recordedType }));
      };
      recorder.onstart = () => {
        setIsRecording(true);
      };

      recorder.start(250);
      recordingTimerRef.current = window.setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, 30_000);
    } catch (error) {
      discardMediaCapture();
      setIsRecording(false);
      setRecordingMode(null);
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setErrorMsg("麦克风访问被拒绝，请在浏览器和系统设置中允许麦克风权限，并确认使用 HTTPS 访问。");
      } else if (name === "NotFoundError") {
        setErrorMsg("没有找到可用的麦克风设备。");
      } else {
        setErrorMsg(error instanceof Error ? `启动录音失败：${error.message}` : "启动录音失败，请稍后重试。");
      }
    }
  };

  const startSpeechRecognition = () => {
    if (!SpeechRecognition) return;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "zh-CN";

    rec.onstart = () => {
      setIsRecording(true);
      setRecordingMode("browser");
      recordingModeRef.current = "browser";
      setErrorMsg(null);
      hasResultRef.current = false;
      recognitionHadErrorRef.current = false;
    };

    rec.onresult = (event: unknown) => {
      const ev = event as { results: { [key: number]: { [key: number]: { transcript: string } } } };
      const transcript = ev.results[0]?.[0]?.transcript?.trim();
      if (transcript) {
        hasResultRef.current = true;
        setInputText(transcript);
        void handleSendQuery(transcript, true);
      }
    };

    rec.onerror = (event: unknown) => {
      const ev = event as { error: string };
      console.error("语音识别错误:", ev.error);
      recognitionHadErrorRef.current = true;
      setIsRecording(false);
      setRecordingMode(null);

      let msg = "语音识别发生错误";
      if (ev.error === "not-allowed") {
        msg = "麦克风访问被拒绝，请检查浏览器或操作系统设置。";
      } else if (ev.error === "service-not-allowed") {
        msg = "语音服务未允许，移动端浏览器可能需要安全的 HTTPS 连接，或需要启用系统的语音听写功能。";
      } else if (ev.error === "no-speech") {
        msg = "未检测到说话声音，请靠近麦克风再试一次。";
      } else if (ev.error === "network") {
        msg = "浏览器在线语音服务连接失败。移动端建议由管理员配置服务端语音转写，或暂时使用文字输入。";
      } else if (ev.error !== "aborted") {
        msg = `语音识别错误: ${ev.error}`;
      }

      if (ev.error !== "aborted") {
        setErrorMsg(msg);
      }
    };

    rec.onend = () => {
      setIsRecording(false);
      setRecordingMode(null);
      recordingModeRef.current = null;
      recognitionRef.current = null;
      if (!hasResultRef.current && !manualStopRef.current && !recognitionHadErrorRef.current) {
        setErrorMsg("没有识别到语音，请靠近麦克风并完整说出要查找的物品。");
      }
    };

    recognitionRef.current = rec;

    try {
      rec.start();
    } catch (err) {
      console.error("启动语音识别失败:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`启动失败: ${msg}`);
      setIsRecording(false);
    }
  };

  const handleMicClick = () => {
    if (isTranscribing) return;
    if (showSecurityWarning) {
      setErrorMsg("移动端语音输入必须通过 HTTPS 使用。请改用已配置 HTTPS 的访问地址后重试。");
      return;
    }
    if (isRecording) {
      if (recordingModeRef.current === "server") {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      } else {
        manualStopRef.current = true;
        recognitionRef.current?.stop();
      }
    } else {
      manualStopRef.current = false;
      // 开始识别前停止正在播放的语音，避免把扬声器声音再次录入。
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }

      const shouldUseServerRecording =
        transcriptionEnabled &&
        isServerRecordingSupported &&
        (isMobile || !isRecognitionSupported);
      if (shouldUseServerRecording) {
        void startServerRecording();
      } else if (isRecognitionSupported) {
        startSpeechRecognition();
      } else {
        setErrorMsg(
          transcriptionEnabled
            ? "当前浏览器无法录制音频，请升级浏览器或使用文字输入。"
            : "当前浏览器不支持原生语音识别，且服务端语音转写尚未配置，请暂时使用文字输入。"
        );
      }
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
    <div className="fixed inset-0 z-50 flex h-[100dvh] items-end overflow-hidden bg-ink/30 backdrop-blur-sm animate-fadeIn md:items-stretch md:justify-end">
      {/* 遮罩关闭 */}
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        onClick={requestClose}
        aria-label="关闭智能查找助理"
      />

      {/* 助手面板 */}
      <section
        role="dialog"
        aria-modal="true"
        aria-label="智能查找助理"
        className="relative flex h-[88dvh] max-h-[calc(100dvh-env(safe-area-inset-top)-0.5rem)] min-h-0 w-full flex-col overflow-hidden rounded-t-2xl border-x border-t border-line bg-paper shadow-2xl animate-slideUp md:h-full md:max-h-none md:max-w-md md:rounded-none md:border-y-0 md:border-r-0 md:border-l md:animate-slideLeft"
      >
        <div className="flex h-5 shrink-0 items-center justify-center md:hidden" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-ink/20" />
        </div>
        {/* 头部 */}
        <header className="flex min-h-[3.5rem] shrink-0 items-center justify-between border-b border-line bg-cream/30 px-3 md:min-h-[4rem] md:px-4 md:pt-[env(safe-area-inset-top)]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={requestClose}
              className="mr-1 flex h-9 w-9 items-center justify-center rounded-full bg-clay-50 text-ink/70 transition-colors hover:bg-clay-100 hover:text-ink md:hidden"
              title="收起并返回"
              aria-label="收起智能查找助理并返回"
            >
              <ChevronDown size={21} />
            </button>
            <span className="flex h-8 w-8 items-center justify-center rounded bg-clay-500 text-cream shrink-0">
              <Sparkles size={16} className="animate-pulse" />
            </span>
            <div className="min-w-0">
              <h2 className="font-serif text-sm font-semibold text-ink truncate">智能查找助理</h2>
              <p className="text-3xs text-ink/40 truncate">语音询问 · 大模型纠错匹配</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
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
              type="button"
              onClick={requestClose}
              className="p-2 rounded text-ink/40 hover:bg-clay-100/50 hover:text-ink transition-colors"
              title="关闭智能查找助理"
              aria-label="关闭智能查找助理"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* 消息历史 */}
        <main className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-cream/10 p-4">
          {showSecurityWarning && (
            <div className="rounded bg-clay-50/70 border border-clay-200 p-3.5 text-xs text-clay-800 leading-relaxed shadow-sm mb-2">
              <span className="font-semibold text-clay-700">⚠️ 安全连接提示：</span>
              当前访问未使用安全连接 (HTTPS)。在移动设备上，浏览器通常出于隐私保护会禁用非 HTTPS 网站的麦克风与语音功能。若语音输入异常，请改用安全连接访问。
            </div>
          )}
          {platformWarning && (
            <div className="rounded bg-clay-50/70 border border-clay-200 p-3.5 text-xs text-clay-800 leading-relaxed shadow-sm mb-2 animate-fadeIn">
              <span className="font-semibold text-clay-700">⚠️ 语音能力提示：</span>
              {platformWarning}
            </div>
          )}
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
                  {msg.role === "user" ? msg.text : renderMarkdown(msg.text)}
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
                    <div key={item.id} className="rounded-lg shadow-sm overflow-hidden" onClick={requestClose}>
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
        <footer className="shrink-0 border-t border-line bg-paper p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          {/* 语音识别错误提示 */}
          {errorMsg && (
            <div className="mb-3 flex items-center justify-between rounded bg-red-50/80 border border-red-200 p-3 text-xs text-red-700 animate-fadeIn">
              <div className="flex items-center gap-1.5">
                <span className="flex h-1.5 w-1.5 rounded-full bg-red-500 shrink-0 animate-pulse" />
                <span>{errorMsg}</span>
              </div>
              <button
                onClick={() => setErrorMsg(null)}
                className="text-2xs font-semibold text-red-500 hover:text-red-700 shrink-0 ml-2"
              >
                忽略
              </button>
            </div>
          )}

          {/* 麦克风录音中展示 */}
          {isRecording && (
            <div className="mb-3 flex items-center justify-between rounded-lg bg-clay-50 border border-clay-200 p-3 text-sm text-clay-700 animate-pulse">
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-red-500 animate-ping" />
                <span>{recordingMode === "server" ? "正在录音，请说话..." : "正在倾听，请说话..."}</span>
              </div>
              <button
                onClick={handleMicClick}
                className="text-xs font-semibold text-clay-600 hover:text-clay-800"
              >
                说完了
              </button>
            </div>
          )}

          {isTranscribing && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-clay-200 bg-clay-50 p-3 text-sm text-clay-700">
              <Loader2 size={16} className="animate-spin" />
              <span>正在把录音转换为文字...</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            {/* 麦克风按钮 */}
            <button
              type="button"
              onClick={handleMicClick}
              disabled={isTranscribing}
              title={isTranscribing ? "正在转换语音" : isRecording ? "停止录音" : "语音输入"}
              aria-label={isTranscribing ? "正在转换语音" : isRecording ? "停止录音" : "开始语音输入"}
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-sm transition-all disabled:cursor-wait disabled:opacity-60",
                isRecording
                  ? "bg-red-500 text-white animate-pulse"
                  : "bg-clay-100 hover:bg-clay-200 text-ink/70 hover:text-ink"
              )}
            >
              {isTranscribing ? <Loader2 size={20} className="animate-spin" /> : isRecording ? <MicOff size={20} /> : <Mic size={20} />}
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
                    : isTranscribing
                    ? "正在转换语音..."
                    : canUseVoice
                    ? "输入或按左侧麦克风说话..."
                    : "输入你想查找的物品..."
                }
                disabled={isRecording || isTranscribing}
                className="flex-1 rounded-full border border-line bg-cream/30 px-4 py-2.5 text-sm text-ink placeholder:text-ink/35 focus:border-clay-400 focus:outline-none focus:bg-paper"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || isLoading || isRecording || isTranscribing}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-clay-500 text-cream shadow-sm hover:bg-clay-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <Send size={16} />
              </button>
            </form>
          </div>
        </footer>
      </section>
    </div>
  );
}

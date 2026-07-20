import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Home as HomeIcon, LogIn, UserPlus, ArrowLeft } from "lucide-react";
import { useAuthStore } from "@/authStore";

type Mode = "login" | "register";

interface TurnstileObject {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      size?: "normal" | "flexible" | "compact";
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: (errorCode: string) => boolean | void;
      "timeout-callback"?: () => void;
      "unsupported-callback"?: () => void;
      retry?: "auto" | "never";
      "retry-interval"?: number;
      "refresh-expired"?: "auto" | "manual" | "never";
      "refresh-timeout"?: "auto" | "manual" | "never";
    }
  ) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId?: string) => void;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register } = useAuthStore();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [turnstileConfig, setTurnstileConfig] = useState({ enabled: false, siteKey: "" });
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const [turnstileStatus, setTurnstileStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [turnstileError, setTurnstileError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    fetch("/api/auth/config")
      .then((r) => r.json())
      .then((data) => {
        if (data.turnstileEnabled) {
          setTurnstileConfig({ enabled: true, siteKey: data.turnstileSiteKey });
        }
      })
      .catch((err) => console.error("获取 Turnstile 配置失败", err));
  }, []);

  useEffect(() => {
    setTurnstileToken(null);
    setTurnstileError(null);
    if (!turnstileConfig.enabled) {
      setTurnstileStatus("idle");
      return;
    }

    setTurnstileStatus("loading");

    let widgetId: string | null = null;
    let isCleanedUp = false;
    let script = document.getElementById("cf-turnstile-script") as HTMLScriptElement | null;

    const showWidgetError = (message: string) => {
      if (isCleanedUp) return;
      setTurnstileToken(null);
      setTurnstileError(message);
      setTurnstileStatus("error");
    };

    const renderWidget = () => {
      if (isCleanedUp) return;
      const turnstile = (window as unknown as { turnstile?: TurnstileObject }).turnstile;
      if (!turnstile || !turnstileContainerRef.current) return;

      try {
        widgetId = turnstile.render(turnstileContainerRef.current, {
          sitekey: turnstileConfig.siteKey,
          size: "flexible",
          retry: "auto",
          "retry-interval": 8000,
          "refresh-expired": "auto",
          "refresh-timeout": "auto",
          callback: (token: string) => {
            setTurnstileToken(token);
            setTurnstileError(null);
            setTurnstileStatus("ready");
          },
          "expired-callback": () => {
            setTurnstileToken(null);
            setTurnstileStatus("ready");
          },
          "timeout-callback": () => {
            showWidgetError("安全验证等待操作超时，请重新加载后再试");
          },
          "unsupported-callback": () => {
            showWidgetError("当前浏览器不支持安全验证，请升级或更换浏览器");
          },
          "error-callback": (errorCode: string) => {
            console.error("Turnstile widget error:", errorCode);
            const family = Number.parseInt(errorCode, 10);
            const message = Number.isFinite(family) && Math.floor(family / 1000) === 110
              ? "安全验证配置异常，请联系管理员检查站点域名和密钥"
              : "当前网络或浏览器无法连接安全验证服务，请切换网络后重试";
            showWidgetError(message);
            return true;
          },
        });
        // render 成功说明 iframe 已挂载；token 仍只由 callback 标记为通过。
        setTurnstileStatus("ready");
      } catch (err) {
        console.error("Turnstile render error:", err);
        showWidgetError("安全验证初始化失败，请重新加载后再试");
      }
    };

    const handleScriptLoad = () => {
      if (script) script.dataset.loadState = "loaded";
      renderWidget();
    };
    const handleScriptError = () => {
      if (script) script.dataset.loadState = "error";
      showWidgetError("安全验证脚本加载失败，请检查网络、广告拦截器或 DNS 设置");
    };

    const existingTurnstile = (window as unknown as { turnstile?: TurnstileObject }).turnstile;
    if (existingTurnstile) {
      renderWidget();
    } else {
      // 只有明确加载失败的 script 才重新创建；已加载的全局对象不会被删除。
      if (script?.dataset.loadState === "error") {
        script.remove();
        script = null;
      }
      if (!script) {
        script = document.createElement("script");
        script.id = "cf-turnstile-script";
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.dataset.loadState = "loading";
        script.addEventListener("load", handleScriptLoad);
        script.addEventListener("error", handleScriptError);
        document.body.appendChild(script);
      } else {
        script.addEventListener("load", handleScriptLoad);
        script.addEventListener("error", handleScriptError);
      }
    }

    // 移动网络留出更合理的加载时间，同时避免永远停在 loading。
    const loadTimeout = window.setTimeout(() => {
      if (widgetId === null) {
        showWidgetError("安全验证加载超时，请切换网络后重新加载");
      }
    }, 15_000);

    return () => {
      isCleanedUp = true;
      window.clearTimeout(loadTimeout);
      script?.removeEventListener("load", handleScriptLoad);
      script?.removeEventListener("error", handleScriptError);
      if (widgetId !== null) {
        const turnstileCleanup = (window as unknown as { turnstile?: TurnstileObject }).turnstile;
        if (turnstileCleanup) {
          try {
            turnstileCleanup.remove(widgetId);
          } catch {
            // ignore
          }
        }
      }
    };
  }, [turnstileConfig, mode, retryCount]);

  // 登录成功后跳转到来源页或房屋列表
  const redirectTo = (location.state as { from?: string } | null)?.from || "/houses";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        if (turnstileConfig.enabled && !turnstileToken) {
          setError("请先完成人机验证");
          setBusy(false);
          return;
        }
        await login(username.trim(), password, turnstileToken || undefined);
      } else {
        if (turnstileConfig.enabled && !turnstileToken) {
          setError("请先完成人机验证");
          setBusy(false);
          return;
        }
        await register(
          username.trim(),
          password,
          displayName.trim() || undefined,
          turnstileToken || undefined
        );
      }
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
      const turnstile = (window as unknown as { turnstile?: TurnstileObject }).turnstile;
      if (turnstileConfig.enabled && turnstile) {
        try {
          turnstile.reset();
        } catch {
          // ignore
        }
        setTurnstileToken(null);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4 py-12">
      <div className="w-full max-w-md">
        {/* 品牌 */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-clay-500 text-cream">
            <HomeIcon size={24} />
          </div>
          <h1 className="font-serif text-2xl font-semibold text-ink">居所图鉴</h1>
          <p className="mt-1 text-2xs text-ink/55">家庭设施与物品档案</p>
        </div>

        {/* Tab 切换 */}
        <div className="mb-4 flex rounded-lg border border-line bg-paper p-1">
          <button
            type="button"
            onClick={() => { setMode("login"); setError(null); }}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-sm transition-colors ${
              mode === "login" ? "bg-clay-500 text-cream" : "text-ink/60 hover:text-ink"
            }`}
          >
            <LogIn size={15} /> 登录
          </button>
          <button
            type="button"
            onClick={() => { setMode("register"); setError(null); }}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-sm transition-colors ${
              mode === "register" ? "bg-clay-500 text-cream" : "text-ink/60 hover:text-ink"
            }`}
          >
            <UserPlus size={15} /> 注册
          </button>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-3 p-5">
          <label className="flex flex-col gap-1">
            <span className="text-2xs uppercase tracking-wider text-ink/55">
              用户名
            </span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
              minLength={3}
              maxLength={32}
              placeholder="3-32 位，字母/数字/下划线/中文"
              className="field"
            />
          </label>

          {mode === "register" && (
            <label className="flex flex-col gap-1">
              <span className="text-2xs uppercase tracking-wider text-ink/55">
                显示名（可选）
              </span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={32}
                placeholder="如：爸爸 / 妈妈 / 张三"
                className="field"
              />
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-2xs uppercase tracking-wider text-ink/55">
              密码
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              maxLength={128}
              placeholder="至少 6 位"
              className="field"
            />
          </label>

          {turnstileConfig.enabled && (
            <div className="my-2 border border-line rounded bg-paper/50 p-2 text-center min-h-[85px] flex flex-col items-center justify-center transition-all duration-300">
              <div
                ref={turnstileContainerRef}
                className={`${turnstileStatus === "ready" ? "block" : "hidden"} w-full flex justify-center`}
              />

              {turnstileStatus === "loading" && (
                <div className="flex flex-col items-center gap-1.5 py-1 text-ink/65 text-2xs animate-pulse">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-clay-500 border-t-transparent" />
                  <span>正在加载安全验证...</span>
                </div>
              )}

              {turnstileStatus === "error" && (
                <div className="flex flex-col items-center gap-2 py-1 text-ochre text-2xs">
                  <span>{turnstileError || "安全验证加载失败，请稍后重试"}</span>
                  <button
                    type="button"
                    onClick={() => setRetryCount((prev) => prev + 1)}
                    className="px-3 py-1 rounded bg-ochre/10 hover:bg-ochre/20 text-ochre font-medium border border-ochre/20 active:scale-95 transition-all"
                  >
                    重新加载
                  </button>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="rounded bg-ochre/10 px-3 py-2 text-2xs text-ochre">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="btn-primary w-full disabled:opacity-50"
          >
            {busy ? "处理中…" : mode === "login" ? "登录" : "注册"}
          </button>

          <p className="text-center text-2xs text-ink/45">
            {mode === "login" ? "还没有账号？点上方「注册」" : "已有账号？点上方「登录」"}
          </p>
        </form>

        <div className="mt-4 flex flex-col items-center gap-2">
          <Link
            to="/"
            className="flex items-center gap-1 text-xs text-clay-600 hover:text-clay-700 font-medium transition-colors"
          >
            <ArrowLeft size={14} /> 返回演示主页
          </Link>
          <p className="text-center text-2xs text-ink/35">
            家庭内部使用 · 数据与家人共享
          </p>
        </div>
      </div>
    </div>
  );
}

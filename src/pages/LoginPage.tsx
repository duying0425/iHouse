import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Home as HomeIcon, LogIn, UserPlus } from "lucide-react";
import { useAuthStore } from "@/authStore";

type Mode = "login" | "register";

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

  // 登录成功后跳转到来源页或房屋列表
  const redirectTo = (location.state as { from?: string } | null)?.from || "/houses";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await login(username.trim(), password);
      } else {
        await register(username.trim(), password, displayName.trim() || undefined);
      }
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
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

        <p className="mt-4 text-center text-2xs text-ink/35">
          家庭内部使用 · 数据与家人共享
        </p>
      </div>
    </div>
  );
}

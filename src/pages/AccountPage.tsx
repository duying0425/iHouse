import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Github,
  Loader2,
  LogIn,
  Mail,
  MessageCircle,
  Save,
  Settings2,
} from "lucide-react";
import PageLayout from "@/components/PageLayout";
import { useAuthStore, authFetch } from "@/authStore";
import { cn } from "@/lib/utils";

export default function AccountPage() {
  const { user } = useAuthStore();
  return (
    <PageLayout title="账户" subtitle="账户安全 · 关于与反馈" showActions={false}>
      <nav className="mb-5 flex items-center gap-1 text-2xs text-ink/45">
        <Link to="/" className="hover:text-clay-500">
          居所图鉴
        </Link>
        <span className="text-ink/30">/</span>
        <span className="text-ink/70">账户</span>
      </nav>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {/* 账户安全：修改密码 */}
        <AccountSecurityCard />

        {/* 关于与反馈 */}
        <AboutCard />
      </div>

      <div className="mt-6">
        <Link to="/" className="btn-ghost">
          <ArrowLeft size={15} /> 返回首页
        </Link>
      </div>
    </PageLayout>
  );
}

/** 账户安全：修改密码 */
function AccountSecurityCard() {
  const { user } = useAuthStore();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // 未登录：提示去登录
  if (!user) {
    return (
      <div className="card p-4">
        <div className="mb-3 flex items-center gap-1.5 font-serif text-sm font-semibold text-ink">
          <Settings2 size={14} /> 账户安全
        </div>
        <p className="mb-3 text-2xs text-ink/55">
          登录后可修改密码、管理账户。
        </p>
        <Link to="/login" className="btn-primary w-full">
          <LogIn size={14} /> 去登录
        </Link>
      </div>
    );
  }

  const submit = async () => {
    setMsg(null);
    if (!current || !next || !confirm) {
      setMsg({ type: "err", text: "请填写所有字段" });
      return;
    }
    if (next !== confirm) {
      setMsg({ type: "err", text: "两次输入的新密码不一致" });
      return;
    }
    if (next.length < 6 || next.length > 128) {
      setMsg({ type: "err", text: "新密码长度需 6-128 位" });
      return;
    }
    setBusy(true);
    try {
      const res = await authFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "修改失败");
      setMsg({ type: "ok", text: "密码已更新" });
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "修改失败" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center gap-1.5 font-serif text-sm font-semibold text-ink">
        <Settings2 size={14} /> 账户安全
      </div>
      <p className="mb-3 text-2xs text-ink/45">
        当前账号：<span className="text-ink/70">{user.username}</span>
      </p>
      <div className="space-y-2">
        {/* 隐藏的用户名文本框，用于吸收浏览器密码管理器自动填充，防止污染其他页面的普通文本输入框 */}
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={user.username || ""}
          readOnly
          className="hidden"
        />
        <input
          type="password"
          placeholder="当前密码"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className="input"
          autoComplete="current-password"
        />
        <input
          type="password"
          placeholder="新密码（6-128 位）"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className="input"
          autoComplete="new-password"
        />
        <input
          type="password"
          placeholder="确认新密码"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="input"
          autoComplete="new-password"
        />
        {msg && (
          <p className={cn("text-2xs", msg.type === "ok" ? "text-moss" : "text-clay-600")}>
            {msg.text}
          </p>
        )}
        <button
          onClick={submit}
          disabled={busy}
          className="btn-primary w-full disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          修改密码
        </button>
      </div>
    </div>
  );
}

/** 关于与反馈：作者联系方式 */
function AboutCard() {
  const [qrError, setQrError] = useState(false);
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center gap-1.5 font-serif text-sm font-semibold text-ink">
        <MessageCircle size={14} /> 关于与反馈
      </div>
      <p className="mb-3 text-2xs text-ink/55">
        iHouse · 居所图鉴。遇到问题或建议欢迎联系作者：
      </p>
      <div className="space-y-2 text-2xs">
        <a
          href="mailto:duying0425@163.com"
          className="flex items-center gap-2 text-ink/75 hover:text-clay-500"
        >
          <Mail size={13} /> dlying0425@163.com
        </a>
        <a
          href="https://github.com/duying0425/iHouse/issues"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-ink/75 hover:text-clay-500"
        >
          <Github size={13} /> GitHub Issues
        </a>
      </div>
      <div className="mt-3 flex flex-col items-center gap-1.5">
        {qrError ? (
          <div className="flex h-32 w-32 items-center justify-center rounded border border-line bg-ink/5 text-center text-2xs text-ink/40">
            二维码未配置
          </div>
        ) : (
          <img
            src="/wechat-qr.png"
            alt="作者微信二维码"
            className="h-32 w-32 rounded border border-line object-contain"
            onError={() => setQrError(true)}
          />
        )}
        <p className="text-2xs text-ink/45">扫码加作者微信</p>
      </div>
    </div>
  );
}

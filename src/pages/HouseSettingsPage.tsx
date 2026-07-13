import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Copy,
  Crown,
  LogOut,
  Settings,
  UserMinus,
  X,
} from "lucide-react";
import PageLayout from "@/components/PageLayout";
import { authFetch, useAuthStore } from "@/authStore";
import { cn } from "@/lib/utils";

interface Member {
  userId: number;
  username: string;
  displayName: string | null;
  role: "admin" | "member";
  status: "pending" | "approved" | "rejected";
  joinedAt: string | null;
}

export default function HouseSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, houses } = useAuthStore();
  const myHouse = houses.find((h) => h.id === id);

  const [house, setHouse] = useState<{
    id: string;
    name: string;
    shareCode: string;
  } | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [myRole, setMyRole] = useState<"admin" | "member" | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void loadHouse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadHouse() {
    if (!id) return;
    setError(null);
    try {
      const res = await authFetch(`/api/houses/${id}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "无法访问房屋");
      }
      const data = await res.json();
      setHouse(data.house);
      setMyRole(data.myRole);

      const mres = await authFetch(`/api/houses/${id}/members`);
      if (mres.ok) {
        const mdata = await mres.json();
        setMembers(mdata.members || []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }

  async function approveMember(userId: number) {
    if (!id) return;
    setBusy(true);
    try {
      const res = await authFetch(`/api/houses/${id}/members/${userId}/approve`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("审批失败");
      await loadHouse();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function rejectMember(userId: number) {
    if (!id) return;
    setBusy(true);
    try {
      const res = await authFetch(`/api/houses/${id}/members/${userId}/reject`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("拒绝失败");
      await loadHouse();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(userId: number) {
    if (!id) return;
    const m = members.find((mm) => mm.userId === userId);
    if (!m) return;
    const isSelf = user?.id === userId;
    const tip = isSelf
      ? "确定退出该房屋？退出后将无法访问该房屋数据"
      : `确定移除成员「${m.displayName || m.username}」？`;
    if (!confirm(tip)) return;
    setBusy(true);
    try {
      const res = await authFetch(`/api/houses/${id}/members/${userId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "移除失败");
      }
      if (isSelf) {
        navigate("/houses");
        return;
      }
      await loadHouse();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  const copyShareCode = () => {
    if (!house) return;
    navigator.clipboard?.writeText(house.shareCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  if (error && !house) {
    return (
      <PageLayout title="房屋设置" showActions={false}>
        <div className="mx-auto max-w-2xl">
          <button
            onClick={() => navigate("/houses")}
            className="btn-ghost mb-4"
          >
            <ArrowLeft size={15} /> 返回房屋列表
          </button>
          <div className="card p-6 text-center">
            <p className="text-sm text-ochre">{error}</p>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (!house) {
    return (
      <PageLayout title="房屋设置" showActions={false}>
        <div className="mx-auto max-w-2xl text-center text-2xs text-ink/45">
          加载中…
        </div>
      </PageLayout>
    );
  }

  const isAdmin = myRole === "admin";
  const pendingMembers = members.filter((m) => m.status === "pending");
  const approvedMembers = members.filter((m) => m.status === "approved");

  return (
    <PageLayout
      title="房屋设置"
      subtitle={house.name}
      showActions={false}
    >
      <div className="mx-auto max-w-2xl space-y-5">
        <nav className="flex items-center gap-1 text-2xs text-ink/45">
          <button onClick={() => navigate("/houses")} className="hover:text-clay-500">
            我的房屋
          </button>
          <span>/</span>
          <span className="text-ink/70">{house.name}</span>
        </nav>

        {/* 房屋信息 + 分享码 */}
        <section className="card p-4">
          <h3 className="mb-3 flex items-center gap-1.5 font-serif text-sm font-semibold text-ink">
            <Settings size={15} className="text-clay-500" /> 房屋信息
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-2xs uppercase tracking-wider text-ink/55">名称</span>
              <span className="text-ink">{house.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-2xs uppercase tracking-wider text-ink/55">分享码</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-clay-600">{house.shareCode}</span>
                <button
                  onClick={copyShareCode}
                  className="rounded p-1 text-ink/45 hover:bg-clay-50 hover:text-clay-500"
                  title="复制分享码"
                >
                  {copied ? <Check size={13} className="text-moss" /> : <Copy size={13} />}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-2xs uppercase tracking-wider text-ink/55">我的角色</span>
              <span className="text-ink">{isAdmin ? "管理员" : "成员"}</span>
            </div>
          </div>
          <p className="mt-3 text-2xs text-ink/45">
            {isAdmin
              ? "把分享码发给家人，他们提交后你可在此处审批"
              : "如需邀请家人，请联系管理员获取分享码"}
          </p>
        </section>

        {error && (
          <p className="rounded bg-ochre/10 px-3 py-2 text-2xs text-ochre">{error}</p>
        )}

        {/* 待审批（仅 admin 可见） */}
        {isAdmin && pendingMembers.length > 0 && (
          <section className="card p-4">
            <h3 className="mb-3 flex items-center gap-1.5 font-serif text-sm font-semibold text-ink">
              待审批
              <span className="text-2xs text-ink/45">({pendingMembers.length})</span>
            </h3>
            <ul className="space-y-2">
              {pendingMembers.map((m) => (
                <li
                  key={m.userId}
                  className="flex items-center gap-3 rounded border border-line bg-cream p-2.5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm text-ink">
                      {m.displayName || m.username}
                    </p>
                    <p className="text-2xs text-ink/45">@{m.username}</p>
                  </div>
                  <button
                    onClick={() => rejectMember(m.userId)}
                    disabled={busy}
                    className="btn-ghost text-2xs text-ochre"
                    title="拒绝"
                  >
                    <X size={13} /> 拒绝
                  </button>
                  <button
                    onClick={() => approveMember(m.userId)}
                    disabled={busy}
                    className="btn-primary text-2xs"
                    title="通过"
                  >
                    <Check size={13} /> 通过
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 成员列表 */}
        <section className="card p-4">
          <h3 className="mb-3 flex items-center gap-1.5 font-serif text-sm font-semibold text-ink">
            成员
            <span className="text-2xs text-ink/45">({approvedMembers.length})</span>
          </h3>
          <ul className="space-y-2">
            {approvedMembers.map((m) => {
              const isSelf = user?.id === m.userId;
              const canRemove = isAdmin || isSelf;
              return (
                <li
                  key={m.userId}
                  className="flex items-center gap-3 rounded border border-line bg-cream p-2.5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-sm text-ink">
                      {m.displayName || m.username}
                      {m.role === "admin" && (
                        <Crown size={12} className="text-clay-500" />
                      )}
                      {isSelf && (
                        <span className="text-2xs text-ink/45">（你）</span>
                      )}
                    </p>
                    <p className="text-2xs text-ink/45">@{m.username}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-2xs",
                      m.role === "admin" ? "text-clay-500" : "text-ink/45"
                    )}
                  >
                    {m.role === "admin" ? "管理员" : "成员"}
                  </span>
                  {canRemove && (
                    <button
                      onClick={() => removeMember(m.userId)}
                      disabled={busy}
                      className="shrink-0 rounded p-1 text-ink/40 hover:bg-ochre/10 hover:text-ochre"
                      title={isSelf ? "退出房屋" : "移除成员"}
                    >
                      {isSelf ? <LogOut size={13} /> : <UserMinus size={13} />}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <button onClick={() => navigate("/")} className="btn-primary w-full">
          <ArrowLeft size={15} /> 返回房屋
        </button>
      </div>
    </PageLayout>
  );
}

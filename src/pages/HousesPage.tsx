import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  Clock,
  Home as HomeIcon,
  KeyRound,
  Plus,
  Settings,
  XCircle,
} from "lucide-react";
import PageLayout from "@/components/PageLayout";
import { useAuthStore, type MyHouse } from "@/authStore";
import { cn } from "@/lib/utils";

export default function HousesPage() {
  const navigate = useNavigate();
  const {
    user,
    houses,
    currentHouseId,
    loadMe,
    createHouse,
    joinHouse,
    switchHouse,
  } = useAuthStore();

  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  const approved = houses.filter((h) => h.status === "approved");
  const pending = houses.filter((h) => h.status === "pending");
  const rejected = houses.filter((h) => h.status === "rejected");

  const handleEnter = (house: MyHouse) => {
    switchHouse(house.id);
    navigate("/");
  };

  return (
    <PageLayout
      title="我的房屋"
      subtitle={user ? `欢迎回来，${user.displayName || user.username}` : "选择或创建一个房屋"}
      showActions={false}
    >
      <div className="mx-auto max-w-3xl space-y-6">
        {/* 操作按钮 */}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus size={15} /> 创建新房屋
          </button>
          <button onClick={() => setShowJoin(true)} className="btn-secondary">
            <KeyRound size={15} /> 用分享码加入
          </button>
        </div>

        {/* 已加入的房屋 */}
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 font-serif text-sm font-semibold text-ink">
            <HomeIcon size={15} className="text-moss" /> 我的房屋
            <span className="text-2xs text-ink/45">({approved.length})</span>
          </h2>
          {approved.length === 0 ? (
            <div className="card p-6 text-center text-2xs text-ink/45">
              还没有房屋，创建一个或用分享码加入家人已有的房屋
            </div>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {approved.map((h) => (
                <li key={h.id}>
                  <button
                    onClick={() => handleEnter(h)}
                    className={cn(
                      "card w-full p-4 text-left transition-shadow hover:shadow-cardHover",
                      h.id === currentHouseId && "ring-2 ring-clay-400"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-serif text-sm font-semibold text-ink">
                          {h.name}
                        </h3>
                        <p className="mt-0.5 text-2xs text-ink/55">
                          {h.role === "admin" ? "管理员" : "成员"}
                          {h.membersCount !== undefined && ` · ${h.membersCount} 人`}
                        </p>
                      </div>
                      {h.id === currentHouseId && (
                        <span className="shrink-0 rounded-full bg-moss/15 px-2 py-0.5 text-2xs text-moss">
                          当前
                        </span>
                      )}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-2xs text-ink/45">
                        分享码：<span className="font-mono text-clay-600">{h.shareCode}</span>
                      </span>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/houses/${h.id}/settings`);
                        }}
                        className="text-ink/40 hover:text-clay-500"
                        role="button"
                        tabIndex={0}
                      >
                        <Settings size={14} />
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 待审批 */}
        {pending.length > 0 && (
          <section>
            <h2 className="mb-2 flex items-center gap-1.5 font-serif text-sm font-semibold text-ink">
              <Clock size={15} className="text-clay-500" /> 待审批
              <span className="text-2xs text-ink/45">({pending.length})</span>
            </h2>
            <ul className="space-y-2">
              {pending.map((h) => (
                <li key={h.id} className="card flex items-center gap-3 p-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="truncate font-serif text-sm text-ink">{h.name}</h3>
                    <p className="text-2xs text-ink/55">等待管理员审批</p>
                  </div>
                  <span className="chip">待审批</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 被拒绝 */}
        {rejected.length > 0 && (
          <section>
            <h2 className="mb-2 flex items-center gap-1.5 font-serif text-sm font-semibold text-ink">
              <XCircle size={15} className="text-ochre" /> 已拒绝
              <span className="text-2xs text-ink/45">({rejected.length})</span>
            </h2>
            <ul className="space-y-2">
              {rejected.map((h) => (
                <li key={h.id} className="card flex items-center gap-3 p-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="truncate font-serif text-sm text-ink">{h.name}</h3>
                    <p className="text-2xs text-ink/55">管理员已拒绝你的加入申请</p>
                  </div>
                  <span className="chip text-ochre">已拒绝</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* 创建房屋弹窗 */}
      {showCreate && (
        <Modal title="创建新房屋" onClose={() => setShowCreate(false)}>
          <CreateHouseForm
            busy={busy}
            error={error}
            onSubmit={async (name) => {
              setBusy(true);
              setError(null);
              try {
                await createHouse(name);
                setShowCreate(false);
                navigate("/");
              } catch (e) {
                setError(e instanceof Error ? e.message : "创建失败");
              } finally {
                setBusy(false);
              }
            }}
          />
        </Modal>
      )}

      {/* 加入房屋弹窗 */}
      {showJoin && (
        <Modal title="用分享码加入" onClose={() => setShowJoin(false)}>
          <JoinHouseForm
            busy={busy}
            error={error}
            onSubmit={async (code) => {
              setBusy(true);
              setError(null);
              try {
                await joinHouse(code);
                setShowJoin(false);
                setError(null);
              } catch (e) {
                setError(e instanceof Error ? e.message : "加入失败");
              } finally {
                setBusy(false);
              }
            }}
          />
        </Modal>
      )}
    </PageLayout>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/30 p-4">
      <div className="w-full max-w-md rounded-lg border border-line bg-cream shadow-cardHover">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="font-serif text-sm font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="text-ink/45 hover:text-ink">
            ✕
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function CreateHouseForm({
  busy,
  error,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSubmit(name.trim());
      }}
      className="space-y-3"
    >
      <label className="flex flex-col gap-1">
        <span className="text-2xs uppercase tracking-wider text-ink/55">房屋名称</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          required
          maxLength={100}
          placeholder="如：城南·溪岸花园 3-2-1801"
          className="field"
        />
        <span className="text-2xs text-ink/40">
          你将自动成为管理员，可生成分享码邀请家人加入
        </span>
      </label>
      {error && (
        <p className="rounded bg-ochre/10 px-3 py-2 text-2xs text-ochre">{error}</p>
      )}
      <button type="submit" disabled={busy || !name.trim()} className="btn-primary w-full">
        {busy ? "创建中…" : "创建"}
      </button>
    </form>
  );
}

function JoinHouseForm({
  busy,
  error,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  onSubmit: (shareCode: string) => void;
}) {
  const [code, setCode] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) onSubmit(code.trim().toUpperCase());
      }}
      className="space-y-3"
    >
      <label className="flex flex-col gap-1">
        <span className="text-2xs uppercase tracking-wider text-ink/55">分享码</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          autoFocus
          required
          maxLength={6}
          placeholder="6 位字母数字"
          className="field font-mono uppercase tracking-widest"
        />
        <span className="text-2xs text-ink/40">
          向房屋管理员索取分享码，提交后等待审批
        </span>
      </label>
      {error && (
        <p className="rounded bg-ochre/10 px-3 py-2 text-2xs text-ochre">{error}</p>
      )}
      <button type="submit" disabled={busy || !code.trim()} className="btn-primary w-full">
        {busy ? "提交中…" : "申请加入"}
      </button>
    </form>
  );
}

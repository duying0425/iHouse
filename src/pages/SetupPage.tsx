import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Camera,
  ChevronRight,
  Crop,
  Download,
  GripVertical,
  ImageUp,
  Images,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  Trash2,
  Upload,
  UploadCloud,
  X,
} from "lucide-react";
import PageLayout from "@/components/PageLayout";
import FloorPlan, { BUILTIN_FLOORPLAN } from "@/components/FloorPlan";
import EmptyState from "@/components/Empty";
import { useHomeStore } from "@/store";
import { useAuthStore, authFetch } from "@/authStore";
import { CATEGORIES } from "@/types";
import { compressImage } from "@/utils/compressImage";
import { uploadImage } from "@/utils/upload";
import { cn } from "@/lib/utils";

export default function SetupPage() {
  const {
    title,
    floorPlanImage,
    areas,
    setFloorPlanImage,
    setHomeTitle,
    addArea,
    updateArea,
    removeArea,
    updateAreaPos,
    addAreaImage,
    updateAreaImage,
    removeAreaImage,
    startBlank,
    resetDemo,
    updateAreaBounds,
  } = useHomeStore();

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [importHint, setImportHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadingFloorPlan, setUploadingFloorPlan] = useState(false);
  const [editMode, setEditMode] = useState<"all" | string | null>(null);
  const [highlightAreaId, setHighlightAreaId] = useState<string | null>(null);
  const currentHouseId = useAuthStore((s) => s.currentHouseId);
  const reloadCurrentHouse = useHomeStore((s) => s.reloadCurrentHouse);

  // 从后端下载当前房屋的 zip 备份
  const handleExport = async () => {
    if (!currentHouseId || busy) return;
    setBusy(true);
    setImportHint(null);
    try {
      const res = await authFetch(`/api/houses/${currentHouseId}/backup`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "导出失败");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const m = disposition.match(/filename\*=UTF-8''([^;]+)/);
      const fname = m ? decodeURIComponent(m[1]) : `ihouse-${currentHouseId}-${new Date().toISOString().slice(0, 10)}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fname;
      a.click();
      URL.revokeObjectURL(url);
      setImportHint("已导出 zip 备份");
    } catch (e) {
      setImportHint("导出失败：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
      window.setTimeout(() => setImportHint(null), 3000);
    }
  };

  // 上传 zip 到后端，导入到当前房屋
  const handleImportFile = async (file?: File) => {
    if (!file || !currentHouseId) return;
    setBusy(true);
    setImportHint(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await authFetch(`/api/houses/${currentHouseId}/backup/import`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "导入失败");
      // 重新拉取房屋数据
      await reloadCurrentHouse();
      setImportHint(`导入成功${data.imageCount ? `（${data.imageCount} 张图片）` : ""}`);
    } catch (e) {
      setImportHint("导入失败：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
      window.setTimeout(() => setImportHint(null), 4000);
    }
  };

  const isImageMode = !!floorPlanImage && floorPlanImage !== BUILTIN_FLOORPLAN;
  const hasAreas = areas.length > 0;

  const handleUpload = async (file?: File) => {
    if (!file) return;
    setUploadingFloorPlan(true);
    let base64Url = "";
    try {
      base64Url = await compressImage(file, 2000, 0.85);
    } catch {
      // 压缩失败则回退直接读
      base64Url = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(file);
      });
    }

    try {
      const finalUrl = await uploadImage(base64Url);
      setFloorPlanImage(finalUrl);
    } finally {
      setUploadingFloorPlan(false);
    }
  };

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    const area = addArea({
      name,
      floorPlanPos: { x: 50, y: 50 },
      images: [],
      description: `${name}区域`,
    });
    setNewName("");
    // 新建区域后自动展开图片管理
    setExpandedId(area.id);
  };

  const startEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditName(name);
  };

  const commitEdit = () => {
    if (editingId && editName.trim()) {
      updateArea(editingId, { name: editName.trim() });
    }
    setEditingId(null);
    setEditName("");
  };

  /** 给区域创建默认 bounds：以锚点为中心 24×24，clamp 在 0-100 */
  const makeDefaultBounds = (pos: { x: number; y: number }) => {
    const w = 24;
    const h = 24;
    const x = Math.max(0, Math.min(100 - w, pos.x - w / 2));
    const y = Math.max(0, Math.min(100 - h, pos.y - h / 2));
    return { x, y, w, h };
  };

  return (
    <PageLayout
      title="户型设置"
      subtitle="导入户型图 · 划分区域 · 管理区域图片"
      showActions={false}
    >
      <nav className="mb-5 flex items-center gap-1 text-2xs text-ink/45">
        <Link to="/" className="hover:text-clay-500">
          居所图鉴
        </Link>
        <ChevronRight size={12} />
        <span className="text-ink/70">户型设置</span>
      </nav>

      {/* 步骤说明 */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Step n={1} title="导入户型图" desc="上传一张户型图作为整屋底图" />
        <Step n={2} title="添加区域" desc="如卧室1、卧室2、卫生间1/2/3" />
        <Step
          n={3}
          title="区域图片"
          desc="为每个区域上传 1 张或多张图片（总图/设施图/某面墙等），物品位置将标在这些图上"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* 左：户型图画布 */}
        <div className="space-y-4">
          {/* 户型图标题编辑 */}
          <div className="card flex flex-wrap items-center gap-3 p-4">
            <label className="flex flex-1 flex-col gap-0.5">
              <span className="text-2xs uppercase tracking-wider text-ink/45">
                图鉴标题
              </span>
              <input
                name="homeTitle"
                autoComplete="off"
                value={title}
                onChange={(e) => setHomeTitle(e.target.value)}
                className="field"
                placeholder="如：城南·溪岸花园 3-2-1801"
              />
            </label>
            <div className="flex gap-2">
              <button onClick={startBlank} className="btn-secondary">
                <X size={15} /> 清空重来
              </button>
              <button
                onClick={() => {
                  if (confirm("重置为内置示例数据？当前自定义内容将丢失。")) {
                    resetDemo();
                  }
                }}
                className="btn-ghost"
              >
                <RotateCcw size={15} /> 恢复示例
              </button>
            </div>
          </div>

          {/* 户型图上传 + 画布 */}
          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <h3 className="flex items-center gap-1.5 font-serif text-sm font-semibold text-ink">
                <Settings2 size={15} className="text-clay-500" /> 户型图
              </h3>
              <div className="flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleUpload(e.target.files?.[0])}
                />
                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => handleUpload(e.target.files?.[0])}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="btn-primary"
                >
                  <Upload size={15} /> 上传户型图
                </button>
                <button
                  onClick={() => cameraRef.current?.click()}
                  className="btn-secondary"
                >
                  <Camera size={15} /> 拍照
                </button>
                <button
                  onClick={() => {
                    setEditMode((prev) => {
                      const next = prev === "all" ? null : "all";
                      // 进入或退出“编辑全部”时都应清除单区域高亮，避免残留
                      setHighlightAreaId(null);
                      return next;
                    });
                  }}
                  className={editMode === "all" ? "btn-primary" : "btn-secondary"}
                  title={editMode === "all" ? "退出区域范围编辑" : "进入区域范围编辑：拖拽矩形或把手调整每个区域的覆盖范围"}
                >
                  <Crop size={15} /> {editMode === "all" ? "完成范围" : "编辑区域范围"}
                </button>
                {!isImageMode && !editMode && (
                  <span className="text-2xs text-ink/45">当前：内置示例图</span>
                )}
              </div>
            </div>

            <div className="p-4 relative">
              {hasAreas || isImageMode ? (
                <FloorPlan
                  areas={areas}
                  floorPlanImage={floorPlanImage}
                  editable
                  onAreaMove={updateAreaPos}
                  boundsEditable={editMode === "all" ? true : (editMode || false)}
                  onAreaBoundsChange={updateAreaBounds}
                  highlightAreaId={highlightAreaId || undefined}
                  showAreaAnchors
                />
              ) : (
                <EmptyState
                  icon={<ImageUp size={22} />}
                  title="还没有户型图"
                  description="上传一张户型图图片，然后在右侧添加区域。"
                  action={
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="btn-primary"
                    >
                      <Upload size={16} /> 上传户型图
                    </button>
                  }
                />
              )}
              {uploadingFloorPlan && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-paper/60 backdrop-blur-2xs">
                  <Loader2 className="animate-spin text-clay-500 mb-2" size={32} />
                  <span className="text-xs text-ink/75 font-medium">户型图上传中…</span>
                </div>
              )}
              <p className="mt-3 text-2xs text-ink/45">
                {editMode
                  ? "编辑区域范围模式：拖拽矩形主体移动整体，拖拽 8 个把手调整边角；无矩形的区域请在右侧点「画范围」。"
                  : isImageMode
                  ? "拖拽图上的序号锚点到对应区域位置；锚点会自动保存。点「编辑区域范围」可为每个区域画出覆盖矩形。"
                  : "上传图片后将进入拖拽模式；内置示例图下也可拖拽锚点调整位置。点「编辑区域范围」可调整房间矩形。"}
              </p>
            </div>
          </div>
        </div>

        {/* 右：区域管理 */}
        <aside className="lg:sticky lg:top-24 lg:self-start space-y-4 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-1">
          {/* 新增区域 */}
          <div className="card p-4">
            <h3 className="mb-3 flex items-center gap-1.5 font-serif text-sm font-semibold text-ink">
              <Plus size={15} className="text-clay-500" /> 添加区域
            </h3>
            <div className="flex gap-2">
              <input
                name="newAreaName"
                autoComplete="one-time-code"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                placeholder="如：卧室1、卫生间2"
                className="field flex-1"
              />
              <button
                onClick={handleAdd}
                disabled={!newName.trim()}
                className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus size={15} />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {["入户玄关", "主卧", "次卧", "客厅", "餐厅", "厨房", "卫生间1", "卫生间2", "阳台"].map(
                (n) => (
                  <button
                    key={n}
                    onClick={() => {
                      const area = addArea({
                        name: n,
                        floorPlanPos: { x: 50, y: 50 },
                        images: [],
                        description: `${n}区域`,
                      });
                      setExpandedId(area.id);
                    }}
                    className="chip cursor-pointer hover:chip-active"
                  >
                    + {n}
                  </button>
                )
              )}
            </div>
          </div>

          {/* 区域列表 + 图片管理 */}
          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 font-serif text-sm font-semibold text-ink">
                <GripVertical size={15} className="text-moss" /> 区域与图片
              </h3>
              <span className="text-2xs text-ink/45">{areas.length} 个</span>
            </div>

            {areas.length === 0 ? (
              <p className="py-6 text-center text-xs text-ink/40">
                暂无区域，请在上方添加
              </p>
            ) : (
              <ul className="space-y-2">
                {areas.map((a, idx) => {
                  const expanded = expandedId === a.id;
                  return (
                    <li
                      key={a.id}
                      className="rounded border border-line bg-cream"
                    >
                      {/* 区域行 */}
                      <div className="flex items-center gap-2 px-2.5 py-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-moss text-[10px] font-semibold text-cream">
                          {idx + 1}
                        </span>
                        {editingId === a.id ? (
                          <input
                            name="editAreaName"
                            autoComplete="off"
                            autoFocus
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit();
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className="field flex-1 py-1"
                          />
                        ) : (
                          <button
                            onClick={() => startEdit(a.id, a.name)}
                            className="flex-1 truncate text-left text-sm text-ink hover:text-clay-600"
                          >
                            {a.name}
                          </button>
                        )}
                        <span className="shrink-0 text-2xs text-ink/40">
                          {a.items.length} 件 · {a.images.length} 图
                        </span>
                        <button
                          onClick={() => {
                            if (editMode === a.id) {
                              setEditMode(null);
                              setHighlightAreaId(null);
                            } else {
                              if (!a.bounds) {
                                updateAreaBounds(a.id, makeDefaultBounds(a.floorPlanPos));
                              }
                              setEditMode(a.id);
                              setHighlightAreaId(a.id);
                            }
                          }}
                          className={cn(
                            "shrink-0 rounded px-1.5 py-0.5 text-2xs transition-colors",
                            editMode === a.id
                              ? "bg-moss text-cream"
                              : a.bounds
                              ? "text-moss hover:bg-moss/10"
                              : "text-clay-600 hover:bg-clay-100"
                          )}
                          title={
                            editMode === a.id
                              ? "保存并退出编辑"
                              : a.bounds
                              ? "在图上高亮并编辑该范围"
                              : "以锚点为中心创建覆盖范围矩形"
                          }
                          aria-label={
                            editMode === a.id
                              ? "保存范围"
                              : a.bounds
                              ? "编辑范围"
                              : "画范围"
                          }
                        >
                          <Crop size={13} />
                        </button>
                        <button
                          onClick={() => setExpandedId(expanded ? null : a.id)}
                          className={cn(
                            "shrink-0 rounded px-1.5 py-0.5 text-2xs transition-colors",
                            expanded
                              ? "bg-clay-500 text-cream"
                              : "text-clay-600 hover:bg-clay-100"
                          )}
                          aria-label="展开图片管理"
                        >
                          <Images size={13} />
                        </button>
                        <button
                          onClick={() => {
                            if (
                              confirm(
                                `删除区域「${a.name}」及其下 ${a.items.length} 件物品？`
                              )
                            ) {
                              removeArea(a.id);
                              if (editMode === a.id) {
                                setEditMode(null);
                              }
                              if (highlightAreaId === a.id) {
                                setHighlightAreaId(null);
                              }
                              if (expandedId === a.id) {
                                setExpandedId(null);
                              }
                              if (editingId === a.id) {
                                setEditingId(null);
                              }
                            }
                          }}
                          className="shrink-0 text-ink/30 transition-colors hover:text-ochre"
                          aria-label="删除区域"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {/* 图片管理面板 */}
                      {expanded && (
                        <div className="border-t border-line bg-paper/60 p-2.5">
                          <AreaImagesEditor
                            images={a.images}
                            onAdd={(img) => addAreaImage(a.id, img)}
                            onUpdate={(imageId, patch) =>
                              updateAreaImage(a.id, imageId, patch)
                            }
                            onRemove={(imageId) =>
                              removeAreaImage(a.id, imageId)
                            }
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* 分类图例 */}
          <div className="card p-4">
            <h3 className="mb-2 font-serif text-sm font-semibold text-ink">
              物品分类
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <span key={c} className="chip">
                  {c}
                </span>
              ))}
            </div>
            <p className="mt-2 text-2xs text-ink/45">
              区域与图片设置完成后，到各区域页录入物品时会在区域图上点选位置。
            </p>
          </div>

          {/* 数据维护：导出 / 导入 */}
          <div className="card p-4">
            <h3 className="font-serif text-sm font-semibold text-ink">
              数据维护
            </h3>
            <p className="mt-1.5 text-2xs text-ink/55">
              导出当前房屋的完整 zip 备份（含户型图、区域、物品元数据 + 所有图片物理文件），换设备/浏览器时可导入恢复，也可作为日常冷备份。
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={handleExport}
                disabled={busy || !currentHouseId}
                className="btn-secondary disabled:opacity-50"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} 导出 zip
              </button>
              <button
                onClick={() => importRef.current?.click()}
                disabled={busy || !currentHouseId}
                className="btn-secondary disabled:opacity-50"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />} 导入 zip
              </button>
            </div>
            <input
              ref={importRef}
              type="file"
              accept="application/zip,.zip"
              className="hidden"
              onChange={(e) => {
                handleImportFile(e.target.files?.[0]);
                if (e.target) e.target.value = "";
              }}
            />
            {importHint && (
              <p className="mt-2 text-2xs text-moss">{importHint}</p>
            )}
            <p className="mt-2 text-2xs text-ink/40">
              导入会覆盖当前房屋的全部数据；仅管理员可导入。
            </p>
          </div>

          {/* 自动保存提示 + 返回 */}
          <div className="card p-4">
            <div className="flex items-center gap-2 text-2xs text-moss">
              <Save size={13} />
              <span>所有改动已自动保存到本地</span>
            </div>
            <p className="mt-1.5 text-2xs text-ink/45">
              无需手动保存。可直接离开本页或点下方返回首页。
            </p>
            <Link to="/" className="btn-primary mt-3 w-full">
              <ArrowLeft size={15} /> 返回首页
            </Link>
          </div>

          {/* 账户安全：修改密码 */}
          <AccountSecurityCard />
        </aside>
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
        当前账号：<span className="text-ink/70">{user?.username}</span>
      </p>
      <div className="space-y-2">
        {/* 隐藏的用户名文本框，用于吸收浏览器密码管理器自动填充，防止污染其他页面的普通文本输入框 */}
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={user?.username || ""}
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

/** 单个区域的图片增删改面板 */
function AreaImagesEditor({
  images,
  onAdd,
  onUpdate,
  onRemove,
}: {
  images: { id: string; url: string; label?: string }[];
  onAdd: (img: { url: string; label?: string }) => void;
  onUpdate: (imageId: string, patch: { label?: string }) => void;
  onRemove: (imageId: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [uploadingCount, setUploadingCount] = useState(0);

  // 支持一次选择多个文件，全部压缩完并上传后再按原始顺序添加（避免异步乱序）
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) return;
    const baseIdx = images.length;

    setUploadingCount(list.length);
    try {
      // 并行压缩，但按输入顺序等待全部完成
      const base64Urls = await Promise.all(
        list.map((f) => compressImage(f, 1600, 0.82).catch(() => null))
      );

      // 并行上传这些图片，若失败则用原 base64 兜底
      const finalUrls = await Promise.all(
        base64Urls.map(async (url) => {
          if (!url) return null;
          return uploadImage(url);
        })
      );

      finalUrls.forEach((url, i) => {
        if (url) onAdd({ url, label: `图 ${baseIdx + i + 1}` });
      });
    } finally {
      setUploadingCount(0);
    }
  };

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          // 允许连续上传同一文件
          if (e.target) e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          if (e.target) e.target.value = "";
        }}
      />
      {images.length === 0 && uploadingCount === 0 ? (
        <p className="py-3 text-center text-2xs text-ink/45">
          暂无图片，请上传区域图（可多选）
        </p>
      ) : (
        <ul className="space-y-1.5">
          {images.map((img) => (
            <li
              key={img.id}
              className="flex items-center gap-2 rounded border border-line bg-cream p-1.5"
            >
              <img
                src={img.url}
                alt={img.label || ""}
                className="h-10 w-14 shrink-0 rounded object-cover"
              />
              <input
                value={img.label || ""}
                onChange={(e) => onUpdate(img.id, { label: e.target.value })}
                placeholder="标签：如 总图/设施图/东墙"
                className="field flex-1 py-0.5 text-2xs"
              />
              <button
                onClick={() => onRemove(img.id)}
                className="shrink-0 text-ink/30 hover:text-ochre"
                aria-label="删除图片"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
          {Array.from({ length: uploadingCount }).map((_, idx) => (
            <li
              key={`uploading-${idx}`}
              className="flex items-center gap-2 rounded border border-dashed border-line bg-clay-50/50 p-1.5"
            >
              <div className="h-10 w-14 shrink-0 rounded bg-clay-100/50 flex items-center justify-center">
                <Loader2 size={14} className="animate-spin text-clay-400" />
              </div>
              <span className="text-2xs text-ink/45">区域图上传中…</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          className="flex-1 rounded border border-dashed border-line py-1.5 text-2xs text-ink/55 hover:border-clay-400 hover:text-clay-500 transition-colors"
        >
          <Upload size={12} className="mr-1 inline" /> 上传区域图片（可多选）
        </button>
        <button
          onClick={() => cameraRef.current?.click()}
          className="flex-1 rounded border border-dashed border-line py-1.5 text-2xs text-ink/55 hover:border-clay-400 hover:text-clay-500 transition-colors"
        >
          <Camera size={12} className="mr-1 inline" /> 拍照添加
        </button>
      </div>
      <p className="mt-1.5 text-center text-2xs text-ink/35">
        支持一次选择多张：总图、设施图、某面墙等，已自动保存
      </p>
    </div>
  );
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="card flex items-start gap-3 p-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-clay-500 font-display text-sm font-semibold text-cream">
        {n}
      </span>
      <div>
        <p className="font-serif text-sm font-semibold text-ink">{title}</p>
        <p className="text-2xs text-ink/55">{desc}</p>
      </div>
    </div>
  );
}

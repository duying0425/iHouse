import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardPaste, ImagePlus, Layers, MapPin, Plus, Trash2, Wand2, ChevronDown, Box, CalendarClock, Camera, LoaderCircle, Sparkles } from "lucide-react";
import AreaImageCanvas from "@/components/AreaImageCanvas";
import { CATEGORIES, type Category, type StorageEntry } from "@/types";
import { imageOf } from "@/utils/image";
import { compressImage } from "@/utils/compressImage";
import { uploadImage } from "@/utils/upload";
import { useHomeStore } from "@/store";
import { genId } from "@/data/seed";
import { cn } from "@/lib/utils";
import { MAINTENANCE_PRESETS, getMaintenanceStatus } from "@/utils/maintenance";
import type { ItemFormValue } from "@/components/itemFormValue";
import { applyRecognitionToEmptyFields, recognizeItemImage } from "@/utils/aiRecognition";

interface ItemFormProps {
  value: ItemFormValue;
  onChange: (v: ItemFormValue) => void;
  areaId: string;
  /** 收纳于正式物品时，不再直接标注区域图坐标。 */
  containedInName?: string;
  /** 新建物品时展示「放置位置」选择器，可直接收纳到本区域储物单元。 */
  isNew?: boolean;
}

export default function ItemForm({ value, onChange, areaId, containedInName, isNew }: ItemFormProps) {
  const { areas } = useHomeStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const galleryCameraRef = useRef<HTMLInputElement>(null);
  const [touched, setTouched] = useState(false);
  const [pasteHint, setPasteHint] = useState<string | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [galleryUploadingCount, setGalleryUploadingCount] = useState(0);
  const [aiNotice, setAiNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [contentsOpen, setContentsOpen] = useState(value.contents.length > 0);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  // 新建时默认分类“家电”仍可由 AI 修正；已有档案或用户手选的分类绝不覆盖。
  const categoryCanAutofillRef = useRef(!value.name.trim());
  const area = areas.find((a) => a.id === areaId);
  const images = area?.images ?? [];

  // 新建物品时可在表单内直接选择收纳到本区域的储物单元
  const containerCandidates = useMemo(() => {
    if (!isNew || !area) return [];
    // 仅收集本区域内已被作为容器的 id 集合，解除全局 areas 的依赖
    const usedContainerIds = new Set(
      area.items
        .map((i) => i.containerItemId)
        .filter((id): id is string => !!id)
    );
    return area.items.filter(
      (item) =>
        item.category === "储物" ||
        (item.contents?.length ?? 0) > 0 ||
        usedContainerIds.has(item.id)
    );
  }, [isNew, area]);

  const selectedContainerItem =
    isNew && value.containerItemId
      ? area?.items.find((i) => i.id === value.containerItemId)
      : undefined;

  // 是否收纳于储物单元（新建时由表单选择，编辑时由 containedInName 决定）
  const effectiveContained = isNew
    ? Boolean(value.containerItemId)
    : Boolean(containedInName);
  const effectiveContainedName = isNew
    ? selectedContainerItem?.name
    : containedInName;

  // 始终持有最新 value，避免粘贴监听器等闭包用到过期值（导致覆盖已填字段）
  const valueRef = useRef(value);
  valueRef.current = value;

  // 若 value.areaImageId 不在该区域的图片里（或为空），自动选第一张
  useEffect(() => {
    if (effectiveContained) return;
    if (images.length === 0) return;
    const valid = images.some((img) => img.id === value.areaImageId);
    if (!valid && value.areaImageId !== images[0].id) {
      onChange({ ...valueRef.current, areaImageId: images[0].id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length, value.areaImageId, effectiveContained]);

  // 自动将焦点放到新增加的一行的名称填入框
  useEffect(() => {
    if (justAddedId) {
      const el = document.getElementById(`content-name-${justAddedId}`);
      if (el) {
        el.focus();
        setJustAddedId(null);
      }
    }
  }, [justAddedId, value.contents]);

  const set = <K extends keyof ItemFormValue>(k: K, v: ItemFormValue[K]) =>
    onChange({ ...valueRef.current, [k]: v });

  // 储物单元内部快捷清单操作
  const addContent = () => {
    const id = genId("cnt");
    const entry: StorageEntry = { id, name: "", quantity: "", remark: "" };
    onChange({ ...valueRef.current, contents: [...valueRef.current.contents, entry] });
    setContentsOpen(true);
    setJustAddedId(id);
  };
  const updateContent = (id: string, patch: Partial<StorageEntry>) => {
    onChange({
      ...valueRef.current,
      contents: valueRef.current.contents.map((c) =>
        c.id === id ? { ...c, ...patch } : c
      ),
    });
  };
  const removeContent = (id: string) => {
    onChange({
      ...valueRef.current,
      contents: valueRef.current.contents.filter((c) => c.id !== id),
    });
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    let base64Url = "";
    try {
      base64Url = await compressImage(file, 1200, 0.82);
    } catch {
      // 压缩失败则回退直接读
      base64Url = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(file);
      });
    }

    try {
      // 异步上传到服务器，成功后存储服务器返回 of URL，失败则回退使用本地 Base64 兜底
      const finalUrl = await uploadImage(base64Url);
      setAiNotice(null);
      set("image", finalUrl);
    } finally {
      setUploading(false);
    }
  };

  const handleAiRecognition = async () => {
    const image = valueRef.current.image;
    if (!image || recognizing) return;
    setRecognizing(true);
    setAiNotice(null);
    try {
      const recognition = await recognizeItemImage(image);
      if (valueRef.current.image !== image) {
        setAiNotice({ kind: "error", message: "识别期间图片已更换，请对新图片重新识别。" });
        return;
      }
      // 请求期间用户可能继续输入，因此必须以响应到达时的最新表单值为准。
      const applied = applyRecognitionToEmptyFields(
        valueRef.current,
        recognition,
        categoryCanAutofillRef.current
      );
      categoryCanAutofillRef.current = false;
      onChange(applied.value);
      const confidence = recognition.confidence == null
        ? ""
        : `（置信度 ${Math.round(recognition.confidence * 100)}%）`;
      setAiNotice({
        kind: "success",
        message: applied.filled.length > 0
          ? `已填写：${applied.filled.join("、")}${confidence}。请核对后保存。`
          : `识别完成${confidence}，没有需要自动填写的空字段。`,
      });
    } catch (error) {
      setAiNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "AI 识别失败，请稍后重试",
      });
    } finally {
      setRecognizing(false);
    }
  };

  // 全局粘贴：支持 Ctrl+V 直接粘贴剪贴板里的图片作为物品照片
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.type.startsWith("image/")) {
          const file = it.getAsFile();
          if (file) {
            e.preventDefault();
            handleFile(file);
            setPasteHint("已粘贴图片");
            window.setTimeout(() => setPasteHint(null), 2000);
            return;
          }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentImage = images.find((i) => i.id === value.areaImageId) ?? images[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr] lg:gap-8">
      {/* 左：照片 */}
      <div className="space-y-4">
        <div className="card overflow-hidden">
          <div className="bg-clay-50 relative">
            {value.image ? (
              <img
                src={value.image}
                alt="物品照片"
                className="block h-auto w-full object-contain"
              />
            ) : (
              <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 text-ink/40">
                <ImagePlus size={32} />
                <span className="text-xs">尚未添加照片</span>
                <span className="text-2xs text-ink/35">
                  可上传、粘贴（Ctrl+V）或粘贴 URL
                </span>
              </div>
            )}
            {uploading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-paper/60 backdrop-blur-2xs">
                <LoaderCircle size={24} className="animate-spin text-clay-500 mb-2" />
                <span className="text-xs text-ink/75 font-medium">图片上传中…</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-line p-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="btn-secondary"
            >
              <ImagePlus size={15} /> 上传图片
            </button>
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="btn-secondary"
            >
              <Camera size={15} /> 拍照
            </button>
            {value.image && (
              <button
                type="button"
                onClick={handleAiRecognition}
                disabled={recognizing}
                className="btn-primary disabled:cursor-wait disabled:opacity-60"
                title="识别图片并只填写当前为空的字段"
              >
                {recognizing ? (
                  <LoaderCircle size={15} className="animate-spin" />
                ) : (
                  <Sparkles size={15} />
                )}
                {recognizing ? "识别中…" : "AI 识别"}
              </button>
            )}
            <button
              type="button"
              onClick={async () => {
                try {
                  const data = await navigator.clipboard.read();
                  for (const item of data) {
                    for (const type of item.types) {
                      if (type.startsWith("image/")) {
                        const blob = await item.getType(type);
                        handleFile(new File([blob], "pasted.png", { type }));
                        setPasteHint("已粘贴图片");
                        window.setTimeout(() => setPasteHint(null), 2000);
                        return;
                      }
                    }
                  }
                  setPasteHint("剪贴板里没有图片");
                  window.setTimeout(() => setPasteHint(null), 2000);
                } catch {
                  setPasteHint("请用 Ctrl+V 粘贴");
                  window.setTimeout(() => setPasteHint(null), 2000);
                }
              }}
              className="btn-ghost"
              title="从剪贴板粘贴图片"
            >
              <ClipboardPaste size={15} /> 粘贴
            </button>
            <button
              type="button"
              onClick={() =>
                set(
                  "image",
                  imageOf(
                    `${value.name || "家居物品"} 产品图，简约清晰`,
                    "square"
                  )
                )
              }
              className="btn-ghost"
            >
              <Wand2 size={15} /> 生成示例图
            </button>
            {value.image && (
              <button
                type="button"
                onClick={() => {
                  setAiNotice(null);
                  set("image", "");
                }}
                className="btn-ghost text-ochre hover:bg-ochre/10"
              >
                <Trash2 size={15} /> 移除主图
              </button>
            )}
            {pasteHint && (
              <span className="ml-auto text-2xs text-moss">{pasteHint}</span>
            )}
          </div>
          {aiNotice && (
            <div
              aria-live="polite"
              className={cn(
                "border-t px-3 py-2 text-xs",
                aiNotice.kind === "success"
                  ? "border-moss/20 bg-moss/5 text-moss"
                  : "border-ochre/20 bg-ochre/5 text-ochre"
              )}
            >
              {aiNotice.message}
            </div>
          )}
          <input
            value={value.image.startsWith("data:") ? "" : value.image}
            onChange={(e) => set("image", e.target.value)}
            placeholder="或粘贴图片 URL"
            className="w-full border-t border-line bg-transparent px-3 py-2 text-2xs text-ink/60 placeholder:text-ink/30 focus:outline-none"
          />
        </div>

        {/* 附属图册 (可选) */}
        <div className="card p-4">
          <h4 className="mb-3 font-serif text-sm font-semibold text-ink flex items-center gap-1.5">
            <Layers size={14} className="text-moss" />
            附属图册
            <span className="text-2xs font-normal text-ink/45">
              (如保修卡、发票、参数铭牌等)
            </span>
          </h4>
          {value.gallery.length === 0 && galleryUploadingCount === 0 ? (
            <p className="py-4 text-center text-2xs text-ink/40 border border-dashed border-line rounded">
              暂无附属图片，可在下方上传
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {value.gallery.map((img, idx) => (
                <div key={idx} className="group relative aspect-[4/3] rounded border border-line overflow-hidden bg-clay-50">
                  <img src={img} alt={`附属图 ${idx + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => {
                      set("gallery", value.gallery.filter((_, i) => i !== idx));
                    }}
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 bg-ochre text-cream p-1 rounded-full hover:bg-ochre/90 transition-opacity"
                    title="删除图片"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
              {Array.from({ length: galleryUploadingCount }).map((_, idx) => (
                <div key={`uploading-${idx}`} className="relative aspect-[4/3] rounded border border-dashed border-line flex flex-col items-center justify-center bg-clay-50/50">
                  <LoaderCircle className="animate-spin text-clay-400 mb-1" size={16} />
                  <span className="text-3xs text-ink/45">上传中…</span>
                </div>
              ))}
            </div>
          )}
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={async (e) => {
              const files = e.target.files;
              if (!files || files.length === 0) return;
              const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
              if (list.length === 0) return;
              
              setGalleryUploadingCount(list.length);
              try {
                const base64Urls = await Promise.all(
                  list.map((f) => compressImage(f, 1200, 0.82).catch(() => null))
                );
                
                const finalUrls = await Promise.all(
                  base64Urls.map(async (url) => {
                    if (!url) return null;
                    return uploadImage(url);
                  })
                );
                
                const validUrls = finalUrls.filter((url): url is string => !!url);
                if (validUrls.length > 0) {
                  set("gallery", [...value.gallery, ...validUrls]);
                }
              } finally {
                setGalleryUploadingCount(0);
              }
              if (e.target) e.target.value = "";
            }}
          />
          <input
            ref={galleryCameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setGalleryUploadingCount(1);
              try {
                const base64Url = await compressImage(file, 1200, 0.82);
                const finalUrl = await uploadImage(base64Url);
                set("gallery", [...value.gallery, finalUrl]);
              } catch {
                /* 忽略单张失败 */
              } finally {
                setGalleryUploadingCount(0);
              }
              if (e.target) e.target.value = "";
            }}
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="flex-1 rounded border border-dashed border-line py-1.5 text-2xs text-ink/55 hover:border-clay-400 hover:text-clay-500 transition-colors"
            >
              <Plus size={12} className="mr-1 inline" /> 上传附属图片 (可多选)
            </button>
            <button
              type="button"
              onClick={() => galleryCameraRef.current?.click()}
              className="flex-1 rounded border border-dashed border-line py-1.5 text-2xs text-ink/55 hover:border-clay-400 hover:text-clay-500 transition-colors"
            >
              <Camera size={12} className="mr-1 inline" /> 拍照添加
            </button>
          </div>
        </div>
      </div>

      {/* 右：字段 */}
      <div className="space-y-5">
        <Field label="物品名称" required>
          <input
            value={value.name}
            onChange={(e) => set("name", e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="如：三人布艺沙发"
            className="field"
          />
        </Field>

        <Field label="别名 / 标签">
          <input
            value={value.tags}
            onChange={(e) => set("tags", e.target.value)}
            placeholder="用逗号或空格分隔多个，例如：挂烫机, 熨斗"
            className="field"
          />
          {value.tags.trim() && (
            <div className="mt-1.5 flex flex-wrap gap-1.5 transition-all">
              {value.tags.split(/[,，\s]+/).map(t => t.trim()).filter(Boolean).map((t, idx) => (
                <span key={idx} className="chip bg-clay-50/50 text-clay-700 border-clay-200/60">
                  {t}
                </span>
              ))}
            </div>
          )}
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
          <Field label="分类">
            <select
              value={value.category}
              onChange={(e) => {
                categoryCanAutofillRef.current = false;
                set("category", e.target.value as Category);
              }}
              className="field appearance-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="品牌">
            <input
              value={value.brand}
              onChange={(e) => set("brand", e.target.value)}
              placeholder="如：宜家"
              className="field"
            />
          </Field>
        </div>

        <Field label="规格">
          <input
            value={value.spec}
            onChange={(e) => set("spec", e.target.value)}
            placeholder="如：332×98×83cm"
            className="field"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
          <Field label="购入日期">
            <input
              type="date"
              value={value.purchaseDate}
              onChange={(e) => set("purchaseDate", e.target.value)}
              className="field"
            />
          </Field>
          <Field label="价格 (元)">
            <input
              type="number"
              value={value.price}
              onChange={(e) => set("price", e.target.value)}
              placeholder="0"
              className="field"
            />
          </Field>
        </div>

        <Field label="备注">
          <textarea
            value={value.remark}
            onChange={(e) => set("remark", e.target.value)}
            placeholder="位置、保修、注意事项……"
            rows={2}
            className="field resize-none"
          />
        </Field>

        <Field label="使用说明">
          <textarea
            value={value.usage}
            onChange={(e) => set("usage", e.target.value)}
            placeholder="操作步骤、按键说明、常用功能……（可选，如电视机/微波炉等设备的指引）"
            rows={3}
            className="field resize-none"
          />
        </Field>

        {/* 维护提醒（可选）：周期 + 上次维护日期 */}
        <div className="card overflow-hidden">
          <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-line">
            <CalendarClock size={14} className="text-ochre" />
            <h4 className="font-serif text-sm font-semibold text-ink">
              维护提醒
            </h4>
            <span className="text-2xs text-ink/45">定期维护的设备可在此设置</span>
          </div>
          <div className="px-4 py-3 space-y-3">
            {/* 周期预设按钮 */}
            <div>
              <span className="mb-1.5 block text-2xs uppercase tracking-wider text-ink/50">
                维护周期
              </span>
              <div className="flex flex-wrap gap-1.5">
                {MAINTENANCE_PRESETS.map((p) => {
                  const active = value.maintenanceCycle === String(p.days);
                  return (
                    <button
                      key={p.days}
                      type="button"
                      onClick={() => set("maintenanceCycle", String(p.days))}
                      className={cn(
                        "chip cursor-pointer",
                        active && "chip-active"
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => set("maintenanceCycle", "")}
                  className={cn(
                    "chip cursor-pointer",
                    value.maintenanceCycle === "" && "chip-active"
                  )}
                >
                  无
                </button>
              </div>
              {/* 自定义周期输入 */}
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={value.maintenanceCycle}
                  onChange={(e) => set("maintenanceCycle", e.target.value)}
                  placeholder="自定义天数"
                  className="field w-32"
                />
                <span className="text-2xs text-ink/45">天</span>
                {value.maintenanceCycle && (
                  <button
                    type="button"
                    onClick={() =>
                      set("maintenanceCycle", "")
                    }
                    className="ml-auto text-2xs text-ink/45 hover:text-ochre"
                  >
                    清除
                  </button>
                )}
              </div>
            </div>

            {/* 上次维护日期 */}
            <Field label="上次维护日期">
              <input
                type="date"
                value={value.lastMaintenanceDate}
                onChange={(e) => set("lastMaintenanceDate", e.target.value)}
                className="field"
              />
            </Field>

            {/* 状态预览 */}
            {value.maintenanceCycle && (
              <MaintenancePreview
                cycle={Number(value.maintenanceCycle) || 0}
                lastDate={value.lastMaintenanceDate}
              />
            )}
          </div>
        </div>

        {/* 储物单元内部物品清单（可选） */}
        <div className="card overflow-hidden">
          <button
            type="button"
            onClick={() => setContentsOpen((o) => !o)}
            className="flex w-full items-center gap-1.5 px-4 py-2.5 text-left"
          >
            <Box size={14} className="text-ochre" />
            <h4 className="font-serif text-sm font-semibold text-ink">
              内部快捷清单
            </h4>
            <span className="text-2xs text-ink/45">
              {value.contents.length > 0
                ? `已录入 ${value.contents.length} 项`
                : "储物单元可选"}
            </span>
            <ChevronDown
              size={14}
              className={cn(
                "ml-auto text-ink/40 transition-transform",
                contentsOpen && "rotate-180"
              )}
            />
          </button>

          {contentsOpen && (
            <div className="space-y-2 border-t border-line px-4 py-3">
              {value.contents.length === 0 && (
                <p className="text-2xs text-ink/45">
                  该物品为储物单元（抽屉/冰箱/柜子等）时，可在此记录内部存放了哪些东西，这些内容同样可被检索。
                </p>
              )}

              {value.contents.map((c) => (
                <div key={c.id} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <input
                    id={`content-name-${c.id}`}
                    value={c.name}
                    onChange={(e) => updateContent(c.id, { name: e.target.value })}
                    placeholder="物品名称（如：电池）"
                    className="field w-full sm:min-w-[8rem] sm:flex-1"
                  />
                  <div className="flex gap-2">
                    <input
                      value={c.quantity ?? ""}
                      onChange={(e) => updateContent(c.id, { quantity: e.target.value })}
                      placeholder="数量"
                      className="field w-20 flex-1 sm:flex-none"
                    />
                    <input
                      value={c.remark ?? ""}
                      onChange={(e) => updateContent(c.id, { remark: e.target.value })}
                      placeholder="备注（可选）"
                      className="field min-w-0 flex-[2] sm:min-w-[8rem]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeContent(c.id)}
                    className="btn-ghost self-start text-ochre hover:bg-ochre/10"
                    title="删除该条"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={addContent}
                className="btn-secondary mt-1"
              >
                <Plus size={14} /> 添加一项
              </button>
            </div>
          )}
        </div>

        {/* 放置位置选择（新建时可直接收纳到储物单元） */}
        {isNew && (
          <div className="card p-4">
            <div className="mb-2 flex items-center gap-1.5">
              <Box size={14} className="text-ochre" />
              <h4 className="font-serif text-sm font-semibold text-ink">放置位置</h4>
            </div>
            <select
              value={value.containerItemId ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                onChange({
                  ...valueRef.current,
                  containerItemId: id,
                  containerSlot: "",
                  areaImagePos: id ? null : valueRef.current.areaImagePos,
                });
              }}
              className="field"
            >
              <option value="">直接放在区域内</option>
              {containerCandidates.map((c) => (
                <option key={c.id} value={c.id}>
                  收纳到：{c.name}
                </option>
              ))}
            </select>
            {value.containerItemId && (
              <input
                value={value.containerSlot}
                onChange={(e) => set("containerSlot", e.target.value)}
                placeholder="容器内位置（可选，如：右侧下层）"
                className="field mt-2"
              />
            )}
            {containerCandidates.length === 0 ? (
              <p className="mt-1.5 text-2xs text-ink/45">
                该区域暂无储物单元，将直接放在区域内。
              </p>
            ) : value.containerItemId ? (
              <p className="mt-1.5 text-2xs text-ink/45">
                该物品的位置由储物空间继承，无需在区域图上重复标注。
              </p>
            ) : null}
          </div>
        )}

        {/* 编辑模式：收纳于储物空间时展示说明 */}
        {!isNew && effectiveContained && (
          <div className="card flex items-start gap-3 p-4">
            <Box size={17} className="mt-0.5 shrink-0 text-ochre" />
            <div>
              <h4 className="font-serif text-sm font-semibold text-ink">收纳于 {effectiveContainedName}</h4>
              <p className="mt-1 text-2xs leading-relaxed text-ink/50">
                该物品的位置由储物空间继承，无需在区域图上重复标注。保存后可在详情页更改位置或移出储物空间。
              </p>
            </div>
          </div>
        )}

        {/* 区域图位置点选（未收纳于储物单元时） */}
        {!effectiveContained && (
          <div className="card p-4">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <MapPin size={14} className="text-ochre" />
            <h4 className="font-serif text-sm font-semibold text-ink">
              在区域图上点选位置
            </h4>
            {value.areaImagePos && (
              <button
                type="button"
                onClick={() => set("areaImagePos", null)}
                className="ml-auto text-2xs text-ink/45 hover:text-clay-500"
              >
                清除位置
              </button>
            )}
            </div>

            {images.length > 1 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {images.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() =>
                    set("areaImageId", img.id)
                  }
                  className={cn(
                    "chip cursor-pointer",
                    value.areaImageId === img.id && "chip-active"
                  )}
                >
                  <Layers size={11} /> {img.label || "图片"}
                </button>
              ))}
            </div>
            )}

            {currentImage ? (
            <AreaImageCanvas
              image={currentImage}
              pickable
              pickedPos={value.areaImagePos}
              onPick={(pos) => set("areaImagePos", pos)}
              compact
            />
            ) : (
            <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-clay-50 text-ink/40">
              <ImagePlus size={28} />
              <span className="text-2xs">
                该区域暂无图片，请先到「户型设置」为区域添加图片
              </span>
            </div>
            )}

            <p className="mt-2 text-2xs text-ink/45">
              {value.areaImagePos
                ? `已标注位置 (${value.areaImagePos.x.toFixed(1)}, ${value.areaImagePos.y.toFixed(1)})`
                : currentImage
                ? "点击区域图片任意位置以标注该物品"
                : "—"}
            </p>
          </div>
        )}

        {touched && !value.name && (
          <p className="text-2xs text-ochre">请填写物品名称</p>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("block")}>
      <span className="mb-0.5 flex items-center gap-1 text-2xs uppercase tracking-wider text-ink/50">
        {label}
        {required && <span className="text-ochre">*</span>}
      </span>
      {children}
    </label>
  );
}

/** 表单内维护状态实时预览（让用户填的时候能看到下次到期日） */
function MaintenancePreview({
  cycle,
  lastDate,
}: {
  cycle: number;
  lastDate: string;
}) {
  if (!cycle || cycle <= 0) return null;
  const status = getMaintenanceStatus({
    maintenanceCycle: cycle,
    lastMaintenanceDate: lastDate || undefined,
  });
  const color =
    status.status === "overdue"
      ? "#B91C1C"
      : status.status === "due-soon"
      ? "#D97A3C"
      : status.status === "pending-setup"
      ? "#A86B3C"
      : "#5C7A6A";
  return (
    <div
      className="flex items-center gap-2 rounded border border-line bg-clay-50/60 px-3 py-2 text-2xs"
      style={{ color }}
    >
      <CalendarClock size={12} />
      <span className="font-medium">{status.label}</span>
      {status.nextDate && (
        <span className="text-ink/45">· 下次 {status.nextDate}</span>
      )}
    </div>
  );
}

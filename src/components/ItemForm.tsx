import { useEffect, useRef, useState } from "react";
import { ClipboardPaste, ImagePlus, Layers, MapPin, Plus, Trash2, Wand2, ChevronDown, Box } from "lucide-react";
import AreaImageCanvas from "@/components/AreaImageCanvas";
import { CATEGORIES, type AnchorPosition, type Category, type Item, type StorageEntry } from "@/types";
import { imageOf } from "@/utils/image";
import { compressImage } from "@/utils/compressImage";
import { useHomeStore } from "@/store";
import { genId } from "@/data/seed";
import { cn } from "@/lib/utils";

export interface ItemFormValue {
  name: string;
  category: Category;
  brand: string;
  spec: string;
  purchaseDate: string;
  price: string;
  remark: string;
  image: string;
  /** 物品标注在区域图片上的 id */
  areaImageId: string | null;
  /** 物品在区域图片上的位置 */
  areaImagePos: AnchorPosition | null;
  /** 储物单元内部物品清单（可选） */
  contents: StorageEntry[];
  /** 使用说明（可选） */
  usage: string;
}

export function itemToFormValue(item?: Partial<Item>): ItemFormValue {
  return {
    name: item?.name ?? "",
    category: (item?.category as Category) ?? "家电",
    brand: item?.brand ?? "",
    spec: item?.spec ?? "",
    purchaseDate: item?.purchaseDate ?? "",
    price: item?.price != null ? String(item.price) : "",
    remark: item?.remark ?? "",
    image: item?.image ?? "",
    areaImageId: item?.areaImageId ?? null,
    areaImagePos: item?.areaImagePos ?? null,
    contents: item?.contents?.map((c) => ({ ...c })) ?? [],
    usage: item?.usage ?? "",
  };
}

/** 将表单中的 contents 规整为可存储格式：丢弃空名称行，裁剪空白，省略空字段 */
export function normalizeContents(
  contents: StorageEntry[]
): StorageEntry[] | undefined {
  const result = contents
    .map((c) => ({
      id: c.id,
      name: c.name.trim(),
      quantity: c.quantity?.trim() || undefined,
      remark: c.remark?.trim() || undefined,
    }))
    .filter((c) => c.name.length > 0);
  return result.length > 0 ? result : undefined;
}

interface ItemFormProps {
  value: ItemFormValue;
  onChange: (v: ItemFormValue) => void;
  areaId: string;
}

export default function ItemForm({ value, onChange, areaId }: ItemFormProps) {
  const { areas } = useHomeStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [touched, setTouched] = useState(false);
  const [pasteHint, setPasteHint] = useState<string | null>(null);
  const [contentsOpen, setContentsOpen] = useState(value.contents.length > 0);

  const area = areas.find((a) => a.id === areaId);
  const images = area?.images ?? [];

  // 始终持有最新 value，避免粘贴监听器等闭包用到过期值（导致覆盖已填字段）
  const valueRef = useRef(value);
  valueRef.current = value;

  // 若 value.areaImageId 不在该区域的图片里（或为空），自动选第一张
  useEffect(() => {
    if (images.length === 0) return;
    const valid = images.some((img) => img.id === value.areaImageId);
    if (!valid && value.areaImageId !== images[0].id) {
      onChange({ ...valueRef.current, areaImageId: images[0].id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length, value.areaImageId]);

  const set = <K extends keyof ItemFormValue>(k: K, v: ItemFormValue[K]) =>
    onChange({ ...valueRef.current, [k]: v });

  // 储物单元内部物品清单操作
  const addContent = () => {
    const entry: StorageEntry = { id: genId("cnt"), name: "", quantity: "", remark: "" };
    onChange({ ...valueRef.current, contents: [...valueRef.current.contents, entry] });
    setContentsOpen(true);
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
    try {
      const url = await compressImage(file, 1200, 0.82);
      set("image", url);
    } catch {
      // 压缩失败则回退直接读
      const reader = new FileReader();
      reader.onload = () => set("image", String(reader.result));
      reader.readAsDataURL(file);
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
    <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
      {/* 左：照片 */}
      <div className="space-y-4">
        <div className="card overflow-hidden">
          <div className="bg-clay-50">
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
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-line p-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
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
            {pasteHint && (
              <span className="ml-auto text-2xs text-moss">{pasteHint}</span>
            )}
          </div>
          <input
            value={value.image.startsWith("data:") ? "" : value.image}
            onChange={(e) => set("image", e.target.value)}
            placeholder="或粘贴图片 URL"
            className="w-full border-t border-line bg-transparent px-3 py-2 text-2xs text-ink/60 placeholder:text-ink/30 focus:outline-none"
          />
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

        <div className="grid grid-cols-2 gap-5">
          <Field label="分类">
            <select
              value={value.category}
              onChange={(e) => set("category", e.target.value as Category)}
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

        <div className="grid grid-cols-2 gap-5">
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

        {/* 储物单元内部物品清单（可选） */}
        <div className="card overflow-hidden">
          <button
            type="button"
            onClick={() => setContentsOpen((o) => !o)}
            className="flex w-full items-center gap-1.5 px-4 py-2.5 text-left"
          >
            <Box size={14} className="text-ochre" />
            <h4 className="font-serif text-sm font-semibold text-ink">
              内部物品清单
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
                <div key={c.id} className="flex flex-wrap items-center gap-2">
                  <input
                    value={c.name}
                    onChange={(e) => updateContent(c.id, { name: e.target.value })}
                    placeholder="物品名称（如：电池）"
                    className="field min-w-[8rem] flex-1"
                  />
                  <input
                    value={c.quantity ?? ""}
                    onChange={(e) => updateContent(c.id, { quantity: e.target.value })}
                    placeholder="数量"
                    className="field w-20"
                  />
                  <input
                    value={c.remark ?? ""}
                    onChange={(e) => updateContent(c.id, { remark: e.target.value })}
                    placeholder="备注（可选）"
                    className="field min-w-[8rem] flex-[2]"
                  />
                  <button
                    type="button"
                    onClick={() => removeContent(c.id)}
                    className="btn-ghost text-ochre hover:bg-ochre/10"
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

        {/* 区域图位置点选 */}
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

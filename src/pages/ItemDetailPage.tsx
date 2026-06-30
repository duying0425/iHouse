import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ChevronRight,
  MapPin,
  Pencil,
  Save,
  Trash2,
  X,
} from "lucide-react";
import PageLayout from "@/components/PageLayout";
import AreaImageCanvas from "@/components/AreaImageCanvas";
import ItemForm, { itemToFormValue, type ItemFormValue } from "@/components/ItemForm";
import EmptyState from "@/components/Empty";
import { useHomeStore } from "@/store";
import { CATEGORY_COLOR } from "@/types";

export default function ItemDetailPage() {
  const { areaId = "", itemId = "" } = useParams();
  const navigate = useNavigate();
  const { areas, updateItem, removeItem } = useHomeStore();

  const found = useMemo(
    () =>
      areas
        .find((a) => a.id === areaId)
        ?.items.find((i) => i.id === itemId),
    [areas, areaId, itemId]
  );
  const area = areas.find((a) => a.id === areaId);

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<ItemFormValue>(itemToFormValue(found));

  if (!found || !area) {
    return (
      <PageLayout title="物品不存在">
        <EmptyState
          title="未找到该物品"
          description="可能已被删除或链接有误。"
          action={
            <Link to="/" className="btn-primary">
              返回首页
            </Link>
          }
        />
      </PageLayout>
    );
  }

  const handleSave = () => {
    if (!value.name.trim()) return;
    updateItem(areaId, itemId, {
      name: value.name.trim(),
      category: value.category,
      brand: value.brand.trim() || undefined,
      spec: value.spec.trim() || undefined,
      purchaseDate: value.purchaseDate || undefined,
      price: value.price ? Number(value.price) : undefined,
      remark: value.remark.trim() || undefined,
      image: value.image,
      areaImageId: value.areaImageId || undefined,
      areaImagePos: value.areaImagePos || undefined,
    });
    setEditing(false);
  };

  const handleDelete = () => {
    if (confirm(`确定删除「${found.name}」吗？此操作不可撤销。`)) {
      removeItem(areaId, itemId);
      navigate(`/area/${areaId}`);
    }
  };

  const color = CATEGORY_COLOR[found.category];

  return (
    <PageLayout
      title={found.name}
      subtitle={`${found.category} · ${area.name}`}
    >
      {/* 面包屑 */}
      <nav className="mb-5 flex items-center gap-1 text-2xs text-ink/45">
        <Link to="/" className="hover:text-clay-500">
          居所图鉴
        </Link>
        <ChevronRight size={12} />
        <Link to={`/area/${areaId}`} className="hover:text-clay-500">
          {area.name}
        </Link>
        <ChevronRight size={12} />
        <span className="text-ink/70">{found.name}</span>
      </nav>

      {editing ? (
        <>
          <ItemForm value={value} onChange={setValue} areaId={areaId} />
          <div className="mt-8 flex items-center justify-end gap-2 border-t border-line pt-5">
            <button onClick={() => setEditing(false)} className="btn-secondary">
              <X size={15} /> 取消
            </button>
            <button
              onClick={handleSave}
              disabled={!value.name.trim()}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Save size={15} /> 保存修改
            </button>
          </div>
        </>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
          {/* 左：照片 */}
          <div className="card overflow-hidden">
            <div className="relative bg-clay-50">
              <img
                src={found.image}
                alt={found.name}
                className="block h-auto w-full object-contain"
              />
              <span className="absolute left-3 top-3 chip bg-cream/90 backdrop-blur-sm">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: color }}
                />
                {found.category}
              </span>
            </div>
          </div>

          {/* 右：信息 */}
          <div className="flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="font-serif text-3xl font-semibold leading-tight text-ink">
                  {found.name}
                </h1>
                {found.brand && (
                  <p className="mt-1 text-sm text-ink/55">{found.brand}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button onClick={() => setEditing(true)} className="btn-secondary">
                  <Pencil size={15} /> 编辑
                </button>
                <button
                  onClick={handleDelete}
                  className="btn-ghost text-ochre hover:bg-ochre/10"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            {/* 信息表 */}
            <dl className="mt-6 divide-y divide-line border-y border-line">
              <InfoRow label="规格" value={found.spec} />
              <InfoRow label="分类" value={found.category} />
              <InfoRow label="品牌" value={found.brand} />
              <InfoRow label="购入日期" value={found.purchaseDate} />
              <InfoRow
                label="价格"
                value={
                  found.price != null
                    ? `¥ ${found.price.toLocaleString()}`
                    : undefined
                }
              />
              <InfoRow label="备注" value={found.remark} />
            </dl>

            {/* 区域图定位 */}
            <div className="mt-6 card overflow-hidden">
              <div className="flex items-center gap-1.5 border-b border-line px-4 py-2.5">
                <MapPin size={14} className="text-ochre" />
                <h3 className="font-serif text-sm font-semibold text-ink">
                  在区域图中的位置
                </h3>
                <span className="ml-auto text-2xs text-ink/45">
                  {found.areaImagePos ? "已标注" : "未标注"}
                </span>
              </div>
              {(() => {
                const img =
                  area.images.find((i) => i.id === found.areaImageId) ??
                  area.images[0];
                if (found.areaImagePos && img) {
                  return (
                    <div className="p-4">
                      <AreaImageCanvas
                        image={img}
                        items={[
                          { ...found, areaImagePos: found.areaImagePos! },
                        ]}
                        activeItemId={found.id}
                        compact
                      />
                      {img.label && (
                        <p className="mt-2 text-2xs text-ink/45">
                          标注于：{img.label}
                        </p>
                      )}
                    </div>
                  );
                }
                return (
                  <div className="p-6 text-center text-sm text-ink/45">
                    该物品尚未在区域图上标注位置，
                    <button
                      onClick={() => setEditing(true)}
                      className="text-clay-500 underline-offset-2 hover:underline"
                    >
                      去编辑标注
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-baseline gap-4 py-2.5">
      <dt className="w-20 shrink-0 text-2xs uppercase tracking-wider text-ink/45">
        {label}
      </dt>
      <dd className="flex-1 text-sm text-ink/80">
        {value || <span className="text-ink/30">—</span>}
      </dd>
    </div>
  );
}

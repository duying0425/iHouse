import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ChevronRight,
  MapPin,
  Pencil,
  Save,
  Trash2,
  X,
  Box,
  BookOpen,
  Layers,
  CalendarClock,
} from "lucide-react";
import PageLayout from "@/components/PageLayout";
import AreaImageCanvas from "@/components/AreaImageCanvas";
import ItemForm, { itemToFormValue, normalizeContents, type ItemFormValue } from "@/components/ItemForm";
import EmptyState from "@/components/Empty";
import { useHomeStore } from "@/store";
import { CATEGORY_COLOR } from "@/types";
import SafeImage from "@/components/SafeImage";
import {
  getMaintenanceStatus,
  MAINTENANCE_STATUS_COLOR,
  cycleLabel,
  type MaintenanceStatus,
} from "@/utils/maintenance";

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
  const [previewImage, setPreviewImage] = useState<string | null>(null);

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
      gallery: value.gallery,
      areaImageId: value.areaImageId || undefined,
      areaImagePos: value.areaImagePos || undefined,
      contents: normalizeContents(value.contents),
      usage: value.usage.trim() || undefined,
      maintenanceCycle: value.maintenanceCycle
        ? Number(value.maintenanceCycle)
        : undefined,
      lastMaintenanceDate: value.lastMaintenanceDate || undefined,
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

  // 维护状态计算
  const maintenance = found.maintenanceCycle
    ? getMaintenanceStatus(found)
    : null;
  const isAlert =
    maintenance?.status === "overdue" ||
    maintenance?.status === "due-soon" ||
    maintenance?.status === "pending-setup";

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
          {/* 左：照片与相册 */}
          <div className="space-y-4">
            <div className="card overflow-hidden">
              <div className="relative bg-clay-50">
                <SafeImage
                  category={found.category}
                  src={found.image}
                  alt={found.name}
                  className="block h-auto w-full object-contain cursor-zoom-in"
                  fallbackClassName="aspect-[4/3] w-full"
                  onClick={() => setPreviewImage(found.image)}
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

            {found.gallery && found.gallery.length > 0 && (
              <div className="card p-4">
                <h3 className="mb-3 font-serif text-sm font-semibold text-ink flex items-center gap-1.5">
                  <Layers size={14} className="text-moss" />
                  附属相册
                  <span className="text-2xs font-normal text-ink/45">
                    ({found.gallery.length} 张图片)
                  </span>
                </h3>
                <div className="grid grid-cols-4 gap-2">
                  {found.gallery.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setPreviewImage(img)}
                      className="aspect-[4/3] rounded border border-line overflow-hidden bg-clay-50 hover:opacity-85 active:scale-[0.98] transition-all"
                    >
                      <img src={img} alt={`附属图 ${idx + 1}`} className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}
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
                {/* 维护状态徽标 */}
                {maintenance && (
                  <MaintenanceBadge
                    status={maintenance.status}
                    label={maintenance.label}
                    nextDate={maintenance.nextDate}
                  />
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

            {/* 维护提醒高亮卡片（仅过期/即将到期时显示） */}
            {isAlert && maintenance && (
              <div
                className="mt-4 flex items-center gap-2 rounded border px-3 py-2 text-xs"
                style={{
                  borderColor:
                    MAINTENANCE_STATUS_COLOR[maintenance.status] + "55",
                  background:
                    MAINTENANCE_STATUS_COLOR[maintenance.status] + "12",
                  color: MAINTENANCE_STATUS_COLOR[maintenance.status],
                }}
              >
                <CalendarClock size={14} />
                <span className="font-medium">{maintenance.label}</span>
                {maintenance.nextDate && (
                  <span className="text-ink/50">
                    下次维护日：{maintenance.nextDate}
                  </span>
                )}
                <button
                  onClick={() => setEditing(true)}
                  className="ml-auto text-2xs underline-offset-2 hover:underline"
                >
                  去更新
                </button>
              </div>
            )}

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
              {found.maintenanceCycle && (
                <InfoRow
                  label="维护周期"
                  value={cycleLabel(found.maintenanceCycle)}
                />
              )}
              {found.lastMaintenanceDate && (
                <InfoRow
                  label="上次维护"
                  value={found.lastMaintenanceDate}
                />
              )}
              {maintenance?.nextDate && (
                <InfoRow
                  label="下次维护"
                  value={maintenance.nextDate}
                />
              )}
            </dl>

            {/* 使用说明（多行） */}
            {found.usage && (
              <div className="mt-6 card overflow-hidden">
                <div className="flex items-center gap-1.5 border-b border-line px-4 py-2.5">
                  <BookOpen size={14} className="text-ochre" />
                  <h3 className="font-serif text-sm font-semibold text-ink">
                    使用说明
                  </h3>
                </div>
                <p className="whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed text-ink/80">
                  {found.usage}
                </p>
              </div>
            )}

            {/* 内部物品清单（储物单元） */}
            {found.contents && found.contents.length > 0 && (
              <div className="mt-6 card overflow-hidden">
                <div className="flex items-center gap-1.5 border-b border-line px-4 py-2.5">
                  <Box size={14} className="text-ochre" />
                  <h3 className="font-serif text-sm font-semibold text-ink">
                    内部物品清单
                  </h3>
                  <span className="ml-auto text-2xs text-ink/45">
                    共 {found.contents.length} 项
                  </span>
                </div>
                <ul className="divide-y divide-line">
                  {found.contents.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-baseline gap-3 px-4 py-2.5"
                    >
                      <span className="flex-1 text-sm text-ink/80">
                        {c.name}
                      </span>
                      {c.quantity && (
                        <span className="text-2xs text-ink/55">
                          {c.quantity}
                        </span>
                      )}
                      {c.remark && (
                        <span className="max-w-[50%] truncate text-2xs text-ink/45">
                          {c.remark}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="border-t border-line px-4 py-2 text-2xs text-ink/40">
                  清单内的物品名称与备注同样参与关键词检索。
                </p>
              </div>
            )}

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

      {/* 图片大图预览 Lightbox */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/75 p-4 backdrop-blur-sm transition-all duration-300 animate-fadeIn cursor-zoom-out"
          onClick={() => setPreviewImage(null)}
        >
          <button
            onClick={() => setPreviewImage(null)}
            className="absolute right-4 top-4 text-cream hover:text-white bg-ink/50 p-2 rounded-full transition-colors"
            aria-label="关闭预览"
          >
            <X size={20} />
          </button>
          <img
            src={previewImage}
            alt="预览图片"
            className="max-h-[90vh] max-w-[90vw] rounded shadow-2xl object-contain animate-zoomIn"
            onClick={(e) => e.stopPropagation()}
          />
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

/** 标题下方的维护状态小徽标 */
function MaintenanceBadge({
  status,
  label,
  nextDate,
}: {
  status: MaintenanceStatus;
  label: string;
  nextDate: string | null;
}) {
  if (status === "none") return null;
  const color = MAINTENANCE_STATUS_COLOR[status];
  return (
    <span
      className="mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium"
      style={{
        borderColor: color + "55",
        background: color + "12",
        color,
      }}
    >
      <CalendarClock size={11} />
      {label}
      {nextDate && status === "ok" && (
        <span className="text-ink/40">· {nextDate}</span>
      )}
    </span>
  );
}

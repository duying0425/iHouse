import { Fragment, useMemo, useState } from "react";
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
  Link2,
  Move,
  Plus,
} from "lucide-react";
import PageLayout from "@/components/PageLayout";
import AreaImageCanvas from "@/components/AreaImageCanvas";
import ItemForm from "@/components/ItemForm";
import { itemToFormValue, normalizeContents, type ItemFormValue } from "@/components/itemFormValue";
import EmptyState from "@/components/Empty";
import { useHomeStore } from "@/store";
import { CATEGORY_COLOR, type AreaImage, type Item } from "@/types";
import SafeImage from "@/components/SafeImage";
import {
  getMaintenanceStatus,
  MAINTENANCE_STATUS_COLOR,
  cycleLabel,
  type MaintenanceStatus,
} from "@/utils/maintenance";
import {
  findItemInAreas,
  getDescendantIds,
  getDirectContainedItems,
  getItemLocationPath,
  getItemLocationTrail,
} from "@/utils/itemLocation";

export default function ItemDetailPage() {
  const { areaId = "", itemId = "" } = useParams();
  const navigate = useNavigate();
  const { areas, updateItem, moveItem, removeItem } = useHomeStore();

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
  const [linkingExisting, setLinkingExisting] = useState(false);
  const [linkItemId, setLinkItemId] = useState("");
  const [linkSlot, setLinkSlot] = useState("");
  const [moving, setMoving] = useState(false);
  const [destinationKey, setDestinationKey] = useState("");
  const [destinationSlot, setDestinationSlot] = useState("");
  const [locationError, setLocationError] = useState<string | null>(null);

  const container = useMemo(
    () => found?.containerItemId
      ? findItemInAreas(areas, found.containerItemId)
      : undefined,
    [areas, found?.containerItemId]
  );
  const containedItems = useMemo(
    () => found ? getDirectContainedItems(areas, found.id) : [],
    [areas, found]
  );
  const descendants = useMemo(
    () => found ? getDescendantIds(areas, found.id) : new Set<string>(),
    [areas, found]
  );
  const allItemEntries = useMemo(
    () => areas.flatMap((candidateArea) =>
      candidateArea.items.map((item) => ({ item, area: candidateArea }))
    ),
    [areas]
  );
  const linkCandidates = useMemo(() => {
    if (!found) return [];
    return allItemEntries.filter(({ item }) => {
      if (item.id === found.id || descendants.has(item.id)) return false;
      // found 已经收纳在候选物品之下时，反向关联会形成环。
      return !getDescendantIds(areas, item.id).has(found.id);
    });
  }, [allItemEntries, areas, descendants, found]);
  const containerCandidates = useMemo(
    () => found
      ? allItemEntries.filter(({ item }) => item.id !== found.id && !descendants.has(item.id))
      : [],
    [allItemEntries, descendants, found]
  );

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
      tags: value.tags ? value.tags.split(/[,，\s]+/).map(t => t.trim()).filter(Boolean) : undefined,
      spec: value.spec.trim() || undefined,
      purchaseDate: value.purchaseDate || undefined,
      price: value.price ? Number(value.price) : undefined,
      remark: value.remark.trim() || undefined,
      image: value.image,
      gallery: value.gallery,
      areaImageId: found.containerItemId ? undefined : value.areaImageId || undefined,
      areaImagePos: found.containerItemId ? undefined : value.areaImagePos || undefined,
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
    const releaseTip = descendants.size > 0
      ? `\n\n其中 ${descendants.size} 件正式物品都会保留；直属物品将移到「${container?.item.name || area.name}」。快捷清单会随本物品删除。`
      : "";
    if (confirm(`确定删除「${found.name}」吗？此操作不可撤销。${releaseTip}`)) {
      removeItem(areaId, itemId);
      navigate(`/area/${areaId}`);
    }
  };

  const handleLinkExisting = () => {
    if (!linkItemId) return;
    setLocationError(null);
    try {
      moveItem(linkItemId, {
        kind: "container",
        containerItemId: found.id,
        containerSlot: linkSlot,
      });
      setLinkItemId("");
      setLinkSlot("");
      setLinkingExisting(false);
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : "关联失败");
    }
  };

  const openMove = () => {
    setDestinationKey(
      found.containerItemId
        ? `container:${found.containerItemId}`
        : `area:${area.id}`
    );
    setDestinationSlot(found.containerSlot ?? "");
    setLocationError(null);
    setMoving(true);
  };

  const handleMove = () => {
    const [kind, id] = destinationKey.split(":");
    if (!id) return;
    setLocationError(null);
    try {
      const movedItem = kind === "container"
        ? moveItem(found.id, {
            kind: "container",
            containerItemId: id,
            containerSlot: destinationSlot,
          })
        : moveItem(found.id, { kind: "area", areaId: id });
      setMoving(false);
      navigate(`/area/${movedItem.areaId}/item/${movedItem.id}`, { replace: true });
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : "移动失败");
    }
  };

  const color = CATEGORY_COLOR[found.category];
  const locationImage =
    area.images.find((image) => image.id === found.areaImageId) ?? area.images[0];
  const hasLocationVisual = Boolean(found.areaImagePos && locationImage);
  const hasGallery = Boolean(found.gallery?.length);
  const hasMediaColumn = Boolean(found.image || hasGallery || hasLocationVisual);
  const promoteLocation = !found.image && hasLocationVisual;
  const locationPath = getItemLocationPath(areas, found.id);
  const locationTrail = getItemLocationTrail(areas, found.id);

  // 储物空间内的物品按名称排序
  const sortedContents = found.contents
    ? [...found.contents].sort((a, b) =>
        a.name.localeCompare(b.name, "zh-CN")
      )
    : [];
  const isStorageSpace =
    found.category === "储物" || sortedContents.length > 0 || containedItems.length > 0;

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
      subtitle={`${found.category} · ${locationPath.join(" → ")}`}
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
        {container && (
          <>
            <ChevronRight size={12} />
            <Link
              to={`/area/${container.area.id}/item/${container.item.id}`}
              className="hover:text-clay-500"
            >
              {container.item.name}
            </Link>
          </>
        )}
        <ChevronRight size={12} />
        <span className="text-ink/70">{found.name}</span>
      </nav>

      {editing ? (
        <>
          <ItemForm
            value={value}
            onChange={setValue}
            areaId={areaId}
            containedInName={container?.item.name}
          />
          <div className="action-bar sticky bottom-0 z-20 -mb-5 mt-8 flex items-center gap-2 border-t border-line bg-paper/95 py-3 backdrop-blur-md sm:-mb-8 sm:justify-end">
            <button onClick={() => setEditing(false)} className="btn-secondary shrink-0">
              <X size={15} /> <span className="hidden sm:inline">取消</span>
            </button>
            <button
              onClick={handleSave}
              disabled={!value.name.trim()}
              className="btn-primary flex-1 sm:flex-none disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Save size={15} /> 保存修改
            </button>
          </div>
        </>
      ) : (
        <div className={hasMediaColumn ? "grid gap-6 lg:grid-cols-[1fr_1.1fr] lg:gap-8" : "mx-auto max-w-4xl"}>
          {/* 左：照片与相册 */}
          {hasMediaColumn && <div className="space-y-4">
            {found.image && (
              <div className="card overflow-hidden">
                <div className="relative aspect-[4/3] bg-clay-50">
                  <SafeImage
                    category={found.category}
                    src={found.image}
                    alt={found.name}
                    className="h-full w-full cursor-zoom-in object-contain"
                    fallbackClassName="absolute inset-0"
                    onClick={() => setPreviewImage(found.image ?? null)}
                  />
                  <span className="absolute left-3 top-3 chip bg-cream/90 backdrop-blur-sm">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                    {found.category}
                  </span>
                </div>
              </div>
            )}

            {found.gallery && found.gallery.length > 0 && (
              <div className="card p-4">
                <h3 className="mb-3 font-serif text-sm font-semibold text-ink flex items-center gap-1.5">
                  <Layers size={14} className="text-moss" />
                  附属相册
                  <span className="text-2xs font-normal text-ink/45">
                    ({found.gallery.length} 张图片)
                  </span>
                </h3>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
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
            {promoteLocation && (
              <LocationCard item={found} image={locationImage} onEdit={() => setEditing(true)} />
            )}
          </div>}

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
                {found.tags && found.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {found.tags.map((tag) => (
                      <span key={tag} className="chip bg-clay-50/50 text-clay-700 border-clay-200/60">
                        {tag}
                      </span>
                    ))}
                  </div>
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
                  aria-label="删除物品"
                  title="删除物品"
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
              <InfoRow label="别名 / 标签">
                {found.tags && found.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {found.tags.map((tag) => (
                      <span key={tag} className="chip bg-clay-50/50 text-clay-700 border-clay-200/60">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </InfoRow>
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

            {/* 储物空间内的完整物品档案 */}
            {isStorageSpace && <div className="mt-6 card overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
                <Box size={14} className="text-ochre" />
                <h3 className="font-serif text-sm font-semibold text-ink">内部档案物品</h3>
                <span className="text-2xs text-ink/45">{containedItems.length} 件</span>
                <div className="ml-auto flex flex-wrap gap-1.5">
                  <Link
                    to={`/area/${area.id}/item/new?container=${encodeURIComponent(found.id)}`}
                    className="btn-secondary"
                  >
                    <Plus size={13} /> 登记完整物品
                  </Link>
                  <button
                    type="button"
                    onClick={() => setLinkingExisting((open) => !open)}
                    className="btn-ghost"
                  >
                    <Link2 size={13} /> 关联已有物品
                  </button>
                </div>
              </div>

              {linkingExisting && (
                <div className="border-b border-line bg-clay-50/50 p-3">
                  {linkCandidates.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <select
                        value={linkItemId}
                        onChange={(event) => setLinkItemId(event.target.value)}
                        className="field"
                      >
                        <option value="">选择已有物品</option>
                        {linkCandidates.map(({ item, area: candidateArea }) => (
                          <option key={item.id} value={item.id}>
                            {item.name} · {candidateArea.name}
                          </option>
                        ))}
                      </select>
                      <input
                        value={linkSlot}
                        onChange={(event) => setLinkSlot(event.target.value)}
                        className="field"
                        placeholder="容器内位置（可选）"
                      />
                      <button
                        type="button"
                        onClick={handleLinkExisting}
                        disabled={!linkItemId}
                        className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        确认关联
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-ink/45">暂无其他可关联的正式物品。</p>
                  )}
                </div>
              )}

              {containedItems.length > 0 ? (
                <ul className="divide-y divide-line">
                  {containedItems.map((item) => (
                    <li key={item.id}>
                      <Link
                        to={`/area/${item.areaId}/item/${item.id}`}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-clay-50/60"
                      >
                        {item.image ? (
                          <SafeImage
                            category={item.category}
                            src={item.image}
                            alt={item.name}
                            className="h-10 w-10 shrink-0 rounded object-cover"
                          />
                        ) : (
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-clay-50 text-ink/35">
                            <Box size={16} />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">{item.name}</span>
                          <span className="block truncate text-2xs text-ink/45">
                            {[item.brand, item.containerSlot].filter(Boolean).join(" · ") || item.category}
                          </span>
                        </span>
                        <ChevronRight size={14} className="shrink-0 text-ink/30" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-4 text-center text-xs text-ink/40">
                  暂无完整物品，可新建档案或关联已有物品。
                </p>
              )}
            </div>}

            {/* 内部快捷清单（储物单元） */}
            {sortedContents.length > 0 && (
              <div className="mt-6 card overflow-hidden">
                <div className="flex items-center gap-1.5 border-b border-line px-4 py-2.5">
                  <Box size={14} className="text-ochre" />
                  <h3 className="font-serif text-sm font-semibold text-ink">
                    内部快捷清单
                  </h3>
                  <span className="ml-auto text-2xs text-ink/45">
                    共 {sortedContents.length} 项
                  </span>
                </div>
                <ul className="divide-y divide-line">
                  {sortedContents.map((c) => (
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
                  适合不需要照片、品牌和维护档案的小物品；名称与备注同样参与关键词检索。
                </p>
              </div>
            )}

            {/* 统一位置关系与移动入口 */}
            <div className="mt-6 card overflow-hidden">
              <div className="flex items-center gap-1.5 border-b border-line px-4 py-2.5">
                <Move size={14} className="text-ochre" />
                <h3 className="font-serif text-sm font-semibold text-ink">当前位置</h3>
                <button type="button" onClick={openMove} className="btn-ghost ml-auto">
                  更改位置
                </button>
              </div>
              <div className="px-4 py-3">
                <nav
                  aria-label={`${found.name}的当前位置`}
                  className="flex flex-wrap items-center gap-1 text-sm text-ink/75"
                >
                  {locationTrail.map((segment, index) => (
                    <Fragment key={`${segment.kind}:${segment.id}`}>
                      {index > 0 && <ChevronRight size={13} className="text-ink/30" />}
                      <Link
                        to={segment.kind === "area"
                          ? `/area/${segment.id}`
                          : `/area/${segment.areaId}/item/${segment.id}`}
                        className="font-medium text-clay-600 underline-offset-2 hover:underline"
                      >
                        {segment.name}
                      </Link>
                    </Fragment>
                  ))}
                  {found.containerSlot && (
                    <span className="ml-1 text-ink/55">· {found.containerSlot}</span>
                  )}
                </nav>
                {found.containerItemId && (
                  <p className="mt-1 text-2xs text-ink/45">区域位置继承自储物空间，不重复标注坐标。</p>
                )}
              </div>
              {moving && (
                <div className="border-t border-line bg-clay-50/50 p-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <select
                      value={destinationKey}
                      onChange={(event) => {
                        setDestinationKey(event.target.value);
                        setDestinationSlot("");
                      }}
                      className="field"
                    >
                      <optgroup label="直接放在区域内">
                        {areas.map((candidateArea) => (
                          <option key={candidateArea.id} value={`area:${candidateArea.id}`}>
                            {candidateArea.name}
                          </option>
                        ))}
                      </optgroup>
                      {containerCandidates.length > 0 && (
                        <optgroup label="收纳于正式物品">
                          {containerCandidates.map(({ item, area: candidateArea }) => (
                            <option key={item.id} value={`container:${item.id}`}>
                              {candidateArea.name} · {item.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    {destinationKey.startsWith("container:") ? (
                      <input
                        value={destinationSlot}
                        onChange={(event) => setDestinationSlot(event.target.value)}
                        className="field"
                        placeholder="容器内位置（可选）"
                      />
                    ) : (
                      <p className="self-center text-2xs text-ink/45">移动后可重新标注区域图坐标。</p>
                    )}
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => setMoving(false)} className="btn-ghost">取消</button>
                      <button type="button" onClick={handleMove} className="btn-primary">确认移动</button>
                    </div>
                  </div>
                </div>
              )}
              {locationError && (
                <p className="border-t border-line px-4 py-2 text-xs text-ochre">{locationError}</p>
              )}
            </div>

            {/* 直接位于区域内时才显示区域图定位 */}
            {!found.containerItemId && !promoteLocation && (
              <LocationCard item={found} image={locationImage} onEdit={() => setEditing(true)} />
            )}
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

function LocationCard({ item, image, onEdit }: { item: Item; image?: AreaImage; onEdit: () => void }) {
  const hasPosition = Boolean(item.areaImagePos && image);
  return (
    <div className="mt-6 card overflow-hidden first:mt-0">
      <div className="flex items-center gap-1.5 border-b border-line px-4 py-2.5">
        <MapPin size={14} className="text-ochre" />
        <h3 className="font-serif text-sm font-semibold text-ink">在区域图中的位置</h3>
        <span className="ml-auto text-2xs text-ink/45">{hasPosition ? "已标注" : "未标注"}</span>
      </div>
      {hasPosition ? (
        <div className="p-4">
          <AreaImageCanvas
            image={image}
            items={[{ ...item, areaImagePos: item.areaImagePos! }]}
            activeItemId={item.id}
            compact
          />
          {image?.label && <p className="mt-2 text-2xs text-ink/45">标注于：{image.label}</p>}
        </div>
      ) : (
        <div className="p-4 text-center text-xs text-ink/45">
          尚未标注位置，
          <button onClick={onEdit} className="text-clay-500 underline-offset-2 hover:underline">去编辑标注</button>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-4 py-2.5">
      <dt className="w-20 shrink-0 text-2xs uppercase tracking-wider text-ink/45">
        {label}
      </dt>
      <dd className="flex-1 text-sm text-ink/80">
        {children || value || <span className="text-ink/30">—</span>}
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

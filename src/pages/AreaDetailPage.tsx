import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ChevronRight,
  Layers,
  MapPin,
  Plus,
  Search as SearchIcon,
  X,
} from "lucide-react";
import PageLayout from "@/components/PageLayout";
import AreaImageCanvas from "@/components/AreaImageCanvas";
import ItemCard from "@/components/ItemCard";
import EmptyState from "@/components/Empty";
import { useHomeStore } from "@/store";
import { cn } from "@/lib/utils";

export default function AreaDetailPage() {
  const { areaId = "" } = useParams();
  const navigate = useNavigate();
  const { areas } = useHomeStore();
  const [kw, setKw] = useState("");
  const [hoverId, setHoverId] = useState<string | undefined>();
  const [activeImageId, setActiveImageId] = useState<string | undefined>();

  const area = useMemo(() => areas.find((a) => a.id === areaId), [areas, areaId]);
  const areaIndex = useMemo(
    () => areas.findIndex((a) => a.id === areaId),
    [areas, areaId]
  );

  const filteredItems = useMemo(() => {
    if (!area) return [];
    const k = kw.trim().toLowerCase();
    if (!k) return area.items;
    return area.items.filter((i) =>
      [i.name, i.brand, i.spec, i.remark, i.category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(k)
    );
  }, [area, kw]);

  if (!area) {
    return (
      <PageLayout title="区域不存在">
        <EmptyState
          title="未找到该区域"
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

  const images = area.images;
  const currentImageId = activeImageId ?? images[0]?.id;
  const currentImage = images.find((i) => i.id === currentImageId) ?? images[0];
  // 当前图片上需要展示标记的物品（仅属于该图的）
  const itemsOnCurrentImage = filteredItems.filter(
    (i) => i.areaImageId === currentImage?.id && i.areaImagePos
  );

  return (
    <PageLayout
      title={area.name}
      subtitle={`区域 ${String(areaIndex + 1).padStart(2, "0")} · ${area.items.length} 件物品`}
      addHref={`/area/${area.id}/item/new`}
    >
      {/* 面包屑 */}
      <nav className="mb-5 flex items-center gap-1 text-2xs text-ink/45">
        <Link to="/" className="hover:text-clay-500">
          居所图鉴
        </Link>
        <ChevronRight size={12} />
        <span className="text-ink/70">{area.name}</span>
      </nav>

      {/* 区域图片 + 物品标记 */}
      <section className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
            <h3 className="flex items-center gap-1.5 font-serif text-sm font-semibold text-ink">
              <Layers size={15} className="text-clay-500" />
              区域图片
              <span className="text-2xs font-normal text-ink/45">
                · 物品位置已标在图上
              </span>
            </h3>
            {images.length > 0 && (
              <span className="text-2xs text-ink/45">
                {images.length} 张图
              </span>
            )}
          </div>

          {images.length === 0 ? (
            <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 bg-clay-50 text-ink/40">
              <Layers size={28} />
              <span className="text-2xs">
                该区域暂无图片，请到「户型设置」上传
              </span>
              <Link to="/setup" className="btn-secondary mt-1">
                去设置
              </Link>
            </div>
          ) : (
            <>
              {/* 多图切换 */}
              {images.length > 1 && (
                <div className="flex flex-wrap gap-1.5 border-b border-line bg-cream/60 px-3 py-2">
                  {images.map((img) => (
                    <button
                      key={img.id}
                      onClick={() => setActiveImageId(img.id)}
                      className={cn(
                        "chip cursor-pointer",
                        currentImage?.id === img.id && "chip-active"
                      )}
                    >
                      {img.label || "图片"}
                    </button>
                  ))}
                </div>
              )}

              <AreaImageCanvas
                image={currentImage}
                items={itemsOnCurrentImage}
                activeItemId={hoverId}
                onItemClick={(id) => {
                  navigate(`/area/${area.id}/item/${id}`);
                }}
              />
            </>
          )}

          {area.description && (
            <p className="px-4 py-3 text-sm text-ink/65">{area.description}</p>
          )}
        </div>

        {/* 缩略图列表 */}
        <div className="flex flex-col gap-4">
          {images.length > 0 && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                <h3 className="flex items-center gap-1.5 font-serif text-sm font-semibold text-ink">
                  <MapPin size={14} className="text-moss" />
                  区域图索引
                </h3>
                <span className="text-2xs text-ink/45">{images.length} 张</span>
              </div>
              <div className="grid grid-cols-2 gap-2 p-3">
                {images.map((img) => (
                  <button
                    key={img.id}
                    onClick={() => setActiveImageId(img.id)}
                    className={cn(
                      "group relative overflow-hidden rounded border-2 transition-all",
                      currentImage?.id === img.id
                        ? "border-clay-500"
                        : "border-line hover:border-clay-300"
                    )}
                  >
                    <div className="aspect-[4/3] bg-clay-50">
                      <img
                        src={img.url}
                        alt={img.label || ""}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    {img.label && (
                      <span className="absolute inset-x-0 bottom-0 bg-ink/55 py-0.5 text-center text-[10px] text-cream">
                        {img.label}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 物品计数 */}
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-sm font-semibold text-ink">
                物品统计
              </h3>
              <span className="text-2xs text-ink/45">{area.items.length} 件</span>
            </div>
            <p className="mt-2 text-2xs text-ink/55">
              点击下方物品卡片可在左侧区域图上高亮其位置；点击图上的标记可跳转物品详情。
            </p>
          </div>
        </div>
      </section>

      {/* 物品列表 */}
      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="font-display text-2xs uppercase tracking-[0.2em] text-clay-500">
              02 · Items
            </span>
            <h2 className="font-serif text-2xl font-semibold text-ink">
              {area.name}的物品
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <SearchIcon
                size={15}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/35"
              />
              <input
                value={kw}
                onChange={(e) => setKw(e.target.value)}
                placeholder="区域内检索"
                className="w-44 rounded border border-line bg-cream py-1.5 pl-8 pr-7 text-xs text-ink placeholder:text-ink/35 focus:border-clay-400 focus:outline-none"
              />
              {kw && (
                <button
                  onClick={() => setKw("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <Link to={`/area/${area.id}/item/new`} className="btn-primary">
              <Plus size={15} /> 录入
            </Link>
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <EmptyState
            icon={<Plus size={22} />}
            title={kw ? "区域内未匹配到物品" : "该区域暂无物品"}
            description={
              kw ? "尝试更换关键词。" : "点击「录入」添加第一件物品。"
            }
            action={
              !kw && (
                <Link to={`/area/${area.id}/item/new`} className="btn-primary">
                  <Plus size={16} /> 录入物品
                </Link>
              )
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                onMouseEnter={() => {
                  setHoverId(item.id);
                  // 联动：若物品标在别的图上，切换到那张图
                  if (item.areaImageId && item.areaImageId !== currentImage?.id) {
                    setActiveImageId(item.areaImageId);
                  }
                }}
                onMouseLeave={() => setHoverId(undefined)}
              >
                <ItemCard item={item} highlighted={hoverId === item.id} />
              </div>
            ))}
          </div>
        )}
      </section>
    </PageLayout>
  );
}

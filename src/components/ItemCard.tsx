import { Link } from "react-router-dom";
import { Box, MapPin, ChevronRight } from "lucide-react";
import type { Item } from "@/types";
import { CATEGORY_COLOR } from "@/types";
import { cn } from "@/lib/utils";
import SafeImage from "@/components/SafeImage";
import { isMockImage } from "@/utils/image";

interface ItemCardProps {
  item: Item;
  areaName?: string;
  containerName?: string;
  /** 是否高亮（检索命中态） */
  highlighted?: boolean;
  onClick?: () => void;
  viewMode?: "grid" | "list";
}

export default function ItemCard({
  item,
  areaName,
  containerName,
  highlighted,
  onClick,
  viewMode = "grid",
}: ItemCardProps) {
  const color = CATEGORY_COLOR[item.category];
  const to = `/area/${item.areaId}/item/${item.id}`;
  const hasImage = Boolean(item.image) && !isMockImage(item.image);
  const isListView = viewMode === "list";

  const inner = isListView ? (
    <article
      className={cn(
        "group relative flex items-center gap-3 p-3 rounded-lg border border-line bg-paper hover:bg-clay-50/30 hover:shadow-sm transition-all pl-4",
        highlighted && "ring-2 ring-ochre/40"
      )}
    >
      {/* 左侧分类色标条 */}
      <span
        className="absolute left-0 top-0 bottom-0 z-10 w-1 rounded-l-lg"
        style={{ background: color }}
        aria-hidden
      />
      {/* 缩略图 */}
      <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded bg-clay-50 border border-line/40">
        <SafeImage
          category={item.category}
          src={item.image}
          alt={item.name}
          loading="lazy"
          className="h-full w-full object-cover"
          fallbackClassName="absolute inset-0"
          compact
        />
      </div>
      {/* 信息 */}
      <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 className="truncate font-serif text-sm font-semibold text-ink max-w-[12rem] sm:max-w-xs">
              {item.name}
            </h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-clay-50/80 px-2 py-0.5 text-[9px] text-ink/55 font-medium">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
              {item.category}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-ink/45">
            {item.brand && <span className="truncate text-ink/65">{item.brand}</span>}
            {item.spec && <span className="truncate">{item.spec}</span>}
            {containerName && (
              <span className="inline-flex items-center gap-1 text-ochre truncate">
                <Box size={10} /> 收纳于 {containerName}
                {item.containerSlot ? ` · ${item.containerSlot}` : ""}
              </span>
            )}
          </div>
        </div>
        
        {areaName && (
          <span className="shrink-0 inline-flex items-center gap-0.5 text-2xs text-moss">
            <MapPin size={11} />
            {areaName}
          </span>
        )}
      </div>
      <ChevronRight size={14} className="shrink-0 text-ink/30 mr-1 opacity-0 group-hover:opacity-100 transition-opacity" />
    </article>
  ) : (
    <article
      className={cn(
        "card group relative flex flex-col overflow-hidden hover:-translate-y-0.5 hover:shadow-cardHover transition-all duration-300",
        highlighted && "ring-2 ring-ochre/40"
      )}
    >
      {/* 左侧分类色标 */}
      <span
        className="absolute left-0 top-0 z-10 h-full w-1"
        style={{ background: color }}
        aria-hidden
      />
      {/* 统一 aspect-[4/3] 的图片/占位区 */}
      <div className="relative aspect-[4/3] overflow-hidden bg-clay-50 border-b border-line/40">
        <SafeImage
          category={item.category}
          src={item.image}
          alt={item.name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          fallbackClassName="absolute inset-0"
        />
        {hasImage && (
          <span className="absolute left-2 top-2 chip bg-cream/90 backdrop-blur-sm shadow-2xs">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
            {item.category}
          </span>
        )}
      </div>
      {/* 信息 */}
      <div className="flex flex-1 flex-col gap-1 p-3">
        {!hasImage && (
          <div className="h-[2px]" />
        )}
        <h3 className="line-clamp-1 font-serif text-sm font-semibold text-ink">
          {item.name}
        </h3>
        <div className="flex items-center gap-2 text-2xs text-ink/55">
          {item.brand && <span className="truncate">{item.brand}</span>}
          {areaName && (
            <span className="ml-auto inline-flex items-center gap-0.5 text-moss">
              <MapPin size={11} />
              {areaName}
            </span>
          )}
        </div>
        {item.spec && (
          <p className="line-clamp-1 text-2xs text-ink/40">{item.spec}</p>
        )}
        {containerName && (
          <p className="mt-0.5 inline-flex items-center gap-1 text-2xs text-ochre truncate">
            <Box size={11} /> 收纳于 {containerName}
            {item.containerSlot ? ` · ${item.containerSlot}` : ""}
          </p>
        )}
      </div>
    </article>
  );

  if (onClick) {
    return (
      <button onClick={onClick} className="block w-full text-left">
        {inner}
      </button>
    );
  }
  return <Link to={to} className="block w-full">{inner}</Link>;
}

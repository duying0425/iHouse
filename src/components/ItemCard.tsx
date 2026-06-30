import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";
import type { Item } from "@/types";
import { CATEGORY_COLOR } from "@/types";
import { cn } from "@/lib/utils";

interface ItemCardProps {
  item: Item;
  areaName?: string;
  /** 是否高亮（检索命中态） */
  highlighted?: boolean;
  onClick?: () => void;
}

export default function ItemCard({
  item,
  areaName,
  highlighted,
  onClick,
}: ItemCardProps) {
  const color = CATEGORY_COLOR[item.category];
  const to = `/area/${item.areaId}/item/${item.id}`;

  const inner = (
    <article
      className={cn(
        "card group relative flex flex-col overflow-hidden hover:-translate-y-0.5 hover:shadow-cardHover",
        highlighted && "ring-2 ring-ochre/40"
      )}
    >
      {/* 顶部分类色标 */}
      <span
        className="absolute left-0 top-0 z-10 h-full w-1"
        style={{ background: color }}
        aria-hidden
      />
      {/* 图片 */}
      <div className="relative aspect-[4/3] overflow-hidden bg-clay-50">
        <img
          src={item.image}
          alt={item.name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <span className="absolute left-2 top-2 chip bg-cream/90 backdrop-blur-sm">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: color }}
          />
          {item.category}
        </span>
      </div>
      {/* 信息 */}
      <div className="flex flex-1 flex-col gap-1 p-3">
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
      </div>
    </article>
  );

  if (onClick) {
    return (
      <button onClick={onClick} className="block text-left">
        {inner}
      </button>
    );
  }
  return <Link to={to}>{inner}</Link>;
}

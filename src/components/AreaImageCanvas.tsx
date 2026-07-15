import { useCallback, useEffect, useRef, useState } from "react";
import { ImageOff, Loader2, MapPin } from "lucide-react";
import type { AnchorPosition, AreaImage, Item } from "@/types";
import { cn } from "@/lib/utils";

interface AreaImageCanvasProps {
  /** 区域图片（必填，否则展示空状态） */
  image?: AreaImage | null;
  /** 需要在该图上展示标记的物品列表（应已按 areaImageId 过滤好） */
  items?: Item[];
  /** 当前激活（脉冲强调）的物品 id */
  activeItemId?: string;
  /** 是否可点选位置（录入用） */
  pickable?: boolean;
  /** 已点选位置 */
  pickedPos?: AnchorPosition | null;
  onPick?: (pos: AnchorPosition) => void;
  /** 点击物品标记 */
  onItemClick?: (itemId: string) => void;
  /** 是否显示物品名称标签 */
  showLabels?: boolean;
  /** 紧凑模式（缩略图、不显示标签） */
  compact?: boolean;
  className?: string;
}

/**
 * 区域图片画布：展示一张区域图，并在图上叠加物品位置标记 / 支持点选位置。
 * 与 FloorPlan 不同，这里坐标是相对该图片的百分比（0-100）。
 */
export default function AreaImageCanvas({
  image,
  items = [],
  activeItemId,
  pickable = false,
  pickedPos,
  onPick,
  onItemClick,
  showLabels = true,
  compact = false,
  className,
}: AreaImageCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [hoverId, setHoverId] = useState<string | undefined>();
  const [imageState, setImageState] = useState<"loading" | "loaded" | "error">("loading");

  useEffect(() => {
    setImageState(image?.url ? "loading" : "error");
    if (!image?.url) return;
    // 缓存图片可能在 effect 执行前就已完成载入，避免错过 load 事件后误判超时。
    if (imgRef.current?.complete) {
      setImageState(imgRef.current.naturalWidth > 0 ? "loaded" : "error");
      return;
    }
    const timer = window.setTimeout(() => {
      // 超时前再检查一次：图片可能已加载完成但 onLoad 事件被 StrictMode 双挂载吞掉
      const img = imgRef.current;
      if (img?.complete && img.naturalWidth > 0) {
        setImageState("loaded");
      } else {
        setImageState("error");
      }
    }, 10_000);
    return () => window.clearTimeout(timer);
  }, [image?.url]);

  const toPct = useCallback((clientX: number, clientY: number) => {
    const el = wrapRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    return {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    } as AnchorPosition;
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!pickable || !onPick) return;
      const p = toPct(e.clientX, e.clientY);
      if (p) onPick(p);
    },
    [pickable, onPick, toPct]
  );

  if (!image || !image.url) {
    return (
      <div
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 bg-clay-50 py-16 text-ink/40",
          className
        )}
      >
        <ImageOff size={compact ? 20 : 28} />
        {!compact && <span className="text-2xs">暂无区域图片</span>}
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      onClick={handleClick}
      className={cn(
        "relative w-full overflow-hidden bg-clay-50 select-none",
        imageState !== "loaded" && "aspect-[4/3]",
        pickable && "cursor-crosshair",
        className
      )}
    >
      <img
        ref={imgRef}
        src={image.url}
        alt={image.label || "区域图片"}
        className={cn("block h-auto w-full pointer-events-none", imageState !== "loaded" && "invisible")}
        draggable={false}
        onLoad={() => setImageState("loaded")}
        onError={() => setImageState("error")}
      />

      {imageState === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center text-clay-400" aria-label="区域图片载入中">
          <Loader2 size={compact ? 18 : 24} className="animate-spin" />
        </div>
      )}
      {imageState === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-ink/40">
          <ImageOff size={compact ? 20 : 28} />
          {!compact && <span className="text-2xs">区域图片载入失败</span>}
        </div>
      )}

      {/* 图片标签（左上角） */}
      {imageState === "loaded" && image.label && !compact && (
        <span className="absolute left-2 top-2 chip bg-cream/90 backdrop-blur-sm">
          {image.label}
        </span>
      )}

      {/* 物品标记 */}
      {imageState === "loaded" && items.map((it) => {
        if (!it.areaImagePos) return null;
        const isActive = it.id === activeItemId || it.id === hoverId;
        const MARKER_RED = "#E53935";
        return (
          <div
            key={it.id}
            className="absolute"
            style={{
              left: `${it.areaImagePos.x}%`,
              top: `${it.areaImagePos.y}%`,
              transform: "translate(-50%, -50%)",
            }}
            onMouseEnter={() => setHoverId(it.id)}
            onMouseLeave={() => setHoverId(undefined)}
            onClick={(e) => {
              e.stopPropagation();
              onItemClick?.(it.id);
            }}
          >
            {isActive && (
              <span
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full"
                style={{
                  width: compact ? 32 : 44,
                  height: compact ? 32 : 44,
                  background: MARKER_RED,
                  opacity: 0.35,
                }}
              />
            )}
            <span
              className="relative block rounded-full border-2 border-cream"
              style={{
                width: compact ? 14 : isActive ? 20 : 16,
                height: compact ? 14 : isActive ? 20 : 16,
                background: MARKER_RED,
                boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
              }}
            />
            {showLabels && !compact && (it.name || isActive) && (
              <span
                className="absolute left-6 top-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-cream/90 px-1.5 py-0.5 text-[10px] text-ink backdrop-blur-sm"
                style={{ pointerEvents: "none" }}
              >
                {it.name}
              </span>
            )}
          </div>
        );
      })}

      {/* 已点选位置（录入模式） */}
      {pickable && pickedPos && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: `${pickedPos.x}%`,
            top: `${pickedPos.y}%`,
            transform: "translate(-50%, -50%)",
          }}
        >
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 block rounded-full"
            style={{ width: 44, height: 44, background: "rgba(229,57,53,0.25)" }}
          />
          <span
            className="relative block rounded-full border-2 border-cream"
            style={{
              width: 18,
              height: 18,
              background: "#E53935",
              boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
            }}
          />
        </div>
      )}

      {/* 录入模式提示 */}
      {pickable && !pickedPos && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-ink/35 py-1.5 text-[10px] text-cream">
          <MapPin size={11} /> 点击图片标注物品位置
        </div>
      )}
    </div>
  );
}

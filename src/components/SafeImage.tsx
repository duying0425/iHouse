import { useEffect, useRef, useState } from "react";
import { Tv, Sofa, Box, Palette, Wrench, HelpCircle, Loader2 } from "lucide-react";
import type { Category } from "@/types";
import { CATEGORY_COLOR } from "@/types";
import { cn } from "@/lib/utils";

interface SafeImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  category: Category;
  src?: string;
  fallbackClassName?: string;
}

export default function SafeImage({
  category,
  src,
  className,
  fallbackClassName,
  alt = "image",
  onLoad,
  onError,
  ...props
}: SafeImageProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(src ? "loading" : "error");
  const imageRef = useRef<HTMLImageElement>(null);
  const loadingTimeoutRef = useRef<number | null>(null);

  // 当 src 改变时重置错误状态
  useEffect(() => {
    if (loadingTimeoutRef.current !== null) {
      window.clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
    setStatus(src ? "loading" : "error");
    if (!src) return;
    // 缓存图片可能在 effect 执行前就已完成载入，避免错过 load 事件后误判超时。
    if (imageRef.current?.complete) {
      setStatus(imageRef.current.naturalWidth > 0 ? "loaded" : "error");
      return;
    }
    loadingTimeoutRef.current = window.setTimeout(() => {
      loadingTimeoutRef.current = null;
      setStatus("error");
    }, 10_000);
    return () => {
      if (loadingTimeoutRef.current !== null) {
        window.clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
    };
  }, [src]);

  const color = CATEGORY_COLOR[category] || "#6B6258";

  const renderFallback = () => {
    const iconProps = {
      size: 28,
      className: "text-cream/90 transition-transform group-hover:scale-110 duration-300",
    };

    let Icon = HelpCircle;
    if (category === "家电") Icon = Tv;
    else if (category === "家具") Icon = Sofa;
    else if (category === "储物") Icon = Box;
    else if (category === "装饰") Icon = Palette;
    else if (category === "管线设施") Icon = Wrench;

    return (
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-1.5 transition-all duration-300",
          fallbackClassName
        )}
        style={{
          background: `linear-gradient(135deg, ${color}dd, ${color})`,
        }}
      >
        <Icon {...iconProps} />
        <span className="text-[10px] tracking-wider text-cream/70 select-none">
          {category}
        </span>
      </div>
    );
  };

  if (status === "error" || !src) {
    return renderFallback();
  }

  return (
    <>
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        onLoad={(event) => {
          if (loadingTimeoutRef.current !== null) {
            window.clearTimeout(loadingTimeoutRef.current);
            loadingTimeoutRef.current = null;
          }
          setStatus("loaded");
          onLoad?.(event);
        }}
        onError={(event) => {
          if (loadingTimeoutRef.current !== null) {
            window.clearTimeout(loadingTimeoutRef.current);
            loadingTimeoutRef.current = null;
          }
          setStatus("error");
          onError?.(event);
        }}
        className={cn(className, status === "loading" && "opacity-0")}
        {...props}
      />
      {status === "loading" && (
        <div className={cn("absolute inset-0 flex items-center justify-center bg-clay-50 text-clay-400", fallbackClassName)} aria-label="图片载入中">
          <Loader2 size={22} className="animate-spin" />
        </div>
      )}
    </>
  );
}

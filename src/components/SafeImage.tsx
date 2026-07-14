import { useState, useEffect } from "react";
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

  // 当 src 改变时重置错误状态
  useEffect(() => {
    setStatus(src ? "loading" : "error");
    if (!src) return;
    const timer = window.setTimeout(() => setStatus("error"), 10_000);
    return () => window.clearTimeout(timer);
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
        src={src}
        alt={alt}
        onLoad={(event) => {
          setStatus("loaded");
          onLoad?.(event);
        }}
        onError={(event) => {
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

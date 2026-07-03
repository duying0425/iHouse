import { useState, useEffect } from "react";
import { Tv, Sofa, Box, Palette, Wrench, HelpCircle } from "lucide-react";
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
  ...props
}: SafeImageProps) {
  const [error, setError] = useState(false);

  // 当 src 改变时重置错误状态
  useEffect(() => {
    setError(false);
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

  if (error || !src) {
    return renderFallback();
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setError(true)}
      className={className}
      {...props}
    />
  );
}

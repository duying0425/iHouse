import type { ReactNode } from "react";
import TopBar from "@/components/TopBar";

interface PageLayoutProps {
  title?: string;
  subtitle?: string;
  showActions?: boolean;
  addHref?: string;
  children: ReactNode;
  /** 内容区最大宽度类 */
  wide?: boolean;
}

export default function PageLayout({
  title,
  subtitle,
  showActions,
  addHref,
  children,
  wide = false,
}: PageLayoutProps) {
  return (
    <div className="min-h-screen">
      <TopBar
        title={title}
        subtitle={subtitle}
        showActions={showActions}
        addHref={addHref}
      />
      <main
        className={
          wide
            ? "container max-w-7xl py-5 sm:py-8 animate-fadeIn"
            : "container max-w-6xl py-5 sm:py-8 animate-fadeIn"
        }
      >
        {children}
      </main>
    </div>
  );
}

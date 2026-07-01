import { createPortal } from "react-dom";
import {
  AreaPage,
  CoverPage,
  FloorPlanPage,
  ItemPage,
} from "@/components/export/PdfPages";
import type { Home } from "@/types";
import { useEffect } from "react";

interface PageDesc {
  kind: "cover" | "floorplan" | "area" | "item";
  areaId?: string;
  itemId?: string;
  areaIndex?: number;
  itemIndex?: number;
}

interface Props {
  home: Home;
  pages: PageDesc[];
  onDone: () => void;
}

/**
 * 浏览器原生打印导出：
 * - 在 document.body 末尾挂一个 portal，按 A4 尺寸渲染所有页
 * - 加 print-only CSS：打印时只显示这个容器，每页 page-break-after
 * - 调用 window.print()，浏览器原生渲染分页 → 打印为 PDF
 *
 * 浏览器原生渲染，秒级完成；文字矢量（清晰可复制），图片直接用 <img>
 */
export default function PrintExportRenderer({ home, pages, onDone }: Props) {
  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener("afterprint", finish);
      window.removeEventListener("focus", finish);
      onDone();
    };

    // 渲染完成后等图片加载，再触发打印
    const timer = setTimeout(() => {
      // 打印对话框关闭后的两个信号：afterprint 是标准事件但部分浏览器
      // （Chrome/Edge 关闭预览窗口时）不可靠；focus 在窗口重获焦点时触发，
      // 打印框无论确认还是关闭都会触发，更可靠
      window.addEventListener("afterprint", finish);
      window.addEventListener("focus", finish);
      window.print();
      // 兜底：极端情况下两者都没触发，5s 后强制结束
      setTimeout(finish, 5000);
    }, 500);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("afterprint", finish);
      window.removeEventListener("focus", finish);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderPage = (p: PageDesc, idx: number) => {
    const pageNumber = idx;
    if (p.kind === "cover") {
      return <CoverPage home={home} print />;
    }
    if (p.kind === "floorplan") {
      return <FloorPlanPage home={home} page={pageNumber} print />;
    }
    if (p.kind === "area" && p.areaIndex != null) {
      const area = home.areas[p.areaIndex];
      return (
        <AreaPage
          home={home}
          area={area}
          index={p.areaIndex}
          page={pageNumber}
          print
        />
      );
    }
    if (p.kind === "item" && p.areaId != null && p.itemId != null) {
      const area = home.areas.find((a) => a.id === p.areaId);
      const item = area?.items.find((it) => it.id === p.itemId);
      if (area && item) {
        return (
          <ItemPage
            home={home}
            area={area}
            item={item}
            index={p.itemIndex ?? 0}
            page={pageNumber}
            print
          />
        );
      }
    }
    return null;
  };

  return createPortal(
    <div id="print-export-root" className="print-only">
      {pages.map((p, i) => (
        <div key={i} className="print-page">
          {renderPage(p, i)}
        </div>
      ))}
    </div>,
    document.body
  );
}

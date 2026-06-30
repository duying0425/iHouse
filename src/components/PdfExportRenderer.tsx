import { createPortal } from "react-dom";
import {
  AreaPage,
  CoverPage,
  FloorPlanPage,
  ItemPage,
  PAGE_H,
  PAGE_W,
} from "@/components/export/PdfPages";
import type { Home } from "@/types";
import { useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

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
  autoPrint: boolean;
  fileName: string;
  onProgress: (cur: number, total: number) => void;
  onDone: () => void;
  onError: (e: unknown) => void;
}

/**
 * 逐页离屏渲染导出器：
 * - 用一个脱离文档流的隐藏容器（视口外），逐页渲染 PDF 页面组件
 * - 每时刻 DOM 里只有 1 页：渲染 → 等图片就绪 → html2canvas 截图存 canvas → 卸载 → 下一页
 * - 全部页截完后，把 canvas 逐张写入 jsPDF
 *
 * 相比「30 页同时挂在预览区再逐页截图」，内存占用从 O(N) 降到 O(1)，
 * html2canvas 也只需处理当前页的 DOM 树，导出速度大幅提升。
 */
export default function PdfExportRenderer({
  home,
  pages,
  autoPrint,
  fileName,
  onProgress,
  onDone,
  onError,
}: Props) {
  const pageElRef = useRef<HTMLDivElement | null>(null);
  const [curIdx, setCurIdx] = useState(0);
  const canvasesRef = useRef<HTMLCanvasElement[]>([]);
  const phaseRef = useRef<"render" | "capture">("render");
  const doneRef = useRef(false);

  const renderPage = (p: PageDesc, idx: number) => {
    // 页码：封面不计页脚页码，从第 2 页起算
    const pageNumber = idx;
    if (p.kind === "cover") {
      return <CoverPage ref={(el) => (pageElRef.current = el)} home={home} />;
    }
    if (p.kind === "floorplan") {
      return (
        <FloorPlanPage
          ref={(el) => (pageElRef.current = el)}
          home={home}
          page={pageNumber}
        />
      );
    }
    if (p.kind === "area" && p.areaIndex != null) {
      const area = home.areas[p.areaIndex];
      return (
        <AreaPage
          ref={(el) => (pageElRef.current = el)}
          home={home}
          area={area}
          index={p.areaIndex}
          page={pageNumber}
        />
      );
    }
    if (p.kind === "item" && p.areaId != null && p.itemId != null) {
      const area = home.areas.find((a) => a.id === p.areaId);
      const item = area?.items.find((it) => it.id === p.itemId);
      if (area && item) {
        return (
          <ItemPage
            ref={(el) => (pageElRef.current = el)}
            home={home}
            area={area}
            item={item}
            index={p.itemIndex ?? 0}
            page={pageNumber}
          />
        );
      }
    }
    return null;
  };

  useEffect(() => {
    if (doneRef.current) return;

    // 全部页截图完成，写入 PDF
    if (curIdx >= pages.length) {
      (async () => {
        try {
          const canvases = canvasesRef.current;
          if (canvases.length === 0) {
            onDone();
            return;
          }
          const pdf = new jsPDF({
            orientation: "p",
            unit: "mm",
            format: "a4",
            compress: true,
          });
          const pageW = pdf.internal.pageSize.getWidth();
          const pageH = pdf.internal.pageSize.getHeight();
          canvases.forEach((canvas, i) => {
            const imgData = canvas.toDataURL("image/jpeg", 0.8);
            const imgRatio = canvas.width / canvas.height;
            const pageRatio = pageW / pageH;
            let w = pageW;
            let h = pageH;
            if (imgRatio > pageRatio) {
              h = pageW / imgRatio;
            } else {
              w = pageH * imgRatio;
            }
            const x = (pageW - w) / 2;
            const y = (pageH - h) / 2;
            if (i > 0) pdf.addPage();
            pdf.addImage(imgData, "JPEG", x, y, w, h);
          });
          onProgress(pages.length, pages.length);
          if (autoPrint) {
            pdf.autoPrint();
            const blobUrl = pdf.output("bloburl");
            window.open(blobUrl, "_blank");
          } else {
            pdf.save(fileName);
          }
          doneRef.current = true;
          onDone();
        } catch (e) {
          doneRef.current = true;
          onError(e);
        }
      })();
      return;
    }

    let cancelled = false;
    (async () => {
      // 阶段1：等待 React 渲染当前页到 DOM
      if (phaseRef.current === "render") {
        onProgress(curIdx + 1, pages.length);
        await new Promise((r) => setTimeout(r, 60));
        const el = pageElRef.current;
        if (!el || cancelled) return;
        phaseRef.current = "capture";
        // 阶段2：等图片就绪后截图
        await waitForImages(el);
        if (cancelled) return;
        try {
          const canvas = await html2canvas(el, {
            scale: 1,
            useCORS: true,
            backgroundColor: "#FBF8F2",
            logging: false,
            imageTimeout: 10000,
            removeContainer: true,
          });
          if (cancelled) return;
          canvasesRef.current.push(canvas);
        } catch {
          // 该页截图失败，跳过
        }
        // 清空 ref，渲染下一页
        pageElRef.current = null;
        phaseRef.current = "render";
        setCurIdx((i) => i + 1);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curIdx]);

  if (pages.length === 0) return null;

  return createPortal(
    // 隐藏容器：视口外，opacity:0 但不 display:none（否则图片不加载）
    <div
      style={{
        position: "fixed",
        left: "-99999px",
        top: 0,
        width: PAGE_W,
        height: PAGE_H,
        zIndex: -1,
        pointerEvents: "none",
        opacity: 0,
      }}
      aria-hidden
    >
      {renderPage(pages[curIdx], curIdx)}
    </div>,
    document.body
  );
}

function waitForImages(container: HTMLElement): Promise<void> {
  const imgs = Array.from(container.querySelectorAll("img"));
  return Promise.all(
    imgs.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
        setTimeout(resolve, 8000); // 超时兜底
      });
    })
  ).then(() => undefined);
}

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
 * 实现要点：
 * - 用一个「页就绪」回调 ref（setPageEl）让外层知道当前页 DOM 已挂载
 * - 用 startedRef 保证异步导出流程只启动一次（避免 StrictMode 双触发）
 * - 用 cancelledRef 在卸载时中止流程
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
  const [curIdx, setCurIdx] = useState(0);
  // 当前页 DOM 就绪后的 resolve 回调
  const pageReadyRef = useRef<((el: HTMLDivElement) => void) | null>(null);
  const startedRef = useRef(false);
  const cancelledRef = useRef(false);

  // 把当前页的 ref 通过回调暴露给异步流程
  const setPageEl = (el: HTMLDivElement | null) => {
    if (el && pageReadyRef.current) {
      pageReadyRef.current(el);
    }
  };

  const renderPage = (p: PageDesc, idx: number) => {
    const pageNumber = idx;
    if (p.kind === "cover") {
      return <CoverPage ref={setPageEl} home={home} />;
    }
    if (p.kind === "floorplan") {
      return <FloorPlanPage ref={setPageEl} home={home} page={pageNumber} />;
    }
    if (p.kind === "area" && p.areaIndex != null) {
      const area = home.areas[p.areaIndex];
      return (
        <AreaPage
          ref={setPageEl}
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
            ref={setPageEl}
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

  // 启动一次性的异步导出流程（startedRef 保证只跑一次）
  useEffect(() => {
    // StrictMode 开发模式下会挂载→卸载→再挂载：第一次设了 cancelled，
    // 第二次需要重置才能继续。生产构建无此问题。
    cancelledRef.current = false;
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      const canvases: HTMLCanvasElement[] = [];
      for (let i = 0; i < pages.length; i++) {
        if (cancelledRef.current) return;
        onProgress(i + 1, pages.length);

        // 切换到第 i 页，等待其 DOM 挂载
        const el = await new Promise<HTMLDivElement | null>((resolve) => {
          pageReadyRef.current = resolve;
          setCurIdx(i);
        });
        pageReadyRef.current = null;
        if (cancelledRef.current || !el) continue;

        // 让浏览器完成布局 + 等图片就绪
        await new Promise((r) => setTimeout(r, 50));
        if (cancelledRef.current) return;
        await waitForImages(el);
        if (cancelledRef.current) return;

        try {
          const canvas = await html2canvas(el, {
            scale: 1,
            useCORS: true,
            backgroundColor: "#FBF8F2",
            logging: false,
            imageTimeout: 10000,
            removeContainer: true,
          });
          if (cancelledRef.current) return;
          canvases.push(canvas);
        } catch {
          // 该页截图失败，跳过
        }
      }

      if (cancelledRef.current) return;
      if (canvases.length === 0) {
        onDone();
        return;
      }

      // 全部截图完成，写入 PDF
      try {
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
        onDone();
      } catch (e) {
        onError(e);
      }
    })();

    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (pages.length === 0) return null;

  return createPortal(
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

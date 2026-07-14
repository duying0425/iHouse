import { createPortal } from "react-dom";
import { useEffect, useRef } from "react";
import { ExportPageView } from "@/components/export/PdfPages";
import {
  imposeBooklet,
  type CompactPageDesc,
  type ExportLayout,
  type ExportPageDesc,
} from "@/components/export/exportModel";
import type { Home } from "@/types";
import { settleLayout, waitForPrintableAssets } from "@/components/export/printAssets";

interface Props {
  home: Home;
  layout: ExportLayout;
  pages: ExportPageDesc[];
  onStatus: (message: string) => void;
  onDone: () => void;
}

export default function PrintExportRenderer({ home, layout, pages, onStatus, onDone }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onStatusRef = useRef(onStatus);
  const onDoneRef = useRef(onDone);
  onStatusRef.current = onStatus;
  onDoneRef.current = onDone;

  useEffect(() => {
    let disposed = false;
    let finished = false;
    let cleanupTimer: number | undefined;
    let printStartedAt = 0;

    const finish = () => {
      if (finished || disposed) return;
      finished = true;
      window.removeEventListener("afterprint", finish);
      window.removeEventListener("focus", onFocus);
      if (cleanupTimer) window.clearTimeout(cleanupTimer);
      onDoneRef.current();
    };
    const onFocus = () => {
      if (Date.now() - printStartedAt > 700) finish();
    };

    const prepare = async () => {
      await settleLayout();
      if (disposed || !rootRef.current) return;
      const assets = await waitForPrintableAssets(
        rootRef.current,
        (ready, total) => onStatusRef.current(total > 0 ? `正在载入图片 ${ready}/${total}…` : "正在载入字体…")
      );
      if (disposed) return;
      await settleLayout();
      onStatusRef.current(assets.failed > 0 ? `${assets.failed} 张图片载入失败，将以空白位置继续打印` : "版面就绪，正在打开打印对话框…");
      window.addEventListener("afterprint", finish);
      window.addEventListener("focus", onFocus);
      printStartedAt = Date.now();
      window.print();
      cleanupTimer = window.setTimeout(finish, 120_000);
    };

    void prepare();
    return () => {
      disposed = true;
      window.removeEventListener("afterprint", finish);
      window.removeEventListener("focus", onFocus);
      if (cleanupTimer) window.clearTimeout(cleanupTimer);
    };
  }, []);

  const content = layout === "booklet"
    ? imposeBooklet(pages as CompactPageDesc[]).map((side) => (
        <section key={`${side.sheet}-${side.side}`} className="print-sheet-booklet">
          <div className="booklet-panel booklet-panel-left">
            <ExportPageView home={home} descriptor={side.left} page={side.leftPageNumber ?? 0} print />
          </div>
          <div className="booklet-panel booklet-panel-right">
            <ExportPageView home={home} descriptor={side.right} page={side.rightPageNumber ?? 0} print />
          </div>
        </section>
      ))
    : pages.map((descriptor, index) => (
        <section key={`${descriptor.kind}-${index}`} className="print-page-archive">
          <ExportPageView home={home} descriptor={descriptor} page={index + 1} print />
        </section>
      ));

  return createPortal(
    <div id="print-export-root" ref={rootRef} className={`print-only print-layout-${layout}`}>
      <style>{`@page { size: A4 ${layout === "booklet" ? "landscape" : "portrait"}; margin: 0; }`}</style>
      {content}
    </div>,
    document.body
  );
}

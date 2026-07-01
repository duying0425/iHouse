import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  FileText,
  Layers,
  Loader2,
  Printer,
  Search as SearchIcon,
} from "lucide-react";
import PageLayout from "@/components/PageLayout";
import EmptyState from "@/components/Empty";
import PrintExportRenderer from "@/components/PrintExportRenderer";
import {
  AreaPage,
  CoverPage,
  FloorPlanPage,
  ItemPage,
} from "@/components/export/PdfPages";
import { useHomeStore } from "@/store";
import { useUiStore } from "@/uiStore";
import type { Home } from "@/types";
import { cn } from "@/lib/utils";

type Range = "all" | "area" | "search";

interface PageDesc {
  kind: "cover" | "floorplan" | "area" | "item";
  areaId?: string;
  itemId?: string;
  areaIndex?: number;
  itemIndex?: number;
}

export default function ExportPage() {
  const home = useHomeStore();
  const lastSearch = useUiStore((s) => s.lastSearch);

  const [range, setRange] = useState<Range>("all");
  const [selectedAreas, setSelectedAreas] = useState<string[]>(
    home.areas.map((a) => a.id)
  );
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  // 原生打印导出（更快）
  const [printPayload, setPrintPayload] = useState<{
    pages: PageDesc[];
  } | null>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  // 计算页面清单
  const pages = useMemo<PageDesc[]>(() => {
    const list: PageDesc[] = [{ kind: "cover" }];
    if (range === "search") {
      if (!lastSearch) return list;
      lastSearch.results.forEach((r, i) =>
        list.push({
          kind: "item",
          areaId: r.area.id,
          itemId: r.item.id,
          itemIndex: i,
        })
      );
      return list;
    }

    list.push({ kind: "floorplan" });
    const areas =
      range === "all" ? home.areas : home.areas.filter((a) => selectedAreas.includes(a.id));
    areas.forEach((a, ai) => {
      list.push({ kind: "area", areaId: a.id, areaIndex: ai });
      a.items.forEach((it, ii) =>
        list.push({
          kind: "item",
          areaId: a.id,
          itemId: it.id,
          areaIndex: ai,
          itemIndex: ii,
        })
      );
    });
    return list;
  }, [range, selectedAreas, home.areas, lastSearch]);

  const totalPages = pages.length;

  const toggleArea = (id: string) =>
    setSelectedAreas((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  // 原生打印导出：用 window.print()，浏览器原生渲染，秒级完成
  const handlePrintExport = () => {
    if (exporting) return;
    setExporting(true);
    setProgress("正在准备打印…");
    setPrintPayload({ pages });
  };

  return (
    <PageLayout title="导出图鉴" subtitle="预览版式并导出 PDF 或直接打印">
      <nav className="mb-5 flex items-center gap-1 text-2xs text-ink/45">
        <Link to="/" className="hover:text-clay-500">
          居所图鉴
        </Link>
        <ChevronRight size={12} />
        <span className="text-ink/70">导出</span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* 左：控制面板 */}
        <aside className="lg:sticky lg:top-24 lg:self-start space-y-4">
          {/* 范围选择 */}
          <div className="card p-4">
            <h3 className="mb-3 flex items-center gap-1.5 font-serif text-sm font-semibold text-ink">
              <Layers size={15} className="text-clay-500" /> 导出范围
            </h3>
            <div className="space-y-1.5">
              <RangeOption
                active={range === "all"}
                onClick={() => setRange("all")}
                icon={<FileText size={15} />}
                title="全部图鉴"
                desc={`封面 + 户型图 + ${home.areas.length} 区域 + 全部物品`}
              />
              <RangeOption
                active={range === "area"}
                onClick={() => setRange("area")}
                icon={<Layers size={15} />}
                title="按区域选择"
                desc="仅导出选定区域及其物品"
              />
              <RangeOption
                active={range === "search"}
                onClick={() => setRange("search")}
                icon={<SearchIcon size={15} />}
                title="仅检索结果"
                disabled={!lastSearch}
                desc={
                  lastSearch
                    ? `最近检索命中 ${lastSearch.results.length} 件`
                    : "请先在检索页执行检索"
                }
              />
            </div>

            {range === "area" && (
              <div className="mt-3 space-y-1 border-t border-line pt-3">
                {home.areas.map((a) => (
                  <label
                    key={a.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-ink/75 hover:bg-clay-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedAreas.includes(a.id)}
                      onChange={() => toggleArea(a.id)}
                      className="accent-clay-500"
                    />
                    <span className="font-serif">{a.name}</span>
                    <span className="ml-auto text-2xs text-ink/40">
                      {a.items.length} 件
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* 概览 */}
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <span className="text-2xs uppercase tracking-wider text-ink/45">
                页数
              </span>
              <span className="font-display text-2xl font-semibold text-clay-500">
                {totalPages}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-2xs text-ink/45">
              <span>纸张</span>
              <span>A4 纵向</span>
            </div>
          </div>

          {/* 操作 */}
          <div className="space-y-2">
            <button
              onClick={handlePrintExport}
              disabled={exporting || totalPages === 0}
              className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-40"
            >
              {exporting ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Printer size={15} />
              )}
              打印 / 导出 PDF
            </button>
            {progress && (
              <p className="px-1 text-2xs text-clay-500">{progress}</p>
            )}
            <p className="px-1 text-2xs leading-relaxed text-ink/40">
              点击后唤起浏览器打印对话框，在「目标」选「另存为 PDF」即可保存。浏览器原生渲染，秒级完成，文字矢量清晰。
            </p>
          </div>
        </aside>

        {/* 右：预览 */}
        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-serif text-lg font-semibold text-ink">
              版式预览
            </h2>
            <span className="text-2xs text-ink/45">
              共 {totalPages} 页 · A4
            </span>
          </div>

          {totalPages === 0 ? (
            <EmptyState
              title="暂无可导出内容"
              description="该范围下没有页面，请调整导出范围。"
            />
          ) : (
            <div className="flex flex-wrap gap-5">
              {pages.map((p, i) => (
                <figure
                  key={i}
                  className="group"
                >
                  {renderPage(p, i, home, pageRefs)}
                  <figcaption className="mt-1.5 text-center text-2xs text-ink/45">
                    第 {i + 1} 页 · {labelOf(p)}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 原生打印导出器：window.print()，秒级完成 */}
      {printPayload && (
        <PrintExportRenderer
          home={home}
          pages={printPayload.pages}
          onDone={() => {
            setExporting(false);
            setProgress(null);
            setPrintPayload(null);
          }}
        />
      )}
    </PageLayout>
  );
}

function renderPage(
  p: PageDesc,
  index: number,
  home: Home,
  pageRefs: React.MutableRefObject<(HTMLDivElement | null)[]>
) {
  const setRef = (el: HTMLDivElement | null) => {
    pageRefs.current[index] = el;
  };

  // 页码：封面不计页脚页码，从 floorplan 起算
  const pageNumber = index; // 封面 index 0 不显示页脚

  if (p.kind === "cover") {
    return <CoverPage ref={setRef} home={home} />;
  }
  if (p.kind === "floorplan") {
    return <FloorPlanPage ref={setRef} home={home} page={pageNumber} />;
  }
  if (p.kind === "area" && p.areaId != null && p.areaIndex != null) {
    const area = home.areas[p.areaIndex];
    return <AreaPage ref={setRef} home={home} area={area} index={p.areaIndex} page={pageNumber} />;
  }
  if (p.kind === "item" && p.areaId != null && p.itemId != null) {
    const area = home.areas.find((a) => a.id === p.areaId);
    const item = area?.items.find((it) => it.id === p.itemId);
    if (area && item) {
      return (
        <ItemPage
          ref={setRef}
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
}

function labelOf(p: PageDesc): string {
  switch (p.kind) {
    case "cover":
      return "封面";
    case "floorplan":
      return "户型图";
    case "area":
      return "区域";
    case "item":
      return "物品";
  }
}

function RangeOption({
  active,
  onClick,
  icon,
  title,
  desc,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-start gap-2.5 rounded border p-2.5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "border-clay-400 bg-clay-50"
          : "border-line bg-cream hover:border-clay-200"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded",
          active ? "bg-clay-500 text-cream" : "bg-clay-50 text-clay-500"
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-ink">{title}</span>
        <span className="block text-2xs text-ink/50">{desc}</span>
      </span>
    </button>
  );
}

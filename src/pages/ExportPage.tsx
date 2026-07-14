import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
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
import { ExportPageView } from "@/components/export/PdfPages";
import {
  buildArchivePages,
  buildCompactPages,
  labelOf,
  type ExportLayout,
  type ExportPageDesc,
  type ExportRange,
} from "@/components/export/exportModel";
import { useHomeStore } from "@/store";
import { useUiStore } from "@/uiStore";
import { cn } from "@/lib/utils";

export default function ExportPage() {
  const home = useHomeStore();
  const lastSearch = useUiStore((state) => state.lastSearch);
  const [layout, setLayout] = useState<ExportLayout>("booklet");
  const [range, setRange] = useState<ExportRange>("all");
  const [selectedAreas, setSelectedAreas] = useState<string[]>(home.areas.map((area) => area.id));
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [printPayload, setPrintPayload] = useState<{ layout: ExportLayout; pages: ExportPageDesc[] } | null>(null);

  const pages = useMemo(() => {
    const selection = {
      range,
      selectedAreaIds: selectedAreas,
      searchResults: lastSearch?.results,
    };
    return layout === "booklet"
      ? buildCompactPages(home, selection)
      : buildArchivePages(home, selection);
  }, [home, lastSearch?.results, layout, range, selectedAreas]);

  const logicalPages = pages.length;
  const paddedPages = layout === "booklet" ? Math.ceil(logicalPages / 4) * 4 : logicalPages;
  const sheets = layout === "booklet" ? paddedPages / 4 : logicalPages;
  const printedSides = layout === "booklet" ? sheets * 2 : logicalPages;

  const toggleArea = (id: string) => {
    setSelectedAreas((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  };

  const handlePrintExport = () => {
    if (exporting || pages.length === 0) return;
    setExporting(true);
    setProgress("正在生成版面…");
    setPrintPayload({ layout, pages });
  };

  return (
    <PageLayout title="导出图鉴" subtitle="紧凑小册子或完整档案，两种版式按需输出">
      <nav className="mb-5 flex items-center gap-1 text-2xs text-ink/45">
        <Link to="/" className="hover:text-clay-500">居所图鉴</Link>
        <ChevronRight size={12} />
        <span className="text-ink/70">导出</span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <section className="card p-4">
            <h3 className="mb-3 flex items-center gap-1.5 font-serif text-sm font-semibold text-ink">
              <BookOpen size={15} className="text-clay-500" /> 版式
            </h3>
            <div className="space-y-1.5">
              <RangeOption
                active={layout === "booklet"}
                onClick={() => setLayout("booklet")}
                icon={<BookOpen size={15} />}
                title="紧凑小册子"
                desc="A5 阅读页，自动拼成 A4 横向双面折页"
              />
              <RangeOption
                active={layout === "archive"}
                onClick={() => setLayout("archive")}
                icon={<FileText size={15} />}
                title="详细档案"
                desc="A4 纵向逐页输出，保留全部详情"
              />
            </div>
          </section>

          <section className="card p-4">
            <h3 className="mb-3 flex items-center gap-1.5 font-serif text-sm font-semibold text-ink">
              <Layers size={15} className="text-clay-500" /> 导出范围
            </h3>
            <div className="space-y-1.5">
              <RangeOption
                active={range === "all"}
                onClick={() => setRange("all")}
                icon={<FileText size={15} />}
                title="全部图鉴"
                desc={`户型图、${home.areas.length} 个区域及全部物品`}
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
                desc={lastSearch ? `最近检索命中 ${lastSearch.results.length} 件` : "请先在检索页执行检索"}
              />
            </div>

            {range === "area" && (
              <div className="mt-3 space-y-1 border-t border-line pt-3">
                {home.areas.map((area) => (
                  <label key={area.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-ink/75 hover:bg-clay-50">
                    <input
                      type="checkbox"
                      checked={selectedAreas.includes(area.id)}
                      onChange={() => toggleArea(area.id)}
                      className="accent-clay-500"
                    />
                    <span className="font-serif">{area.name}</span>
                    <span className="ml-auto text-2xs text-ink/40">{area.items.length} 件</span>
                  </label>
                ))}
              </div>
            )}
          </section>

          <section className="card p-4 text-2xs">
            <div className="flex items-end justify-between">
              <span className="uppercase tracking-wider text-ink/45">逻辑页</span>
              <span className="font-display text-2xl font-semibold text-clay-500">{logicalPages}</span>
            </div>
            {layout === "booklet" ? (
              <div className="mt-2 space-y-1 border-t border-line pt-2 text-ink/55">
                <div className="flex justify-between"><span>打印纸张</span><span>A4 横向 · {sheets} 张</span></div>
                <div className="flex justify-between"><span>打印面数</span><span>{printedSides} 面</span></div>
                {paddedPages > logicalPages && <div className="flex justify-between"><span>自动补空白页</span><span>{paddedPages - logicalPages} 页</span></div>}
              </div>
            ) : (
              <div className="mt-2 flex justify-between border-t border-line pt-2 text-ink/55"><span>打印纸张</span><span>A4 纵向 · {logicalPages} 张</span></div>
            )}
          </section>

          <div className="space-y-2">
            <button onClick={handlePrintExport} disabled={exporting || logicalPages === 0} className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-40">
              {exporting ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
              打印 / 导出 PDF
            </button>
            {progress && <p className="px-1 text-2xs text-clay-500">{progress}</p>}
            <p className="px-1 text-2xs leading-relaxed text-ink/45">
              {layout === "booklet"
                ? "打印时选择双面打印并沿短边翻转；对折后即为按页序阅读的 A5 小册子。保存 PDF 时会得到已经拼版的 A4 横向页面。"
                : "打印或另存为 PDF 均使用 A4 纵向；长说明、清单和所有图片会自动续页，不再静默截断。"}
            </p>
          </div>
        </aside>

        <main>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-serif text-lg font-semibold text-ink">版式预览</h2>
            <span className="text-right text-2xs text-ink/45">
              {logicalPages > 0 ? `共 ${logicalPages} 个 ${layout === "booklet" ? "A5 阅读页" : "A4 页面"}` : "无可导出页面"}
            </span>
          </div>

          {logicalPages === 0 ? (
            <EmptyState title="暂无可导出内容" description="该范围下没有页面，请调整导出范围。" />
          ) : (
            <div className="flex flex-wrap gap-5">
              {pages.map((descriptor, index) => (
                <figure key={`${descriptor.kind}-${index}`} className="group">
                  <ExportPageView home={home} descriptor={descriptor} page={index + 1} />
                  <figcaption className="mt-1.5 text-center text-2xs text-ink/45">
                    第 {index + 1} 页 · {labelOf(descriptor)}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </main>
      </div>

      {printPayload && (
        <PrintExportRenderer
          home={home}
          layout={printPayload.layout}
          pages={printPayload.pages}
          onStatus={setProgress}
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

function RangeOption({ active, onClick, icon, title, desc, disabled }: {
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
        active ? "border-clay-400 bg-clay-50" : "border-line bg-cream hover:border-clay-200"
      )}
    >
      <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded", active ? "bg-clay-500 text-cream" : "bg-clay-50 text-clay-500")}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-ink">{title}</span>
        <span className="block text-2xs text-ink/50">{desc}</span>
      </span>
    </button>
  );
}

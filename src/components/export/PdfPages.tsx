import { forwardRef, type ReactNode } from "react";
import FloorPlan from "@/components/FloorPlan";
import AreaImageCanvas from "@/components/AreaImageCanvas";
import type { Area, AreaImage, Home, Item } from "@/types";
import { CATEGORY_COLOR } from "@/types";
import { countItems } from "@/data/seed";

// A4 @96dpi
export const PAGE_W = 794;
export const PAGE_H = 1123;

interface PageFrameProps {
  children: ReactNode;
  /** 缩放比例（仅用于预览展示，不影响捕获） */
  scale?: number;
  /** 打印模式：不缩放，直接 A4 原尺寸（配合 window.print 原生打印） */
  print?: boolean;
}

/** 页面外框：外层定尺寸占位，中间层缩放，内层固定 A4 尺寸供捕获（无 transform） */
export const PageFrame = forwardRef<HTMLDivElement, PageFrameProps>(
  ({ children, scale = 0.5, print = false }, ref) => {
    // 打印模式：撑满 .print-page 容器（已由 CSS 定为 210mm×297mm）
    // 不能用固定像素 PAGE_W/PAGE_H，浏览器打印 DPI 与 96 不一致，
    // 会导致内容缩在角落、整页填不满
    if (print) {
      return (
        <div
          style={{ width: "100%", height: "100%" }}
          className="bg-cream text-ink"
        >
          <div ref={ref} style={{ width: "100%", height: "100%" }}>
            {children}
          </div>
        </div>
      );
    }
    return (
      <div
        style={{
          width: PAGE_W * scale,
          height: PAGE_H * scale,
        }}
        className="relative shrink-0 overflow-hidden rounded shadow-card"
      >
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
          className="absolute left-0 top-0"
        >
          <div
            ref={ref}
            style={{ width: PAGE_W, height: PAGE_H }}
            className="bg-cream text-ink"
          >
            {children}
          </div>
        </div>
      </div>
    );
  }
);
PageFrame.displayName = "PageFrame";

/** 页面内边距包装 */
function PageBody({ children }: { children: ReactNode }) {
  return <div className="flex h-full flex-col px-12 py-12">{children}</div>;
}

/** 页眉 */
function PageHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className="mb-6 border-b border-line pb-3">
      <p className="font-display text-[10px] uppercase tracking-[0.25em] text-clay-500">
        {eyebrow}
      </p>
      <h2 className="font-serif text-2xl font-semibold text-ink">{title}</h2>
    </header>
  );
}

/** 页脚 */
function PageFooter({ home, page }: { home: Home; page: number }) {
  return (
    <footer className="mt-auto flex items-center justify-between border-t border-line pt-3 text-[9px] text-ink/40">
      <span>{home.title}</span>
      <span className="font-display">— {page} —</span>
    </footer>
  );
}

/* ============ 封面页 ============ */
export const CoverPage = forwardRef<HTMLDivElement, { home: Home; print?: boolean }>(
  ({ home, print }, ref) => {
  const date = new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return (
    <PageFrame ref={ref} print={print}>
      <div className="flex h-full flex-col items-center justify-between border-[6px] border-clay-500 p-10">
        <div className="flex w-full items-center justify-between text-[10px] uppercase tracking-[0.25em] text-clay-500">
          <span>Home Atlas</span>
          <span>居所图鉴</span>
        </div>

        <div className="flex flex-col items-center text-center">
          <p className="font-display text-xs uppercase tracking-[0.3em] text-moss">
            A Visual Inventory of Home
          </p>
          <h1 className="mt-4 font-serif text-4xl font-semibold leading-tight text-ink">
            {home.title}
          </h1>
          <div className="my-6 h-px w-32 bg-clay-400" />
          <p className="max-w-md text-sm text-ink/55">{home.subtitle}</p>
        </div>

        <div className="w-full">
          <div className="mx-auto max-w-md rounded border border-line bg-paper p-3">
            <FloorPlan
              areas={home.areas}
              floorPlanImage={home.floorPlanImage}
              showAreaAnchors
              compact
            />
          </div>
          <div className="mt-4 flex items-center justify-between text-[10px] text-ink/45">
            <span>
              {home.areas.length} 个区域 · {countItems(home.areas)} 件物品
            </span>
            <span>生成于 {date}</span>
          </div>
        </div>
      </div>
    </PageFrame>
  );
  }
);
CoverPage.displayName = "CoverPage";

/* ============ 户型图页 ============ */
export const FloorPlanPage = forwardRef<HTMLDivElement, { home: Home; page: number; print?: boolean }>(
  ({ home, page, print }, ref) => {
  return (
    <PageFrame ref={ref} print={print}>
      <PageBody>
        <PageHeader eyebrow="01 · Floor Plan" title="户型平面总览" />
        <div className="flex-1 rounded border border-line bg-paper p-4">
          <FloorPlan
            areas={home.areas}
            floorPlanImage={home.floorPlanImage}
            showAreaAnchors
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-[10px] text-ink/55">
          {home.areas.map((a, i) => (
            <div key={a.id} className="flex items-center gap-2">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-moss text-[8px] text-cream">
                {i + 1}
              </span>
              <span className="font-serif text-ink">{a.name}</span>
              <span className="ml-auto text-ink/45">{a.items.length} 件</span>
            </div>
          ))}
        </div>
        <PageFooter home={home} page={page} />
      </PageBody>
    </PageFrame>
  );
  }
);
FloorPlanPage.displayName = "FloorPlanPage";

/** 区域图（打印用）：静态展示图片并叠加序号化的物品位置标记，序号与物品清单表对应 */
function AreaImageMarked({
  image,
  items,
  full,
}: {
  image: AreaImage;
  items: { it: Item; num: number }[];
  full?: boolean;
}) {
  const MARKER_RED = "#E53935";
  return (
    <figure className={`flex flex-col ${full ? "col-span-2" : ""}`}>
      <div className="relative w-full overflow-hidden rounded border border-line bg-clay-50">
        <img
          src={image.url}
          alt={image.label || "区域图"}
          crossOrigin="anonymous"
          className="block h-auto w-full"
        />
        {items.map(
          ({ it, num }) =>
            it.areaImagePos && (
              <div
                key={it.id}
                className="absolute"
                style={{
                  left: `${it.areaImagePos.x}%`,
                  top: `${it.areaImagePos.y}%`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <span
                  className="flex items-center justify-center rounded-full border-2 border-cream font-semibold text-cream"
                  style={{
                    width: 20,
                    height: 20,
                    fontSize: 10,
                    background: MARKER_RED,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
                  }}
                >
                  {num}
                </span>
              </div>
            )
        )}
      </div>
      <figcaption className="mt-1 text-[9px] uppercase tracking-wider text-ink/45">
        {image.label || "区域图"}
      </figcaption>
    </figure>
  );
}

/* ============ 区域页 ============ */
export const AreaPage = forwardRef<
  HTMLDivElement,
  { home: Home; area: Area; index: number; page: number; print?: boolean }
>(
  ({ home, area, index, page, print }, ref) => {
  return (
    <PageFrame ref={ref} print={print}>
      <PageBody>
        <PageHeader
          eyebrow={`0${index + 2} · Area`}
          title={area.name}
        />
        <div className="grid grid-cols-2 gap-4">
          {area.images.slice(0, 2).map((img) => {
            const firstImgId = area.images[0]?.id;
            const marked = area.items
              .map((it, idx) => ({ it, num: idx + 1 }))
              .filter(
                ({ it }) =>
                  !!it.areaImagePos &&
                  (it.areaImageId ?? firstImgId) === img.id
              );
            return (
              <AreaImageMarked
                key={img.id}
                image={img}
                items={marked}
                full={area.images.length === 1}
              />
            );
          })}
          {area.images.length === 0 && (
            <p className="col-span-2 py-6 text-center text-[10px] text-ink/40">
              该区域暂无图片
            </p>
          )}
        </div>

        <p className="mt-4 text-sm leading-relaxed text-ink/70">
          {area.description}
        </p>

        {/* 物品清单表 */}
        <div className="mt-5">
          <h3 className="mb-2 font-serif text-sm font-semibold text-ink">
            物品清单（{area.items.length}）
          </h3>
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="border-b border-line text-left text-ink/45">
                <th className="py-1.5 pr-2 font-normal">#</th>
                <th className="py-1.5 pr-2 font-normal">名称</th>
                <th className="py-1.5 pr-2 font-normal">分类</th>
                <th className="py-1.5 pr-2 font-normal">品牌</th>
                <th className="py-1.5 pr-2 font-normal">规格</th>
                <th className="py-1.5 text-right font-normal">价格</th>
              </tr>
            </thead>
            <tbody>
              {area.items.map((it, idx) => (
                <tr key={it.id} className="border-b border-line/60">
                  <td className="py-1.5 pr-2 text-ink/55">{idx + 1}</td>
                  <td className="py-1.5 pr-2 font-medium text-ink">{it.name}</td>
                  <td className="py-1.5 pr-2">
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full align-middle"
                      style={{ background: CATEGORY_COLOR[it.category] }}
                    />{" "}
                    {it.category}
                  </td>
                  <td className="py-1.5 pr-2 text-ink/65">{it.brand || "—"}</td>
                  <td className="py-1.5 pr-2 text-ink/65">{it.spec || "—"}</td>
                  <td className="py-1.5 text-right text-ink/65">
                    {it.price != null ? `¥${it.price.toLocaleString()}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <PageFooter home={home} page={page} />
      </PageBody>
    </PageFrame>
  );
  }
);
AreaPage.displayName = "AreaPage";

/* ============ 物品页 ============ */
export const ItemPage = forwardRef<
  HTMLDivElement,
  { home: Home; area: Area; item: Item; index: number; page: number; print?: boolean }
>(
  ({ home, area, item, index, page, print }, ref) => {
  const color = CATEGORY_COLOR[item.category];
  return (
    <PageFrame ref={ref} print={print}>
      <PageBody>
        <PageHeader
          eyebrow={`Item · ${area.name}`}
          title={item.name}
        />
        <div className="grid flex-1 grid-cols-[1.1fr_1fr] gap-5">
          {/* 左：大图 */}
          <div>
            <div className="aspect-[4/3] overflow-hidden rounded border border-line bg-clay-50">
              <img
                src={item.image}
                alt={item.name}
                crossOrigin="anonymous"
                className="h-full w-full object-contain"
              />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: color }}
              />
              <span className="text-[10px] uppercase tracking-wider text-ink/55">
                {item.category} · No.{String(index + 1).padStart(2, "0")}
              </span>
            </div>
          </div>

          {/* 右：信息 + 位置 */}
          <div className="flex flex-col">
            <dl className="space-y-1.5 text-[11px]">
              <Row label="品牌" value={item.brand} />
              <Row label="规格" value={item.spec} />
              <Row label="购入日期" value={item.purchaseDate} />
              <Row
                label="价格"
                value={item.price != null ? `¥ ${item.price.toLocaleString()}` : undefined}
              />
              <Row label="备注" value={item.remark} />
            </dl>

            {/* 区域图定位 */}
            <div className="mt-4 rounded border border-line bg-paper p-2.5">
              <p className="mb-1.5 text-[9px] uppercase tracking-wider text-ink/45">
                在区域图中的位置
              </p>
              {(() => {
                const img =
                  area.images.find((i) => i.id === item.areaImageId) ??
                  area.images[0];
                if (item.areaImagePos && img) {
                  return (
                    <>
                      <AreaImageCanvas
                        image={img}
                        items={[
                          { ...item, areaImagePos: item.areaImagePos! },
                        ]}
                        compact
                      />
                      {img.label && (
                        <p className="mt-1.5 text-[9px] text-ink/45">
                          标注于：{img.label}
                        </p>
                      )}
                    </>
                  );
                }
                return (
                  <div className="py-6 text-center text-[10px] text-ink/40">
                    未标注位置
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
        <PageFooter home={home} page={page} />
      </PageBody>
    </PageFrame>
  );
  }
);
ItemPage.displayName = "ItemPage";

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-line/60 pb-1">
      <dt className="w-16 shrink-0 text-[9px] uppercase tracking-wider text-ink/40">
        {label}
      </dt>
      <dd className="flex-1 text-ink/80">
        {value || <span className="text-ink/30">—</span>}
      </dd>
    </div>
  );
}

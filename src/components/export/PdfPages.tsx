import { forwardRef, type ReactNode } from "react";
import FloorPlan from "@/components/FloorPlan";
import type { Area, AreaImage, Home, Item } from "@/types";
import { CATEGORY_COLOR } from "@/types";
import { countItems } from "@/data/seed";
import SafeImage from "@/components/SafeImage";
import { cycleLabel, getMaintenanceStatus } from "@/utils/maintenance";
import { getItemLocationPath } from "@/utils/itemLocation";
import type { ExportPageDesc, ItemRef } from "@/components/export/exportModel";

export const A4_PAGE_W = 794;
export const A4_PAGE_H = 1123;
export const A5_PAGE_W = 559;
export const A5_PAGE_H = 794;

type PageFormat = "a4" | "a5";

interface PageFrameProps {
  children: ReactNode;
  format?: PageFormat;
  scale?: number;
  print?: boolean;
}

export const PageFrame = forwardRef<HTMLDivElement, PageFrameProps>(
  ({ children, format = "a4", scale, print = false }, ref) => {
    const width = format === "a4" ? A4_PAGE_W : A5_PAGE_W;
    const height = format === "a4" ? A4_PAGE_H : A5_PAGE_H;
    const resolvedScale = scale ?? (format === "a4" ? 0.5 : 0.64);
    if (print) {
      return (
        <div ref={ref} className="h-full w-full overflow-hidden bg-cream text-ink">
          {children}
        </div>
      );
    }
    return (
      <div
        style={{ width: width * resolvedScale, height: height * resolvedScale }}
        className="relative shrink-0 overflow-hidden rounded shadow-card"
      >
        <div
          style={{
            width,
            height,
            transform: `scale(${resolvedScale})`,
            transformOrigin: "top left",
          }}
          className="absolute left-0 top-0 bg-cream text-ink"
        >
          <div ref={ref} className="h-full w-full">
            {children}
          </div>
        </div>
      </div>
    );
  }
);
PageFrame.displayName = "PageFrame";

function ArchiveBody({ children }: { children: ReactNode }) {
  return <div className="flex h-full flex-col px-12 py-10">{children}</div>;
}

function CompactBody({ children }: { children: ReactNode }) {
  return <div className="flex h-full flex-col px-7 py-7">{children}</div>;
}

function PageHeader({ eyebrow, title, compact = false }: { eyebrow: string; title: string; compact?: boolean }) {
  return (
    <header className={compact ? "mb-3 border-b border-line pb-2" : "mb-5 border-b border-line pb-3"}>
      <p className={compact ? "font-display text-[8px] uppercase tracking-[0.22em] text-clay-500" : "font-display text-[10px] uppercase tracking-[0.25em] text-clay-500"}>
        {eyebrow}
      </p>
      <h2 className={compact ? "font-serif text-xl font-semibold leading-tight text-ink" : "font-serif text-2xl font-semibold text-ink"}>
        {title}
      </h2>
    </header>
  );
}

function PageFooter({ home, page, compact = false }: { home: Home; page: number; compact?: boolean }) {
  return (
    <footer className={compact ? "mt-auto flex items-center justify-between border-t border-line pt-2 text-[8px] text-ink/40" : "mt-auto flex items-center justify-between border-t border-line pt-3 text-[9px] text-ink/40"}>
      <span>{home.title}</span>
      <span className="font-display">{page}</span>
    </footer>
  );
}

function itemForRef(home: Home, ref: ItemRef) {
  const area = home.areas.find((candidate) => candidate.id === ref.areaId);
  const item = area?.items.find((candidate) => candidate.id === ref.itemId);
  return area && item ? { area, item } : null;
}

function AreaImageMarked({ image, items, className = "h-52", full = false }: {
  image: AreaImage;
  items: { it: Item; num: number }[];
  className?: string;
  full?: boolean;
}) {
  return (
    <figure className={full ? "col-span-2 min-w-0" : "min-w-0"}>
      <div className={`relative w-full overflow-hidden rounded border border-line bg-clay-50 ${className}`}>
        <img
          src={image.url}
          alt={image.label || "区域图"}
          crossOrigin="anonymous"
          className="h-full w-full object-fill"
        />
        {items.map(({ it, num }) => it.areaImagePos && (
          <div
            key={it.id}
            className="absolute"
            style={{
              left: `${it.areaImagePos.x}%`,
              top: `${it.areaImagePos.y}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-cream bg-[#E53935] text-[10px] font-semibold text-cream shadow">
              {num}
            </span>
          </div>
        ))}
      </div>
      <figcaption className="mt-1 text-[9px] uppercase tracking-wider text-ink/45">
        {image.label || "区域图"}
      </figcaption>
    </figure>
  );
}

function markersFor(area: Area, image: AreaImage) {
  const firstImageId = area.images[0]?.id;
  return area.items
    .map((it, index) => ({ it, num: index + 1 }))
    .filter(({ it }) => !!it.areaImagePos && (it.areaImageId ?? firstImageId) === image.id);
}

function ItemTable({ area, start, end }: { area: Area; start: number; end: number }) {
  const items = area.items.slice(start, end);
  return (
    <div>
      <h3 className="mb-2 font-serif text-sm font-semibold text-ink">
        {area.items.length === 0
          ? "物品清单（暂无物品）"
          : `物品清单（${start + 1} - ${Math.min(end, area.items.length)} / ${area.items.length}）`}
      </h3>
      <table className="w-full table-fixed border-collapse text-[10px]">
        <thead>
          <tr className="border-b border-line text-left text-ink/45">
            <th className="w-8 py-1.5 font-normal">#</th>
            <th className="w-[23%] py-1.5 pr-2 font-normal">名称</th>
            <th className="w-[14%] py-1.5 pr-2 font-normal">分类</th>
            <th className="w-[18%] py-1.5 pr-2 font-normal">品牌</th>
            <th className="py-1.5 pr-2 font-normal">规格</th>
            <th className="w-20 py-1.5 text-right font-normal">价格</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.id} className="border-b border-line/60 align-top">
              <td className="py-1.5 text-ink/55">{start + index + 1}</td>
              <td className="break-words py-1.5 pr-2 font-medium text-ink">{item.name}</td>
              <td className="py-1.5 pr-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: CATEGORY_COLOR[item.category] }} />{" "}
                {item.category}
              </td>
              <td className="break-words py-1.5 pr-2 text-ink/65">{item.brand || "-"}</td>
              <td className="break-words py-1.5 pr-2 text-ink/65">{item.spec || "-"}</td>
              <td className="py-1.5 text-right text-ink/65">{item.price != null ? `¥${item.price.toLocaleString()}` : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const CoverPage = forwardRef<HTMLDivElement, { home: Home; print?: boolean }>(
  ({ home, print }, ref) => {
    const date = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
    return (
      <PageFrame ref={ref} print={print}>
        <div className="flex h-full flex-col items-center justify-between border-[6px] border-clay-500 p-10">
          <div className="flex w-full items-center justify-between text-[10px] uppercase tracking-[0.25em] text-clay-500">
            <span>Home Atlas</span><span>居所图鉴</span>
          </div>
          <div className="flex flex-col items-center text-center">
            <p className="font-display text-xs uppercase tracking-[0.3em] text-moss">A Visual Inventory of Home</p>
            <h1 className="mt-4 font-serif text-4xl font-semibold leading-tight text-ink">{home.title}</h1>
            <div className="my-6 h-px w-32 bg-clay-400" />
            <p className="max-w-md text-sm text-ink/55">{home.subtitle}</p>
          </div>
          <div className="w-full">
            <div className="mx-auto max-w-md rounded border border-line bg-paper p-3">
              <FloorPlan areas={home.areas} floorPlanImage={home.floorPlanImage} showAreaAnchors compact />
            </div>
            <div className="mt-4 flex items-center justify-between text-[10px] text-ink/45">
              <span>{home.areas.length} 个区域 · {countItems(home.areas)} 件物品</span>
              <span>生成于 {date}</span>
            </div>
          </div>
        </div>
      </PageFrame>
    );
  }
);
CoverPage.displayName = "CoverPage";

export const FloorPlanPage = forwardRef<HTMLDivElement, { home: Home; page: number; print?: boolean }>(
  ({ home, page, print }, ref) => (
    <PageFrame ref={ref} print={print}>
      <ArchiveBody>
        <PageHeader eyebrow="01 · Floor Plan" title="户型平面总览" />
        <div className="min-h-0 flex-1 rounded border border-line bg-paper p-4">
          <FloorPlan areas={home.areas} floorPlanImage={home.floorPlanImage} showAreaAnchors />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[10px] text-ink/55">
          {home.areas.map((area, index) => (
            <div key={area.id} className="flex items-center gap-2">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-moss text-[8px] text-cream">{index + 1}</span>
              <span className="font-serif text-ink">{area.name}</span>
              <span className="ml-auto text-ink/45">{area.items.length} 件</span>
            </div>
          ))}
        </div>
        <PageFooter home={home} page={page} />
      </ArchiveBody>
    </PageFrame>
  )
);
FloorPlanPage.displayName = "FloorPlanPage";

export const AreaPage = forwardRef<HTMLDivElement, {
  home: Home; area: Area; areaNumber: number; page: number; itemStart: number; itemEnd: number; print?: boolean;
}>(({ home, area, areaNumber, page, itemStart, itemEnd, print }, ref) => (
  <PageFrame ref={ref} print={print}>
    <ArchiveBody>
      <PageHeader eyebrow={`${String(areaNumber + 1).padStart(2, "0")} · Area`} title={area.name} />
      {area.images.length > 0 ? (
        <div className="grid grid-cols-2 gap-4">
          {area.images.slice(0, 2).map((image) => (
            <AreaImageMarked
              key={image.id}
              image={image}
              items={markersFor(area, image)}
              className={area.images.length === 1 ? "h-64" : "h-52"}
              full={area.images.length === 1}
            />
          ))}
        </div>
      ) : (
        <div className="rounded border border-dashed border-line bg-paper px-4 py-3 text-[10px] text-ink/45">
          本区域未上传图片，清单已自动扩展以利用页面空间。
        </div>
      )}
      {area.description && <p className="mt-3 text-sm leading-relaxed text-ink/70">{area.description}</p>}
      <div className="mt-4"><ItemTable area={area} start={itemStart} end={itemEnd} /></div>
      <PageFooter home={home} page={page} />
    </ArchiveBody>
  </PageFrame>
));
AreaPage.displayName = "AreaPage";

export const AreaGalleryPage = forwardRef<HTMLDivElement, {
  home: Home; area: Area; areaNumber: number; page: number; imageStart: number; imageEnd: number; print?: boolean;
}>(({ home, area, areaNumber, page, imageStart, imageEnd, print }, ref) => (
  <PageFrame ref={ref} print={print}>
    <ArchiveBody>
      <PageHeader eyebrow={`${String(areaNumber + 1).padStart(2, "0")} · Area Gallery`} title={`${area.name} · 区域图续页`} />
      <div className="grid grid-cols-2 gap-4">
        {area.images.slice(imageStart, imageEnd).map((image) => (
          <AreaImageMarked key={image.id} image={image} items={markersFor(area, image)} className="h-[340px]" />
        ))}
      </div>
      <PageFooter home={home} page={page} />
    </ArchiveBody>
  </PageFrame>
));
AreaGalleryPage.displayName = "AreaGalleryPage";

export const AreaContinuationPage = forwardRef<HTMLDivElement, {
  home: Home; area: Area; areaNumber: number; page: number; itemStart: number; itemEnd: number; print?: boolean;
}>(({ home, area, areaNumber, page, itemStart, itemEnd, print }, ref) => (
  <PageFrame ref={ref} print={print}>
    <ArchiveBody>
      <PageHeader eyebrow={`${String(areaNumber + 1).padStart(2, "0")} · Area (Cont.)`} title={`${area.name} · 清单续页`} />
      <div className="flex-1"><ItemTable area={area} start={itemStart} end={itemEnd} /></div>
      <PageFooter home={home} page={page} />
    </ArchiveBody>
  </PageFrame>
));
AreaContinuationPage.displayName = "AreaContinuationPage";

function MetaRows({ home, item }: { home: Home; item: Item }) {
  const maintenance = item.maintenanceCycle ? getMaintenanceStatus(item) : null;
  const locationPath = getItemLocationPath(home.areas, item.id);
  const containerLocation = item.containerItemId
    ? [...locationPath.slice(1), item.containerSlot].filter(Boolean).join(" → ")
    : undefined;
  const rows = [
    ["品牌", item.brand],
    ["别名 / 标签", item.tags && item.tags.length > 0 ? item.tags.join("、") : undefined],
    ["规格", item.spec],
    ["购入日期", item.purchaseDate],
    ["价格", item.price != null ? `¥ ${item.price.toLocaleString()}` : undefined],
    ["维护周期", item.maintenanceCycle ? cycleLabel(item.maintenanceCycle) : undefined],
    ["维护状态", maintenance?.label],
    ["收纳于", containerLocation],
    ["备注", item.remark],
  ];
  return (
    <dl className="space-y-1.5 text-[11px]">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline gap-3 border-b border-line/60 pb-1">
          <dt className="w-16 shrink-0 text-[9px] uppercase tracking-wider text-ink/40">{label}</dt>
          <dd className="min-w-0 flex-1 break-words text-ink/80">{value || <span className="text-ink/30">-</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export const ItemPage = forwardRef<HTMLDivElement, {
  home: Home; area: Area; item: Item; itemNumber: number; page: number; print?: boolean;
}>(({ home, area, item, itemNumber, page, print }, ref) => {
  const color = CATEGORY_COLOR[item.category];
  const locationImage = area.images.find((image) => image.id === item.areaImageId) ?? area.images[0];
  const hasPrimary = Boolean(item.image);
  const hasLocation = Boolean(item.areaImagePos && locationImage);
  const hasVisual = hasPrimary || hasLocation;
  return (
    <PageFrame ref={ref} print={print}>
      <ArchiveBody>
        <PageHeader eyebrow={`Item · ${area.name}`} title={item.name} />
        <div className={hasVisual ? "grid grid-cols-[1.05fr_1fr] gap-5" : "max-w-2xl"}>
          {hasVisual && (
            <div>
              {hasPrimary ? (
                <div className="relative aspect-[4/3] overflow-hidden rounded border border-line bg-clay-50">
                  <SafeImage category={item.category} src={item.image} alt={item.name} crossOrigin="anonymous" className="h-full w-full object-contain" fallbackClassName="absolute inset-0" />
                </div>
              ) : locationImage ? (
                <AreaImageMarked image={locationImage} items={[{ it: item, num: itemNumber }]} className="h-72" />
              ) : null}
              <div className="mt-3 flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
                <span className="text-[10px] uppercase tracking-wider text-ink/55">{item.category} · No.{String(itemNumber).padStart(2, "0")}</span>
              </div>
            </div>
          )}
          <div>
            <MetaRows home={home} item={item} />
            {hasPrimary && hasLocation && locationImage && (
              <div className="mt-4 rounded border border-line bg-paper p-2.5">
                <p className="mb-1.5 text-[9px] uppercase tracking-wider text-ink/45">在区域图中的位置</p>
                <AreaImageMarked image={locationImage} items={[{ it: item, num: itemNumber }]} className="h-52" />
              </div>
            )}
            {!hasLocation && (
              <div className="mt-4 rounded border border-line bg-paper px-3 py-5 text-center text-[10px] text-ink/40">未标注区域位置</div>
            )}
          </div>
        </div>
        {(item.usage || item.contents?.length || item.gallery?.length) && (
          <p className="mt-5 rounded border border-clay-200 bg-clay-50 px-3 py-2 text-[10px] text-clay-700">
            使用说明、内部清单和附属相册见后续详情页。
          </p>
        )}
        <PageFooter home={home} page={page} />
      </ArchiveBody>
    </PageFrame>
  );
});
ItemPage.displayName = "ItemPage";

export const ItemNotesPage = forwardRef<HTMLDivElement, {
  home: Home; area: Area; item: Item; usageChunk?: string; contentStart: number; contentEnd: number; continuation: number; page: number; print?: boolean;
}>(({ home, area, item, usageChunk, contentStart, contentEnd, continuation, page, print }, ref) => (
  <PageFrame ref={ref} print={print}>
    <ArchiveBody>
      <PageHeader eyebrow={`Item Notes · ${area.name}`} title={`${item.name} · 详情 ${continuation}`} />
      {usageChunk && (
        <section className="rounded border border-line bg-paper p-4">
          <h3 className="mb-2 font-serif text-sm font-semibold text-ink">使用说明</h3>
          <p className="whitespace-pre-wrap text-[12px] leading-6 text-ink/75">{usageChunk}</p>
        </section>
      )}
      {contentEnd > contentStart && (
        <section className={usageChunk ? "mt-5" : ""}>
          <h3 className="mb-2 font-serif text-sm font-semibold text-ink">内部物品清单</h3>
          <div className="grid grid-cols-2 gap-x-5">
            {(item.contents ?? []).slice(contentStart, contentEnd).map((entry) => (
              <div key={entry.id} className="flex items-baseline gap-2 border-b border-line py-2 text-[11px]">
                <span className="flex-1 text-ink/80">{entry.name}</span>
                {entry.quantity && <span className="text-ink/55">{entry.quantity}</span>}
                {entry.remark && <span className="max-w-[45%] text-right text-ink/45">{entry.remark}</span>}
              </div>
            ))}
          </div>
        </section>
      )}
      <PageFooter home={home} page={page} />
    </ArchiveBody>
  </PageFrame>
));
ItemNotesPage.displayName = "ItemNotesPage";

export const ItemGalleryPage = forwardRef<HTMLDivElement, {
  home: Home; area: Area; item: Item; galleryStart: number; galleryEnd: number; continuation: number; page: number; print?: boolean;
}>(({ home, area, item, galleryStart, galleryEnd, continuation, page, print }, ref) => (
  <PageFrame ref={ref} print={print}>
    <ArchiveBody>
      <PageHeader eyebrow={`Item Gallery · ${area.name}`} title={`${item.name} · 附属相册 ${continuation}`} />
      <div className="grid grid-cols-2 gap-4">
        {(item.gallery ?? []).slice(galleryStart, galleryEnd).map((image, index) => (
          <figure key={`${image}-${index}`}>
            <div className="h-[330px] overflow-hidden rounded border border-line bg-clay-50">
              <img src={image} alt={`附图 ${galleryStart + index + 1}`} crossOrigin="anonymous" className="h-full w-full object-contain" />
            </div>
            <figcaption className="mt-1 text-[9px] text-ink/45">附图 {galleryStart + index + 1}</figcaption>
          </figure>
        ))}
      </div>
      <PageFooter home={home} page={page} />
    </ArchiveBody>
  </PageFrame>
));
ItemGalleryPage.displayName = "ItemGalleryPage";

export const CompactCoverPage = forwardRef<HTMLDivElement, { home: Home; print?: boolean }>(
  ({ home, print }, ref) => (
    <PageFrame ref={ref} format="a5" print={print}>
      <div className="flex h-full flex-col border-4 border-clay-500 p-7">
        <div className="flex items-center justify-between text-[8px] uppercase tracking-[0.24em] text-clay-500"><span>Home Atlas</span><span>小册子</span></div>
        <div className="mt-20">
          <p className="font-display text-[9px] uppercase tracking-[0.28em] text-moss">A compact inventory of home</p>
          <h1 className="mt-3 max-w-md font-serif text-3xl font-semibold leading-tight text-ink">{home.title}</h1>
          <p className="mt-3 text-xs text-ink/55">{home.subtitle}</p>
        </div>
        <div className="mt-auto rounded border border-line bg-paper p-3">
          <FloorPlan areas={home.areas} floorPlanImage={home.floorPlanImage} showAreaAnchors compact />
        </div>
        <div className="mt-3 flex justify-between text-[8px] text-ink/45"><span>{home.areas.length} 个区域</span><span>{countItems(home.areas)} 件物品</span></div>
      </div>
    </PageFrame>
  )
);
CompactCoverPage.displayName = "CompactCoverPage";

export const CompactFloorPlanPage = forwardRef<HTMLDivElement, { home: Home; page: number; print?: boolean }>(
  ({ home, page, print }, ref) => (
    <PageFrame ref={ref} format="a5" print={print}>
      <CompactBody>
        <PageHeader compact eyebrow="01 · Floor Plan" title="户型总览" />
        <div className="h-[465px] rounded border border-line bg-paper p-3">
          <FloorPlan areas={home.areas} floorPlanImage={home.floorPlanImage} showAreaAnchors compact />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[9px]">
          {home.areas.map((area, index) => (
            <div key={area.id} className="flex gap-1.5"><span className="text-moss">{index + 1}.</span><span className="font-serif">{area.name}</span><span className="ml-auto text-ink/40">{area.items.length}</span></div>
          ))}
        </div>
        <PageFooter compact home={home} page={page} />
      </CompactBody>
    </PageFrame>
  )
);
CompactFloorPlanPage.displayName = "CompactFloorPlanPage";

export const CompactAreaPage = forwardRef<HTMLDivElement, { home: Home; area: Area; areaNumber: number; page: number; print?: boolean }>(
  ({ home, area, areaNumber, page, print }, ref) => (
    <PageFrame ref={ref} format="a5" print={print}>
      <CompactBody>
        <PageHeader compact eyebrow={`Area ${String(areaNumber).padStart(2, "0")}`} title={area.name} />
        {area.images.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {area.images.slice(0, 2).map((image) => (
              <AreaImageMarked
                key={image.id}
                image={image}
                items={markersFor(area, image)}
                className={area.images.length === 1 ? "h-64" : "h-48"}
                full={area.images.length === 1}
              />
            ))}
          </div>
        )}
        {area.description && <p className={area.images.length > 0 ? "mt-3 text-[11px] leading-5 text-ink/70" : "text-sm leading-6 text-ink/70"}>{area.description}</p>}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded border border-line bg-paper p-3"><p className="text-[8px] uppercase tracking-wider text-ink/40">物品</p><p className="mt-1 font-display text-xl text-clay-600">{area.items.length}</p></div>
          <div className="rounded border border-line bg-paper p-3"><p className="text-[8px] uppercase tracking-wider text-ink/40">图片</p><p className="mt-1 font-display text-xl text-moss">{area.images.length}</p></div>
          <div className="rounded border border-line bg-paper p-3"><p className="text-[8px] uppercase tracking-wider text-ink/40">已定位</p><p className="mt-1 font-display text-xl text-ochre">{area.items.filter((item) => item.areaImagePos).length}</p></div>
        </div>
        {area.images.length === 0 && <div className="mt-5 rounded border border-dashed border-line bg-paper p-5 text-center text-[10px] text-ink/45">本区域暂无图片，小册子已省略图片占位。</div>}
        <PageFooter compact home={home} page={page} />
      </CompactBody>
    </PageFrame>
  )
);
CompactAreaPage.displayName = "CompactAreaPage";

export const CompactAreaGalleryPage = forwardRef<HTMLDivElement, {
  home: Home; area: Area; areaNumber: number; imageStart: number; imageEnd: number; page: number; print?: boolean;
}>(({ home, area, areaNumber, imageStart, imageEnd, page, print }, ref) => (
  <PageFrame ref={ref} format="a5" print={print}>
    <CompactBody>
      <PageHeader compact eyebrow={`Area ${String(areaNumber).padStart(2, "0")} · Gallery`} title={`${area.name}区域图`} />
      <div className="grid grid-cols-2 gap-3">
        {area.images.slice(imageStart, imageEnd).map((image) => (
          <AreaImageMarked key={image.id} image={image} items={markersFor(area, image)} className="h-52" />
        ))}
      </div>
      <PageFooter compact home={home} page={page} />
    </CompactBody>
  </PageFrame>
));
CompactAreaGalleryPage.displayName = "CompactAreaGalleryPage";

function CompactItemCard({ home, itemRef }: { home: Home; itemRef: ItemRef }) {
  const found = itemForRef(home, itemRef);
  if (!found) return null;
  const { area, item } = found;
  const locationPath = getItemLocationPath(home.areas, item.id);
  const hasImage = Boolean(item.image);
  return (
    <article className={`overflow-hidden rounded border border-line bg-paper ${hasImage ? "col-span-2 flex min-h-[126px]" : "min-h-[126px] p-3"}`}>
      {hasImage && (
        <div className="relative w-40 shrink-0 bg-clay-50">
          <SafeImage category={item.category} src={item.image} alt={item.name} crossOrigin="anonymous" className="h-full w-full object-cover" fallbackClassName="absolute inset-0" />
        </div>
      )}
      <div className={hasImage ? "min-w-0 flex-1 p-3" : ""}>
        <div className="flex items-center gap-1.5 text-[8px] uppercase tracking-wider text-ink/45">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: CATEGORY_COLOR[item.category] }} />
          <span>{item.category}</span><span>·</span><span>{locationPath.join(" → ") || area.name}</span>
          <span className="ml-auto">#{itemRef.itemNumber}</span>
        </div>
        <h3 className="mt-1 font-serif text-sm font-semibold leading-tight text-ink">{item.name}</h3>
        <p className="mt-1 text-[9px] text-ink/60">{[item.brand, item.spec].filter(Boolean).join(" · ") || "基础信息未填写"}</p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[8px] text-ink/45">
          {item.purchaseDate && <span>购入 {item.purchaseDate}</span>}
          {item.price != null && <span>¥{item.price.toLocaleString()}</span>}
          {item.areaImagePos && <span className="text-moss">已定位</span>}
        </div>
        {item.remark && <p className="mt-1 line-clamp-2 text-[9px] leading-4 text-ink/55">{item.remark}</p>}
      </div>
    </article>
  );
}

export const CompactItemsPage = forwardRef<HTMLDivElement, {
  home: Home; eyebrow: string; title: string; items: ItemRef[]; page: number; print?: boolean;
}>(({ home, eyebrow, title, items, page, print }, ref) => (
  <PageFrame ref={ref} format="a5" print={print}>
    <CompactBody>
      <PageHeader compact eyebrow={eyebrow} title={title} />
      <div className="grid grid-cols-2 gap-3">
        {items.map((itemRef) => <CompactItemCard key={`${itemRef.areaId}-${itemRef.itemId}`} home={home} itemRef={itemRef} />)}
      </div>
      <PageFooter compact home={home} page={page} />
    </CompactBody>
  </PageFrame>
));
CompactItemsPage.displayName = "CompactItemsPage";

export const CompactItemNotesPage = forwardRef<HTMLDivElement, {
  home: Home; area: Area; item: Item; usageChunk?: string; contentStart: number; contentEnd: number; continuation: number; page: number; print?: boolean;
}>(({ home, area, item, usageChunk, contentStart, contentEnd, continuation, page, print }, ref) => (
  <PageFrame ref={ref} format="a5" print={print}>
    <CompactBody>
      <PageHeader compact eyebrow={`Item Notes · ${area.name}`} title={`${item.name} · 详情 ${continuation}`} />
      {usageChunk && (
        <section className="rounded border border-line bg-paper p-3">
          <h3 className="mb-1.5 font-serif text-xs font-semibold">使用说明</h3>
          <p className="whitespace-pre-wrap text-[10px] leading-5 text-ink/75">{usageChunk}</p>
        </section>
      )}
      {contentEnd > contentStart && (
        <section className={usageChunk ? "mt-4" : ""}>
          <h3 className="mb-1.5 font-serif text-xs font-semibold">内部物品清单</h3>
          <ul className="divide-y divide-line rounded border border-line bg-paper px-3">
            {(item.contents ?? []).slice(contentStart, contentEnd).map((entry) => (
              <li key={entry.id} className="flex items-baseline gap-2 py-2 text-[10px]">
                <span className="flex-1 text-ink/80">{entry.name}</span>
                {entry.quantity && <span className="text-ink/55">{entry.quantity}</span>}
                {entry.remark && <span className="max-w-[42%] text-right text-ink/45">{entry.remark}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <PageFooter compact home={home} page={page} />
    </CompactBody>
  </PageFrame>
));
CompactItemNotesPage.displayName = "CompactItemNotesPage";

export const CompactItemGalleryPage = forwardRef<HTMLDivElement, {
  home: Home; area: Area; item: Item; galleryStart: number; galleryEnd: number; continuation: number; page: number; print?: boolean;
}>(({ home, area, item, galleryStart, galleryEnd, continuation, page, print }, ref) => (
  <PageFrame ref={ref} format="a5" print={print}>
    <CompactBody>
      <PageHeader compact eyebrow={`Item Gallery · ${area.name}`} title={`${item.name} · 相册 ${continuation}`} />
      <div className="grid grid-cols-2 gap-3">
        {(item.gallery ?? []).slice(galleryStart, galleryEnd).map((image, index) => (
          <figure key={`${image}-${index}`}>
            <div className="h-56 overflow-hidden rounded border border-line bg-clay-50">
              <img src={image} alt={`附图 ${galleryStart + index + 1}`} crossOrigin="anonymous" className="h-full w-full object-contain" />
            </div>
            <figcaption className="mt-1 text-[8px] text-ink/45">附图 {galleryStart + index + 1}</figcaption>
          </figure>
        ))}
      </div>
      <PageFooter compact home={home} page={page} />
    </CompactBody>
  </PageFrame>
));
CompactItemGalleryPage.displayName = "CompactItemGalleryPage";

export const CompactBlankPage = forwardRef<HTMLDivElement, { print?: boolean }>(
  ({ print }, ref) => <PageFrame ref={ref} format="a5" print={print}><div className="h-full w-full bg-cream" /></PageFrame>
);
CompactBlankPage.displayName = "CompactBlankPage";

export const ExportPageView = forwardRef<HTMLDivElement, {
  home: Home;
  descriptor: ExportPageDesc;
  page: number;
  print?: boolean;
}>(({ home, descriptor, page, print }, ref) => {
  if (descriptor.kind === "cover") return <CoverPage ref={ref} home={home} print={print} />;
  if (descriptor.kind === "floorplan") return <FloorPlanPage ref={ref} home={home} page={page} print={print} />;
  if (descriptor.kind === "compact-cover") return <CompactCoverPage ref={ref} home={home} print={print} />;
  if (descriptor.kind === "compact-floorplan") return <CompactFloorPlanPage ref={ref} home={home} page={page} print={print} />;
  if (descriptor.kind === "compact-blank") return <CompactBlankPage ref={ref} print={print} />;

  if ("areaId" in descriptor) {
    const area = home.areas.find((candidate) => candidate.id === descriptor.areaId);
    if (!area) return null;
    if (descriptor.kind === "area") return <AreaPage ref={ref} home={home} area={area} areaNumber={descriptor.areaNumber} page={page} itemStart={descriptor.itemStart} itemEnd={descriptor.itemEnd} print={print} />;
    if (descriptor.kind === "area-gallery") return <AreaGalleryPage ref={ref} home={home} area={area} areaNumber={descriptor.areaNumber} page={page} imageStart={descriptor.imageStart} imageEnd={descriptor.imageEnd} print={print} />;
    if (descriptor.kind === "area-cont") return <AreaContinuationPage ref={ref} home={home} area={area} areaNumber={descriptor.areaNumber} page={page} itemStart={descriptor.itemStart} itemEnd={descriptor.itemEnd} print={print} />;
    if (descriptor.kind === "compact-area") return <CompactAreaPage ref={ref} home={home} area={area} areaNumber={descriptor.areaNumber} page={page} print={print} />;
    if (descriptor.kind === "compact-area-gallery") return <CompactAreaGalleryPage ref={ref} home={home} area={area} areaNumber={descriptor.areaNumber} imageStart={descriptor.imageStart} imageEnd={descriptor.imageEnd} page={page} print={print} />;

    if ("itemId" in descriptor) {
      const item = area.items.find((candidate) => candidate.id === descriptor.itemId);
      if (!item) return null;
      if (descriptor.kind === "item") return <ItemPage ref={ref} home={home} area={area} item={item} itemNumber={descriptor.itemNumber} page={page} print={print} />;
      if (descriptor.kind === "item-notes") return <ItemNotesPage ref={ref} home={home} area={area} item={item} usageChunk={descriptor.usageChunk} contentStart={descriptor.contentStart} contentEnd={descriptor.contentEnd} continuation={descriptor.continuation} page={page} print={print} />;
      if (descriptor.kind === "item-gallery") return <ItemGalleryPage ref={ref} home={home} area={area} item={item} galleryStart={descriptor.galleryStart} galleryEnd={descriptor.galleryEnd} continuation={descriptor.continuation} page={page} print={print} />;
      if (descriptor.kind === "compact-item-notes") return <CompactItemNotesPage ref={ref} home={home} area={area} item={item} usageChunk={descriptor.usageChunk} contentStart={descriptor.contentStart} contentEnd={descriptor.contentEnd} continuation={descriptor.continuation} page={page} print={print} />;
      if (descriptor.kind === "compact-item-gallery") return <CompactItemGalleryPage ref={ref} home={home} area={area} item={item} galleryStart={descriptor.galleryStart} galleryEnd={descriptor.galleryEnd} continuation={descriptor.continuation} page={page} print={print} />;
    }
  }

  if (descriptor.kind === "compact-items") return <CompactItemsPage ref={ref} home={home} eyebrow={descriptor.eyebrow} title={descriptor.title} items={descriptor.items} page={page} print={print} />;
  return null;
});
ExportPageView.displayName = "ExportPageView";

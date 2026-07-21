import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Boxes, Download, Search, Settings, Sparkles, AlertTriangle, CalendarClock } from "lucide-react";
import TopBar from "@/components/TopBar";
import FloorPlan from "@/components/FloorPlan";
import { useHomeStore } from "@/store";
import { useAuthStore } from "@/authStore";
import VoiceAssistant from "@/components/VoiceAssistant";
import { countItems } from "@/data/seed";
import { CATEGORIES, CATEGORY_COLOR, type Area, type Item } from "@/types";
import { cn } from "@/lib/utils";
import {
  getMaintenanceStatus,
  isMaintenanceAlert,
  MAINTENANCE_STATUS_COLOR,
  type MaintenanceStatus,
} from "@/utils/maintenance";

interface AlertEntry {
  item: Item;
  area: Area;
  status: MaintenanceStatus;
  label: string;
  nextDate: string | null;
}

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { title, subtitle, areas, floorPlanImage } = useHomeStore();
  const [hoverArea, setHoverArea] = useState<string | undefined>();
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);

  const totalItems = useMemo(() => countItems(areas), [areas]);
  const totalAreas = areas.length;

  const { totalValue, categoryCounts } = useMemo(() => {
    let value = 0;
    const counts: Record<string, number> = {};
    CATEGORIES.forEach((c) => {
      counts[c] = 0;
    });

    areas.forEach((area) => {
      area.items.forEach((item) => {
        if (item.price != null) {
          value += item.price;
        }
        if (counts[item.category] !== undefined) {
          counts[item.category]++;
        }
      });
    });

    return { totalValue: value, categoryCounts: counts };
  }, [areas]);

  // 维护提醒：收集所有需要提醒的物品，按紧急程度排序（overdue → due-soon → pending-setup）
  const maintenanceAlerts = useMemo<AlertEntry[]>(() => {
    const list: AlertEntry[] = [];
    areas.forEach((area) => {
      area.items.forEach((item) => {
        if (!item.maintenanceCycle) return;
        const r = getMaintenanceStatus(item);
        if (isMaintenanceAlert(r.status)) {
          list.push({
            item,
            area,
            status: r.status,
            label: r.label,
            nextDate: r.nextDate,
          });
        }
      });
    });
    const order: Record<MaintenanceStatus, number> = {
      overdue: 0,
      "due-soon": 1,
      "pending-setup": 2,
      ok: 3,
      none: 4,
    };
    list.sort((a, b) => order[a.status] - order[b.status]);
    return list;
  }, [areas]);

  const overdueCount = maintenanceAlerts.filter(
    (a) => a.status === "overdue"
  ).length;
  const dueSoonCount = maintenanceAlerts.filter(
    (a) => a.status === "due-soon"
  ).length;

  return (
    <div className="min-h-screen">
      <TopBar title="居所图鉴" subtitle={subtitle} />

      {/* Hero 杂志式标题 */}
      <section className="border-b border-line bg-cream/60">
        <div className="container max-w-6xl py-6 sm:py-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl animate-fadeUp">
              <span className="inline-flex items-center gap-1.5 text-2xs uppercase tracking-[0.2em] text-clay-500">
                <Sparkles size={12} /> Home Atlas
              </span>
              <h1 className="mt-3 font-serif text-3xl font-semibold leading-tight text-ink sm:text-4xl md:text-5xl">
                {title}
              </h1>
              <p className="mt-3 text-sm text-ink/55">
                一张户型图，串联起每个区域的设施与物品。{subtitle}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <Link to="/search" className="btn-primary">
                  <Search size={16} /> 开始检索
                </Link>
                <Link to="/export" className="btn-secondary">
                  <Download size={16} /> 导出 PDF
                </Link>
              </div>
            </div>
            {/* 数据徽章 */}
            <div className="flex shrink-0 gap-6 border-l border-line pl-6 md:flex-col md:gap-3 md:border-l-0 md:border-t md:border-t-0 md:pl-0">
              <Stat label="区域" value={totalAreas} suffix="个" />
              <Stat label="物品" value={totalItems} suffix="件" />
              <Stat label="总估值" value={totalValue} suffix="元" isPrice />
            </div>
          </div>
        </div>
      </section>

      {/* 户型图主体 */}
      <main className="container max-w-6xl py-6 sm:py-10 animate-fadeIn">
        <SectionHeader
          eyebrow="01 · Floor Plan"
          title="户型平面总览"
          desc="点击图上的序号锚点进入对应区域，查看区域总图、设施图与物品清单。"
        />

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          {/* 户型图 */}
          <div className="card overflow-hidden p-4 md:p-6">
            <FloorPlan
              areas={areas}
              floorPlanImage={floorPlanImage}
              highlightAreaId={hoverArea}
              onAreaClick={(id) => navigate(`/area/${id}`)}
              onAreaHover={setHoverArea}
            />
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-2xs text-ink/45">
              <span>● 序号锚点：区域入口，点击进入</span>
              <span className="ml-auto">悬停右侧区域卡片可在图上高亮</span>
            </div>
          </div>

          {/* 区域索引 */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-sm font-semibold text-ink">
                区域索引
              </h3>
              <span className="text-2xs text-ink/45">{totalAreas} 个区域</span>
            </div>
            <div className="flex flex-col gap-2.5">
              {areas.map((a, idx) => (
                <button
                  key={a.id}
                  onMouseEnter={() => setHoverArea(a.id)}
                  onMouseLeave={() => setHoverArea(undefined)}
                  onClick={() => navigate(`/area/${a.id}`)}
                  className={cn(
                    "card group flex items-center gap-3 p-3 text-left transition-all",
                    hoverArea === a.id
                      ? "border-clay-400 bg-clay-50/50 -translate-y-0.5 shadow-cardHover"
                      : "hover:-translate-y-0.5 hover:shadow-cardHover"
                  )}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-moss font-display text-sm font-semibold text-cream">
                    {idx + 1}
                  </span>
                  {a.images[0]?.url ? (
                    <img
                      src={a.images[0].url}
                      alt={a.name}
                      loading="lazy"
                      className="h-12 w-16 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded bg-clay-50 text-2xs text-ink/40">
                      无图
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-serif text-sm font-semibold text-ink">
                      {a.name}
                    </p>
                    <p className="truncate text-2xs text-ink/50">
                      {a.items.length} 件物品 · {a.description}
                    </p>
                  </div>
                  <ArrowRight
                    size={16}
                    className="shrink-0 text-ink/30 transition-transform group-hover:translate-x-0.5 group-hover:text-clay-500"
                  />
                </button>
              ))}
            </div>

            {/* 维护提醒面板（有过期/即将到期时显示） */}
            {maintenanceAlerts.length > 0 && (
              <MaintenanceAlertPanel
                alerts={maintenanceAlerts}
                overdueCount={overdueCount}
                dueSoonCount={dueSoonCount}
                onItemClick={(areaId, itemId) =>
                  navigate(`/area/${areaId}/item/${itemId}`)
                }
              />
            )}

            {/* 资产统计图表 */}
            {totalItems > 0 && (
              <div className="card p-4 space-y-3 shadow-card transition-all">
                <div className="flex items-center justify-between border-b border-line pb-2">
                  <h3 className="font-serif text-sm font-semibold text-ink flex items-center gap-1.5">
                    <Boxes size={14} className="text-moss" />
                    物品分类统计
                  </h3>
                  <span className="text-2xs text-ink/40">总 {totalItems} 件物品</span>
                </div>
                <div className="space-y-2.5">
                  {CATEGORIES.map((cat) => {
                    const count = categoryCounts[cat] || 0;
                    const pct = totalItems > 0 ? (count / totalItems) * 100 : 0;
                    const color = CATEGORY_COLOR[cat];
                    if (count === 0) return null;
                    return (
                      <div key={cat} className="space-y-1">
                        <div className="flex justify-between text-2xs">
                          <span className="flex items-center gap-1 text-ink/75">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                            {cat}
                          </span>
                          <span className="text-ink/50 font-medium">
                            {count} 件 · {pct.toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-clay-50 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, background: color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 快捷操作 */}
            <div className="mt-2 grid grid-cols-3 gap-2.5">
              <Link
                to="/setup"
                className="card flex flex-col items-start gap-1 p-3 hover:-translate-y-0.5 hover:shadow-cardHover"
              >
                <Settings size={16} className="text-clay-500" />
                <span className="text-xs font-medium text-ink">户型设置</span>
                <span className="text-2xs text-ink/45">导入图/划区域</span>
              </Link>
              <Link
                to="/search"
                className="card flex flex-col items-start gap-1 p-3 hover:-translate-y-0.5 hover:shadow-cardHover"
              >
                <Search size={16} className="text-clay-500" />
                <span className="text-xs font-medium text-ink">检索物品</span>
                <span className="text-2xs text-ink/45">关键词/分类/品牌</span>
              </Link>
              <Link
                to="/export"
                className="card flex flex-col items-start gap-1 p-3 hover:-translate-y-0.5 hover:shadow-cardHover"
              >
                <Boxes size={16} className="text-moss" />
                <span className="text-xs font-medium text-ink">导出图鉴</span>
                <span className="text-2xs text-ink/45">PDF 打印装订</span>
              </Link>
            </div>
          </div>
        </div>
      </main>

      {/* 智能语音查找助手悬浮入口 */}
      {user && (
        <>
          <button
            onClick={() => setIsAssistantOpen(true)}
            title="语音智能查找"
            className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-clay-500 text-cream shadow-lg hover:bg-clay-600 hover:-translate-y-1 transition-all focus:outline-none"
          >
            <Sparkles size={24} className="animate-pulse" />
          </button>
          <VoiceAssistant
            isOpen={isAssistantOpen}
            onClose={() => setIsAssistantOpen(false)}
          />
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
  isPrice = false,
}: {
  label: string;
  value: number;
  suffix: string;
  isPrice?: boolean;
}) {
  const displayVal = isPrice
    ? value.toLocaleString("zh-CN")
    : String(value).padStart(2, "0");
  return (
    <div>
      <div className="font-display text-3xl font-semibold text-clay-500">
        {displayVal}
        <span className="ml-0.5 text-sm font-normal text-ink/40">{suffix}</span>
      </div>
      <div className="text-2xs uppercase tracking-wider text-ink/45">
        {label}
      </div>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  desc,
}: {
  eyebrow: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-display text-2xs uppercase tracking-[0.2em] text-clay-500">
        {eyebrow}
      </span>
      <h2 className="font-serif text-2xl font-semibold text-ink">{title}</h2>
      <p className="text-sm text-ink/55">{desc}</p>
    </div>
  );
}

/** 首页维护提醒面板：列出已过期/即将到期/待首次维护的物品 */
function MaintenanceAlertPanel({
  alerts,
  overdueCount,
  dueSoonCount,
  onItemClick,
}: {
  alerts: AlertEntry[];
  overdueCount: number;
  dueSoonCount: number;
  onItemClick: (areaId: string, itemId: string) => void;
}) {
  return (
    <div className="card overflow-hidden border-ochre/30 shadow-card transition-all">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 bg-ochre/5">
        <AlertTriangle size={14} className="text-ochre" />
        <h3 className="font-serif text-sm font-semibold text-ink">维护提醒</h3>
        <span className="text-2xs text-ink/55">
          {overdueCount > 0 && (
            <span className="text-red-700 font-medium">
              {overdueCount} 件已过期
            </span>
          )}
          {overdueCount > 0 && dueSoonCount > 0 && <span> · </span>}
          {dueSoonCount > 0 && (
            <span className="text-clay-600 font-medium">
              {dueSoonCount} 件即将到期
            </span>
          )}
        </span>
      </div>
      <ul className="divide-y divide-line max-h-64 overflow-y-auto">
        {alerts.map(({ item, area, status, label, nextDate }) => {
          const color = MAINTENANCE_STATUS_COLOR[status];
          return (
            <li key={item.id}>
              <button
                onClick={() => onItemClick(area.id, item.id)}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-clay-50/60 transition-colors"
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                  style={{ background: color + "1A", color }}
                >
                  <CalendarClock size={13} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {item.name}
                  </p>
                  <p className="truncate text-2xs text-ink/45">
                    {area.name}
                    {item.brand ? ` · ${item.brand}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span
                    className="text-2xs font-medium"
                    style={{ color }}
                  >
                    {label}
                  </span>
                  {nextDate && (
                    <p className="text-2xs text-ink/40">{nextDate}</p>
                  )}
                </div>
                <ArrowRight
                  size={14}
                  className="shrink-0 text-ink/30"
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

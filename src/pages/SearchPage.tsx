import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpDown, MapPin, Plus, Search as SearchIcon, X } from "lucide-react";
import PageLayout from "@/components/PageLayout";
import FloorPlan from "@/components/FloorPlan";
import ItemCard from "@/components/ItemCard";
import EmptyState from "@/components/Empty";
import { useHomeStore } from "@/store";
import { useUiStore } from "@/uiStore";
import { CATEGORIES, CATEGORY_COLOR, type Category } from "@/types";
import { cn } from "@/lib/utils";

type SortBy = "name" | "purchaseDate" | "price";

export default function SearchPage() {
  const { areas, search, allBrands, floorPlanImage } = useHomeStore();
  const setLastSearch = useUiStore((s) => s.setLastSearch);

  const [keyword, setKeyword] = useState("");
  const [areaIds, setAreaIds] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [activeId, setActiveId] = useState<string | undefined>();

  const brandList = useMemo(() => allBrands(), [allBrands]);

  const results = useMemo(
    () =>
      search({
        keyword,
        areaIds,
        categories,
        brands,
        sortBy,
        sortOrder: "asc",
      }),
    [search, keyword, areaIds, categories, brands, sortBy]
  );

  // 记录最近一次检索，供导出"仅检索结果"使用
  useEffect(() => {
    setLastSearch(
      { keyword, areaIds, categories, brands, sortBy, sortOrder: "asc" },
      results
    );
  }, [results, keyword, areaIds, categories, brands, sortBy, setLastSearch]);

  // 当前激活物品所在区域
  const activeAreaId = useMemo(() => {
    if (!activeId) return undefined;
    return results.find((r) => r.item.id === activeId)?.area.id;
  }, [activeId, results]);

  const toggle = <T,>(arr: T[], v: T, set: (x: T[]) => void) => {
    set(arr.includes(v) ? arr.filter((i) => i !== v) : [...arr, v]);
  };

  const hasFilter =
    keyword || areaIds.length || categories.length || brands.length;

  return (
    <PageLayout title="检索中心" subtitle="关键词 · 区域 · 分类 · 品牌 多维筛选">
      {/* 搜索栏 */}
      <div className="card p-4 md:p-5">
        <div className="relative">
          <SearchIcon
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/35"
          />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索物品名称、品牌、规格、备注……"
            className="w-full border-b-0 border border-line bg-cream py-3 pl-11 pr-10 text-base text-ink placeholder:text-ink/35 focus:border-clay-400 focus:outline-none rounded"
          />
          {keyword && (
            <button
              onClick={() => setKeyword("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* 筛选器 */}
        <div className="mt-4 space-y-3">
          <FilterRow label="区域">
            {areas.map((a) => (
              <Chip
                key={a.id}
                active={areaIds.includes(a.id)}
                onClick={() => toggle(areaIds, a.id, setAreaIds)}
              >
                {a.name}
              </Chip>
            ))}
          </FilterRow>
          <FilterRow label="分类">
            {CATEGORIES.map((c) => (
              <Chip
                key={c}
                active={categories.includes(c)}
                onClick={() => toggle(categories, c, setCategories)}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: CATEGORY_COLOR[c] }}
                />
                {c}
              </Chip>
            ))}
          </FilterRow>
          <FilterRow label="品牌">
            {brandList.map((b) => (
              <Chip
                key={b}
                active={brands.includes(b)}
                onClick={() => toggle(brands, b, setBrands)}
              >
                {b}
              </Chip>
            ))}
          </FilterRow>
        </div>

        {/* 排序 + 清空 */}
        <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
          <div className="flex items-center gap-2 text-xs text-ink/55">
            <ArrowUpDown size={14} />
            <span>排序</span>
            <div className="flex gap-1">
              {(["name", "purchaseDate", "price"] as SortBy[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={cn(
                    "rounded px-2 py-0.5 transition-colors",
                    sortBy === s
                      ? "bg-clay-500 text-cream"
                      : "text-ink/55 hover:bg-clay-50"
                  )}
                >
                  {s === "name" ? "名称" : s === "purchaseDate" ? "购入日期" : "价格"}
                </button>
              ))}
            </div>
          </div>
          {hasFilter && (
            <button
              onClick={() => {
                setKeyword("");
                setAreaIds([]);
                setCategories([]);
                setBrands([]);
              }}
              className="btn-ghost"
            >
              <X size={14} /> 清空筛选
            </button>
          )}
        </div>
      </div>

      {/* 结果 + 户型图回显 */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        {/* 结果列表 */}
        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-serif text-lg font-semibold text-ink">
              检索结果
            </h2>
            <span className="text-2xs text-ink/50">
              共 <span className="font-display text-clay-500">{results.length}</span> 件命中
            </span>
          </div>

          {results.length === 0 ? (
            <EmptyState
              icon={<SearchIcon size={22} />}
              title="未找到匹配物品"
              description="尝试更换关键词，或清空筛选条件；也可直接录入新物品。"
              action={
                <Link to="/" className="btn-primary">
                  <Plus size={16} /> 去录入
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {results.map((r) => (
                <div
                  key={r.item.id}
                  onMouseEnter={() => setActiveId(r.item.id)}
                  onMouseLeave={() => setActiveId(undefined)}
                >
                  <ItemCard
                    item={r.item}
                    areaName={r.area.name}
                    highlighted={activeId === r.item.id}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 户型图回显 */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="card p-4">
            <div className="mb-2 flex items-center gap-2">
              <MapPin size={15} className="text-ochre" />
              <h3 className="font-serif text-sm font-semibold text-ink">
                位置回显
              </h3>
              <span className="ml-auto text-2xs text-ink/45">
                {activeAreaId
                  ? areas.find((a) => a.id === activeAreaId)?.name
                  : "悬停结果查看"}
              </span>
            </div>
            <FloorPlan
              areas={areas}
              floorPlanImage={floorPlanImage}
              highlightAreaId={activeAreaId}
              showAreaAnchors
              compact
            />
            <p className="mt-2 text-2xs text-ink/45">
              悬停检索结果可高亮其所属区域。物品精确位置见各区域详情页。
            </p>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-10 shrink-0 text-2xs uppercase tracking-wider text-ink/45">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn("chip cursor-pointer transition-colors", active && "chip-active")}
    >
      {children}
    </button>
  );
}

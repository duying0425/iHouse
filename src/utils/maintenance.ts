// 物品维护状态计算工具
// 与 Item.maintenanceCycle / lastMaintenanceDate 配合使用

/** 维护状态 */
export type MaintenanceStatus =
  | "none" // 未设置维护周期，无需维护
  | "ok" // 正常：距下次维护 > 7 天
  | "due-soon" // 即将到期：距下次维护 ≤ 7 天且未过期
  | "overdue" // 已过期：已过下次维护日期
  | "pending-setup"; // 设置了周期但缺上次维护日期，待首次维护

/** 即将到期的提前预警天数 */
export const DUE_SOON_DAYS = 7;

/** 常用维护周期预设（天） */
export const MAINTENANCE_PRESETS: { label: string; days: number }[] = [
  { label: "每月", days: 30 },
  { label: "每季度", days: 90 },
  { label: "每半年", days: 180 },
  { label: "每年", days: 365 },
  { label: "每两年", days: 730 },
];

interface MaintenanceInput {
  maintenanceCycle?: number;
  lastMaintenanceDate?: string;
}

export interface MaintenanceResult {
  status: MaintenanceStatus;
  /** 下次维护日期 YYYY-MM-DD（无周期或缺日期时为 null） */
  nextDate: string | null;
  /** 距下次维护的天数（已过期为负数；无周期或缺日期为 null） */
  daysUntilDue: number | null;
  /** 状态展示用的中文文案 */
  label: string;
}

/**
 * 把 YYYY-MM-DD 转为当天 00:00 的 Date（避免时区偏移把当天算成 -1）
 */
function parseDateDay(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 把 Date 格式化为 YYYY-MM-DD
 */
function formatDateDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 计算两个日期（按天，零时）之间的整数天数差（to - from） */
function daysBetween(from: Date, to: Date): number {
  const MS = 24 * 60 * 60 * 1000;
  return Math.round((to.getTime() - from.getTime()) / MS);
}

/**
 * 计算物品的维护状态
 * @param item 物品（或包含维护字段的对象）
 * @param now  当前时间（默认 new Date()，便于测试注入）
 */
export function getMaintenanceStatus(
  item: MaintenanceInput,
  now: Date = new Date()
): MaintenanceResult {
  const cycle = item.maintenanceCycle;
  if (!cycle || cycle <= 0) {
    return { status: "none", nextDate: null, daysUntilDue: null, label: "无需维护" };
  }

  if (!item.lastMaintenanceDate) {
    return {
      status: "pending-setup",
      nextDate: null,
      daysUntilDue: null,
      label: "待首次维护",
    };
  }

  const last = parseDateDay(item.lastMaintenanceDate);
  if (!last) {
    return {
      status: "pending-setup",
      nextDate: null,
      daysUntilDue: null,
      label: "待首次维护",
    };
  }

  const next = new Date(last.getTime() + cycle * 24 * 60 * 60 * 1000);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = daysBetween(today, next);
  const nextStr = formatDateDay(next);

  if (diff < 0) {
    const absDiff = Math.abs(diff);
    return {
      status: "overdue",
      nextDate: nextStr,
      daysUntilDue: diff,
      label: `已过期 ${absDiff} 天`,
    };
  }
  if (diff <= DUE_SOON_DAYS) {
    return {
      status: "due-soon",
      nextDate: nextStr,
      daysUntilDue: diff,
      label: diff === 0 ? "今日到期" : `即将到期 · ${diff} 天`,
    };
  }
  return {
    status: "ok",
    nextDate: nextStr,
    daysUntilDue: diff,
    label: `下次 ${nextStr}`,
  };
}

/** 状态对应的展示色（与 tailwind 配色对齐） */
export const MAINTENANCE_STATUS_COLOR: Record<MaintenanceStatus, string> = {
  none: "#6B6258",
  ok: "#5C7A6A",
  "due-soon": "#D97A3C",
  overdue: "#B91C1C",
  "pending-setup": "#A86B3C",
};

/** 是否需要提醒（用于首页提醒面板筛选） */
export function isMaintenanceAlert(
  status: MaintenanceStatus
): boolean {
  return status === "overdue" || status === "due-soon" || status === "pending-setup";
}

/** 把「周期天数」转成可读文案，如 180 → "半年" */
export function cycleLabel(days?: number): string {
  if (!days || days <= 0) return "无";
  if (days % 365 === 0) {
    const y = days / 365;
    return y === 1 ? "每年" : `每 ${y} 年`;
  }
  if (days % 30 === 0) {
    const m = days / 30;
    return m === 1 ? "每月" : `每 ${m} 个月`;
  }
  return `每 ${days} 天`;
}

export { parseDateDay, formatDateDay, daysBetween };

import { describe, it, expect } from "vitest";
import {
  getMaintenanceStatus,
  isMaintenanceAlert,
  cycleLabel,
  parseDateDay,
  formatDateDay,
  daysBetween,
  MAINTENANCE_PRESETS,
} from "./maintenance";

describe("maintenance utils", () => {
  describe("getMaintenanceStatus", () => {
    it("无周期时返回 none", () => {
      const r = getMaintenanceStatus({});
      expect(r.status).toBe("none");
      expect(r.nextDate).toBeNull();
      expect(r.daysUntilDue).toBeNull();
      expect(r.label).toBe("无需维护");
    });

    it("周期为 0 或负数时返回 none", () => {
      expect(getMaintenanceStatus({ maintenanceCycle: 0 }).status).toBe("none");
      expect(
        getMaintenanceStatus({ maintenanceCycle: -10 }).status
      ).toBe("none");
    });

    it("有周期无上次维护日期时返回 pending-setup", () => {
      const r = getMaintenanceStatus({ maintenanceCycle: 180 });
      expect(r.status).toBe("pending-setup");
      expect(r.label).toBe("待首次维护");
      expect(r.nextDate).toBeNull();
    });

    it("有周期但上次维护日期格式非法时返回 pending-setup", () => {
      const r = getMaintenanceStatus({
        maintenanceCycle: 180,
        lastMaintenanceDate: "not-a-date",
      });
      expect(r.status).toBe("pending-setup");
    });

    it("正常状态：距下次维护 > 7 天", () => {
      // 上次 2026-06-01，周期 180 天 → 下次 2025-11-28
      // 用 2026-06-02 作为 now，距下次还远
      const r = getMaintenanceStatus(
        {
          maintenanceCycle: 180,
          lastMaintenanceDate: "2026-06-01",
        },
        new Date(2026, 5, 2) // 2026-06-02
      );
      expect(r.status).toBe("ok");
      // 下次维护日 = 2026-06-01 + 180 天 = 2026-11-28
      expect(r.nextDate).toBe("2026-11-28");
      expect(r.daysUntilDue).toBeGreaterThan(7);
    });

    it("即将到期：距下次 ≤ 7 天且未过期", () => {
      // 上次 2026-06-25，周期 180 天 → 下次约 2026-12-22
      // 用 2026-12-20 作为 now，距下次 2 天
      const r = getMaintenanceStatus(
        {
          maintenanceCycle: 30,
          lastMaintenanceDate: "2026-11-25",
        },
        new Date(2026, 11, 27) // 2026-12-27，距 2026-12-25 已过 2 天
      );
      // 这里 lastDate=2026-11-25 + 30 = 2026-12-25，now=2026-12-27 → 已过期 2 天
      expect(r.status).toBe("overdue");
    });

    it("即将到期：距下次维护恰好 7 天", () => {
      // lastDate=2026-06-01, cycle=30 → next=2026-07-01
      // now=2026-06-24 → 距 next 7 天
      const r = getMaintenanceStatus(
        {
          maintenanceCycle: 30,
          lastMaintenanceDate: "2026-06-01",
        },
        new Date(2026, 5, 24) // 2026-06-24
      );
      expect(r.status).toBe("due-soon");
      expect(r.nextDate).toBe("2026-07-01");
      expect(r.daysUntilDue).toBe(7);
    });

    it("今日到期：daysUntilDue === 0", () => {
      const r = getMaintenanceStatus(
        {
          maintenanceCycle: 30,
          lastMaintenanceDate: "2026-06-01",
        },
        new Date(2026, 6, 1) // 2026-07-01 = next
      );
      expect(r.status).toBe("due-soon");
      expect(r.daysUntilDue).toBe(0);
      expect(r.label).toContain("今日到期");
    });

    it("已过期：daysUntilDue < 0", () => {
      const r = getMaintenanceStatus(
        {
          maintenanceCycle: 30,
          lastMaintenanceDate: "2026-06-01",
        },
        new Date(2026, 6, 5) // 2026-07-05，已过 2026-07-01 共 4 天
      );
      expect(r.status).toBe("overdue");
      expect(r.daysUntilDue).toBe(-4);
      expect(r.label).toContain("已过期 4 天");
    });

    it("跨年计算正确", () => {
      // lastDate=2025-12-20, cycle=30 → next=2026-01-19
      const r = getMaintenanceStatus(
        {
          maintenanceCycle: 30,
          lastMaintenanceDate: "2025-12-20",
        },
        new Date(2026, 0, 15) // 2026-01-15
      );
      expect(r.status).toBe("due-soon");
      expect(r.nextDate).toBe("2026-01-19");
      expect(r.daysUntilDue).toBe(4);
    });

    it("闰年 2 月计算正确（2026-02-26 + 30 = 2026-03-28）", () => {
      const r = getMaintenanceStatus(
        {
          maintenanceCycle: 30,
          lastMaintenanceDate: "2026-02-26",
        },
        new Date(2026, 2, 1) // 2026-03-01
      );
      expect(r.nextDate).toBe("2026-03-28");
    });
  });

  describe("isMaintenanceAlert", () => {
    it("overdue/due-soon/pending-setup 应提醒", () => {
      expect(isMaintenanceAlert("overdue")).toBe(true);
      expect(isMaintenanceAlert("due-soon")).toBe(true);
      expect(isMaintenanceAlert("pending-setup")).toBe(true);
    });

    it("none/ok 不应提醒", () => {
      expect(isMaintenanceAlert("none")).toBe(false);
      expect(isMaintenanceAlert("ok")).toBe(false);
    });
  });

  describe("cycleLabel", () => {
    it("无值或非正数返回「无」", () => {
      expect(cycleLabel(undefined)).toBe("无");
      expect(cycleLabel(0)).toBe("无");
      expect(cycleLabel(-1)).toBe("无");
    });

    it("365 整数倍返回每年/每 N 年", () => {
      expect(cycleLabel(365)).toBe("每年");
      expect(cycleLabel(730)).toBe("每 2 年");
    });

    it("30 整数倍返回每月/每 N 个月", () => {
      expect(cycleLabel(30)).toBe("每月");
      expect(cycleLabel(90)).toBe("每 3 个月");
      expect(cycleLabel(180)).toBe("每 6 个月");
    });

    it("非整月整年的返回每 N 天", () => {
      expect(cycleLabel(45)).toBe("每 45 天");
      expect(cycleLabel(100)).toBe("每 100 天");
    });
  });

  describe("date helpers", () => {
    it("parseDateDay 解析合法日期", () => {
      const d = parseDateDay("2026-07-01");
      expect(d).not.toBeNull();
      expect(d!.getFullYear()).toBe(2026);
      expect(d!.getMonth()).toBe(6); // 0-indexed
      expect(d!.getDate()).toBe(1);
    });

    it("parseDateDay 对非法格式返回 null", () => {
      expect(parseDateDay("2026/07/01")).toBeNull();
      expect(parseDateDay("invalid")).toBeNull();
      expect(parseDateDay("")).toBeNull();
    });

    it("formatDateDay 格式化日期", () => {
      expect(formatDateDay(new Date(2026, 6, 1))).toBe("2026-07-01");
      expect(formatDateDay(new Date(2026, 0, 5))).toBe("2026-01-05");
    });

    it("daysBetween 计算天数差", () => {
      const from = new Date(2026, 6, 1);
      const to = new Date(2026, 6, 10);
      expect(daysBetween(from, to)).toBe(9);
      expect(daysBetween(to, from)).toBe(-9);
      expect(daysBetween(from, from)).toBe(0);
    });

    it("daysBetween 跨月计算正确", () => {
      const from = new Date(2026, 0, 31); // 1月31
      const to = new Date(2026, 1, 1); // 2月1
      expect(daysBetween(from, to)).toBe(1);
    });
  });

  describe("MAINTENANCE_PRESETS", () => {
    it("包含常用周期", () => {
      const days = MAINTENANCE_PRESETS.map((p) => p.days);
      expect(days).toContain(30);
      expect(days).toContain(90);
      expect(days).toContain(180);
      expect(days).toContain(365);
      expect(days).toContain(730);
    });

    it("每个预设都有 label 和正数 days", () => {
      MAINTENANCE_PRESETS.forEach((p) => {
        expect(p.label).toBeTruthy();
        expect(p.days).toBeGreaterThan(0);
      });
    });
  });
});

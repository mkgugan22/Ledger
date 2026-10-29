import { describe, expect, it } from "vitest";
import { filterByPeriod, weekRange } from "./periods.js";

// 2026-10-29 is a Thursday.
const today = "2026-10-29";
const base = { selectedMonth: "2026-10", today };

const tx = (id, month, date, amount = 100) => ({ id, month, ...(date ? { date } : {}), mode: "Spending", type: "x", amount });

describe("weekRange", () => {
  it("runs Monday to Sunday", () => {
    expect(weekRange("2026-10-29")).toEqual({ start: "2026-10-26", end: "2026-11-01" });
    expect(weekRange("2026-10-26")).toEqual({ start: "2026-10-26", end: "2026-11-01" });
    expect(weekRange("2026-11-01")).toEqual({ start: "2026-10-26", end: "2026-11-01" });
  });
});

describe("filterByPeriod: Today / This Week", () => {
  const list = [
    tx("today", "2026-10", "2026-10-29"),
    tx("monday", "2026-10", "2026-10-26"),
    tx("lastweek", "2026-10", "2026-10-20"),
    tx("nextmonth", "2026-11", "2026-11-01"),
    tx("legacy", "2026-10"),
  ];

  it("Today returns only entries dated today", () => {
    const { rows } = filterByPeriod(list, { ...base, period: "Today" });
    expect(rows.map((r) => r.id)).toEqual(["today"]);
  });

  it("This Week returns the Monday-Sunday window, even across a month boundary", () => {
    const { rows } = filterByPeriod(list, { ...base, period: "This Week" });
    expect(rows.map((r) => r.id).sort()).toEqual(["monday", "nextmonth", "today"]);
  });

  it("does not count undated entries, but says so", () => {
    const { rows, note } = filterByPeriod(list, { ...base, period: "Today" });
    expect(rows.some((r) => r.id === "legacy")).toBe(false);
    expect(note).toMatch(/1 entry this month without a date/);
  });

  it("keeps ratios on the whole selected month", () => {
    const { ratioRows } = filterByPeriod(list, { ...base, period: "Today" });
    expect(ratioRows.map((r) => r.id).sort()).toEqual(["lastweek", "legacy", "monday", "today"]);
  });

  it("falls back to the month when no entry has a date yet (old behaviour)", () => {
    const legacyOnly = [tx("a", "2026-10"), tx("b", "2026-09")];
    const { rows, note } = filterByPeriod(legacyOnly, { ...base, period: "Today" });
    expect(rows.map((r) => r.id)).toEqual(["a"]);
    expect(note).toMatch(/don't have dates/);
  });
});

describe("filterByPeriod: unchanged periods", () => {
  const list = [tx("o", "2026-10"), tx("s", "2026-09"), tx("j", "2026-07"), tx("p", "2025-10")];

  it("This Month", () => {
    expect(filterByPeriod(list, { ...base, period: "This Month" }).rows.map((r) => r.id)).toEqual(["o"]);
  });

  it("Quarter (Oct-Dec)", () => {
    expect(filterByPeriod(list, { ...base, period: "Quarter" }).rows.map((r) => r.id)).toEqual(["o"]);
    expect(filterByPeriod(list, { ...base, selectedMonth: "2026-09", period: "Quarter" }).rows.map((r) => r.id).sort()).toEqual(["j", "s"]);
  });

  it("Year", () => {
    expect(filterByPeriod(list, { ...base, period: "Year" }).rows.map((r) => r.id).sort()).toEqual(["j", "o", "s"]);
  });

  it("Custom range, and the month when the range is incomplete", () => {
    expect(filterByPeriod(list, { ...base, period: "Custom", customFrom: "2026-07", customTo: "2026-09" }).rows.map((r) => r.id).sort()).toEqual(["j", "s"]);
    expect(filterByPeriod(list, { ...base, period: "Custom" }).rows.map((r) => r.id)).toEqual(["o"]);
  });

  it("uses the same rows for ratios as for totals", () => {
    const result = filterByPeriod(list, { ...base, period: "Year" });
    expect(result.ratioRows).toBe(result.rows);
  });
});

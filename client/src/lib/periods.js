// Period filtering for the dashboard's "Financial Command Center".
//
// This is the existing month / quarter / year / custom logic moved out of the
// component unchanged, plus real date handling for "Today" and "This Week".

import { isValidISODate } from "./obligations.js";

export const PERIODS = ["Today", "This Week", "This Month", "Quarter", "Year", "Custom"];

const pad = (n) => String(n).padStart(2, "0");
const hasDate = (t) => isValidISODate(t?.date);

// Monday-to-Sunday week containing `todayISO`.
export function weekRange(todayISO) {
  const [y, m, d] = todayISO.split("-").map(Number);
  const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  const sinceMonday = (dayOfWeek + 6) % 7;
  const start = new Date(Date.UTC(y, m - 1, d - sinceMonday));
  const end = new Date(Date.UTC(y, m - 1, d - sinceMonday + 6));
  const fmt = (dt) => `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  return { start: fmt(start), end: fmt(end) };
}

export function shortDate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/**
 * Returns:
 *  rows       transactions that belong to the period
 *  ratioRows  the transactions to use for ratio-style numbers (health score,
 *             budget usage). For Today / This Week these stay on the selected
 *             month, because a single day's income or budget is meaningless;
 *             for every other period they equal `rows`.
 *  note       an optional explanation to show under the period label
 */
export function filterByPeriod(transactions, { period, selectedMonth, customFrom = "", customTo = "", today }) {
  const monthRows = transactions.filter((x) => x.month === selectedMonth);

  if (period === "Today" || period === "This Week") {
    // Entries saved before dates existed carry only a month. If nothing has a
    // date yet, keep the old behaviour (show the month) instead of showing zero.
    if (!transactions.some(hasDate)) {
      return {
        rows: monthRows,
        ratioRows: monthRows,
        note: "Your entries don't have dates yet, so this shows the whole month.",
      };
    }
    const { start, end } = period === "Today" ? { start: today, end: today } : weekRange(today);
    const rows = transactions.filter((x) => hasDate(x) && x.date >= start && x.date <= end);
    const undated = transactions.filter((x) => !hasDate(x) && x.month === today.slice(0, 7)).length;
    return {
      rows,
      ratioRows: monthRows,
      note: undated
        ? `${undated} ${undated === 1 ? "entry" : "entries"} this month without a date ${undated === 1 ? "isn't" : "aren't"} counted.`
        : "",
    };
  }

  let rows;
  if (period === "Year") {
    rows = transactions.filter((x) => x.month?.startsWith(selectedMonth.slice(0, 4)));
  } else if (period === "Quarter") {
    const [year, m] = selectedMonth.split("-").map(Number);
    const qStart = Math.floor((m - 1) / 3) * 3 + 1;
    const allowed = new Set([0, 1, 2].map((i) => `${year}-${pad(qStart + i)}`));
    rows = transactions.filter((x) => allowed.has(x.month));
  } else if (period === "Custom") {
    rows = !customFrom || !customTo ? monthRows : transactions.filter((x) => x.month >= customFrom && x.month <= customTo);
  } else {
    rows = monthRows;
  }
  return { rows, ratioRows: rows, note: "" };
}

export function periodLabel(period, { selectedMonth, today, monthLabel }) {
  if (period === "This Month") return monthLabel(selectedMonth);
  if (period === "Today") return `Today · ${shortDate(today)}`;
  if (period === "This Week") {
    const { start, end } = weekRange(today);
    return `This week · ${shortDate(start)} – ${shortDate(end)}`;
  }
  return period;
}

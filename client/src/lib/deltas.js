// Month-over-month comparison helpers for the dashboard KPI cards.

// "2026-01" -> "2025-12". Returns "" for anything that isn't a YYYY-MM string.
export function previousMonth(month) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month || ""));
  if (!match) return "";
  const year = Number(match[1]);
  const index = Number(match[2]);
  if (index < 1 || index > 12) return "";
  return index === 1 ? `${year - 1}-12` : `${year}-${String(index - 1).padStart(2, "0")}`;
}

// Percentage change from `previous` to `current`. Returns null when there is no
// meaningful baseline (previous is zero/missing), so callers can hide the delta
// instead of showing "Infinity%".
export function percentChange(current, previous) {
  const prev = Number(previous);
  const now = Number(current);
  if (!Number.isFinite(prev) || !Number.isFinite(now) || prev === 0) return null;
  return ((now - prev) / Math.abs(prev)) * 100;
}

// Sums transaction amounts for one month, per mode.
export function totalsForMonth(transactions, month) {
  const totals = { Income: 0, Needs: 0, Savings: 0, Spending: 0 };
  (transactions || []).forEach((tx) => {
    if (tx.month === month && totals[tx.mode] !== undefined) totals[tx.mode] += Number(tx.amount) || 0;
  });
  return totals;
}

// Which direction is "good" for each mode: more income/savings is good, more
// needs/spending is not. Used only to pick a colour; the arrow and the number
// always carry the meaning as well.
const HIGHER_IS_GOOD = { Income: true, Savings: true, Needs: false, Spending: false };

// Builds the label shown under a KPI value, or null when there is nothing to
// compare against.
export function describeDelta(mode, current, previous) {
  const pct = percentChange(current, previous);
  if (pct === null) return null;
  const rounded = Math.round(Math.abs(pct));
  if (rounded === 0) return { arrow: "→", word: "", text: "No change", tone: "flat" };
  const up = pct > 0;
  const good = up === (HIGHER_IS_GOOD[mode] ?? true);
  return { arrow: up ? "↑" : "↓", word: up ? "Up" : "Down", text: `${rounded}%`, tone: good ? "good" : "bad" };
}

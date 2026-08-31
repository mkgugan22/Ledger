// Groups a month's budgets and transactions into comparison rows of
// { mode, type, planned, actual, remaining }. Pure function — no state, no
// API calls — so the Budget component stays a thin rendering layer and this
// logic is unit-testable on its own (see budget.test.js).
export function computeBudgetComparison(monthBudgets, monthTx) {
  const rows = new Map();

  monthBudgets.forEach((b) => {
    const key = `${b.mode}::${b.type}`;
    rows.set(key, { mode: b.mode, type: b.type, planned: Number(b.plannedAmount) || 0, actual: 0 });
  });

  monthTx.forEach((t) => {
    const key = `${t.mode}::${t.type}`;
    if (!rows.has(key)) rows.set(key, { mode: t.mode, type: t.type, planned: 0, actual: 0 });
    rows.get(key).actual += Number(t.amount) || 0;
  });

  return Array.from(rows.values())
    .map((r) => ({ ...r, remaining: r.planned - r.actual }))
    .sort((a, b) => a.mode.localeCompare(b.mode) || a.type.localeCompare(b.type));
}

export function buildAlerts({ month, transactions, budgets, investments }) {
  const alerts = [];
  budgets.filter((b) => b.month === month).forEach((budget) => {
    const actual = transactions.filter((t) => t.month === month && t.mode === budget.mode && t.type === budget.type).reduce((sum, t) => sum + Number(t.amount || 0), 0);
    if (actual >= Number(budget.plannedAmount)) alerts.push({ kind: "warning", text: `${budget.type} is ${actual > budget.plannedAmount ? "over" : "at"} its ₹${budget.plannedAmount.toLocaleString("en-IN")} budget.` });
  });
  if (!transactions.some((t) => t.month === month)) alerts.push({ kind: "info", text: `No entries have been recorded for ${month} yet.` });
  const recurringTemplates = transactions.filter((t) => t.recurring && t.month < month);
  const generatedForMonth = new Set(transactions.filter((t) => t.month === month && t.generatedFrom).map((t) => String(t.generatedFrom)));
  const pendingRecurring = recurringTemplates.filter((t) => !generatedForMonth.has(String(t.id || t._id)));
  if (pendingRecurring.length) alerts.push({ kind: "info", text: `${pendingRecurring.length} recurring ${pendingRecurring.length === 1 ? "entry is" : "entries are"} ready to generate for ${month}.` });
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
  const latest = new Map();
  investments.filter((i) => i.type === "Status").forEach((i) => { if (!latest.has(i.fund) || i.date > latest.get(i.fund).date) latest.set(i.fund, i); });
  latest.forEach((item) => { if (new Date(item.date) < cutoff) alerts.push({ kind: "info", text: `${item.fund} has not had a valuation refresh in 30 days.` }); });
  return alerts.slice(0, 5);
}

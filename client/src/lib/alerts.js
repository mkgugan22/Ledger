import { currentDate } from "./format.js";
import { DUE_SOON_DAYS, daysBetween, debtsDueSoon, summarizeBills } from "./obligations.js";

const rupees = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const plural = (n, one, many) => (n === 1 ? one : many);

function dueText(days) {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

function nameList(items, max = 3) {
  const names = items.slice(0, max).map((item) => item.name);
  if (items.length > max) names.push(`+${items.length - max} more`);
  return names.join(", ");
}

// Overdue and upcoming bills / debt payments. These are about the real
// calendar day, not the month selected on the dashboard.
export function buildObligationAlerts({ bills = [], debts = [], today = currentDate() } = {}) {
  const alerts = [];
  const { overdue, dueSoon, overdueTotal, dueSoonTotal } = summarizeBills(bills, today, DUE_SOON_DAYS);

  if (overdue.length === 1) {
    const [bill] = overdue;
    const late = -daysBetween(today, bill.dueDate);
    alerts.push({ kind: "danger", text: `${bill.name} is overdue by ${late} ${plural(late, "day", "days")} (${rupees(bill.amount)}).` });
  } else if (overdue.length > 1) {
    alerts.push({ kind: "danger", text: `${overdue.length} bills are overdue (${rupees(overdueTotal)}): ${nameList(overdue)}.` });
  }

  if (dueSoon.length === 1) {
    const [bill] = dueSoon;
    alerts.push({ kind: "warning", text: `${bill.name} is due ${dueText(daysBetween(today, bill.dueDate))} (${rupees(bill.amount)}).` });
  } else if (dueSoon.length > 1) {
    alerts.push({ kind: "warning", text: `${dueSoon.length} bills are due within ${DUE_SOON_DAYS} days (${rupees(dueSoonTotal)}): ${nameList(dueSoon)}.` });
  }

  const dueDebts = debtsDueSoon(debts, today, DUE_SOON_DAYS);
  if (dueDebts.length === 1) {
    const [debt] = dueDebts;
    const minimum = Number(debt.minimumPayment) > 0 ? ` (minimum ${rupees(debt.minimumPayment)})` : "";
    alerts.push({ kind: "info", text: `${debt.name} payment is due ${dueText(daysBetween(today, debt.dueDate))}${minimum}.` });
  } else if (dueDebts.length > 1) {
    alerts.push({ kind: "info", text: `${dueDebts.length} debt payments are due within ${DUE_SOON_DAYS} days: ${nameList(dueDebts)}.` });
  }

  return alerts;
}

export function buildAlerts({ month, transactions, budgets, investments = [], bills = [], debts = [], today = currentDate() }) {
  const alerts = [];
  budgets.filter((b) => b.month === month).forEach((budget) => {
    const actual = transactions.filter((t) => t.month === month && t.mode === budget.mode && t.type === budget.type).reduce((sum, t) => sum + Number(t.amount || 0), 0);
    if (actual >= Number(budget.plannedAmount)) alerts.push({ kind: "warning", text: `${budget.type} is ${actual > budget.plannedAmount ? "over" : "at"} its ₹${budget.plannedAmount.toLocaleString("en-IN")} budget.` });
  });
  // An investment you added yourself (SIP, top-up or valuation refresh) is an entry too. Rows the
  // monthly auto-SIP job created don't count, so the reminder still fires if you've logged nothing.
  const hasInvestmentEntry = investments.some((i) => !i.autoSipMonth && String(i.date || "").startsWith(month));
  if (!transactions.some((t) => t.month === month) && !hasInvestmentEntry) alerts.push({ kind: "info", text: `No entries have been recorded for ${month} yet.` });
  const recurringTemplates = transactions.filter((t) => t.recurring && t.month < month);
  const generatedForMonth = new Set(transactions.filter((t) => t.month === month && t.generatedFrom).map((t) => String(t.generatedFrom)));
  const pendingRecurring = recurringTemplates.filter((t) => !generatedForMonth.has(String(t.id || t._id)));
  if (pendingRecurring.length) alerts.push({ kind: "info", text: `${pendingRecurring.length} recurring ${pendingRecurring.length === 1 ? "entry is" : "entries are"} ready to generate for ${month}.` });
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
  const latest = new Map();
  investments.filter((i) => i.type === "Status").forEach((i) => { if (!latest.has(i.fund) || i.date > latest.get(i.fund).date) latest.set(i.fund, i); });
  latest.forEach((item) => { if (new Date(item.date) < cutoff) alerts.push({ kind: "info", text: `${item.fund} has not had a valuation refresh in 30 days.` }); });
  // Time-sensitive money owed goes first, and is added on top of (not instead of)
  // the five existing alerts, so nothing that showed before is pushed out.
  return [...buildObligationAlerts({ bills, debts, today }), ...alerts.slice(0, 5)];
}

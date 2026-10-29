// Pure helpers for debts and bills. Nothing here touches the network or React,
// so the dashboard, the alerts and the Obligations page all share one set of
// rules (and one set of unit tests).

export const DUE_SOON_DAYS = 7;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n) => String(n).padStart(2, "0");

// Parses "YYYY-MM-DD" and rejects impossible dates such as 2026-02-31.
function parseISO(iso) {
  const match = ISO_DATE.exec(String(iso || ""));
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return { y, m, d };
}

export function isValidISODate(iso) {
  return parseISO(iso) !== null;
}

// Whole days from `fromISO` to `toISO` (negative when `toISO` is earlier).
// Uses UTC midnights so daylight-saving changes can never skew the result.
export function daysBetween(fromISO, toISO) {
  const a = parseISO(fromISO);
  const b = parseISO(toISO);
  if (!a || !b) return NaN;
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}

// Adds whole months to a date, clamping to the last day of the target month
// (31 Jan + 1 month = 28/29 Feb). Returns the input unchanged if it isn't a
// valid date, so callers never write "NaN-NaN-NaN" to the database.
export function addMonthsClamped(iso, months = 1) {
  const p = parseISO(iso);
  if (!p) return iso;
  const total = p.m - 1 + months;
  const y = p.y + Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return `${y}-${pad(m + 1)}-${pad(Math.min(p.d, lastDay))}`;
}

export const isUnpaid = (item) => Boolean(item) && item.status !== "paid";

// "overdue" | "soon" | "later" | "none", plus the day difference.
export function classifyDue(dueDate, today, soonDays = DUE_SOON_DAYS) {
  const days = daysBetween(today, dueDate);
  if (Number.isNaN(days)) return { state: "none", days: NaN };
  if (days < 0) return { state: "overdue", days };
  if (days <= soonDays) return { state: "soon", days };
  return { state: "later", days };
}

const byDueDate = (a, b) => String(a.dueDate).localeCompare(String(b.dueDate));
const sumAmount = (items) => items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

// Splits unpaid bills into overdue and due-within-`soonDays`, soonest first.
export function summarizeBills(bills = [], today, soonDays = DUE_SOON_DAYS) {
  const overdue = [];
  const dueSoon = [];
  bills.filter(isUnpaid).forEach((bill) => {
    const { state } = classifyDue(bill.dueDate, today, soonDays);
    if (state === "overdue") overdue.push(bill);
    else if (state === "soon") dueSoon.push(bill);
  });
  overdue.sort(byDueDate);
  dueSoon.sort(byDueDate);
  return { overdue, dueSoon, overdueTotal: sumAmount(overdue), dueSoonTotal: sumAmount(dueSoon) };
}

export const activeDebts = (debts = []) => debts.filter(isUnpaid);

export function totalDebtOutstanding(debts = []) {
  return activeDebts(debts).reduce((sum, debt) => sum + (Number(debt.outstandingAmount) || 0), 0);
}

export function monthlyDebtPayments(debts = []) {
  return activeDebts(debts).reduce((sum, debt) => sum + (Number(debt.minimumPayment) || 0), 0);
}

// Debts with a recorded due date falling today..soonDays from now. Past due
// dates are deliberately ignored: nothing used to roll that field forward, so
// an old date is more likely stale than a genuinely missed payment.
export function debtsDueSoon(debts = [], today, soonDays = DUE_SOON_DAYS) {
  return activeDebts(debts)
    .filter((debt) => {
      const { state } = classifyDue(debt.dueDate, today, soonDays);
      return state === "soon";
    })
    .sort(byDueDate);
}

// 0-100 score for the health card, or null when there is nothing to score
// (no active debt and no overdue bill) so users without obligations keep the
// exact score they had before.
export function debtHealthScore({ debts = [], monthlyIncome = 0, overdueBillCount = 0 } = {}) {
  const active = activeDebts(debts);
  if (!active.length && !overdueBillCount) return null;
  let score = 100;
  const minimums = monthlyDebtPayments(debts);
  if (minimums > 0) {
    // Minimum payments eating 40% of income or more scores zero.
    score -= monthlyIncome > 0 ? Math.min(100, (minimums / monthlyIncome) * 250) : 50;
  } else if (active.length) {
    score -= 10;
  }
  score -= 15 * overdueBillCount;
  return Math.max(0, Math.min(100, score));
}

// The patch to send when a bill is marked paid. A recurring bill stays active
// and moves to next month; a one-off bill is closed.
export function markBillPaidPatch(bill) {
  if (bill.recurring) return { dueDate: addMonthsClamped(bill.dueDate, 1) };
  return { status: "paid" };
}

// The patch to send after a payment against a debt. Never overpays: the amount
// is capped at what is outstanding, and the debt closes when it reaches zero.
export function applyDebtPayment(debt, amount, { advanceDueDate = false } = {}) {
  const outstanding = Number(debt.outstandingAmount) || 0;
  const paid = Math.min(Math.max(Number(amount) || 0, 0), outstanding);
  const remaining = Math.round((outstanding - paid) * 100) / 100;
  const cleared = remaining <= 0;
  const patch = { outstandingAmount: cleared ? 0 : remaining, status: cleared ? "paid" : "active" };
  if (!cleared && advanceDueDate && isValidISODate(debt.dueDate)) patch.dueDate = addMonthsClamped(debt.dueDate, 1);
  return { patch, paid, remaining: patch.outstandingAmount, cleared };
}

// Entry category suggested for a bill payment: its own category, unless that
// is the unhelpful default "General", in which case its name.
export function defaultBillEntryType(bill) {
  const category = String(bill.category || "").trim();
  return category && category.toLowerCase() !== "general" ? category : String(bill.name || "").trim();
}

const norm = (value) => String(value || "").trim().toLowerCase();

// Finds an existing Needs/Spending entry that looks like the payment being
// recorded (same month, same amount, matching name), so the confirm step can
// warn before the same money is counted twice.
export function findSimilarEntry(transactions = [], { month, amount, names = [] }) {
  const wanted = names.map(norm).filter((name) => name.length >= 3);
  if (!month || !wanted.length) return undefined;
  return transactions.find((t) => {
    if (t.month !== month || (t.mode !== "Needs" && t.mode !== "Spending")) return false;
    if (Math.abs((Number(t.amount) || 0) - (Number(amount) || 0)) > 0.5) return false;
    const haystacks = [norm(t.type), norm(t.merchant)].filter((h) => h.length >= 3);
    return haystacks.some((h) => wanted.some((w) => h === w || h.includes(w) || w.includes(h)));
  });
}

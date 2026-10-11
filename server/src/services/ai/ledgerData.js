import Transaction from "../../models/Transaction.js";
import Budget from "../../models/Budget.js";
import Investment from "../../models/Investment.js";
import Valuation from "../../models/Valuation.js";
import { buildSipScenarios } from "./calculators.js";

const round = (value) => Math.round((Number(value) || 0) * 100) / 100;
const monthKey = (date) => date.toISOString().slice(0, 7);

function monthRange(count = 6) {
  const months = [];
  const today = new Date();

  for (let i = count - 1; i >= 0; i -= 1) {
    months.push(monthKey(
      new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1))
    ));
  }

  return months;
}

function totalForMonth(rows, month) {
  const totals = { Income: 0, Needs: 0, Savings: 0, Spending: 0 };

  rows.filter((row) => row.month === month).forEach((row) => {
    totals[row.mode] = round(totals[row.mode] + Number(row.amount || 0));
  });

  return {
    ...totals,
    cashFlow: round(totals.Income - totals.Needs - totals.Savings - totals.Spending),
    savingsRate: totals.Income
      ? round((totals.Savings / totals.Income) * 100)
      : null,
  };
}

// Same rule as client/src/lib/investments.js, so Ledger AI quotes the same numbers the app shows:
// the latest Status snapshot is the baseline, and money added AFTER the snapshot's date
// (manual or auto SIP) is added on top at cost. A contribution dated on the snapshot's own
// date is treated as already included in it.
export function summarizeInvestments(rows) {
  const byFund = new Map();

  for (const row of rows) {
    const current = byFund.get(row.fund) || {
      fund: row.fund,
      monthly: 0,
      assetClass: row.assetClass || "Equity",
      status: null,
      contributions: [],
    };

    if (row.type === "Status") {
      if (!current.status || String(row.date) >= String(current.status.date)) {
        current.status = row;
      }
    } else {
      current.contributions.push(row);
      current.monthly += Number(row.monthly || 0);
    }

    byFund.set(row.fund, current);
  }

  const funds = [...byFund.values()].map((fund) => {
    const status = fund.status;
    const counted = status
      ? fund.contributions.filter((row) => String(row.date || "") > String(status.date || ""))
      : fund.contributions;
    const addedInvested = counted.reduce((sum, row) => sum + Number(row.invested || 0), 0);
    const addedValue = counted.reduce((sum, row) => sum + Number(row.currentValue || 0), 0);

    const invested = round((status ? Number(status.invested || 0) : 0) + addedInvested);
    const currentValue = round((status ? Number(status.currentValue || 0) : 0) + addedValue);

    return {
      fund: fund.fund,
      assetClass: status?.assetClass || fund.assetClass,
      invested,
      currentValue,
      gain: round(currentValue - invested),
      returnPercent: invested
        ? round(((currentValue - invested) / invested) * 100)
        : null,
      monthly: round(fund.monthly),
      xirr: status?.xirr ?? null,
    };
  });

  const totals = funds.reduce((sum, fund) => ({
    invested: sum.invested + fund.invested,
    currentValue: sum.currentValue + fund.currentValue,
    monthly: sum.monthly + fund.monthly,
  }), { invested: 0, currentValue: 0, monthly: 0 });

  return {
    totals: {
      invested: round(totals.invested),
      currentValue: round(totals.currentValue),
      monthly: round(totals.monthly),
      gain: round(totals.currentValue - totals.invested),
      returnPercent: totals.invested
        ? round(((totals.currentValue - totals.invested) / totals.invested) * 100)
        : null,
    },
    funds: funds.sort((a, b) => b.currentValue - a.currentValue).slice(0, 12),
  };
}

export async function buildLedgerSnapshot(userId) {
  const months = monthRange();
  const activeMonth = months.at(-1);

  const [transactions, budgets, investments, valuations] = await Promise.all([
    Transaction.find({ user: userId, month: { $gte: months[0] } })
      .select("mode type amount month recurring frequency")
      .lean(),

    Budget.find({ user: userId, month: activeMonth })
      .select("mode type plannedAmount month")
      .lean(),

    Investment.find({ user: userId })
      .sort({ date: -1 })
      .limit(250)
      .select("fund type monthly invested currentValue date assetClass xirr benchmarkReturn")
      .lean(),

    Valuation.find({ user: userId })
      .sort({ month: -1 })
      .limit(50)
      .select("month instrument value")
      .lean(),
  ]);

  const currentTotals = totalForMonth(transactions, activeMonth);

  const spendingCategories = transactions
    .filter((row) => row.month === activeMonth && row.mode !== "Income")
    .reduce((map, row) => {
      const key = `${row.mode}: ${row.type}`;
      map.set(key, (map.get(key) || 0) + Number(row.amount || 0));
      return map;
    }, new Map());

  const topSpending = [...spendingCategories.entries()]
    .map(([category, amount]) => ({ category, amount: round(amount) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);

  const budgetVsActual = budgets.map((budget) => {
    const actual = round(spendingCategories.get(`${budget.mode}: ${budget.type}`) || 0);

    return {
      mode: budget.mode,
      type: budget.type,
      plannedAmount: round(budget.plannedAmount),
      actual,
      variance: round(actual - Number(budget.plannedAmount || 0)),
    };
  });

  const investmentSummary = summarizeInvestments(investments);

  return {
    currency: "INR",
    dataWindow: `${months[0]} to ${activeMonth}`,
    monthlyHistory: months.map((month) => ({
      month,
      ...totalForMonth(transactions, month),
    })),
    currentMonth: {
      month: activeMonth,
      ...currentTotals,
      topSpending,
    },
    budgetVsActual,
    investments: investmentSummary,
    sipProjectionIllustration: buildSipScenarios(investmentSummary.totals.monthly),
    latestValuations: valuations.map((row) => ({
      month: row.month,
      instrument: row.instrument,
      value: round(row.value),
    })),
  };
}

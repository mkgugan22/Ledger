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

function summarizeInvestments(rows) {
  const byFund = new Map();

  for (const row of rows) {
    const current = byFund.get(row.fund) || {
      fund: row.fund,
      invested: 0,
      currentValue: 0,
      monthly: 0,
      assetClass: row.assetClass || "Equity",
      status: null,
    };

    if (row.type === "Status") {
      if (!current.status || String(row.date) >= String(current.status.date)) {
        current.status = row;
      }
    } else {
      current.invested += Number(row.invested || 0);
      current.currentValue += Number(row.currentValue || 0);
      current.monthly += Number(row.monthly || 0);
    }

    byFund.set(row.fund, current);
  }

  const funds = [...byFund.values()].map((fund) => {
    const source = fund.status || fund;
    const invested = round(source.invested);
    const currentValue = round(source.currentValue);

    return {
      fund: fund.fund,
      assetClass: source.assetClass || fund.assetClass,
      invested,
      currentValue,
      gain: round(currentValue - invested),
      returnPercent: invested
        ? round(((currentValue - invested) / invested) * 100)
        : null,
      monthly: round(fund.monthly),
      xirr: source.xirr ?? null,
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

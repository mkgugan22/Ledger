import { useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { motion } from "framer-motion";
import {
  ArrowDownLeft, ArrowUpRight, Wallet, PiggyBank, TrendingUp, TrendingDown,
  CreditCard, Sparkles, ReceiptText, ChartNoAxesCombined,
} from "lucide-react";
import PageHeader from "../shared/PageHeader.jsx";
import MonthPicker from "../shared/MonthPicker.jsx";
import EmptyState from "../shared/EmptyState.jsx";
import { MODE_COLOR } from "../../lib/constants.js";
import { fmtINR, monthLabel } from "../../lib/format.js";
import Alerts from "./Alerts.jsx";
import AnimatedNumber from "../../lib/motion/AnimatedNumber.jsx";
import DashboardCommandCenter from "./DashboardCommandCenter.jsx";
import "./dashboard-refresh.css";

const money = (value) => `₹${fmtINR(Math.round(Number(value) || 0))}`;

function displayDate(transaction) {
  const value = transaction.date || transaction.createdAt;
  if (!value) return transaction.month || "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? String(value)
    : parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function Dashboard({
  selectedMonth,
  setSelectedMonth,
  totals,
  categoryChartData,
  alerts = [],
  transactions = [],
  investments = [],
  bonds = [],
  valuations = [],
  monthBudgets = [],
  debts = [],
  bills = [],
}) {
  const cards = [
    { label: "Income", value: totals.Income, icon: TrendingUp, color: MODE_COLOR.Income, foot: "Money received", tint: "rgba(63,151,119,.16)" },
    { label: "Needs", value: totals.Needs, icon: Wallet, color: MODE_COLOR.Needs, foot: "Essential expenses", tint: "rgba(205,151,78,.16)" },
    { label: "Savings", value: totals.Savings, icon: PiggyBank, color: MODE_COLOR.Savings, foot: "Set aside this month", tint: "rgba(103,158,214,.17)" },
    { label: "Spending", value: totals.Spending, icon: TrendingDown, color: MODE_COLOR.Spending, foot: "Flexible expenses", tint: "rgba(214,105,92,.15)" },
  ];

  const monthTransactions = useMemo(
    () => transactions.filter((transaction) => transaction.month === selectedMonth)
      .sort((a, b) => String(b.date || b.createdAt || "").localeCompare(String(a.date || a.createdAt || ""))),
    [transactions, selectedMonth],
  );
  const recentTransactions = monthTransactions.slice(0, 5);
  const trend = useMemo(() => {
    const months = [...new Set(transactions.map((transaction) => transaction.month).filter(Boolean))].sort().slice(-7);
    return months.map((month) => {
      const monthRows = transactions.filter((transaction) => transaction.month === month);
      const total = (mode) => monthRows.filter((transaction) => transaction.mode === mode)
        .reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0);
      return { month: monthLabel(month).split(" ")[0], income: total("Income"), spending: total("Needs") + total("Spending"), savings: total("Savings") };
    });
  }, [transactions]);
  const totalAssets = useMemo(() => {
    const investmentTotal = investments.reduce((sum, item) => sum + (Number(item.currentValue ?? item.amount ?? item.investedAmount) || 0), 0);
    const bondTotal = bonds.reduce((sum, item) => sum + (Number(item.currentValue) || 0), 0);
    const valuationTotal = valuations.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
    return investmentTotal + bondTotal + valuationTotal;
  }, [investments, bonds, valuations]);
  const maxCategory = Math.max(1, ...categoryChartData.map((item) => Number(item.amount) || 0));
  const totalOutflow = Number(totals.Needs || 0) + Number(totals.Spending || 0);
  const net = Number(totals.inHand ?? (Number(totals.Income || 0) - totalOutflow - Number(totals.Savings || 0)));

  return (
    <div className="lg-dashboard">
      <div className="lg-dashboard-head">
        <div>
          <div className="lg-dashboard-eyebrow"><Sparkles size={13} className="me-1" /> Your money, in focus</div>
          <h1 className="lg-dashboard-title">Dashboard overview</h1>
          <div className="lg-dashboard-subtitle">A clear view of your financial life · {monthLabel(selectedMonth)}</div>
        </div>
        <MonthPicker value={selectedMonth} onChange={setSelectedMonth} />
      </div>

      <div className="lg-dashboard-kpis">
        {cards.map((card, index) => (
          <motion.div key={card.label} className="lg-dashboard-kpi" style={{ "--kpi-tint": card.tint }} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .42, delay: index * .07 }}>
            <div className="lg-dashboard-kpi-label"><span>{card.label}</span><card.icon size={17} color={card.color} /></div>
            <div className="lg-dashboard-kpi-value" style={{ color: card.color }}>₹<AnimatedNumber value={card.value} formatter={fmtINR} /></div>
            <div className="lg-dashboard-kpi-foot">{card.foot}</div>
          </motion.div>
        ))}
      </div>

      <div className="lg-dashboard-grid">
        <motion.section className="lg-dashboard-panel" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .45, delay: .12 }}>
          <div className="lg-dashboard-panel-head">
            <div><h2 className="lg-dashboard-panel-title">Cash flow activity</h2><div className="lg-dashboard-panel-subtitle">Income, outflow and savings over recent months</div></div>
            <span className="lg-dashboard-pill"><ChartNoAxesCombined size={13} /> 7-month view</span>
          </div>
          <div className="lg-dashboard-panel-body">
            {trend.length ? <div className="lg-dashboard-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} barGap={4} barCategoryGap="24%" margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 5" stroke="var(--lg-rule)" vertical={false} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "var(--lg-text-dim)", fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--lg-text-dim)", fontSize: 10 }} tickFormatter={(value) => value >= 1000 ? `₹${Math.round(value / 1000)}k` : `₹${value}`} />
                  <Tooltip formatter={(value) => money(value)} contentStyle={{ background: "var(--lg-surface)", color: "var(--lg-text)", border: "1px solid var(--lg-rule)", borderRadius: 12 }} cursor={{ fill: "var(--lg-page-dim)", opacity: .45 }} />
                  <Bar dataKey="income" name="Income" fill={MODE_COLOR.Income || "#5da98a"} radius={[5, 5, 0, 0]} animationDuration={1000} />
                  <Bar dataKey="spending" name="Outflow" fill={MODE_COLOR.Spending || "#d97869"} radius={[5, 5, 0, 0]} animationDuration={1150} />
                  <Bar dataKey="savings" name="Savings" fill={MODE_COLOR.Savings || "#7ba6df"} radius={[5, 5, 0, 0]} animationDuration={1300} />
                </BarChart>
              </ResponsiveContainer>
            </div> : <EmptyState text="Add a few transactions to reveal your cash-flow trend." />}
            <div className="d-flex flex-wrap gap-2 mt-2">
              <span className="lg-dashboard-pill"><span style={{ width: 7, height: 7, borderRadius: 99, background: MODE_COLOR.Income, display: "inline-block" }} /> Income</span>
              <span className="lg-dashboard-pill"><span style={{ width: 7, height: 7, borderRadius: 99, background: MODE_COLOR.Spending, display: "inline-block" }} /> Outflow</span>
              <span className="lg-dashboard-pill"><span style={{ width: 7, height: 7, borderRadius: 99, background: MODE_COLOR.Savings, display: "inline-block" }} /> Savings</span>
            </div>
          </div>
        </motion.section>

        <motion.section className="lg-dashboard-panel lg-dashboard-balance" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: .48, delay: .18 }}>
          <div className="lg-dashboard-panel-head">
            <div><h2 className="lg-dashboard-panel-title">Financial snapshot</h2><div className="lg-dashboard-panel-subtitle">Your month at a glance</div></div>
            <Wallet size={19} />
          </div>
          <div className="lg-dashboard-balance-main">
            <div className="lg-dashboard-balance-label">Estimated tracked assets</div>
            <div className="lg-dashboard-balance-value">{money(totalAssets)}</div>
            <div className="d-flex align-items-center gap-2 small"><span style={{ display: "inline-flex", background: "rgba(143,208,184,.16)", color: "#9edfc4", borderRadius: 99, padding: ".28rem .55rem", fontSize: ".72rem" }}><TrendingUp size={13} className="me-1" /> Portfolio overview</span></div>
            <div className="lg-dashboard-balance-divider" />
            <div className="lg-dashboard-balance-row"><span>Income this month</span><strong>{money(totals.Income)}</strong></div>
            <div className="lg-dashboard-balance-row"><span>Expenses this month</span><strong>{money(totalOutflow)}</strong></div>
            <div className="lg-dashboard-balance-row"><span>Savings this month</span><strong>{money(totals.Savings)}</strong></div>
            <div className="lg-dashboard-balance-divider" />
            <div className="lg-dashboard-balance-row"><span>Remaining after tracked outflow</span><strong style={{ color: net >= 0 ? "#9edfc4" : "#ffb4a8" }}>{money(net)}</strong></div>
            <div className="lg-dashboard-panel-subtitle mt-3">Asset total is an estimate based on records currently tracked in Ledger, not a live bank balance.</div>
          </div>
        </motion.section>
      </div>

      <div className="lg-dashboard-grid">
        <motion.section className="lg-dashboard-panel" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .42, delay: .2 }}>
          <div className="lg-dashboard-panel-head">
            <div><h2 className="lg-dashboard-panel-title">Recent transactions</h2><div className="lg-dashboard-panel-subtitle">Latest entries for {monthLabel(selectedMonth)}</div></div>
            <span className="lg-dashboard-pill"><ReceiptText size={13} /> {monthTransactions.length} entries</span>
          </div>
          <div className="lg-dashboard-panel-body pt-0">
            {recentTransactions.length ? <div className="table-responsive">
              <table className="lg-dashboard-transactions">
                <thead><tr><th>Transaction</th><th>Date</th><th>Type</th><th className="text-end">Amount</th></tr></thead>
                <tbody>{recentTransactions.map((transaction) => {
                  const incoming = transaction.mode === "Income";
                  const tone = MODE_COLOR[transaction.mode] || "var(--lg-text)";
                  return <tr key={transaction.id || transaction._id || `${transaction.date}-${transaction.type}-${transaction.amount}`}>
                    <td><span className="lg-dashboard-tx-icon" style={{ color: tone }}>{incoming ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</span><span className="fw-semibold">{transaction.type || transaction.description || "Entry"}</span></td>
                    <td className="text-secondary text-nowrap">{displayDate(transaction)}</td>
                    <td><span className="lg-dashboard-status" style={{ color: tone }}>{transaction.mode || "Other"}</span></td>
                    <td className="text-end fw-semibold text-nowrap" style={{ color: tone }}>{incoming ? "+" : "−"}{money(transaction.amount)}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div> : <EmptyState text="No transactions for this month yet. Add an entry to see it here." />}
          </div>
        </motion.section>

        <motion.section className="lg-dashboard-panel" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .42, delay: .26 }}>
          <div className="lg-dashboard-panel-head">
            <div><h2 className="lg-dashboard-panel-title">Expense categories</h2><div className="lg-dashboard-panel-subtitle">Where your money is going this month</div></div>
            <CreditCard size={18} />
          </div>
          <div className="lg-dashboard-panel-body">
            {categoryChartData.length ? <>
              <div className="d-flex align-items-baseline justify-content-between gap-2 mb-3"><span className="text-secondary small">Tracked outflow</span><strong>{money(categoryChartData.reduce((sum, item) => sum + (Number(item.amount) || 0), 0))}</strong></div>
              {categoryChartData.slice(0, 6).map((item, index) => <div className="lg-dashboard-category" key={item.name}>
                <div className="lg-dashboard-category-name"><span className="d-inline-block rounded-circle me-2" style={{ width: 7, height: 7, background: MODE_COLOR[item.mode] || ["#87a8ff", "#72c6ac", "#d7a76e", "#d98282", "#a99be8", "#68b7c7"][index % 6] }} />{item.name}</div>
                <div className="lg-dashboard-category-amount">{money(item.amount)}</div>
                <div className="lg-dashboard-category-track"><div className="lg-dashboard-category-fill" style={{ width: `${Math.max(2, Math.min(100, (Number(item.amount) / maxCategory) * 100))}%`, background: MODE_COLOR[item.mode] || ["#87a8ff", "#72c6ac", "#d7a76e", "#d98282", "#a99be8", "#68b7c7"][index % 6], animationDelay: `${index * 80}ms` }} /></div>
              </div>)}
            </> : <EmptyState text="Your category breakdown will appear after you record expenses." />}
          </div>
        </motion.section>
      </div>

      <Alerts alerts={alerts} />

      <motion.div className="lg-inhand-bar d-flex justify-content-between align-items-center px-4 py-3 mb-4" initial={{ opacity: 0, scale: .985 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .35, delay: .25 }}>
        <span className="font-serif">In hand this month</span>
        <span className="font-mono fw-bold fs-4" style={{ color: net >= 0 ? MODE_COLOR.Income : MODE_COLOR.Spending }}>₹<AnimatedNumber value={net} formatter={fmtINR} /></span>
      </motion.div>

      <div className="lg-dashboard-details">
        <PageHeader title="Financial intelligence" subtitle="Deeper trends, health score, budgets and personalized insights" />
        <DashboardCommandCenter
          selectedMonth={selectedMonth}
          transactions={transactions}
          investments={investments}
          bonds={bonds}
          valuations={valuations}
          monthBudgets={monthBudgets}
          debts={debts}
          bills={bills}
        />
      </div>
    </div>
  );
}

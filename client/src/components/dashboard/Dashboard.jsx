import { useMemo, useState } from "react";
import { Card, Row, Col } from "react-bootstrap";
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip } from "recharts";
import { motion } from "framer-motion";
import { NavLink } from "react-router-dom";
import {
  ArrowDownLeft, ArrowRight, ArrowUpRight, Bell, Bot, Search, ShieldCheck,
  TrendingDown, TrendingUp, Wallet, PiggyBank, ReceiptText, Sparkles,
} from "lucide-react";
import MonthPicker from "../shared/MonthPicker.jsx";
import EmptyState from "../shared/EmptyState.jsx";
import { MODE_COLOR } from "../../lib/constants.js";
import { fmtINR, monthLabel } from "../../lib/format.js";
import Alerts from "./Alerts.jsx";
import AnimatedNumber from "../../lib/motion/AnimatedNumber.jsx";
import DashboardCommandCenter from "./DashboardCommandCenter.jsx";
import { buildFundPositions, sumFundPositions } from "../../lib/investments.js";
import { totalDebtOutstanding } from "../../lib/obligations.js";

const money = (value) => `₹${fmtINR(Math.round(Number(value) || 0))}`;

function latestValues(items, key, value) {
  const latest = new Map();
  items.forEach((item) => {
    const identity = item[key];
    if (!identity) return;
    const previous = latest.get(identity);
    if (!previous || String(item.month || item.date || "").localeCompare(String(previous.month || previous.date || "")) > 0) {
      latest.set(identity, item);
    }
  });
  return [...latest.values()].reduce((sum, item) => sum + (Number(item[value]) || 0), 0);
}

function transactionDate(item) {
  const value = item.date || `${item.month}-01`;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function Dashboard({
  selectedMonth,
  setSelectedMonth,
  totals,
  categoryChartData = [],
  alerts = [],
  transactions = [],
  investments = [],
  bonds = [],
  valuations = [],
  monthBudgets = [],
  debts = [],
  bills = [],
}) {
  const [search, setSearch] = useState("");

  const summaryCards = [
    { label: "Income", value: totals.Income, icon: TrendingUp, tone: "Income", note: "Money received" },
    { label: "Needs", value: totals.Needs, icon: Wallet, tone: "Needs", note: "Essential expenses" },
    { label: "Savings", value: totals.Savings, icon: PiggyBank, tone: "Savings", note: "Set aside" },
    { label: "Spending", value: totals.Spending, icon: TrendingDown, tone: "Spending", note: "Flexible expenses" },
  ];

  const recentTransactions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...transactions]
      .filter((item) => item.month === selectedMonth)
      .filter((item) => !query || [item.type, item.mode, item.merchant, item.note, item.paymentMethod].some((value) => String(value || "").toLowerCase().includes(query)))
      .sort((a, b) => String(b.date || b.month || "").localeCompare(String(a.date || a.month || "")))
      .slice(0, 5);
  }, [transactions, selectedMonth, search]);

  const monthlyTrend = useMemo(() => {
    const months = [...new Set(transactions.map((item) => item.month).filter(Boolean))].sort().slice(-6);
    return months.map((month) => {
      const monthRows = transactions.filter((item) => item.month === month);
      const income = monthRows.filter((item) => item.mode === "Income").reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const outflow = monthRows.filter((item) => item.mode !== "Income").reduce((sum, item) => sum + Number(item.amount || 0), 0);
      return { month: monthLabel(month).slice(0, 3), income, outflow };
    });
  }, [transactions]);

  const investmentValue = useMemo(() => sumFundPositions(buildFundPositions(investments)).current, [investments]);
  const bondValue = useMemo(() => latestValues(bonds, "issuer", "currentValue"), [bonds]);
  const savingsValue = useMemo(() => latestValues(valuations, "instrument", "value"), [valuations]);
  const debtValue = useMemo(() => totalDebtOutstanding(debts), [debts]);
  const totalBalance = investmentValue + bondValue + savingsValue - debtValue;
  const assetValue = investmentValue + bondValue + savingsValue;

  const totalOutflow = totals.Needs + totals.Spending;
  const categories = categoryChartData
    .filter((item) => item.mode !== "Income")
    .slice(0, 5)
    .map((item) => ({ ...item, share: totalOutflow ? Math.min(100, (item.amount / totalOutflow) * 100) : 0 }));

  return (
    <div className="lg-dashboard">
      <motion.div className="lg-dashboard-topbar" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <NavLink to="/" className="lg-dashboard-brand" aria-label="Ledger dashboard">
          <span className="lg-dashboard-brand-mark"><Wallet size={18} /></span>
          <span>Ledger</span>
        </NavLink>
        <label className="lg-dashboard-search">
          <Search size={16} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this month's transactions..." aria-label="Search dashboard transactions" />
          <kbd>/</kbd>
        </label>
        <div className="lg-dashboard-top-actions">
          <NavLink to="/ledger-ai" className="lg-ai-shortcut"><Bot size={16} /><span>AI Assistant</span></NavLink>
          <NavLink to="/entries" className="lg-notification-link" aria-label={`${alerts.length} notifications`} title="Open entries and alerts">
            <Bell size={17} />
            {alerts.length > 0 && <span className="lg-notification-count">{alerts.length > 9 ? "9+" : alerts.length}</span>}
          </NavLink>
        </div>
      </motion.div>

      <motion.header className="lg-dashboard-page-heading" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.06 }}>
        <div><div className="lg-dashboard-eyebrow">YOUR MONEY, IN FOCUS</div><h1>Dashboard Overview</h1><p>Financial security report · {monthLabel(selectedMonth)}</p></div>
        <div className="lg-dashboard-month-picker"><span>Reporting month</span><MonthPicker value={selectedMonth} onChange={setSelectedMonth} /></div>
      </motion.header>

      <Row className="g-3 mb-3 lg-overview-grid">
        <Col xl={7}>
          <motion.div className="h-100" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.48, delay: 0.1 }}>
            <Card className="lg-dashboard-panel lg-statistics-panel h-100"><Card.Body>
              <div className="lg-dashboard-panel-heading"><div><h2>Statistics</h2><p>Monthly income and outflow trend</p></div><span className="lg-panel-icon"><TrendingUp size={17} /></span></div>
              <div className="lg-statistics-content">
                <div className="lg-statistics-summary">
                  <span className="lg-overline">TOTAL INCOME</span>
                  <strong><AnimatedNumber value={totals.Income} formatter={fmtINR} /></strong>
                  <span className="lg-statistics-caption"><span className="lg-dot lg-dot-income" /> Current month</span>
                  <div className="lg-chart-legend"><span><i className="lg-dot lg-dot-income" />Income</span><span><i className="lg-dot lg-dot-spending" />Outflow</span></div>
                </div>
                <div className="lg-statistics-chart">
                  {monthlyTrend.length ? <ResponsiveContainer width="100%" height={168}><BarChart data={monthlyTrend} barGap={5} barCategoryGap="24%"><XAxis dataKey="month" tick={{ fill: "var(--lg-text-dim)", fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip formatter={(value) => money(value)} contentStyle={{ background: "var(--lg-surface)", border: "1px solid var(--lg-rule)", borderRadius: 10, color: "var(--lg-text)" }} /><Bar dataKey="income" name="Income" fill="var(--lg-income)" radius={[6, 6, 0, 0]} animationDuration={950} /><Bar dataKey="outflow" name="Outflow" fill="var(--lg-accent)" radius={[6, 6, 0, 0]} animationDuration={1100} /></BarChart></ResponsiveContainer> : <div className="lg-dashboard-empty">Add transactions to see your monthly trend.</div>}
                </div>
              </div>
              <div className="lg-statistics-footer">{summaryCards.map(({ label, value, tone }) => <div key={label}><span>{label}</span><strong style={{ color: MODE_COLOR[tone] }}>{money(value)}</strong></div>)}</div>
            </Card.Body></Card>
          </motion.div>
        </Col>
        <Col xl={5}>
          <motion.div className="h-100" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.48, delay: 0.16 }}>
            <Card className="lg-dashboard-panel lg-balance-panel h-100"><Card.Body>
              <div className="lg-dashboard-panel-heading"><div><h2>Total Balance</h2><p>Your tracked financial position</p></div><span className="lg-panel-icon"><ShieldCheck size={17} /></span></div>
              <div className="lg-balance-main"><span>NET TRACKED WORTH</span><strong>₹<AnimatedNumber value={totalBalance} formatter={fmtINR} /></strong><div className="lg-balance-caption"><span className="lg-live-dot" /> Based on saved asset and debt records</div></div>
              <div className="lg-balance-breakdown">
                <div><span>Investments</span><strong>{money(investmentValue)}</strong></div>
                <div><span>Bonds</span><strong>{money(bondValue)}</strong></div>
                <div><span>Savings & assets</span><strong>{money(savingsValue)}</strong></div>
                <div><span>Outstanding debt</span><strong className="lg-debt-value">−{money(debtValue)}</strong></div>
              </div>
              <div className="lg-balance-actions"><NavLink to="/sip-growth"><TrendingUp size={15} /> View investments <ArrowUpRight size={14} /></NavLink><NavLink to="/add"><span className="lg-add-symbol">+</span> Add entry</NavLink></div>
            </Card.Body></Card>
          </motion.div>
        </Col>
      </Row>

      <Row className="g-3 mb-3 lg-overview-grid">
        <Col xl={7}>
          <motion.div className="h-100" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.48, delay: 0.22 }}>
            <Card className="lg-dashboard-panel h-100"><Card.Body>
              <div className="lg-dashboard-panel-heading"><div><h2>Transactions</h2><p>Latest activity · {monthLabel(selectedMonth)}</p></div><NavLink className="lg-panel-view-link" to="/entries">View all <ArrowRight size={14} /></NavLink></div>
              {recentTransactions.length ? <div className="lg-recent-transactions">
                <div className="lg-transaction-head"><span>Transaction</span><span>Date</span><span className="text-end">Amount</span><span>Status</span></div>
                {recentTransactions.map((item, index) => <motion.div className="lg-transaction-row" key={item.id || `${item.date}-${item.type}-${index}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.26 + index * 0.055 }}>
                  <div className="lg-transaction-name"><span className="lg-transaction-avatar" style={{ "--transaction-tone": MODE_COLOR[item.mode] || "var(--lg-accent)" }}>{item.mode === "Income" ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</span><span><strong>{item.type || "Transaction"}</strong><small>{item.merchant || item.mode}</small></span></div>
                  <span className="lg-transaction-date">{transactionDate(item)}</span>
                  <strong className="lg-transaction-amount" style={{ color: item.mode === "Income" ? MODE_COLOR.Income : "var(--lg-text)" }}>{item.mode === "Income" ? "+" : "−"}{money(item.amount)}</strong>
                  <span className={`lg-transaction-mode tone-${String(item.mode || "other").toLowerCase()}`}>{item.mode || "Recorded"}</span>
                </motion.div>)}
              </div> : <EmptyState text={search ? "No transactions match your search in this month." : "No transactions recorded for this month yet. Add an entry to see it here."} />}
              <div className="lg-transactions-footer"><span><ReceiptText size={14} /> Showing up to 5 recent records</span><NavLink to="/add">Create transaction <ArrowRight size={13} /></NavLink></div>
            </Card.Body></Card>
          </motion.div>
        </Col>
        <Col xl={5}>
          <motion.div className="h-100" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.48, delay: 0.28 }}>
            <Card className="lg-dashboard-panel h-100"><Card.Body>
              <div className="lg-dashboard-panel-heading"><div><h2>Expense Categories</h2><p>Where your money is going</p></div><span className="lg-panel-icon"><PiggyBank size={17} /></span></div>
              <div className="lg-category-total"><strong>{money(totalOutflow)}</strong><span>Total outflow this month</span></div>
              {categories.length ? <div className="lg-category-list">{categories.map((item, index) => <div className="lg-category-item" key={item.name}>
                <div className="lg-category-line"><span><i className={`lg-category-dot category-${index % 5}`} />{item.name}</span><strong>{money(item.amount)}</strong></div>
                <div className="lg-category-track"><motion.div className={`lg-category-fill category-fill-${index % 5}`} initial={{ width: 0 }} animate={{ width: `${item.share}%` }} transition={{ duration: 0.9, delay: 0.34 + index * 0.08 }} /></div>
              </div>)}</div> : <EmptyState text="Your expense categories will appear after you add transactions." />}
              <div className="lg-category-footer"><span><Sparkles size={14} /> {categories.length} categories tracked</span><NavLink to="/entries">Explore breakdown <ArrowRight size={13} /></NavLink></div>
            </Card.Body></Card>
          </motion.div>
        </Col>
      </Row>

      <Alerts alerts={alerts} />

      <motion.div className="lg-inhand-bar d-flex justify-content-between align-items-center px-4 py-3 mb-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.25 }}>
        <span><span className="lg-inhand-label">AVAILABLE CASH FLOW</span><span className="lg-inhand-caption">Income after needs, spending and savings</span></span>
        <strong className="font-mono" style={{ color: totals.inHand >= 0 ? MODE_COLOR.Income : MODE_COLOR.Spending }}>₹<AnimatedNumber value={totals.inHand} formatter={fmtINR} /></strong>
      </motion.div>

      <div className="lg-command-center-heading"><div><span>DEEPER FINANCIAL VIEW</span><h2>Financial Command Center</h2><p>Trends, health indicators and insights calculated from your saved Ledger records.</p></div></div>
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
  );
}

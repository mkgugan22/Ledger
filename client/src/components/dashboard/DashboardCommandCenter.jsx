import { useMemo, useState } from "react";
import { Card, Row, Col, ButtonGroup, Button, ProgressBar, Badge } from "react-bootstrap";
import { motion } from "framer-motion";
import { Activity, CalendarDays, CreditCard, PiggyBank, ShieldCheck, Target, TrendingUp, Wallet, ArrowUpRight, Sparkles } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { MODE_COLOR } from "../../lib/constants.js";
import { currentDate, fmtINR, monthLabel } from "../../lib/format.js";
import { buildFundPositions, sumFundPositions } from "../../lib/investments.js";
import { debtHealthScore, summarizeBills, totalDebtOutstanding } from "../../lib/obligations.js";
import { PERIODS, filterByPeriod, periodLabel } from "../../lib/periods.js";

const money = (v) => `₹${fmtINR(Math.round(Number(v) || 0))}`;

function sumByMode(list) {
  const t = { Income: 0, Needs: 0, Savings: 0, Spending: 0 };
  list.forEach((x) => { if (t[x.mode] !== undefined) t[x.mode] += Number(x.amount) || 0; });
  return t;
}

function latestValues(items, key, value) {
  const map = new Map();
  items.forEach((item) => {
    const k = item[key];
    if (!k) return;
    const old = map.get(k);
    if (!old || String(item.month || item.date || "").localeCompare(String(old.month || old.date || "")) > 0) map.set(k, item);
  });
  return [...map.values()].reduce((s, x) => s + (Number(x[value]) || 0), 0);
}

const cardMotion = {
  hidden: { opacity: 0, y: 18, scale: 0.985 },
  visible: { opacity: 1, y: 0, scale: 1 },
};

function Panel({ children, className = "", delay = 0 }) {
  return (
    <motion.div variants={cardMotion} initial="hidden" animate="visible" transition={{ duration: 0.48, delay, ease: [0.22, 1, 0.36, 1] }} whileHover={{ y: -3 }} className={`h-100 ${className}`}>
      <Card className="lg-card h-100 lg-dashboard-panel"><Card.Body>{children}</Card.Body></Card>
    </motion.div>
  );
}

export default function DashboardCommandCenter({
  selectedMonth,
  transactions = [],
  investments = [],
  bonds = [],
  valuations = [],
  monthBudgets = [],
  debts = [],
  bills = [],
}) {
  const [period, setPeriod] = useState("This Month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const today = currentDate();

  const { rows: periodTransactions, ratioRows, note: periodNote } = useMemo(
    () => filterByPeriod(transactions, { period, selectedMonth, customFrom, customTo, today }),
    [transactions, selectedMonth, period, customFrom, customTo, today],
  );
  const shortPeriod = ratioRows !== periodTransactions;
  const totals = useMemo(() => sumByMode(periodTransactions), [periodTransactions]);
  const netCashFlow = totals.Income - totals.Needs - totals.Spending - totals.Savings;
  const savingsRate = totals.Income ? (totals.Savings / totals.Income) * 100 : 0;
  const healthTotals = useMemo(() => (shortPeriod ? sumByMode(ratioRows) : totals), [shortPeriod, ratioRows, totals]);
  const healthSavingsRate = healthTotals.Income ? (healthTotals.Savings / healthTotals.Income) * 100 : 0;
  const healthCashFlow = healthTotals.Income - healthTotals.Needs - healthTotals.Spending - healthTotals.Savings;
  const investmentValue = useMemo(() => sumFundPositions(buildFundPositions(investments)).current, [investments]);
  const bondValue = latestValues(bonds, "issuer", "currentValue");
  const savingsValue = latestValues(valuations, "instrument", "value");
  const totalDebt = useMemo(() => totalDebtOutstanding(debts), [debts]);
  const netWorth = investmentValue + bondValue + savingsValue - totalDebt;
  const billSummary = useMemo(() => summarizeBills(bills, today), [bills, today]);
  const billsNeedingAttention = billSummary.overdue.length + billSummary.dueSoon.length;

  const emergencyCurrent = useMemo(() => {
    const emergency = valuations.filter((x) => /emergency/i.test(x.instrument || ""));
    if (!emergency.length) return 0;
    return Number(emergency.sort((a, b) => String(b.month).localeCompare(String(a.month)))[0].value) || 0;
  }, [valuations]);

  const emergencyTarget = useMemo(() => {
    const months = [...new Set(transactions.map((x) => x.month))].sort().slice(-3);
    if (!months.length) return 0;
    const total = months.reduce((sum, m) => {
      const t = sumByMode(transactions.filter((x) => x.month === m));
      return sum + t.Needs + t.Spending;
    }, 0);
    return (total / months.length) * 3;
  }, [transactions]);

  const budgetPlanned = monthBudgets.reduce((s, x) => s + (Number(x.plannedAmount) || 0), 0);
  const budgetActual = ratioRows.reduce((s, x) => s + (x.mode === "Income" ? 0 : Number(x.amount) || 0), 0);
  const budgetUsage = budgetPlanned ? Math.min(100, (budgetActual / budgetPlanned) * 100) : 0;
  const monthIncome = useMemo(() => sumByMode(transactions.filter((x) => x.month === selectedMonth)).Income, [transactions, selectedMonth]);
  const debtScore = debtHealthScore({ debts, monthlyIncome: monthIncome, overdueBillCount: billSummary.overdue.length });
  const baseHealth =
    Math.min(100, healthSavingsRate * 2) * 0.3 +
    (emergencyTarget ? Math.min(100, emergencyCurrent / emergencyTarget * 100) : 50) * 0.2 +
    (budgetPlanned ? Math.max(0, 100 - Math.max(0, budgetUsage - 80) * 5) : 70) * 0.2 +
    (investmentValue > 0 ? 90 : 40) * 0.15 +
    (healthCashFlow >= 0 ? 100 : 30) * 0.15;
  const healthScore = Math.round(Math.min(100, Math.max(0, debtScore === null ? baseHealth : baseHealth * 0.85 + debtScore * 0.15)));

  const monthlySeries = useMemo(() => {
    const months = [...new Set(transactions.map((x) => x.month).filter(Boolean))].sort().slice(-12);
    return months.map((month) => {
      const t = sumByMode(transactions.filter((x) => x.month === month));
      return { month: monthLabel(month), income: t.Income, expenses: t.Needs + t.Spending, savings: t.Savings, cashFlow: t.Income - t.Needs - t.Spending - t.Savings };
    });
  }, [transactions]);

  const categoryData = useMemo(() => {
    const map = new Map();
    periodTransactions.filter((x) => x.mode !== "Income").forEach((x) => map.set(x.type || "Other", (map.get(x.type || "Other") || 0) + Number(x.amount || 0)));
    return [...map].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 8);
  }, [periodTransactions]);

  const insights = useMemo(() => {
    const months = [...new Set(transactions.map((x) => x.month))].sort();
    const current = sumByMode(transactions.filter((x) => x.month === selectedMonth));
    const previousMonth = months[months.indexOf(selectedMonth) - 1];
    const previous = previousMonth ? sumByMode(transactions.filter((x) => x.month === previousMonth)) : null;
    const result = [];
    if (previous?.Income) {
      const nowRate = current.Savings / current.Income * 100;
      const oldRate = previous.Savings / previous.Income * 100;
      if (Math.abs(nowRate - oldRate) >= 2) result.push(`Your savings rate ${nowRate >= oldRate ? "improved" : "fell"} from ${oldRate.toFixed(0)}% to ${nowRate.toFixed(0)}%.`);
    }
    const top = categoryData[0];
    if (top && previousMonth) {
      const oldAmount = transactions.filter((x) => x.month === previousMonth && x.type === top.name && x.mode !== "Income").reduce((s, x) => s + Number(x.amount || 0), 0);
      if (oldAmount > 0) {
        const change = (top.amount - oldAmount) / oldAmount * 100;
        if (Math.abs(change) >= 15) result.push(`${top.name} expenses are ${Math.abs(change).toFixed(0)}% ${change > 0 ? "higher" : "lower"} than the previous month.`);
      }
    }
    if (investments.length) {
      const sipCount = new Set(investments.filter((x) => x.type === "SIP").map((x) => String(x.date || x.createdAt || "").slice(0, 7)).filter(Boolean)).size;
      if (sipCount >= 3) result.push(`Your SIP activity is recorded consistently across ${sipCount} months.`);
    }
    if (!result.length) result.push("Keep logging transactions to unlock stronger personalized trend insights.");
    return result.slice(0, 3);
  }, [transactions, selectedMonth, categoryData, investments]);

  const cards = [
    ["Net Cash Flow", money(netCashFlow), Activity, netCashFlow >= 0 ? "Income" : "Spending"],
    ["Savings Rate", `${savingsRate.toFixed(1)}%`, PiggyBank, "Savings"],
    ["Investment Value", money(investmentValue), TrendingUp, "Income"],
    ["Net Worth", money(netWorth), Wallet, netWorth < 0 ? "Spending" : "Income"],
    ["Emergency Fund", money(emergencyCurrent), ShieldCheck, emergencyCurrent >= emergencyTarget && emergencyTarget ? "Income" : "Needs"],
    ["Budget Usage", `${budgetUsage.toFixed(0)}%`, Target, budgetUsage > 100 ? "Spending" : "Needs"],
    ["Debt", money(totalDebt), CreditCard, "Needs"],
    ["Upcoming Bills", String(billsNeedingAttention), CalendarDays, billSummary.overdue.length ? "Spending" : "Needs"],
  ];

  return (
    <div className="lg-dashboard">
      <motion.section className="lg-dashboard-toolbar" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
        <div className="d-flex align-items-center gap-3">
          <div className="lg-dashboard-mark"><Wallet size={20} /></div>
          <div><div className="lg-dashboard-kicker">PERSONAL FINANCE · OVERVIEW</div><div className="lg-dashboard-heading">Dashboard Overview</div><div className="lg-dashboard-subtitle">{periodLabel(period, { selectedMonth, today, monthLabel })}</div></div>
        </div>
        <div className="d-flex flex-wrap align-items-center gap-2">
          <span className="lg-live-indicator"><span /> Live financial snapshot</span>
          <ButtonGroup size="sm" className="lg-period-switch">
            {PERIODS.map((p) => <Button key={p} variant={period === p ? "primary" : "outline-secondary"} onClick={() => setPeriod(p)}>{p}</Button>)}
          </ButtonGroup>
        </div>
        {periodNote && <div className="w-100 small text-secondary">{periodNote}</div>}
        {period === "Custom" && <div className="d-flex flex-wrap gap-2 w-100"><input className="form-control form-control-sm lg-date-input" type="month" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} aria-label="Custom period start" /><span className="align-self-center text-secondary">to</span><input className="form-control form-control-sm lg-date-input" type="month" value={customTo} onChange={(e) => setCustomTo(e.target.value)} aria-label="Custom period end" /></div>}
      </motion.section>

      <Row className="g-3 mb-3 lg-dashboard-stat-grid">
        {cards.map(([label, value, Icon, tone], index) => (
          <Col key={label} xs={6} md={4} xl={3}>
            <motion.div className="h-100" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42, delay: index * 0.045 }}>
              <Card className="lg-summary-card lg-dashboard-stat h-100"><Card.Body>
                <div className="d-flex justify-content-between align-items-start"><span className="lg-summary-label">{label}</span><span className="lg-dashboard-stat-icon" style={{ "--stat-tone": MODE_COLOR[tone] }}><Icon size={17} /></span></div>
                <div className="lg-summary-value font-mono mt-3">{value}</div>
                <div className="lg-dashboard-stat-foot"><span className="lg-stat-dot" style={{ "--stat-tone": MODE_COLOR[tone] }} /> Updated from saved records</div>
              </Card.Body></Card>
            </motion.div>
          </Col>
        ))}
      </Row>

      <Row className="g-3 mb-3">
        <Col xl={7}>
          <Panel delay={0.12}>
            <div className="lg-panel-heading"><div><div className="lg-panel-title">Cash flow analytics</div><div className="lg-panel-caption">Income, expenses and savings · last 12 months</div></div><span className="lg-panel-action"><Activity size={16} /></span></div>
            {monthlySeries.length ? <ResponsiveContainer width="100%" height={252}><AreaChart data={monthlySeries} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}><defs><linearGradient id="lgIncomeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={MODE_COLOR.Income} stopOpacity={0.3} /><stop offset="100%" stopColor={MODE_COLOR.Income} stopOpacity={0.015} /></linearGradient><linearGradient id="lgExpenseFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={MODE_COLOR.Spending} stopOpacity={0.22} /><stop offset="100%" stopColor={MODE_COLOR.Spending} stopOpacity={0.01} /></linearGradient></defs><CartesianGrid strokeDasharray="3 6" stroke="var(--lg-rule)" vertical={false} /><XAxis dataKey="month" tick={{ fill: "var(--lg-text-dim)", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "var(--lg-text-dim)", fontSize: 10 }} tickFormatter={(v) => `₹${fmtINR(v)}`} axisLine={false} tickLine={false} width={58} /><Tooltip formatter={(v) => money(v)} contentStyle={{ background: "var(--lg-surface)", border: "1px solid var(--lg-rule)", borderRadius: 12, color: "var(--lg-text)" }} /><Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} /><Area type="monotone" dataKey="income" name="Income" stroke={MODE_COLOR.Income} strokeWidth={2.7} fill="url(#lgIncomeFill)" activeDot={{ r: 5 }} /><Area type="monotone" dataKey="expenses" name="Expenses" stroke={MODE_COLOR.Spending} strokeWidth={2.4} fill="url(#lgExpenseFill)" activeDot={{ r: 5 }} /><Area type="monotone" dataKey="savings" name="Savings" stroke={MODE_COLOR.Savings} strokeWidth={2.4} fill="none" activeDot={{ r: 5 }} /></AreaChart></ResponsiveContainer> : <div className="lg-dashboard-empty">Add entries to unlock your cash-flow trend.</div>}
          </Panel>
        </Col>
        <Col xl={5}>
          <Panel delay={0.18}>
            <div className="lg-panel-heading"><div><div className="lg-panel-title">Financial health</div><div className="lg-panel-caption">A combined view of your financial habits</div></div><span className="lg-panel-action"><ShieldCheck size={16} /></span></div>
            <div className="lg-health-wrap">
              <div className="lg-health-ring" style={{ "--health-value": `${healthScore * 3.6}deg` }}><div className="lg-health-ring-inner"><strong>{healthScore}</strong><span>out of 100</span></div></div>
              <div className="lg-health-status"><Badge bg={healthScore >= 75 ? "success" : healthScore >= 50 ? "warning" : "danger"}>{healthScore >= 75 ? "Healthy" : healthScore >= 50 ? "Building" : "Needs attention"}</Badge><span>Score based on tracked data</span></div>
            </div>
            <div className="lg-health-metrics"><div><span>Savings rate</span><strong>{healthSavingsRate.toFixed(0)}%</strong></div><div><span>Budget used</span><strong>{budgetUsage.toFixed(0)}%</strong></div><div><span>Emergency fund</span><strong>{emergencyTarget ? Math.min(100, emergencyCurrent / emergencyTarget * 100).toFixed(0) : "—"}%</strong></div>{debtScore !== null && <div><span>Debt health</span><strong>{Math.round(debtScore)}%</strong></div>}</div>
            {shortPeriod && <div className="small text-secondary mt-2">Health score and budget usage use the full month for Today / This Week filters.</div>}
          </Panel>
        </Col>
      </Row>

      <Row className="g-3 mb-3">
        <Col xl={5}>
          <Panel delay={0.22}>
            <div className="lg-panel-heading"><div><div className="lg-panel-title">Spending categories</div><div className="lg-panel-caption">Top expenses in the selected period</div></div><span className="lg-panel-action"><Target size={16} /></span></div>
            {categoryData.length ? <ResponsiveContainer width="100%" height={245}><BarChart data={categoryData} layout="vertical" margin={{ left: 0, right: 12, top: 4, bottom: 4 }}><CartesianGrid strokeDasharray="3 6" stroke="var(--lg-rule)" horizontal={false} /><XAxis type="number" tick={{ fill: "var(--lg-text-dim)", fontSize: 10 }} tickFormatter={(v) => `₹${fmtINR(v)}`} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="name" width={92} tick={{ fill: "var(--lg-text)", fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip formatter={(v) => money(v)} contentStyle={{ background: "var(--lg-surface)", border: "1px solid var(--lg-rule)", borderRadius: 12, color: "var(--lg-text)" }} /><Bar dataKey="amount" fill="var(--lg-accent)" radius={[0, 8, 8, 0]} maxBarSize={19} /></BarChart></ResponsiveContainer> : <div className="lg-dashboard-empty">No spending data for this period yet.</div>}
          </Panel>
        </Col>
        <Col xl={7}>
          <Panel delay={0.27}>
            <div className="lg-panel-heading"><div><div className="lg-panel-title">Smart money insights</div><div className="lg-panel-caption">Signals from your recent financial activity</div></div><span className="lg-panel-action"><Sparkles size={16} /></span></div>
            <div className="lg-insight-list">{insights.map((item, i) => <motion.div key={item} className="lg-insight-item" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.32 + i * 0.09 }}><span className="lg-insight-icon"><Sparkles size={15} /></span><span>{item}</span><ArrowUpRight size={15} className="lg-insight-arrow" /></motion.div>)}</div>
            <div className="lg-insight-footer"><span className="lg-live-indicator"><span /> Personalised from your Ledger records</span></div>
          </Panel>
        </Col>
      </Row>

      <Row className="g-3">
        <Col lg={7}>
          <Panel delay={0.3}>
            <div className="lg-panel-heading"><div><div className="lg-panel-title">Monthly comparison</div><div className="lg-panel-caption">Net cash flow versus savings</div></div><span className="lg-panel-action"><TrendingUp size={16} /></span></div>
            {monthlySeries.length ? <ResponsiveContainer width="100%" height={205}><AreaChart data={monthlySeries}><CartesianGrid strokeDasharray="3 6" stroke="var(--lg-rule)" vertical={false} /><XAxis dataKey="month" tick={{ fill: "var(--lg-text-dim)", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "var(--lg-text-dim)", fontSize: 10 }} tickFormatter={(v) => `₹${fmtINR(v)}`} axisLine={false} tickLine={false} width={58} /><Tooltip formatter={(v) => money(v)} /><Legend wrapperStyle={{ fontSize: 12 }} /><Area type="monotone" dataKey="cashFlow" name="Net cash flow" stroke={MODE_COLOR.Income} fill={MODE_COLOR.Income} fillOpacity={0.08} strokeWidth={2.5} /><Area type="monotone" dataKey="savings" name="Savings" stroke={MODE_COLOR.Savings} fill="none" strokeWidth={2.5} /></AreaChart></ResponsiveContainer> : <div className="lg-dashboard-empty">Not enough monthly data yet.</div>}
          </Panel>
        </Col>
        <Col lg={5}>
          <Panel delay={0.35}>
            <div className="lg-panel-heading"><div><div className="lg-panel-title">Monthly allocation</div><div className="lg-panel-caption">How this period is distributed</div></div><span className="lg-panel-action"><Wallet size={16} /></span></div>
            <div className="lg-allocation-total">{money(totals.Income)}<span>Total income</span></div>
            {[
              ["Needs", totals.Needs, MODE_COLOR.Needs],
              ["Spending", totals.Spending, MODE_COLOR.Spending],
              ["Savings", totals.Savings, MODE_COLOR.Savings],
            ].map(([label, value, color]) => <div className="lg-allocation-row" key={label}><div className="d-flex justify-content-between mb-2"><span>{label}</span><strong>{money(value)}</strong></div><div className="lg-allocation-track"><motion.div className="lg-allocation-fill" initial={{ width: 0 }} animate={{ width: `${totals.Income ? Math.min(100, value / totals.Income * 100) : 0}%` }} transition={{ duration: 1, delay: 0.4 }} style={{ background: color }} /></div></div>)}
            <div className="lg-cash-available"><span>Cash remaining</span><strong>{money(netCashFlow)}</strong></div>
          </Panel>
        </Col>
      </Row>
      <div className="lg-dashboard-footnote">Financial data is calculated from entries and records saved in your Ledger account.</div>
    </div>
  );
}

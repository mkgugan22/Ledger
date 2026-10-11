import { useMemo, useState } from "react";
import { Card, Row, Col, ButtonGroup, Button, ProgressBar, Badge } from "react-bootstrap";
import { Activity, CalendarDays, CreditCard, PiggyBank, ShieldCheck, Target, TrendingUp, Wallet } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { MODE_COLOR } from "../../lib/constants.js";
import { fmtINR, monthLabel } from "../../lib/format.js";

const PERIODS = ["Today", "This Week", "This Month", "Quarter", "Year", "Custom"];

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

export default function DashboardCommandCenter({
  selectedMonth,
  transactions = [],
  investments = [],
  bonds = [],
  valuations = [],
  monthBudgets = [],
}) {
  const [period, setPeriod] = useState("This Month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const periodTransactions = useMemo(() => {
    if (period === "This Month") return transactions.filter((x) => x.month === selectedMonth);
    if (period === "Year") return transactions.filter((x) => x.month?.startsWith(selectedMonth.slice(0, 4)));
    if (period === "Quarter") {
      const [year, m] = selectedMonth.split("-").map(Number);
      const qStart = Math.floor((m - 1) / 3) * 3 + 1;
      const allowed = new Set([0, 1, 2].map((i) => `${year}-${String(qStart + i).padStart(2, "0")}`));
      return transactions.filter((x) => allowed.has(x.month));
    }
    if (period === "Custom") {
      if (!customFrom || !customTo) return transactions.filter((x) => x.month === selectedMonth);
      return transactions.filter((x) => x.month >= customFrom && x.month <= customTo);
    }
    // The current transaction model is month-based. Until transaction dates are
    // introduced, Today/This Week intentionally fall back to the selected month
    // rather than inventing precision that the stored data does not contain.
    return transactions.filter((x) => x.month === selectedMonth);
  }, [transactions, selectedMonth, period, customFrom, customTo]);

  const totals = useMemo(() => sumByMode(periodTransactions), [periodTransactions]);
  const netCashFlow = totals.Income - totals.Needs - totals.Spending - totals.Savings;
  const savingsRate = totals.Income ? (totals.Savings / totals.Income) * 100 : 0;

  // Auto-SIP rows (autoSipMonth) are ₹-at-cost contributions, not valuations. Skip them
  // here so a fresh auto entry dated the 10th never overrides a fund's latest Status value.
  const investmentValue = latestValues(investments.filter((x) => !x.autoSipMonth), "fund", "currentValue");
  const bondValue = latestValues(bonds, "issuer", "currentValue");
  const savingsValue = latestValues(valuations, "instrument", "value");
  const netWorth = investmentValue + bondValue + savingsValue;

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
  const budgetActual = periodTransactions.reduce((s, x) => s + (x.mode === "Income" ? 0 : Number(x.amount) || 0), 0);
  const budgetUsage = budgetPlanned ? Math.min(100, (budgetActual / budgetPlanned) * 100) : 0;

  const healthScore = Math.round(Math.min(100, Math.max(0,
    Math.min(100, savingsRate * 2) * 0.3 +
    (emergencyTarget ? Math.min(100, emergencyCurrent / emergencyTarget * 100) : 50) * 0.2 +
    (budgetPlanned ? Math.max(0, 100 - Math.max(0, budgetUsage - 80) * 5) : 70) * 0.2 +
    (investmentValue > 0 ? 90 : 40) * 0.15 +
    (netCashFlow >= 0 ? 100 : 30) * 0.15
  )));

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
    ["Net Worth", money(netWorth), Wallet, "Income"],
    ["Emergency Fund", money(emergencyCurrent), ShieldCheck, emergencyCurrent >= emergencyTarget && emergencyTarget ? "Income" : "Needs"],
    ["Budget Usage", `${budgetUsage.toFixed(0)}%`, Target, budgetUsage > 100 ? "Spending" : "Needs"],
    ["Debt", "₹0", CreditCard, "Needs"],
    ["Upcoming Bills", "0", CalendarDays, "Needs"],
  ];

  return (
    <div className="mb-4">
      <Card className="lg-card mb-3">
        <Card.Body className="p-3 p-lg-4">
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-3">
            <div><div className="font-serif fs-5">Financial Command Center</div><div className="small text-secondary">{period === "This Month" ? monthLabel(selectedMonth) : period}</div></div>
            <ButtonGroup size="sm" className="flex-wrap">
              {PERIODS.map((p) => <Button key={p} variant={period === p ? "dark" : "outline-secondary"} onClick={() => setPeriod(p)}>{p}</Button>)}
            </ButtonGroup>
          </div>
          {period === "Custom" && <div className="d-flex gap-2 mt-3"><input className="form-control form-control-sm" type="month" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} aria-label="Custom period start" /><span className="align-self-center text-secondary">to</span><input className="form-control form-control-sm" type="month" value={customTo} onChange={(e) => setCustomTo(e.target.value)} aria-label="Custom period end" /></div>}
        </Card.Body>
      </Card>

      <Row className="g-3 mb-3">
        {cards.map(([label, value, Icon, tone]) => <Col key={label} xs={6} lg={3}><Card className="lg-summary-card h-100"><Card.Body><div className="d-flex justify-content-between"><span className="lg-summary-label">{label}</span><Icon size={16} color={MODE_COLOR[tone]} /></div><div className="lg-summary-value font-mono mt-2" style={{ color: MODE_COLOR[tone] }}>{value}</div></Card.Body></Card></Col>)}
      </Row>

      <Row className="g-3 mb-3">
        <Col lg={5}><Card className="lg-card h-100"><Card.Body><div className="d-flex justify-content-between align-items-center mb-3"><div><div className="font-serif fs-5">Financial Health</div><div className="small text-secondary">Based only on data currently tracked in Ledger.</div></div><Badge bg={healthScore >= 75 ? "success" : healthScore >= 50 ? "warning" : "danger"}>{healthScore}/100</Badge></div><ProgressBar now={healthScore} style={{ height: 10 }} /><div className="d-flex justify-content-between small text-secondary mt-2"><span>Savings {savingsRate.toFixed(0)}%</span><span>Budget {budgetUsage.toFixed(0)}%</span><span>Emergency {emergencyTarget ? Math.min(100, emergencyCurrent / emergencyTarget * 100).toFixed(0) : "—"}%</span></div></Card.Body></Card></Col>
        <Col lg={7}><Card className="lg-card h-100"><Card.Body><div className="font-serif fs-5 mb-3">Smart insights</div><div className="d-grid gap-2">{insights.map((x, i) => <div className="border rounded p-3 small" key={i}>{x}</div>)}</div></Card.Body></Card></Col>
      </Row>

      <Row className="g-3 mb-3">
        <Col lg={8}><Card className="lg-card h-100"><Card.Body><div className="font-serif mb-3">Income, expenses & savings trend</div>{monthlySeries.length ? <ResponsiveContainer width="100%" height={280}><AreaChart data={monthlySeries}><CartesianGrid strokeDasharray="3 3" stroke="var(--lg-rule)" /><XAxis dataKey="month" tick={{ fill: "var(--lg-text-dim)", fontSize: 11 }} /><YAxis tick={{ fill: "var(--lg-text-dim)", fontSize: 11 }} tickFormatter={(v) => `₹${fmtINR(v)}`} /><Tooltip formatter={(v) => money(v)} /><Legend /><Area type="monotone" dataKey="income" name="Income" stroke={MODE_COLOR.Income} fill={MODE_COLOR.Income} fillOpacity={0.08} /><Area type="monotone" dataKey="expenses" name="Expenses" stroke={MODE_COLOR.Spending} fill={MODE_COLOR.Spending} fillOpacity={0.06} /><Area type="monotone" dataKey="savings" name="Savings" stroke={MODE_COLOR.Savings} fill={MODE_COLOR.Savings} fillOpacity={0.06} /></AreaChart></ResponsiveContainer> : <div className="text-secondary py-5 text-center">Add entries to unlock trend analysis.</div>}</Card.Body></Card></Col>
        <Col lg={4}><Card className="lg-card h-100"><Card.Body><div className="font-serif mb-3">Category distribution</div>{categoryData.length ? <ResponsiveContainer width="100%" height={280}><BarChart data={categoryData} layout="vertical" margin={{ left: 4, right: 12 }}><CartesianGrid strokeDasharray="3 3" stroke="var(--lg-rule)" horizontal={false} /><XAxis type="number" tickFormatter={(v) => `₹${fmtINR(v)}`} /><YAxis type="category" dataKey="name" width={85} /><Tooltip formatter={(v) => money(v)} /><Bar dataKey="amount" fill={MODE_COLOR.Spending} radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer> : <div className="text-secondary py-5 text-center">No spending data for this period.</div>}</Card.Body></Card></Col>
      </Row>

      <Card className="lg-card">
        <Card.Body>
          <div className="font-serif mb-3">Monthly comparison</div>
          {monthlySeries.length ? <ResponsiveContainer width="100%" height={220}><AreaChart data={monthlySeries}><CartesianGrid strokeDasharray="3 3" stroke="var(--lg-rule)" /><XAxis dataKey="month" /><YAxis tickFormatter={(v) => `₹${fmtINR(v)}`} /><Tooltip formatter={(v) => money(v)} /><Legend /><Area type="monotone" dataKey="cashFlow" name="Net Cash Flow" stroke={MODE_COLOR.Income} fill="none" /><Area type="monotone" dataKey="savings" name="Savings" stroke={MODE_COLOR.Savings} fill="none" /></AreaChart></ResponsiveContainer> : <div className="text-secondary py-4 text-center">Not enough monthly data yet.</div>}
        </Card.Body>
      </Card>
    </div>
  );
}

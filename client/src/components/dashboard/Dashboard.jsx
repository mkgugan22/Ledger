import { Card, Row, Col } from "react-bootstrap";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { motion } from "framer-motion";
import { Wallet, PiggyBank, TrendingUp, TrendingDown } from "lucide-react";
import PageHeader from "../shared/PageHeader.jsx";
import MonthPicker from "../shared/MonthPicker.jsx";
import EmptyState from "../shared/EmptyState.jsx";
import { MODE_COLOR } from "../../lib/constants.js";
import { fmtINR, monthLabel } from "../../lib/format.js";
import Alerts from "./Alerts.jsx";
import AnimatedCard from "../../lib/motion/AnimatedCard.jsx";
import AnimatedNumber from "../../lib/motion/AnimatedNumber.jsx";

export default function Dashboard({
  selectedMonth,
  setSelectedMonth,
  totals,
  categoryChartData,
  alerts = [],
}) {
  const cards = [
    { label: "Income", value: totals.Income, icon: TrendingUp, color: MODE_COLOR.Income },
    { label: "Needs", value: totals.Needs, icon: Wallet, color: MODE_COLOR.Needs },
    { label: "Savings", value: totals.Savings, icon: PiggyBank, color: MODE_COLOR.Savings },
    { label: "Spending", value: totals.Spending, icon: TrendingDown, color: MODE_COLOR.Spending },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={monthLabel(selectedMonth)}
        right={<MonthPicker value={selectedMonth} onChange={setSelectedMonth} />}
      />

      <Row className="g-3 mb-3">
        {cards.map((c, i) => (
          <Col key={c.label} xs={6} lg={3}>
            <AnimatedCard delay={i * 0.06} className="lg-summary-card h-100 card">
              <Card.Body>
                <div className="d-flex justify-content-between align-items-start">
                  <span className="lg-summary-label">{c.label}</span>
                  <c.icon size={16} color={c.color} />
                </div>
                <div className="lg-summary-value font-mono mt-2" style={{ color: c.color }}>
                  ₹<AnimatedNumber value={c.value} formatter={fmtINR} />
                </div>
              </Card.Body>
            </AnimatedCard>
          </Col>
        ))}
      </Row>
      <Alerts alerts={alerts} />

      <motion.div
        className="lg-inhand-bar d-flex justify-content-between align-items-center px-4 py-3 mb-4"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, delay: 0.2, ease: "easeOut" }}
      >
        <span className="font-serif">In hand this month</span>
        <span
          className="font-mono fw-bold fs-4"
          style={{ color: totals.inHand >= 0 ? MODE_COLOR.Income : MODE_COLOR.Spending }}
        >
          ₹<AnimatedNumber value={totals.inHand} formatter={fmtINR} />
        </span>
      </motion.div>

      <Card className="lg-card">
        <Card.Body>
          <div className="font-serif mb-3">Where it went — {monthLabel(selectedMonth)}</div>
          {categoryChartData.length === 0 ? (
            <EmptyState text="No entries logged for this month yet. Add one to see the breakdown here." />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(220, categoryChartData.length * 42)}>
              <BarChart data={categoryChartData} layout="vertical" margin={{ left: 8, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--lg-rule)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: "var(--lg-text-dim)", fontSize: 11 }}
                  tickFormatter={(v) => `₹${fmtINR(v)}`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={{ fill: "var(--lg-text)", fontSize: 12 }}
                />
                <Tooltip
                  formatter={(v) => [`₹${fmtINR(v)}`, "Amount"]}
                  contentStyle={{ background: "var(--lg-surface)", color: "var(--lg-text)", border: "1px solid var(--lg-rule)" }}
                />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                  {categoryChartData.map((entry, i) => (
                    <Cell key={i} fill={MODE_COLOR[entry.mode] || "var(--lg-brass)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card.Body>
      </Card>
    </div>
  );
}

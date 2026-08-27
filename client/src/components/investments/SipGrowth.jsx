import { useMemo, useState } from "react";
import { Alert, Button, Card, Col, Form, Row, Table } from "react-bootstrap";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Plus, RefreshCw, TrendingUp } from "lucide-react";
import PageHeader from "../shared/PageHeader.jsx";
import { createInvestment } from "../../lib/api.js";
import { fmtINR } from "../../lib/format.js";

const projection = (monthly, value, annualRate, years) => {
  const months = years * 12;
  const r = annualRate / 100 / 12;
  return Math.round(value * (1 + r) ** months + monthly * (((1 + r) ** months - 1) / r));
};

export default function SipGrowth({ investments = [], onInvestmentAdded }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ fund: "", amount: "", date: "", type: "Additional" });
  const [notice, setNotice] = useState("");
  const rows = investments;
  const totals = useMemo(() => rows.reduce((acc, item) => ({ invested: acc.invested + Number(item.invested || item.amount || 0), current: acc.current + Number(item.currentValue || item.current || item.amount || 0) }), { invested: 0, current: 0 }), [rows]);
  const gain = totals.current - totals.invested;
  const gainPct = totals.invested ? (gain / totals.invested) * 100 : 0;
  const monthly = rows.reduce((sum, item) => sum + Number(item.monthly || 0), 0);
  const chart = [0, 1, 2, 3, 4, 5].map((year) => ({ year: `${year}Y`, invested: Math.round(totals.invested + monthly * year * 12), value: projection(monthly, totals.current, 10, year) }));
  const scenarios = [8, 10, 12].map((rate) => ({ rate, one: projection(monthly, totals.current, rate, 1), three: projection(monthly, totals.current, rate, 3), five: projection(monthly, totals.current, rate, 5) }));

  async function addInvestment(event) {
    event.preventDefault();
    if (!form.fund || !form.amount || !form.date) return;
    const payload = { fund: form.fund.trim(), type: form.type, invested: Number(form.amount), currentValue: Number(form.amount), date: form.date, monthly: 0 };
    try {
      const saved = await createInvestment(payload);
      onInvestmentAdded?.(saved);
      setNotice("Investment added.");
    } catch {
      onInvestmentAdded?.({ ...payload, id: `local-${Date.now()}` });
      setNotice("Investment added locally. It will sync when the API is available.");
    }
    setForm({ fund: "", amount: "", date: "", type: "Additional" });
    setShowForm(false);
  }

  return (
    <div>
      <PageHeader title="SIP Growth" subtitle="A clear view of your contributions, current estimate, and possible future paths" right={<Button onClick={() => setShowForm((v) => !v)} className="d-inline-flex align-items-center gap-2"><Plus size={16} />Add investment</Button>} />
      {notice && <Alert variant="success" dismissible onClose={() => setNotice("")} className="small">{notice}</Alert>}
      <Alert variant="info" className="small border-0 lg-disclaimer"><RefreshCw size={14} className="me-2" />Current values are estimates based on the latest saved NAV data. Projections are scenarios, not guaranteed returns.</Alert>
      {showForm && <Card className="lg-card mb-4"><Card.Body><Form onSubmit={addInvestment}><Row className="g-3 align-items-end"><Col md={4}><Form.Label>Fund name</Form.Label><Form.Control value={form.fund} onChange={(e) => setForm({ ...form, fund: e.target.value })} required placeholder="e.g. HDFC Flexi Cap" /></Col><Col md={2}><Form.Label>Amount (₹)</Form.Label><Form.Control type="number" min="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></Col><Col md={2}><Form.Label>Date</Form.Label><Form.Control type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></Col><Col md={2}><Form.Label>Type</Form.Label><Form.Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option>SIP</option><option>Additional</option></Form.Select></Col><Col md={2}><Button type="submit" className="w-100">Save</Button></Col></Row></Form></Card.Body></Card>}
      <Row className="g-3 mb-4"><Col sm={6} lg={3}><Card className="lg-summary-card h-100"><Card.Body><div className="lg-summary-label">Total invested</div><div className="lg-summary-value font-mono">₹{fmtINR(totals.invested)}</div><small className="text-secondary">From your saved investments</small></Card.Body></Card></Col><Col sm={6} lg={3}><Card className="lg-summary-card h-100"><Card.Body><div className="lg-summary-label">Estimated value</div><div className="lg-summary-value font-mono">₹{fmtINR(totals.current)}</div><small className="text-secondary">NAV-based estimate</small></Card.Body></Card></Col><Col sm={6} lg={3}><Card className="lg-summary-card h-100"><Card.Body><div className="lg-summary-label">Overall gain</div><div className={`lg-summary-value font-mono ${gain >= 0 ? "text-success" : "text-danger"}`}>{gain >= 0 ? "+" : "-"}₹{fmtINR(Math.abs(gain))}</div><small className={gain >= 0 ? "text-success" : "text-danger"}>{gain >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />} {Math.abs(gainPct).toFixed(2)}%</small></Card.Body></Card></Col><Col sm={6} lg={3}><Card className="lg-summary-card h-100"><Card.Body><div className="lg-summary-label">Monthly SIP</div><div className="lg-summary-value font-mono">₹{fmtINR(monthly)}</div><small className="text-secondary">From your active SIPs</small></Card.Body></Card></Col></Row>
      <Row className="g-4 mb-4"><Col lg={8}><Card className="lg-card h-100"><Card.Body><div className="d-flex justify-content-between align-items-center mb-3"><div><div className="font-serif">Growth outlook</div><small className="text-secondary">10% assumed annual return scenario</small></div><TrendingUp size={18} color="var(--lg-brass)" /></div><ResponsiveContainer width="100%" height={280}><AreaChart data={chart}><defs><linearGradient id="sipFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4f7d70" stopOpacity={0.28} /><stop offset="95%" stopColor="#4f7d70" stopOpacity={0.03} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="var(--lg-rule)" /><XAxis dataKey="year" tick={{ fill: "var(--lg-text-dim)", fontSize: 11 }} /><YAxis tick={{ fill: "var(--lg-text-dim)", fontSize: 11 }} tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} /><Tooltip formatter={(v) => `₹${fmtINR(v)}`} contentStyle={{ background: "var(--lg-surface)", border: "1px solid var(--lg-rule)" }} /><Area type="monotone" dataKey="invested" stroke="#9c8660" fill="transparent" strokeDasharray="5 5" name="Invested" /><Area type="monotone" dataKey="value" stroke="#3e6259" fill="url(#sipFill)" name="Estimated value" /></AreaChart></ResponsiveContainer></Card.Body></Card></Col><Col lg={4}><Card className="lg-card h-100"><Card.Body><div className="font-serif mb-3">Scenario planner</div><Table responsive size="sm" className="lg-table mb-0"><thead><tr><th>Rate</th><th>1 year</th><th>3 years</th><th>5 years</th></tr></thead><tbody>{scenarios.map((s) => <tr key={s.rate}><td className="fw-semibold">{s.rate}%</td><td className="font-mono">₹{fmtINR(s.one)}</td><td className="font-mono">₹{fmtINR(s.three)}</td><td className="font-mono">₹{fmtINR(s.five)}</td></tr>)}</tbody></Table><small className="text-secondary d-block mt-3">Illustrative compounding only. Actual returns will vary.</small></Card.Body></Card></Col></Row>
      <Card className="lg-card"><Card.Body><div className="font-serif mb-3">Fund-wise allocation and history</div><div className="table-responsive"><Table className="lg-table mb-0"><thead><tr><th>Fund</th><th>Type</th><th>Started / date</th><th className="text-end">Invested</th><th className="text-end">Current estimate</th><th className="text-end">Gain</th></tr></thead><tbody>{rows.map((item) => { const itemGain = Number(item.currentValue || item.current || 0) - Number(item.invested || item.amount || 0); return <tr key={item.id || item._id || item.fund}><td><div className="fw-semibold">{item.fund}</div><small className="text-secondary">{item.monthly ? `₹${fmtINR(item.monthly)}/month · ${item.source}` : item.source}</small></td><td><span className="badge text-bg-light">{item.type}</span></td><td>{item.started || item.date}</td><td className="text-end font-mono">₹{fmtINR(item.invested || item.amount)}</td><td className="text-end font-mono">₹{fmtINR(item.currentValue || item.current || item.amount)}</td><td className={`text-end font-mono ${itemGain >= 0 ? "text-success" : "text-danger"}`}>{itemGain >= 0 ? "+" : "-"}₹{fmtINR(Math.abs(itemGain))}</td></tr>; })}</tbody></Table></div></Card.Body></Card>
      <Card className="lg-card mt-4"><Card.Body><div className="font-serif mb-2">Free fund research sources</div><small className="text-secondary">Use the market refresh API when available, or verify a scheme's NAV and historical performance with these independent tools:</small><div className="d-flex flex-wrap gap-3 mt-3 small"><a href="https://www.morningstar.in/" target="_blank" rel="noreferrer">Morningstar India</a><a href="https://www.valueresearchonline.com/" target="_blank" rel="noreferrer">Value Research</a><a href="https://www.moneycontrol.com/mutual-funds/" target="_blank" rel="noreferrer">Moneycontrol</a><a href="https://groww.in/mutual-funds" target="_blank" rel="noreferrer">Groww</a><a href="https://dhanik.com/" target="_blank" rel="noreferrer">Dhanik</a><a href="https://www.mftools.in/" target="_blank" rel="noreferrer">MFTools</a></div></Card.Body></Card>
    </div>
  );
}

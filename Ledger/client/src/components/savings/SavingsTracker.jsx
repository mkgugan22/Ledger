import { useState, useMemo } from "react";
import { Card, Form, Row, Col, Button, Table } from "react-bootstrap";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { PiggyBank, Trash2 } from "lucide-react";
import PageHeader from "../shared/PageHeader.jsx";
import EmptyState from "../shared/EmptyState.jsx";
import { INSTRUMENTS_HINT, TREND_LINE_COLORS } from "../../lib/constants.js";
import { fmtINR, monthLabel, shortMonthLabel } from "../../lib/format.js";

export default function SavingsTracker({
  valuations,
  instrumentNames,
  trendData,
  addValuation,
  deleteValuation,
  defaultMonth,
}) {
  const [instrument, setInstrument] = useState(INSTRUMENTS_HINT[0]);
  const [customInstrument, setCustomInstrument] = useState("");
  const [value, setValue] = useState("");
  const [month, setMonth] = useState(defaultMonth);

  function submit(e) {
    e.preventDefault();
    const name = instrument === "__custom__" ? customInstrument.trim() : instrument;
    if (!name || !value) return;
    addValuation({ month, instrument: name, value: Number(value) });
    setValue("");
    setCustomInstrument("");
  }

  const sortedRows = useMemo(
    () => [...valuations].sort((a, b) => (a.month < b.month ? 1 : -1)),
    [valuations]
  );

  return (
    <div>
      <PageHeader title="Savings Tracker" subtitle="Track what each savings instrument is worth, month to month" />

      <Card className="lg-card mb-4">
        <Card.Body className="p-4">
          <Form onSubmit={submit}>
            <Row className="g-3">
              <Col md={3}>
                <Form.Group>
                  <Form.Label className="small fw-semibold text-secondary">Instrument</Form.Label>
                  <Form.Select value={instrument} onChange={(e) => setInstrument(e.target.value)}>
                    {instrumentNames.map((i) => (
                      <option key={i} value={i}>{i}</option>
                    ))}
                    <option value="__custom__">+ New instrument…</option>
                  </Form.Select>
                </Form.Group>
              </Col>

              {instrument === "__custom__" && (
                <Col md={3}>
                  <Form.Group>
                    <Form.Label className="small fw-semibold text-secondary">New instrument name</Form.Label>
                    <Form.Control
                      value={customInstrument}
                      onChange={(e) => setCustomInstrument(e.target.value)}
                      placeholder="e.g. Mutual Fund"
                      required
                    />
                  </Form.Group>
                </Col>
              )}

              <Col md={3}>
                <Form.Group>
                  <Form.Label className="small fw-semibold text-secondary">Value (₹)</Form.Label>
                  <Form.Control
                    type="number"
                    min="0"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="font-mono"
                    required
                  />
                </Form.Group>
              </Col>

              <Col md={3}>
                <Form.Group>
                  <Form.Label className="small fw-semibold text-secondary">As of month</Form.Label>
                  <Form.Control
                    type="month"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    required
                  />
                </Form.Group>
              </Col>
            </Row>

            <Button type="submit" className="mt-4 d-inline-flex align-items-center gap-2" variant="primary">
              <PiggyBank size={16} />
              Record valuation
            </Button>
          </Form>
        </Card.Body>
      </Card>

      <Card className="lg-card mb-4">
        <Card.Body>
          <div className="font-serif mb-3">Valuation trend</div>
          {trendData.length < 1 ? (
            <EmptyState text="Record a valuation to start tracking the trend." />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trendData} margin={{ left: 4, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--lg-rule)" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "var(--lg-text-dim)", fontSize: 11 }}
                  tickFormatter={shortMonthLabel}
                />
                <YAxis
                  tick={{ fill: "var(--lg-text-dim)", fontSize: 11 }}
                  tickFormatter={(v) => `₹${fmtINR(v)}`}
                />
                <Tooltip
                  formatter={(v) => `₹${fmtINR(v)}`}
                  labelFormatter={monthLabel}
                  contentStyle={{ background: "#fff", border: "1px solid var(--lg-rule)" }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {instrumentNames.map((inst, i) => (
                  <Line
                    key={inst}
                    type="monotone"
                    dataKey={inst}
                    stroke={TREND_LINE_COLORS[i % TREND_LINE_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card.Body>
      </Card>

      <Card className="lg-card">
        <Card.Body>
          <div className="font-serif mb-3">Recorded valuations</div>
          {sortedRows.length === 0 ? (
            <EmptyState text="Nothing recorded yet." />
          ) : (
            <div className="table-responsive">
              <Table className="lg-table mb-0" borderless>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Instrument</th>
                    <th className="text-end">Value</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((v) => (
                    <tr key={v.id} style={{ borderBottom: "1px solid var(--lg-rule)" }}>
                      <td>{monthLabel(v.month)}</td>
                      <td>{v.instrument}</td>
                      <td className="text-end font-mono">₹{fmtINR(v.value)}</td>
                      <td>
                        <button
                          className="btn btn-sm btn-link text-secondary p-1"
                          onClick={() => deleteValuation(v.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Card.Body>
      </Card>
    </div>
  );
}

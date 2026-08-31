import { useState, useMemo } from "react";
import { Card, Form, Row, Col, Button, Table } from "react-bootstrap";
import { Trash2, Target } from "lucide-react";
import PageHeader from "../shared/PageHeader.jsx";
import MonthPicker from "../shared/MonthPicker.jsx";
import EmptyState from "../shared/EmptyState.jsx";
import { MODES, MODE_COLOR } from "../../lib/constants.js";
import { fmtINR, monthLabel } from "../../lib/format.js";
import { computeBudgetComparison } from "../../lib/budget.js";

export default function Budget({
  selectedMonth,
  setSelectedMonth,
  monthTx,
  monthBudgets,
  typeHints,
  addBudget,
  deleteBudget,
}) {
  const [mode, setMode] = useState("Needs");
  const [type, setType] = useState("");
  const [plannedAmount, setPlannedAmount] = useState("");

  const rows = useMemo(() => computeBudgetComparison(monthBudgets, monthTx), [monthBudgets, monthTx]);

  function submit(e) {
    e.preventDefault();
    if (!type.trim() || !plannedAmount || Number(plannedAmount) < 0) return;
    addBudget({ month: selectedMonth, mode, type: type.trim(), plannedAmount: Number(plannedAmount) });
    setType("");
    setPlannedAmount("");
  }

  return (
    <div>
      <PageHeader
        title="Budget"
        subtitle="Plan a figure per category, see how this month is tracking against it"
        right={<MonthPicker value={selectedMonth} onChange={setSelectedMonth} />}
      />

      <Card className="lg-card mb-4">
        <Card.Body className="p-4">
          <Form onSubmit={submit}>
            <Row className="g-3 align-items-end">
              <Col md={3}>
                <Form.Group>
                  <Form.Label className="small fw-semibold text-secondary">Mode</Form.Label>
                  <Form.Select value={mode} onChange={(e) => setMode(e.target.value)}>
                    {MODES.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label className="small fw-semibold text-secondary">Type</Form.Label>
                  <Form.Control
                    list="budget-type-hints"
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    placeholder="Rent, Groceries, SIP…"
                    required
                  />
                  <datalist id="budget-type-hints">
                    {Array.from(typeHints?.[mode] || []).map((t) => (
                      <option value={t} key={t} />
                    ))}
                  </datalist>
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group>
                  <Form.Label className="small fw-semibold text-secondary">Planned amount (₹)</Form.Label>
                  <Form.Control
                    type="number"
                    min="0"
                    step="1"
                    className="font-mono"
                    value={plannedAmount}
                    onChange={(e) => setPlannedAmount(e.target.value)}
                    placeholder="0"
                    required
                  />
                </Form.Group>
              </Col>
              <Col md={2}>
                <Button type="submit" variant="primary" className="w-100 d-inline-flex align-items-center justify-content-center gap-2">
                  <Target size={15} />
                  Set
                </Button>
              </Col>
            </Row>
          </Form>
        </Card.Body>
      </Card>

      <Card className="lg-card">
        <Card.Body>
          {rows.length === 0 ? (
            <EmptyState text={`No budget set for ${monthLabel(selectedMonth)} yet.`} />
          ) : (
            <div className="table-responsive">
              <Table className="lg-table mb-0" borderless>
                <thead>
                  <tr>
                    <th>Mode</th>
                    <th>Type</th>
                    <th className="text-end">Planned</th>
                    <th className="text-end">Actual</th>
                    <th className="text-end">Remaining</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const budgetDoc = monthBudgets.find((b) => b.mode === r.mode && b.type === r.type);
                    return (
                      <tr key={`${r.mode}::${r.type}`} style={{ borderBottom: "1px solid var(--lg-rule)" }}>
                        <td>
                          <span className="lg-mode-badge" style={{ background: MODE_COLOR[r.mode] }}>{r.mode}</span>
                        </td>
                        <td>{r.type}</td>
                        <td className="text-end font-mono">₹{fmtINR(r.planned)}</td>
                        <td className="text-end font-mono">₹{fmtINR(r.actual)}</td>
                        <td className={`text-end font-mono ${r.remaining < 0 ? "text-danger" : "text-secondary"}`}>
                          {r.remaining < 0 ? "−" : ""}₹{fmtINR(Math.abs(r.remaining))}
                        </td>
                        <td className="text-nowrap">
                          {budgetDoc && (
                            <button className="btn btn-sm btn-link text-secondary p-1" onClick={() => deleteBudget(budgetDoc.id)}>
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          )}
        </Card.Body>
      </Card>
    </div>
  );
}

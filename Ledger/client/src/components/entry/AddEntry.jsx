import { useState } from "react";
import { Card, Form, Row, Col, Button, Toast, ToastContainer } from "react-bootstrap";
import { PlusCircle } from "lucide-react";
import PageHeader from "../shared/PageHeader.jsx";
import { MODES, MODE_COLOR } from "../../lib/constants.js";

const PLACEHOLDERS = {
  Income: "Salary, NATS…",
  Needs: "Rent, PG, Groceries…",
  Savings: "SIP, Gold, Box Savings…",
  Spending: "Dining, Travel, Shopping…",
};

export default function AddEntry({ defaultMonth, addTransaction, typeHints }) {
  const [mode, setMode] = useState("Needs");
  const [type, setType] = useState("");
  const [amount, setAmount] = useState("");
  const [month, setMonth] = useState(defaultMonth);
  const [note, setNote] = useState("");
  const [showToast, setShowToast] = useState(false);

  function submit(e) {
    e.preventDefault();
    if (!type.trim() || !amount || Number(amount) <= 0) return;
    addTransaction({ mode, type: type.trim(), amount: Number(amount), month, note: note.trim() });
    setType("");
    setAmount("");
    setNote("");
    setShowToast(true);
  }

  return (
    <div>
      <PageHeader title="Add Entry" subtitle="Log income, a need, a saving, or a spend" />

      <Card className="lg-card">
        <Card.Body className="p-4">
          <Form onSubmit={submit}>
            <div className="d-flex gap-2 flex-wrap mb-4">
              {MODES.map((m) => {
                const active = mode === m;
                return (
                  <button
                    type="button"
                    key={m}
                    onClick={() => setMode(m)}
                    className={`lg-mode-chip${active ? " active" : ""}`}
                    style={active ? { background: MODE_COLOR[m], borderColor: MODE_COLOR[m] } : undefined}
                  >
                    {m}
                  </button>
                );
              })}
            </div>

            <Row className="g-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label className="small fw-semibold text-secondary">
                    Type of {mode === "Income" ? "income" : "expenditure"}
                  </Form.Label>
                  <Form.Control
                    list="type-hints"
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    placeholder={PLACEHOLDERS[mode]}
                    required
                  />
                  <datalist id="type-hints">
                    {Array.from(typeHints[mode] || []).map((t) => (
                      <option value={t} key={t} />
                    ))}
                  </datalist>
                </Form.Group>
              </Col>

              <Col md={3}>
                <Form.Group>
                  <Form.Label className="small fw-semibold text-secondary">Amount (₹)</Form.Label>
                  <Form.Control
                    type="number"
                    min="0"
                    step="1"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    className="font-mono"
                    required
                  />
                </Form.Group>
              </Col>

              <Col md={3}>
                <Form.Group>
                  <Form.Label className="small fw-semibold text-secondary">Month</Form.Label>
                  <Form.Control
                    type="month"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    required
                  />
                </Form.Group>
              </Col>

              <Col xs={12}>
                <Form.Group>
                  <Form.Label className="small fw-semibold text-secondary">Note (optional)</Form.Label>
                  <Form.Control
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Anything worth remembering about this entry"
                  />
                </Form.Group>
              </Col>
            </Row>

            <Button type="submit" className="mt-4 d-inline-flex align-items-center gap-2" variant="primary">
              <PlusCircle size={16} />
              Add to ledger
            </Button>
          </Form>
        </Card.Body>
      </Card>

      <ToastContainer position="bottom-end" className="p-3">
        <Toast bg="light" show={showToast} onClose={() => setShowToast(false)} delay={2200} autohide>
          <Toast.Body>Added — you can see it under All Entries.</Toast.Body>
        </Toast>
      </ToastContainer>
    </div>
  );
}

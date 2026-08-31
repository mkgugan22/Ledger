import { useState } from "react";
import { Card, Form, Row, Col, Button, Toast, ToastContainer, Spinner, Alert } from "react-bootstrap";
import { PlusCircle, Sparkles } from "lucide-react";
import PageHeader from "../shared/PageHeader.jsx";
import { MODES, MODE_COLOR } from "../../lib/constants.js";
import { parsePayslipDocument } from "../../lib/api.js";

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
  const [recurring, setRecurring] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [showToast, setShowToast] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);
  const [autoFillError, setAutoFillError] = useState("");
  const [autoFillNotice, setAutoFillNotice] = useState("");

  // Optional: upload a payslip PDF and prefill the fields below from it.
  // This never submits the form itself — the user still reviews the
  // prefilled values and clicks "Add to ledger" like any other entry.
  async function handleAutoFill(e) {
    const file = e.target.files?.[0] || null;
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    setAutoFillError("");
    setAutoFillNotice("");
    setAutoFilling(true);
    try {
      const suggestion = await parsePayslipDocument(file);
      setMode(suggestion.mode || "Income");
      setType(suggestion.type || "Salary");
      setAmount(String(suggestion.amount));
      if (suggestion.month) setMonth(suggestion.month);
      if (suggestion.note) setNote(suggestion.note);
      setAutoFillNotice("Fields below were filled in from your payslip — check them over before saving.");
    } catch (err) {
      setAutoFillError(err.message || "Couldn't read that document.");
    } finally {
      setAutoFilling(false);
    }
  }

  function submit(e) {
    e.preventDefault();
    if (!type.trim() || !amount || Number(amount) <= 0) return;
    addTransaction({ mode, type: type.trim(), amount: Number(amount), month, note: note.trim(), recurring }, receipt);
    setType("");
    setAmount("");
    setNote("");
    setRecurring(false);
    setReceipt(null);
    setShowToast(true);
  }

  return (
    <div>
      <PageHeader title="Add Entry" subtitle="Log income, a need, a saving, or a spend" />

      <Card className="lg-card">
        <Card.Body className="p-4">
          <Form onSubmit={submit}>
            <div className="border rounded p-3 mb-4">
              <Form.Group>
                <Form.Label className="small fw-semibold text-secondary d-flex align-items-center gap-2">
                  <Sparkles size={15} />
                  Auto-fill from a payslip (optional)
                </Form.Label>
                <Form.Control
                  type="file"
                  accept="application/pdf"
                  disabled={autoFilling}
                  onChange={handleAutoFill}
                />
                <Form.Text>
                  Upload a payslip PDF and we'll try to pull your in-hand/net salary and pay
                  month into the fields below — nothing is saved until you submit.
                </Form.Text>
                {autoFilling && (
                  <div className="small text-secondary mt-2 d-flex align-items-center gap-2">
                    <Spinner animation="border" size="sm" /> Reading document…
                  </div>
                )}
                {autoFillNotice && (
                  <Alert variant="success" className="small mt-2 mb-0 py-2">
                    {autoFillNotice}
                  </Alert>
                )}
                {autoFillError && (
                  <Alert variant="warning" className="small mt-2 mb-0 py-2">
                    {autoFillError}
                  </Alert>
                )}
              </Form.Group>
            </div>

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
              <Col xs={12}><Form.Group><Form.Label className="small fw-semibold text-secondary">Receipt (optional)</Form.Label><Form.Control type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => setReceipt(e.target.files?.[0] || null)} /><Form.Text>JPEG, PNG, or PDF up to 5 MB.</Form.Text></Form.Group></Col>

              <Col xs={12}>
                <Form.Check
                  type="checkbox"
                  id="recurring-check"
                  checked={recurring}
                  onChange={(e) => setRecurring(e.target.checked)}
                  label="This repeats every month (e.g. rent, a SIP debit)"
                  className="small text-secondary"
                />
                {recurring && (
                  <div className="small text-secondary mt-1">
                    Use "Generate this month's recurring entries" on the All Entries page to create
                    this entry in future months.
                  </div>
                )}
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
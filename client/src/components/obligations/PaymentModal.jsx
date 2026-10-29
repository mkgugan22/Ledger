import { useState } from "react";
import { Alert, Button, Form, Modal, Spinner } from "react-bootstrap";
import { currentDate, fmtINR, monthLabel } from "../../lib/format.js";
import { useToast } from "../../lib/motion/toastContext.js";
import {
  applyDebtPayment,
  defaultBillEntryType,
  findSimilarEntry,
  isValidISODate,
  markBillPaidPatch,
} from "../../lib/obligations.js";

const round2 = (n) => Math.round(n * 100) / 100;

// Confirm step for "mark paid" on a bill and "record payment" on a debt.
//
// Nothing is changed until the person confirms. Optionally it also records the
// payment as a Needs entry; if that succeeds but the bill/debt update then
// fails, the entry is remembered as saved so a retry never adds it twice.
export default function PaymentModal({ kind, item, transactions = [], onClose, onRecordEntry, onApply }) {
  const showToast = useToast();
  const isBill = kind === "bill";
  const outstanding = Number(item.outstandingAmount) || 0;
  const hasDueDate = isValidISODate(item.dueDate);

  const [amount, setAmount] = useState(() => {
    if (isBill) return String(item.amount ?? "");
    const minimum = Number(item.minimumPayment) || 0;
    return String(minimum > 0 ? Math.min(minimum, outstanding) : outstanding);
  });
  const [paidOn, setPaidOn] = useState(currentDate);
  const [type, setType] = useState(() => (isBill ? defaultBillEntryType(item) : String(item.name || "")));
  const [advanceDue, setAdvanceDue] = useState(hasDueDate);
  // Default to recording the entry, unless one that looks the same already exists.
  const [record, setRecord] = useState(() => {
    if (!isBill) return false;
    return !findSimilarEntry(transactions, {
      month: currentDate().slice(0, 7),
      amount: item.amount,
      names: [defaultBillEntryType(item), item.name],
    });
  });
  const [recorded, setRecorded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const entered = Number(amount);
  const validAmount = amount !== "" && Number.isFinite(entered) && entered > 0;
  const validDate = isValidISODate(paidOn);
  const payAmount = validAmount ? round2(isBill ? entered : Math.min(entered, outstanding)) : 0;
  const entryMonth = validDate ? paidOn.slice(0, 7) : "";

  const debtPreview = !isBill && validAmount ? applyDebtPayment(item, entered, { advanceDueDate: advanceDue }) : null;
  const similar = !recorded && validAmount && validDate
    ? findSimilarEntry(transactions, { month: entryMonth, amount: payAmount, names: [type, item.name] })
    : undefined;
  const nextBillDue = isBill && item.recurring ? markBillPaidPatch(item).dueDate : null;

  async function submit(event) {
    event.preventDefault();
    if (busy || !validAmount || !validDate) return;
    if (record && !recorded && !type.trim()) {
      setError("Enter a category for the entry, or untick the box.");
      return;
    }
    setBusy(true);
    setError("");
    let entrySaved = recorded;
    try {
      if (record && !recorded) {
        const entry = await onRecordEntry({
          mode: "Needs",
          type: type.trim(),
          amount: payAmount,
          month: entryMonth,
          date: paidOn,
          merchant: String(item.name || "").slice(0, 160),
          note: `${isBill ? "Bill paid" : "Payment on"}: ${item.name}`.slice(0, 500),
          recurring: false,
        });
        if (!entry) throw new Error("The entry couldn't be saved, so nothing was changed.");
        entrySaved = true;
        setRecorded(true);
      }
      const patch = isBill ? markBillPaidPatch(item) : applyDebtPayment(item, entered, { advanceDueDate: advanceDue }).patch;
      const updated = await onApply(patch);
      if (!updated) {
        throw new Error(
          entrySaved
            ? `The entry was saved, but the ${isBill ? "bill" : "debt"} couldn't be updated. Press the button again to retry — the entry won't be added twice.`
            : `The ${isBill ? "bill" : "debt"} couldn't be updated.`,
        );
      }
      showToast(isBill ? `${item.name} marked as paid` : `Payment recorded on ${item.name}`, "success");
      onClose();
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal show onHide={busy ? undefined : onClose} centered>
      <Form onSubmit={submit}>
        <Modal.Header closeButton={!busy}>
          <Modal.Title className="font-serif fs-5">{isBill ? `Mark “${item.name}” as paid` : `Record a payment on “${item.name}”`}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="d-grid gap-3">
          <div className="d-flex gap-2">
            <Form.Group className="flex-grow-1">
              <Form.Label className="small fw-semibold text-secondary">{isBill ? "Amount paid (₹)" : "Payment amount (₹)"}</Form.Label>
              <Form.Control type="number" min="0" step="0.01" className="font-mono" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus required />
            </Form.Group>
            <Form.Group>
              <Form.Label className="small fw-semibold text-secondary">Paid on</Form.Label>
              <Form.Control type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} required />
            </Form.Group>
          </div>

          {!isBill && (
            <div className="small">
              <Button type="button" size="sm" variant="outline-secondary" onClick={() => setAmount(String(outstanding))}>Pay in full (₹{fmtINR(outstanding)})</Button>
              {debtPreview && (
                <div className="mt-2 text-secondary">
                  {debtPreview.cleared ? "This clears the debt." : `Remaining after this payment: ₹${fmtINR(debtPreview.remaining)}.`}
                  {entered > outstanding && <> The amount is capped at what is outstanding.</>}
                  {" "}Interest isn’t added automatically — adjust the balance if your lender’s figure differs.
                </div>
              )}
              {hasDueDate && !(debtPreview?.cleared) && (
                <Form.Check
                  className="mt-2"
                  type="checkbox"
                  id="advance-due"
                  checked={advanceDue}
                  onChange={(e) => setAdvanceDue(e.target.checked)}
                  label="This was the regular payment — move the due date forward a month"
                />
              )}
            </div>
          )}

          {isBill && (
            <div className="small text-secondary">
              {nextBillDue ? `This bill repeats monthly, so its next due date will move to ${nextBillDue}.` : "This bill will be marked as paid and leave your upcoming list."}
            </div>
          )}

          <div>
            <Form.Check
              type="checkbox"
              id="record-entry"
              checked={record}
              disabled={recorded}
              onChange={(e) => setRecord(e.target.checked)}
              label={recorded ? "Entry already saved" : `Also record this as a Needs entry${entryMonth ? ` in ${monthLabel(entryMonth)}` : ""}`}
            />
            {record && !recorded && (
              <Form.Group className="mt-2">
                <Form.Label className="small fw-semibold text-secondary">Entry category</Form.Label>
                <Form.Control value={type} onChange={(e) => setType(e.target.value)} placeholder="e.g. Rent, Electricity, EMI" />
              </Form.Group>
            )}
            {similar && (
              <Alert variant="warning" className="small py-2 mt-2 mb-0">
                {record
                  ? `A similar entry (${similar.type}, ₹${fmtINR(similar.amount)}) is already in ${monthLabel(entryMonth)}. Untick the box if this payment is already logged, so it isn’t counted twice.`
                  : `A similar entry (${similar.type}, ₹${fmtINR(similar.amount)}) already exists for ${monthLabel(entryMonth)} — leave this unticked to avoid counting it twice.`}
              </Alert>
            )}
          </div>

          {error && <Alert variant="danger" className="small py-2 mb-0">{error}</Alert>}
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="outline-secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy || !validAmount || !validDate}>
            {busy ? <Spinner animation="border" size="sm" /> : isBill ? "Confirm paid" : "Record payment"}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

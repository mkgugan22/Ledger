import { useEffect, useState } from "react";
import { Alert, Button, Modal } from "react-bootstrap";
import { confirmAutoSip, fetchPendingAutoSip, skipAutoSip } from "../../lib/api.js";
import { fmtINR } from "../../lib/format.js";

const formatDay = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const formatMonth = (month) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

// Asks, the first time the app is opened on or after the monthly SIP date, whether to add
// that month's SIP entries. Nothing is written until the user says yes. "Not now" keeps the
// question for the next time the app opens; "Skip this month" closes the month for good.
export default function AutoSipConsent({ onAdded, onReload }) {
  const [queue, setQueue] = useState([]);
  const [later, setLater] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchPendingAutoSip()
      .then((pending) => { if (!cancelled) setQueue(pending); })
      .catch(() => {}); // The prompt is a convenience; a failed check must never get in the way.
    return () => { cancelled = true; };
  }, []);

  const current = queue[0];
  if (!current || later) return null;

  const next = () => { setQueue((prev) => prev.slice(1)); setError(""); };

  async function answer(action) {
    setBusy(true);
    setError("");
    try {
      if (action === "confirm") onAdded(await confirmAutoSip(current.month), current);
      else await skipAutoSip(current.month);
      next();
    } catch (err) {
      if (err.status === 409) {
        // Already answered elsewhere (another tab or device): just show what the server has.
        onReload?.();
        next();
      } else {
        setError(err.message || "Couldn't reach the server. Nothing was added — please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal show centered onHide={() => !busy && setLater(true)} aria-labelledby="auto-sip-title">
      <Modal.Header closeButton={!busy}>
        <Modal.Title id="auto-sip-title" className="font-serif fs-5">{formatMonth(current.month)} SIP</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-2">Your SIP date for {formatMonth(current.month)} is <strong>{formatDay(current.runDate)}</strong>. I'm adding <strong>₹{fmtINR(current.amount)}</strong> to each of these funds:</p>
        <ul className="mb-3">
          {current.funds.map((item) => <li key={item.fund}>{item.fund}</li>)}
        </ul>
        <div className="d-flex justify-content-between border-top pt-2">
          <span className="text-secondary">Total</span>
          <strong className="font-mono">₹{fmtINR(current.total)}</strong>
        </div>
        <small className="text-secondary d-block mt-2">This only records the entries in Ledger (dated {formatDay(current.runDate)}); it doesn't move any money.</small>
        {error && <Alert variant="danger" className="small mt-3 mb-0">{error}</Alert>}
      </Modal.Body>
      <Modal.Footer className="justify-content-between">
        <Button variant="link" className="text-secondary px-0" disabled={busy} onClick={() => answer("skip")}>Skip this month</Button>
        <div className="d-flex gap-2">
          <Button variant="outline-secondary" disabled={busy} onClick={() => setLater(true)}>Not now</Button>
          <Button disabled={busy} onClick={() => answer("confirm")}>{busy ? "Adding…" : `Add ₹${fmtINR(current.total)}`}</Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}

import { useMemo, useState } from "react";
import { Alert, Button, Card, Col, Form, Row, Table } from "react-bootstrap";
import { ArrowDownRight, ArrowUpRight, Calendar, Check, ChevronLeft, ChevronRight, Landmark, Pencil, Plus, Search, X } from "lucide-react";
import PageHeader from "../shared/PageHeader.jsx";
import { createBond, editBond } from "../../lib/api.js";
import { fmtINR } from "../../lib/format.js";

const todayISO = () => new Date().toISOString().slice(0, 10);

function daysBetween(a, b) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

// For each bond (grouped by issuer), the latest "Status" entry is the
// authoritative current snapshot (current market value as of that date).
// Purchase-only bonds (no Status entry yet) fall back to the purchase
// numbers, same pattern as Investment/SipGrowth's fund status rollup.
function buildBondStatus(rows) {
  const byIssuer = new Map();
  for (const item of rows) {
    const key = item.issuer;
    if (!byIssuer.has(key)) byIssuer.set(key, { issuer: key, statusEntry: null, purchaseEntry: null, faceValue: 0, current: 0, bondType: item.bondType || "Government" });
    const bucket = byIssuer.get(key);
    if (item.type === "Status") {
      if (!bucket.statusEntry || item.date >= bucket.statusEntry.date) bucket.statusEntry = item;
    } else {
      if (!bucket.purchaseEntry || item.date <= bucket.purchaseEntry.date) bucket.purchaseEntry = item;
      bucket.faceValue += Number(item.faceValue || 0);
      bucket.current += Number(item.currentValue || item.faceValue || 0);
    }
  }
  return Array.from(byIssuer.values()).map((bucket) => {
    const s = bucket.statusEntry;
    const p = bucket.purchaseEntry;
    const faceValue = p ? Number(p.faceValue) : bucket.faceValue;
    const current = s ? Number(s.currentValue) : bucket.current;
    const gain = current - faceValue;
    const absReturn = faceValue ? (gain / faceValue) * 100 : 0;
    const purchaseDate = p?.purchaseDate || p?.date || null;
    const maturityDate = s?.maturityDate || p?.maturityDate || null;
    const couponRate = s?.couponRate ?? p?.couponRate ?? null;
    const bondType = s?.bondType || p?.bondType || bucket.bondType;

    let progressPct = null;
    let daysToMaturity = null;
    if (purchaseDate && maturityDate) {
      const span = daysBetween(purchaseDate, maturityDate);
      const elapsed = daysBetween(purchaseDate, todayISO());
      if (span > 0) progressPct = Math.min(100, Math.max(0, (elapsed / span) * 100));
      daysToMaturity = daysBetween(todayISO(), maturityDate);
    }

    return {
      issuer: bucket.issuer,
      bondType,
      faceValue,
      current,
      gain,
      absReturn,
      couponRate,
      purchaseDate,
      maturityDate,
      progressPct,
      daysToMaturity,
      asOf: s?.date ?? null,
      statusEntryId: s?.id ?? s?._id ?? null,
    };
  });
}

const HISTORY_PAGE_SIZE = 8;

const FREE_BOND_SOURCES = [
  { label: "RBI Retail Direct", href: "https://rbiretaildirect.org.in/" },
  { label: "NSE — Bonds & Debt segment", href: "https://www.nseindia.com/invest/bonds-debt" },
  { label: "IndiaBonds", href: "https://www.indiabonds.com/" },
  { label: "GoldenPi", href: "https://www.goldenpi.com/" },
  { label: "Value Research", href: "https://www.valueresearchonline.com/" },
  { label: "ClearTax — Bonds", href: "https://cleartax.in/s/bonds" },
];

export default function Bonds({ bonds = [], onBondAdded, onBondUpdated }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ issuer: "", bondType: "Government", type: "Purchase", faceValue: "", currentValue: "", couponRate: "", purchaseDate: "", maturityDate: "", date: "" });
  const [notice, setNotice] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [editingBond, setEditingBond] = useState(null);
  const [editForm, setEditForm] = useState({ currentValue: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const rows = bonds;

  const bondStatus = useMemo(() => buildBondStatus(rows), [rows]);

  const totals = useMemo(
    () => bondStatus.reduce((acc, b) => ({ faceValue: acc.faceValue + b.faceValue, current: acc.current + b.current }), { faceValue: 0, current: 0 }),
    [bondStatus]
  );
  const gain = totals.current - totals.faceValue;
  const gainPct = totals.faceValue ? (gain / totals.faceValue) * 100 : 0;
  const maturingSoon = useMemo(() => bondStatus.filter((b) => b.daysToMaturity != null && b.daysToMaturity >= 0 && b.daysToMaturity <= 365).length, [bondStatus]);

  // Sort newest first so pagination surfaces recent activity by default.
  const sortedRows = useMemo(() => [...rows].sort((a, b) => (b.date || "").localeCompare(a.date || "")), [rows]);
  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return sortedRows;
    return sortedRows.filter((item) => item.issuer?.toLowerCase().includes(q));
  }, [sortedRows, historySearch]);
  const historyTotalPages = Math.max(1, Math.ceil(filteredHistory.length / HISTORY_PAGE_SIZE));
  const historyPageClamped = Math.min(historyPage, historyTotalPages);
  const pagedHistory = filteredHistory.slice((historyPageClamped - 1) * HISTORY_PAGE_SIZE, historyPageClamped * HISTORY_PAGE_SIZE);

  function onHistorySearchChange(value) {
    setHistorySearch(value);
    setHistoryPage(1);
  }

  async function addBond(event) {
    event.preventDefault();
    const isStatus = form.type === "Status";
    if (!form.issuer || (!isStatus && !form.faceValue) || (isStatus && !form.currentValue)) return;

    const payload = {
      issuer: form.issuer.trim(),
      bondType: form.bondType,
      type: form.type,
      faceValue: isStatus ? 0 : Number(form.faceValue),
      currentValue: isStatus ? Number(form.currentValue) : (form.currentValue ? Number(form.currentValue) : Number(form.faceValue)),
      date: isStatus ? (form.date || todayISO()) : (form.purchaseDate || todayISO()),
      ...(form.couponRate ? { couponRate: Number(form.couponRate) } : {}),
      ...(!isStatus && form.purchaseDate ? { purchaseDate: form.purchaseDate } : {}),
      ...(form.maturityDate ? { maturityDate: form.maturityDate } : {}),
    };
    try {
      const saved = await createBond(payload);
      onBondAdded?.(saved);
      setNotice("Bond added.");
    } catch {
      onBondAdded?.({ ...payload, id: `local-${Date.now()}` });
      setNotice("Bond added locally. It will sync when the API is available.");
    }
    setForm({ issuer: "", bondType: "Government", type: "Purchase", faceValue: "", currentValue: "", couponRate: "", purchaseDate: "", maturityDate: "", date: "" });
    setShowForm(false);
  }

  function startEditBond(b) {
    setEditingBond(b.issuer);
    setEditForm({ currentValue: String(b.current ?? "") });
  }

  function cancelEditBond() {
    setEditingBond(null);
  }

  async function saveEditBond(b) {
    if (editForm.currentValue === "") return;
    setSavingEdit(true);
    const payload = {
      issuer: b.issuer,
      bondType: b.bondType,
      type: "Status",
      faceValue: 0,
      currentValue: Number(editForm.currentValue),
      date: todayISO(),
      ...(b.maturityDate ? { maturityDate: b.maturityDate } : {}),
      ...(b.couponRate != null ? { couponRate: b.couponRate } : {}),
    };
    try {
      if (b.statusEntryId) {
        const saved = await editBond(b.statusEntryId, payload);
        onBondUpdated?.(saved);
      } else {
        const saved = await createBond(payload);
        onBondAdded?.(saved);
      }
      setNotice(`${b.issuer} status updated — as of ${payload.date}.`);
      setEditingBond(null);
    } catch (err) {
      setNotice(`Couldn't update ${b.issuer}: ${err.message}`);
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div>
      <PageHeader title="Bonds" subtitle="Track what each bond is worth today, and its progress toward maturity" right={<Button onClick={() => setShowForm((v) => !v)} className="d-inline-flex align-items-center gap-2"><Plus size={16} />Add bond</Button>} />
      {notice && <Alert variant="success" dismissible onClose={() => setNotice("")} className="small">{notice}</Alert>}

      {showForm && (
        <Card className="lg-card mb-4">
          <Card.Body>
            <Form onSubmit={addBond}>
              <Row className="g-3 align-items-end">
                <Col md={3}><Form.Label>Issuer</Form.Label><Form.Control value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })} required placeholder="e.g. 7.18% GOI 2033" /></Col>
                <Col md={2}><Form.Label>Type</Form.Label><Form.Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option>Purchase</option><option>Status</option></Form.Select></Col>
                {form.type === "Purchase" && <Col md={2}><Form.Label>Bond type</Form.Label><Form.Select value={form.bondType} onChange={(e) => setForm({ ...form, bondType: e.target.value })}><option>Government</option><option>Corporate</option><option>Municipal</option><option>PSU</option><option>Other</option></Form.Select></Col>}
                {form.type === "Purchase" ? (
                  <Col md={2}><Form.Label>Face value (₹)</Form.Label><Form.Control type="number" min="0" step="0.01" value={form.faceValue} onChange={(e) => setForm({ ...form, faceValue: e.target.value })} required /></Col>
                ) : (
                  <Col md={2}><Form.Label>Current value (₹)</Form.Label><Form.Control type="number" min="0" step="0.01" value={form.currentValue} onChange={(e) => setForm({ ...form, currentValue: e.target.value })} required /></Col>
                )}
                {form.type === "Purchase" && <Col md={2}><Form.Label>Coupon rate (%)</Form.Label><Form.Control type="number" min="0" step="0.01" value={form.couponRate} onChange={(e) => setForm({ ...form, couponRate: e.target.value })} placeholder="e.g. 7.18" /></Col>}
                {form.type === "Purchase" ? (
                  <Col md={2}><Form.Label>Purchase date</Form.Label><Form.Control type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} required /></Col>
                ) : (
                  <Col md={2}><Form.Label>As-of date</Form.Label><Form.Control type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></Col>
                )}
                {form.type === "Purchase" && <Col md={2}><Form.Label>Maturity date</Form.Label><Form.Control type="date" value={form.maturityDate} onChange={(e) => setForm({ ...form, maturityDate: e.target.value })} required /></Col>}
                <Col md={2}><Button type="submit" className="w-100">Save</Button></Col>
              </Row>
              {form.type === "Status" && <Form.Text className="text-secondary d-block mt-2">A Status entry replaces this bond's current value on this page — it doesn't create a new holding. Record a new one whenever you check its market price.</Form.Text>}
            </Form>
          </Card.Body>
        </Card>
      )}

      <Row className="g-3 mb-4">
        <Col sm={6} lg={3}><Card className="lg-summary-card h-100"><Card.Body><div className="lg-summary-label">Total face value</div><div className="lg-summary-value font-mono">₹{fmtINR(totals.faceValue)}</div><small className="text-secondary">Principal invested</small></Card.Body></Card></Col>
        <Col sm={6} lg={3}><Card className="lg-summary-card h-100"><Card.Body><div className="lg-summary-label">Current value</div><div className="lg-summary-value font-mono">₹{fmtINR(totals.current)}</div><small className="text-secondary">From your latest status entries</small></Card.Body></Card></Col>
        <Col sm={6} lg={3}><Card className="lg-summary-card h-100"><Card.Body><div className="lg-summary-label">Overall gain</div><div className={`lg-summary-value font-mono ${gain >= 0 ? "text-success" : "text-danger"}`}>{gain >= 0 ? "+" : "-"}₹{fmtINR(Math.abs(gain))}</div><small className={gain >= 0 ? "text-success" : "text-danger"}>{gain >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />} {Math.abs(gainPct).toFixed(2)}%</small></Card.Body></Card></Col>
        <Col sm={6} lg={3}><Card className="lg-summary-card h-100"><Card.Body><div className="lg-summary-label">Maturing within a year</div><div className="lg-summary-value font-mono">{maturingSoon}</div><small className="text-secondary">Bond{maturingSoon === 1 ? "" : "s"} to plan around</small></Card.Body></Card></Col>
      </Row>

      <Card className="lg-card mb-4">
        <Card.Body>
          <div className="font-serif mb-3">Current status by bond</div>
          <div className="table-responsive">
            <Table className="lg-table mb-0">
              <thead><tr><th>Bond</th><th className="text-end">Face value</th><th className="text-end">Current value</th><th className="text-end">Gain</th><th className="text-end">Abs. return</th><th className="text-end">Coupon</th><th>Progress to maturity</th><th className="text-end">Actions</th></tr></thead>
              <tbody>
                {bondStatus.map((b) => {
                  const isEditing = editingBond === b.issuer;
                  return (
                    <tr key={b.issuer}>
                      <td>
                        <div className="fw-semibold">{b.issuer}</div>
                        <small className="text-secondary">{b.bondType}{b.asOf ? ` · as of ${b.asOf}` : ""}</small>
                      </td>
                      <td className="text-end font-mono">₹{fmtINR(b.faceValue)}</td>
                      {isEditing ? (
                        <>
                          <td className="text-end"><Form.Control size="sm" type="number" min="0" step="0.01" value={editForm.currentValue} onChange={(e) => setEditForm({ ...editForm, currentValue: e.target.value })} className="text-end" style={{ minWidth: 100 }} /></td>
                          <td className="text-end text-secondary small">auto</td>
                          <td className="text-end text-secondary small">auto</td>
                          <td className="text-end font-mono">{b.couponRate != null ? `${b.couponRate.toFixed(2)}%` : "—"}</td>
                          <td className="text-secondary small">unchanged</td>
                          <td className="text-end">
                            <div className="d-flex justify-content-end gap-1">
                              <Button size="sm" variant="success" disabled={savingEdit} onClick={() => saveEditBond(b)} title="Save"><Check size={14} /></Button>
                              <Button size="sm" variant="outline-secondary" disabled={savingEdit} onClick={cancelEditBond} title="Cancel"><X size={14} /></Button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="text-end font-mono">₹{fmtINR(b.current)}</td>
                          <td className={`text-end font-mono ${b.gain >= 0 ? "text-success" : "text-danger"}`}>{b.gain >= 0 ? "+" : "-"}₹{fmtINR(Math.abs(b.gain))}</td>
                          <td className={`text-end font-mono ${b.absReturn >= 0 ? "text-success" : "text-danger"}`}>{b.absReturn >= 0 ? "+" : ""}{b.absReturn.toFixed(2)}%</td>
                          <td className="text-end font-mono">{b.couponRate != null ? `${b.couponRate.toFixed(2)}%` : "—"}</td>
                          <td style={{ minWidth: 160 }}>
                            {b.progressPct != null ? (
                              <div>
                                <div className="progress" style={{ height: 6 }}>
                                  <div className="progress-bar" role="progressbar" style={{ width: `${b.progressPct}%`, background: "var(--lg-brass)" }} />
                                </div>
                                <small className="text-secondary d-flex align-items-center gap-1 mt-1"><Calendar size={12} />{b.daysToMaturity >= 0 ? `${b.daysToMaturity}d to maturity` : "Matured"}</small>
                              </div>
                            ) : (
                              <small className="text-secondary">Add maturity date</small>
                            )}
                          </td>
                          <td className="text-end"><Button size="sm" variant="outline-secondary" onClick={() => startEditBond(b)} title="Edit"><Pencil size={14} /></Button></td>
                        </>
                      )}
                    </tr>
                  );
                })}
                {bondStatus.length === 0 && (
                  <tr><td colSpan={8} className="text-secondary small text-center py-4">No bonds recorded yet — add your first one above.</td></tr>
                )}
              </tbody>
            </Table>
          </div>
          <small className="text-secondary d-block mt-3">Saving here records today's date as the "as of" snapshot for that bond — it won't affect its original purchase record below.</small>
        </Card.Body>
      </Card>

      <Card className="lg-card mb-4">
        <Card.Body>
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
            <div className="font-serif">Bond history</div>
            <div className="d-flex align-items-center gap-2" style={{ maxWidth: 280, width: "100%" }}>
              <div className="position-relative flex-grow-1">
                <Search size={14} className="position-absolute top-50 translate-middle-y" style={{ left: 10, color: "var(--lg-text-dim)" }} />
                <Form.Control
                  size="sm"
                  placeholder="Search issuer..."
                  value={historySearch}
                  onChange={(e) => onHistorySearchChange(e.target.value)}
                  style={{ paddingLeft: 30 }}
                />
              </div>
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="text-secondary small py-4 text-center">No entries match "{historySearch}".</div>
          ) : (
            <>
              <div className="table-responsive">
                <Table className="lg-table mb-0">
                  <thead><tr><th>Bond</th><th>Type</th><th>Date</th><th className="text-end">Face value</th><th className="text-end">Current value</th><th className="text-end">Gain</th></tr></thead>
                  <tbody>
                    {pagedHistory.map((item) => {
                      const itemGain = Number(item.currentValue || 0) - Number(item.faceValue || 0);
                      return (
                        <tr key={item.id || item._id || item.issuer + item.date + item.type}>
                          <td><div className="fw-semibold">{item.issuer}</div><small className="text-secondary">{item.bondType} · {item.source}</small></td>
                          <td><span className="badge text-bg-light">{item.type}</span></td>
                          <td>{item.date}</td>
                          <td className="text-end font-mono">{item.faceValue ? `₹${fmtINR(item.faceValue)}` : "—"}</td>
                          <td className="text-end font-mono">₹{fmtINR(item.currentValue)}</td>
                          <td className={`text-end font-mono ${itemGain >= 0 ? "text-success" : "text-danger"}`}>{itemGain >= 0 ? "+" : "-"}₹{fmtINR(Math.abs(itemGain))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>

              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-3">
                <small className="text-secondary">
                  Showing {(historyPageClamped - 1) * HISTORY_PAGE_SIZE + 1}–{Math.min(historyPageClamped * HISTORY_PAGE_SIZE, filteredHistory.length)} of {filteredHistory.length}
                </small>
                <div className="d-flex align-items-center gap-2">
                  <Button variant="outline-secondary" size="sm" disabled={historyPageClamped <= 1} onClick={() => setHistoryPage(historyPageClamped - 1)} className="d-inline-flex align-items-center gap-1">
                    <ChevronLeft size={14} /> Prev
                  </Button>
                  <small className="text-secondary">Page {historyPageClamped} of {historyTotalPages}</small>
                  <Button variant="outline-secondary" size="sm" disabled={historyPageClamped >= historyTotalPages} onClick={() => setHistoryPage(historyPageClamped + 1)} className="d-inline-flex align-items-center gap-1">
                    Next <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card.Body>
      </Card>

      <Card className="lg-card">
        <Card.Body>
          <div className="font-serif mb-2 d-flex align-items-center gap-2"><Landmark size={16} color="var(--lg-brass-deep)" />Free bond research sources</div>
          <small className="text-secondary">
            There's no single free, no-signup live-price API for individual bonds the way there is for mutual fund
            NAVs — so checking current status here is a quick manual step. Look your bond up on one of these free
            sources, then record it above as a Status entry:
          </small>
          <div className="d-flex flex-wrap gap-3 mt-3 small">
            {FREE_BOND_SOURCES.map((s) => (
              <a key={s.href} href={s.href} target="_blank" rel="noreferrer">{s.label}</a>
            ))}
          </div>
        </Card.Body>
      </Card>
    </div>
  );
}

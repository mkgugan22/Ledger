import { useState, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, Table, Form, Button, Spinner } from "react-bootstrap";
import { Trash2, Pencil, Check, X, Repeat, Download, Upload, RefreshCw } from "lucide-react";
import PageHeader from "../shared/PageHeader.jsx";
import MonthPicker from "../shared/MonthPicker.jsx";
import EmptyState from "../shared/EmptyState.jsx";
import { MODES, MODE_COLOR } from "../../lib/constants.js";
import { fmtINR, formatINRInput, parseINRInput, monthLabel } from "../../lib/format.js";
import ReceiptLinks from "./ReceiptLinks.jsx";
import { AnimatedTableRow, AnimatedTableRows } from "../../lib/motion/AnimatedTableRows.jsx";

export default function Entries({
  selectedMonth,
  setSelectedMonth,
  monthTx,
  updateTransaction,
  deleteTransaction,
  generateRecurring,
  exportCSV,
  importCSV,
}) {
  // The dashboard's KPI cards link here with ?mode=Needs etc. Anything else
  // (or no param) keeps the original default of showing everything.
  const [searchParams] = useSearchParams();
  const [filterMode, setFilterMode] = useState(() => {
    const requested = searchParams.get("mode");
    return MODES.includes(requested) ? requested : "All";
  });
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({});
  const [generating, setGenerating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const fileInputRef = useRef(null);

  const rows = useMemo(() => {
    const list = filterMode === "All" ? monthTx : monthTx.filter((t) => t.mode === filterMode);
    return [...list].sort((a, b) => (a.date || a.month || "").localeCompare(b.date || b.month || "") || a.mode.localeCompare(b.mode));
  }, [monthTx, filterMode]);

  function startEdit(t) {
    setEditingId(t.id);
    setDraft({ ...t, amount: formatINRInput(t.amount) });
    setStatusMsg("");
  }

  function saveEdit() {
    const parsedAmount = parseINRInput(draft.amount);
    if (!String(draft.type || "").trim()) {
      setStatusMsg("Enter a transaction type before saving.");
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setStatusMsg("Enter a valid amount greater than ₹0. Use up to two decimal places.");
      return;
    }
    updateTransaction(editingId, {
      type: draft.type.trim(),
      amount: parsedAmount,
      month: draft.date ? draft.date.slice(0, 7) : draft.month,
      mode: draft.mode,
      date: draft.date || undefined,
      account: draft.account || "",
      merchant: draft.merchant || "",
      paymentMethod: draft.paymentMethod || "",
      note: draft.note || "",
      recurring: !!draft.recurring,
    });
    setEditingId(null);
    setStatusMsg("Entry update submitted.");
  }

  async function handleGenerateRecurring() {
    if (!generateRecurring) return;
    setGenerating(true);
    setStatusMsg("");
    try {
      const result = await generateRecurring(selectedMonth);
      const createdCount = result?.created?.length || 0;
      setStatusMsg(createdCount > 0
        ? `Generated ${createdCount} recurring ${createdCount === 1 ? "entry" : "entries"} for ${monthLabel(selectedMonth)}.`
        : `Nothing new to generate for ${monthLabel(selectedMonth)} — recurring entries are already up to date.`);
    } catch (err) {
      setStatusMsg(`Couldn't generate recurring entries (${err.message}).`);
    } finally {
      setGenerating(false);
    }
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file || !importCSV) return;
    setImporting(true);
    setStatusMsg("");
    try {
      const text = await file.text();
      const result = await importCSV(text);
      const parts = [`Imported ${result.imported} ${result.imported === 1 ? "entry" : "entries"}.`];
      if (result.failed > 0) parts.push(`${result.failed} row(s) skipped — check formatting and try again.`);
      setStatusMsg(parts.join(" "));
    } catch (err) {
      setStatusMsg(`Couldn't import that file (${err.message}).`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div>
      <PageHeader
        title="All Entries"
        subtitle={monthLabel(selectedMonth)}
        right={<MonthPicker value={selectedMonth} onChange={setSelectedMonth} />}
      />

      <div className="d-flex gap-2 flex-wrap mb-3 align-items-center">
        {["All", ...MODES].map((m) => (
          <button key={m} onClick={() => setFilterMode(m)} className={`lg-filter-chip${filterMode === m ? " active" : ""}`}>{m}</button>
        ))}

        <div className="ms-auto d-flex gap-2 flex-wrap">
          {generateRecurring && (
            <Button size="sm" variant="outline-secondary" onClick={handleGenerateRecurring} disabled={generating}>
              {generating ? <Spinner size="sm" animation="border" className="me-1" /> : <RefreshCw size={14} className="me-1" />}
              Generate this month's recurring entries
            </Button>
          )}
          {exportCSV && (
            <Button size="sm" variant="outline-secondary" onClick={() => exportCSV()}>
              <Download size={14} className="me-1" /> Export CSV
            </Button>
          )}
          {importCSV && (
            <>
              <Button size="sm" variant="outline-secondary" onClick={() => fileInputRef.current?.click()} disabled={importing}>
                {importing ? <Spinner size="sm" animation="border" className="me-1" /> : <Upload size={14} className="me-1" />}
                Import CSV
              </Button>
              <Form.Control ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleImportFile} className="d-none" />
            </>
          )}
        </div>
      </div>

      {statusMsg && <div className="small text-secondary mb-3">{statusMsg}</div>}

      <Card className="lg-card">
        <Card.Body>
          {rows.length === 0 ? (
            <EmptyState text="Nothing logged for this filter yet." />
          ) : (
            <div className="d-none d-md-block table-responsive">
              <Table className="lg-table mb-0" borderless>
                <thead>
                  <tr>
                    <th>Mode</th><th>Type</th><th className="d-none d-md-table-cell">Date</th>
                    <th className="text-end">Amount</th><th className="d-none d-md-table-cell">Merchant</th>
                    <th className="d-none d-md-table-cell">Note</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatedTableRows>
                    {rows.map((t) => (
                      <AnimatedTableRow key={t.id} style={{ borderBottom: "1px solid var(--lg-rule)" }}>
                      {editingId === t.id ? (
                        <>
                          <td style={{ minWidth: 110 }}>
                            <Form.Select size="sm" value={draft.mode} onChange={(e) => setDraft((d) => ({ ...d, mode: e.target.value }))}>
                              {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                            </Form.Select>
                          </td>
                          <td><Form.Control size="sm" value={draft.type} onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))} /></td>
                          <td className="d-none d-md-table-cell">
                            <Form.Control size="sm" type="date" value={draft.date || `${draft.month}-01`} onChange={(e) => { const date = e.target.value; setDraft((d) => ({ ...d, date, ...(date ? { month: date.slice(0, 7) } : {}) })); }} />
                          </td>
                          <td className="text-end">
                            <div className="input-group input-group-sm">
                              <span className="input-group-text">₹</span>
                              <Form.Control size="sm" type="text" inputMode="decimal" value={draft.amount ?? ""} onChange={(e) => setDraft((d) => ({ ...d, amount: formatINRInput(e.target.value) }))} className="font-mono text-end" aria-label="Entry amount in rupees" />
                            </div>
                          </td>
                          <td className="d-none d-md-table-cell"><Form.Control size="sm" value={draft.merchant || ""} onChange={(e) => setDraft((d) => ({ ...d, merchant: e.target.value }))} placeholder="Merchant" /></td>
                          <td className="d-none d-md-table-cell"><Form.Control size="sm" value={draft.note || ""} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} /></td>
                          <td className="text-nowrap">
                            <button className="btn btn-sm btn-link text-secondary p-1" onClick={saveEdit} aria-label="Save entry" title="Save"><Check size={15} /></button>
                            <button className="btn btn-sm btn-link text-secondary p-1" onClick={() => setEditingId(null)} aria-label="Cancel edit" title="Cancel"><X size={15} /></button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td><span className="lg-mode-badge" style={{ background: MODE_COLOR[t.mode] }}>{t.mode}</span></td>
                          <td>{t.type}{t.recurring && <Repeat size={12} className="ms-1 text-secondary" title="Recurring entry" />}</td>
                          <td className="d-none d-md-table-cell text-secondary small">{t.date || `${t.month}-01`}</td>
                          <td className="text-end font-mono">₹{fmtINR(t.amount)}</td>
                          <td className="d-none d-md-table-cell text-secondary small">{t.merchant || "—"}{t.paymentMethod ? ` · ${t.paymentMethod}` : ""}</td>
                          <td className="d-none d-md-table-cell text-secondary small">{t.note}<ReceiptLinks transactionId={t.id} /></td>
                          <td className="text-nowrap">
                            <button className="btn btn-sm btn-link text-secondary p-1" onClick={() => startEdit(t)} aria-label={`Edit ${t.type} entry`} title="Edit"><Pencil size={14} /></button>
                            <button className="btn btn-sm btn-link text-secondary p-1" onClick={() => deleteTransaction(t.id)} aria-label={`Delete ${t.type} entry`} title="Delete"><Trash2 size={14} /></button>
                          </td>
                        </>
                      )}
                      </AnimatedTableRow>
                    ))}
                  </AnimatedTableRows>
                </tbody>
              </Table>
            </div>
          )}
          {rows.length > 0 && (
            <div className="lg-entry-cards d-md-none">
              {rows.map((t) => (
                <article className="lg-entry-mobile-card" key={t.id}>
                  {editingId === t.id ? (
                    <form
                      className="lg-entry-mobile-edit"
                      onSubmit={(event) => { event.preventDefault(); saveEdit(); }}
                      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setEditingId(null); } }}
                    >
                      <div className="lg-entry-mobile-edit-grid">
                        <Form.Select size="sm" aria-label="Entry mode" value={draft.mode} onChange={(e) => setDraft((d) => ({ ...d, mode: e.target.value }))}>
                          {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                        </Form.Select>
                        <Form.Control size="sm" aria-label="Entry type" value={draft.type || ""} onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))} required />
                        <Form.Control size="sm" type="date" aria-label="Entry date" value={draft.date || `${draft.month}-01`} onChange={(e) => { const date = e.target.value; setDraft((d) => ({ ...d, date, ...(date ? { month: date.slice(0, 7) } : {}) })); }} />
                        <div className="input-group input-group-sm">
                          <span className="input-group-text">₹</span>
                          <Form.Control size="sm" type="text" inputMode="decimal" aria-label="Entry amount in rupees" value={draft.amount ?? ""} onChange={(e) => setDraft((d) => ({ ...d, amount: formatINRInput(e.target.value) }))} className="font-mono text-end" required />
                        </div>
                        <Form.Control size="sm" aria-label="Merchant" value={draft.merchant || ""} onChange={(e) => setDraft((d) => ({ ...d, merchant: e.target.value }))} placeholder="Merchant" />
                        <Form.Control size="sm" aria-label="Note" value={draft.note || ""} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} placeholder="Note" />
                      </div>
                      <div className="d-flex justify-content-end gap-2 mt-2">
                        <Button type="button" size="sm" variant="outline-secondary" onClick={() => setEditingId(null)}>Cancel</Button>
                        <Button type="submit" size="sm" variant="primary"><Check size={14} className="me-1" /> Save</Button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="lg-entry-mobile-top">
                        <span className="lg-mode-badge" style={{ background: MODE_COLOR[t.mode] }}>{t.mode}</span>
                        <time className="small text-secondary">{t.date || `${t.month}-01`}</time>
                      </div>
                      <div className="lg-entry-mobile-main">
                        <div className="min-w-0">
                          <div className="fw-semibold">{t.type}{t.recurring && <Repeat size={12} className="ms-1 text-secondary" title="Recurring entry" />}</div>
                          <div className="small text-secondary">{t.merchant || "No merchant"}{t.paymentMethod ? ` · ${t.paymentMethod}` : ""}</div>
                        </div>
                        <div className="lg-entry-mobile-amount">₹{fmtINR(t.amount)}</div>
                      </div>
                      {t.note && <p className="lg-entry-mobile-note">{t.note}</p>}
                      <div className="lg-entry-mobile-receipt"><ReceiptLinks transactionId={t.id} /></div>
                      <div className="lg-entry-mobile-actions">
                        <Button size="sm" variant="outline-secondary" onClick={() => startEdit(t)} aria-label={`Edit ${t.type} entry`}><Pencil size={14} className="me-1" /> Edit</Button>
                        <Button size="sm" variant="outline-danger" onClick={() => deleteTransaction(t.id)} aria-label={`Delete ${t.type} entry`}><Trash2 size={14} className="me-1" /> Delete</Button>
                      </div>
                    </>
                  )}
                </article>
              ))}
            </div>
          )}
        </Card.Body>
      </Card>
    </div>
  );
}

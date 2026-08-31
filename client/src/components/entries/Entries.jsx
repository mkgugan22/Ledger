import { useState, useMemo, useRef } from "react";
import { Card, Table, Form, Button, Spinner } from "react-bootstrap";
import { Trash2, Pencil, Check, X, Repeat, Download, Upload, RefreshCw } from "lucide-react";
import PageHeader from "../shared/PageHeader.jsx";
import MonthPicker from "../shared/MonthPicker.jsx";
import EmptyState from "../shared/EmptyState.jsx";
import { MODES, MODE_COLOR } from "../../lib/constants.js";
import { fmtINR, monthLabel } from "../../lib/format.js";
import ReceiptLinks from "./ReceiptLinks.jsx";

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
  const [filterMode, setFilterMode] = useState("All");
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({});
  const [generating, setGenerating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const fileInputRef = useRef(null);

  const rows = useMemo(() => {
    const list = filterMode === "All" ? monthTx : monthTx.filter((t) => t.mode === filterMode);
    return [...list].sort((a, b) => a.mode.localeCompare(b.mode));
  }, [monthTx, filterMode]);

  function startEdit(t) {
    setEditingId(t.id);
    setDraft({ ...t });
  }
  function saveEdit() {
    updateTransaction(editingId, {
      type: draft.type,
      amount: Number(draft.amount),
      month: draft.month,
      mode: draft.mode,
      note: draft.note,
      recurring: !!draft.recurring, // preserve the recurring flag through inline edits
    });
    setEditingId(null);
  }

  async function handleGenerateRecurring() {
    if (!generateRecurring) return;
    setGenerating(true);
    setStatusMsg("");
    try {
      const result = await generateRecurring(selectedMonth);
      const createdCount = result?.created?.length || 0;
      setStatusMsg(
        createdCount > 0
          ? `Generated ${createdCount} recurring ${createdCount === 1 ? "entry" : "entries"} for ${monthLabel(selectedMonth)}.`
          : `Nothing new to generate for ${monthLabel(selectedMonth)} — recurring entries are already up to date.`
      );
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
          <button
            key={m}
            onClick={() => setFilterMode(m)}
            className={`lg-filter-chip${filterMode === m ? " active" : ""}`}
          >
            {m}
          </button>
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
              <Download size={14} className="me-1" />
              Export CSV
            </Button>
          )}
          {importCSV && (
            <>
              <Button size="sm" variant="outline-secondary" onClick={() => fileInputRef.current?.click()} disabled={importing}>
                {importing ? <Spinner size="sm" animation="border" className="me-1" /> : <Upload size={14} className="me-1" />}
                Import CSV
              </Button>
              <Form.Control
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleImportFile}
                className="d-none"
              />
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
            <div className="table-responsive">
              <Table className="lg-table mb-0" borderless>
                <thead>
                  <tr>
                    <th>Mode</th>
                    <th>Type</th>
                    <th className="text-end">Amount</th>
                    <th className="d-none d-md-table-cell">Note</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id} style={{ borderBottom: "1px solid var(--lg-rule)" }}>
                      {editingId === t.id ? (
                        <>
                          <td style={{ minWidth: 110 }}>
                            <Form.Select
                              size="sm"
                              value={draft.mode}
                              onChange={(e) => setDraft((d) => ({ ...d, mode: e.target.value }))}
                            >
                              {MODES.map((m) => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                            </Form.Select>
                          </td>
                          <td>
                            <Form.Control
                              size="sm"
                              value={draft.type}
                              onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
                            />
                          </td>
                          <td className="text-end">
                            <Form.Control
                              size="sm"
                              type="number"
                              value={draft.amount}
                              onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
                              className="font-mono text-end"
                            />
                          </td>
                          <td className="d-none d-md-table-cell">
                            <Form.Control
                              size="sm"
                              value={draft.note || ""}
                              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                            />
                          </td>
                          <td className="text-nowrap">
                            <button className="btn btn-sm btn-link text-secondary p-1" onClick={saveEdit}>
                              <Check size={15} />
                            </button>
                            <button
                              className="btn btn-sm btn-link text-secondary p-1"
                              onClick={() => setEditingId(null)}
                            >
                              <X size={15} />
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>
                            <span className="lg-mode-badge" style={{ background: MODE_COLOR[t.mode] }}>
                              {t.mode}
                            </span>
                          </td>
                          <td>
                            {t.type}
                            {t.recurring && (
                              <Repeat size={12} className="ms-1 text-secondary" title="Recurring entry" />
                            )}
                          </td>
                          <td className="text-end font-mono">₹{fmtINR(t.amount)}</td>
                          <td className="d-none d-md-table-cell text-secondary small">{t.note}<ReceiptLinks transactionId={t.id} /></td>
                          <td className="text-nowrap">
                            <button className="btn btn-sm btn-link text-secondary p-1" onClick={() => startEdit(t)}>
                              <Pencil size={14} />
                            </button>
                            <button
                              className="btn btn-sm btn-link text-secondary p-1"
                              onClick={() => deleteTransaction(t.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </>
                      )}
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

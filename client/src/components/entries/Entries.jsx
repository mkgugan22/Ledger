import { useState, useMemo } from "react";
import { Card, Table, Form } from "react-bootstrap";
import { Trash2, Pencil, Check, X } from "lucide-react";
import PageHeader from "../shared/PageHeader.jsx";
import MonthPicker from "../shared/MonthPicker.jsx";
import EmptyState from "../shared/EmptyState.jsx";
import { MODES, MODE_COLOR } from "../../lib/constants.js";
import { fmtINR, monthLabel } from "../../lib/format.js";

export default function Entries({
  selectedMonth,
  setSelectedMonth,
  monthTx,
  updateTransaction,
  deleteTransaction,
}) {
  const [filterMode, setFilterMode] = useState("All");
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({});

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
    });
    setEditingId(null);
  }

  return (
    <div>
      <PageHeader
        title="All Entries"
        subtitle={monthLabel(selectedMonth)}
        right={<MonthPicker value={selectedMonth} onChange={setSelectedMonth} />}
      />

      <div className="d-flex gap-2 flex-wrap mb-3">
        {["All", ...MODES].map((m) => (
          <button
            key={m}
            onClick={() => setFilterMode(m)}
            className={`lg-filter-chip${filterMode === m ? " active" : ""}`}
          >
            {m}
          </button>
        ))}
      </div>

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
                          <td>{t.type}</td>
                          <td className="text-end font-mono">₹{fmtINR(t.amount)}</td>
                          <td className="d-none d-md-table-cell text-secondary small">{t.note}</td>
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

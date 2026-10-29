import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import LedgerAI from "./components/ai/LedgerAI.jsx";
import Layout from "./components/layout/Layout.jsx";
import Dashboard from "./components/dashboard/Dashboard.jsx";
import AddEntry from "./components/entry/AddEntry.jsx";
import Entries from "./components/entries/Entries.jsx";
import Budget from "./components/budget/Budget.jsx";
import SavingsTracker from "./components/savings/SavingsTracker.jsx";
import Login from "./components/auth/Login.jsx";
import SipGrowth from "./components/investments/SipGrowth.jsx";
import Bonds from "./components/bonds/Bonds.jsx";
import Obligations from "./components/obligations/Obligations.jsx";
import {
  createTransaction,
  editTransaction,
  fetchBonds,
  fetchInvestments,
  fetchSession,
  fetchTransactions,
  fetchValuations,
  fetchBudgets,
  logout,
  removeTransaction,
  removeValuation,
  upsertValuation,
  generateRecurringTransactions,
  exportTransactionsCSV,
  importTransactionsCSV,
  upsertBudget,
  removeBudget,
  uploadTransactionReceipt,
  fetchDebts,
  createDebt,
  editDebt,
  removeDebt,
  fetchBills,
  createBill,
  editBill,
  removeBill,
  deleteInBackground,
} from "./lib/api.js";
import { currentMonth } from "./lib/format.js";
import { MODES } from "./lib/constants.js";
import { buildAlerts } from "./lib/alerts.js";
import { useToast } from "./lib/motion/toastContext.js";

// How long a deletion can be undone before it is sent to the server.
const UNDO_WINDOW_MS = 5000;

function withoutHidden(list, hidden) {
  return hidden.size ? list.filter((item) => !hidden.has(item.id)) : list;
}

function Protected({ children, user }) {
  return user ? children : <Navigate to="/login" replace />;
}

// Bonds are independent saved records. Retry transient failures once, but do
// not silently turn an API failure into an empty portfolio: an empty array is
// valid data, while a failed request must remain visible to the user.
async function fetchBondsWithRetry() {
  try {
    return await fetchBonds();
  } catch (firstError) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      return await fetchBonds();
    } catch (secondError) {
      throw new Error(`Bond data could not be loaded (${secondError.message || firstError.message}).`, { cause: secondError });
    }
  }
}

export default function App() {
  const showToast = useToast();
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [apiError, setApiError] = useState("");
  // The `all*` lists are what the server has. The lists the rest of the app sees
  // (`transactions`, `valuations`, ...) hide anything whose deletion is still
  // inside its undo window.
  const [allTransactions, setTransactions] = useState([]);
  const [allValuations, setValuations] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [bonds, setBonds] = useState([]);
  const [allBudgets, setBudgets] = useState([]);
  const [allDebts, setDebts] = useState([]);
  const [allBills, setBills] = useState([]);
  const [hiddenIds, setHiddenIds] = useState(() => new Set());
  const pendingDeletes = useRef(new Map());
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [theme, setTheme] = useState(() => localStorage.getItem("ledger-theme") || "light");

  const transactions = useMemo(() => withoutHidden(allTransactions, hiddenIds), [allTransactions, hiddenIds]);
  const valuations = useMemo(() => withoutHidden(allValuations, hiddenIds), [allValuations, hiddenIds]);
  const budgets = useMemo(() => withoutHidden(allBudgets, hiddenIds), [allBudgets, hiddenIds]);
  const debts = useMemo(() => withoutHidden(allDebts, hiddenIds), [allDebts, hiddenIds]);
  const bills = useMemo(() => withoutHidden(allBills, hiddenIds), [allBills, hiddenIds]);

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("ledger-theme", theme); }, [theme]);
  useEffect(() => { const expire = () => setUser(null); window.addEventListener("ledger:session-expired", expire); return () => window.removeEventListener("ledger:session-expired", expire); }, []);
  useEffect(() => { fetchSession().then((result) => setUser(result.user)).catch(() => {}).finally(() => setAuthChecked(true)); }, []);
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [tx, val, inv, bnd, bud, debtItems, billItems] = await Promise.all([
          fetchTransactions(),
          fetchValuations(),
          fetchInvestments().catch(() => []),
          fetchBondsWithRetry(),
          fetchBudgets().catch(() => []),
          fetchDebts().catch(() => []),
          fetchBills().catch(() => []),
        ]);
        setTransactions(tx); setValuations(val); setInvestments(inv); setBonds(bnd); setBudgets(bud); setDebts(debtItems); setBills(billItems);
        setApiError("");
      } catch (err) {
        setApiError(`Couldn't load your saved data (${err.message}). Refresh the page after the API is available.`);
      } finally { setLoaded(true); }
    })();
  }, [user]);

  const unhide = useCallback((id) => {
    setHiddenIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // Deletes are applied on screen straight away but only sent to the server
  // once the undo window has passed. "Undo" simply brings the record back; if
  // the server call later fails, the record reappears with an error message.
  const scheduleDelete = useCallback(({ id, noun, path, remove, onDeleted }) => {
    if (pendingDeletes.current.has(id)) return;
    setHiddenIds((prev) => new Set(prev).add(id));

    const commit = async () => {
      const pending = pendingDeletes.current.get(id);
      if (!pending) return;
      clearTimeout(pending.timer);
      pendingDeletes.current.delete(id);
      try {
        await remove(id);
        onDeleted(id);
      } catch (err) {
        setApiError(`Couldn't delete that ${noun} (${err.message}).`);
      } finally {
        unhide(id);
      }
    };

    const undo = () => {
      const pending = pendingDeletes.current.get(id);
      if (!pending) return;
      clearTimeout(pending.timer);
      pendingDeletes.current.delete(id);
      unhide(id);
    };

    pendingDeletes.current.set(id, { timer: setTimeout(commit, UNDO_WINDOW_MS), path, commit });
    showToast(`${noun.charAt(0).toUpperCase()}${noun.slice(1)} deleted`, "info", UNDO_WINDOW_MS, { action: { label: "Undo", onClick: undo } });
  }, [showToast, unhide]);

  const flushPendingDeletes = useCallback(
    () => Promise.all([...pendingDeletes.current.values()].map((pending) => pending.commit())),
    [],
  );

  // If the tab is closed or reloaded during the undo window, finish the
  // deletions in the background so they aren't silently lost.
  useEffect(() => {
    const finishOnExit = () => {
      pendingDeletes.current.forEach((pending) => {
        clearTimeout(pending.timer);
        deleteInBackground(pending.path);
      });
      pendingDeletes.current.clear();
    };
    window.addEventListener("pagehide", finishOnExit);
    return () => window.removeEventListener("pagehide", finishOnExit);
  }, []);

  const monthTx = useMemo(() => transactions.filter((t) => t.month === selectedMonth), [transactions, selectedMonth]);
  const monthBudgets = useMemo(() => budgets.filter((b) => b.month === selectedMonth), [budgets, selectedMonth]);
  const totals = useMemo(() => { const t = { Income: 0, Needs: 0, Savings: 0, Spending: 0 }; monthTx.forEach((tx) => { t[tx.mode] = (t[tx.mode] || 0) + Number(tx.amount || 0); }); return { ...t, inHand: t.Income - t.Needs - t.Savings - t.Spending }; }, [monthTx]);
  const allMonths = useMemo(() => { const s = new Set(transactions.map((t) => t.month)); s.add(selectedMonth); return Array.from(s).sort(); }, [transactions, selectedMonth]);
  const typeHints = useMemo(() => { const byMode = {}; MODES.forEach((m) => (byMode[m] = new Set())); transactions.forEach((t) => byMode[t.mode]?.add(t.type)); return byMode; }, [transactions]);
  const categoryChartData = useMemo(() => { const byType = {}; monthTx.filter((t) => t.mode !== "Income").forEach((t) => { const key = t.type || "(untitled)"; byType[key] = byType[key] || { name: key, amount: 0, mode: t.mode }; byType[key].amount += Number(t.amount || 0); }); return Object.values(byType).sort((a, b) => b.amount - a.amount); }, [monthTx]);
  const instrumentNames = useMemo(() => { const s = new Set(["SIP", "Digi Gold", "Box Savings", "Account"]); valuations.forEach((v) => s.add(v.instrument)); return Array.from(s); }, [valuations]);
  const trendData = useMemo(() => { const months = Array.from(new Set(valuations.map((v) => v.month))).sort(); return months.map((m) => { const row = { month: m }; instrumentNames.forEach((inst) => { const entry = valuations.find((v) => v.month === m && v.instrument === inst); if (entry) row[inst] = Number(entry.value); }); return row; }); }, [valuations, instrumentNames]);
  const alerts = useMemo(() => buildAlerts({ month: selectedMonth, transactions, budgets, investments, bills, debts }), [selectedMonth, transactions, budgets, investments, bills, debts]);

  // Resolves to the saved entry, or null if it couldn't be saved (the error is
  // shown in the banner). Existing callers can ignore the return value.
  const addTransaction = useCallback(async (entry, receipt) => {
    let doc;
    try {
      doc = await createTransaction(entry);
      setTransactions((prev) => [...prev, doc]);
    } catch (err) {
      setApiError(`Couldn't save that entry (${err.message}).`);
      return null;
    }
    if (receipt) {
      try {
        await uploadTransactionReceipt(doc.id, receipt);
      } catch (err) {
        setApiError(`Entry saved, receipt upload failed (${err.message}).`);
      }
    }
    return doc;
  }, []);
  const updateTransaction = useCallback(async (id, patch) => { try { const doc = await editTransaction(id, patch); setTransactions((prev) => prev.map((t) => (t.id === id ? doc : t))); } catch (err) { setApiError(`Couldn't update that entry (${err.message}).`); } }, []);
  const deleteTransaction = useCallback((id) => scheduleDelete({
    id,
    noun: "entry",
    path: `/transactions/${id}`,
    remove: removeTransaction,
    onDeleted: (done) => setTransactions((prev) => prev.filter((t) => t.id !== done)),
  }), [scheduleDelete]);
  const addValuation = useCallback(async (entry) => { try { const doc = await upsertValuation(entry); setValuations((prev) => { const idx = prev.findIndex((v) => v.month === entry.month && v.instrument === entry.instrument); if (idx >= 0) { const copy = [...prev]; copy[idx] = doc; return copy; } return [...prev, doc]; }); } catch (err) { setApiError(`Couldn't record that valuation (${err.message}).`); } }, []);
  const deleteValuation = useCallback((id) => scheduleDelete({
    id,
    noun: "valuation",
    path: `/valuations/${id}`,
    remove: removeValuation,
    onDeleted: (done) => setValuations((prev) => prev.filter((v) => v.id !== done)),
  }), [scheduleDelete]);

  const generateRecurring = useCallback(async (month) => {
    const result = await generateRecurringTransactions(month);
    if (result.created?.length) setTransactions((prev) => [...prev, ...result.created]);
    return result;
  }, []);

  const exportCSV = useCallback(() => exportTransactionsCSV(), []);

  const importCSV = useCallback(async (csvText) => {
    const result = await importTransactionsCSV(csvText);
    try {
      const fresh = await fetchTransactions();
      setTransactions(fresh);
    } catch {
      // Import already succeeded server-side; a failed refetch just means
      // the UI won't reflect it until the next reload. Not fatal.
    }
    return result;
  }, []);



  const addDebt = useCallback(async (entry) => {
    try {
      const doc = await createDebt(entry);
      setDebts((prev) => [...prev, doc]);
    } catch (err) {
      setApiError(`Couldn't save that debt (${err.message}).`);
    }
  }, []);
  // Resolves to the updated record, or null if the update failed.
  const updateDebt = useCallback(async (id, patch) => {
    try {
      const doc = await editDebt(id, patch);
      setDebts((prev) => prev.map((item) => (item.id === id ? doc : item)));
      return doc;
    } catch (err) {
      setApiError(`Couldn't update that debt (${err.message}).`);
      return null;
    }
  }, []);
  const deleteDebt = useCallback((id) => scheduleDelete({
    id,
    noun: "debt",
    path: `/debts/${id}`,
    remove: removeDebt,
    onDeleted: (done) => setDebts((prev) => prev.filter((item) => item.id !== done)),
  }), [scheduleDelete]);

  const addBill = useCallback(async (entry) => {
    try {
      const doc = await createBill(entry);
      setBills((prev) => [...prev, doc]);
    } catch (err) {
      setApiError(`Couldn't save that bill (${err.message}).`);
    }
  }, []);
  // Resolves to the updated record, or null if the update failed.
  const updateBill = useCallback(async (id, patch) => {
    try {
      const doc = await editBill(id, patch);
      setBills((prev) => prev.map((item) => (item.id === id ? doc : item)));
      return doc;
    } catch (err) {
      setApiError(`Couldn't update that bill (${err.message}).`);
      return null;
    }
  }, []);
  const deleteBill = useCallback((id) => scheduleDelete({
    id,
    noun: "bill",
    path: `/bills/${id}`,
    remove: removeBill,
    onDeleted: (done) => setBills((prev) => prev.filter((item) => item.id !== done)),
  }), [scheduleDelete]);

  const addBudget = useCallback(async (entry) => {
    try {
      const doc = await upsertBudget(entry);
      setBudgets((prev) => {
        const idx = prev.findIndex((b) => b.month === entry.month && b.mode === entry.mode && b.type === entry.type);
        if (idx >= 0) { const copy = [...prev]; copy[idx] = doc; return copy; }
        return [...prev, doc];
      });
    } catch (err) {
      setApiError(`Couldn't save that budget (${err.message}).`);
    }
  }, []);
  const deleteBudget = useCallback((id) => scheduleDelete({
    id,
    noun: "budget",
    path: `/budgets/${id}`,
    remove: removeBudget,
    onDeleted: (done) => setBudgets((prev) => prev.filter((b) => b.id !== done)),
  }), [scheduleDelete]);

  const shared = {
    selectedMonth, setSelectedMonth, defaultMonth: selectedMonth, allMonths, totals, monthTx, transactions, investments, bonds,
    categoryChartData, typeHints, valuations, instrumentNames, trendData,
    addTransaction, updateTransaction, deleteTransaction, addValuation, deleteValuation,
    generateRecurring, exportCSV, importCSV,
    monthBudgets, addBudget, deleteBudget, alerts, debts, bills,
  };

  const addInvestmentItem = useCallback((item) => setInvestments((prev) => [...prev, item]), []);
  const updateInvestmentItem = useCallback((item) => setInvestments((prev) => prev.map((it) => ((it.id || it._id) === (item.id || item._id) ? item : it))), []);
  const addBondItem = useCallback((item) => setBonds((prev) => [...prev, item]), []);
  const updateBondItem = useCallback((item) => setBonds((prev) => prev.map((it) => ((it.id || it._id) === (item.id || item._id) ? item : it))), []);

  if (!authChecked) return <div className="d-flex align-items-center justify-content-center" style={{ minHeight: "100vh" }}><span className="font-serif text-secondary">Opening the ledger…</span></div>;
  return <BrowserRouter>
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login onAuthenticated={setUser} />} />
      <Route element={<Protected user={user}><Layout apiError={apiError} user={user} theme={theme} onThemeToggle={() => setTheme(theme === "light" ? "dark" : "light")} onLogout={async () => { await flushPendingDeletes(); await logout().catch(() => {}); setUser(null); }} /></Protected>}>
        <Route index element={loaded ? <Dashboard {...shared} /> : <div className="py-5 text-secondary">Loading your entries…</div>} />
        <Route path="add" element={<AddEntry {...shared} />} />
        <Route path="entries" element={<Entries {...shared} />} />
        <Route path="budget" element={<Budget {...shared} />} />
        <Route path="savings" element={<SavingsTracker {...shared} />} />
        <Route path="sip-growth" element={<SipGrowth investments={investments} onInvestmentAdded={addInvestmentItem} onInvestmentUpdated={updateInvestmentItem} />} />
        <Route path="bonds" element={<Bonds bonds={bonds} investments={investments} onBondAdded={addBondItem} onBondUpdated={updateBondItem} />} />
        <Route path="obligations" element={<Obligations debts={debts} bills={bills} transactions={transactions} addTransaction={addTransaction} addDebt={addDebt} updateDebt={updateDebt} deleteDebt={deleteDebt} addBill={addBill} updateBill={updateBill} deleteBill={deleteBill} />} />
        <Route path="ledger-ai" element={<LedgerAI />} />
      </Route>
    </Routes>
  </BrowserRouter>;
}

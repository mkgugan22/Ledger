import { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/layout/Layout.jsx";
import Dashboard from "./components/dashboard/Dashboard.jsx";
import AddEntry from "./components/entry/AddEntry.jsx";
import Entries from "./components/entries/Entries.jsx";
import SavingsTracker from "./components/savings/SavingsTracker.jsx";
import Login from "./components/auth/Login.jsx";
import SipGrowth from "./components/investments/SipGrowth.jsx";
import { createTransaction, editTransaction, fetchInvestments, fetchSession, fetchTransactions, fetchValuations, logout, removeTransaction, removeValuation, upsertValuation } from "./lib/api.js";
import { currentMonth } from "./lib/format.js";
import { MODES } from "./lib/constants.js";

function Protected({ children, user }) {
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [apiError, setApiError] = useState("");
  const [transactions, setTransactions] = useState([]);
  const [valuations, setValuations] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [theme, setTheme] = useState(() => localStorage.getItem("ledger-theme") || "light");

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("ledger-theme", theme); }, [theme]);
  useEffect(() => { const expire = () => setUser(null); window.addEventListener("ledger:session-expired", expire); return () => window.removeEventListener("ledger:session-expired", expire); }, []);
  useEffect(() => { fetchSession().then((result) => setUser(result.user)).catch(() => {}).finally(() => setAuthChecked(true)); }, []);
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [tx, val, inv] = await Promise.all([fetchTransactions(), fetchValuations(), fetchInvestments().catch(() => [])]);
        setTransactions(tx); setValuations(val); setInvestments(inv);
      } catch (err) { setApiError(`Couldn't reach the server (${err.message}). Reconnect the API to load your saved data.`); }
      finally { setLoaded(true); }
    })();
  }, [user]);

  const monthTx = useMemo(() => transactions.filter((t) => t.month === selectedMonth), [transactions, selectedMonth]);
  const totals = useMemo(() => { const t = { Income: 0, Needs: 0, Savings: 0, Spending: 0 }; monthTx.forEach((tx) => { t[tx.mode] = (t[tx.mode] || 0) + Number(tx.amount || 0); }); return { ...t, inHand: t.Income - t.Needs - t.Savings - t.Spending }; }, [monthTx]);
  const allMonths = useMemo(() => { const s = new Set(transactions.map((t) => t.month)); s.add(selectedMonth); return Array.from(s).sort(); }, [transactions, selectedMonth]);
  const typeHints = useMemo(() => { const byMode = {}; MODES.forEach((m) => (byMode[m] = new Set())); transactions.forEach((t) => byMode[t.mode]?.add(t.type)); return byMode; }, [transactions]);
  const categoryChartData = useMemo(() => { const byType = {}; monthTx.filter((t) => t.mode !== "Income").forEach((t) => { const key = t.type || "(untitled)"; byType[key] = byType[key] || { name: key, amount: 0, mode: t.mode }; byType[key].amount += Number(t.amount || 0); }); return Object.values(byType).sort((a, b) => b.amount - a.amount); }, [monthTx]);
  const instrumentNames = useMemo(() => { const s = new Set(["SIP", "Digi Gold", "Box Savings", "Account"]); valuations.forEach((v) => s.add(v.instrument)); return Array.from(s); }, [valuations]);
  const trendData = useMemo(() => { const months = Array.from(new Set(valuations.map((v) => v.month))).sort(); return months.map((m) => { const row = { month: m }; instrumentNames.forEach((inst) => { const entry = valuations.find((v) => v.month === m && v.instrument === inst); if (entry) row[inst] = Number(entry.value); }); return row; }); }, [valuations, instrumentNames]);

  const addTransaction = useCallback(async (entry) => {
    try {
      const doc = await createTransaction(entry);
      setTransactions((prev) => [...prev, doc]);
    } catch (err) {
      setApiError(`Couldn't save that entry (${err.message}).`);
    }
  }, []);
  const updateTransaction = useCallback(async (id, patch) => { try { const doc = await editTransaction(id, patch); setTransactions((prev) => prev.map((t) => (t.id === id ? doc : t))); } catch (err) { setApiError(`Couldn't update that entry (${err.message}).`); } }, []);
  const deleteTransaction = useCallback(async (id) => { try { await removeTransaction(id); setTransactions((prev) => prev.filter((t) => t.id !== id)); } catch (err) { setApiError(`Couldn't delete that entry (${err.message}).`); } }, []);
  const addValuation = useCallback(async (entry) => { try { const doc = await upsertValuation(entry); setValuations((prev) => { const idx = prev.findIndex((v) => v.month === entry.month && v.instrument === entry.instrument); if (idx >= 0) { const copy = [...prev]; copy[idx] = doc; return copy; } return [...prev, doc]; }); } catch (err) { setApiError(`Couldn't record that valuation (${err.message}).`); } }, []);
  const deleteValuation = useCallback(async (id) => { try { await removeValuation(id); setValuations((prev) => prev.filter((v) => v.id !== id)); } catch (err) { setApiError(`Couldn't delete that valuation (${err.message}).`); } }, []);
  const shared = { selectedMonth, setSelectedMonth, defaultMonth: selectedMonth, allMonths, totals, monthTx, categoryChartData, typeHints, valuations, instrumentNames, trendData, addTransaction, updateTransaction, deleteTransaction, addValuation, deleteValuation };

  const addInvestmentItem = useCallback((item) => setInvestments((prev) => [...prev, item]), []);
  const updateInvestmentItem = useCallback((item) => setInvestments((prev) => prev.map((it) => ((it.id || it._id) === (item.id || item._id) ? item : it))), []);

  if (!authChecked) return <div className="d-flex align-items-center justify-content-center" style={{ minHeight: "100vh" }}><span className="font-serif text-secondary">Opening the ledger…</span></div>;
  return <BrowserRouter>
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login onAuthenticated={setUser} />} />
      <Route element={<Protected user={user}><Layout apiError={apiError} user={user} theme={theme} onThemeToggle={() => setTheme(theme === "light" ? "dark" : "light")} onLogout={async () => { await logout().catch(() => {}); setUser(null); }} /></Protected>}>
        <Route index element={loaded ? <Dashboard {...shared} /> : <div className="py-5 text-secondary">Loading your entries…</div>} />
        <Route path="add" element={<AddEntry {...shared} />} />
        <Route path="entries" element={<Entries {...shared} />} />
        <Route path="savings" element={<SavingsTracker {...shared} />} />
        <Route path="sip-growth" element={<SipGrowth investments={investments} onInvestmentAdded={addInvestmentItem} onInvestmentUpdated={updateInvestmentItem} />} />
      </Route>
    </Routes>
  </BrowserRouter>;
}

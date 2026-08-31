const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      ...options,
    });
  } catch {
    throw new Error("Can't reach the server. It may be down or misconfigured — please try again in a moment.");
  }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/auth/")) window.dispatchEvent(new Event("ledger:session-expired"));
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

// Normalize Mongo's `_id` to `id` so components don't need to know
// which storage backend is in play.
function withId(doc) {
  return { ...doc, id: doc._id };
}

// List endpoints return an array for legacy callers and { items, ... } only
// when pagination is requested. Accept both forms so a rolling API deploy or
// a pagination-aware caller cannot crash the dashboard.
function collection(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.items)) return body.items;
  throw new Error("The server returned an invalid list response.");
}

export const fetchTransactions = async () => collection(await request("/transactions")).map(withId);
export const createTransaction = async (data) => withId(await request("/transactions", { method: "POST", body: JSON.stringify(data) }));
export const editTransaction = async (id, data) => withId(await request(`/transactions/${id}`, { method: "PUT", body: JSON.stringify(data) }));
export const removeTransaction = (id) => request(`/transactions/${id}`, { method: "DELETE" });
export async function uploadTransactionReceipt(transactionId, file) {
  if (!file || file.size > 5 * 1024 * 1024) throw new Error("Choose a JPEG, PNG, or PDF under 5 MB.");
  if (!["image/jpeg", "image/png", "application/pdf"].includes(file.type)) throw new Error("Only JPEG, PNG, and PDF receipts are supported.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return request(`/transactions/${transactionId}/receipts`, { method: "POST", body: JSON.stringify({ filename: file.name, contentType: file.type, data: btoa(binary) }) });
}
export const fetchTransactionReceipts = (transactionId) => request(`/transactions/${transactionId}/receipts`);
export const transactionReceiptUrl = (transactionId, receiptId) => `${API_URL}/transactions/${transactionId}/receipts/${receiptId}`;

// Auto-fill: sends a payslip PDF to the server for text extraction and gets
// back a suggested { mode, type, amount, month, note } to prefill the Add
// Entry form. Read-only — this never creates a transaction on its own.
export async function parsePayslipDocument(file) {
  if (!file || file.size > 5 * 1024 * 1024) throw new Error("Choose a PDF under 5 MB.");
  if (file.type !== "application/pdf") throw new Error("Only PDF payslips are supported for auto-fill.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  const res = await request("/documents/parse-payslip", {
    method: "POST",
    body: JSON.stringify({ filename: file.name, contentType: file.type, data: btoa(binary) }),
  });
  return res.suggestion;
}

// Recurring transactions: ask the server to materialize this month's
// entries from every template (recurring: true) the user has. Safe to call
// more than once for the same month — already-generated entries are
// skipped server-side.
export const generateRecurringTransactions = async (month) => {
  const result = await request("/transactions/generate-recurring", { method: "POST", body: JSON.stringify({ month }) });
  return { ...result, created: result.created.map(withId) };
};

// CSV export downloads a file directly rather than going through the JSON
// `request()` helper — it does its own fetch + blob handling and triggers
// the browser's save dialog.
export async function exportTransactionsCSV() {
  const res = await fetch(`${API_URL}/transactions/export`, { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Export failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ledger-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// CSV import: send raw file text, get back { imported, failed, errors }
// where errors is a list of { line, error } for rows that were skipped.
export const importTransactionsCSV = (csvText) =>
  request("/transactions/import", { method: "POST", body: JSON.stringify({ csv: csvText }) });

export const fetchValuations = async () => collection(await request("/valuations")).map(withId);
export const upsertValuation = async (data) => withId(await request("/valuations", { method: "POST", body: JSON.stringify(data) }));
export const removeValuation = (id) => request(`/valuations/${id}`, { method: "DELETE" });

export const login = (data) => request("/auth/login", { method: "POST", body: JSON.stringify(data) });
export const register = (data) => request("/auth/register", { method: "POST", body: JSON.stringify(data) });
export const fetchSession = () => request("/auth/me");
export const logout = () => request("/auth/logout", { method: "POST" });

export const fetchInvestments = async () => collection(await request("/investments")).map(withId);
export const createInvestment = async (data) => withId(await request("/investments", { method: "POST", body: JSON.stringify(data) }));
export const editInvestment = async (id, data) => withId(await request(`/investments/${id}`, { method: "PUT", body: JSON.stringify(data) }));
export const removeInvestment = (id) => request(`/investments/${id}`, { method: "DELETE" });
export const searchMarketFunds = (query) => request(`/market/search?q=${encodeURIComponent(query)}`);
export const fetchMarketFund = (schemeCode) => request(`/market/${encodeURIComponent(schemeCode)}`);

export const fetchBudgets = async (month) => collection(await request(month ? `/budgets?month=${encodeURIComponent(month)}` : "/budgets")).map(withId);
export const upsertBudget = async (data) => withId(await request("/budgets", { method: "POST", body: JSON.stringify(data) }));
export const removeBudget = (id) => request(`/budgets/${id}`, { method: "DELETE" });
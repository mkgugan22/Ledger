const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

// `timeoutMs` is an optional, opt-in addition to the normal fetch options.
// When omitted (every existing call site keeps working exactly as before —
// no AbortController is created and the request waits as long as it always
// did). When provided, the request is aborted after `timeoutMs` and a clear,
// user-facing error is thrown instead of leaving the caller's "loading"
// state spinning forever with nothing to show.
async function request(path, options = {}) {
  const { timeoutMs, ...fetchOptions } = options;

  let controller;
  let timeoutId;

  if (timeoutMs) {
    controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  }

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      ...fetchOptions,
      ...(controller ? { signal: controller.signal } : {}),
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("Ledger AI is taking longer than usual to respond. Please try again in a moment.");
    }
    throw new Error("Can't reach the server. It may be down or misconfigured — please try again in a moment.");
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/auth/")) window.dispatchEvent(new Event("ledger:session-expired"));
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

function withId(doc) {
  return { ...doc, id: doc._id };
}

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

export const generateRecurringTransactions = async (month) => {
  const result = await request("/transactions/generate-recurring", { method: "POST", body: JSON.stringify({ month }) });
  return { ...result, created: result.created.map(withId) };
};

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
export const fetchBonds = async () => collection(await request("/bonds")).map(withId);
export const createBond = async (data) => withId(await request("/bonds", { method: "POST", body: JSON.stringify(data) }));
export const editBond = async (id, data) => withId(await request(`/bonds/${id}`, { method: "PUT", body: JSON.stringify(data) }));
export const removeBond = (id) => request(`/bonds/${id}`, { method: "DELETE" });
export const fetchBudgets = async (month) => collection(await request(month ? `/budgets?month=${encodeURIComponent(month)}` : "/budgets")).map(withId);
export const upsertBudget = async (data) => withId(await request("/budgets", { method: "POST", body: JSON.stringify(data) }));
export const removeBudget = (id) => request(`/budgets/${id}`, { method: "DELETE" });

export const fetchLedgerAIHistory = () => request("/ai/history");

const STREAM_ERROR_MARKER = "\u0000LEDGER_AI_STREAM_ERROR\u0000";

export function chatWithLedgerAI({ message, history }, onChunk) {
  return new Promise((resolve, reject) => {
    (async () => {
      const controller = new AbortController();
      let idleTimeout;

      const resetIdleTimeout = () => {
        clearTimeout(idleTimeout);
        idleTimeout = setTimeout(() => controller.abort(), 30000);
      };

      resetIdleTimeout();

      let res;
      try {
        res = await fetch(`${API_URL}/ai/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ message, history }),
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(idleTimeout);
        if (err.name === "AbortError") {
          reject(new Error("Ledger AI is taking longer than usual to respond. Please try again in a moment."));
        } else {
          reject(new Error("Can't reach the server. It may be down or misconfigured — please try again in a moment."));
        }
        return;
      }

      if (!res.ok) {
        clearTimeout(idleTimeout);
        if (res.status === 401) window.dispatchEvent(new Event("ledger:session-expired"));
        const body = await res.json().catch(() => ({}));
        reject(new Error(body.error || `Request failed (${res.status})`));
        return;
      }

      const finish = (text) => {
        const markerIndex = text.indexOf(STREAM_ERROR_MARKER);
        if (markerIndex !== -1) {
          const message = text.slice(markerIndex + STREAM_ERROR_MARKER.length).trim();
          reject(new Error(message || "Ledger AI could not answer right now."));
          return;
        }
        resolve({ answer: text.trim(), generatedAt: new Date().toISOString() });
      };

      if (!res.body) {
        clearTimeout(idleTimeout);
        finish(await res.text());
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      let reportedLength = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          resetIdleTimeout();
          full += decoder.decode(value, { stream: true });

          if (full.indexOf(STREAM_ERROR_MARKER) === -1 && onChunk && full.length > reportedLength) {
            onChunk(full.slice(reportedLength));
            reportedLength = full.length;
          }
        }
      } catch (err) {
        clearTimeout(idleTimeout);
        if (err.name === "AbortError") {
          reject(new Error("Ledger AI is taking longer than usual to respond. Please try again in a moment."));
        } else {
          reject(new Error("Can't reach the server. It may be down or misconfigured — please try again in a moment."));
        }
        return;
      }

      clearTimeout(idleTimeout);
      finish(full);
    })();
  });
}

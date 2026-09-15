const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TRANSIENT_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 400;

const inflightRequests = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function retryDelay(attempt, retryAfterHeader) {
  const retryAfterSeconds = Number(retryAfterHeader);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.min(retryAfterSeconds * 1000, 5000);
  }
  return Math.min(RETRY_BASE_DELAY_MS * (2 ** attempt) + Math.floor(Math.random() * 150), 3000);
}

async function parseError(res) {
  const body = await res.json().catch(() => ({}));
  const error = new Error(body.error || `Request failed (${res.status})`);
  error.status = res.status;
  return error;
}

function requestKey(path, fetchOptions, dedupe) {
  if (!dedupe || (fetchOptions.method || "GET").toUpperCase() !== "GET") return null;
  return `GET:${path}`;
}

async function request(path, options = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = MAX_TRANSIENT_RETRIES,
    dedupe = false,
    signal: callerSignal,
    ...fetchOptions
  } = options;

  const key = requestKey(path, fetchOptions, dedupe);
  if (key && inflightRequests.has(key)) return inflightRequests.get(key);

  const run = (async () => {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      let timeoutId;

      const abortFromCaller = () => controller.abort();
      callerSignal?.addEventListener("abort", abortFromCaller, { once: true });

      if (timeoutMs > 0) timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(`${API_URL}${path}`, {
          headers: { "Content-Type": "application/json", ...(fetchOptions.headers || {}) },
          credentials: "include",
          ...fetchOptions,
          signal: controller.signal,
        });

        if (res.ok) return res.json();

        if (res.status === 401 && !path.startsWith("/auth/")) {
          window.dispatchEvent(new Event("ledger:session-expired"));
          throw await parseError(res);
        }

        if (attempt < retries && isRetryableStatus(res.status) && res.status !== 401) {
          await retryDelay(attempt, res.headers.get("retry-after"))
            |> ((delay) => sleep(delay));
          continue;
        }
        throw await parseError(res);
      } catch (err) {
        if (callerSignal?.aborted) throw err;
        if (err.name === "AbortError") {
          const timeoutError = new Error("Request timed out. Please try again in a moment.");
          timeoutError.code = "TIMEOUT";
          if (attempt < retries) {
            await sleep(retryDelay(attempt));
            continue;
          }
          throw timeoutError;
        }
        if (attempt < retries && !err.status) {
          await sleep(retryDelay(attempt));
          continue;
        }
        throw err;
      } finally {
        clearTimeout(timeoutId);
        callerSignal?.removeEventListener("abort", abortFromCaller);
      }
    }
    throw new Error("Request failed unexpectedly.");
  })();

  if (key) {
    inflightRequests.set(key, run);
    try {
      return await run;
    } finally {
      if (inflightRequests.get(key) === run) inflightRequests.delete(key);
    }
  }
  return run;
}

// Normalize Mongo's `_id` to `id` so components don't need to know
// which storage backend is in play.
function withId(doc) {
  return { ...doc, id: doc._id };
}

function collection(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.items)) return body.items;
  throw new Error("The server returned an invalid list response.");
}

export const fetchTransactions = async (options = {}) => collection(await request("/transactions", { dedupe: true, ...options })).map(withId);
export const createTransaction = async (data) => withId(await request("/transactions", { method: "POST", body: JSON.stringify(data), retries: 0 }));
export const editTransaction = async (id, data) => withId(await request(`/transactions/${id}`, { method: "PUT", body: JSON.stringify(data), retries: 0 }));
export const removeTransaction = (id) => request(`/transactions/${id}`, { method: "DELETE", retries: 0 });
export async function uploadTransactionReceipt(transactionId, file) {
  if (!file || file.size > 5 * 1024 * 1024) throw new Error("Choose a JPEG, PNG, or PDF under 5 MB.");
  if (!["image/jpeg", "image/png", "application/pdf"].includes(file.type)) throw new Error("Only JPEG, PNG, and PDF receipts are supported.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return request(`/transactions/${transactionId}/receipts`, { method: "POST", body: JSON.stringify({ filename: file.name, contentType: file.type, data: btoa(binary) }), retries: 0 });
}
export const fetchTransactionReceipts = (transactionId, options = {}) => request(`/transactions/${transactionId}/receipts`, { dedupe: true, ...options });
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
    retries: 0,
    timeoutMs: 60_000,
  });
  return res.suggestion;
}

export const generateRecurringTransactions = async (month) => {
  const result = await request("/transactions/generate-recurring", { method: "POST", body: JSON.stringify({ month }), retries: 0, timeoutMs: 60_000 });
  return { ...result, created: result.created.map(withId) };
};

export async function exportTransactionsCSV() {
  const res = await fetch(`${API_URL}/transactions/export`, { credentials: "include" });
  if (!res.ok) throw await parseError(res);
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

export const importTransactionsCSV = (csvText) => request("/transactions/import", { method: "POST", body: JSON.stringify({ csv: csvText }), retries: 0, timeoutMs: 60_000 });

export const fetchValuations = async (options = {}) => collection(await request("/valuations", { dedupe: true, ...options })).map(withId);
export const upsertValuation = async (data) => withId(await request("/valuations", { method: "POST", body: JSON.stringify(data), retries: 0 }));
export const removeValuation = (id) => request(`/valuations/${id}`, { method: "DELETE", retries: 0 });

export const login = (data) => request("/auth/login", { method: "POST", body: JSON.stringify(data), retries: 0 });
export const register = (data) => request("/auth/register", { method: "POST", body: JSON.stringify(data), retries: 0 });
export const fetchSession = (options = {}) => request("/auth/me", { dedupe: true, retries: 0, ...options });
export const logout = () => request("/auth/logout", { method: "POST", retries: 0 });

export const fetchInvestments = async (options = {}) => collection(await request("/investments", { dedupe: true, ...options })).map(withId);
export const createInvestment = async (data) => withId(await request("/investments", { method: "POST", body: JSON.stringify(data), retries: 0 }));
export const editInvestment = async (id, data) => withId(await request(`/investments/${id}`, { method: "PUT", body: JSON.stringify(data), retries: 0 }));
export const removeInvestment = (id) => request(`/investments/${id}`, { method: "DELETE", retries: 0 });
export const searchMarketFunds = (query, options = {}) => request(`/market/search?q=${encodeURIComponent(query)}`, { dedupe: true, ...options });
export const fetchMarketFund = (schemeCode, options = {}) => request(`/market/${encodeURIComponent(schemeCode)}`, { dedupe: true, ...options });
export const fetchBonds = async (options = {}) => collection(await request("/bonds", { dedupe: true, ...options })).map(withId);
export const createBond = async (data) => withId(await request("/bonds", { method: "POST", body: JSON.stringify(data), retries: 0 }));
export const editBond = async (id, data) => withId(await request(`/bonds/${id}`, { method: "PUT", body: JSON.stringify(data), retries: 0 }));
export const removeBond = (id) => request(`/bonds/${id}`, { method: "DELETE", retries: 0 });
export const fetchBudgets = async (month, options = {}) => collection(await request(month ? `/budgets?month=${encodeURIComponent(month)}` : "/budgets", { dedupe: true, ...options })).map(withId);
export const upsertBudget = async (data) => withId(await request("/budgets", { method: "POST", body: JSON.stringify(data), retries: 0 }));
export const removeBudget = (id) => request(`/budgets/${id}`, { method: "DELETE", retries: 0 });

export const fetchLedgerAIHistory = (options = {}) => request("/ai/history", { dedupe: true, ...options });

const STREAM_ERROR_MARKER = "\u0000LEDGER_AI_STREAM_ERROR\u0000";

export function chatWithLedgerAI({ message, history }, onChunk, options = {}) {
  const { signal: externalSignal } = options;
  return new Promise((resolve, reject) => {
    (async () => {
      const controller = new AbortController();
      let idleTimeout;
      const abortFromExternal = () => controller.abort();
      externalSignal?.addEventListener("abort", abortFromExternal, { once: true });

      const resetIdleTimeout = () => {
        clearTimeout(idleTimeout);
        idleTimeout = setTimeout(() => controller.abort(), 30_000);
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
        externalSignal?.removeEventListener("abort", abortFromExternal);
        if (err.name === "AbortError") reject(new Error("Ledger AI is taking longer than usual to respond. Please try again in a moment."));
        else reject(new Error("Can't reach the server. It may be down or misconfigured — please try again in a moment."));
        return;
      }

      if (!res.ok) {
        clearTimeout(idleTimeout);
        externalSignal?.removeEventListener("abort", abortFromExternal);
        if (res.status === 401) window.dispatchEvent(new Event("ledger:session-expired"));
        reject(await parseError(res));
        return;
      }

      const finish = (text) => {
        const markerIndex = text.indexOf(STREAM_ERROR_MARKER);
        if (markerIndex !== -1) {
          const messageText = text.slice(markerIndex + STREAM_ERROR_MARKER.length).trim();
          reject(new Error(messageText || "Ledger AI could not answer right now."));
          return;
        }
        resolve({ answer: text.trim(), generatedAt: new Date().toISOString() });
      };

      if (!res.body) {
        clearTimeout(idleTimeout);
        externalSignal?.removeEventListener("abort", abortFromExternal);
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
        externalSignal?.removeEventListener("abort", abortFromExternal);
        if (err.name === "AbortError") reject(new Error("Ledger AI is taking longer than usual to respond. Please try again in a moment."));
        else reject(new Error("Can't reach the server. It may be down or misconfigured — please try again in a moment."));
        return;
      }
      clearTimeout(idleTimeout);
      externalSignal?.removeEventListener("abort", abortFromExternal);
      finish(full);
    })();
  });
}

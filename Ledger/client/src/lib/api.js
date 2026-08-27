const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
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

export const fetchTransactions = async () => (await request("/transactions")).map(withId);
export const createTransaction = async (data) => withId(await request("/transactions", { method: "POST", body: JSON.stringify(data) }));
export const editTransaction = async (id, data) => withId(await request(`/transactions/${id}`, { method: "PUT", body: JSON.stringify(data) }));
export const removeTransaction = (id) => request(`/transactions/${id}`, { method: "DELETE" });

export const fetchValuations = async () => (await request("/valuations")).map(withId);
export const upsertValuation = async (data) => withId(await request("/valuations", { method: "POST", body: JSON.stringify(data) }));
export const removeValuation = (id) => request(`/valuations/${id}`, { method: "DELETE" });

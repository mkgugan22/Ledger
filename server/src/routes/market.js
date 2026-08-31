import { Router } from "express";

const router = Router();
const MFAPI = "https://api.mfapi.in/mf";

async function upstream(path) {
  const response = await fetch(`${MFAPI}${path}`, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Market data provider returned ${response.status}`);
  return response.json();
}

// The full scheme list (~20k+ entries) rarely changes and mfapi.in has no
// per-scheme search endpoint, so every /search request used to re-download
// and re-filter the entire list. Cache it in-memory with a TTL instead —
// simple module-level state is enough at this app's scale (single process,
// no need for Redis/shared cache).
const SCHEME_LIST_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
let schemeListCache = { data: null, fetchedAt: 0 };
let inFlightFetch = null;

async function getSchemeList() {
  const isFresh = schemeListCache.data && Date.now() - schemeListCache.fetchedAt < SCHEME_LIST_TTL_MS;
  if (isFresh) return schemeListCache.data;
  // Coalesce concurrent cache-miss requests into a single upstream call.
  if (!inFlightFetch) {
    inFlightFetch = upstream("/search")
      .then((data) => {
        schemeListCache = { data, fetchedAt: Date.now() };
        return data;
      })
      .finally(() => { inFlightFetch = null; });
  }
  return inFlightFetch;
}

router.get("/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.status(400).json({ error: "Enter at least two characters." });
    const all = await getSchemeList();
    const needle = q.toLowerCase();
    res.json(all.filter((item) => item.schemeName?.toLowerCase().includes(needle)).slice(0, 20));
  } catch (err) { res.status(502).json({ error: "Market data is temporarily unavailable." }); }
});

router.get("/:schemeCode", async (req, res) => {
  try {
    const data = await upstream(`/${encodeURIComponent(req.params.schemeCode)}`);
    res.json({ schemeCode: req.params.schemeCode, meta: data.meta, data: data.data?.slice(0, 365) || [] });
  } catch (err) { res.status(502).json({ error: "Market data is temporarily unavailable." }); }
});

export default router;

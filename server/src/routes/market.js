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

// Per-fund NAV history changes at most once a day, but every page view of
// a fund used to hit mfapi.in directly. With many concurrent users looking
// at the same handful of popular funds, that's the single biggest source
// of avoidable outbound calls under load — and the one most likely to get
// this server rate-limited or slowed down by the upstream provider. Cache
// each scheme's response for a few hours and coalesce concurrent misses,
// the same pattern as the scheme list above. A bounded Map keeps memory
// predictable even if thousands of distinct schemes get looked up.
const SCHEME_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const SCHEME_CACHE_MAX_ENTRIES = 500;
const schemeCache = new Map(); // schemeCode -> { data, fetchedAt }
const schemeInFlight = new Map(); // schemeCode -> Promise

async function getScheme(schemeCode) {
  const cached = schemeCache.get(schemeCode);
  if (cached && Date.now() - cached.fetchedAt < SCHEME_TTL_MS) return cached.data;

  const pending = schemeInFlight.get(schemeCode);
  if (pending) return pending;

  const fetchPromise = upstream(`/${encodeURIComponent(schemeCode)}`)
    .then((data) => {
      if (schemeCache.size >= SCHEME_CACHE_MAX_ENTRIES && !schemeCache.has(schemeCode)) {
        const oldestKey = schemeCache.keys().next().value;
        schemeCache.delete(oldestKey);
      }
      schemeCache.set(schemeCode, { data, fetchedAt: Date.now() });
      return data;
    })
    .finally(() => { schemeInFlight.delete(schemeCode); });

  schemeInFlight.set(schemeCode, fetchPromise);
  return fetchPromise;
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
    const data = await getScheme(req.params.schemeCode);
    res.json({ schemeCode: req.params.schemeCode, meta: data.meta, data: data.data?.slice(0, 365) || [] });
  } catch (err) { res.status(502).json({ error: "Market data is temporarily unavailable." }); }
});

export default router;

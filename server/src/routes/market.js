import { Router } from "express";

const router = Router();
const MFAPI = "https://api.mfapi.in/mf";

async function upstream(path, { timeoutMs = 8000, retries = 0 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${MFAPI}${path}`, { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`Market data provider returned ${response.status}`);
      return await response.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// mfapi.in's /mf/search endpoint does its own name-matching server-side and
// *requires* a `q` parameter — calling it with none (which this file used to
// do, on the assumption there was no search endpoint and the full ~20k-entry
// list had to be downloaded and filtered locally) returns HTTP 400 every
// time. That 400, not a timeout or an mfapi.in outage, was the real cause of
// every fund lookup failing. Proxying the person's search text straight
// through fixes it and is simpler: no multi-MB list to download, cache, or
// time out on.
const SEARCH_TTL_MS = 60 * 60 * 1000; // 1 hour — matches change rarely
const SEARCH_CACHE_MAX_ENTRIES = 200;
const searchCache = new Map(); // query -> { data, fetchedAt }
const searchInFlight = new Map(); // query -> Promise

async function searchSchemes(q) {
  const key = q.toLowerCase();
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < SEARCH_TTL_MS) return cached.data;

  // Coalesce concurrent identical-query requests into a single upstream call.
  const pending = searchInFlight.get(key);
  if (pending) return pending;

  const fetchPromise = upstream(`/search?q=${encodeURIComponent(q)}`, { timeoutMs: 10000, retries: 1 })
    .then((data) => {
      if (searchCache.size >= SEARCH_CACHE_MAX_ENTRIES && !searchCache.has(key)) {
        const oldestKey = searchCache.keys().next().value;
        searchCache.delete(oldestKey);
      }
      searchCache.set(key, { data, fetchedAt: Date.now() });
      return data;
    })
    .finally(() => { searchInFlight.delete(key); });

  searchInFlight.set(key, fetchPromise);
  return fetchPromise;
}

// Per-fund NAV history changes at most once a day, but every page view of
// a fund used to hit mfapi.in directly. With many concurrent users looking
// at the same handful of popular funds, that's the single biggest source
// of avoidable outbound calls under load — and the one most likely to get
// this server rate-limited or slowed down by the upstream provider. Cache
// each scheme's response for a few hours and coalesce concurrent misses,
// the same pattern as the search cache above. A bounded Map keeps memory
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
    const results = await searchSchemes(q);
    res.json(Array.isArray(results) ? results.slice(0, 20) : []);
  } catch (err) {
    console.error("[market/search]", err);
    res.status(502).json({ error: "Market data is temporarily unavailable. Please try again in a moment." });
  }
});

router.get("/:schemeCode", async (req, res) => {
  try {
    const data = await getScheme(req.params.schemeCode);
    res.json({ schemeCode: req.params.schemeCode, meta: data.meta, data: data.data?.slice(0, 365) || [] });
  } catch (err) {
    console.error("[market/:schemeCode]", req.params.schemeCode, err);
    res.status(502).json({ error: "Market data is temporarily unavailable. Please try again in a moment." });
  }
});

export default router;

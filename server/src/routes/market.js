import { Router } from "express";

const router = Router();
const MFAPI = "https://api.mfapi.in/mf";

async function upstream(path) {
  const response = await fetch(`${MFAPI}${path}`, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Market data provider returned ${response.status}`);
  return response.json();
}

router.get("/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.status(400).json({ error: "Enter at least two characters." });
    const all = await upstream("/search");
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

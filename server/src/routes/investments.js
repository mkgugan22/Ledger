import { Router } from "express";
import Investment from "../models/Investment.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validateBody, validateQuery, investmentSchema, investmentUpdateSchema, investmentListQuerySchema, autoSipMonthSchema } from "../middleware/validate.js";
import { ensureAutoSipForUser, getPendingAutoSip, confirmAutoSip, skipAutoSip } from "../services/autoSip.js";

const router = Router();

// Monthly SIP consent. The app calls `pending` when it opens; if the SIP date has arrived
// and the user has not answered, it asks, then calls `confirm` (writes the entries) or
// `skip` (records the month as handled). See services/autoSip.js.
router.get(
  "/auto-sip/pending",
  asyncHandler(async (req, res) => {
    res.json({ pending: await getPendingAutoSip(req.userId) });
  })
);

router.post(
  "/auto-sip/confirm",
  validateBody(autoSipMonthSchema),
  asyncHandler(async (req, res) => {
    const result = await confirmAutoSip(req.userId, req.body.month);
    if (!result.ok) return res.status(409).json({ error: "No SIP is waiting for that month." });
    res.status(201).json({ created: result.created });
  })
);

router.post(
  "/auto-sip/skip",
  validateBody(autoSipMonthSchema),
  asyncHandler(async (req, res) => {
    const result = await skipAutoSip(req.userId, req.body.month);
    if (!result.ok) return res.status(409).json({ error: "No SIP is waiting for that month." });
    res.json({ skipped: true });
  })
);

// GET /api/investments — same backward-compatible pattern as transactions:
// a plain array by default, pagination only when explicitly requested.
router.get(
  "/",
  validateQuery(investmentListQuerySchema),
  asyncHandler(async (req, res) => {
    // Silent-mode safety net for the monthly auto-SIP (AUTO_SIP_REQUIRE_CONSENT=false): if the
    // server was asleep on the SIP date, create the user's missed entries before they see their
    // list. A no-op in the default consent mode, where the app asks first (see /auto-sip/pending).
    // Idempotent and cheap once up to date; a failure here must never break the list.
    await ensureAutoSipForUser(req.userId).catch((err) => console.error("Auto SIP catch-up failed:", err.message));

    const filter = { user: req.userId };
    const wantsPagination = req.query.page !== undefined || req.query.limit !== undefined;
    if (!wantsPagination) {
      // .lean() — read-only response, skip full Mongoose document hydration.
      return res.json(await Investment.find(filter).sort({ date: 1, createdAt: 1 }).lean());
    }
    const page = req.query.page || 1;
    const limit = req.query.limit || 200;
    const [items, total] = await Promise.all([
      Investment.find(filter)
        .sort({ date: 1, createdAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Investment.countDocuments(filter),
    ]);
    res.json({ items, page, limit, total, totalPages: Math.ceil(total / limit) });
  })
);

router.post(
  "/",
  validateBody(investmentSchema),
  asyncHandler(async (req, res) => {
    const doc = await Investment.create({ ...req.body, user: req.userId });
    res.status(201).json(doc);
  })
);

router.put(
  "/:id",
  validateBody(investmentUpdateSchema),
  asyncHandler(async (req, res) => {
    const doc = await Investment.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ error: "Investment not found" });
    res.json(doc);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const doc = await Investment.findOneAndDelete({ _id: req.params.id, user: req.userId });
    if (!doc) return res.status(404).json({ error: "Investment not found" });
    res.json({ deleted: true });
  })
);

export default router;

import { Router } from "express";
import Valuation from "../models/Valuation.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validateBody, valuationSchema } from "../middleware/validate.js";

const router = Router();

// GET /api/valuations — list every recorded valuation. No pagination here —
// this collection is naturally small (one row per instrument per month).
router.get(
  "/",
  asyncHandler(async (req, res) => {
    // .lean() — read-only response, skip full Mongoose document hydration.
    const list = await Valuation.find({ user: req.userId }).sort({ month: 1 }).lean();
    res.json(list);
  })
);

// POST /api/valuations — record (or update) a month+instrument valuation
router.post(
  "/",
  validateBody(valuationSchema),
  asyncHandler(async (req, res) => {
    const { month, instrument, value } = req.body;
    const doc = await Valuation.findOneAndUpdate(
      { user: req.userId, month, instrument },
      { user: req.userId, month, instrument, value },
      { new: true, upsert: true, runValidators: true }
    );
    res.status(201).json(doc);
  })
);

// DELETE /api/valuations/:id
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const doc = await Valuation.findOneAndDelete({ _id: req.params.id, user: req.userId });
    if (!doc) return res.status(404).json({ error: "Valuation not found" });
    res.json({ deleted: true });
  })
);

export default router;

import { Router } from "express";
import Budget from "../models/Budget.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validateBody, budgetSchema } from "../middleware/validate.js";

const router = Router();

// GET /api/budgets — list budgets, optionally filtered to one month
// (?month=YYYY-MM), which is how the dashboard's budget-vs-actual view uses
// this endpoint. With no query, returns every budget for the user — this
// collection is naturally small (one row per category per month).
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const filter = { user: req.userId };
    if (req.query.month) filter.month = String(req.query.month);
    const list = await Budget.find(filter).sort({ month: 1, mode: 1, type: 1 });
    res.json(list);
  })
);

// POST /api/budgets — record (or update) a month+mode+type planned amount.
// Same upsert pattern as valuations: re-submitting the same category for
// the same month updates it rather than creating a duplicate.
router.post(
  "/",
  validateBody(budgetSchema),
  asyncHandler(async (req, res) => {
    const { month, mode, type, plannedAmount } = req.body;
    const doc = await Budget.findOneAndUpdate(
      { user: req.userId, month, mode, type },
      { user: req.userId, month, mode, type, plannedAmount },
      { new: true, upsert: true, runValidators: true }
    );
    res.status(201).json(doc);
  })
);

// DELETE /api/budgets/:id
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const doc = await Budget.findOneAndDelete({ _id: req.params.id, user: req.userId });
    if (!doc) return res.status(404).json({ error: "Budget not found" });
    res.json({ deleted: true });
  })
);

export default router;

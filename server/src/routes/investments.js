import { Router } from "express";
import Investment from "../models/Investment.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validateBody, validateQuery, investmentSchema, investmentUpdateSchema, investmentListQuerySchema } from "../middleware/validate.js";

const router = Router();

// GET /api/investments — same backward-compatible pattern as transactions:
// a plain array by default, pagination only when explicitly requested.
router.get(
  "/",
  validateQuery(investmentListQuerySchema),
  asyncHandler(async (req, res) => {
    const filter = { user: req.userId };
    const wantsPagination = req.query.page !== undefined || req.query.limit !== undefined;
    if (!wantsPagination) {
      return res.json(await Investment.find(filter).sort({ date: 1, createdAt: 1 }));
    }
    const page = req.query.page || 1;
    const limit = req.query.limit || 200;
    const [items, total] = await Promise.all([
      Investment.find(filter)
        .sort({ date: 1, createdAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
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

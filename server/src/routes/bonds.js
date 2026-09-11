import { Router } from "express";
import Bond from "../models/Bond.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validateBody, validateQuery, bondSchema, bondUpdateSchema, bondListQuerySchema } from "../middleware/validate.js";

const router = Router();

// GET /api/bonds — same backward-compatible pattern as investments/transactions:
// a plain array by default, pagination only when explicitly requested.
router.get(
  "/",
  validateQuery(bondListQuerySchema),
  asyncHandler(async (req, res) => {
    const filter = { user: req.userId };
    const wantsPagination = req.query.page !== undefined || req.query.limit !== undefined;
    if (!wantsPagination) {
      // .lean() — read-only response, skip full Mongoose document hydration.
      return res.json(await Bond.find(filter).sort({ date: 1, createdAt: 1 }).lean());
    }
    const page = req.query.page || 1;
    const limit = req.query.limit || 200;
    const [items, total] = await Promise.all([
      Bond.find(filter)
        .sort({ date: 1, createdAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Bond.countDocuments(filter),
    ]);
    res.json({ items, page, limit, total, totalPages: Math.ceil(total / limit) });
  })
);

router.post(
  "/",
  validateBody(bondSchema),
  asyncHandler(async (req, res) => {
    const doc = await Bond.create({ ...req.body, user: req.userId });
    res.status(201).json(doc);
  })
);

router.put(
  "/:id",
  validateBody(bondUpdateSchema),
  asyncHandler(async (req, res) => {
    const doc = await Bond.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ error: "Bond not found" });
    res.json(doc);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const doc = await Bond.findOneAndDelete({ _id: req.params.id, user: req.userId });
    if (!doc) return res.status(404).json({ error: "Bond not found" });
    res.json({ deleted: true });
  })
);

export default router;

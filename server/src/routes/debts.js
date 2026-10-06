import { Router } from "express";
import Debt from "../models/Debt.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validateBody, debtSchema, debtUpdateSchema } from "../middleware/validate.js";

const router = Router();

router.get("/", asyncHandler(async (req, res) => {
  const items = await Debt.find({ user: req.userId }).sort({ status: 1, dueDate: 1, createdAt: 1 }).lean();
  res.json(items);
}));

router.post("/", validateBody(debtSchema), asyncHandler(async (req, res) => {
  const doc = await Debt.create({ ...req.body, user: req.userId });
  res.status(201).json(doc);
}));

router.put("/:id", validateBody(debtUpdateSchema), asyncHandler(async (req, res) => {
  const doc = await Debt.findOneAndUpdate({ _id: req.params.id, user: req.userId }, req.body, { new: true, runValidators: true }).lean();
  if (!doc) return res.status(404).json({ error: "Debt not found" });
  res.json(doc);
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const doc = await Debt.findOneAndDelete({ _id: req.params.id, user: req.userId });
  if (!doc) return res.status(404).json({ error: "Debt not found" });
  res.json({ deleted: true });
}));

export default router;

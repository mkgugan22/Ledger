import { Router } from "express";
import Bill from "../models/Bill.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validateBody, billSchema, billUpdateSchema } from "../middleware/validate.js";

const router = Router();

router.get("/", asyncHandler(async (req, res) => {
  const items = await Bill.find({ user: req.userId }).sort({ status: 1, dueDate: 1, createdAt: 1 }).lean();
  res.json(items);
}));

router.post("/", validateBody(billSchema), asyncHandler(async (req, res) => {
  const doc = await Bill.create({ ...req.body, user: req.userId });
  res.status(201).json(doc);
}));

router.put("/:id", validateBody(billUpdateSchema), asyncHandler(async (req, res) => {
  const doc = await Bill.findOneAndUpdate({ _id: req.params.id, user: req.userId }, req.body, { new: true, runValidators: true }).lean();
  if (!doc) return res.status(404).json({ error: "Bill not found" });
  res.json(doc);
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const doc = await Bill.findOneAndDelete({ _id: req.params.id, user: req.userId });
  if (!doc) return res.status(404).json({ error: "Bill not found" });
  res.json({ deleted: true });
}));

export default router;

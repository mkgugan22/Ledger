import { Router } from "express";
import Investment from "../models/Investment.js";

const router = Router();
router.get("/", async (req, res) => {
  try { res.json(await Investment.find({ user: req.userId }).sort({ date: 1, createdAt: 1 })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
router.post("/", async (req, res) => {
  try { const doc = await Investment.create({ ...req.body, user: req.userId }); res.status(201).json(doc); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
router.put("/:id", async (req, res) => {
  try {
    const allowed = (({ fund, type, monthly, invested, currentValue, date, nav, source }) => ({ fund, type, monthly, invested, currentValue, date, nav, source }))(req.body);
    const doc = await Investment.findOneAndUpdate({ _id: req.params.id, user: req.userId }, allowed, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ error: "Investment not found" });
    res.json(doc);
  } catch (err) { res.status(400).json({ error: err.message }); }
});
router.delete("/:id", async (req, res) => {
  try { const doc = await Investment.findOneAndDelete({ _id: req.params.id, user: req.userId }); if (!doc) return res.status(404).json({ error: "Investment not found" }); res.json({ deleted: true }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
export default router;

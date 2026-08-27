import { Router } from "express";
import Valuation from "../models/Valuation.js";

const router = Router();

// GET /api/valuations — list every recorded valuation
router.get("/", async (req, res) => {
  try {
    const list = await Valuation.find({ user: req.userId }).sort({ month: 1 });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/valuations — record (or update) a month+instrument valuation
router.post("/", async (req, res) => {
  try {
    const { month, instrument, value } = req.body;
    const doc = await Valuation.findOneAndUpdate(
      { user: req.userId, month, instrument },
      { user: req.userId, month, instrument, value },
      { new: true, upsert: true, runValidators: true }
    );
    res.status(201).json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/valuations/:id
router.delete("/:id", async (req, res) => {
  try {
    const doc = await Valuation.findOneAndDelete({ _id: req.params.id, user: req.userId });
    if (!doc) return res.status(404).json({ error: "Valuation not found" });
    res.json({ deleted: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;

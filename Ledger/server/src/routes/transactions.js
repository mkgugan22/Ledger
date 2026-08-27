import { Router } from "express";
import Transaction from "../models/Transaction.js";

const router = Router();

// GET /api/transactions — list every entry
router.get("/", async (req, res) => {
  try {
    const list = await Transaction.find().sort({ createdAt: 1 });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/transactions — add a new entry
router.post("/", async (req, res) => {
  try {
    const { mode, type, amount, month, note } = req.body;
    const doc = await Transaction.create({ mode, type, amount, month, note });
    res.status(201).json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/transactions/:id — edit an entry
router.put("/:id", async (req, res) => {
  try {
    const { mode, type, amount, month, note } = req.body;
    const doc = await Transaction.findByIdAndUpdate(
      req.params.id,
      { mode, type, amount, month, note },
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ error: "Entry not found" });
    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/transactions/:id — remove an entry
router.delete("/:id", async (req, res) => {
  try {
    const doc = await Transaction.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: "Entry not found" });
    res.json({ deleted: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;

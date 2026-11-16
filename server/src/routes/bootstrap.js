import { Router } from "express";
import Transaction from "../models/Transaction.js";
import Valuation from "../models/Valuation.js";
import Investment from "../models/Investment.js";
import Bond from "../models/Bond.js";
import Budget from "../models/Budget.js";
import Debt from "../models/Debt.js";
import Bill from "../models/Bill.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { ensureAutoSipForUser } from "../services/autoSip.js";

const router = Router();

// GET /api/bootstrap — initial data for the authenticated application shell.
// Queries remain user-scoped and use the same sort orders as their list routes.
// The response contains plain arrays, preserving the data shape expected by pages.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    // Preserve the investments route silent-mode catch-up behavior.
    // In the default consent mode this is a no-op.
    await ensureAutoSipForUser(req.userId).catch((error) => {
      console.error("Auto SIP catch-up failed during bootstrap:", error.message);
    });

    const optionalList = (query, label) => query.catch((error) => {
      console.error("Bootstrap " + label + " query failed:", error.message);
      return [];
    });

    const [transactions, valuations, investments, bonds, budgets, debts, bills] = await Promise.all([
      Transaction.find({ user: req.userId }).sort({ createdAt: 1 }).lean(),
      Valuation.find({ user: req.userId }).sort({ month: 1 }).lean(),
      optionalList(Investment.find({ user: req.userId }).sort({ date: 1, createdAt: 1 }).lean(), "investments"),
      Bond.find({ user: req.userId }).sort({ date: 1, createdAt: 1 }).lean(),
      optionalList(Budget.find({ user: req.userId }).sort({ month: 1, mode: 1, type: 1 }).lean(), "budgets"),
      optionalList(Debt.find({ user: req.userId }).sort({ status: 1, dueDate: 1, createdAt: 1 }).lean(), "debts"),
      optionalList(Bill.find({ user: req.userId }).sort({ status: 1, dueDate: 1, createdAt: 1 }).lean(), "bills"),
    ]);

    res.json({ transactions, valuations, investments, bonds, budgets, debts, bills });
  })
);

export default router;

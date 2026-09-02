import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validateBody, ledgerAiChatSchema } from "../middleware/validate.js";
import { buildLedgerSnapshot } from "../services/ai/ledgerData.js";
import { askGemini } from "../services/ai/gemini.js";

const router = Router();

router.post(
  "/chat",
  validateBody(ledgerAiChatSchema),
  asyncHandler(async (req, res) => {
    const snapshot = await buildLedgerSnapshot(req.userId);
    const answer = await askGemini({ ...req.body, snapshot });

    res.json({
      answer,
      generatedAt: new Date().toISOString(),
    });
  })
);

export default router;

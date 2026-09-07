import { Router } from "express";
import crypto from "node:crypto";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validateBody, ledgerAiChatSchema } from "../middleware/validate.js";
import { buildLedgerSnapshot } from "../services/ai/ledgerData.js";
import { askGemini } from "../services/ai/gemini.js";
import AiChatLog from "../models/AiChatLog.js";

const router = Router();

// How long a stored answer stays eligible for instant reuse. Kept short
// on purpose — long enough to make a refreshed page or an accidental
// double-send instant, short enough that it never feels like it's
// serving stale information.
const RECENT_ANSWER_WINDOW_MS = 15 * 60 * 1000;

function normalizeMessage(message) {
  return message.trim().toLowerCase().replace(/\s+/g, " ");
}

function hashSnapshot(snapshot) {
  return crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

router.post(
  "/chat",
  validateBody(ledgerAiChatSchema),
  asyncHandler(async (req, res) => {
    const snapshot = await buildLedgerSnapshot(req.userId);
    const normalizedMessage = normalizeMessage(req.body.message);
    const snapshotHash = hashSnapshot(snapshot);

    /*
     * Quick-response path: this exact question, asked against this
     * exact ledger data, within the last 15 minutes, already has a
     * good answer on file — return it immediately instead of calling
     * Gemini again. snapshotHash changes the moment the user's
     * transactions/budgets/investments change, so this can never
     * return an answer that no longer matches their real data.
     */
    const recent = await AiChatLog.findOne({
      user: req.userId,
      normalizedMessage,
      snapshotHash,
      status: "ok",
      createdAt: { $gte: new Date(Date.now() - RECENT_ANSWER_WINDOW_MS) },
    })
      .sort({ createdAt: -1 })
      .lean();

    if (recent?.answer) {
      res.json({
        answer: recent.answer,
        generatedAt: new Date().toISOString(),
      });
      return;
    }

    const startedAt = Date.now();

    let answer;

    try {
      answer = await askGemini({ ...req.body, snapshot });
    } catch (error) {
      // Log the failed attempt (fire-and-forget — never delays the
      // error response the user is waiting on), then re-throw so the
      // existing error-handling middleware responds exactly as before.
      AiChatLog.create({
        user: req.userId,
        message: req.body.message,
        normalizedMessage,
        snapshotHash,
        history: req.body.history,
        answer: "",
        status: "error",
        errorMessage: error?.message || "Unknown error",
        latencyMs: Date.now() - startedAt,
      }).catch((logError) => {
        console.error("[Ledger AI] Failed to log chat error:", logError.message);
      });

      throw error;
    }

    const generatedAt = new Date().toISOString();

    // Respond to the user first — persistence happens after, so saving
    // to Mongo can never slow down or block the actual answer.
    res.json({ answer, generatedAt });

    AiChatLog.create({
      user: req.userId,
      message: req.body.message,
      normalizedMessage,
      snapshotHash,
      history: req.body.history,
      answer,
      status: "ok",
      latencyMs: Date.now() - startedAt,
    }).catch((logError) => {
      console.error("[Ledger AI] Failed to log chat exchange:", logError.message);
    });
  })
);

export default router;

import { Router } from "express";
import crypto from "node:crypto";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validateBody, ledgerAiChatSchema } from "../middleware/validate.js";
import { buildLedgerSnapshot } from "../services/ai/ledgerData.js";
import { askGeminiStream } from "../services/ai/gemini.js";
import AiChatLog from "../models/AiChatLog.js";

const router = Router();

// How long a stored answer stays eligible for instant reuse. Kept short
// on purpose — long enough to make a refreshed page or an accidental
// double-send instant, short enough that it never feels like it's
// serving stale information.
const RECENT_ANSWER_WINDOW_MS = 15 * 60 * 1000;

// Must stay byte-for-byte identical to STREAM_ERROR_MARKER in
// client/src/lib/api.js — the client watches the raw text stream for
// this sentinel to know an error happened mid-stream, since once bytes
// have started flowing we can no longer switch to a JSON error / a
// different HTTP status code.
const STREAM_ERROR_MARKER = "\u0000LEDGER_AI_STREAM_ERROR\u0000";

function normalizeMessage(message) {
  return message.trim().toLowerCase().replace(/\s+/g, " ");
}

function hashSnapshot(snapshot) {
  return crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

// Plain-text, unbuffered stream headers. X-Accel-Buffering covers
// Render/Nginx-style proxies that would otherwise hold the whole
// response until it ends, which would silently turn this back into
// the old "wait for everything, then arrive all at once" behavior.
function startStream(res) {
  res.status(200);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();
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
     * Gemini again. Sent as the same plain-text wire format as a live
     * answer (written in one go) so the client's stream reader treats
     * "cached" and "freshly generated" identically.
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
      startStream(res);
      res.end(recent.answer);
      return;
    }

    const startedAt = Date.now();

    // Headers are only sent once the first chunk actually arrives, so
    // an immediate failure (bad config, invalid request, provider
    // rejects before any output) can still return a proper JSON error
    // with the right HTTP status via the normal error middleware.
    let headersSent = false;
    let fullAnswer = "";

    const onChunk = (chunk) => {
      if (!headersSent) {
        headersSent = true;
        startStream(res);
      }
      fullAnswer += chunk;
      res.write(chunk);
    };

    try {
      fullAnswer = await askGeminiStream({ ...req.body, snapshot }, onChunk);
    } catch (error) {
      // Log the failed attempt (fire-and-forget — never delays the
      // error response the user is waiting on).
      AiChatLog.create({
        user: req.userId,
        message: req.body.message,
        normalizedMessage,
        snapshotHash,
        history: req.body.history,
        answer: fullAnswer,
        status: "error",
        errorMessage: error?.message || "Unknown error",
        latencyMs: Date.now() - startedAt,
      }).catch((logError) => {
        console.error("[Ledger AI] Failed to log chat error:", logError.message);
      });

      if (headersSent) {
        // Already streaming — can't change status code anymore, so
        // hand the client the error via the in-band sentinel instead.
        res.end(`${STREAM_ERROR_MARKER}${error?.message || "Ledger AI could not answer right now."}`);
        return;
      }

      // Nothing sent yet — let the normal error middleware respond
      // with the correct status code, exactly as before.
      throw error;
    }

    // Guards the edge case where askGeminiStream resolves without ever
    // invoking onChunk (shouldn't happen — gemini.js throws on an
    // empty answer — but keeps the response well-formed either way).
    if (!headersSent) {
      startStream(res);
      res.write(fullAnswer);
    }

    res.end();

    // Persist after the response is already on its way to the user,
    // so saving to Mongo can never slow down or block the answer.
    AiChatLog.create({
      user: req.userId,
      message: req.body.message,
      normalizedMessage,
      snapshotHash,
      history: req.body.history,
      answer: fullAnswer,
      status: "ok",
      latencyMs: Date.now() - startedAt,
    }).catch((logError) => {
      console.error("[Ledger AI] Failed to log chat exchange:", logError.message);
    });
  })
);

export default router;

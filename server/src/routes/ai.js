import { Router } from "express";
import crypto from "node:crypto";
import mongoose from "mongoose";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validateBody, ledgerAiChatSchema } from "../middleware/validate.js";
import { buildLedgerSnapshot } from "../services/ai/ledgerData.js";
import { askGeminiStream } from "../services/ai/gemini.js";
import AiChatLog from "../models/AiChatLog.js";
import AiChatShare from "../models/AiChatShare.js";

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

// How many past exchanges (question + answer pairs) to hand back to the
// client on load. Kept modest — this is for restoring the visible
// conversation, not a full audit trail (that's what AiChatLog itself is
// for), and it keeps the response small on slow connections.
const HISTORY_EXCHANGE_LIMIT = 40;

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

// Lets the client restore the visible conversation after a logout, a page
// reload, or simply switching tabs — none of which the browser tab keeps
// React state across. Only successful exchanges are returned: a failed
// attempt's "answer" may be empty or partial, and replaying it wouldn't
// mean anything to the user.
router.get(
  "/history",
  asyncHandler(async (req, res) => {
    const logs = await AiChatLog.find({ user: req.userId, status: "ok" })
      .sort({ createdAt: -1 })
      .limit(HISTORY_EXCHANGE_LIMIT)
      .select("message answer createdAt")
      .lean();

    // Mongo gives newest-first (so the limit keeps the *most recent*
    // exchanges); flip to chronological order for display.
    const messages = logs.reverse().flatMap((log) => [
      { role: "user", content: log.message, createdAt: log.createdAt },
      { role: "assistant", content: log.answer, createdAt: log.createdAt },
    ]);

    res.json({ messages });
  })
);

router.get(
  "/shares",
  asyncHandler(async (req, res) => {
    const shares = await AiChatShare.find({
      user: req.userId,
      expiresAt: { $gt: new Date() },
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .select("createdAt expiresAt")
      .lean();

    res.json(shares.map((share) => ({
      id: String(share._id),
      createdAt: share.createdAt,
      expiresAt: share.expiresAt,
    })));
  })
);

router.delete(
  "/shares/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: "This shared conversation is unavailable or has expired." });
    }

    const revoked = await AiChatShare.findOneAndDelete({
      _id: req.params.id,
      user: req.userId,
    });

    if (!revoked) {
      return res.status(404).json({ error: "This shared conversation is unavailable or has expired." });
    }

    res.json({ revoked: true });
  })
);

router.post(
  "/share",
  asyncHandler(async (req, res) => {
    const input = req.body?.messages;
    if (!Array.isArray(input) || input.length < 2 || input.length > 81) {
      return res.status(400).json({ error: "Choose a conversation with between 2 and 81 messages to share." });
    }

    let totalCharacters = 0;
    const messages = input.map((item) => {
      if (!item || !["user", "assistant"].includes(item.role) || typeof item.content !== "string") {
        return null;
      }

      const content = item.content.trim();
      if (!content || content.length > 12000) return null;
      totalCharacters += content.length;
      if (totalCharacters > 40000) return null;

      const parsedDate = item.createdAt ? new Date(item.createdAt) : new Date();
      return {
        role: item.role,
        content,
        createdAt: Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate,
      };
    });

    if (messages.some((item) => !item) || !messages.some((item) => item.role === "user")) {
      return res.status(400).json({ error: "The conversation contains an invalid or oversized message." });
    }

    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const share = await AiChatShare.create({ user: req.userId, tokenHash, messages, expiresAt });
    res.status(201).json({ id: String(share._id), token, createdAt: share.createdAt, expiresAt: share.expiresAt });
  })
);

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

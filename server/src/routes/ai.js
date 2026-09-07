import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validateBody, ledgerAiChatSchema } from "../middleware/validate.js";
import { buildLedgerSnapshot } from "../services/ai/ledgerData.js";
import { askGeminiStream } from "../services/ai/gemini.js";

const router = Router();

/*
 * Marker used only in the rare case where Gemini fails AFTER it has
 * already started streaming an answer (e.g. the provider drops the
 * connection mid-response). By that point the HTTP status is already
 * 200 and can't be changed, so we can't fall back to a normal JSON
 * error response. Instead we append this marker plus the error text
 * to the stream; the client (see chatWithLedgerAI in client/src/lib/
 * api.js) detects it, discards the partial answer, and shows the
 * exact same red error alert it always showed for a full failure.
 * Must stay byte-for-byte identical on both sides.
 */
const STREAM_ERROR_MARKER = "\u0000LEDGER_AI_STREAM_ERROR\u0000";

router.post(
  "/chat",
  validateBody(ledgerAiChatSchema),
  asyncHandler(async (req, res) => {
    // Unchanged: if this throws, asyncHandler forwards to the normal
    // Express error handler exactly as before — nothing streaming-
    // related has started yet at this point.
    const snapshot = await buildLedgerSnapshot(req.userId);

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");

    let streamedAnything = false;

    try {
      await askGeminiStream({ ...req.body, snapshot }, (chunk) => {
        streamedAnything = true;
        res.write(chunk);
      });

      res.end();
    } catch (error) {
      const status = error?.status || 500;
      const message = error?.expose
        ? error.message
        : "Ledger AI could not answer right now.";

      if (!streamedAnything) {
        // Nothing sent yet — headers haven't actually gone out over
        // the wire, so this is a normal JSON error response, byte-
        // for-byte the same shape the client has always expected.
        res.status(status).json({ error: message });
        return;
      }

      // Already streamed part of an answer, so the 200 status is
      // locked in. Signal the failure in-band instead.
      res.write(`${STREAM_ERROR_MARKER}${message}`);
      res.end();
    }
  })
);

export default router;

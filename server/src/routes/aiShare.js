import { Router } from "express";
import crypto from "node:crypto";
import { asyncHandler } from "../middleware/asyncHandler.js";
import AiChatShare from "../models/AiChatShare.js";

const router = Router();
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

router.get(
  "/:token",
  asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const { token } = req.params;

    if (!TOKEN_PATTERN.test(token)) {
      return res.status(404).json({ error: "This shared conversation is unavailable or has expired." });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const share = await AiChatShare.findOne({
      tokenHash,
      expiresAt: { $gt: new Date() },
    }).select("messages expiresAt").lean();

    if (!share) {
      return res.status(404).json({ error: "This shared conversation is unavailable or has expired." });
    }

    return res.json({
      messages: share.messages,
      expiresAt: share.expiresAt,
    });
  })
);

export default router;

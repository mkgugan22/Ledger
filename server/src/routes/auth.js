import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import Valuation from "../models/Valuation.js";
import Investment from "../models/Investment.js";
import { issueSession, requireAuth, revokeSession } from "../middleware/auth.js";
import { authRateLimit } from "../middleware/rateLimit.js";
import { validateBody } from "../middleware/validate.js";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resendVerificationSchema,
  verifyEmailSchema,
  resetPasswordSchema,
} from "../middleware/authSchemas.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  buildAuthActionUrl,
  escapeEmailHtml,
  isAuthEmailConfigured,
  sendAuthEmail,
} from "../services/authEmail.js";

const router = Router();
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const DUMMY_PASSWORD_HASH = "$2a$12$Yzj8z3j9gfR4vx1JCjjfu.M7AANI/xPN4okgtrL8fWiodu6X.262W";

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const createToken = () => crypto.randomBytes(32).toString("base64url");
const emailVerificationRequired = () => process.env.REQUIRE_EMAIL_VERIFICATION === "true";

async function sendVerificationEmail(user) {
  const token = createToken();
  user.emailVerificationTokenHash = hashToken(token);
  user.emailVerificationExpiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);
  await user.save();
  const url = buildAuthActionUrl("verify", token);
  await sendAuthEmail({
    to: user.email,
    subject: "Verify your Ledger email address",
    html: "<p>Hello " + escapeEmailHtml(user.name) + ",</p>" +
      "<p>Verify your email address to activate your Ledger account.</p>" +
      '<p><a href="' + escapeEmailHtml(url) + '">Verify email address</a></p>' +
      "<p>This link expires in 24 hours. If you did not create this account, ignore this email.</p>",
  });
}

// Records created before authentication was introduced have no owner. This
// compatibility migration is retained until production data is checked and
// the one-time ownership migration is explicitly completed.
let legacyClaimStillPossible = true;
let legacyClaimPromise = null;

export async function claimLegacyRecords(userId) {
  if (!legacyClaimStillPossible) return;
  if (!legacyClaimPromise) {
    legacyClaimPromise = (async () => {
      if (await User.countDocuments() !== 1) {
        legacyClaimStillPossible = false;
        return;
      }
      await Promise.all([
        Transaction.updateMany({ user: { $exists: false } }, { $set: { user: userId } }),
        Valuation.updateMany({ user: { $exists: false } }, { $set: { user: userId } }),
        Investment.updateMany({ user: { $exists: false } }, { $set: { user: userId } }),
      ]);
      legacyClaimStillPossible = false;
    })().finally(() => {
      legacyClaimPromise = null;
    });
  }
  await legacyClaimPromise;
}

export function _resetLegacyClaimCache() {
  legacyClaimStillPossible = true;
  legacyClaimPromise = null;
}

router.post(
  "/register",
  authRateLimit,
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    const normalizedEmail = email.toLowerCase().trim();
    if (await User.exists({ email: normalizedEmail })) {
      return res.status(409).json({ error: "An account with that email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      emailVerified: !emailVerificationRequired(),
    });

    if (emailVerificationRequired()) {
      try {
        await sendVerificationEmail(user);
      } catch (error) {
        // The account is retained so the user can request another verification
        // email. No session is issued until the address is verified.
        return res.status(503).json({
          error: "Your account was created, but the verification email could not be sent. Please try resending it.",
        });
      }
      return res.status(201).json({
        verificationRequired: true,
        message: "Check your inbox for a verification link before signing in.",
      });
    }

    issueSession(res, user);
    res.status(201).json({ user: { id: user._id, name: user.name, email: user.email } });
  })
);

router.post(
  "/login",
  authRateLimit,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() })
      .select("+passwordHash tokenVersion emailVerified");
    const passwordMatches = await bcrypt.compare(password, user?.passwordHash || DUMMY_PASSWORD_HASH);
    if (!user || !passwordMatches) {
      return res.status(401).json({ error: "Invalid email or password." });
    }
    if (user.emailVerified === false) {
      return res.status(403).json({
        error: "Please verify your email address before signing in.",
        code: "EMAIL_VERIFICATION_REQUIRED",
      });
    }
    await claimLegacyRecords(user._id);
    issueSession(res, user);
    res.json({ user: { id: user._id, name: user.name, email: user.email } });
  })
);

router.post(
  "/verify-email",
  authRateLimit,
  validateBody(verifyEmailSchema),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({
      emailVerificationTokenHash: hashToken(req.body.token),
      emailVerificationExpiresAt: { $gt: new Date() },
    }).select("+emailVerificationTokenHash +emailVerificationExpiresAt");

    if (!user) return res.status(400).json({ error: "This verification link is invalid or has expired." });

    user.emailVerified = true;
    user.emailVerificationTokenHash = undefined;
    user.emailVerificationExpiresAt = undefined;
    await user.save();
    res.json({ verified: true, message: "Your email address is verified. You can now sign in." });
  })
);

router.post(
  "/resend-verification",
  authRateLimit,
  validateBody(resendVerificationSchema),
  asyncHandler(async (req, res) => {
    if (!isAuthEmailConfigured()) {
      return res.status(503).json({ error: "Email delivery is not configured. Please contact support." });
    }
    const generic = { message: "If the account needs verification, a new link will be sent." };

    const user = await User.findOne({
      email: req.body.email.toLowerCase().trim(),
      emailVerified: false,
    });
    if (user) {
      try {
        await sendVerificationEmail(user);
      } catch (error) {
        console.error("Verification email delivery failed.", { requestId: req.requestId });
      }
    }
    res.json(generic);
  })
);

router.post(
  "/forgot-password",
  authRateLimit,
  validateBody(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    if (!isAuthEmailConfigured()) {
      return res.status(503).json({ error: "Password recovery email is not configured. Please contact support." });
    }

    const user = await User.findOne({ email: req.body.email.toLowerCase().trim() });
    if (user) {
      const token = createToken();
      user.passwordResetTokenHash = hashToken(token);
      user.passwordResetExpiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
      await user.save();
      try {
        const url = buildAuthActionUrl("reset", token);
        await sendAuthEmail({
          to: user.email,
          subject: "Reset your Ledger password",
          html: "<p>Hello " + escapeEmailHtml(user.name) + ",</p>" +
            "<p>We received a request to reset your Ledger password.</p>" +
            '<p><a href="' + escapeEmailHtml(url) + '">Reset password</a></p>' +
            "<p>This link expires in one hour. If you did not request this, ignore this email.</p>",
        });
      } catch (error) {
        // Use the same response for existing and unknown accounts to avoid
        // exposing whether an email address is registered.
        console.error("Password reset email delivery failed.", { requestId: req.requestId });
      }
    }
    res.json({ message: "If an account exists for that address, a password reset link will be sent." });
  })
);

router.post(
  "/reset-password",
  authRateLimit,
  validateBody(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({
      passwordResetTokenHash: hashToken(req.body.token),
      passwordResetExpiresAt: { $gt: new Date() },
    }).select("+passwordResetTokenHash +passwordResetExpiresAt");

    if (!user) return res.status(400).json({ error: "This password reset link is invalid or has expired." });

    user.passwordHash = await bcrypt.hash(req.body.password, 12);
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpiresAt = undefined;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    res.json({ reset: true, message: "Your password has been updated. Please sign in again." });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.userId).select("name email emailVerified");
    if (!user) return res.status(401).json({ error: "Session expired. Please sign in again." });
    await claimLegacyRecords(user._id);
    res.json({ user: { id: user._id, name: user.name, email: user.email } });
  })
);

router.post("/logout", asyncHandler(async (req, res) => {
  await revokeSession(req, res);
  res.json({ ok: true });
}));

export default router;

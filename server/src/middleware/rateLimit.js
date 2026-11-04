import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { MongoRateLimitStore } from "./mongoRateLimitStore.js";

const authStore = new MongoRateLimitStore("auth");
const apiStore = new MongoRateLimitStore("api");
const aiStore = new MongoRateLimitStore("ai");
const aiShareStore = new MongoRateLimitStore("ai-share");

// Shared MongoDB counters survive process restarts and are consistent across
// horizontally scaled API instances. Each limiter has an independent prefix.
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: authStore,
  message: { error: "Too many attempts. Please try again in a few minutes." },
});

// A single user gets an independent authenticated API budget; IP is the
// fallback used only when an authenticated identity is not present.
export const apiRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  store: apiStore,
  keyGenerator: (req) => req.userId || ipKeyGenerator(req.ip),
  message: { error: "Too many requests. Please slow down and try again shortly." },
});

export const aiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: aiStore,
  keyGenerator: (req) => req.userId || ipKeyGenerator(req.ip),
  handler: (req, res) => res.status(429).json({
    error: "Too many Ledger AI requests. Please try again in a few minutes.",
    quota: { limit: req.rateLimit.limit, remaining: req.rateLimit.remaining, resetAt: req.rateLimit.resetTime },
  }),
});

export const aiShareReadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: aiShareStore,
  message: { error: "Too many shared conversation requests. Please try again later." },
});

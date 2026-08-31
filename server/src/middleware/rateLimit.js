import rateLimit from "express-rate-limit";

// 10 attempts per 15 minutes per IP on login/register — generous enough for
// a real user who mistypes a password a few times, tight enough to blunt
// credential-stuffing / brute-force attempts.
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again in a few minutes." },
});

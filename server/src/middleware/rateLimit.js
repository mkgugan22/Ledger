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

// General traffic shaping for every authenticated API route. This isn't
// meant to police a normal user — a single dashboard load can easily fire
// 5-10 requests — it exists so one runaway client (a buggy retry loop, a
// scraping script, a compromised account) can't starve the shared
// connection pool that every other concurrent user depends on.
//
// Mounted after requireAuth in app.js, so req.userId is always set here:
// keying by user id (falling back to IP only as a safety net) means many
// people behind the same office/mobile-carrier NAT never share one bucket,
// which a plain IP-based limiter would get wrong.
export const apiRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId || req.ip,
  message: { error: "Too many requests. Please slow down and try again shortly." },
});

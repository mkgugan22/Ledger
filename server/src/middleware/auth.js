import jwt from "jsonwebtoken";

// JWT_SECRET is required (validated at startup in index.js). No insecure
// fallback here — a missing secret should crash the process, not silently
// sign tokens with a well-known, publicly-committed string.
const secret = () => process.env.JWT_SECRET;
const sessionCookieOptions = () => {
  const production = process.env.NODE_ENV === "production";
  return { httpOnly: true, sameSite: production ? "none" : "lax", secure: production, maxAge: 7 * 24 * 60 * 60 * 1000 };
};

export function issueSession(res, user) {
  const token = jwt.sign({ sub: user._id.toString(), email: user.email }, secret(), { expiresIn: "7d" });
  res.cookie("ledger_session", token, sessionCookieOptions());
}

export function clearSession(res) {
  const { maxAge, ...options } = sessionCookieOptions();
  res.clearCookie("ledger_session", options);
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.ledger_session;
  if (!token) return res.status(401).json({ error: "Authentication required" });
  try { req.userId = jwt.verify(token, secret()).sub; return next(); }
  catch { return res.status(401).json({ error: "Session expired. Please sign in again." }); }
}

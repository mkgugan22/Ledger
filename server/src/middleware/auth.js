import jwt from "jsonwebtoken";

const secret = () => process.env.JWT_SECRET || "development-only-change-me";

export function issueSession(res, user) {
  const token = jwt.sign({ sub: user._id.toString(), email: user.email }, secret(), { expiresIn: "7d" });
  res.cookie("ledger_session", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 7 * 24 * 60 * 60 * 1000 });
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.ledger_session;
  if (!token) return res.status(401).json({ error: "Authentication required" });
  try { req.userId = jwt.verify(token, secret()).sub; return next(); }
  catch { return res.status(401).json({ error: "Session expired. Please sign in again." }); }
}

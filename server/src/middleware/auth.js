import jwt from "jsonwebtoken";
import User from "../models/User.js";

const secret = () => process.env.JWT_SECRET;
const sessionCookieOptions = () => {
  const production = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    sameSite: production ? "none" : "lax",
    secure: production,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  };
};

export function issueSession(res, user) {
  const token = jwt.sign(
    { sub: user._id.toString(), email: user.email, ver: user.tokenVersion || 0 },
    secret(),
    { expiresIn: "7d" },
  );
  res.cookie("ledger_session", token, sessionCookieOptions());
}

export function clearSession(res) {
  const { maxAge, ...options } = sessionCookieOptions();
  res.clearCookie("ledger_session", options);
}

// Logout invalidates all tokens previously issued for this account. If MongoDB
// is unavailable, propagate the error so the client is not told revocation worked.
export async function revokeSession(req, res) {
  const token = req.cookies?.ledger_session;
  let payload = null;
  if (token) {
    try {
      payload = jwt.verify(token, secret());
    } catch {
      // An expired or invalid token is already unusable; still clear its cookie.
    }
  }
  if (payload?.sub) {
    await User.updateOne({ _id: payload.sub }, { $inc: { tokenVersion: 1 } });
  }
  clearSession(res);
}

export async function requireAuth(req, res, next) {
  const token = req.cookies?.ledger_session;
  if (!token) return res.status(401).json({ error: "Authentication required" });

  let payload;
  try {
    payload = jwt.verify(token, secret());
  } catch {
    return res.status(401).json({ error: "Session expired. Please sign in again." });
  }

  try {
    const user = await User.findById(payload.sub).select("tokenVersion").lean();
    if (!user || (payload.ver || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({ error: "Session expired. Please sign in again." });
    }
    req.userId = payload.sub;
    return next();
  } catch (err) {
    // A database outage is a server failure, not an expired user session.
    return next(err);
  }
}

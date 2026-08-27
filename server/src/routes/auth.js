import { Router } from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import Valuation from "../models/Valuation.js";
import Investment from "../models/Investment.js";
import { issueSession, requireAuth } from "../middleware/auth.js";

const router = Router();

// Records created before authentication was introduced have no owner. The
// database currently contains one account, so it is safe to claim those legacy
// records for that account during the first authenticated request. The guard
// prevents accidental cross-user assignment once multiple accounts exist.
async function claimLegacyRecords(userId) {
  if (await User.countDocuments() !== 1) return;
  await Promise.all([
    Transaction.updateMany({ user: { $exists: false } }, { $set: { user: userId } }),
    Valuation.updateMany({ user: { $exists: false } }, { $set: { user: userId } }),
    Investment.updateMany({ user: { $exists: false } }, { $set: { user: userId } }),
  ]);
}

router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name?.trim() || !email?.trim() || !password || password.length < 8) return res.status(400).json({ error: "Name, email, and an 8-character password are required." });
    const normalizedEmail = email.toLowerCase().trim();
    if (await User.exists({ email: normalizedEmail })) return res.status(409).json({ error: "An account with that email already exists." });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name: name.trim(), email: normalizedEmail, passwordHash });
    issueSession(res, user);
    res.status(201).json({ user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email?.toLowerCase().trim() }).select("+passwordHash");
  if (!user || !(await bcrypt.compare(password || "", user.passwordHash))) return res.status(401).json({ error: "Invalid email or password." });
  await claimLegacyRecords(user._id);
  issueSession(res, user);
  res.json({ user: { id: user._id, name: user.name, email: user.email } });
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.userId).select("name email");
  if (!user) return res.status(401).json({ error: "Session expired. Please sign in again." });
  await claimLegacyRecords(user._id);
  res.json({ user: { id: user._id, name: user.name, email: user.email } });
});

router.post("/logout", (req, res) => { res.clearCookie("ledger_session"); res.json({ ok: true }); });
export default router;

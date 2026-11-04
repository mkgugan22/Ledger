import mongoose from "mongoose";

// A single lease coordinates the global Auto-SIP scan across API instances.
// The default _id index is the mutex key; expiresAt is also TTL-cleaned.
const autoSipLockSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  ownerId: { type: String, required: true },
  expiresAt: { type: Date, required: true },
}, { versionKey: false });

autoSipLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.AutoSipLock || mongoose.model("AutoSipLock", autoSipLockSchema);

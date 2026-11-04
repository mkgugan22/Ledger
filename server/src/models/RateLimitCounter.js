import mongoose from "mongoose";

const rateLimitCounterSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  hits: { type: Number, required: true, min: 0 },
  resetAt: { type: Date, required: true },
}, { versionKey: false });

rateLimitCounterSchema.index({ resetAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("RateLimitCounter", rateLimitCounterSchema);

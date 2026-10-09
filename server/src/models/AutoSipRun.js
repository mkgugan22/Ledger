import mongoose from "mongoose";

// One document per user per month once that month's auto-SIP entries have been
// created. This is what stops a deleted auto entry from being re-created later:
// the job checks this record, not the investment rows themselves.
const autoSipRunSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  month: { type: String, required: true }, // "YYYY-MM"
  funds: { type: [String], default: [] },
}, { timestamps: true });

autoSipRunSchema.index({ user: 1, month: 1 }, { unique: true });

export default mongoose.model("AutoSipRun", autoSipRunSchema);

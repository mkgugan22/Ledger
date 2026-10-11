import mongoose from "mongoose";

const investmentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  fund: { type: String, required: true, trim: true },
  // "Status" = a current-status snapshot for a fund (invested-to-date, valuation,
  // units, XIRR as of today) rather than a single contribution. Recording a new
  // Status entry for a fund is how you refresh its current numbers over time.
  type: { type: String, enum: ["SIP", "Additional", "Status"], default: "SIP" },
  monthly: { type: Number, min: 0, default: 0 },
  invested: { type: Number, required: true, min: 0 },
  currentValue: { type: Number, required: true, min: 0 },
  date: { type: String, required: true },
  nav: { type: Number, min: 0 },
  units: { type: Number, min: 0 },
  xirr: { type: Number },
  source: { type: String, default: "Manual entry" },
  assetClass: { type: String, enum: ["Equity", "Debt", "Gold", "International", "Other"], default: "Equity" },
  benchmarkReturn: { type: Number },
  // Set ONLY on rows created by the monthly auto-SIP job (services/autoSip.js),
  // e.g. "2026-10". Manual entries never have it, and the API's zod schemas do
  // not accept it from clients. Together with the partial unique index below it
  // guarantees one auto entry per user + fund + month.
  autoSipMonth: { type: String },
}, { timestamps: true });

investmentSchema.index({ user: 1, fund: 1, date: 1 });
investmentSchema.index({ user: 1, type: 1, date: 1 });
// Partial index: only rows that actually carry autoSipMonth are indexed, so
// every existing/manual investment row is completely unaffected by this.
investmentSchema.index(
  { user: 1, fund: 1, autoSipMonth: 1 },
  { unique: true, partialFilterExpression: { autoSipMonth: { $type: "string" } } }
);

export default mongoose.model("Investment", investmentSchema);

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
}, { timestamps: true });

export default mongoose.model("Investment", investmentSchema);

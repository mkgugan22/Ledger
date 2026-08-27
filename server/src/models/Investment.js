import mongoose from "mongoose";

const investmentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  fund: { type: String, required: true, trim: true },
  type: { type: String, enum: ["SIP", "Additional"], default: "SIP" },
  monthly: { type: Number, min: 0, default: 0 },
  invested: { type: Number, required: true, min: 0 },
  currentValue: { type: Number, required: true, min: 0 },
  date: { type: String, required: true },
  nav: { type: Number, min: 0 },
  source: { type: String, default: "Manual entry" },
}, { timestamps: true });

export default mongoose.model("Investment", investmentSchema);

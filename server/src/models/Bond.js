import mongoose from "mongoose";

const bondSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  issuer: { type: String, required: true, trim: true },
  bondType: { type: String, enum: ["Government", "Corporate", "Municipal", "PSU", "Other"], default: "Government" },
  // "Status" = a current-status snapshot for a bond (its market value as of
  // today) rather than the original purchase. Recording a new Status entry
  // for a bond is how you refresh its progress over time — same pattern as
  // Investment's SIP/Additional/Status split.
  type: { type: String, enum: ["Purchase", "Status"], default: "Purchase" },
  faceValue: { type: Number, required: true, min: 0 },
  currentValue: { type: Number, required: true, min: 0 },
  couponRate: { type: Number, min: 0 },
  purchaseDate: { type: String },
  maturityDate: { type: String },
  date: { type: String, required: true },
  source: { type: String, default: "Manual entry" },
}, { timestamps: true });

export default mongoose.model("Bond", bondSchema);

import mongoose from "mongoose";

const valuationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    month: { type: String, required: true }, // "YYYY-MM"
    instrument: { type: String, required: true, trim: true },
    value: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

// One valuation per instrument per month — re-recording the same
// month+instrument updates the existing entry instead of duplicating it.
valuationSchema.index({ user: 1, month: 1, instrument: 1 }, { unique: true });

export default mongoose.model("Valuation", valuationSchema);

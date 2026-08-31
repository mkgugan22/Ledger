import mongoose from "mongoose";

const budgetSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, required: true },
    mode: {
      type: String,
      required: true,
      enum: ["Income", "Needs", "Savings", "Spending"],
    },
    type: { type: String, required: true, trim: true },
    month: { type: String, required: true }, // "YYYY-MM"
    plannedAmount: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

// One planned figure per category per month — POST upserts on this key,
// same pattern as the existing Valuation model.
budgetSchema.index({ user: 1, month: 1, mode: 1, type: 1 }, { unique: true });

export default mongoose.model("Budget", budgetSchema);

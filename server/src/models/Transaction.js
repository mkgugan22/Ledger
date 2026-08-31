import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    mode: {
      type: String,
      required: true,
      enum: ["Income", "Needs", "Savings", "Spending"],
    },
    type: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    month: { type: String, required: true }, // "YYYY-MM"
    note: { type: String, default: "", trim: true },
    // Recurring transactions: when `recurring` is true, this document acts as
    // a template (e.g. "Rent", Needs, ₹15000, monthly). It is still a normal
    // entry for its own `month` — it just also gets reused to generate future
    // months' entries via POST /api/transactions/generate-recurring.
    recurring: { type: Boolean, default: false },
    frequency: { type: String, enum: ["monthly"], default: undefined },
    // Set only on entries that were generated FROM a recurring template, so
    // generation can be re-run for a month without creating duplicates.
    generatedFrom: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction", default: null },
  },
  { timestamps: true }
);

transactionSchema.index({ month: 1, mode: 1 });
// Speeds up "find this user's recurring templates" during generation, and
// "has this template already been applied to this month" dedupe checks.
transactionSchema.index({ user: 1, recurring: 1 });
transactionSchema.index(
  { user: 1, generatedFrom: 1, month: 1 },
  { unique: true, partialFilterExpression: { generatedFrom: { $type: "objectId" } } }
);

export default mongoose.model("Transaction", transactionSchema);

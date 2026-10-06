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
    // Optional precision fields. Legacy entries remain valid when these are absent.
    date: { type: String, default: null }, // "YYYY-MM-DD"
    account: { type: String, default: "", trim: true, maxlength: 120 },
    merchant: { type: String, default: "", trim: true, maxlength: 160 },
    paymentMethod: { type: String, default: "", trim: true, maxlength: 80 },
    note: { type: String, default: "", trim: true },
    recurring: { type: Boolean, default: false },
    frequency: { type: String, enum: ["monthly"], default: undefined },
    generatedFrom: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction", default: null },
  },
  { timestamps: true }
);

// Query patterns used by the dashboard and entries screen. Including user in
// the index keeps concurrent users from scanning unrelated documents.
transactionSchema.index({ user: 1, createdAt: 1 });
transactionSchema.index({ user: 1, month: 1, createdAt: 1 });
transactionSchema.index({ user: 1, date: 1, createdAt: 1 });
transactionSchema.index({ user: 1, account: 1, date: 1 });
transactionSchema.index({ user: 1, recurring: 1 });
transactionSchema.index(
  { user: 1, generatedFrom: 1, month: 1 },
  { unique: true, partialFilterExpression: { generatedFrom: { $type: "objectId" } } }
);

export default mongoose.model("Transaction", transactionSchema);

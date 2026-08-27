import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    mode: {
      type: String,
      required: true,
      enum: ["Income", "Needs", "Savings", "Spending"],
    },
    type: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    month: { type: String, required: true }, // "YYYY-MM"
    note: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

transactionSchema.index({ month: 1, mode: 1 });

export default mongoose.model("Transaction", transactionSchema);

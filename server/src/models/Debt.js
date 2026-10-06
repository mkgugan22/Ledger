import mongoose from "mongoose";

const debtSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  debtType: { type: String, enum: ["Loan", "Credit Card", "EMI", "Other"], default: "Loan" },
  originalAmount: { type: Number, required: true, min: 0 },
  outstandingAmount: { type: Number, required: true, min: 0 },
  interestRate: { type: Number, min: 0 },
  minimumPayment: { type: Number, min: 0, default: 0 },
  dueDate: { type: String, default: null },
  status: { type: String, enum: ["active", "paid"], default: "active" },
  note: { type: String, default: "", trim: true, maxlength: 500 },
}, { timestamps: true });

debtSchema.index({ user: 1, status: 1, dueDate: 1 });
debtSchema.index({ user: 1, name: 1 });

export default mongoose.model("Debt", debtSchema);

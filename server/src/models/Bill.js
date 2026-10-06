import mongoose from "mongoose";

const billSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  amount: { type: Number, required: true, min: 0 },
  dueDate: { type: String, required: true }, // YYYY-MM-DD; for recurring bills, this is the next due date.
  category: { type: String, default: "General", trim: true, maxlength: 80 },
  recurring: { type: Boolean, default: false },
  frequency: { type: String, enum: ["monthly"], default: undefined },
  status: { type: String, enum: ["active", "paid"], default: "active" },
  note: { type: String, default: "", trim: true, maxlength: 500 },
}, { timestamps: true });

billSchema.index({ user: 1, status: 1, dueDate: 1 });
billSchema.index({ user: 1, recurring: 1, dueDate: 1 });

export default mongoose.model("Bill", billSchema);

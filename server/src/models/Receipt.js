import mongoose from "mongoose";

const receiptSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  transaction: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction", required: true, index: true },
  filename: { type: String, required: true, trim: true, maxlength: 180 },
  contentType: { type: String, required: true, enum: ["image/jpeg", "image/png", "application/pdf"] },
  size: { type: Number, required: true, max: 5 * 1024 * 1024 },
  data: { type: Buffer, required: true, select: false },
}, { timestamps: true });

receiptSchema.index({ user: 1, transaction: 1, createdAt: -1 });
export default mongoose.model("Receipt", receiptSchema);

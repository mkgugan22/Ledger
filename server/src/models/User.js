import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  // Incrementing this value invalidates JWT cookies issued before the change.
  tokenVersion: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

export default mongoose.model("User", userSchema);

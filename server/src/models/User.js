import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  // Existing accounts remain verified by default; new registrations explicitly
  // set this to false when email verification is enabled.
  emailVerified: { type: Boolean, default: true },
  emailVerificationTokenHash: { type: String, select: false },
  emailVerificationExpiresAt: { type: Date, select: false },
  passwordResetTokenHash: { type: String, select: false },
  passwordResetExpiresAt: { type: Date, select: false },
  // Incrementing this value invalidates JWT cookies issued before the change.
  tokenVersion: { type: Number, default: 0, min: 0 },
  // Null means the user has not finished or skipped the introductory tour.
  productTourCompletedAt: { type: Date, default: null }
}, { timestamps: true });

export default mongoose.model("User", userSchema);

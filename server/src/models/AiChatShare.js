import mongoose from "mongoose";

const aiChatShareSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true, index: true },
    messages: [{
      role: { type: String, enum: ["user", "assistant"], required: true },
      content: { type: String, required: true, maxlength: 12000 },
      createdAt: { type: Date, required: true },
      _id: false,
    }],
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true }
);

export default mongoose.model("AiChatShare", aiChatShareSchema);

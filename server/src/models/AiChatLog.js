import mongoose from "mongoose";

// Structured record of every Ledger AI exchange: the question actually
// typed, a normalized version of it (for fast repeat-question lookups),
// a hash of the ledger data snapshot it was answered against (so a
// cached answer is only ever reused if the underlying data hasn't
// changed since), the conversation history sent with it, the answer
// itself, and whether it succeeded.
const aiChatLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    message: { type: String, required: true, trim: true, maxlength: 2000 },

    // Lowercased, whitespace-collapsed version of `message`, used only
    // for matching repeat questions — never shown to the user.
    normalizedMessage: { type: String, required: true, trim: true, maxlength: 2000 },

    // sha256 of the ledger snapshot this question was answered against.
    // Ties a stored answer to the exact data it's valid for.
    snapshotHash: { type: String, required: true },

    history: [
      {
        role: { type: String, enum: ["user", "assistant"], required: true },
        content: { type: String, required: true, trim: true, maxlength: 2000 },
        _id: false,
      },
    ],

    answer: { type: String, default: "", trim: true },

    status: { type: String, enum: ["ok", "error"], required: true, default: "ok" },
    errorMessage: { type: String, default: "" },

    latencyMs: { type: Number, min: 0 },
  },
  { timestamps: true }
);

// Fast lookup for "has this exact question already been answered
// against this exact data, recently?" — the quick-response path.
aiChatLogSchema.index({ user: 1, normalizedMessage: 1, snapshotHash: 1, createdAt: -1 });

// General "this user's chat history, most recent first" access pattern.
aiChatLogSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model("AiChatLog", aiChatLogSchema);

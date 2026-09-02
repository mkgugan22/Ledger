import { Bot } from "lucide-react";

export default function LedgerAssistantAvatar({ thinking = false, size = "normal" }) {
  return (
    <span className={`lg-ai-avatar lg-ai-avatar-${size}${thinking ? " is-thinking" : ""}`} aria-hidden="true">
      <Bot size={size === "small" ? 16 : 27} strokeWidth={1.75} />
      {thinking && <span className="lg-ai-avatar-pulse" />}
    </span>
  );
}

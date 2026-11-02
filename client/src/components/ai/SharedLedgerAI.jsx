import { useEffect, useState } from "react";
import { Alert, Button, Spinner } from "react-bootstrap";
import { ArrowLeft, Copy, CopyCheck, LockKeyhole, Share2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import LedgerAssistantAvatar from "./LedgerAssistantAvatar.jsx";
import { fetchSharedLedgerAIChat } from "../../lib/api.js";

function formatMessageTimestamp(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Timestamp unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function SharedMessage({ item }) {
  const assistant = item.role === "assistant";
  const [copied, setCopied] = useState(false);

  async function copyMessage() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(item.content);
      } else {
        const field = document.createElement("textarea");
        field.value = item.content;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        const success = document.execCommand("copy");
        field.remove();
        if (!success) throw new Error("Clipboard unavailable");
      }
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={`d-flex gap-2 ${assistant ? "" : "flex-row-reverse"}`}>
      {assistant && <LedgerAssistantAvatar size="small" />}
      <div className={`lg-ai-message-wrap ${assistant ? "assistant" : "user"}`}>
        <div className={`lg-ai-message ${assistant ? "assistant" : "user"}`}>
          {item.content.split("\n").map((line, index) => (
            <p key={`${index}-${line}`} className="mb-0">{line || "\u00a0"}</p>
          ))}
        </div>
        <div className={`lg-ai-message-meta ${assistant ? "" : "justify-content-end"}`}>
          <time dateTime={item.createdAt || undefined}>{formatMessageTimestamp(item.createdAt)}</time>
          <button
            type="button"
            className="lg-ai-message-action"
            onClick={copyMessage}
            title={copied ? "Copied" : "Copy message"}
          >
            {copied ? <CopyCheck size={13} /> : <Copy size={13} />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SharedLedgerAI() {
  const { token } = useParams();
  const [messages, setMessages] = useState([]);
  const [expiresAt, setExpiresAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetchSharedLedgerAIChat(token)
      .then((result) => {
        if (!active) return;
        setMessages(result.messages || []);
        setExpiresAt(result.expiresAt);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || "This shared conversation is unavailable.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  return (
    <main className="lg-ai-shared-page">
      <div className="lg-ai-shared-shell">
        <header className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
          <div className="d-flex align-items-center gap-3">
            <LedgerAssistantAvatar />
            <div>
              <div className="font-serif h3 mb-0">Ledger AI</div>
              <div className="small text-secondary">Shared conversation · Read only</div>
            </div>
          </div>
          <Link to="/ledger-ai" className="btn btn-outline-secondary btn-sm">
            <ArrowLeft size={14} className="me-1" /> Open Ledger AI
          </Link>
        </header>

        <div className="lg-card lg-ai-shared-card">
          <div className="lg-ai-chat-head d-flex align-items-center gap-2">
            <Share2 size={16} color="var(--lg-brass-deep)" />
            <span className="fw-semibold">Shared conversation</span>
            <span className="small text-secondary ms-auto">View only</span>
          </div>

          <div className="lg-ai-privacy small m-3">
            <LockKeyhole size={15} />
            This is a read-only copy of selected chat messages. It does not provide access to the owner's Ledger account or financial records.
          </div>

          <div className="lg-ai-messages lg-ai-shared-messages">
            {loading && (
              <div className="d-flex align-items-center gap-2 text-secondary">
                <Spinner animation="border" size="sm" /> Loading shared conversation…
              </div>
            )}
            {!loading && error && <Alert variant="warning" className="mb-0">{error}</Alert>}
            {!loading && !error && messages.map((item, index) => (
              <SharedMessage item={item} key={`${item.role}-${index}`} />
            ))}
          </div>

          {expiresAt && !error && (
            <div className="px-3 py-2 small text-secondary border-top" style={{ borderColor: "var(--lg-rule)" }}>
              This link expires {new Intl.DateTimeFormat("en-IN", {
                weekday: "long",
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(expiresAt))}.
            </div>
          )}
        </div>

        <p className="small text-secondary text-center mt-3">
          Shared links can be viewed by anyone who has the link. Avoid sharing conversations containing sensitive personal information.
        </p>
      </div>
    </main>
  );
}

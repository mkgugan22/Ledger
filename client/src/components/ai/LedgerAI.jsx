import { useEffect, useRef, useState } from "react";
import { Alert, Button, Form, Spinner } from "react-bootstrap";
import { Check, Copy, LockKeyhole, RotateCcw, Send, Share2, Sparkles } from "lucide-react";
import PageHeader from "../shared/PageHeader.jsx";
import LedgerAssistantAvatar from "./LedgerAssistantAvatar.jsx";
import { chatWithLedgerAI, createLedgerAIShare, fetchLedgerAIHistory, fetchLedgerAIShares, revokeLedgerAIShare } from "../../lib/api.js";

const STARTER_QUESTIONS = [
  "How did I do with my budget this month?",
  "Where is most of my money going?",
  "Can I increase my SIP safely?",
  "What should I focus on next month?",
];

const WELCOME = {
  role: "assistant",
  content: "Hello — I’m Ledger AI. I can explain your spending, budget, savings, recurring entries, and recorded investments. I’m read-only, so I’ll never change an entry for you.",
  createdAt: new Date().toISOString(),
};

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

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("Clipboard access is unavailable in this browser.");
}

function Message({ item }) {
  const assistant = item.role === "assistant";
  const [copied, setCopied] = useState(false);
  const timestamp = formatMessageTimestamp(item.createdAt);

  async function handleCopy() {
    try {
      await copyText(item.content);
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
            <p key={`${line}-${index}`} className="mb-0">{line || "\u00a0"}</p>
          ))}
        </div>
        <div className={`lg-ai-message-meta ${assistant ? "" : "justify-content-end"}`}>
          <time dateTime={item.createdAt || undefined}>{timestamp}</time>
          <button
            type="button"
            className="lg-ai-message-action"
            onClick={handleCopy}
            aria-label={copied ? "Message copied" : "Copy message"}
            title={copied ? "Copied" : "Copy message"}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LedgerAI() {
  const [messages, setMessages] = useState([WELCOME]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState("");
  const [shareNotice, setShareNotice] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [shares, setShares] = useState([]);
  const [revokingShareId, setRevokingShareId] = useState(null);
  const messagesEnd = useRef(null);

  // Restore the persisted exchange history. Existing Mongo createdAt values
  // are passed through as-is and used for the message timeline.
  useEffect(() => {
    let active = true;

    (async () => {
      const [historyResult, sharesResult] = await Promise.allSettled([
        fetchLedgerAIHistory(),
        fetchLedgerAIShares(),
      ]);

      if (!active) return;
      if (historyResult.status === "fulfilled" && historyResult.value.messages?.length) {
        setMessages((current) => [current[0], ...historyResult.value.messages]);
      }
      if (sharesResult.status === "fulfilled") {
        setShares(Array.isArray(sharesResult.value) ? sharesResult.value : []);
      }
      setLoadingHistory(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending, streamingText, loadingHistory]);

  async function submit(question) {
    const message = question.trim();
    if (!message || sending) return;

    const prior = messages.filter((item, index) => index > 0).slice(-6);
    const userMessage = { role: "user", content: message, createdAt: new Date().toISOString() };

    setMessages((items) => [...items, userMessage]);
    setDraft("");
    setError("");
    setShareNotice("");
    setSending(true);
    setStreamingText("");

    try {
      const result = await chatWithLedgerAI({ message, history: prior }, (chunk) => {
        setStreamingText((text) => text + chunk);
      });
      setMessages((items) => [
        ...items,
        { role: "assistant", content: result.answer, createdAt: result.generatedAt || new Date().toISOString() },
      ]);
    } catch (requestError) {
      setError(requestError.message || "Ledger AI could not answer right now.");
    } finally {
      setSending(false);
      setStreamingText("");
    }
  }

  // Share a bounded, immutable transcript snapshot. The server stores only
  // these selected messages behind an unguessable, expiring token; it does
  // not expose the user's account or financial records.
  async function shareConversation() {
    if (sharing || sending || loadingHistory || !messages.some((item) => item.role === "user")) return;

    setSharing(true);
    setError("");
    setShareNotice("");

    try {
      const transcript = messages.slice(-81).map((item) => ({
        role: item.role,
        content: item.content,
        createdAt: item.createdAt || new Date().toISOString(),
      }));
      const share = await createLedgerAIShare(transcript);
      setShares((current) => [share, ...current.filter((item) => item.id !== share.id)].slice(0, 20));
      const shareUrl = `${window.location.origin}/ledger-ai/shared/${share.token}`;
      await copyText(shareUrl);
      setShareNotice("Share link copied. Anyone with the link can view this snapshot for 7 days.");
    } catch (shareError) {
      setError(shareError.message || "The share link could not be created.");
    } finally {
      setSharing(false);
    }
  }

  async function revokeShare(id) {
    if (revokingShareId) return;
    setRevokingShareId(id);
    setError("");
    setShareNotice("");
    try {
      await revokeLedgerAIShare(id);
      setShares((current) => current.filter((item) => item.id !== id));
      setShareNotice("The shared link has been revoked.");
    } catch (revokeError) {
      setError(revokeError.message || "The shared link could not be revoked.");
    } finally {
      setRevokingShareId(null);
    }
  }

  // Clearing the visible chat does not revoke previously shared snapshots.
  function reset() {
    if (sending || sharing) return;
    setMessages([{ ...WELCOME, createdAt: new Date().toISOString() }]);
    setError("");
    setDraft("");
    setStreamingText("");
    setShareNotice("");
  }

  return (
    <section className="lg-ai-page">
      <PageHeader
        title="Ledger AI"
        subtitle="Personal financial insights from your Ledger data — read-only and private to your account."
        right={
          <div className="d-flex flex-wrap gap-2">
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={shareConversation}
              disabled={sending || sharing || loadingHistory || !messages.some((item) => item.role === "user")}
            >
              {sharing ? <Spinner animation="border" size="sm" className="me-1" /> : <Share2 size={14} className="me-1" />}
              {sharing ? "Creating link…" : "Share chat"}
            </Button>
            <Button variant="outline-secondary" size="sm" onClick={reset} disabled={sending || sharing}>
              <RotateCcw size={14} className="me-1" /> Clear chat
            </Button>
          </div>
        }
      />

      <div className="lg-ai-layout">
        <aside className="lg-card lg-ai-intro p-4">
          <div className="d-flex align-items-center gap-3 mb-3">
            <LedgerAssistantAvatar thinking={sending} />
            <div>
              <div className="font-serif h4 mb-0">Your finance guide</div>
              <div className="small text-secondary">Powered by Gemini</div>
            </div>
          </div>

          <p className="small text-secondary mb-3">
            Ask about recorded cash flow, budgets, spending patterns, savings,
            recurring bills, and investments.
          </p>

          <div className="lg-ai-privacy small">
            <LockKeyhole size={15} />
            The assistant only reads aggregated data from your signed-in Ledger account.
            It cannot change records.
          </div>

          <div className="mt-4">
            <div className="lg-summary-label mb-2">Try a question</div>
            <div className="d-flex flex-column gap-2">
              {STARTER_QUESTIONS.map((question) => (
                <button
                  key={question}
                  type="button"
                  className="lg-ai-suggestion text-start"
                  onClick={() => submit(question)}
                  disabled={sending}
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className="lg-card lg-ai-chat d-flex flex-column">
          <div className="lg-ai-chat-head d-flex align-items-center gap-2">
            <Sparkles size={16} color="var(--lg-brass-deep)" />
            <span className="fw-semibold">Conversation</span>
            <span className="small text-secondary ms-auto">
              Financial education, not financial advice
            </span>
          </div>

          <div className="lg-ai-messages">
            {messages.map((item, index) => (
              <Message item={item} key={`${item.role}-${index}-${item.content.slice(0, 24)}`} />
            ))}

            {loadingHistory && (
              <div className="d-flex gap-2">
                <LedgerAssistantAvatar size="small" />
                <div className="lg-ai-message assistant d-flex align-items-center gap-2">
                  <Spinner animation="grow" size="sm" />
                  <span className="small">Restoring your conversation…</span>
                </div>
              </div>
            )}

            {sending && (
              <div className="d-flex gap-2">
                <LedgerAssistantAvatar thinking size="small" />
                {streamingText ? (
                  <div className="lg-ai-message assistant">
                    {streamingText.split("\n").map((line, index) => (
                      <p key={index} className="mb-0">{line || "\u00a0"}</p>
                    ))}
                  </div>
                ) : (
                  <div className="lg-ai-message assistant d-flex align-items-center gap-2">
                    <Spinner animation="grow" size="sm" />
                    <span className="small">Reviewing your Ledger…</span>
                  </div>
                )}
              </div>
            )}

            <div ref={messagesEnd} />
          </div>

          {error && <Alert variant="danger" className="mx-3 mb-0 py-2 small">{error}</Alert>}
          {shareNotice && <Alert variant="success" className="mx-3 mb-0 py-2 small">{shareNotice}</Alert>}
          {shares.length > 0 && (
            <div className="mx-3 mb-3 p-3 border rounded">
              <div className="fw-semibold small mb-2">Active shared links</div>
              {shares.map((share) => (
                <div key={share.id} className="d-flex align-items-center justify-content-between gap-3 py-2 border-top">
                  <div className="small text-secondary">
                    <div>Created {formatMessageTimestamp(share.createdAt)}</div>
                    <div>Expires {formatMessageTimestamp(share.expiresAt)}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline-danger"
                    disabled={revokingShareId !== null}
                    onClick={() => revokeShare(share.id)}
                  >
                    {revokingShareId === share.id ? <Spinner animation="border" size="sm" /> : "Revoke"}
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Form className="lg-ai-composer" onSubmit={(event) => {
            event.preventDefault();
            submit(draft);
          }}>
            <Form.Control
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask about your finances…"
              maxLength={2000}
              disabled={sending}
            />
            <Button type="submit" disabled={sending || !draft.trim()} className="lg-ai-send">
              <Send size={17} />
            </Button>
          </Form>
        </div>
      </div>
    </section>
  );
}

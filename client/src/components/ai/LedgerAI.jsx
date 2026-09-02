import { useEffect, useRef, useState } from "react";
import { Alert, Button, Form, Spinner } from "react-bootstrap";
import { LockKeyhole, RotateCcw, Send, Sparkles } from "lucide-react";
import PageHeader from "../shared/PageHeader.jsx";
import LedgerAssistantAvatar from "./LedgerAssistantAvatar.jsx";
import { chatWithLedgerAI } from "../../lib/api.js";

const STARTER_QUESTIONS = [
  "How did I do with my budget this month?",
  "Where is most of my money going?",
  "Can I increase my SIP safely?",
  "What should I focus on next month?",
];

const WELCOME = {
  role: "assistant",
  content: "Hello — I’m Ledger AI. I can explain your spending, budget, savings, recurring entries, and recorded investments. I’m read-only, so I’ll never change an entry for you.",
};

function Message({ item }) {
  const assistant = item.role === "assistant";

  return (
    <div className={`d-flex gap-2 ${assistant ? "" : "flex-row-reverse"}`}>
      {assistant && <LedgerAssistantAvatar size="small" />}
      <div className={`lg-ai-message ${assistant ? "assistant" : "user"}`}>
        {item.content.split("\n").map((line, index) => (
          <p key={`${line}-${index}`} className="mb-0">{line || "\u00a0"}</p>
        ))}
      </div>
    </div>
  );
}

export default function LedgerAI() {
  const [messages, setMessages] = useState([WELCOME]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const messagesEnd = useRef(null);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  async function submit(question) {
    const message = question.trim();
    if (!message || sending) return;

    const prior = messages.filter((item, index) => index > 0).slice(-6);

    setMessages((items) => [...items, { role: "user", content: message }]);
    setDraft("");
    setError("");
    setSending(true);

    try {
      const result = await chatWithLedgerAI({ message, history: prior });
      setMessages((items) => [...items, { role: "assistant", content: result.answer }]);
    } catch (requestError) {
      setError(requestError.message || "Ledger AI could not answer right now.");
    } finally {
      setSending(false);
    }
  }

  function reset() {
    if (sending) return;
    setMessages([WELCOME]);
    setError("");
    setDraft("");
  }

  return (
    <section className="lg-ai-page">
      <PageHeader
        title="Ledger AI"
        subtitle="Personal financial insights from your Ledger data — read-only and private to your account."
        right={
          <Button variant="outline-secondary" size="sm" onClick={reset} disabled={sending}>
            <RotateCcw size={14} className="me-1" /> New chat
          </Button>
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

            {sending && (
              <div className="d-flex gap-2">
                <LedgerAssistantAvatar thinking size="small" />
                <div className="lg-ai-message assistant d-flex align-items-center gap-2">
                  <Spinner animation="grow" size="sm" />
                  <span className="small">Reviewing your Ledger…</span>
                </div>
              </div>
            )}

            <div ref={messagesEnd} />
          </div>

          {error && <Alert variant="danger" className="mx-3 mb-0 py-2 small">{error}</Alert>}

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

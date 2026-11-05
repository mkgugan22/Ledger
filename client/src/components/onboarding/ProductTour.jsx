import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, Compass, X } from "lucide-react";
import LedgerMascot from "./LedgerMascot.jsx";
import "./ProductTour.css";

const STEPS = [
  {
    path: "/",
    section: "01 · Overview",
    title: "Your financial picture, at a glance",
    description: "Start at the dashboard to understand your monthly cash flow, income, spending, available balance and alerts.",
    bullets: ["Switch the selected month", "Review cash-flow and category summaries", "Open an insight to view the related entries"],
    mood: "happy",
  },
  {
    path: "/add",
    section: "02 · Add records",
    title: "Record money as it happens",
    description: "Add income, needs, savings and spending. Attach a receipt or use payslip auto-fill, then review the details before saving.",
    bullets: ["Choose a transaction type", "Enter the amount and date", "Keep optional merchant, account and receipt details"],
    mood: "curious",
  },
  {
    path: "/entries",
    section: "03 · All Entries",
    title: "Find and manage your transactions",
    description: "Your entries are collected in one place. Filter by category, review the history, edit a record or undo a recent deletion.",
    bullets: ["Filter by Income, Needs, Savings or Spending", "Edit a transaction from its row", "Import or export transaction CSV files"],
    mood: "thinking",
  },
  {
    path: "/budget",
    section: "04 · Budget",
    title: "Give every month a plan",
    description: "Set monthly plans by category and compare your planned amounts with the activity recorded in Ledger.",
    bullets: ["Choose the month you want to plan", "Set planned amounts for your categories", "Review the remaining amount as entries are added"],
    mood: "happy",
  },
  {
    path: "/savings",
    section: "05 · Savings",
    title: "Track the value you are building",
    description: "Record valuations for savings instruments and review how your recorded balances change month by month.",
    bullets: ["Track instruments such as savings and gold", "Update a valuation when you have a new value", "Compare your history across months"],
    mood: "very-happy",
  },
  {
    path: "/sip-growth",
    section: "06 · Investments",
    title: "Review SIPs and investment growth",
    description: "Keep mutual-fund investments and SIP activity together. Use the growth view to understand contributions and recorded values.",
    bullets: ["Record SIP and additional investments", "Review fund and NAV information", "Compare invested amounts with current values"],
    mood: "curious",
  },
  {
    path: "/bonds",
    section: "07 · Bonds",
    title: "Keep your bond holdings organised",
    description: "Record bond purchases and valuations, and review coupon, issuer and maturity information in one place.",
    bullets: ["Record bond details and purchase dates", "Review coupon and maturity information", "Keep current values up to date"],
    mood: "curious",
  },
  {
    path: "/obligations",
    section: "08 · Obligations",
    title: "Keep upcoming commitments visible",
    description: "Track debts and bills alongside your transactions, including due dates and payment status.",
    bullets: ["Review active bills and debts", "Update payment status as you go", "Keep due dates and balances up to date"],
    mood: "thinking",
  },
  {
    path: "/ledger-ai",
    section: "09 · Ledger AI",
    title: "Ask questions about your Ledger data",
    description: "Ledger AI can explain recorded budgets, spending and investments. It is read-only: it does not create, edit or delete your records.",
    bullets: ["Ask about your recorded financial activity", "Copy a useful response or share a transcript", "Revoke a shared link from your active links list"],
    mood: "happy",
  },
];

export default function ProductTour({ onComplete }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const dialogRef = useRef(null);
  const didInitializeRoute = useRef(false);
  const location = useLocation();
  const navigate = useNavigate();
  const step = STEPS[activeIndex];
  const isLast = activeIndex === STEPS.length - 1;

  useEffect(() => {
    dialogRef.current?.focus();

    // useNavigate can change identity when the current location changes in
    // BrowserRouter's declarative mode. Initialise the first tour route once
    // only; otherwise this effect can send every Next/Back navigation back
    // to the dashboard immediately after the URL changes.
    if (didInitializeRoute.current) return;
    didInitializeRoute.current = true;

    if (location.pathname !== STEPS[0].path) {
      navigate(STEPS[0].path, { replace: true });
    }
  }, [location.pathname, navigate]);

  function goToStep(nextIndex) {
    const bounded = Math.max(0, Math.min(STEPS.length - 1, nextIndex));
    setActiveIndex(bounded);
    navigate(STEPS[bounded].path);
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      onComplete();
    } else if (event.key === "ArrowRight" && !isLast) {
      event.preventDefault();
      goToStep(activeIndex + 1);
    } else if (event.key === "ArrowLeft" && activeIndex > 0) {
      event.preventDefault();
      goToStep(activeIndex - 1);
    }
  }

  return (
    <div className="lg-tour-backdrop">
      <section
        ref={dialogRef}
        className="lg-tour-dialog"
        role="dialog"
        aria-modal="false"
        aria-labelledby="lg-tour-title"
        aria-describedby="lg-tour-description"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header className="lg-tour-header">
          <div className="lg-tour-brand"><Compass size={17} /> Ledger quick tour</div>
          <button type="button" className="lg-tour-close" onClick={onComplete} aria-label="Skip project tour" title="Skip tour">
            <X size={18} />
          </button>
        </header>

        <div className="lg-tour-progress" aria-label={`Step ${activeIndex + 1} of ${STEPS.length}`}>
          <div className="lg-tour-progress-track"><span style={{ width: `${((activeIndex + 1) / STEPS.length) * 100}%` }} /></div>
          <span className="lg-tour-step-count">{activeIndex + 1} / {STEPS.length}</span>
        </div>

        <div className="lg-tour-content">
          <div className={`lg-tour-character ilc-mood-${step.mood}`} aria-hidden="true">
            <LedgerMascot mood={step.mood} />
          </div>
          <div className="lg-tour-copy">
            <div className="lg-tour-section">{step.section}</div>
            <h2 id="lg-tour-title">{step.title}</h2>
            <p id="lg-tour-description">{step.description}</p>
            <ul>
              {step.bullets.map((bullet) => <li key={bullet}><CheckCircle2 size={16} /> <span>{bullet}</span></li>)}
            </ul>
          </div>
        </div>

        <footer className="lg-tour-footer">
          <button type="button" className="lg-tour-skip" onClick={onComplete}>Skip tour</button>
          <div className="lg-tour-actions">
            <button type="button" className="lg-tour-back" onClick={() => goToStep(activeIndex - 1)} disabled={activeIndex === 0}>
              <ArrowLeft size={16} /> Back
            </button>
            {isLast ? (
              <button type="button" className="lg-tour-next" onClick={onComplete}>Finish tour <CheckCircle2 size={16} /></button>
            ) : (
              <button type="button" className="lg-tour-next" onClick={() => goToStep(activeIndex + 1)}>Next <ArrowRight size={16} /></button>
            )}
          </div>
        </footer>
        <p className="lg-tour-footnote">You can explore Ledger at your own pace. This tour will not change your financial records.</p>
      </section>
    </div>
  );
}

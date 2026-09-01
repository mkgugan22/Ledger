import { useEffect, useState } from "react";
import "./InteractiveLedgerCompanion.css";

/*
 * Interactive Ledger Companion
 *
 * UI-ONLY component.
 *
 * It observes existing DOM events and NEVER:
 * - changes input values
 * - changes React state belonging to pages
 * - prevents form submission
 * - stops event propagation
 * - calls APIs
 * - changes routes
 * - changes existing layout dimensions
 *
 * It is purely an animated visual companion.
 */

const LARGE_EXPENSE_THRESHOLD = 20000;

const DEFAULT_STATE = {
  mood: "idle",
  message: "I'm here with you.",
  context: "neutral",
};

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function getFieldLabel(element) {
  if (!element) return "";

  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel;

  const placeholder = element.getAttribute("placeholder");
  if (placeholder) return placeholder;

  const name = element.getAttribute("name");
  if (name) return name;

  const id = element.getAttribute("id");

  if (id) {
    try {
      const label = document.querySelector(
        `label[for="${CSS.escape(id)}"]`
      );

      if (label?.textContent) {
        return label.textContent.trim();
      }
    } catch {
      // Ignore selector issues.
    }
  }

  const parentLabel = element.closest("label");

  if (parentLabel?.textContent) {
    return parentLabel.textContent.trim();
  }

  const group = element.closest(".form-group");

  if (group) {
    const label = group.querySelector("label");

    if (label?.textContent) {
      return label.textContent.trim();
    }
  }

  return "";
}

function getFieldType(element) {
  if (!element) return "";

  const tag = element.tagName?.toLowerCase();

  if (tag === "select") return "select";
  if (tag === "textarea") return "textarea";

  if (tag === "input") {
    return normalize(element.type || "text");
  }

  return tag || "";
}

function getNumericValue(element) {
  if (!element) return NaN;

  const raw = String(element.value || "")
    .replace(/,/g, "")
    .replace(/[₹$€£\s]/g, "");

  const number = Number(raw);

  return Number.isFinite(number) ? number : NaN;
}

function getValueState(element) {
  if (!element) return false;

  const type = normalize(element.type);

  if (type === "checkbox" || type === "radio") {
    return Boolean(element.checked);
  }

  if (type === "file") {
    return Boolean(element.files?.length);
  }

  return Boolean(String(element.value || "").trim());
}

function detectContextFromText(text) {
  const value = normalize(text);

  if (
    value.includes("income") ||
    value.includes("salary") ||
    value.includes("earning") ||
    value.includes("received")
  ) {
    return "income";
  }

  if (
    value.includes("expense") ||
    value.includes("expenditure") ||
    value.includes("spending") ||
    value.includes("spend") ||
    value.includes("need") ||
    value.includes("cost")
  ) {
    return "expense";
  }

  if (
    value.includes("saving") ||
    value.includes("savings") ||
    value.includes("sip") ||
    value.includes("investment")
  ) {
    return "saving";
  }

  return "neutral";
}

function getContextFromElement(element, previousContext = "neutral") {
  if (!element) return previousContext;

  const label = getFieldLabel(element);

  const surroundingText =
    [
      label,
      element.getAttribute("name"),
      element.getAttribute("placeholder"),
      element.closest("form")?.textContent,
    ]
      .filter(Boolean)
      .join(" ");

  const detected = detectContextFromText(surroundingText);

  return detected === "neutral" ? previousContext : detected;
}

function getAmountMessage(amount, context) {
  if (context === "income") {
    if (amount >= 100000) {
      return {
        mood: "very-happy",
        message: "Whoa, that's a great income!",
      };
    }

    if (amount >= 50000) {
      return {
        mood: "happy",
        message: "Nice income! That's looking healthy.",
      };
    }

    if (amount > 0) {
      return {
        mood: "happy",
        message: "Nice! Every bit of income counts.",
      };
    }
  }

  if (context === "expense") {
    if (amount >= LARGE_EXPENSE_THRESHOLD) {
      return {
        mood: "sad",
        message: "Oof... that's a big expense.",
      };
    }

    if (amount >= 10000) {
      return {
        mood: "concerned",
        message: "That's getting a little expensive.",
      };
    }

    if (amount > 0) {
      return {
        mood: "neutral",
        message: "Got it. Keeping track is what matters.",
      };
    }
  }

  if (context === "saving") {
    if (amount >= 50000) {
      return {
        mood: "very-happy",
        message: "That's a serious saving habit!",
      };
    }

    if (amount > 0) {
      return {
        mood: "happy",
        message: "Good move. Future you will appreciate this.",
      };
    }
  }

  if (amount > 0) {
    return {
      mood: "neutral",
      message: "Got it. Let's keep going.",
    };
  }

  return {
    mood: "thinking",
    message: "Let's add the number.",
  };
}

function getReaction(element, previousContext, eventType) {
  const type = getFieldType(element);
  const label = normalize(getFieldLabel(element));

  const context = getContextFromElement(
    element,
    previousContext
  );

  const hasValue = getValueState(element);

  /*
   * ----------------------------------------------------------
   * FILE UPLOAD
   * ----------------------------------------------------------
   */

  if (type === "file") {
    if (hasValue) {
      return {
        mood: "happy",
        message: "Got it. File attached.",
        context,
      };
    }

    return {
      mood: "curious",
      message: "What have we got here?",
      context,
    };
  }

  /*
   * ----------------------------------------------------------
   * CHECKBOX / RADIO
   * ----------------------------------------------------------
   */

  if (type === "checkbox" || type === "radio") {
    if (element.checked) {
      return {
        mood: "happy",
        message: "Yep, that makes sense.",
        context,
      };
    }

    return {
      mood: "thinking",
      message: "Take your time.",
      context,
    };
  }

  /*
   * ----------------------------------------------------------
   * AMOUNT / NUMBER INPUT
   * ----------------------------------------------------------
   */

  const isAmountField =
    type === "number" ||
    label.includes("amount") ||
    label.includes("income") ||
    label.includes("expense") ||
    label.includes("value") ||
    label.includes("salary") ||
    label.includes("budget") ||
    label.includes("planned") ||
    label.includes("invested") ||
    label.includes("saving") ||
    label.includes("sip");

  if (isAmountField) {
    const amount = getNumericValue(element);

    if (Number.isFinite(amount) && amount > 0) {
      return {
        ...getAmountMessage(amount, context),
        context,
      };
    }

    return {
      mood: "thinking",
      message:
        context === "income"
          ? "Let's see what came in."
          : context === "expense"
            ? "How much did that cost?"
            : "Let's add the number.",
      context,
    };
  }

  /*
   * ----------------------------------------------------------
   * TEXT / DESCRIPTION
   * ----------------------------------------------------------
   */

  if (
    type === "textarea" ||
    label.includes("note") ||
    label.includes("description") ||
    label.includes("remark") ||
    label.includes("comment")
  ) {
    if (hasValue) {
      return {
        mood: "listening",
        message: "I see. That note might be useful later.",
        context,
      };
    }

    return {
      mood: "listening",
      message: "I'm listening...",
      context,
    };
  }

  /*
   * ----------------------------------------------------------
   * DATE / MONTH
   * ----------------------------------------------------------
   */

  if (
    type === "date" ||
    type === "month" ||
    label.includes("date") ||
    label.includes("month")
  ) {
    return {
      mood: "curious",
      message: hasValue
        ? "Perfect. I've got the date."
        : "When did this happen?",
      context,
    };
  }

  /*
   * ----------------------------------------------------------
   * SELECT
   * ----------------------------------------------------------
   */

  if (type === "select") {
    return {
      mood: "curious",
      message: hasValue
        ? "Okay, got it."
        : "Which one fits best?",
      context,
    };
  }

  /*
   * ----------------------------------------------------------
   * GENERAL TEXT INPUT
   * ----------------------------------------------------------
   */

  if (hasValue) {
    return {
      mood:
        context === "income"
          ? "happy"
          : context === "expense"
            ? "neutral"
            : "normal",
      message:
        context === "income"
          ? "Nice. Keep going."
          : context === "expense"
            ? "Got it. I've noted that."
            : "Looks good.",
      context,
    };
  }

  /*
   * ----------------------------------------------------------
   * FOCUS
   * ----------------------------------------------------------
   */

  if (eventType === "focus") {
    return {
      mood: "curious",
      message:
        context === "income"
          ? "Let's see what came in."
          : context === "expense"
            ? "What did we spend?"
            : "What are we adding?",
      context,
    };
  }

  return {
    mood: "idle",
    message: "I'm here with you.",
    context,
  };
}

function getModeFromButton(button) {
  if (!button) return null;

  const text = normalize(button.textContent);

  if (text === "income") {
    return {
      context: "income",
      mood: "happy",
      message: "Nice. Let's record that income.",
    };
  }

  if (
    text === "needs" ||
    text === "spending" ||
    text === "expense" ||
    text === "expenses"
  ) {
    return {
      context: "expense",
      mood: "normal",
      message: "Okay, let's keep this expense under control.",
    };
  }

  if (
    text === "savings" ||
    text === "saving" ||
    text === "sip"
  ) {
    return {
      context: "saving",
      mood: "happy",
      message: "Good choice. Future you will like this.",
    };
  }

  return null;
}

function getSubmitReaction(form) {
  const text = normalize(form?.textContent);

  if (
    text.includes("add to ledger") ||
    text.includes("save") ||
    text.includes("add entry") ||
    text.includes("create budget") ||
    text.includes("add saving")
  ) {
    return {
      mood: "celebrate",
      message: "Nice! That one's done.",
    };
  }

  return {
    mood: "celebrate",
    message: "There we go!",
  };
}

function CharacterFace({ mood }) {
  const happy =
    mood === "happy" ||
    mood === "very-happy" ||
    mood === "celebrate";

  const sad =
    mood === "sad" ||
    mood === "concerned";

  const curious =
    mood === "curious" ||
    mood === "thinking";

  const listening = mood === "listening";

  return (
    <div className={`ilc-face ilc-face-${mood}`}>
      <div className="ilc-ear ilc-ear-left" />
      <div className="ilc-ear ilc-ear-right" />

      <div className="ilc-head">
        <div
          className={`ilc-eye ilc-eye-left ${
            happy ? "ilc-eye-happy" : ""
          } ${sad ? "ilc-eye-sad" : ""}`}
        />

        <div
          className={`ilc-eye ilc-eye-right ${
            happy ? "ilc-eye-happy" : ""
          } ${sad ? "ilc-eye-sad" : ""}`}
        />

        <div
          className={`ilc-brow ilc-brow-left ${
            curious ? "ilc-brow-raised-left" : ""
          } ${sad ? "ilc-brow-sad-left" : ""}`}
        />

        <div
          className={`ilc-brow ilc-brow-right ${
            curious ? "ilc-brow-raised-right" : ""
          } ${sad ? "ilc-brow-sad-right" : ""}`}
        />

        <div
          className={`ilc-mouth ${
            happy ? "ilc-mouth-happy" : ""
          } ${sad ? "ilc-mouth-sad" : ""} ${
            listening ? "ilc-mouth-listening" : ""
          }`}
        />

        <div className="ilc-cheek ilc-cheek-left" />
        <div className="ilc-cheek ilc-cheek-right" />
      </div>
    </div>
  );
}

function CharacterBody({ mood }) {
  return (
    <div className={`ilc-character-body ilc-body-${mood}`}>
      <div className="ilc-neck" />

      <div className="ilc-body">
        <div className="ilc-shirt-detail" />
      </div>

      <div className="ilc-arm ilc-arm-left">
        <div className="ilc-hand">
          <span />
          <span />
          <span />
        </div>
      </div>

      <div className="ilc-arm ilc-arm-right">
        <div className="ilc-hand">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}

function CelebrationStars() {
  return (
    <div className="ilc-celebration">
      <span className="ilc-star ilc-star-1">✦</span>
      <span className="ilc-star ilc-star-2">✦</span>
      <span className="ilc-star ilc-star-3">✦</span>
    </div>
  );
}

export default function InteractiveLedgerCompanion() {
  const [state, setState] = useState(DEFAULT_STATE);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let resetTimer = null;
    let hideTimer = null;

    const resetToIdle = (delay = 2600) => {
      window.clearTimeout(resetTimer);

      resetTimer = window.setTimeout(() => {
        setState((previous) => ({
          ...previous,
          mood: "idle",
          message: "I'm here with you.",
        }));
      }, delay);
    };

    const handleFocusIn = (event) => {
      const element = event.target;

      if (!element?.matches?.("input, textarea, select")) {
        return;
      }

      setState((previous) =>
        getReaction(element, previous.context, "focus")
      );

      setVisible(true);
      resetToIdle(4200);
    };

    const handleInput = (event) => {
      const element = event.target;

      if (!element?.matches?.("input, textarea")) {
        return;
      }

      setState((previous) =>
        getReaction(element, previous.context, "input")
      );

      setVisible(true);
      resetToIdle(2800);
    };

    const handleChange = (event) => {
      const element = event.target;

      if (!element?.matches?.("input, textarea, select")) {
        return;
      }

      setState((previous) =>
        getReaction(element, previous.context, "change")
      );

      setVisible(true);
      resetToIdle(3000);
    };

    const handleClick = (event) => {
      const button = event.target?.closest?.("button");

      if (!button) {
        return;
      }

      const modeReaction = getModeFromButton(button);

      if (!modeReaction) {
        return;
      }

      setState({
        mood: modeReaction.mood,
        message: modeReaction.message,
        context: modeReaction.context,
      });

      setVisible(true);
      resetToIdle(3000);
    };

    const handleSubmit = (event) => {
      const form = event.target;

      if (!form?.matches?.("form")) {
        return;
      }

      const reaction = getSubmitReaction(form);

      /*
       * IMPORTANT:
       * No preventDefault.
       * No stopPropagation.
       *
       * Existing submit logic continues normally.
       */

      setState((previous) => ({
        ...previous,
        mood: reaction.mood,
        message: reaction.message,
      }));

      setVisible(true);
      resetToIdle(3200);
    };

    const handleKeyDown = (event) => {
      if (event.key !== "Enter") {
        return;
      }

      const element = event.target;

      if (!element?.matches?.("input, textarea, select")) {
        return;
      }

      setState((previous) => ({
        ...previous,
        mood: "excited",
        message: "Let's do it!",
      }));

      resetToIdle(1800);
    };

    const handleVisibility = () => {
      if (document.hidden) {
        setVisible(false);
        return;
      }

      window.clearTimeout(hideTimer);

      hideTimer = window.setTimeout(() => {
        setVisible(true);
      }, 100);
    };

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("input", handleInput);
    document.addEventListener("change", handleChange);
    document.addEventListener("click", handleClick);
    document.addEventListener("submit", handleSubmit);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener(
      "visibilitychange",
      handleVisibility
    );

    return () => {
      document.removeEventListener(
        "focusin",
        handleFocusIn
      );
      document.removeEventListener("input", handleInput);
      document.removeEventListener("change", handleChange);
      document.removeEventListener("click", handleClick);
      document.removeEventListener("submit", handleSubmit);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener(
        "visibilitychange",
        handleVisibility
      );

      window.clearTimeout(resetTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div
      className={`ilc-root ilc-mood-${state.mood}`}
      aria-hidden="true"
    >
      <div className="ilc-glow" />

      <div className="ilc-speech">
        <span key={`${state.mood}-${state.message}`}>
          {state.message}
        </span>
      </div>

      <div className="ilc-character">
        <CharacterFace mood={state.mood} />
        <CharacterBody mood={state.mood} />

        {state.mood === "celebrate" && (
          <CelebrationStars />
        )}

        <div className="ilc-shadow" />
      </div>
    </div>
  );
}

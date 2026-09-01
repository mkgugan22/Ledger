import { useEffect, useState } from "react";
import "./InteractiveLedgerCompanion.css";

/*
 * InteractiveLedgerCompanion
 *
 * IMPORTANT:
 * This component is intentionally independent from Ledger's application state.
 *
 * It only observes DOM events:
 *   - focusin
 *   - focusout
 *   - input
 *   - change
 *   - submit
 *
 * It never:
 *   - modifies an input value
 *   - calls preventDefault()
 *   - calls stopPropagation()
 *   - changes application state
 *   - communicates with the API
 *   - changes routes
 *
 * Therefore it is safe to mount globally in Layout.jsx.
 */

const INITIAL_STATE = {
  mood: "idle",
  message: "I'm here with you.",
  fieldType: "",
  hasValue: false,
};

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
    const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (label?.textContent) {
      return label.textContent.trim();
    }
  }

  const parentLabel = element.closest("label");
  if (parentLabel?.textContent) {
    return parentLabel.textContent.trim();
  }

  return "";
}

function getFieldType(element) {
  if (!element) return "";

  const tag = element.tagName?.toLowerCase();

  if (tag === "select") {
    return "select";
  }

  if (tag === "textarea") {
    return "textarea";
  }

  if (tag === "input") {
    return element.type || "text";
  }

  return tag || "";
}

function getValueState(element) {
  if (!element) return false;

  const type = (element.type || "").toLowerCase();

  if (type === "checkbox" || type === "radio") {
    return Boolean(element.checked);
  }

  if (type === "file") {
    return Boolean(element.files?.length);
  }

  return Boolean(String(element.value || "").trim());
}

function getReaction(element, eventType) {
  const type = getFieldType(element);
  const label = getFieldLabel(element).toLowerCase();
  const hasValue = getValueState(element);

  if (eventType === "submit") {
    return {
      mood: "celebrate",
      message: "Nice! Let's get that into the ledger.",
      hasValue,
    };
  }

  if (type === "file") {
    if (hasValue) {
      return {
        mood: "excited",
        message: "Got it! I'll let you handle the rest.",
        hasValue: true,
      };
    }

    return {
      mood: "curious",
      message: "A file? I'm ready.",
      hasValue: false,
    };
  }

  if (type === "checkbox" || type === "radio") {
    return {
      mood: hasValue ? "happy" : "thinking",
      message: hasValue ? "Good choice!" : "Take your pick.",
      hasValue,
    };
  }

  if (type === "select") {
    return {
      mood: "curious",
      message: "What are we choosing?",
      hasValue,
    };
  }

  if (
    label.includes("amount") ||
    label.includes("value") ||
    label.includes("salary") ||
    label.includes("income") ||
    label.includes("price") ||
    label.includes("budget") ||
    label.includes("invested") ||
    label.includes("valuation") ||
    label.includes("planned") ||
    label.includes("saving") ||
    label.includes("sip")
  ) {
    if (hasValue) {
      return {
        mood: "happy",
        message: "Numbers look good.",
        hasValue: true,
      };
    }

    return {
      mood: "thinking",
      message: "Let's fill in the numbers.",
      hasValue: false,
    };
  }

  if (
    label.includes("note") ||
    label.includes("description") ||
    label.includes("remark") ||
    label.includes("comment")
  ) {
    return {
      mood: "listening",
      message: "I'm listening...",
      hasValue,
    };
  }

  if (
    label.includes("date") ||
    label.includes("month") ||
    type === "date" ||
    type === "month"
  ) {
    return {
      mood: "curious",
      message: "When did this happen?",
      hasValue,
    };
  }

  if (
    label.includes("fund") ||
    label.includes("instrument") ||
    label.includes("type") ||
    label.includes("mode") ||
    label.includes("asset")
  ) {
    return {
      mood: "curious",
      message: "Tell me what we're tracking.",
      hasValue,
    };
  }

  if (hasValue) {
    return {
      mood: "happy",
      message: "Perfect. Keep going.",
      hasValue: true,
    };
  }

  return {
    mood: "thinking",
    message: "I'm following along.",
    hasValue: false,
  };
}

function CharacterFace({ mood }) {
  const isHappy =
    mood === "happy" ||
    mood === "excited" ||
    mood === "celebrate";

  const isCurious = mood === "curious";

  const isListening = mood === "listening";

  const isThinking = mood === "thinking";

  return (
    <div className={`ilc-face ilc-face-${mood}`}>
      <div className="ilc-ear ilc-ear-left" />
      <div className="ilc-ear ilc-ear-right" />

      <div className="ilc-head">
        <div
          className={`ilc-eye ilc-eye-left ${
            isHappy ? "ilc-eye-happy" : ""
          } ${isCurious ? "ilc-eye-curious" : ""}`}
        />

        <div
          className={`ilc-eye ilc-eye-right ${
            isHappy ? "ilc-eye-happy" : ""
          } ${isCurious ? "ilc-eye-curious" : ""}`}
        />

        <div
          className={`ilc-brow ilc-brow-left ${
            isThinking || isCurious ? "ilc-brow-raised" : ""
          }`}
        />

        <div
          className={`ilc-brow ilc-brow-right ${
            isThinking || isCurious ? "ilc-brow-raised" : ""
          }`}
        />

        <div
          className={`ilc-mouth ${
            isHappy ? "ilc-mouth-happy" : ""
          } ${isListening ? "ilc-mouth-listening" : ""}`}
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
    <div className="ilc-celebration" aria-hidden="true">
      <span className="ilc-star ilc-star-1">✦</span>
      <span className="ilc-star ilc-star-2">✦</span>
      <span className="ilc-star ilc-star-3">✦</span>
      <span className="ilc-star ilc-star-4">✦</span>
      <span className="ilc-star ilc-star-5">✦</span>
    </div>
  );
}

export default function InteractiveLedgerCompanion() {
  const [state, setState] = useState(INITIAL_STATE);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let resetTimer = null;
    let hideTimer = null;

    const resetToIdle = (delay = 1800) => {
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

      const reaction = getReaction(element, "focus");

      setVisible(true);

      setState({
        mood: reaction.mood,
        message: reaction.message,
        fieldType: getFieldType(element),
        hasValue: reaction.hasValue,
      });

      resetToIdle(4200);
    };

    const handleInput = (event) => {
      const element = event.target;

      if (!element?.matches?.("input, textarea")) {
        return;
      }

      const reaction = getReaction(element, "input");

      setVisible(true);

      setState({
        mood: reaction.mood,
        message: reaction.message,
        fieldType: getFieldType(element),
        hasValue: reaction.hasValue,
      });

      resetToIdle(2600);
    };

    const handleChange = (event) => {
      const element = event.target;

      if (!element?.matches?.("input, textarea, select")) {
        return;
      }

      const reaction = getReaction(element, "change");

      setVisible(true);

      setState({
        mood: reaction.mood,
        message: reaction.message,
        fieldType: getFieldType(element),
        hasValue: reaction.hasValue,
      });

      resetToIdle(2600);
    };

    const handleFocusOut = (event) => {
      const element = event.target;

      if (!element?.matches?.("input, textarea, select")) {
        return;
      }

      window.clearTimeout(resetTimer);

      resetTimer = window.setTimeout(() => {
        setState((previous) => ({
          ...previous,
          mood: "idle",
          message: "I'm here with you.",
        }));
      }, 900);
    };

    const handleSubmit = (event) => {
      const form = event.target;

      if (!form?.matches?.("form")) {
        return;
      }

      /*
       * We deliberately do NOT prevent or modify submission.
       * The existing application submit handler continues normally.
       */
      setVisible(true);

      setState({
        mood: "celebrate",
        message: "Nice! Let's get that into the ledger.",
        fieldType: "submit",
        hasValue: true,
      });

      window.clearTimeout(resetTimer);
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

      window.clearTimeout(resetTimer);
      resetToIdle(1800);
    };

    const handleVisibility = () => {
      if (document.hidden) {
        setVisible(false);
      } else {
        window.clearTimeout(hideTimer);

        hideTimer = window.setTimeout(() => {
          setVisible(true);
        }, 150);
      }
    };

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    document.addEventListener("input", handleInput);
    document.addEventListener("change", handleChange);
    document.addEventListener("submit", handleSubmit);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      document.removeEventListener("input", handleInput);
      document.removeEventListener("change", handleChange);
      document.removeEventListener("submit", handleSubmit);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("visibilitychange", handleVisibility);

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

        {state.mood === "celebrate" && <CelebrationStars />}

        <div className="ilc-shadow" />
      </div>
    </div>
  );
}

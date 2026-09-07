import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function httpError(message, status, providerStatus) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;

  if (providerStatus !== undefined) {
    error.providerStatus = providerStatus;
  }

  return error;
}

/*
 * ============================================================
 * LOAD LEDGER MASTER PROMPT
 * ============================================================
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const promptPath = path.join(__dirname, "prompt.md");

let masterPrompt;

try {
  masterPrompt = fs.readFileSync(promptPath, "utf8");
} catch (error) {
  console.error("[Ledger AI] Failed to load prompt.md:", error);

  throw new Error(
    "Ledger AI master prompt could not be loaded from services/ai/prompt.md."
  );
}

/*
 * ============================================================
 * CONFIGURATION
 * ============================================================
 *
 * GEMINI_API_KEY
 *   Your Google AI Studio / Gemini API key.
 *
 * GEMINI_MODEL
 *   Example:
 *   gemini-2.5-flash
 *
 * GEMINI_TIMEOUT_MS
 *   Optional. Defaults to 60000.
 */

function getConfig() {
  const apiKey = String(
    process.env.GEMINI_API_KEY || ""
  ).trim();

  const model = String(
    process.env.GEMINI_MODEL || "gemini-2.5-flash"
  ).trim();

  if (!apiKey) {
    throw httpError(
      "Ledger AI is not configured. Add GEMINI_API_KEY to the API server.",
      503
    );
  }

  return {
    apiKey,
    model,
  };
}

/*
 * ============================================================
 * SYSTEM PROMPT
 * ============================================================
 */

function buildSystemInstruction(snapshot) {
  return `${masterPrompt}

## CURRENT LEDGER DATA

The following is the user's current Ledger data snapshot.

Use this data when answering personalized financial questions.

Do not fabricate values that are not present in this snapshot.

\`\`\`json
${JSON.stringify(snapshot, null, 2)}
\`\`\`
`;
}

/*
 * ============================================================
 * RESPONSE EXTRACTION
 * ============================================================
 *
 * NOTE: Gemini can stop generating for reasons other than finishing
 * naturally. The most important one here is "MAX_TOKENS" — the
 * response was cut off mid-sentence/mid-list because it ran out of
 * output budget. Previously this function only looked at whether
 * *any* text came back, so a half-finished answer (e.g. cut off
 * mid-bullet-list) was returned to the user as if it were complete.
 * That was the source of the "partial answers" bug.
 * ============================================================
 */

function extractAnswer(body) {
  const parts = body?.candidates?.[0]?.content?.parts;

  if (Array.isArray(parts)) {
    return parts
      .map((part) =>
        typeof part?.text === "string" ? part.text : ""
      )
      .join("")
      .trim();
  }

  return "";
}

function getFinishReason(body) {
  return body?.candidates?.[0]?.finishReason || null;
}

/*
 * ============================================================
 * PROVIDER ERROR TEXT
 * ============================================================
 */

function extractProviderError(body, fallbackStatus) {
  const message =
    body?.error?.message ||
    body?.message ||
    null;

  if (typeof message === "string" && message.trim()) {
    return message.trim();
  }

  return `Gemini request failed with status ${fallbackStatus}.`;
}

/*
 * ============================================================
 * TIMEOUT
 * ============================================================
 */

function resolveTimeout() {
  const configured = Number(
    process.env.GEMINI_TIMEOUT_MS
  );

  if (
    Number.isFinite(configured) &&
    configured >= 5000 &&
    configured <= 120000
  ) {
    return configured;
  }

  /*
   * Raised from 45s to 60s. This is a safety margin, not the main
   * fix — the main fix is disabling "thinking" below, which is what
   * was actually causing calls to run long enough to hit the old
   * 45s ceiling in the first place. The extra margin just absorbs a
   * slow cold start (e.g. Render free tier) on top of that.
   */
  return 60000;
}

/*
 * ============================================================
 * REQUEST
 * ============================================================
 */

async function callGemini({
  apiKey,
  model,
  systemInstruction,
  contents,
  signal,
}) {
  const controller = new AbortController();

  const timeoutMs = resolveTimeout();

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener(
        "abort",
        () => controller.abort(),
        { once: true }
      );
    }
  }

  const startedAt = Date.now();

  try {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      signal: controller.signal,

      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },

        contents,

        generationConfig: {
          /*
           * Ledger answers should be deterministic and concise.
           */
          temperature: 0.2,

          /*
           * The master prompt targets ~250-400 words, but it renders
           * that as compact pipe-separated number blocks and headers
           * (see prompt.md Section 39), which costs noticeably more
           * tokens than the same word count in plain prose. 700 was
           * cutting answers off mid-list. This gives real headroom
           * so a compliant, on-budget answer never gets truncated —
           * it does not change how long answers are meant to be,
           * since that's enforced by the prompt itself.
           */
          maxOutputTokens: 1536,

          /*
           * Keep sampling predictable.
           */
          topP: 0.9,

          /*
           * Gemini 2.5 Flash has "thinking" (extended internal
           * reasoning before the visible answer) turned ON by
           * default, with a dynamic budget the model chooses for
           * itself. That's the most likely reason requests were
           * consistently hitting the timeout: thinking tokens are
           * generated first, count against latency, and can grow
           * unpredictably large on a big prompt like this one (the
           * full master prompt plus the whole ledger JSON snapshot).
           * The prompt already gives Gemini an explicit step-by-step
           * procedure and exact output format to follow, so open-
           * ended thinking isn't buying anything here — it's pure
           * overhead. Disabling it (thinkingBudget: 0) should cut
           * response time dramatically and make it consistent.
           */
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      }),
    });

    const duration = Date.now() - startedAt;

    const rawText = await response.text();

    if (!response.ok) {
      let body = {};

      try {
        body = JSON.parse(rawText);
      } catch {
        // Keep empty object.
      }

      console.error(
        `[Ledger AI] Gemini failed ` +
          `status=${response.status} ` +
          `duration=${duration}ms ` +
          `message=${extractProviderError(body, response.status)}`
      );

      throw httpError(
        mapProviderError(
          response.status,
          extractProviderError(body, response.status)
        ),
        response.status === 429 ||
          response.status >= 500
          ? 503
          : 502,
        response.status
      );
    }

    let body;

    try {
      body = JSON.parse(rawText);
    } catch {
      console.error(
        `[Ledger AI] Gemini returned invalid JSON ` +
          `duration=${duration}ms`
      );

      throw httpError(
        "Ledger AI received an invalid response from its provider.",
        502
      );
    }

    const answer = extractAnswer(body);
    const finishReason = getFinishReason(body);

    if (!answer) {
      console.error(
        `[Ledger AI] Gemini returned no answer ` +
          `duration=${duration}ms ` +
          `finishReason=${finishReason}`
      );

      throw httpError(
        "Ledger AI did not return an answer. Please try again.",
        502
      );
    }

    /*
     * The response body came back fine (HTTP 200, valid JSON, some
     * text) but Gemini stopped early because it ran out of output
     * tokens. That means `answer` is a truncated fragment, not a
     * finished response. Treat this the same as a transient failure
     * so the caller retries once, instead of silently handing the
     * user half a sentence.
     */
    if (finishReason === "MAX_TOKENS") {
      console.error(
        `[Ledger AI] Gemini response was truncated (MAX_TOKENS) ` +
          `duration=${duration}ms`
      );

      throw httpError(
        "Ledger AI's answer was cut off before it finished. Please try again.",
        503,
        "TRUNCATED"
      );
    }

    console.log(
      `[Ledger AI] Gemini completed in ${duration}ms ` +
        `(model=${model})`
    );

    return answer;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw httpError(
        "Ledger AI took too long to respond. Please try again.",
        504,
        408
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/*
 * ============================================================
 * ERROR NORMALIZATION
 * ============================================================
 */

function mapProviderError(status, providerMessage) {
  const text = String(providerMessage || "").toLowerCase();

  if (status === 400) {
    return (
      "Ledger AI's request to Gemini was invalid. " +
      "Check GEMINI_MODEL on the server."
    );
  }

  if (status === 401 || status === 403) {
    return (
      "Ledger AI's Gemini connection was rejected. " +
      "Check GEMINI_API_KEY on the server."
    );
  }

  if (status === 404) {
    return (
      "Ledger AI could not find the configured Gemini model. " +
      "Check GEMINI_MODEL."
    );
  }

  if (status === 408) {
    return (
      "Ledger AI's provider timed out. Please try again."
    );
  }

  if (status === 429) {
    return (
      "Ledger AI is temporarily rate-limited. " +
      "Please try again shortly."
    );
  }

  if (
    status >= 500 ||
    text.includes("timeout") ||
    text.includes("overloaded")
  ) {
    return (
      "Ledger AI's provider is temporarily unavailable. " +
      "Please try again shortly."
    );
  }

  return (
    "Ledger AI could not get a valid response from its provider. " +
    "Please try again shortly."
  );
}

/*
 * ============================================================
 * HISTORY NORMALIZATION
 * ============================================================
 *
 * The frontend already sends at most six history messages.
 *
 * We preserve that behavior.
 */

function buildRequest({
  message,
  history,
  snapshot,
}) {
  const systemInstruction =
    buildSystemInstruction(snapshot);

  const safeHistory = Array.isArray(history)
    ? history
        .filter(
          (item) =>
            item &&
            (item.role === "user" ||
              item.role === "assistant") &&
            typeof item.content === "string" &&
            item.content.trim()
        )
        .slice(-6)
    : [];

  /*
   * Gemini format:
   *
   * role: "user" | "model"
   * parts: [{ text: "..." }]
   *
   * System instruction is passed separately, not as a message.
   */

  const contents = [
    ...safeHistory.map((item) => ({
      role: item.role === "assistant" ? "model" : "user",
      parts: [{ text: item.content }],
    })),

    {
      role: "user",
      parts: [{ text: message }],
    },
  ];

  return {
    systemInstruction,
    contents,
  };
}

/*
 * ============================================================
 * PUBLIC API
 * ============================================================
 *
 * Kept as askGemini() deliberately.
 *
 * This means:
 *
 *   server/src/routes/ai.js
 *
 * does NOT need to change.
 */

export async function askGemini({
  message,
  history = [],
  snapshot,
}) {
  const config = getConfig();

  const { systemInstruction, contents } = buildRequest({
    message,
    history,
    snapshot,
  });

  /*
   * First attempt.
   */
  try {
    return await callGemini({
      ...config,
      systemInstruction,
      contents,
    });
  } catch (firstError) {
    /*
     * Retry only transient failures — provider overload/rate-limit
     * (429/500/502/503) or a response that got cut off mid-answer
     * (our synthetic "TRUNCATED" status). A retry is cheap for these
     * because the cause is usually a one-off blip on Gemini's side.
     *
     * Deliberately NOT retrying on 408 (our own request timing out
     * after resolveTimeout() ms, default 60s): if the first call
     * already took that long, retrying just doubles the user's wait
     * without much chance of a faster second attempt. That was
     * making the "takes a long time and shows nothing" symptom
     * worse. It's better to fail fast here and let the user decide
     * to try again.
     */
    const retryable =
      firstError?.providerStatus === 429 ||
      firstError?.providerStatus === 500 ||
      firstError?.providerStatus === 502 ||
      firstError?.providerStatus === 503 ||
      firstError?.providerStatus === "TRUNCATED";

    if (!retryable) {
      throw firstError;
    }

    console.warn(
      "[Ledger AI] Retrying Gemini request once after " +
        `${firstError.providerStatus === "TRUNCATED" ? "a truncated response" : "a transient failure"}.`
    );

    await new Promise((resolve) =>
      setTimeout(resolve, 600)
    );

    return callGemini({
      ...config,
      systemInstruction,
      contents,
    });
  }
}

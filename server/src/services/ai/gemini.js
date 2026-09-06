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
 *   Optional. Defaults to 45000.
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

  return 45000;
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
           * Enough room for a financial analysis answer without
           * unnecessary generation time.
           */
          maxOutputTokens: 700,

          /*
           * Keep sampling predictable.
           */
          topP: 0.9,
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

    if (!answer) {
      console.error(
        `[Ledger AI] Gemini returned no answer ` +
          `duration=${duration}ms ` +
          `finishReason=${body?.candidates?.[0]?.finishReason}`
      );

      throw httpError(
        "Ledger AI did not return an answer. Please try again.",
        502
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
     * Retry only transient failures.
     */
    const retryable =
      firstError?.providerStatus === 408 ||
      firstError?.providerStatus === 429 ||
      firstError?.providerStatus === 500 ||
      firstError?.providerStatus === 502 ||
      firstError?.providerStatus === 503;

    if (!retryable) {
      throw firstError;
    }

    console.warn(
      "[Ledger AI] Retrying Gemini request once after transient failure."
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

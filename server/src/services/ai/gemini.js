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
 * FREELLMAPI_BASE_URL
 *   Example:
 *   https://your-freellmapi-host.com/v1
 *
 * FREELLMAPI_API_KEY
 *   Your unified FreeLLMAPI key.
 *
 * FREELLMAPI_MODEL
 *   Recommended:
 *   auto:fast
 *
 * This keeps provider selection inside FreeLLMAPI.
 */

function getConfig() {
  const baseUrl = String(
    process.env.FREELLMAPI_BASE_URL || ""
  )
    .trim()
    .replace(/\/+$/, "");

  const apiKey = String(
    process.env.FREELLMAPI_API_KEY || ""
  ).trim();

  const model =
    String(process.env.FREELLMAPI_MODEL || "auto:fast").trim();

  if (!baseUrl) {
    throw httpError(
      "Ledger AI is not configured. Add FREELLMAPI_BASE_URL to the API server.",
      503
    );
  }

  if (!apiKey) {
    throw httpError(
      "Ledger AI is not configured. Add FREELLMAPI_API_KEY to the API server.",
      503
    );
  }

  return {
    baseUrl,
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
  const answer =
    body?.choices?.[0]?.message?.content;

  if (typeof answer === "string") {
    return answer.trim();
  }

  if (Array.isArray(answer)) {
    return answer
      .map((part) => {
        if (typeof part === "string") return part;
        return part?.text || "";
      })
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
    body?.error ||
    null;

  if (typeof message === "string" && message.trim()) {
    return message.trim();
  }

  return `FreeLLMAPI request failed with status ${fallbackStatus}.`;
}

/*
 * ============================================================
 * TIMEOUT
 * ============================================================
 */

function resolveTimeout() {
  const configured = Number(
    process.env.FREELLMAPI_TIMEOUT_MS
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

async function callFreeLLMAPI({
  baseUrl,
  apiKey,
  model,
  messages,
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
    const url = `${baseUrl}/chat/completions`;

    const response = await fetch(url, {
      method: "POST",

      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },

      signal: controller.signal,

      body: JSON.stringify({
        /*
         * FreeLLMAPI supports:
         *
         * auto
         * auto:fast
         * auto:smart
         * auto:reliable
         * auto:balanced
         *
         * auto:fast is preferred for Ledger because response
         * latency matters significantly for an interactive
         * finance assistant.
         */
        model,

        messages,

        /*
         * Ledger answers should be deterministic and concise.
         */
        temperature: 0.2,

        /*
         * This is intentionally smaller than the old Gemini
         * limit. It reduces unnecessary generation time while
         * leaving enough room for a financial analysis answer.
         */
        max_tokens: 700,

        /*
         * Keep sampling predictable.
         */
        top_p: 0.9,

        /*
         * Explicitly disable tool behavior for this assistant.
         * Ledger currently uses deterministic server-side data,
         * not LLM tools.
         */
        tool_choice: "none",
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
        `[Ledger AI] FreeLLMAPI failed ` +
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
        `[Ledger AI] FreeLLMAPI returned invalid JSON ` +
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
        `[Ledger AI] FreeLLMAPI returned no answer ` +
          `duration=${duration}ms`
      );

      throw httpError(
        "Ledger AI did not return an answer. Please try again.",
        502
      );
    }

    console.log(
      `[Ledger AI] FreeLLMAPI completed in ${duration}ms ` +
        `(model=${body?.model || model})`
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

  if (status === 401 || status === 403) {
    return (
      "Ledger AI's FreeLLMAPI connection was rejected. " +
      "Check FREELLMAPI_API_KEY on the server."
    );
  }

  if (status === 404) {
    return (
      "Ledger AI could not find the configured FreeLLMAPI endpoint. " +
      "Check FREELLMAPI_BASE_URL."
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
      "FreeLLMAPI should normally fail over to another available model; " +
      "please try again shortly."
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

function buildMessages({
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
   * OpenAI-compatible format:
   *
   * system
   * previous conversation
   * current user message
   */

  return [
    {
      role: "system",
      content: systemInstruction,
    },

    ...safeHistory.map((item) => ({
      role: item.role,
      content: item.content,
    })),

    {
      role: "user",
      content: message,
    },
  ];
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

  const messages = buildMessages({
    message,
    history,
    snapshot,
  });

  /*
   * First attempt.
   */
  try {
    return await callFreeLLMAPI({
      ...config,
      messages,
    });
  } catch (firstError) {
    /*
     * Retry only transient failures.
     *
     * FreeLLMAPI itself already performs provider-level failover,
     * so Ledger only performs ONE client-level retry for a
     * transient gateway/network problem.
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
      "[Ledger AI] Retrying FreeLLMAPI request once after transient failure."
    );

    await new Promise((resolve) =>
      setTimeout(resolve, 600)
    );

    return callFreeLLMAPI({
      ...config,
      messages,
    });
  }
}

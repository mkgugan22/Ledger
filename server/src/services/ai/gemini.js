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

function responseText(body) {
  return body?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();
}

/*
 * ============================================================
 * LOAD LEDGER AI MASTER PROMPT
 * ============================================================
 *
 * prompt.md must be treated as text.
 *
 * Node.js does not support:
 *
 *   import { buildSystemInstruction } from "./prompt.md";
 *
 * So we load it with fs instead.
 * ============================================================
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const promptPath = path.join(__dirname, "prompt.md");

let masterPrompt;

try {
  masterPrompt = fs.readFileSync(promptPath, "utf8");
} catch (error) {
  console.error(
    "[Ledger AI] Failed to load prompt.md:",
    error
  );

  throw new Error(
    "Ledger AI master prompt could not be loaded from services/ai/prompt.md."
  );
}

/*
 * ============================================================
 * BUILD SYSTEM INSTRUCTION
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
 * PROVIDER ERROR PARSING
 * ============================================================
 */

function describeProviderFailure(rawText) {
  try {
    const parsed = JSON.parse(rawText);

    return {
      reason: parsed?.error?.status || null,
      message: parsed?.error?.message || null,
    };
  } catch {
    return {
      reason: null,
      message: null,
    };
  }
}

function userFacingMessageFor(status, reason) {
  if (
    status === 401 ||
    status === 403 ||
    reason === "PERMISSION_DENIED" ||
    reason === "UNAUTHENTICATED"
  ) {
    return "Ledger AI's connection to its provider was rejected. Check that GEMINI_API_KEY is set correctly on the server and has no restrictions blocking this request.";
  }

  if (
    status === 400 &&
    reason === "FAILED_PRECONDITION"
  ) {
    return "Ledger AI's provider needs billing enabled for this project/region before it will respond. Enable billing in Google AI Studio.";
  }

  if (status === 400) {
    return "Ledger AI sent an invalid request to its provider. Check the GEMINI_MODEL value.";
  }

  if (status === 404) {
    return "Ledger AI's configured model could not be found. Check the GEMINI_MODEL value.";
  }

  if (status === 429) {
    return "Ledger AI is getting rate-limited by its provider right now. Please wait a moment and try again.";
  }

  if (status === 500) {
    return "Ledger AI's provider returned an internal error. Please try again shortly.";
  }

  if (status === 502) {
    return "Ledger AI could not reach its provider successfully. Please try again shortly.";
  }

  if (status === 503) {
    return "Ledger AI's provider is temporarily overloaded. Please try again shortly.";
  }

  return "Ledger AI could not answer right now. Please try again shortly.";
}

/*
 * ============================================================
 * GEMINI API REQUEST
 * ============================================================
 */

async function callGemini({
  apiKey,
  model,
  systemInstruction,
  contents,
  signal,
}) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(model)}:generateContent`;

  const response = await fetch(url, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },

    signal,

    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text: systemInstruction,
          },
        ],
      },

      contents,

      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 900,
      },
    }),
  });

  const rawText = await response.text();

  if (!response.ok) {
    const {
      reason,
      message,
    } = describeProviderFailure(rawText);

    console.error(
      `[Ledger AI] provider request failed: ` +
      `status=${response.status} ` +
      `reason=${reason || "unknown"} ` +
      `message=${message || rawText.slice(0, 500) || "(empty body)"}`
    );

    throw httpError(
      userFacingMessageFor(
        response.status,
        reason
      ),
      response.status === 429 ||
      response.status === 503
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
      `[Ledger AI] provider returned non-JSON success body: ` +
      rawText.slice(0, 500)
    );

    throw httpError(
      "Ledger AI did not return an answer. Please try again.",
      502
    );
  }

  const answer = responseText(body);

  if (!answer) {
    console.error(
      "[Ledger AI] provider response did not contain answer text."
    );

    throw httpError(
      "Ledger AI did not return an answer. Please try again.",
      502
    );
  }

  return answer;
}

/*
 * ============================================================
 * WAIT
 * ============================================================
 */

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/*
 * ============================================================
 * PUBLIC API
 * ============================================================
 */

export async function askGemini({
  message,
  history = [],
  snapshot,
}) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw httpError(
      "Ledger AI is not configured yet. Add GEMINI_API_KEY to the API server and try again.",
      503
    );
  }

  const model =
    process.env.GEMINI_MODEL ||
    "gemini-2.5-flash";

  /*
   * Build the full system instruction using the existing
   * Ledger master prompt + live Ledger snapshot.
   */
  const systemInstruction =
    buildSystemInstruction(snapshot);

  /*
   * Preserve existing conversation history behavior.
   */
  const contents = [
    ...history.map((item) => ({
      role:
        item.role === "assistant"
          ? "model"
          : "user",

      parts: [
        {
          text: item.content,
        },
      ],
    })),

    {
      role: "user",

      parts: [
        {
          text: message,
        },
      ],
    },
  ];

  /*
   * ==========================================================
   * TIMEOUT
   * ==========================================================
   *
   * The previous implementation aborted after 20 seconds.
   *
   * That is what caused:
   *
   *   Ledger AI took too long to respond.
   *
   * Render then returned:
   *
   *   504
   *
   * Use 60 seconds instead.
   *
   * This value can also be configured through:
   *
   *   GEMINI_TIMEOUT_MS
   *
   * on Render.
   */

  const configuredTimeout = Number(
    process.env.GEMINI_TIMEOUT_MS
  );

  const timeoutMs =
    Number.isFinite(configuredTimeout) &&
    configuredTimeout >= 10000 &&
    configuredTimeout <= 120000
      ? configuredTimeout
      : 60000;

  /*
   * Retry transient provider failures.
   *
   * 429 = rate limit
   * 500 = provider internal error
   * 503 = provider unavailable
   *
   * Timeouts are retried once as well.
   */
  const maxAttempts = 2;

  let lastError;

  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt += 1
  ) {
    const controller =
      new AbortController();

    const timeout = setTimeout(
      () => {
        controller.abort();
      },
      timeoutMs
    );

    const startedAt = Date.now();

    try {
      console.log(
        `[Ledger AI] Gemini request started ` +
        `(attempt ${attempt}/${maxAttempts}, model=${model}, timeout=${timeoutMs}ms)`
      );

      const answer =
        await callGemini({
          apiKey,
          model,
          systemInstruction,
          contents,
          signal: controller.signal,
        });

      const duration =
        Date.now() - startedAt;

      console.log(
        `[Ledger AI] Gemini request completed in ${duration}ms`
      );

      return answer;
    } catch (error) {
      const duration =
        Date.now() - startedAt;

      if (error?.name === "AbortError") {
        lastError = httpError(
          "Ledger AI took too long to respond. Please try again.",
          504
        );

        lastError.providerStatus = 408;

        console.error(
          `[Ledger AI] Gemini request timed out after ${duration}ms ` +
          `(attempt ${attempt}/${maxAttempts})`
        );
      } else {
        lastError = error;

        console.error(
          `[Ledger AI] Gemini request failed after ${duration}ms ` +
          `(attempt ${attempt}/${maxAttempts}):`,
          error?.message || error
        );
      }

      const retryable =
        lastError?.providerStatus === 408 ||
        lastError?.providerStatus === 429 ||
        lastError?.providerStatus === 500 ||
        lastError?.providerStatus === 503;

      if (
        retryable &&
        attempt < maxAttempts
      ) {
        /*
         * Small exponential backoff.
         *
         * 1st retry waits 1 second.
         */
        const retryDelay =
          1000 * attempt;

        console.log(
          `[Ledger AI] Retrying Gemini request in ${retryDelay}ms`
        );

        await wait(retryDelay);

        continue;
      }

      throw lastError;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

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
 * LEDGER AI MASTER PROMPT
 * ============================================================
 *
 * Node.js does not natively support importing .md files with:
 *
 *   import { buildSystemInstruction } from "./prompt.md";
 *
 * Instead, we load prompt.md as UTF-8 text.
 *
 * This keeps prompt.md as a separate Markdown file and does
 * not change the existing Ledger AI prompt architecture.
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
 * Build the complete system instruction.
 *
 * Existing callers continue to use:
 *
 *   buildSystemInstruction(snapshot)
 *
 * The Ledger snapshot is appended to the existing master prompt
 * exactly at request time.
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
 * Gemini may return JSON errors.
 *
 * Some gateways/proxies can return HTML or plain text instead,
 * so parsing failures are handled safely.
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
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent`,
    {
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
    }
  );

  const rawText = await response.text();

  if (!response.ok) {
    const {
      reason,
      message,
    } = describeProviderFailure(rawText);

    console.error(
      `[Ledger AI] provider request failed: status=${
        response.status
      } reason=${
        reason || "unknown"
      } message=${
        message || rawText.slice(0, 500) || "(empty body)"
      }`
    );

    throw httpError(
      userFacingMessageFor(
        response.status,
        reason
      ),
      502,
      response.status
    );
  }

  let body;

  try {
    body = JSON.parse(rawText);
  } catch {
    console.error(
      `[Ledger AI] provider returned a non-JSON success body: ${rawText.slice(
        0,
        500
      )}`
    );

    throw httpError(
      "Ledger AI did not return an answer. Please try again.",
      502
    );
  }

  return responseText(body);
}

/*
 * Small delay used for transient provider retries.
 */
function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/*
 * ============================================================
 * PUBLIC LEDGER AI FUNCTION
 * ============================================================
 *
 * Keep this function signature unchanged:
 *
 * askGemini({
 *   message,
 *   history,
 *   snapshot
 * })
 *
 * This ensures the existing AI route does not need to change.
 * ============================================================
 */

export async function askGemini({
  message,
  history,
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
   * Read the Markdown master prompt and combine it with
   * the user's current Ledger snapshot.
   */
  const systemInstruction =
    buildSystemInstruction(snapshot);

  /*
   * Preserve the existing conversation history format.
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
   * One retry is allowed only for transient provider
   * failures such as 429 and 503.
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
      20000
    );

    try {
      const answer =
        await callGemini({
          apiKey,
          model,
          systemInstruction,
          contents,
          signal: controller.signal,
        });

      if (!answer) {
        throw httpError(
          "Ledger AI did not return an answer. Please try again.",
          502
        );
      }

      return answer;
    } catch (error) {
      lastError =
        error?.name === "AbortError"
          ? httpError(
              "Ledger AI took too long to respond. Please try again.",
              504
            )
          : error;

      const isRetryable =
        lastError?.providerStatus === 429 ||
        lastError?.providerStatus === 503;

      if (
        isRetryable &&
        attempt < maxAttempts
      ) {
        await wait(600 * attempt);
        continue;
      }

      throw lastError;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

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
 *   Optional. Defaults to 90000. As of the streaming rewrite below,
 *   this is an IDLE timeout (max gap between chunks), not a total
 *   response timeout — see resolveTimeout().
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
 *
 * Was a single 45-90s cap on the ENTIRE request. On Render's free/
 * starter tier a cold start alone can eat 20-30s before Gemini is
 * even called, and a legitimately busy provider can take a while
 * even once it's actively producing output — either one could trip
 * a total-time cap even though the request was making real progress.
 *
 * Now that responses are streamed, this timeout is reset every time
 * a chunk of text arrives (see callGeminiStream below), so it only
 * fires if the connection genuinely stalls with no data for this
 * long — not just because the whole answer took a while to finish.
 * GEMINI_TIMEOUT_MS still overrides this from the environment.
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

  return 90000;
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
 * STREAMING REQUEST
 * ============================================================
 *
 * Calls Gemini's streamGenerateContent (Server-Sent Events) instead
 * of generateContent. `onChunk(text)` is invoked as each fragment of
 * the answer arrives, so the caller (the /ai/chat route) can forward
 * it to the browser immediately instead of waiting for the entire
 * answer to finish generating.
 * ============================================================
 */

async function callGeminiStream({
  apiKey,
  model,
  systemInstruction,
  contents,
  signal,
  onChunk,
}) {
  const controller = new AbortController();
  const timeoutMs = resolveTimeout();

  let timeout = setTimeout(() => controller.abort(), timeoutMs);

  const resetTimeout = () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => controller.abort(), timeoutMs);
  };

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
  let fullAnswer = "";
  let finishReason = null;

  try {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${encodeURIComponent(model)}:streamGenerateContent` +
      `?alt=sse&key=${encodeURIComponent(apiKey)}`;

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
           * that as compact pipe-separated number blocks and headers,
           * which costs more tokens than the same word count in plain
           * prose. This gives headroom so a compliant answer never
           * gets truncated mid-list.
           */
          maxOutputTokens: 1536,

          /*
           * Keep sampling predictable.
           */
          topP: 0.9,

          /*
           * Disable Gemini 2.5's extended internal "thinking" pass.
           * The prompt already gives an explicit procedure and output
           * format to follow, so open-ended thinking is pure latency
           * overhead here, not extra answer quality.
           */
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      }),
    });

    if (!response.ok) {
      const rawText = await response.text();
      let body = {};

      try {
        body = JSON.parse(rawText);
      } catch {
        // Keep empty object.
      }

      console.error(
        `[Ledger AI] Gemini stream failed ` +
          `status=${response.status} ` +
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

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      resetTimeout();

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr || jsonStr === "[DONE]") continue;

        let payload;

        try {
          payload = JSON.parse(jsonStr);
        } catch {
          continue;
        }

        const parts = payload?.candidates?.[0]?.content?.parts;

        if (Array.isArray(parts)) {
          const text = parts
            .map((part) =>
              typeof part?.text === "string" ? part.text : ""
            )
            .join("");

          if (text) {
            fullAnswer += text;
            onChunk(text);
          }
        }

        const reason = payload?.candidates?.[0]?.finishReason;
        if (reason) finishReason = reason;
      }
    }

    const duration = Date.now() - startedAt;

    if (!fullAnswer) {
      console.error(
        `[Ledger AI] Gemini stream returned no answer ` +
          `duration=${duration}ms finishReason=${finishReason}`
      );

      throw httpError(
        "Ledger AI did not return an answer. Please try again.",
        502
      );
    }

    if (finishReason === "MAX_TOKENS") {
      console.error(
        `[Ledger AI] Gemini stream response was truncated (MAX_TOKENS) ` +
          `duration=${duration}ms`
      );

      throw httpError(
        "Ledger AI's answer was cut off before it finished. Please try again.",
        503,
        "TRUNCATED"
      );
    }

    console.log(
      `[Ledger AI] Gemini stream completed in ${duration}ms ` +
        `(model=${model})`
    );

    return fullAnswer;
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
 * PUBLIC API
 * ============================================================
 */

export async function askGeminiStream(
  { message, history = [], snapshot },
  onChunk
) {
  const config = getConfig();

  const { systemInstruction, contents } = buildRequest({
    message,
    history,
    snapshot,
  });

  let emittedAny = false;

  const trackedOnChunk = (text) => {
    emittedAny = true;
    onChunk(text);
  };

  try {
    return await callGeminiStream({
      ...config,
      systemInstruction,
      contents,
      onChunk: trackedOnChunk,
    });
  } catch (firstError) {
    /*
     * Only safe to retry if NOTHING has been streamed to the client
     * yet — otherwise a retry would re-send the answer from the
     * start and duplicate text the user already sees. This covers
     * the same transient-failure cases as before (provider overload
     * or rate limit), just narrowed to "failed before any output".
     */
    const retryable =
      !emittedAny &&
      (firstError?.providerStatus === 429 ||
        firstError?.providerStatus === 500 ||
        firstError?.providerStatus === 502 ||
        firstError?.providerStatus === 503);

    if (!retryable) {
      throw firstError;
    }

    console.warn(
      "[Ledger AI] Retrying Gemini stream once after a transient failure."
    );

    await new Promise((resolve) =>
      setTimeout(resolve, 600)
    );

    return callGeminiStream({
      ...config,
      systemInstruction,
      contents,
      onChunk: trackedOnChunk,
    });
  }
}

/*
 * Kept for compatibility with anything that still wants a single
 * awaited string instead of a stream — same input/output contract
 * as the original askGemini(). Not used by the /ai/chat route
 * anymore (it uses askGeminiStream directly), but safe to keep.
 */
export async function askGemini(args) {
  let full = "";

  await askGeminiStream(args, (chunk) => {
    full += chunk;
  });

  return full;
}

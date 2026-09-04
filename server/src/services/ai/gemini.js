import { buildSystemInstruction } from "./prompt.js";

function httpError(message, status, providerStatus) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  if (providerStatus !== undefined) error.providerStatus = providerStatus;
  return error;
}

function responseText(body) {
  return body?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();
}

// Gemini normally returns a JSON error body ({ error: { code, message, status } }),
// but some rejections never reach the API itself (a proxy/gateway or an IP-based
// block in front of it) and come back as plain HTML instead. Handle both so we
// don't lose the real reason just because JSON.parse fails.
function describeProviderFailure(rawText) {
  try {
    const parsed = JSON.parse(rawText);
    return {
      reason: parsed?.error?.status || null,
      message: parsed?.error?.message || null,
    };
  } catch {
    return { reason: null, message: null };
  }
}

function userFacingMessageFor(status, reason) {
  if (status === 401 || status === 403 || reason === "PERMISSION_DENIED" || reason === "UNAUTHENTICATED") {
    return "Ledger AI's connection to its provider was rejected. Check that GEMINI_API_KEY is set correctly on the server and has no restrictions blocking this request.";
  }
  if (status === 400 && reason === "FAILED_PRECONDITION") {
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

async function callGemini({ apiKey, model, systemInstruction, contents, signal }) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
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
    const { reason, message } = describeProviderFailure(rawText);
    // Full detail is logged server-side only — never sent to the client.
    console.error(
      `[Ledger AI] provider request failed: status=${response.status} reason=${reason || "unknown"} ` +
        `message=${message || rawText.slice(0, 500) || "(empty body)"}`
    );
    throw httpError(userFacingMessageFor(response.status, reason), 502, response.status);
  }

  let body;
  try {
    body = JSON.parse(rawText);
  } catch {
    console.error(`[Ledger AI] provider returned a non-JSON success body: ${rawText.slice(0, 500)}`);
    throw httpError("Ledger AI did not return an answer. Please try again.", 502);
  }

  return responseText(body);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function askGemini({ message, history, snapshot }) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw httpError(
      "Ledger AI is not configured yet. Add GEMINI_API_KEY to the API server and try again.",
      503
    );
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const systemInstruction = buildSystemInstruction(snapshot);
  const contents = [
    ...history.map((item) => ({
      role: item.role === "assistant" ? "model" : "user",
      parts: [{ text: item.content }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];

  // One retry, only for transient provider failures (rate limit / overloaded).
  // Config errors (bad key, bad model, billing) fail fast on the first try.
  const maxAttempts = 2;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const answer = await callGemini({
        apiKey,
        model,
        systemInstruction,
        contents,
        signal: controller.signal,
      });

      if (!answer) {
        throw httpError("Ledger AI did not return an answer. Please try again.", 502);
      }

      return answer;
    } catch (error) {
      lastError =
        error.name === "AbortError"
          ? httpError("Ledger AI took too long to respond. Please try again.", 504)
          : error;

      const isRetryable = lastError.providerStatus === 429 || lastError.providerStatus === 503;
      if (isRetryable && attempt < maxAttempts) {
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

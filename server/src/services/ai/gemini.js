import { buildSystemInstruction } from "./prompt.js";

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  return error;
}

function responseText(body) {
  return body?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const contents = [
      ...history.map((item) => ({
        role: item.role === "assistant" ? "model" : "user",
        parts: [{ text: item.content }],
      })),
      { role: "user", parts: [{ text: message }] },
    ];

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: buildSystemInstruction(snapshot) }],
          },
          contents,
          generationConfig: {
            temperature: 0.25,
            maxOutputTokens: 900,
          },
        }),
      }
    );

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error(`Ledger AI provider request failed with status ${response.status}.`);
      throw httpError("Ledger AI could not answer right now. Please try again shortly.", 502);
    }

    const answer = responseText(body);

    if (!answer) {
      throw httpError("Ledger AI did not return an answer. Please try again.", 502);
    }

    return answer;
  } catch (error) {
    if (error.name === "AbortError") {
      throw httpError("Ledger AI took too long to respond. Please try again.", 504);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

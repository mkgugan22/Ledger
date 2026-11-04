const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export function isAuthEmailConfigured() {
  return Boolean(process.env.BREVO_API_KEY && process.env.AUTH_EMAIL_FROM);
}

export function buildAuthActionUrl(action, token) {
  const configuredUrl = process.env.AUTH_PUBLIC_URL || (process.env.CLIENT_ORIGIN || "").split(",")[0];
  if (!configuredUrl) throw new Error("AUTH_PUBLIC_URL or CLIENT_ORIGIN must be configured.");
  const baseUrl = configuredUrl.trim().replace(/\/+$/, "");
  return baseUrl + "/login?" + action + "=" + encodeURIComponent(token);
}

function getSender() {
  const configuredSender = (process.env.AUTH_EMAIL_FROM || "").trim();
  const namedSender = configuredSender.match(/^(.*?)\s*<([^<>]+)>$/);
  if (namedSender) {
    return { name: namedSender[1].trim() || "Ledger", email: namedSender[2].trim() };
  }
  return { email: configuredSender };
}

export async function sendAuthEmail({ to, subject, html }) {
  if (!isAuthEmailConfigured()) {
    const error = new Error("Authentication email delivery is not configured.");
    error.status = 503;
    error.expose = true;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": process.env.BREVO_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: getSender(),
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Provider response bodies may contain account/configuration details.
      // Keep them out of API responses and application logs.
      throw new Error("Transactional email provider rejected the message.");
    }
    return true;
  } catch (error) {
    const wrapped = new Error("Authentication email could not be sent.", { cause: error });
    wrapped.status = 503;
    wrapped.expose = true;
    throw wrapped;
  } finally {
    clearTimeout(timeout);
  }
}

export function escapeEmailHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function isAuthEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.AUTH_EMAIL_FROM);
}

export function buildAuthActionUrl(action, token) {
  const configuredUrl = process.env.AUTH_PUBLIC_URL || (process.env.CLIENT_ORIGIN || "").split(",")[0];
  if (!configuredUrl) throw new Error("AUTH_PUBLIC_URL or CLIENT_ORIGIN must be configured.");
  const baseUrl = configuredUrl.trim().replace(/\/+$/, "");
  return baseUrl + "/login?" + action + "=" + encodeURIComponent(token);
}

export async function sendAuthEmail({ to, subject, html }) {
  if (!isAuthEmailConfigured()) {
    const error = new Error("Authentication email delivery is not configured.");
    error.status = 503;
    error.expose = true;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.RESEND_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.AUTH_EMAIL_FROM,
        to: [to],
        subject,
        html,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      // Do not expose provider response bodies, which can contain account or
      // configuration details, to the end user.
      throw new Error("Authentication email provider rejected the message.");
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

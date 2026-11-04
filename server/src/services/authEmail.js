const EMAILJS_ENDPOINT = "https://api.emailjs.com/api/v1.0/email/send";

export function isAuthEmailConfigured() {
  return Boolean(
    process.env.EMAILJS_SERVICE_ID &&
    process.env.EMAILJS_TEMPLATE_ID &&
    process.env.EMAILJS_PUBLIC_KEY &&
    process.env.EMAILJS_PRIVATE_KEY
  );
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
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(EMAILJS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        service_id: process.env.EMAILJS_SERVICE_ID,
        template_id: process.env.EMAILJS_TEMPLATE_ID,
        user_id: process.env.EMAILJS_PUBLIC_KEY,
        accessToken: process.env.EMAILJS_PRIVATE_KEY,
        template_params: {
          to_email: to,
          subject,
          html_content: html,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Provider response bodies may contain account/configuration details.
      // Keep them out of API responses and application logs.
      throw new Error("Email delivery provider rejected the message.");
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

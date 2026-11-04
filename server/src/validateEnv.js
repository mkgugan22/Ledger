// Fails fast on boot instead of letting the app run with an insecure or
// broken configuration (e.g. a missing JWT_SECRET silently falling back to
// a default, or MONGODB_URI being undefined until the first query fails).
export function validateEnv() {
  const missing = [];
  if (!process.env.MONGODB_URI) missing.push("MONGODB_URI");
  if (!process.env.JWT_SECRET) missing.push("JWT_SECRET");

  if (process.env.REQUIRE_EMAIL_VERIFICATION === "true") {
    if (!process.env.EMAILJS_SERVICE_ID) missing.push("EMAILJS_SERVICE_ID");
    if (!process.env.EMAILJS_TEMPLATE_ID) missing.push("EMAILJS_TEMPLATE_ID");
    if (!process.env.EMAILJS_PUBLIC_KEY) missing.push("EMAILJS_PUBLIC_KEY");
    if (!process.env.EMAILJS_PRIVATE_KEY) missing.push("EMAILJS_PRIVATE_KEY");
    if (!process.env.AUTH_PUBLIC_URL && !process.env.CLIENT_ORIGIN) missing.push("AUTH_PUBLIC_URL or CLIENT_ORIGIN");
  }

  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        "Copy server/.env.example to server/.env and fill in real values."
    );
  }

  if (
    process.env.NODE_ENV === "production" &&
    process.env.JWT_SECRET.length < 32
  ) {
    throw new Error(
      "JWT_SECRET is too short for production. Generate one with: " +
        `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
    );
  }
}

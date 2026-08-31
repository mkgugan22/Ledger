// Fails fast on boot instead of letting the app run with an insecure or
// broken configuration (e.g. a missing JWT_SECRET silently falling back to
// a default, or MONGODB_URI being undefined until the first query fails).
export function validateEnv() {
  const missing = [];
  if (!process.env.MONGODB_URI) missing.push("MONGODB_URI");
  if (!process.env.JWT_SECRET) missing.push("JWT_SECRET");

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

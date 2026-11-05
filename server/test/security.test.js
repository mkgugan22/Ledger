import { afterAll, beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { startTestDB, stopTestDB } from "./setup.js";
import RateLimitCounter from "../src/models/RateLimitCounter.js";

process.env.CLIENT_ORIGIN = "http://localhost:5173";
const app = createApp();

beforeAll(startTestDB);
afterEach(async () => {
  await RateLimitCounter.deleteMany({});
  delete process.env.REQUIRE_EMAIL_VERIFICATION;
  delete process.env.BREVO_API_KEY;
  delete process.env.AUTH_EMAIL_FROM;
  delete process.env.AUTH_PUBLIC_URL;
  vi.restoreAllMocks();
});
afterAll(stopTestDB);

const account = {
  name: "Security Test",
  email: "security-test@example.com",
  password: "correct-horse-battery",
};

function tokenFromMail(spy, parameter) {
  const body = JSON.parse(spy.mock.calls.at(-1)[1].body);
  const html = body.htmlContent || body.html || "";
  const url = html.match(new RegExp(parameter + "=([A-Za-z0-9_-]+)"))?.[1];
  expect(url).toBeTruthy();
  return url;
}

describe("authentication hardening", () => {
  it("rejects new passwords that exceed bcrypt's 72-byte input limit", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ ...account, email: "long-password@example.com", password: "é".repeat(37) })
      .expect(400);
  });

  it("performs a dummy password comparison for unknown accounts", async () => {
    await request(app)
      .post("/api/auth/login")
      .send({ email: "missing-account@example.com", password: "not-the-password" })
      .expect(401)
      .expect((response) => expect(response.body.error).toBe("Invalid email or password."));
  });

  it("rejects registration passwords shorter than 12 characters", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ ...account, email: "weak-password@example.com", password: "short123" })
      .expect(400);
  });

  it("requires verification when enabled and accepts only the emailed token", async () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = "true";
    process.env.BREVO_API_KEY = "test-provider-key";
    process.env.AUTH_EMAIL_FROM = "Ledger Test <noreply@example.com>";
    process.env.AUTH_PUBLIC_URL = "http://localhost:5173";
    const mail = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true });

    const registered = await request(app)
      .post("/api/auth/register")
      .send({ ...account, email: "verify-me@example.com" })
      .expect(201);
    expect(registered.body.verificationRequired).toBe(true);
    expect(registered.headers["set-cookie"]).toBeUndefined();

    await request(app)
      .post("/api/auth/login")
      .send({ email: "verify-me@example.com", password: account.password })
      .expect(403);

    const token = tokenFromMail(mail, "verify");
    const verificationAttempts = await Promise.all([
      request(app).post("/api/auth/verify-email").send({ token }),
      request(app).post("/api/auth/verify-email").send({ token }),
    ]);
    expect(verificationAttempts.map((response) => response.status).sort()).toEqual([200, 400]);

    await request(app)
      .post("/api/auth/login")
      .send({ email: "verify-me@example.com", password: account.password })
      .expect(200);
  });

  it("resets a password once and invalidates earlier sessions", async () => {
    process.env.BREVO_API_KEY = "test-provider-key";
    process.env.AUTH_EMAIL_FROM = "Ledger Test <noreply@example.com>";
    process.env.AUTH_PUBLIC_URL = "http://localhost:5173";
    const mail = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true });

    const registered = await request(app)
      .post("/api/auth/register")
      .send({ ...account, email: "reset-me@example.com" })
      .expect(201);
    const cookie = registered.headers["set-cookie"]
      .find((value) => value.startsWith("ledger_session="))
      .split(";")[0];

    await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "reset-me@example.com" })
      .expect(200);
    const token = tokenFromMail(mail, "reset");

    const resetAttempts = await Promise.all([
      request(app).post("/api/auth/reset-password").send({ token, password: "a-new-longer-password-123" }),
      request(app).post("/api/auth/reset-password").send({ token, password: "another-long-password-456" }),
    ]);
    expect(resetAttempts.map((response) => response.status).sort()).toEqual([200, 400]);

    await request(app).get("/api/auth/me").set("Cookie", cookie).expect(401);
    await request(app)
      .post("/api/auth/login")
      .send({ email: "reset-me@example.com", password: "a-new-longer-password-123" })
      .expect(200);
    await request(app)
      .post("/api/auth/login")
      .send({ email: "reset-me@example.com", password: account.password })
      .expect(401);
  });

  it("does not reveal whether an email address exists in password reset responses", async () => {
    process.env.BREVO_API_KEY = "test-provider-key";
    process.env.AUTH_EMAIL_FROM = "Ledger Test <noreply@example.com>";
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true });
    await request(app)
      .post("/api/auth/register")
      .send({ ...account, email: "existing-reset@example.com" })
      .expect(201);

    const [known, unknown] = await Promise.all([
      request(app).post("/api/auth/forgot-password").send({ email: "existing-reset@example.com" }),
      request(app).post("/api/auth/forgot-password").send({ email: "not-registered@example.com" }),
    ]);
    expect(known.body).toEqual(unknown.body);
  });

  it("revokes a previously copied session cookie on logout", async () => {
    const registered = await request(app)
      .post("/api/auth/register")
      .send(account)
      .expect(201);

    const cookie = registered.headers["set-cookie"]
      .find((value) => value.startsWith("ledger_session="))
      .split(";")[0];

    await request(app).post("/api/auth/logout").set("Cookie", cookie).expect(200);
    await request(app).get("/api/auth/me").set("Cookie", cookie).expect(401);
  });

  it("rejects state-changing browser requests from an untrusted Origin", async () => {
    const registered = await request(app)
      .post("/api/auth/register")
      .send({ ...account, email: "csrf-test@example.com" })
      .expect(201);

    const cookie = registered.headers["set-cookie"]
      .find((value) => value.startsWith("ledger_session="))
      .split(";")[0];

    await request(app)
      .post("/api/transactions")
      .set("Cookie", cookie)
      .set("Origin", "https://untrusted.example")
      .send({ mode: "Needs", type: "Test", amount: 10, month: "2026-11" })
      .expect(403);

    await request(app)
      .post("/api/transactions")
      .set("Cookie", cookie)
      .set("Origin", "http://localhost:5173")
      .send({ mode: "Needs", type: "Test", amount: 10, month: "2026-11" })
      .expect(201);
  });

  it("keeps no-Origin API clients compatible", async () => {
    const registered = await request(app)
      .post("/api/auth/register")
      .send({ ...account, email: "no-origin-test@example.com" })
      .expect(201);

    const cookie = registered.headers["set-cookie"]
      .find((value) => value.startsWith("ledger_session="))
      .split(";")[0];

    await request(app)
      .post("/api/transactions")
      .set("Cookie", cookie)
      .send({ mode: "Needs", type: "Test", amount: 10, month: "2026-11" })
      .expect(201);
  });
});

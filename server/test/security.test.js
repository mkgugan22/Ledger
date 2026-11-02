import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { startTestDB, stopTestDB } from "./setup.js";

process.env.CLIENT_ORIGIN = "http://localhost:5173";
const app = createApp();

beforeAll(startTestDB);
afterAll(stopTestDB);

const account = {
  name: "Security Test",
  email: "security-test@example.com",
  password: "correct-horse-battery",
};

describe("authentication hardening", () => {
  it("revokes a previously copied session cookie on logout", async () => {
    const registered = await request(app)
      .post("/api/auth/register")
      .send(account)
      .expect(201);

    const cookie = registered.headers["set-cookie"]
      .find((value) => value.startsWith("ledger_session="))
      .split(";")[0];

    await request(app)
      .post("/api/auth/logout")
      .set("Cookie", cookie)
      .expect(200);

    // Simulate a copied/stolen cookie after the legitimate browser logged out.
    await request(app)
      .get("/api/auth/me")
      .set("Cookie", cookie)
      .expect(401);
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

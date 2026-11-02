import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { claimLegacyRecords, _resetLegacyClaimCache } from "../src/routes/auth.js";
import { clearCollections, startTestDB, stopTestDB } from "./setup.js";
import User from "../src/models/User.js";
import Transaction from "../src/models/Transaction.js";
import AiChatShare from "../src/models/AiChatShare.js";

const app = createApp();
const entry = { mode: "Needs", type: "Groceries", amount: 1250, month: "2026-08", note: "weekly" };
let agent;

beforeAll(startTestDB);
afterEach(async () => {
  await clearCollections();
  _resetLegacyClaimCache();
  agent = request.agent(app);
});
afterAll(stopTestDB);

async function signUp() {
  const active = agent || request.agent(app);
  await active.post("/api/auth/register").send({ name: "Test User", email: "test@example.com", password: "password123" }).expect(201);
  return active;
}

describe("authentication", () => {
  it("registers, logs in, and restores the session", async () => {
    const active = await signUp();
    await active.post("/api/auth/login").send({ email: "test@example.com", password: "password123" }).expect(200);
    const response = await active.get("/api/auth/me").expect(200);
    expect(response.body.user.email).toBe("test@example.com");
  });

  it("claims legacy records only when one account exists", async () => {
    const first = await User.create({ name: "One", email: "one@example.com", passwordHash: "hash" });
    await Transaction.create(entry);
    await claimLegacyRecords(first._id);
    expect((await Transaction.findOne()).user.toString()).toBe(first._id.toString());
    await User.create({ name: "Two", email: "two@example.com", passwordHash: "hash" });
    await Transaction.create({ ...entry, type: "Fuel" });
    await claimLegacyRecords(first._id);
    expect((await Transaction.findOne({ type: "Fuel" })).user).toBeFalsy();
  });
});

describe("ledger workflows", () => {
  it("validates, creates, filters, updates, and deletes a transaction", async () => {
    const active = await signUp();
    await active.post("/api/transactions").send({ ...entry, month: "2026-99" }).expect(400);
    const created = await active.post("/api/transactions").send(entry).expect(201);
    await active.get("/api/transactions?month=2026-08&page=1&limit=1").expect(200).expect((res) => expect(res.body.total).toBe(1));
    await active.get("/api/transactions?month=2026-08&from=2026-07").expect(400);
    await active.put(`/api/transactions/${created.body._id}`).send({ ...entry, amount: 1400 }).expect(200);
    await active.delete(`/api/transactions/${created.body._id}`).expect(200);
  });

  it("generates recurring entries once and returns row-level CSV errors", async () => {
    const active = await signUp();
    await active.post("/api/transactions").send({ ...entry, recurring: true }).expect(201);
    await active.post("/api/transactions/generate-recurring").send({ month: "2026-09" }).expect(201).expect((res) => expect(res.body.created).toHaveLength(1));
    await active.post("/api/transactions/generate-recurring").send({ month: "2026-09" }).expect(201).expect((res) => expect(res.body.created).toHaveLength(0));
    const imported = await active.post("/api/transactions/import").send({ csv: "mode,type,amount,month\nNeeds,Food,200,2026-09\nNeeds,Bad,nope,2026-09" }).expect(207);
    expect(imported.body).toMatchObject({ imported: 1, failed: 1 });
  });

  it("upserts a monthly budget", async () => {
    const active = await signUp();
    await active.post("/api/budgets").send({ month: "2026-08", mode: "Needs", type: "Rent", plannedAmount: 10000 }).expect(201);
    const result = await active.get("/api/budgets?month=2026-08").expect(200);
    expect(result.body).toHaveLength(1);
  });

  it("creates an expiring share link that is readable without exposing account data", async () => {
    const active = await signUp();
    const messages = [
      { role: "assistant", content: "Welcome to Ledger AI.", createdAt: "2026-11-02T04:00:00.000Z" },
      { role: "user", content: "How is my budget?", createdAt: "2026-11-02T04:01:00.000Z" },
      { role: "assistant", content: "Your budget is on track.", createdAt: "2026-11-02T04:01:10.000Z" },
    ];

    const created = await active.post("/api/ai/share").send({ messages }).expect(201);
    expect(created.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Date(created.body.expiresAt).getTime()).toBeGreaterThan(Date.now());

    // A fresh, unauthenticated client can only read the explicitly shared snapshot.
    const shared = await request(app).get(`/api/ai/share/${created.body.token}`).expect(200);
    expect(shared.body.messages).toHaveLength(3);
    expect(shared.body.messages[1]).toMatchObject({ role: "user", content: "How is my budget?" });
    expect(shared.body).not.toHaveProperty("user");
    expect(shared.headers["cache-control"]).toBe("no-store");

    await AiChatShare.updateOne(
      { tokenHash: crypto.createHash("sha256").update(created.body.token).digest("hex") },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    await request(app).get(`/api/ai/share/${created.body.token}`).expect(404);
  });

  it("keeps Ledger AI authenticated and validates its body", async () => {
  const active = await signUp();

  await active
    .post("/api/ai/chat")
    .send({ message: "   " })
    .expect(400);

  const result = await active
    .post("/api/ai/chat")
    .send({ message: "How is my budget?" })
    .expect(503);

  expect(result.body.error).toMatch(/not configured/i);
});
  
});

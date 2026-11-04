import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoRateLimitStore } from "../src/middleware/mongoRateLimitStore.js";
import RateLimitCounter from "../src/models/RateLimitCounter.js";
import { startTestDB, stopTestDB } from "./setup.js";

beforeAll(startTestDB);
afterAll(stopTestDB);

describe("MongoRateLimitStore", () => {
  it("shares counters across store instances and isolates limiter prefixes", async () => {
    const firstInstance = new MongoRateLimitStore("auth");
    const secondInstance = new MongoRateLimitStore("auth");
    const separateLimiter = new MongoRateLimitStore("ai");
    await RateLimitCounter.init();

    const first = await firstInstance.increment("client-key");
    const second = await secondInstance.increment("client-key");
    const isolated = await separateLimiter.increment("client-key");

    expect(first.totalHits).toBe(1);
    expect(second.totalHits).toBe(2);
    expect(isolated.totalHits).toBe(1);
    expect(await secondInstance.get("client-key")).toMatchObject({ totalHits: 2 });

    await firstInstance.resetKey("client-key");
    expect(await secondInstance.get("client-key")).toBeUndefined();
    expect(await separateLimiter.get("client-key")).toMatchObject({ totalHits: 1 });
  });
});

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import AutoSipLock from "../src/models/AutoSipLock.js";
import {
  acquireAutoSipSchedulerLock,
  renewAutoSipSchedulerLock,
  releaseAutoSipSchedulerLock,
  AUTO_SIP_LOCK_LEASE_MS,
} from "../src/services/autoSipLock.js";
import { startTestDB, stopTestDB } from "./setup.js";

beforeAll(startTestDB);
afterEach(() => AutoSipLock.deleteMany({}));
afterAll(stopTestDB);

describe("distributed Auto-SIP scheduler lease", () => {
  it("allows only one active owner and releases only for that owner", async () => {
    const firstOwner = randomUUID();
    const secondOwner = randomUUID();
    const now = new Date();

    expect(await acquireAutoSipSchedulerLock(firstOwner, now)).toBe(firstOwner);
    expect(await acquireAutoSipSchedulerLock(secondOwner, now)).toBeNull();

    expect(await renewAutoSipSchedulerLock(secondOwner, now)).toBe(false);
    expect(await releaseAutoSipSchedulerLock(secondOwner)).toBe(false);
    expect(await renewAutoSipSchedulerLock(firstOwner, new Date(now.getTime() + 1000))).toBe(true);

    expect(await releaseAutoSipSchedulerLock(firstOwner)).toBe(true);
    expect(await acquireAutoSipSchedulerLock(secondOwner, now)).toBe(secondOwner);
  });

  it("allows a new owner to reclaim an expired lease", async () => {
    const firstOwner = randomUUID();
    const nextOwner = randomUUID();
    const acquiredAt = new Date();

    expect(await acquireAutoSipSchedulerLock(firstOwner, acquiredAt)).toBe(firstOwner);
    const afterExpiry = new Date(acquiredAt.getTime() + AUTO_SIP_LOCK_LEASE_MS + 1000);

    expect(await acquireAutoSipSchedulerLock(nextOwner, afterExpiry)).toBe(nextOwner);
    expect(await releaseAutoSipSchedulerLock(firstOwner)).toBe(false);
    expect(await releaseAutoSipSchedulerLock(nextOwner)).toBe(true);
  });
});

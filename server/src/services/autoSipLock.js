import { randomUUID } from "node:crypto";
import AutoSipLock from "../models/AutoSipLock.js";

const LOCK_ID = "auto-sip-global-scheduler";
export const AUTO_SIP_LOCK_LEASE_MS = 30 * 60 * 1000;

// Acquire the lease with an owner token. An expired lease can be taken over
// immediately; an active lease is protected by MongoDB's unique _id index.
export async function acquireAutoSipSchedulerLock(ownerId = randomUUID(), now = new Date()) {
  await AutoSipLock.init();
  const expiresAt = new Date(now.getTime() + AUTO_SIP_LOCK_LEASE_MS);
  const reclaimed = await AutoSipLock.findOneAndUpdate(
    { _id: LOCK_ID, expiresAt: { $lte: now } },
    { $set: { ownerId, expiresAt } },
    { new: true },
  ).lean();

  if (reclaimed) return ownerId;

  try {
    await AutoSipLock.create({ _id: LOCK_ID, ownerId, expiresAt });
    return ownerId;
  } catch (error) {
    // A different instance may have acquired the new/expired lease first.
    if (error?.code === 11000) return null;
    throw error;
  }
}

// Renew only while this owner still holds a non-expired lease. A process that
// loses its lease cannot extend or release another instance's lease.
export async function renewAutoSipSchedulerLock(ownerId, now = new Date()) {
  const result = await AutoSipLock.updateOne(
    { _id: LOCK_ID, ownerId, expiresAt: { $gt: now } },
    { $set: { expiresAt: new Date(now.getTime() + AUTO_SIP_LOCK_LEASE_MS) } },
  );
  return result.matchedCount === 1;
}

export async function releaseAutoSipSchedulerLock(ownerId) {
  const result = await AutoSipLock.deleteOne({ _id: LOCK_ID, ownerId });
  return result.deletedCount === 1;
}

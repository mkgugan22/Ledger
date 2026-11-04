import RateLimitCounter from "../models/RateLimitCounter.js";

let indexesReady;
async function ensureIndexes() {
  if (!indexesReady) {
    indexesReady = RateLimitCounter.init().catch((error) => {
      indexesReady = null;
      throw error;
    });
  }
  return indexesReady;
}

// Mongo-backed express-rate-limit store. Atomic update pipelines ensure that
// concurrent API instances increment the same counter without losing hits.
// The TTL index removes expired counters; expired documents are also reset
// synchronously by the update pipeline, so TTL monitor delay cannot extend a
// rate-limit window.
export class MongoRateLimitStore {
  constructor(prefix) {
    this.prefix = prefix;
    this.windowMs = 15 * 60 * 1000;
    this.localKeys = false;
  }

  async init(options) {
    this.windowMs = options.windowMs;
  }

  keyFor(key) {
    return this.prefix + ":" + key;
  }

  async increment(key) {
    await ensureIndexes();
    const now = new Date();
    const resetAt = new Date(now.getTime() + this.windowMs);
    const pipeline = [{
      $set: {
        hits: {
          $cond: [
            { $gt: ["$resetAt", now] },
            { $add: [{ $ifNull: ["$hits", 0] }, 1] },
            1,
          ],
        },
        resetAt: {
          $cond: [{ $gt: ["$resetAt", now] }, "$resetAt", resetAt],
        },
      },
    }];
    let doc;
    try {
      doc = await RateLimitCounter.findOneAndUpdate(
        { key: this.keyFor(key) },
        pipeline,
        { upsert: true, new: true },
      ).lean();
    } catch (error) {
      // Two app instances can race to create the very first counter. The
      // unique key index lets one win; retry the atomic update against it.
      if (error?.code !== 11000) throw error;
      doc = await RateLimitCounter.findOneAndUpdate(
        { key: this.keyFor(key) },
        pipeline,
        { new: true },
      ).lean();
      if (!doc) return this.increment(key);
    }

    return { totalHits: doc.hits, resetTime: doc.resetAt };
  }

  async get(key) {
    const doc = await RateLimitCounter.findOne({
      key: this.keyFor(key),
      resetAt: { $gt: new Date() },
    }).lean();
    return doc ? { totalHits: doc.hits, resetTime: doc.resetAt } : undefined;
  }

  async decrement(key) {
    await RateLimitCounter.updateOne(
      { key: this.keyFor(key), resetAt: { $gt: new Date() }, hits: { $gt: 0 } },
      { $inc: { hits: -1 } },
    );
  }

  async resetKey(key) {
    await RateLimitCounter.deleteOne({ key: this.keyFor(key) });
  }

  async resetAll() {
    await RateLimitCounter.deleteMany({ key: { $regex: "^" + this.prefix + ":" } });
  }
}

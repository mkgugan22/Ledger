import RateLimitCounter from "../models/RateLimitCounter.js";

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
    await RateLimitCounter.init();
  }

  keyFor(key) {
    return this.prefix + ":" + key;
  }

  async increment(key) {
    const now = new Date();
    const resetAt = new Date(now.getTime() + this.windowMs);
    const doc = await RateLimitCounter.findOneAndUpdate(
      { key: this.keyFor(key) },
      [{
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
      }],
      { upsert: true, new: true },
    ).lean();

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
    await RateLimitCounter.deleteMany({ key: new RegExp("^" + this.prefix.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&") + ":") });
  }
}

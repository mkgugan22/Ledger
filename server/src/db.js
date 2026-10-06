import mongoose from "mongoose";

// Pool sizing matters once many requests are in flight at once: too small
// and requests queue up waiting for a free connection; too large and you
// can exceed what your MongoDB tier allows (Atlas M0/M2/M5 shared tiers
// cap total connections well below what a busy Node process would
// otherwise try to open). Defaults below are a reasonable starting point
// for a single dedicated (M10+) cluster — override per environment with
// the env vars if you're still on a shared tier, or if you run more than
// one server instance (divide your cluster's max connections across
// instances × maxPoolSize).
export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Missing MONGODB_URI — copy server/.env.example to server/.env and fill it in.");
  }
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, {
    dbName: "ledger",
    maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE) || 50,
    minPoolSize: Number(process.env.MONGODB_MIN_POOL_SIZE) || 5,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: Number(process.env.MONGODB_SOCKET_TIMEOUT_MS) || 45000,
    waitQueueTimeoutMS: Number(process.env.MONGODB_WAIT_QUEUE_TIMEOUT_MS) || 10000,
    maxConnecting: Number(process.env.MONGODB_MAX_CONNECTING) || 10,
    maxIdleTimeMS: Number(process.env.MONGODB_MAX_IDLE_TIME_MS) || 60000,
  });
  console.log("Connected to MongoDB (db: ledger)");
}

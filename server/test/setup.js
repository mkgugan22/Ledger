import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import path from "node:path";

let mongod;

export async function startTestDB() {
  process.env.JWT_SECRET = "test-only-secret-do-not-use-in-production-xxxxx";
  process.env.NODE_ENV = "test";
  // Keep test binaries inside the repository so local/sandboxed runs do not
  // need write access to a machine-wide user cache.
  mongod = await MongoMemoryServer.create({
    binary: {
      // MongoDB 7 is fully sufficient for the Mongoose features under test
      // and materially smaller than the current 8.x Windows test binary.
      version: "7.0.14",
      downloadDir: path.resolve(".cache", "mongodb-binaries"),
    },
  });
  const uri = mongod.getUri();
  process.env.MONGODB_URI = uri;
  await mongoose.connect(uri, { dbName: "ledger-test" });
}

export async function stopTestDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  }
  if (mongod) await mongod.stop();
}

export async function clearCollections() {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}

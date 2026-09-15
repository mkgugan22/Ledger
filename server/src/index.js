import dotenv from "dotenv";
import { connectDB } from "./db.js";
import { validateEnv } from "./validateEnv.js";
import { createApp } from "./app.js";
import mongoose from "mongoose";

dotenv.config();
validateEnv();

const app = createApp();
const PORT = process.env.PORT || 5000;

const server = await connectDB()
  .then(() => app.listen(PORT, () => console.log(`Ledger API listening on port ${PORT}`)))
  .catch((err) => {
    console.error("Could not connect to MongoDB:", err.message);
    process.exit(1);
  });

// Drain in-flight HTTP requests before closing MongoDB. This is important
// during Render restarts/deploys: active users get a clean connection close
// instead of a sudden socket reset halfway through a request.
let shuttingDown = false;
const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received; draining Ledger API connections...`);

  server.close(async () => {
    try {
      await mongoose.connection.close(false);
      console.log("Ledger API shutdown complete.");
      process.exit(0);
    } catch (err) {
      console.error("Error closing MongoDB connection:", err.message);
      process.exit(1);
    }
  });

  setTimeout(() => {
    console.error("Graceful shutdown timed out; forcing exit.");
    process.exit(1);
  }, Number(process.env.SHUTDOWN_TIMEOUT_MS) || 30_000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

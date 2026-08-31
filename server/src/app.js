import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import transactionsRouter from "./routes/transactions.js";
import valuationsRouter from "./routes/valuations.js";
import authRouter from "./routes/auth.js";
import investmentsRouter from "./routes/investments.js";
import marketRouter from "./routes/market.js";
import budgetsRouter from "./routes/budgets.js";
import receiptsRouter from "./routes/receipts.js";
import documentsRouter from "./routes/documents.js";
import { requireAuth } from "./middleware/auth.js";

// Builds and returns the configured Express app without connecting to a
// database or starting a listener. Kept separate from index.js so tests
// (and any other embedder) can import the app directly — see
// server/test/*.test.js, which run this against an in-memory MongoDB
// instance via mongodb-memory-server.
export function createApp() {
  const app = express();
  const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((o) => o.trim());

  // Render terminates TLS before forwarding requests. Trust only that first
  // proxy so the auth limiter sees the real client address.
  if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());

  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRouter);
  app.use(requireAuth);
  app.use("/api/market", marketRouter);
  app.use("/api/transactions", transactionsRouter);
  app.use("/api/transactions/:id/receipts", receiptsRouter);
  app.use("/api/documents", documentsRouter);
  app.use("/api/valuations", valuationsRouter);
  app.use("/api/investments", investmentsRouter);
  app.use("/api/budgets", budgetsRouter);

  app.use((req, res) => res.status(404).json({ error: "Not found" }));

  // Centralized error handler. Routes use asyncHandler() to forward rejected
  // promises here instead of repeating try/catch in every handler.
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    console.error(err);
    const status = err.status || (err.name === "ValidationError" || err.name === "CastError" ? 400 : 500);
    res.status(status).json({ error: status >= 500 ? "Something went wrong." : err.message || "Invalid request." });
  });

  return app;
}
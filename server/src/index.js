import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { connectDB } from "./db.js";
import transactionsRouter from "./routes/transactions.js";
import valuationsRouter from "./routes/valuations.js";
import authRouter from "./routes/auth.js";
import investmentsRouter from "./routes/investments.js";
import marketRouter from "./routes/market.js";
import { requireAuth } from "./middleware/auth.js";

dotenv.config();

const app = express();
const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim());

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);
app.use(requireAuth);
app.use("/api/market", marketRouter);
app.use("/api/transactions", transactionsRouter);
app.use("/api/valuations", valuationsRouter);
app.use("/api/investments", investmentsRouter);

app.use((req, res) => res.status(404).json({ error: "Not found" }));

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`Ledger API listening on port ${PORT}`));
  })
  .catch((err) => {
    console.error("Could not connect to MongoDB:", err.message);
    process.exit(1);
  });

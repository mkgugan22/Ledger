import dotenv from "dotenv";
import { connectDB } from "./db.js";
import Valuation from "./models/Valuation.js";
import Transaction from "./models/Transaction.js";
import Budget from "./models/Budget.js";
import Investment from "./models/Investment.js";

dotenv.config();
await connectDB();
try { await Valuation.collection.dropIndex("month_1_instrument_1"); } catch (err) { if (err.codeName !== "IndexNotFound") throw err; }
await Promise.all([Valuation.syncIndexes(), Transaction.syncIndexes(), Budget.syncIndexes(), Investment.syncIndexes()]);
console.log("Ledger indexes updated.");
process.exit(0);

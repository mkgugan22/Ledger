import dotenv from "dotenv";
import { connectDB } from "./db.js";
import Valuation from "./models/Valuation.js";
import Transaction from "./models/Transaction.js";
import Budget from "./models/Budget.js";
import Investment from "./models/Investment.js";
import Receipt from "./models/Receipt.js";
import Debt from "./models/Debt.js";
import Bill from "./models/Bill.js";

dotenv.config();
await connectDB();
try { await Valuation.collection.dropIndex("month_1_instrument_1"); } catch (err) { if (err.codeName !== "IndexNotFound") throw err; }
await Promise.all([Valuation.syncIndexes(), Transaction.syncIndexes(), Budget.syncIndexes(), Investment.syncIndexes(), Receipt.syncIndexes(), Debt.syncIndexes(), Bill.syncIndexes()]);
console.log("Ledger indexes updated.");
process.exit(0);

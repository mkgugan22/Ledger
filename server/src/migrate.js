import dotenv from "dotenv";
import { connectDB } from "./db.js";
import Valuation from "./models/Valuation.js";

dotenv.config();
await connectDB();
try { await Valuation.collection.dropIndex("month_1_instrument_1"); } catch (err) { if (err.codeName !== "IndexNotFound") throw err; }
await Valuation.syncIndexes();
console.log("Valuation indexes updated.");
process.exit(0);

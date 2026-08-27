import mongoose from "mongoose";

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Missing MONGODB_URI — copy server/.env.example to server/.env and fill it in.");
  }
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { dbName: "ledger" });
  console.log("Connected to MongoDB (db: ledger)");
}

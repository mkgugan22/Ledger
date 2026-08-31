import dotenv from "dotenv";
import { connectDB } from "./db.js";
import { validateEnv } from "./validateEnv.js";
import { createApp } from "./app.js";

dotenv.config();
validateEnv();

const app = createApp();
const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`Ledger API listening on port ${PORT}`));
  })
  .catch((err) => {
    console.error("Could not connect to MongoDB:", err.message);
    process.exit(1);
  });

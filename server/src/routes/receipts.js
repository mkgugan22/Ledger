import { Router } from "express";
import { z } from "zod";
import Transaction from "../models/Transaction.js";
import Receipt from "../models/Receipt.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

const router = Router({ mergeParams: true });
const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid record id.");
const uploadSchema = z.object({ filename: z.string().trim().min(1).max(180), contentType: z.enum(["image/jpeg", "image/png", "application/pdf"]), data: z.string().min(1) });
function valid(schema, value) { const result = schema.safeParse(value); if (!result.success) { const error = new Error(result.error.issues[0]?.message || "Invalid request."); error.status = 400; throw error; } return result.data; }

router.get("/", asyncHandler(async (req, res) => {
  valid(objectId, req.params.id);
  const receipts = await Receipt.find({ user: req.userId, transaction: req.params.id }).select("filename contentType size createdAt");
  res.json(receipts);
}));

router.post("/", asyncHandler(async (req, res) => {
  valid(objectId, req.params.id);
  const data = valid(uploadSchema, req.body);
  const transaction = await Transaction.exists({ _id: req.params.id, user: req.userId });
  if (!transaction) return res.status(404).json({ error: "Entry not found" });
  const bytes = Buffer.from(data.data, "base64");
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) return res.status(400).json({ error: "Receipts must be between 1 byte and 5 MB." });
  const doc = await Receipt.create({ user: req.userId, transaction: req.params.id, filename: data.filename, contentType: data.contentType, size: bytes.length, data: bytes });
  res.status(201).json({ id: doc._id, filename: doc.filename, contentType: doc.contentType, size: doc.size, createdAt: doc.createdAt });
}));

router.get("/:receiptId", asyncHandler(async (req, res) => {
  valid(objectId, req.params.id); valid(objectId, req.params.receiptId);
  const doc = await Receipt.findOne({ _id: req.params.receiptId, transaction: req.params.id, user: req.userId }).select("+data");
  if (!doc) return res.status(404).json({ error: "Receipt not found" });
  res.type(doc.contentType).set("Content-Disposition", `inline; filename="${doc.filename.replaceAll('"', "")}"`).send(doc.data);
}));

router.delete("/:receiptId", asyncHandler(async (req, res) => {
  valid(objectId, req.params.id); valid(objectId, req.params.receiptId);
  const doc = await Receipt.findOneAndDelete({ _id: req.params.receiptId, transaction: req.params.id, user: req.userId });
  if (!doc) return res.status(404).json({ error: "Receipt not found" });
  res.json({ deleted: true });
}));
export default router;

import { Router } from "express";
import pdf from "pdf-parse";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { extractPayslipDetails } from "../lib/payslip.js";

const router = Router();
const schema = z.object({
  filename: z.string().trim().min(1).max(180),
  contentType: z.string().optional(),
  data: z.string().min(1).max(7 * 1024 * 1024),
});

router.post("/parse-payslip", asyncHandler(async (req, res) => {
  const result = schema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.issues[0]?.message || "Invalid document." });
  const bytes = Buffer.from(result.data.data, "base64");
  if (bytes.length < 5 || bytes.length > 5 * 1024 * 1024 || bytes.subarray(0, 5).toString() !== "%PDF-") {
    return res.status(400).json({ error: "Upload a valid PDF under 5 MB." });
  }
  let parsed;
  try { parsed = await pdf(bytes); } catch { return res.status(422).json({ error: "We could not read text from this PDF. Use a text-based payslip or enter the amount manually." }); }
  const details = extractPayslipDetails(parsed.text);
  if (!details.found) return res.status(422).json({ error: "We could not identify a net or take-home salary in this payslip. Please enter it manually." });
  res.json({ suggestion: details.entry });
}));

export default router;

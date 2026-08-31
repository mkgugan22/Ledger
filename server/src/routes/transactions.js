import { Router } from "express";
import Transaction from "../models/Transaction.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  validateBody,
  transactionSchema,
  generateRecurringSchema,
  csvTransactionRowSchema,
} from "../middleware/validate.js";
import { toCSV, parseCSV } from "../lib/csv.js";

const router = Router();

const CSV_COLUMNS = ["mode", "type", "amount", "month", "note", "recurring", "frequency"];

// GET /api/transactions — list entries, with optional filtering and pagination.
//
// Backward compatible by design: existing clients that call this with no
// query string get the exact same response shape as before (a plain array
// of every entry). Pagination only changes the response shape when a
// caller explicitly opts in with ?page= or ?limit=.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const filter = { user: req.userId };
    if (req.query.month) filter.month = String(req.query.month);
    else if (req.query.from || req.query.to) {
      filter.month = {};
      if (req.query.from) filter.month.$gte = String(req.query.from);
      if (req.query.to) filter.month.$lte = String(req.query.to);
    }

    const wantsPagination = req.query.page !== undefined || req.query.limit !== undefined;
    if (!wantsPagination) {
      const list = await Transaction.find(filter).sort({ createdAt: 1 });
      return res.json(list);
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 200));
    const [items, total] = await Promise.all([
      Transaction.find(filter)
        .sort({ createdAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Transaction.countDocuments(filter),
    ]);
    res.json({ items, page, limit, total, totalPages: Math.ceil(total / limit) });
  })
);

// GET /api/transactions/export — download every entry as CSV.
// Registered before "/:id"-style routes so "export" is never mistaken for
// an id (there's no GET "/:id" today, but this keeps the ordering safe if
// one is ever added).
router.get(
  "/export",
  asyncHandler(async (req, res) => {
    const list = await Transaction.find({ user: req.userId }).sort({ month: 1, createdAt: 1 });
    const rows = list.map((t) => ({
      mode: t.mode,
      type: t.type,
      amount: t.amount,
      month: t.month,
      note: t.note || "",
      recurring: t.recurring ? "true" : "false",
      frequency: t.frequency || "",
    }));
    const csv = toCSV(rows, CSV_COLUMNS);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="ledger-transactions-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  })
);

// Shared by both the ?preview=true dry-run and the real commit path, so the
// two can never drift: whatever the preview said would happen is exactly
// what the commit does.
//
// Validates every row independently (unchanged behavior — one bad row never
// sinks the whole file) and additionally flags rows whose mode+type+amount+
// month combination already exists for this user, or is repeated elsewhere
// in the same file, as a duplicate. Duplicates are a warning, not an error:
// they're still valid and still get inserted on commit.
async function buildImportPlan(rows, userId) {
  const plan = [];
  const validRows = []; // { line, data }

  for (const row of rows) {
    const result = csvTransactionRowSchema.safeParse(row.values);
    if (!result.success) {
      plan.push({
        line: row.line,
        status: "error",
        error: result.error.issues[0]?.message || "Invalid row.",
      });
      continue;
    }
    validRows.push({ line: row.line, data: result.data });
  }

  // One batched query for existing duplicates rather than one query per row.
  let existingKeys = new Set();
  if (validRows.length) {
    const or = validRows.map(({ data }) => ({
      mode: data.mode,
      type: data.type,
      amount: data.amount,
      month: data.month,
    }));
    const existing = await Transaction.find({ user: userId, $or: or }, "mode type amount month");
    existingKeys = new Set(existing.map((e) => `${e.mode}|${e.type}|${e.amount}|${e.month}`));
  }

  const seenInFile = new Set();
  const toInsert = [];
  for (const { line, data } of validRows) {
    const key = `${data.mode}|${data.type}|${data.amount}|${data.month}`;
    const isDuplicate = existingKeys.has(key) || seenInFile.has(key);
    seenInFile.add(key);
    plan.push({
      line,
      status: "ok",
      mode: data.mode,
      type: data.type,
      amount: data.amount,
      month: data.month,
      duplicate: isDuplicate,
    });
    toInsert.push({ ...data, user: userId });
  }

  const errors = plan.filter((p) => p.status === "error");
  const duplicateCount = plan.filter((p) => p.status === "ok" && p.duplicate).length;
  return { plan, toInsert, errors, duplicateCount };
}

// POST /api/transactions/import — bulk-create entries from a CSV file body.
//
// ?preview=true switches this to a dry run: rows are validated and a
// row-by-row plan is returned (nothing is written to the database), so a
// client can show "12 will be imported, 2 have errors" before the user
// commits — useful for a file they didn't create themselves. Without
// ?preview=true, behavior is exactly what it was before: valid rows are
// inserted, invalid rows are skipped and reported by line number. The only
// addition to the commit response is a new `duplicates` count; existing
// fields (imported, failed, errors) are unchanged.
router.post(
  "/import",
  asyncHandler(async (req, res) => {
    const text = typeof req.body === "string" ? req.body : req.body?.csv;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "No CSV content received." });
    }

    const { header, rows } = parseCSV(text);
    if (rows.length === 0) {
      return res.status(400).json({ error: "The CSV file has no data rows." });
    }
    const required = ["mode", "type", "amount", "month"];
    const missingCols = required.filter((c) => !header.includes(c));
    if (missingCols.length) {
      return res.status(400).json({ error: `CSV is missing required column(s): ${missingCols.join(", ")}` });
    }

    const isPreview = req.query.preview === "true";
    const { plan, toInsert, errors, duplicateCount } = await buildImportPlan(rows, req.userId);

    if (isPreview) {
      return res.json({
        preview: true,
        totalRows: rows.length,
        willImport: toInsert.length,
        failed: errors.length,
        duplicates: duplicateCount,
        plan,
      });
    }

    const created = toInsert.length ? await Transaction.insertMany(toInsert) : [];
    res.status(207).json({
      imported: created.length,
      failed: errors.length,
      duplicates: duplicateCount,
      errors,
    });
  })
);

// POST /api/transactions/generate-recurring — create this month's entries
// from every recurring template (recurring: true) that hasn't already been
// applied to the target month. Safe to call repeatedly for the same month:
// already-generated entries (tracked via `generatedFrom`) are skipped.
router.post(
  "/generate-recurring",
  validateBody(generateRecurringSchema),
  asyncHandler(async (req, res) => {
    const { month } = req.body;
    const templates = await Transaction.find({ user: req.userId, recurring: true });

    const created = [];
    const skipped = [];
    for (const template of templates) {
      if (template.month === month) {
        skipped.push({ type: template.type, reason: "This is the template's own month." });
        continue;
      }
      const alreadyGenerated = await Transaction.exists({
        user: req.userId,
        generatedFrom: template._id,
        month,
      });
      if (alreadyGenerated) {
        skipped.push({ type: template.type, reason: "Already generated for this month." });
        continue;
      }
      const doc = await Transaction.create({
        user: req.userId,
        mode: template.mode,
        type: template.type,
        amount: template.amount,
        month,
        note: template.note,
        recurring: false,
        generatedFrom: template._id,
      });
      created.push(doc);
    }

    res.status(201).json({ created, skipped });
  })
);

// POST /api/transactions — add a new entry
router.post(
  "/",
  validateBody(transactionSchema),
  asyncHandler(async (req, res) => {
    const { mode, type, amount, month, note, recurring, frequency } = req.body;
    const doc = await Transaction.create({ user: req.userId, mode, type, amount, month, note, recurring, frequency });
    res.status(201).json(doc);
  })
);

// PUT /api/transactions/:id — edit an entry
router.put(
  "/:id",
  validateBody(transactionSchema),
  asyncHandler(async (req, res) => {
    const { mode, type, amount, month, note, recurring, frequency } = req.body;
    const doc = await Transaction.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      { user: req.userId, mode, type, amount, month, note, recurring, frequency },
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ error: "Entry not found" });
    res.json(doc);
  })
);

// DELETE /api/transactions/:id — remove an entry
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const doc = await Transaction.findOneAndDelete({ _id: req.params.id, user: req.userId });
    if (!doc) return res.status(404).json({ error: "Entry not found" });
    res.json({ deleted: true });
  })
);

export default router;

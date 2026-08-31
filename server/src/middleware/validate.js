import { z } from "zod";

// Generic middleware factory: validates req.body against a zod schema
// before the route touches Mongoose, so malformed input returns a clean
// 400 with a specific message instead of a schema-cast error or a 500.
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues[0]?.message || "Invalid request body.";
      return res.status(400).json({ error: message });
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) return res.status(400).json({ error: result.error.issues[0]?.message || "Invalid query parameters." });
    req.query = result.data;
    next();
  };
}

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Month must be in YYYY-MM format.");
const pageSchema = z.coerce.number().int().min(1, "page must be at least 1.").default(1);
const limitSchema = z.coerce.number().int().min(1, "limit must be at least 1.").max(500, "limit cannot exceed 500.").default(200);

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(80),
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required."),
  password: z.string().min(1, "Password is required."),
});

// `recurring`/`frequency` are optional and default to off, so existing
// clients that never send them keep working exactly as before. When
// `recurring` is true and no `frequency` is given, it defaults to "monthly"
// (the only supported cadence right now).
export const transactionSchema = z
  .object({
    mode: z.enum(["Income", "Needs", "Savings", "Spending"]),
    type: z.string().trim().min(1, "Type is required."),
    amount: z.number().min(0, "Amount must be zero or greater."),
    month: monthSchema,
    note: z.string().trim().max(500).optional().default(""),
    recurring: z.boolean().optional().default(false),
    frequency: z.enum(["monthly"]).optional(),
  })
  .transform((data) => ({
    ...data,
    frequency: data.recurring ? data.frequency || "monthly" : undefined,
  }));

export const valuationSchema = z.object({
  month: monthSchema,
  instrument: z.string().trim().min(1, "Instrument is required."),
  value: z.number().min(0, "Value must be zero or greater."),
});

export const investmentSchema = z.object({
  fund: z.string().trim().min(1, "Fund is required."),
  type: z.enum(["SIP", "Additional", "Status"]).optional().default("SIP"),
  monthly: z.number().min(0).optional().default(0),
  invested: z.number().min(0, "Invested amount must be zero or greater."),
  currentValue: z.number().min(0, "Current value must be zero or greater."),
  date: z.string().trim().min(1, "Date is required."),
  nav: z.number().min(0).optional(),
  units: z.number().min(0).optional(),
  xirr: z.number().optional(),
  source: z.string().trim().optional().default("Manual entry"),
  assetClass: z.enum(["Equity", "Debt", "Gold", "International", "Other"]).optional().default("Equity"),
  benchmarkReturn: z.number().optional(),
});

// PUT allows partial updates.
export const investmentUpdateSchema = investmentSchema.partial();

// Body for POST /api/transactions/generate-recurring
export const generateRecurringSchema = z.object({
  month: monthSchema,
});

export const budgetSchema = z.object({
  month: monthSchema,
  mode: z.enum(["Income", "Needs", "Savings", "Spending"]),
  type: z.string().trim().min(1, "Type is required."),
  plannedAmount: z.number().min(0, "Planned amount must be zero or greater."),
});

// --- CSV import row validation --------------------------------------------
// Every value coming out of a CSV parser is a string, so this schema
// coerces before validating, then reshapes to match transactionSchema's
// output — used by POST /api/transactions/import to give one specific,
// row-numbered error per bad line instead of failing the whole file.

const csvBoolean = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  const s = v.trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}, z.boolean());

const csvNumber = (message) =>
  z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const trimmed = v.trim();
    if (trimmed === "") return NaN;
    const n = Number(trimmed);
    return Number.isNaN(n) ? NaN : n;
  }, z.number(message ? { error: () => message } : undefined).min(0, message));

export const csvTransactionRowSchema = z
  .object({
    mode: z.enum(["Income", "Needs", "Savings", "Spending"]),
    type: z.string().trim().min(1, "Type is required."),
    amount: csvNumber("Amount must be a number 0 or greater."),
    month: monthSchema,
    note: z.string().trim().optional().default(""),
    recurring: csvBoolean.optional().default(false),
    frequency: z.string().trim().optional().default(""),
  })
  .transform((data) => ({
    mode: data.mode,
    type: data.type,
    amount: data.amount,
    month: data.month,
    note: data.note,
    recurring: data.recurring,
    frequency: data.recurring ? data.frequency || "monthly" : undefined,
  }));

export const transactionListQuerySchema = z.object({
  month: monthSchema.optional(),
  from: monthSchema.optional(),
  to: monthSchema.optional(),
  page: pageSchema.optional(),
  limit: limitSchema.optional(),
}).strict().refine((value) => !(value.month && (value.from || value.to)), { message: "Use month or from/to, not both." }).refine((value) => !value.from || !value.to || value.from <= value.to, { message: "from must not be after to." });

export const investmentListQuerySchema = z.object({
  page: pageSchema.optional(),
  limit: limitSchema.optional(),
}).strict();

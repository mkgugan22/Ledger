import Investment from "../models/Investment.js";
import AutoSipRun from "../models/AutoSipRun.js";

// Monthly auto-SIP
// ----------------
// On the 10th of every month (India time) add one SIP entry of ₹1000 for each of the
// user's funds EXCEPT the LIC MF Consumption fund. If the 10th is a Saturday or Sunday
// the entries are added on the following Monday instead (and dated that Monday).
//
// Safe by construction:
//  * Idempotent  - a unique (user, fund, autoSipMonth) index plus an upsert means
//                  running this any number of times never duplicates an entry.
//  * Catch-up    - if the server was asleep/restarting on the run date, the missed
//                  month is created the next time this runs, dated its run date.
//  * Delete-safe - a per-month AutoSipRun record is written once a month is done,
//                  so an entry you delete later is NOT re-created.
//  * No doubles  - a fund that already has a manual SIP/Additional entry of the same
//                  amount in that month is skipped, so adding it by hand never duplicates.
//  * Scoped      - only users who hold the excluded fund are touched, and only months
//                  from AUTO_SIP_START_MONTH onward are ever generated.
//
// Optional environment overrides (all have working defaults):
//   AUTO_SIP_ENABLED=false            turn the feature off
//   AUTO_SIP_AMOUNT=1000              rupees per fund per month
//   AUTO_SIP_DAY=10                   day of month (1-28); weekends roll to Monday
//   AUTO_SIP_START_MONTH=2026-11      first month to generate
//   AUTO_SIP_EXCLUDED_FUNDS=LIC MF Consumption   comma-separated, case-insensitive match

const TIMEZONE = "Asia/Kolkata";
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const SCHEDULER_INTERVAL_MS = 60 * 60 * 1000; // hourly
const INELIGIBLE_RECHECK_MS = 10 * 60 * 1000;
const DEFAULT_EXCLUDED = "LIC MF Consumption";
const DEFAULT_START_MONTH = "2026-11";
export const AUTO_SIP_SOURCE = "Auto SIP (monthly)";

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalizeName = (value) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();

function getConfig() {
  const flag = process.env.AUTO_SIP_ENABLED;
  const enabled = flag === "true" || (flag !== "false" && process.env.NODE_ENV !== "test");

  const amount = Number(process.env.AUTO_SIP_AMOUNT);
  const day = Number(process.env.AUTO_SIP_DAY);
  const startMonth = process.env.AUTO_SIP_START_MONTH;

  const excludedNames = (process.env.AUTO_SIP_EXCLUDED_FUNDS || DEFAULT_EXCLUDED)
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  return {
    enabled,
    amount: Number.isFinite(amount) && amount > 0 ? amount : 1000,
    day: Number.isInteger(day) && day >= 1 && day <= 28 ? day : 10,
    startMonth: MONTH_RE.test(startMonth || "") ? startMonth : DEFAULT_START_MONTH,
    // "LIC MF Consumption" -> /LIC\s+MF\s+Consumption/i (tolerates extra spaces and
    // longer names such as "LIC MF Consumption Fund - Direct - Growth").
    excluded: excludedNames.map((name) => new RegExp(escapeRegExp(name).replace(/\s+/g, "\\s+"), "i")),
  };
}

// Today's calendar date (YYYY-MM-DD) in India, regardless of the server's own timezone.
export function todayInZone(now = new Date(), timeZone = TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// The date the entries are actually added for a "YYYY-MM" month: the configured day,
// moved forward to Monday when it lands on a Saturday (+2 days) or Sunday (+1 day).
// The weekday of a calendar date is the same everywhere, so UTC is safe here.
export function getRunDate(month, day = 10) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1, day));
  const weekday = date.getUTCDay(); // 0 = Sunday ... 6 = Saturday
  if (weekday === 6) date.setUTCDate(date.getUTCDate() + 2);
  else if (weekday === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

// Every "YYYY-MM" from startMonth up to today whose run date has arrived.
export function getDueMonths(today, { startMonth, day }) {
  const due = [];
  let [year, month] = startMonth.split("-").map(Number);
  for (let i = 0; i < 240; i += 1) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    if (getRunDate(key, day) > today) break;
    due.push(key);
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return due;
}

// The user's distinct funds (with their asset class), split into the excluded
// fund(s) and the ones that should receive the monthly SIP.
async function loadTargets(userId, cfg) {
  const rows = await Investment.find({ user: userId }).select("fund assetClass date").sort({ date: 1 }).lean();
  const funds = new Map();
  for (const row of rows) {
    if (row.fund) funds.set(row.fund, row.assetClass || "Equity");
  }
  const isExcluded = (name) => cfg.excluded.some((re) => re.test(name));
  const names = [...funds.keys()];
  return {
    eligible: names.some(isExcluded),
    targets: names.filter((name) => !isExcluded(name)).map((name) => [name, funds.get(name)]),
  };
}

// Funds (normalised names) where the user already entered the SIP amount by hand
// for this month, so the job must not add it a second time.
async function manualFundsForMonth(userId, month, cfg) {
  const rows = await Investment.find({
    user: userId,
    type: { $in: ["SIP", "Additional"] },
    autoSipMonth: { $exists: false },
    invested: cfg.amount,
    date: { $regex: `^${month}-` },
  }).select("fund").lean();
  return new Set(rows.map((row) => normalizeName(row.fund)));
}

async function insertSipEntry(userId, month, fund, assetClass, runDate, cfg) {
  try {
    const result = await Investment.updateOne(
      { user: userId, fund, autoSipMonth: month },
      {
        $setOnInsert: {
          type: "SIP",
          // 0 on purpose: the "Monthly SIP" card sums this field across rows, so a
          // non-zero value here would inflate it by 1000 every single month.
          monthly: 0,
          invested: cfg.amount,
          currentValue: cfg.amount,
          date: runDate,
          source: AUTO_SIP_SOURCE,
          assetClass,
        },
      },
      { upsert: true }
    );
    return result.upsertedCount || 0;
  } catch (err) {
    if (err?.code === 11000) return 0; // another run created it first - that's fine
    throw err;
  }
}

async function markMonthDone(userId, month, funds) {
  try {
    await AutoSipRun.updateOne({ user: userId, month }, { $setOnInsert: { funds } }, { upsert: true });
  } catch (err) {
    if (err?.code !== 11000) throw err;
  }
}

// The first version of this job started at 2026-10 and had no weekend rule, so it could add
// October rows right next to SIPs the user had already entered by hand. Rows for months BEFORE
// the start month are never wanted; remove them, but only when a manual entry for the same
// fund and month exists (i.e. they are true duplicates). Runs once per user per process.
const cleanedUsers = new Set();

async function retireEarlyDuplicates(userId, cfg) {
  const id = String(userId);
  if (cleanedUsers.has(id)) return 0;

  const early = await Investment.find({ user: userId, autoSipMonth: { $lt: cfg.startMonth } })
    .select("fund autoSipMonth")
    .lean();

  let removed = 0;
  const manualByMonth = new Map();
  for (const row of early) {
    if (!manualByMonth.has(row.autoSipMonth)) {
      manualByMonth.set(row.autoSipMonth, await manualFundsForMonth(userId, row.autoSipMonth, cfg));
    }
    if (manualByMonth.get(row.autoSipMonth).has(normalizeName(row.fund))) {
      await Investment.deleteOne({ _id: row._id, autoSipMonth: row.autoSipMonth });
      removed += 1;
    }
  }
  cleanedUsers.add(id);
  return removed;
}

// Cheap in-process memo so repeated page loads don't re-query once a user is up to date.
const userMemo = new Map();

export async function ensureAutoSipForUser(userId, now = new Date()) {
  const cfg = getConfig();
  if (!cfg.enabled) return { created: 0 };

  const removed = await retireEarlyDuplicates(userId, cfg);

  const months = getDueMonths(todayInZone(now), cfg);
  if (!months.length) return { created: 0, removed }; // before the first run date: nothing to add

  const id = String(userId);
  const latest = months.at(-1);
  const memo = userMemo.get(id);
  if (memo && (memo.done === latest || (memo.retryAfter && memo.retryAfter > now.getTime()))) return { created: 0, removed };

  const finished = new Set(
    (await AutoSipRun.find({ user: userId, month: { $in: months } }).select("month").lean()).map((run) => run.month)
  );
  const pending = months.filter((month) => !finished.has(month));
  if (!pending.length) {
    userMemo.set(id, { done: latest });
    return { created: 0, removed };
  }

  const { eligible, targets } = await loadTargets(userId, cfg);
  if (!eligible || !targets.length) {
    userMemo.set(id, { retryAfter: now.getTime() + INELIGIBLE_RECHECK_MS });
    return { created: 0, removed };
  }

  // Make sure the unique index is built before upserting, so concurrent runs can't duplicate.
  await Promise.all([Investment.init(), AutoSipRun.init()]);

  let created = 0;
  for (const month of pending) {
    const runDate = getRunDate(month, cfg.day);
    const alreadyEntered = await manualFundsForMonth(userId, month, cfg);
    const funds = [];
    for (const [fund, assetClass] of targets) {
      if (alreadyEntered.has(normalizeName(fund))) continue;
      created += await insertSipEntry(userId, month, fund, assetClass, runDate, cfg);
      funds.push(fund);
    }
    await markMonthDone(userId, month, funds);
  }
  userMemo.set(id, { done: latest });
  return { created, removed };
}

let running = false;

export async function runAutoSipForAllUsers(now = new Date()) {
  const cfg = getConfig();
  if (!cfg.enabled || running) return { users: 0, created: 0, removed: 0 };

  running = true;
  try {
    const userIds = await Investment.distinct("user", { fund: { $in: cfg.excluded } });
    let created = 0;
    let removed = 0;
    for (const userId of userIds) {
      try {
        const result = await ensureAutoSipForUser(userId, now);
        created += result.created;
        removed += result.removed || 0;
      } catch (err) {
        console.error(`Auto SIP failed for user ${userId}:`, err.message);
      }
    }
    return { users: userIds.length, created, removed };
  } finally {
    running = false;
  }
}

// Runs once at startup (catches up anything missed while the server was down or
// asleep) and then every hour. Returns a function that stops the timer.
export function startAutoSipScheduler() {
  if (!getConfig().enabled) return () => {};

  const tick = () =>
    runAutoSipForAllUsers()
      .then((result) => {
        if (result.created) console.log(`Auto SIP: added ${result.created} entr${result.created === 1 ? "y" : "ies"}.`);
        if (result.removed) console.log(`Auto SIP: removed ${result.removed} duplicate entr${result.removed === 1 ? "y" : "ies"} from before the start month.`);
      })
      .catch((err) => console.error("Auto SIP run failed:", err.message));

  tick();
  const timer = setInterval(tick, SCHEDULER_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}

import Investment from "../models/Investment.js";
import AutoSipRun from "../models/AutoSipRun.js";

// Monthly auto-SIP
// ----------------
// On the 10th of every month (India time), add one SIP entry of ₹1000 for each
// of the user's funds EXCEPT the LIC MF Consumption fund.
//
// Safe by construction:
//  * Idempotent  - a unique (user, fund, autoSipMonth) index plus an upsert means
//                  running this any number of times never duplicates an entry.
//  * Catch-up    - if the server was asleep/restarting on the 10th, the missed
//                  month is created the next time this runs, still dated the 10th.
//  * Delete-safe - a per-month AutoSipRun record is written once a month is done,
//                  so an entry you delete later is NOT re-created.
//  * Scoped      - only users who actually hold the excluded fund are touched
//                  (that fund is how we recognise your portfolio), and only
//                  months from AUTO_SIP_START_MONTH onward are ever generated.
//
// Optional environment overrides (all have working defaults):
//   AUTO_SIP_ENABLED=false            turn the feature off
//   AUTO_SIP_AMOUNT=1000              rupees per fund per month
//   AUTO_SIP_DAY=10                   day of month (1-28)
//   AUTO_SIP_START_MONTH=2026-10      first month to generate
//   AUTO_SIP_EXCLUDED_FUNDS=LIC MF Consumption   comma-separated, case-insensitive "contains" match

const TIMEZONE = "Asia/Kolkata";
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const SCHEDULER_INTERVAL_MS = 60 * 60 * 1000; // hourly
const INELIGIBLE_RECHECK_MS = 10 * 60 * 1000;
const DEFAULT_EXCLUDED = "LIC MF Consumption";

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
    startMonth: MONTH_RE.test(startMonth || "") ? startMonth : "2026-10",
    // "LIC MF Consumption" -> /LIC\s+MF\s+Consumption/i (tolerates extra spaces and
    // longer names such as "LIC MF Consumption Fund - Direct - Growth").
    excluded: excludedNames.map((name) => new RegExp(escapeRegExp(name).replace(/\s+/g, "\\s+"), "i")),
  };
}

// Today's calendar date (YYYY-MM-DD) in India, regardless of the server's own timezone.
export function todayInZone(now = new Date(), timeZone = TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// Every "YYYY-MM" from startMonth up to today whose run date (the 10th) has arrived.
export function getDueMonths(today, { startMonth, day }) {
  const due = [];
  let [year, month] = startMonth.split("-").map(Number);
  for (let i = 0; i < 240; i += 1) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    if (`${key}-${String(day).padStart(2, "0")}` > today) break;
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

async function insertSipEntry(userId, month, fund, assetClass, cfg) {
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
          date: `${month}-${String(cfg.day).padStart(2, "0")}`,
          source: "Auto SIP (monthly)",
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

async function markMonthDone(userId, month, targets) {
  try {
    await AutoSipRun.updateOne({ user: userId, month }, { $setOnInsert: { funds: targets.map(([name]) => name) } }, { upsert: true });
  } catch (err) {
    if (err?.code !== 11000) throw err;
  }
}

// Cheap in-process memo so repeated page loads don't re-query once a user is up to date.
const userMemo = new Map();

export async function ensureAutoSipForUser(userId, now = new Date()) {
  const cfg = getConfig();
  if (!cfg.enabled) return { created: 0 };

  const months = getDueMonths(todayInZone(now), cfg);
  if (!months.length) return { created: 0 }; // before the first run date: zero DB work

  const id = String(userId);
  const latest = months.at(-1);
  const memo = userMemo.get(id);
  if (memo && (memo.done === latest || (memo.retryAfter && memo.retryAfter > now.getTime()))) return { created: 0 };

  const finished = new Set(
    (await AutoSipRun.find({ user: userId, month: { $in: months } }).select("month").lean()).map((run) => run.month)
  );
  const pending = months.filter((month) => !finished.has(month));
  if (!pending.length) {
    userMemo.set(id, { done: latest });
    return { created: 0 };
  }

  const { eligible, targets } = await loadTargets(userId, cfg);
  if (!eligible || !targets.length) {
    userMemo.set(id, { retryAfter: now.getTime() + INELIGIBLE_RECHECK_MS });
    return { created: 0 };
  }

  // Make sure the unique index is built before upserting, so concurrent runs can't duplicate.
  await Promise.all([Investment.init(), AutoSipRun.init()]);

  let created = 0;
  for (const month of pending) {
    for (const [fund, assetClass] of targets) {
      created += await insertSipEntry(userId, month, fund, assetClass, cfg);
    }
    await markMonthDone(userId, month, targets);
  }
  userMemo.set(id, { done: latest });
  return { created };
}

let running = false;

export async function runAutoSipForAllUsers(now = new Date()) {
  const cfg = getConfig();
  if (!cfg.enabled || running) return { users: 0, created: 0 };
  if (!getDueMonths(todayInZone(now), cfg).length) return { users: 0, created: 0 };

  running = true;
  try {
    const userIds = await Investment.distinct("user", { fund: { $in: cfg.excluded } });
    let created = 0;
    for (const userId of userIds) {
      try {
        created += (await ensureAutoSipForUser(userId, now)).created;
      } catch (err) {
        console.error(`Auto SIP failed for user ${userId}:`, err.message);
      }
    }
    return { users: userIds.length, created };
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
      .then((result) => { if (result.created) console.log(`Auto SIP: added ${result.created} entr${result.created === 1 ? "y" : "ies"}.`); })
      .catch((err) => console.error("Auto SIP run failed:", err.message));

  tick();
  const timer = setInterval(tick, SCHEDULER_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}

import { randomUUID } from "node:crypto";
import Investment from "../models/Investment.js";
import AutoSipRun from "../models/AutoSipRun.js";
import {
  acquireAutoSipSchedulerLock,
  renewAutoSipSchedulerLock,
  releaseAutoSipSchedulerLock,
} from "./autoSipLock.js";
import { buildHolidaySet } from "./autoSipHolidays.js";

// Monthly auto-SIP
// ----------------
// On the 10th of every month (India time) one SIP entry of ₹1000 is due for each of the
// user's first three SIP funds (the LIC MF Consumption fund is excluded). If the 10th is
// a Saturday, a Sunday or an Indian market holiday, the SIP moves to the next working day
// and the entries are dated that day.
//
// Consent: by default (AUTO_SIP_REQUIRE_CONSENT is not "false") nothing is written on its
// own. Once the run date has arrived, the first time the user opens the app it asks
// "I'm adding ₹1000 to these funds - OK?" (getPendingAutoSip). Confirming writes the
// entries (confirmAutoSip); skipping records the month as handled (skipAutoSip). Until the
// user answers, the month stays pending, so a missed day is simply asked about next time.
// Setting AUTO_SIP_REQUIRE_CONSENT=false restores the old silent behaviour (scheduler +
// catch-up), which ensureAutoSipForUser / runAutoSipForAllUsers still implement.
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
//   AUTO_SIP_DAY=10                   day of month (1-28); weekends/holidays roll forward
//   AUTO_SIP_START_MONTH=2026-11      first month to generate
//   AUTO_SIP_EXCLUDED_FUNDS=LIC MF Consumption   comma-separated, case-insensitive match
//   AUTO_SIP_MAX_FUNDS=3              only the user's first N funds (oldest first) get the SIP
//   AUTO_SIP_HOLIDAYS=2027-01-26,...  extra non-working days on top of the built-in list
//   AUTO_SIP_REQUIRE_CONSENT=false    add entries silently instead of asking the user first

const TIMEZONE = "Asia/Kolkata";
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const SCHEDULER_INTERVAL_MS = 60 * 60 * 1000; // hourly
const INELIGIBLE_RECHECK_MS = 10 * 60 * 1000;
const DEFAULT_EXCLUDED = "LIC MF Consumption";
const DEFAULT_START_MONTH = "2026-11";
const DEFAULT_MAX_FUNDS = 3;
const NO_HOLIDAYS = new Set();
export const AUTO_SIP_SOURCE = "Auto SIP (monthly)";

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalizeName = (value) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();

function getConfig() {
  const flag = process.env.AUTO_SIP_ENABLED;
  const enabled = flag === "true" || (flag !== "false" && process.env.NODE_ENV !== "test");

  const amount = Number(process.env.AUTO_SIP_AMOUNT);
  const day = Number(process.env.AUTO_SIP_DAY);
  const startMonth = process.env.AUTO_SIP_START_MONTH;
  const maxFunds = Number(process.env.AUTO_SIP_MAX_FUNDS);

  const excludedNames = (process.env.AUTO_SIP_EXCLUDED_FUNDS || DEFAULT_EXCLUDED)
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  return {
    enabled,
    requireConsent: process.env.AUTO_SIP_REQUIRE_CONSENT !== "false",
    amount: Number.isFinite(amount) && amount > 0 ? amount : 1000,
    day: Number.isInteger(day) && day >= 1 && day <= 28 ? day : 10,
    maxFunds: Number.isInteger(maxFunds) && maxFunds >= 1 ? maxFunds : DEFAULT_MAX_FUNDS,
    holidays: buildHolidaySet(process.env.AUTO_SIP_HOLIDAYS),
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
// moved forward one day at a time while it is a Saturday, a Sunday or one of `holidays`
// (a Set of "YYYY-MM-DD"). So a Saturday 10th becomes Monday the 12th, and a holiday
// Tuesday 10th becomes Wednesday the 11th. With no holidays this is the original
// weekend-only rule. The weekday of a calendar date is the same everywhere, so UTC is safe.
export function getRunDate(month, day = 10, holidays = NO_HOLIDAYS) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1, day));
  for (let i = 0; i < 14; i += 1) {
    const weekday = date.getUTCDay(); // 0 = Sunday ... 6 = Saturday
    const iso = date.toISOString().slice(0, 10);
    if (weekday !== 0 && weekday !== 6 && !holidays.has(iso)) return iso;
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date.toISOString().slice(0, 10);
}

// Every "YYYY-MM" from startMonth up to today whose run date has arrived.
export function getDueMonths(today, { startMonth, day, holidays = NO_HOLIDAYS }) {
  const due = [];
  let [year, month] = startMonth.split("-").map(Number);
  for (let i = 0; i < 240; i += 1) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    if (getRunDate(key, day, holidays) > today) break;
    due.push(key);
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return due;
}

// The user's distinct funds (with their asset class), split into the excluded
// fund(s) and the ones that should receive the monthly SIP.
// Only the user's first `cfg.maxFunds` funds (oldest first, excluded fund not counted) get
// the SIP, so a fund added later never starts receiving it on its own.
async function loadTargets(userId, cfg) {
  const rows = await Investment.find({ user: userId }).select("fund assetClass date").sort({ date: 1 }).lean();
  const funds = new Map();
  for (const row of rows) {
    if (!row.fund) continue;
    const firstDate = funds.get(row.fund)?.firstDate ?? String(row.date || "");
    funds.set(row.fund, { assetClass: row.assetClass || "Equity", firstDate });
  }
  const isExcluded = (name) => cfg.excluded.some((re) => re.test(name));
  const names = [...funds.keys()];
  const targets = names
    .filter((name) => !isExcluded(name))
    .sort((a, b) => funds.get(a).firstDate.localeCompare(funds.get(b).firstDate) || a.localeCompare(b))
    .slice(0, cfg.maxFunds)
    .map((name) => [name, funds.get(name).assetClass]);
  return { eligible: names.some(isExcluded), targets };
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

// ---------------------------------------------------------------------------
// Consent flow: the app asks first, then writes.
// ---------------------------------------------------------------------------

async function finishedMonths(userId, months) {
  const runs = await AutoSipRun.find({ user: userId, month: { $in: months } }).select("month").lean();
  return new Set(runs.map((run) => run.month));
}

// Months whose run date has arrived and that the user has not yet answered, each with the
// funds that would receive the SIP. A month where every fund already has that month's SIP
// entered by hand is closed here (there is nothing to ask).
async function listPendingMonths(userId, cfg, now) {
  await retireEarlyDuplicates(userId, cfg);

  const months = getDueMonths(todayInZone(now), cfg);
  if (!months.length) return [];

  const finished = await finishedMonths(userId, months);
  const open = months.filter((month) => !finished.has(month));
  if (!open.length) return [];

  const { eligible, targets } = await loadTargets(userId, cfg);
  if (!eligible || !targets.length) return [];

  const pending = [];
  for (const month of open) {
    const alreadyEntered = await manualFundsForMonth(userId, month, cfg);
    const funds = targets.filter(([fund]) => !alreadyEntered.has(normalizeName(fund)));
    if (!funds.length) {
      await markMonthDone(userId, month, []);
      continue;
    }
    pending.push({ month, runDate: getRunDate(month, cfg.day, cfg.holidays), amount: cfg.amount, funds });
  }
  return pending;
}

// What the app should ask about right now: [] when nothing is due (or consent mode is off).
export async function getPendingAutoSip(userId, now = new Date()) {
  const cfg = getConfig();
  if (!cfg.enabled || !cfg.requireConsent) return [];
  const pending = await listPendingMonths(userId, cfg, now);
  return pending.map(({ month, runDate, amount, funds }) => ({
    month,
    runDate,
    amount,
    total: amount * funds.length,
    funds: funds.map(([fund, assetClass]) => ({ fund, assetClass })),
  }));
}

// The user said yes. The funds are recomputed here, never taken from the client, and the
// unique index + upsert make a double click or a second tab harmless.
export async function confirmAutoSip(userId, month, now = new Date()) {
  const cfg = getConfig();
  if (!cfg.enabled || !cfg.requireConsent) return { ok: false, created: [] };

  const item = (await listPendingMonths(userId, cfg, now)).find((entry) => entry.month === month);
  if (!item) return { ok: false, created: [] };

  await Promise.all([Investment.init(), AutoSipRun.init()]);
  for (const [fund, assetClass] of item.funds) {
    await insertSipEntry(userId, month, fund, assetClass, item.runDate, cfg);
  }
  const names = item.funds.map(([fund]) => fund);
  await markMonthDone(userId, month, names);

  const created = await Investment.find({ user: userId, autoSipMonth: month, fund: { $in: names } }).lean();
  return { ok: true, created };
}

// The user said no for this month: remember it so they are not asked again.
export async function skipAutoSip(userId, month, now = new Date()) {
  const cfg = getConfig();
  if (!cfg.enabled || !cfg.requireConsent) return { ok: false };

  const item = (await listPendingMonths(userId, cfg, now)).find((entry) => entry.month === month);
  if (!item) return { ok: false };

  await markMonthDone(userId, month, []);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Silent mode (AUTO_SIP_REQUIRE_CONSENT=false): scheduler + catch-up write directly.
// ---------------------------------------------------------------------------

export async function ensureAutoSipForUser(userId, now = new Date()) {
  const cfg = getConfig();
  if (!cfg.enabled || cfg.requireConsent) return { created: 0 };

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
    const runDate = getRunDate(month, cfg.day, cfg.holidays);
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
const LOCK_RENEW_INTERVAL_MS = 5 * 60 * 1000;

export async function runAutoSipForAllUsers(now = new Date()) {
  const cfg = getConfig();
  if (!cfg.enabled || cfg.requireConsent || running) return { users: 0, created: 0, removed: 0 };

  running = true;
  const lockOwnerId = randomUUID();
  let lockAcquired = false;
  let renewTimer;
  try {
    lockAcquired = Boolean(await acquireAutoSipSchedulerLock(lockOwnerId));
    if (!lockAcquired) {
      return { users: 0, created: 0, removed: 0, locked: true };
    }

    // A long catch-up run may span many users. Renew the lease periodically so
    // another instance does not start a duplicate global scan while this one
    // is still processing. Per-user/month unique indexes remain the final guard.
    renewTimer = setInterval(() => {
      renewAutoSipSchedulerLock(lockOwnerId).catch((err) => {
        console.error("Auto SIP scheduler lease renewal failed:", err.message);
      });
    }, LOCK_RENEW_INTERVAL_MS);
    renewTimer.unref();

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
    if (renewTimer) clearInterval(renewTimer);
    if (lockAcquired) {
      try {
        await releaseAutoSipSchedulerLock(lockOwnerId);
      } catch (err) {
        console.error("Auto SIP scheduler lease release failed:", err.message);
      }
    }
    running = false;
  }
}

// Silent mode only: runs once at startup (catches up anything missed while the server was
// down or asleep) and then every hour. In consent mode nothing is written without the user's
// OK, so there is no timer. Returns a function that stops the timer.
export function startAutoSipScheduler() {
  const cfg = getConfig();
  if (!cfg.enabled || cfg.requireConsent) return () => {};

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

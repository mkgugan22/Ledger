import { beforeEach, describe, expect, it, vi } from "vitest";

// The two models are replaced by a tiny in-memory fake that understands just the queries
// autoSip.js issues, so this runs in CI without MongoDB (same as src/lib/payslip.test.js).
const db = vi.hoisted(() => ({ inv: [], runs: [], nextId: 1 }));

vi.mock("../models/Investment.js", () => {
  const same = (a, b) => String(a) === String(b);
  const matches = (row, filter) =>
    Object.entries(filter).every(([key, cond]) => {
      const value = row[key];
      if (cond && typeof cond === "object" && !(cond instanceof RegExp)) {
        if ("$in" in cond) return cond.$in.some((c) => (c instanceof RegExp ? c.test(value) : same(c, value)));
        if ("$exists" in cond) return cond.$exists === (value !== undefined);
        if ("$regex" in cond) return new RegExp(cond.$regex).test(String(value ?? ""));
        if ("$lt" in cond) return typeof value === "string" && value < cond.$lt;
      }
      return same(value, cond);
    });
  const query = (rows) => {
    const q = {
      select: () => q,
      sort: () => { rows = [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date))); return q; },
      lean: async () => rows.map((r) => ({ ...r })),
    };
    return q;
  };
  return {
    default: {
      init: async () => {},
      find: (filter) => query(db.inv.filter((row) => matches(row, filter))),
      distinct: async (_field, filter) => [...new Set(db.inv.filter((row) => matches(row, filter)).map((row) => String(row.user)))],
      deleteOne: async (filter) => {
        const index = db.inv.findIndex((row) => matches(row, filter));
        if (index >= 0) db.inv.splice(index, 1);
        return { deletedCount: index >= 0 ? 1 : 0 };
      },
      updateOne: async (filter, update) => {
        if (db.inv.some((row) => same(row.user, filter.user) && row.fund === filter.fund && row.autoSipMonth === filter.autoSipMonth)) return { upsertedCount: 0 };
        db.inv.push({ _id: db.nextId++, user: filter.user, fund: filter.fund, autoSipMonth: filter.autoSipMonth, ...update.$setOnInsert });
        return { upsertedCount: 1 };
      },
    },
  };
});

vi.mock("../models/AutoSipRun.js", () => ({
  default: {
    init: async () => {},
    find: (filter) => {
      const rows = db.runs.filter((r) => String(r.user) === String(filter.user) && filter.month.$in.includes(r.month));
      const q = { select: () => q, lean: async () => rows.map((r) => ({ ...r })) };
      return q;
    },
    updateOne: async (filter, update) => {
      if (!db.runs.some((r) => String(r.user) === String(filter.user) && r.month === filter.month)) db.runs.push({ user: filter.user, month: filter.month, ...update.$setOnInsert });
      return {};
    },
  },
}));

const LIC = "LIC MF Consumption Fund - Direct Plan - Growth";
const manual = (user, fund, extra = {}) => ({ _id: db.nextId++, user, fund, type: "SIP", monthly: 1000, invested: 5000, currentValue: 6000, date: "2026-09-05", assetClass: "Equity", source: "Manual entry", ...extra });
const seedFour = (user = "u1") => db.inv.push(manual(user, LIC), manual(user, "Fund B"), manual(user, "Fund C", { assetClass: "Debt" }), manual(user, "Fund D"));
const autoRows = () => db.inv.filter((row) => row.autoSipMonth);
const at = (iso) => new Date(iso);

let svc;
beforeEach(async () => {
  db.inv.length = 0; db.runs.length = 0; db.nextId = 1;
  process.env.AUTO_SIP_ENABLED = "true";
  for (const key of ["AUTO_SIP_START_MONTH", "AUTO_SIP_AMOUNT", "AUTO_SIP_DAY", "AUTO_SIP_EXCLUDED_FUNDS"]) delete process.env[key];
  vi.resetModules(); // fresh in-process memos, like a server restart
  svc = await import("./autoSip.js");
});

describe("run date (weekend rolls to Monday)", () => {
  it("moves a Saturday 10th to Monday the 12th and a Sunday 10th to Monday the 11th", () => {
    expect(svc.getRunDate("2026-10", 10)).toBe("2026-10-12"); // 10 Oct 2026 is a Saturday
    expect(svc.getRunDate("2027-01", 10)).toBe("2027-01-11"); // 10 Jan 2027 is a Sunday
  });

  it("keeps a weekday 10th as is", () => {
    expect(svc.getRunDate("2026-11", 10)).toBe("2026-11-10"); // Tuesday
    expect(svc.getRunDate("2026-12", 10)).toBe("2026-12-10"); // Thursday
    expect(svc.getRunDate("2027-02", 10)).toBe("2027-02-10"); // Wednesday
  });

  it("never lands on a weekend and stays within 10th-12th for years of months", () => {
    for (let year = 2026; year <= 2032; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const key = `${year}-${String(month).padStart(2, "0")}`;
        const run = svc.getRunDate(key, 10);
        const weekday = new Date(`${run}T00:00:00Z`).getUTCDay();
        expect([1, 2, 3, 4, 5]).toContain(weekday);
        expect(run >= `${key}-10` && run <= `${key}-12`).toBe(true);
      }
    }
  });

  it("uses India time, not the server's UTC date", () => {
    expect(svc.todayInZone(at("2026-11-09T18:29:00Z"))).toBe("2026-11-09");
    expect(svc.todayInZone(at("2026-11-09T18:31:00Z"))).toBe("2026-11-10");
  });

  it("lists due months only once their run date has arrived", () => {
    const cfg = { startMonth: "2026-11", day: 10 };
    expect(svc.getDueMonths("2026-11-09", cfg)).toEqual([]);
    expect(svc.getDueMonths("2026-11-10", cfg)).toEqual(["2026-11"]);
    expect(svc.getDueMonths("2027-01-10", cfg)).toEqual(["2026-11", "2026-12"]); // Sunday: not yet
    expect(svc.getDueMonths("2027-01-11", cfg)).toEqual(["2026-11", "2026-12", "2027-01"]); // Monday
    expect(svc.getDueMonths("2026-10-11", { startMonth: "2026-10", day: 10 })).toEqual([]);
    expect(svc.getDueMonths("2026-10-12", { startMonth: "2026-10", day: 10 })).toEqual(["2026-10"]);
  });
});

describe("ensureAutoSipForUser", () => {
  it("adds nothing in October 2026 (feature starts in November)", async () => {
    seedFour();
    expect((await svc.ensureAutoSipForUser("u1", at("2026-10-12T05:00:00Z"))).created).toBe(0);
    expect(autoRows()).toHaveLength(0);
  });

  it("on 10 Nov 2026 adds exactly 3 x Rs1000 SIP rows dated that day, skipping LIC", async () => {
    seedFour();
    expect((await svc.ensureAutoSipForUser("u1", at("2026-11-10T05:00:00Z"))).created).toBe(3);
    const rows = autoRows();
    expect(rows.map((r) => r.fund).sort()).toEqual(["Fund B", "Fund C", "Fund D"]);
    for (const row of rows) {
      expect(row).toMatchObject({ type: "SIP", invested: 1000, currentValue: 1000, monthly: 0, date: "2026-11-10", autoSipMonth: "2026-11", source: "Auto SIP (monthly)" });
    }
    expect(rows.find((r) => r.fund === "Fund C").assetClass).toBe("Debt");
  });

  it("waits until Monday when the 10th is a Sunday (Jan 2027), then dates the rows that Monday", async () => {
    seedFour();
    await svc.ensureAutoSipForUser("u1", at("2026-12-20T05:00:00Z")); // December done
    const afterDec = autoRows().length;
    expect((await svc.ensureAutoSipForUser("u1", at("2027-01-10T10:00:00Z"))).created).toBe(0); // Sunday in IST
    expect(autoRows()).toHaveLength(afterDec);
    expect((await svc.ensureAutoSipForUser("u1", at("2027-01-10T19:00:00Z"))).created).toBe(3); // 00:30 IST Monday
    expect(autoRows().filter((r) => r.autoSipMonth === "2027-01").map((r) => r.date)).toEqual(["2027-01-11", "2027-01-11", "2027-01-11"]);
  });

  it("is idempotent, even after a server restart", async () => {
    seedFour();
    await svc.ensureAutoSipForUser("u1", at("2026-11-10T05:00:00Z"));
    await svc.ensureAutoSipForUser("u1", at("2026-11-10T06:00:00Z"));
    vi.resetModules(); svc = await import("./autoSip.js");
    await svc.ensureAutoSipForUser("u1", at("2026-11-10T07:00:00Z"));
    expect(autoRows()).toHaveLength(3);
  });

  it("does not re-create an entry the user deleted", async () => {
    seedFour();
    await svc.ensureAutoSipForUser("u1", at("2026-11-10T05:00:00Z"));
    db.inv.splice(db.inv.findIndex((x) => x.autoSipMonth && x.fund === "Fund B"), 1);
    vi.resetModules(); svc = await import("./autoSip.js");
    expect((await svc.ensureAutoSipForUser("u1", at("2026-11-20T05:00:00Z"))).created).toBe(0);
    expect(autoRows()).toHaveLength(2);
  });

  it("skips a fund the user already entered by hand that month (SIP or Additional, any name casing)", async () => {
    seedFour();
    db.inv.push(
      manual("u1", "Fund B", { type: "SIP", invested: 1000, date: "2026-11-03" }),
      manual("u1", "fund c", { type: "Additional", invested: 1000, date: "2026-11-09" }),
    );
    expect((await svc.ensureAutoSipForUser("u1", at("2026-11-10T05:00:00Z"))).created).toBe(1);
    expect(autoRows().map((r) => r.fund)).toEqual(["Fund D"]);
  });

  it("still adds the SIP when the manual entry is a different amount, a Status row, or another month", async () => {
    seedFour();
    db.inv.push(
      manual("u1", "Fund B", { type: "Additional", invested: 50000, date: "2026-11-02" }),
      manual("u1", "Fund C", { type: "Status", invested: 1000, date: "2026-11-02" }),
      manual("u1", "Fund D", { type: "SIP", invested: 1000, date: "2026-10-10" }),
    );
    expect((await svc.ensureAutoSipForUser("u1", at("2026-11-10T05:00:00Z"))).created).toBe(3);
  });

  it("never touches a user who does not hold the LIC fund", async () => {
    db.inv.push(manual("stranger", "Some Fund"), manual("stranger", "Other Fund"));
    expect((await svc.ensureAutoSipForUser("stranger", at("2026-11-10T05:00:00Z"))).created).toBe(0);
    expect(autoRows()).toHaveLength(0);
  });

  it("respects AUTO_SIP_ENABLED=false", async () => {
    process.env.AUTO_SIP_ENABLED = "false";
    seedFour();
    expect((await svc.ensureAutoSipForUser("u1", at("2026-11-10T05:00:00Z"))).created).toBe(0);
  });
});

describe("clean-up of October rows made by the first version", () => {
  it("removes pre-start auto rows only where a manual entry for that fund and month exists", async () => {
    seedFour();
    db.inv.push(
      { _id: db.nextId++, user: "u1", fund: "Fund B", type: "SIP", invested: 1000, currentValue: 1000, date: "2026-10-10", autoSipMonth: "2026-10", source: "Auto SIP (monthly)" },
      { _id: db.nextId++, user: "u1", fund: "Fund C", type: "SIP", invested: 1000, currentValue: 1000, date: "2026-10-10", autoSipMonth: "2026-10", source: "Auto SIP (monthly)" },
      { _id: db.nextId++, user: "u1", fund: "Fund D", type: "SIP", invested: 1000, currentValue: 1000, date: "2026-10-10", autoSipMonth: "2026-10", source: "Auto SIP (monthly)" },
      manual("u1", "Fund B", { invested: 1000, date: "2026-10-10" }),
      manual("u1", "Fund C", { type: "Additional", invested: 1000, date: "2026-10-10" }),
    );
    const result = await svc.ensureAutoSipForUser("u1", at("2026-10-12T05:00:00Z"));
    expect(result.removed).toBe(2);
    expect(autoRows().map((r) => r.fund)).toEqual(["Fund D"]); // no manual twin, so it stays
    expect(db.inv.filter((r) => !r.autoSipMonth && r.date === "2026-10-10")).toHaveLength(2); // manual rows untouched
  });

  it("leaves auto rows from the start month onward alone", async () => {
    seedFour();
    await svc.ensureAutoSipForUser("u1", at("2026-11-10T05:00:00Z"));
    db.inv.push(manual("u1", "Fund B", { invested: 1000, date: "2026-11-10" }));
    vi.resetModules(); svc = await import("./autoSip.js");
    expect((await svc.ensureAutoSipForUser("u1", at("2026-11-11T05:00:00Z"))).removed).toBe(0);
    expect(autoRows()).toHaveLength(3);
  });
});

describe("runAutoSipForAllUsers", () => {
  it("processes only users who hold the LIC fund", async () => {
    seedFour("u1"); seedFour("u2");
    db.inv.push(manual("stranger", "Some Fund"));
    expect(await svc.runAutoSipForAllUsers(at("2026-11-10T05:00:00Z"))).toEqual({ users: 2, created: 6, removed: 0 });
    expect(db.inv.filter((x) => x.user === "stranger" && x.autoSipMonth)).toHaveLength(0);
  });
});

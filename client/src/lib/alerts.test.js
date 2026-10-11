import { describe, expect, it } from "vitest";
import { buildAlerts } from "./alerts.js";

const base = { month: "2026-10", transactions: [], budgets: [] };
const noEntries = (alerts) => alerts.some((a) => a.text.startsWith("No entries have been recorded"));

describe("buildAlerts: 'No entries' reminder", () => {
  it("still shows when nothing at all was logged for the month", () => {
    expect(noEntries(buildAlerts({ ...base, investments: [] }))).toBe(true);
  });

  it("goes away once the user adds an investment entry dated in that month", () => {
    const investments = [{ fund: "Fund B", type: "SIP", date: "2026-10-10", invested: 1000 }];
    expect(noEntries(buildAlerts({ ...base, investments }))).toBe(false);
  });

  it("is not silenced by auto-SIP rows, so the reminder to log income/spending still fires", () => {
    const investments = [{ fund: "Fund B", type: "SIP", date: "2026-11-10", invested: 1000, autoSipMonth: "2026-11" }];
    expect(noEntries(buildAlerts({ ...base, month: "2026-11", investments }))).toBe(true);
  });

  it("is not silenced by an investment from a different month", () => {
    const investments = [{ fund: "Fund B", type: "SIP", date: "2026-09-10", invested: 1000 }];
    expect(noEntries(buildAlerts({ ...base, investments }))).toBe(true);
  });

  it("is silenced by a normal transaction as before", () => {
    const transactions = [{ month: "2026-10", mode: "Needs", type: "Rent", amount: 100 }];
    expect(noEntries(buildAlerts({ ...base, transactions, investments: [] }))).toBe(false);
  });
});

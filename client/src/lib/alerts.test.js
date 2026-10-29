import { describe, expect, it } from "vitest";
import { buildAlerts, buildObligationAlerts } from "./alerts.js";

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

describe("obligation alerts", () => {
  const today = "2026-10-29";

  it("adds nothing when there are no bills or debts (existing behaviour)", () => {
    expect(buildObligationAlerts({ bills: [], debts: [], today })).toEqual([]);
    const transactions = [{ month: "2026-10", mode: "Needs", type: "Rent", amount: 100 }];
    expect(buildAlerts({ ...base, transactions, today })).toEqual([]);
  });

  it("flags a single overdue bill with how late it is", () => {
    const bills = [{ name: "Rent", amount: 12000, dueDate: "2026-10-26" }];
    const [alert] = buildObligationAlerts({ bills, today });
    expect(alert.kind).toBe("danger");
    expect(alert.text).toBe("Rent is overdue by 3 days (₹12,000).");
  });

  it("flags bills due within 7 days and ignores later or paid ones", () => {
    const bills = [
      { name: "Power", amount: 1500, dueDate: "2026-10-29" },
      { name: "Phone", amount: 500, dueDate: "2026-12-01" },
      { name: "Gas", amount: 700, dueDate: "2026-10-30", status: "paid" },
    ];
    const alerts = buildObligationAlerts({ bills, today });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].text).toBe("Power is due today (₹1,500).");
  });

  it("summarises several overdue bills in one alert", () => {
    const bills = ["A", "B", "C", "D"].map((name) => ({ name, amount: 100, dueDate: "2026-10-01" }));
    const [alert] = buildObligationAlerts({ bills, today });
    expect(alert.text).toBe("4 bills are overdue (₹400): A, B, C, +1 more.");
  });

  it("flags a debt payment due soon but not a stale past date", () => {
    const debts = [
      { name: "Car loan", outstandingAmount: 5, minimumPayment: 8000, dueDate: "2026-10-31" },
      { name: "Old card", outstandingAmount: 5, dueDate: "2026-01-01" },
    ];
    const alerts = buildObligationAlerts({ debts, today });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].text).toBe("Car loan payment is due in 2 days (minimum ₹8,000).");
  });

  it("puts them ahead of the existing alerts without dropping any", () => {
    const bills = [{ name: "Rent", amount: 100, dueDate: "2026-10-01" }];
    const alerts = buildAlerts({ ...base, investments: [], bills, today });
    expect(alerts[0].text).toMatch(/Rent is overdue/);
    expect(alerts.some((a) => a.text.startsWith("No entries have been recorded"))).toBe(true);
  });
});

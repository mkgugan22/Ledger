import { describe, expect, it } from "vitest";
import { summarizeInvestments } from "./ledgerData.js";

describe("summarizeInvestments (what Ledger AI is told about your funds)", () => {
  it("adds contributions made after the latest snapshot, matching the app's numbers", () => {
    const { totals, funds } = summarizeInvestments([
      { fund: "Fund B", type: "Status", date: "2026-09-01", invested: 20000, currentValue: 25000, xirr: 12 },
      { fund: "Fund B", type: "SIP", date: "2026-10-10", invested: 1000, currentValue: 1000, monthly: 0 },
      { fund: "Fund C", type: "SIP", date: "2026-10-10", invested: 1000, currentValue: 1000, monthly: 1000 },
    ]);
    expect(funds.find((f) => f.fund === "Fund B")).toMatchObject({ invested: 21000, currentValue: 26000, gain: 5000, xirr: 12 });
    expect(funds.find((f) => f.fund === "Fund C")).toMatchObject({ invested: 1000, currentValue: 1000, monthly: 1000 });
    expect(totals).toMatchObject({ invested: 22000, currentValue: 27000, monthly: 1000 });
  });

  it("ignores contributions dated on or before the snapshot", () => {
    const { totals } = summarizeInvestments([
      { fund: "Fund B", type: "Status", date: "2026-09-01", invested: 20000, currentValue: 25000 },
      { fund: "Fund B", type: "SIP", date: "2026-09-01", invested: 1000, currentValue: 1000 },
    ]);
    expect(totals).toMatchObject({ invested: 20000, currentValue: 25000 });
  });
});

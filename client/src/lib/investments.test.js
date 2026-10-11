import { describe, expect, it } from "vitest";
import { buildFundPositions, sumFundPositions } from "./investments.js";

const status = (fund, date, invested, currentValue, extra = {}) => ({ fund, type: "Status", date, invested, currentValue, ...extra });
const sip = (fund, date, invested, extra = {}) => ({ fund, type: "SIP", date, invested, currentValue: invested, monthly: 0, ...extra });

describe("buildFundPositions", () => {
  it("adds money put in after the latest snapshot on top of it (the 'reflects nowhere' bug)", () => {
    const [p] = buildFundPositions([
      status("Fund B", "2026-09-01", 20000, 25000, { units: 100, xirr: 12 }),
      sip("Fund B", "2026-10-10", 1000),
    ]);
    expect(p).toMatchObject({ invested: 21000, current: 26000, gain: 5000, addedSince: 1000, asOf: "2026-09-01", units: 100, xirr: 12 });
  });

  it("does not let a later contribution replace the fund's value", () => {
    const rows = [status("Fund B", "2026-09-01", 20000, 25000), sip("Fund B", "2026-10-10", 1000)];
    expect(sumFundPositions(buildFundPositions(rows)).current).toBe(26000); // was 1000 on the dashboard
  });

  it("treats a contribution dated on or before the snapshot as already included", () => {
    const [p] = buildFundPositions([
      status("Fund B", "2026-09-01", 20000, 25000),
      sip("Fund B", "2026-09-01", 1000),
      sip("Fund B", "2026-08-10", 1000),
    ]);
    expect(p).toMatchObject({ invested: 20000, current: 25000, addedSince: 0 });
  });

  it("uses only the newest snapshot, and counts contributions after that one", () => {
    const [p] = buildFundPositions([
      status("Fund B", "2026-08-01", 10000, 11000),
      sip("Fund B", "2026-08-20", 1000),
      status("Fund B", "2026-09-01", 12000, 13500),
      sip("Fund B", "2026-10-10", 1000),
    ]);
    expect(p).toMatchObject({ invested: 13000, current: 14500, addedSince: 1000, asOf: "2026-09-01" });
  });

  it("sums every contribution when a fund has no snapshot yet (unchanged behaviour)", () => {
    const [p] = buildFundPositions([sip("Fund C", "2026-08-10", 1000, { monthly: 1000 }), sip("Fund C", "2026-09-10", 1000, { monthly: 1000 })]);
    expect(p).toMatchObject({ invested: 2000, current: 2000, monthly: 2000, addedSince: 0, asOf: null });
  });

  it("keeps funds separate and ignores rows without a fund name", () => {
    const positions = buildFundPositions([sip("A", "2026-10-10", 500), sip("B", "2026-10-10", 700), { type: "SIP", invested: 9 }]);
    expect(positions.map((p) => [p.fund, p.invested]).sort()).toEqual([["A", 500], ["B", 700]]);
  });

  it("works with the legacy 'amount' field and an empty list", () => {
    expect(buildFundPositions([{ fund: "A", type: "SIP", date: "2026-01-01", amount: 300 }])[0]).toMatchObject({ invested: 300, current: 300 });
    expect(buildFundPositions()).toEqual([]);
  });
});

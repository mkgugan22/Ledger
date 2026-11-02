import { describe, expect, it } from "vitest";
import { describeDelta, percentChange, previousMonth, totalsForMonth } from "./deltas.js";

describe("previousMonth", () => {
  it("steps back one month", () => expect(previousMonth("2026-11")).toBe("2026-10"));
  it("wraps across a year boundary", () => expect(previousMonth("2026-01")).toBe("2025-12"));
  it("rejects malformed input", () => {
    expect(previousMonth("")).toBe("");
    expect(previousMonth(undefined)).toBe("");
    expect(previousMonth("2026-13")).toBe("");
    expect(previousMonth("nope")).toBe("");
  });
});

describe("percentChange", () => {
  it("computes growth and decline", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
  });
  it("returns null without a baseline", () => {
    expect(percentChange(100, 0)).toBeNull();
    expect(percentChange(100, undefined)).toBeNull();
    expect(percentChange(NaN, 10)).toBeNull();
  });
});

describe("totalsForMonth", () => {
  it("sums by mode for the given month only", () => {
    const tx = [
      { month: "2026-10", mode: "Income", amount: 1000 },
      { month: "2026-10", mode: "Needs", amount: "200" },
      { month: "2026-09", mode: "Income", amount: 999 },
      { month: "2026-10", mode: "Other", amount: 5 },
    ];
    expect(totalsForMonth(tx, "2026-10")).toEqual({ Income: 1000, Needs: 200, Savings: 0, Spending: 0 });
  });
  it("tolerates missing input", () => {
    expect(totalsForMonth(undefined, "2026-10").Income).toBe(0);
  });
});

describe("describeDelta", () => {
  it("is hidden when there is no previous month data", () => {
    expect(describeDelta("Income", 500, 0)).toBeNull();
  });
  it("treats rising income as good and rising spending as bad", () => {
    expect(describeDelta("Income", 120, 100)).toEqual({ arrow: "↑", word: "Up", text: "20%", tone: "good" });
    expect(describeDelta("Spending", 120, 100)).toEqual({ arrow: "↑", word: "Up", text: "20%", tone: "bad" });
  });
  it("treats falling spending as good", () => {
    expect(describeDelta("Needs", 80, 100)).toEqual({ arrow: "↓", word: "Down", text: "20%", tone: "good" });
  });
  it("reports tiny moves as no change", () => {
    expect(describeDelta("Savings", 100.2, 100)).toEqual({ arrow: "→", word: "", text: "No change", tone: "flat" });
  });
});

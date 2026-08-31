import { describe, expect, it } from "vitest";
import { computeBudgetComparison } from "./budget.js";

describe("computeBudgetComparison", () => {
  it("shows both planned categories and unbudgeted actual spending", () => {
    expect(computeBudgetComparison(
      [{ mode: "Needs", type: "Rent", plannedAmount: 10000 }],
      [{ mode: "Needs", type: "Rent", amount: 9500 }, { mode: "Spending", type: "Dining", amount: 500 }]
    )).toEqual([
      { mode: "Needs", type: "Rent", planned: 10000, actual: 9500, remaining: 500 },
      { mode: "Spending", type: "Dining", planned: 0, actual: 500, remaining: -500 },
    ]);
  });
});

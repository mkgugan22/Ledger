import { describe, expect, it } from "vitest";
import { buildSipScenarios, calculateSipFutureValue } from "./calculators.js";

describe("SIP calculator", () => {
  it("returns a deterministic monthly SIP projection", () => {
    const result = calculateSipFutureValue(5000, 10, 5);

    expect(result.contribution).toBe(300000);
    expect(result.futureValue).toBeGreaterThan(result.contribution);
    expect(result.gain).toBeCloseTo(result.futureValue - result.contribution, 2);
  });

  it("creates three non-guaranteed return scenarios", () => {
    const result = buildSipScenarios(5000, 5);

    expect(result.scenarios.map((scenario) => scenario.annualRate)).toEqual([8, 10, 12]);
    expect(result.methodology).toMatch(/not guaranteed/i);
  });
});

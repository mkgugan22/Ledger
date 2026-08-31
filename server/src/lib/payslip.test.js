import { describe, expect, it } from "vitest";
import { extractPayslipDetails } from "./payslip.js";

describe("extractPayslipDetails", () => {
  it("uses the net salary rather than a gross pay figure", () => {
    const result = extractPayslipDetails("Gross salary Rs 75,000. Net Pay: ₹58,420.50. Salary for August 2026", "2026-01");
    expect(result.entry).toMatchObject({ mode: "Income", type: "Salary", amount: 58420.5, month: "2026-08" });
  });

  it("does not guess when a salary label is missing", () => {
    expect(extractPayslipDetails("Invoice total 20,000", "2026-08")).toEqual({ found: false, entry: null });
  });
});

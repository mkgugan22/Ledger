import { describe, expect, it } from "vitest";
import {
  addMonthsClamped,
  applyDebtPayment,
  classifyDue,
  daysBetween,
  debtHealthScore,
  debtsDueSoon,
  defaultBillEntryType,
  findSimilarEntry,
  markBillPaidPatch,
  summarizeBills,
  totalDebtOutstanding,
} from "./obligations.js";

describe("dates", () => {
  it("counts whole days, including across month and year ends", () => {
    expect(daysBetween("2026-10-29", "2026-10-31")).toBe(2);
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(daysBetween("2026-10-29", "2026-10-26")).toBe(-3);
    expect(daysBetween("2026-10-29", "nope")).toBeNaN();
  });

  it("adds a month and clamps to the end of shorter months", () => {
    expect(addMonthsClamped("2026-10-15")).toBe("2026-11-15");
    expect(addMonthsClamped("2026-01-31")).toBe("2026-02-28");
    expect(addMonthsClamped("2028-01-31")).toBe("2028-02-29");
    expect(addMonthsClamped("2026-12-10")).toBe("2027-01-10");
  });

  it("returns an invalid date unchanged instead of corrupting it", () => {
    expect(addMonthsClamped("2026-02-31")).toBe("2026-02-31");
    expect(addMonthsClamped("")).toBe("");
  });

  it("classifies due dates", () => {
    expect(classifyDue("2026-10-28", "2026-10-29").state).toBe("overdue");
    expect(classifyDue("2026-10-29", "2026-10-29").state).toBe("soon");
    expect(classifyDue("2026-11-05", "2026-10-29").state).toBe("soon");
    expect(classifyDue("2026-11-06", "2026-10-29").state).toBe("later");
    expect(classifyDue(undefined, "2026-10-29").state).toBe("none");
  });
});

describe("bills", () => {
  const today = "2026-10-29";
  const bills = [
    { id: "1", name: "Rent", amount: 12000, dueDate: "2026-10-25" },
    { id: "2", name: "Power", amount: 1500, dueDate: "2026-10-31" },
    { id: "3", name: "Phone", amount: 500, dueDate: "2026-12-01" },
    { id: "4", name: "Old", amount: 900, dueDate: "2026-09-01", status: "paid" },
  ];

  it("splits unpaid bills into overdue and due soon, ignoring paid ones", () => {
    const s = summarizeBills(bills, today);
    expect(s.overdue.map((b) => b.name)).toEqual(["Rent"]);
    expect(s.dueSoon.map((b) => b.name)).toEqual(["Power"]);
    expect(s.overdueTotal).toBe(12000);
    expect(s.dueSoonTotal).toBe(1500);
  });

  it("closes a one-off bill and rolls a recurring bill to next month", () => {
    expect(markBillPaidPatch({ dueDate: "2026-10-25" })).toEqual({ status: "paid" });
    expect(markBillPaidPatch({ dueDate: "2026-10-25", recurring: true })).toEqual({ dueDate: "2026-11-25" });
  });

  it("suggests a useful entry type", () => {
    expect(defaultBillEntryType({ name: "Airtel", category: "Mobile" })).toBe("Mobile");
    expect(defaultBillEntryType({ name: "Airtel", category: "General" })).toBe("Airtel");
    expect(defaultBillEntryType({ name: "Airtel" })).toBe("Airtel");
  });
});

describe("debts", () => {
  const debts = [
    { id: "a", name: "Car loan", outstandingAmount: 100000, minimumPayment: 8000, dueDate: "2026-10-31" },
    { id: "b", name: "Card", outstandingAmount: 5000, minimumPayment: 500, dueDate: "2026-09-01" },
    { id: "c", name: "Done", outstandingAmount: 0, status: "paid", minimumPayment: 999 },
  ];

  it("totals only active debts", () => {
    expect(totalDebtOutstanding(debts)).toBe(105000);
  });

  it("only flags upcoming (not past) debt due dates", () => {
    expect(debtsDueSoon(debts, "2026-10-29").map((d) => d.name)).toEqual(["Car loan"]);
  });

  it("reduces the balance and keeps the debt active", () => {
    const { patch, paid, remaining, cleared } = applyDebtPayment(debts[0], 8000, { advanceDueDate: true });
    expect(patch).toEqual({ outstandingAmount: 92000, status: "active", dueDate: "2026-11-30" });
    expect([paid, remaining, cleared]).toEqual([8000, 92000, false]);
  });

  it("leaves the due date alone unless asked to move it", () => {
    expect(applyDebtPayment(debts[0], 1000).patch.dueDate).toBeUndefined();
  });

  it("never overpays and closes the debt at zero", () => {
    const { patch, paid, cleared } = applyDebtPayment(debts[1], 999999, { advanceDueDate: true });
    expect(patch).toEqual({ outstandingAmount: 0, status: "paid" });
    expect(paid).toBe(5000);
    expect(cleared).toBe(true);
  });

  it("ignores negative or non-numeric payments", () => {
    expect(applyDebtPayment(debts[0], -50).patch.outstandingAmount).toBe(100000);
    expect(applyDebtPayment(debts[0], "abc").patch.outstandingAmount).toBe(100000);
  });
});

describe("debtHealthScore", () => {
  it("is null when there is nothing to score, so existing scores don't change", () => {
    expect(debtHealthScore({ debts: [], monthlyIncome: 50000, overdueBillCount: 0 })).toBeNull();
    expect(debtHealthScore({ debts: [{ status: "paid", minimumPayment: 100 }], monthlyIncome: 50000 })).toBeNull();
  });

  it("drops as minimum payments take a bigger share of income", () => {
    const light = debtHealthScore({ debts: [{ outstandingAmount: 1, minimumPayment: 2000 }], monthlyIncome: 50000 });
    const heavy = debtHealthScore({ debts: [{ outstandingAmount: 1, minimumPayment: 20000 }], monthlyIncome: 50000 });
    expect(light).toBeGreaterThan(heavy);
    expect(heavy).toBe(0);
  });

  it("penalises overdue bills and stays within 0-100", () => {
    expect(debtHealthScore({ debts: [], overdueBillCount: 2 })).toBe(70);
    expect(debtHealthScore({ debts: [], overdueBillCount: 20 })).toBe(0);
  });
});

describe("findSimilarEntry", () => {
  const txs = [
    { id: "1", month: "2026-10", mode: "Needs", type: "Electricity", merchant: "", amount: 1500 },
    { id: "2", month: "2026-10", mode: "Income", type: "Electricity", merchant: "", amount: 1500 },
  ];

  it("finds a matching expense in the same month", () => {
    expect(findSimilarEntry(txs, { month: "2026-10", amount: 1500, names: ["Power bill", "electricity"] })?.id).toBe("1");
  });

  it("does not match other months, amounts, or income", () => {
    expect(findSimilarEntry(txs, { month: "2026-11", amount: 1500, names: ["electricity"] })).toBeUndefined();
    expect(findSimilarEntry(txs, { month: "2026-10", amount: 900, names: ["electricity"] })).toBeUndefined();
    expect(findSimilarEntry([txs[1]], { month: "2026-10", amount: 1500, names: ["electricity"] })).toBeUndefined();
  });
});

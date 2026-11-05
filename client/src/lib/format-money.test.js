import { describe, expect, it } from "vitest";
import { formatINRInput, parseINRInput } from "./format.js";

describe("INR amount input", () => {
  it("uses Indian digit grouping", () => {
    expect(formatINRInput("1000")).toBe("1,000");
    expect(formatINRInput("100000")).toBe("1,00,000");
    expect(formatINRInput("12345678")).toBe("1,23,45,678");
  });

  it("preserves a partially typed decimal and limits precision to two places", () => {
    expect(formatINRInput("1250.")).toBe("1,250.");
    expect(formatINRInput("1250.5")).toBe("1,250.5");
    expect(formatINRInput("1250.567")).toBe("1,250.56");
  });

  it("parses formatted values back to rupees", () => {
    expect(parseINRInput("1,00,000")).toBe(100000);
    expect(parseINRInput("₹1,23,456.75")).toBe(123456.75);
  });

  it("rejects empty and malformed amounts", () => {
    expect(Number.isNaN(parseINRInput(""))).toBe(true);
    expect(Number.isNaN(parseINRInput("12..3"))).toBe(true);
    expect(Number.isNaN(parseINRInput("1,00,000.123"))).toBe(true);
  });
});

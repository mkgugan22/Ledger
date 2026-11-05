export function currentDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(m) {
  if (!m) return "";
  const [y, mo] = m.split("-");
  const d = new Date(Number(y), Number(mo) - 1, 1);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function shortMonthLabel(m) {
  return monthLabel(m).split(" ")[0];
}

export function fmtINR(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Parse a user-facing INR amount. Presentation separators and the rupee
 * symbol are removed; the returned value is a plain numeric rupee amount
 * suitable for the existing API and database contract.
 */
export function parseINRInput(value) {
  const input = String(value ?? "").replace(/[₹,\s]/g, "");
  if (!input || input === ".") return NaN;
  if (!/^\d+(?:\.\d{0,2})?$/.test(input)) return NaN;
  return Number(input);
}

/**
 * Format an amount while typing using Indian digit grouping:
 * 100000 -> 1,00,000. A trailing decimal point is preserved while typing.
 */
export function formatINRInput(value) {
  let input = String(value ?? "").replace(/[₹,\s]/g, "").replace(/[^\d.]/g, "");
  if (!input) return "";
  const decimalIndex = input.indexOf(".");
  if (decimalIndex !== -1) {
    input = input.slice(0, decimalIndex + 1) + input.slice(decimalIndex + 1).replace(/\./g, "");
  }
  const [integerPart, ...fractionParts] = input.split(".");
  const digits = integerPart || "0";
  const lastThree = digits.slice(-3);
  const leading = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  const grouped = leading ? `${leading},${lastThree}` : lastThree;
  if (decimalIndex === -1) return grouped;
  const fraction = (fractionParts[0] || "").slice(0, 2);
  return `${grouped}.${fraction}`;
}

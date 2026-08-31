const MONTHS = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
  jan: "01", feb: "02", mar: "03", apr: "04", jun: "06", jul: "07", aug: "08", sep: "09", sept: "09", oct: "10", nov: "11", dec: "12",
};

function amount(value) {
  const parsed = Number(String(value).replaceAll(",", ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function payslipMonth(text, fallbackMonth) {
  const match = text.match(/(?:pay(?:roll)?\s*(?:period|month)|salary\s*(?:for|month))[^\n]{0,35}?\b([A-Za-z]{3,9})\s*[,-]?\s*(20\d{2})\b/i);
  if (match) return `${match[2]}-${MONTHS[match[1].toLowerCase()] || ""}`.replace(/-$/, "") || fallbackMonth;
  const numeric = text.match(/(?:pay(?:roll)?\s*(?:period|month)|salary\s*(?:for|month))[^\n]{0,35}?\b(20\d{2})[-/](0[1-9]|1[0-2])\b/i);
  return numeric ? `${numeric[1]}-${numeric[2]}` : fallbackMonth;
}

// Deliberately conservative: an unknown document returns no amount rather
// than guessing. Users always review the generated draft before saving it.
export function extractPayslipDetails(text, fallbackMonth) {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const match = normalized.match(/(?:net\s*(?:pay|salary)|take[- ]?home(?:\s*pay)?|in[- ]?hand(?:\s*(?:salary|pay)?)?)[^\d]{0,45}(?:₹|rs\.?|inr)?\s*([\d][\d,]*(?:\.\d{1,2})?)/i);
  const netAmount = match ? amount(match[1]) : null;
  return {
    found: Boolean(netAmount),
    entry: netAmount ? {
      mode: "Income",
      type: "Salary",
      amount: netAmount,
      month: payslipMonth(normalized, fallbackMonth),
      note: "Drafted from payslip - please review before saving.",
    } : null,
  };
}

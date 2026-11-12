// Days the Indian markets are closed on a weekday, used by the monthly auto-SIP to
// move a SIP date to the next working day (mutual-fund SIPs follow the exchange calendar).
//
// Source: NSE equity trading-holiday list for 2026 (weekday closures only; weekends are
// handled separately). https://cleartax.in/s/nse-holidays-2026
//
// MAINTENANCE: NSE publishes next year's list in December. Add the new dates here, or
// set AUTO_SIP_HOLIDAYS=2027-01-26,2027-03-22,... (comma-separated YYYY-MM-DD) on the
// server without a code change. Until a year's dates are added, only weekends are skipped
// for that year.
export const INDIA_MARKET_HOLIDAYS = [
  "2026-01-15", // Maharashtra municipal elections
  "2026-01-26", // Republic Day
  "2026-03-03", // Holi
  "2026-03-26", // Shri Ram Navami
  "2026-03-31", // Shri Mahavir Jayanti
  "2026-04-03", // Good Friday
  "2026-04-14", // Dr. Baba Saheb Ambedkar Jayanti
  "2026-05-01", // Maharashtra Day
  "2026-05-28", // Bakri Id
  "2026-06-26", // Muharram
  "2026-09-14", // Ganesh Chaturthi
  "2026-10-02", // Mahatma Gandhi Jayanti
  "2026-10-20", // Dussehra
  "2026-11-10", // Diwali - Balipratipada
  "2026-11-24", // Prakash Gurpurb Sri Guru Nanak Dev
  "2026-12-25", // Christmas
];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// "2027-01-26, 2027-03-22" -> ["2027-01-26", "2027-03-22"]; anything malformed is ignored.
export function parseHolidayList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => ISO_DATE_RE.test(item));
}

export function buildHolidaySet(extra = "") {
  return new Set([...INDIA_MARKET_HOLIDAYS, ...parseHolidayList(extra)]);
}

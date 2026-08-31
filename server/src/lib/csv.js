// Minimal CSV helpers for the transactions import/export feature. Handles
// RFC-4180-style quoting (quoted fields, escaped "" for a literal quote,
// commas/newlines inside quotes) without pulling in a dependency — the
// format this app produces and consumes is small and fully under our
// control on the export side.

export function toCSV(rows, columns) {
  const escape = (val) => {
    const s = val === null || val === undefined ? "" : String(val);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.join(",");
  const lines = rows.map((row) => columns.map((col) => escape(row[col])).join(","));
  return [header, ...lines].join("\n");
}

// Parses CSV text into an array of row objects keyed by the header row.
// Returns { header, rows } where each row is { values: {...}, line: N }
// (line is 1-based and counts from the first data row, for error reporting).
export function parseCSV(text) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;
  let i = 0;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += c; i += 1; continue;
    }
    if (c === '"') { inQuotes = true; i += 1; continue; }
    if (c === ",") { pushField(); i += 1; continue; }
    if (c === "\r") { i += 1; continue; }
    if (c === "\n") { pushRow(); i += 1; continue; }
    field += c; i += 1;
  }
  // Trailing field/row (no final newline).
  if (field.length > 0 || row.length > 0) pushRow();

  const nonEmpty = rows.filter((r) => !(r.length === 1 && r[0] === ""));
  if (nonEmpty.length === 0) return { header: [], rows: [] };

  const header = nonEmpty[0].map((h) => h.trim());
  const dataRows = nonEmpty.slice(1).map((values, idx) => {
    const obj = {};
    header.forEach((key, colIdx) => { obj[key] = values[colIdx] !== undefined ? values[colIdx].trim() : ""; });
    return { values: obj, line: idx + 2 }; // +2: 1-based, plus the header row
  });

  return { header, rows: dataRows };
}

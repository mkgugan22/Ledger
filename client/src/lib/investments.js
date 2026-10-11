// Single source of truth for "what is each fund worth / how much is invested".
//
// A fund's rows are of two kinds:
//   - "Status"  : a snapshot (invested-to-date, valuation, units, XIRR) taken on a date.
//   - "SIP" / "Additional" : money put in on a date.
//
// The latest Status is the baseline. Money put in AFTER that snapshot's date is not in
// the snapshot yet, so it is added on top (at cost) until a newer snapshot is saved.
// Before this existed, a fund with a snapshot ignored every later contribution, so
// manually added or auto-added SIP amounts never showed up in any total.
//
// A contribution dated on the snapshot's own date is treated as already included in it.

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const dateOf = (row) => String(row?.date || row?.started || "");
const investedOf = (row) => num(row?.invested || row?.amount);
const valueOf = (row) => num(row?.currentValue || row?.current || row?.amount);

export function buildFundPositions(rows = []) {
  const byFund = new Map();

  for (const row of rows) {
    const fund = row?.fund;
    if (!fund) continue;
    if (!byFund.has(fund)) byFund.set(fund, { fund, assetClass: row.assetClass || "Equity", status: null, contributions: [] });
    const bucket = byFund.get(fund);
    if (row.type === "Status") {
      if (!bucket.status || dateOf(row) >= dateOf(bucket.status)) bucket.status = row;
    } else {
      bucket.contributions.push(row);
    }
  }

  return Array.from(byFund.values()).map((bucket) => {
    const s = bucket.status;
    const contributions = bucket.contributions;
    const sinceSnapshot = s ? contributions.filter((row) => dateOf(row) > dateOf(s)) : contributions;

    const addedInvested = sinceSnapshot.reduce((sum, row) => sum + investedOf(row), 0);
    const addedValue = sinceSnapshot.reduce((sum, row) => sum + valueOf(row), 0);

    const invested = (s ? num(s.invested) : 0) + addedInvested;
    const current = (s ? num(s.currentValue) : 0) + addedValue;
    const gain = current - invested;

    return {
      fund: bucket.fund,
      invested,
      current,
      gain,
      absReturn: invested ? (gain / invested) * 100 : 0,
      units: s?.units ?? null,
      xirr: s?.xirr ?? null,
      monthly: contributions.reduce((sum, row) => sum + num(row.monthly), 0),
      asOf: s?.date ?? null,
      // Money added after the snapshot date (0 when there is no snapshot: everything is
      // already counted in invested/current in that case).
      addedSince: s ? addedInvested : 0,
      statusEntryId: s?.id ?? s?._id ?? null,
      assetClass: s?.assetClass || bucket.assetClass,
      benchmarkReturn: s?.benchmarkReturn ?? null,
    };
  });
}

export function sumFundPositions(positions) {
  return positions.reduce(
    (acc, p) => ({ invested: acc.invested + p.invested, current: acc.current + p.current }),
    { invested: 0, current: 0 }
  );
}

const round = (value) => Math.round((Number(value) || 0) * 100) / 100;

export function calculateSipFutureValue(monthlyContribution, annualRate, years) {
  const monthly = Number(monthlyContribution) || 0;
  const periods = Math.max(0, Math.round((Number(years) || 0) * 12));
  const monthlyRate = (Number(annualRate) || 0) / 100 / 12;

  if (!monthly || !periods) {
    return { contribution: 0, futureValue: 0, gain: 0 };
  }

  const futureValue = monthlyRate === 0
    ? monthly * periods
    : monthly * ((((1 + monthlyRate) ** periods - 1) / monthlyRate) * (1 + monthlyRate));

  const contribution = monthly * periods;

  return {
    contribution: round(contribution),
    futureValue: round(futureValue),
    gain: round(futureValue - contribution),
  };
}

export function buildSipScenarios(monthlyContribution, years = 5) {
  if (!(Number(monthlyContribution) > 0)) return null;

  return {
    monthlyContribution: round(monthlyContribution),
    years,
    methodology: "Monthly SIP future-value formula using monthly compounding; estimates are not guaranteed returns.",
    scenarios: [8, 10, 12].map((annualRate) => ({
      annualRate,
      ...calculateSipFutureValue(monthlyContribution, annualRate, years),
    })),
  };
}

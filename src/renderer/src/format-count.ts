export function formatCompactNumber(value: number): string {
  const safeValue = Math.max(0, value);
  if (safeValue >= 1_000_000_000) return `${trimCompactDecimal(safeValue / 1_000_000_000)}B`;
  if (safeValue >= 1_000_000) return `${trimCompactDecimal(safeValue / 1_000_000)}M`;
  if (safeValue >= 1_000) return `${trimCompactDecimal(safeValue / 1_000)}K`;
  return String(Math.floor(safeValue));
}

export function formatTokenCount(value: number): string {
  return formatCompactNumber(value);
}

function trimCompactDecimal(value: number): string {
  return value >= 10 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, "");
}

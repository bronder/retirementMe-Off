/** Formatting helpers for currency, percentages, and ages. */

export function formatCurrency(value: number, opts: { compact?: boolean } = {}): string {
  if (!isFinite(value)) return '$0';
  if (opts.compact && Math.abs(value) >= 1000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatAge(age: number | null): string {
  if (age === null) return 'Never';
  return `${age}`;
}

export function formatYear(year: number): string {
  return String(year);
}
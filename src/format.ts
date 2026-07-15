/** Formatting helpers for currency, percentages, and ages. */

export function formatCurrency(value: number, opts: { compact?: boolean } = {}): string {
  // Non-finite values mean a malformed/missing input leaked through. Returning
  // '$0' here would silently disguise bad data as a valid zero — dangerous in
  // a financial app where a user could mistake a broken projection for a real
  // result. A muted dash makes the problem visible without an alarming error.
  if (!isFinite(value)) return '—';
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

/** Title-case a snake_case identifier, e.g. "traditional_401k" → "Traditional 401k". */
export function prettify(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Parse a numeric input's raw string value into a finite number.
 * Returns NaN when the field is empty or non-numeric (e.g. the user cleared it
 * or is mid-edit), so callers can decide to ignore the update rather than
 * silently storing 0 (the trap with `+""` / `Number("")`, which both yield 0).
 *
 * Usage in a controlled input:
 *   onChange={(e) => {
 *     const v = parseNum(e.target.value);
 *     if (!Number.isNaN(v)) onChange(v);
 *   }}
 */
export function parseNum(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === '') return NaN;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : NaN;
}
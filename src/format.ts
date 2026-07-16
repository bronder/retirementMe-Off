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

/**
 * What happened on blur of a numeric input.
 * - 'restored': the user cleared / typed an unparseable value, so the field
 *               snapped back to the previously-committed value.
 * - 'clamped-low' / 'clamped-high': a valid parseable value fell outside the
 *               configured bounds; the input was reset to that bound.
 * - 'ok': the typed value was accepted as-is. The caller should NOT surface
 *               a notice.
 */
export type SnapBack =
  | { kind: 'restored'; restoredTo: number }
  | { kind: 'clamped-low'; clampedTo: number }
  | { kind: 'clamped-high'; clampedTo: number }
  | { kind: 'ok' };

/**
 * Decide what should happen on blur of a numeric input.
 *
 * Pure function — no React, no DOM. The hook that owns draft state calls this
 * once per blur to learn whether the user snapped back the field, hit a bound,
 * or landed cleanly.
 *
 * @param draftStr    The string currently held in the input (null if no draft).
 * @param value       The last value committed to the store (used for 'restored').
 * @param fromInput   Inverse of the toInput transformer (e.g. percent fields
 *                    divide the input by 100). Defaults to identity.
 * @param min         Lower bound, if any.
 * @param max         Upper bound, if any.
 *
 * `draftStr === null` means "no draft was active" (e.g. the user blurred the
 * field without typing since the last commit). That is NOT a snap-back event —
 * the displayed value is already the store value, so no notice is needed.
 */
export function decideSnapBack(
  draftStr: string | null,
  value: number,
  fromInput: (v: number) => number = (v) => v,
  min: number | undefined = undefined,
  max: number | undefined = undefined,
): SnapBack {
  // No draft = nothing happened since last commit. Don't fire a notice.
  if (draftStr === null) return { kind: 'ok' };
  // Empty or whitespace-only = user cleared the field. Snap back.
  if (draftStr.trim() === '') return { kind: 'restored', restoredTo: value };
  // Anything that doesn't parse = user typed gibberish. Snap back.
  const parsed = parseNum(draftStr);
  if (Number.isNaN(parsed)) return { kind: 'restored', restoredTo: value };
  // Parseable — check the bounds AFTER applying fromInput (e.g. percent fields
  // divide by 100 before comparing).
  const candidate = fromInput(parsed);
  if (min !== undefined && candidate < min) return { kind: 'clamped-low', clampedTo: min };
  if (max !== undefined && candidate > max) return { kind: 'clamped-high', clampedTo: max };
  return { kind: 'ok' };
}
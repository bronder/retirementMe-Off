import { describe, it, expect } from 'vitest';
import { parseNum, decideSnapBack } from './format';

/**
 * parseNum is the contract that every numeric input in the app depends on:
 * empty / whitespace / non-numeric → NaN. A future refactor that breaks this
 * (e.g. by switching to `Number(...)` or `parseFloat`) would re-introduce the
 * exact bug fixed in commit 083bcf0 ("you literally couldn't clear the field").
 */
describe('parseNum', () => {
  it('returns NaN for an empty string', () => {
    expect(parseNum('')).toBeNaN();
  });

  it('returns NaN for whitespace-only strings', () => {
    expect(parseNum('   ')).toBeNaN();
    expect(parseNum('\t\n')).toBeNaN();
  });

  it('returns NaN for non-numeric strings', () => {
    expect(parseNum('abc')).toBeNaN();
    expect(parseNum('5e5e5')).toBeNaN();
  });

  it('returns NaN for thousand-separator strings (commas are not supported)', () => {
    // Documenting today's behavior so a future change is intentional.
    expect(parseNum('1,000')).toBeNaN();
    expect(parseNum('$50')).toBeNaN();
  });

  it('parses plain integers and decimals', () => {
    expect(parseNum('5')).toBe(5);
    expect(parseNum('5.5')).toBe(5.5);
    expect(parseNum('-3')).toBe(-3);
  });

  it('parses scientific notation', () => {
    expect(parseNum('1e5')).toBe(100000);
    expect(parseNum('1.5e2')).toBe(150);
  });

  it('returns NaN for non-finite numbers (Infinity, NaN)', () => {
    expect(parseNum('Infinity')).toBeNaN();
    expect(parseNum('NaN')).toBeNaN();
  });
});

/**
 * decideSnapBack is the pure logic under the visible notice in every
 * `useEditableNumber` consumer. Locking the four cases in tests keeps the
 * whole snap-back UX from drifting on a refactor.
 */
describe('decideSnapBack', () => {
  const identity = (v: number) => v;

  describe('restored (snap-back to last valid value)', () => {
    it('on empty draft', () => {
      expect(decideSnapBack('', 50, identity, 0, 100)).toEqual({ kind: 'restored', restoredTo: 50 });
    });

    it('on whitespace-only draft', () => {
      expect(decideSnapBack('   ', 50, identity, 0, 100)).toEqual({ kind: 'restored', restoredTo: 50 });
    });

    it('on unparseable draft', () => {
      expect(decideSnapBack('abc', 50, identity, 0, 100)).toEqual({ kind: 'restored', restoredTo: 50 });
    });

    it('on unparseable draft even with no bounds', () => {
      // No min/max shouldn't bypass the unparseable check.
      expect(decideSnapBack('NaN', 50, identity, undefined, undefined)).toEqual({ kind: 'restored', restoredTo: 50 });
    });
  });

  describe('clamped-low / clamped-high', () => {
    it('clamps below min to min', () => {
      expect(decideSnapBack('-1', 50, identity, 0, 100)).toEqual({ kind: 'clamped-low', clampedTo: 0 });
    });

    it('clamps above max to max', () => {
      expect(decideSnapBack('200', 50, identity, 0, 100)).toEqual({ kind: 'clamped-high', clampedTo: 100 });
    });

    it('clamps at the exact boundary (≤ min, ≥ max)', () => {
      // 0 is NOT < 0, so it's fine; -0.0001 is < 0, so it clamps low.
      expect(decideSnapBack('0', 50, identity, 0, 100)).toEqual({ kind: 'ok' });
      expect(decideSnapBack('-0.0001', 50, identity, 0, 100)).toEqual({ kind: 'clamped-low', clampedTo: 0 });
      expect(decideSnapBack('100', 50, identity, 0, 100)).toEqual({ kind: 'ok' });
      expect(decideSnapBack('100.0001', 50, identity, 0, 100)).toEqual({ kind: 'clamped-high', clampedTo: 100 });
    });
  });

  describe('ok (no snap-back event, no notice)', () => {
    it('when no draft was active (initial render, no edit)', () => {
      expect(decideSnapBack(null, 50, identity, 0, 100)).toEqual({ kind: 'ok' });
    });

    it('when the draft parses in-bounds', () => {
      expect(decideSnapBack('50', 50, identity, 0, 100)).toEqual({ kind: 'ok' });
      expect(decideSnapBack('25.5', 50, identity, 0, 100)).toEqual({ kind: 'ok' });
    });

    it('when no bounds are configured and the draft parses', () => {
      expect(decideSnapBack('999', 50, identity, undefined, undefined)).toEqual({ kind: 'ok' });
    });
  });

  describe('fromInput transformation (e.g. percent fields)', () => {
    // PctInputEnhanced passes (v) => v / 100 because the user types "4.5" for
    // a 0.045 store value. The clamp should compare against the store-domain
    // value, not the typed one.
    const div100 = (v: number) => v / 100;

    it('clamps a percent draft of "200" against store max of 1', () => {
      // 200 → fromInput → 2 → 2 > max(1) → clamped-high
      expect(decideSnapBack('200', 0.04, div100, 0, 1)).toEqual({ kind: 'clamped-high', clampedTo: 1 });
    });

    it('accepts a percent draft that maps within bounds', () => {
      // 4.5 → fromInput → 0.045 → in [0, 1] → ok
      expect(decideSnapBack('4.5', 0.04, div100, 0, 1)).toEqual({ kind: 'ok' });
    });

    it('clamps a percent draft of "-5" against store min of 0', () => {
      // -5 → fromInput → -0.05 → -0.05 < min(0) → clamped-low
      expect(decideSnapBack('-5', 0.04, div100, 0, 1)).toEqual({ kind: 'clamped-low', clampedTo: 0 });
    });

    it('reports ok for unparseable draft even with fromInput', () => {
      // Unparseable always restores — fromInput is not consulted.
      expect(decideSnapBack('abc', 0.04, div100, 0, 1)).toEqual({ kind: 'restored', restoredTo: 0.04 });
    });
  });
});

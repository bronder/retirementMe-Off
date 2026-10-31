import { describe, it, expect } from 'vitest';
import { MAX_CHAT_HISTORY, repairPlan, usePlanStore } from './store';
import { defaultPlan, defaultAssumptions } from './defaults';

/**
 * Tripwire tests for the chat-history cap.
 *
 * Testing the store actions end-to-end requires localStorage and a DOM, which
 * the vitest config (environment: 'node') deliberately does not provide — the
 * store is wired against `localStorage` by default and isn't worth swapping
 * to an in-memory adapter just for one cap test. These tests instead lock in
 * the constant that's exported so the cap can only be changed intentionally.
 */
describe('MAX_CHAT_HISTORY', () => {
  it('is exported and is a positive integer', () => {
    expect(typeof MAX_CHAT_HISTORY).toBe('number');
    expect(Number.isInteger(MAX_CHAT_HISTORY)).toBe(true);
    expect(MAX_CHAT_HISTORY).toBeGreaterThan(0);
  });

  it('is even (one user + one assistant per turn keeps turns intact)', () => {
    // The cap slices the array to its last N entries. If N is odd, a single
    // new turn can leave a stray assistant message without its preceding
    // user message. Keep N even.
    expect(MAX_CHAT_HISTORY % 2).toBe(0);
  });

  it('is large enough to keep recent context but bounded', () => {
    // Lower bound: at least 10 turns (20 messages) — enough to keep the
    // most recent conversation flow coherent for typical use.
    expect(MAX_CHAT_HISTORY).toBeGreaterThanOrEqual(20);
    // Upper bound: 200 messages. Anything larger starts to bloat localStorage
    // and request body size for marginal context gain.
    expect(MAX_CHAT_HISTORY).toBeLessThanOrEqual(200);
  });
});

/**
 * repairPlan guards every untrusted plan payload (file imports, corrupted
 * localStorage). Regression: a JSON-valid but schema-mismatched import used
 * to reach the app with no resolvable scenario — blank render, and the broken
 * plan was persisted so a reload didn't fix it.
 */
describe('repairPlan', () => {
  it('rejects payloads that are not plans at all', () => {
    expect(repairPlan(null)).toBeNull();
    expect(repairPlan('not an object')).toBeNull();
    expect(repairPlan({ foo: 1 })).toBeNull();
    expect(repairPlan({ scenarios: 'nope' })).toBeNull();
    expect(repairPlan({ scenarios: [] })).toBeNull();
  });

  it('rejects scenarios whose assumptions are missing numeric fields', () => {
    const base = defaultPlan();
    const bad = {
      ...base,
      scenarios: [
        {
          id: 's1',
          name: 'Broken',
          assumptions: { currentAge: 40, retirementAge: 65 }, // no endAge/rates
        },
      ],
    };
    expect(repairPlan(bad)).toBeNull();
  });

  it('rejects a non-numeric (NaN-poisoned) assumption value', () => {
    const base = defaultPlan();
    const poisoned = {
      ...base,
      scenarios: base.scenarios.map((s) => ({
        ...s,
        assumptions: { ...s.assumptions, inflationRate: 'high' },
      })),
    };
    expect(repairPlan(poisoned)).toBeNull();
  });

  it('normalizes valid minimal plans: missing collections become []', () => {
    const minimal = {
      name: 'Imported',
      scenarios: [
        {
          id: 's1',
          name: 'Main',
          assumptions: defaultPlan().scenarios[0].assumptions,
          // no accounts/properties/incomeSources/expenses/events
        },
      ],
    };
    const plan = repairPlan(minimal);
    expect(plan).not.toBeNull();
    expect(plan!.scenarios[0].accounts).toEqual([]);
    expect(plan!.scenarios[0].properties).toEqual([]);
    expect(plan!.scenarios[0].incomeSources).toEqual([]);
    expect(plan!.scenarios[0].expenses).toEqual([]);
    expect(plan!.scenarios[0].events).toEqual([]);
    expect(plan!.version).toBeTruthy();
  });

  it('preserves collections from older exports untouched', () => {
    const exported = defaultPlan();
    const plan = repairPlan(exported);
    expect(plan).not.toBeNull();
    expect(plan!.scenarios).toHaveLength(exported.scenarios.length);
    expect(plan!.scenarios[0].assumptions).toEqual(exported.scenarios[0].assumptions);
    expect(plan!.scenarios[0].expenses).toEqual(exported.scenarios[0].expenses);
  });

  it('backfills contributionEndAge on accounts from plans written before the field existed', () => {
    const base = defaultPlan();
    // Simulate a pre-existing persisted plan: strip the field from every account.
    const old = {
      ...base,
      scenarios: base.scenarios.map((s) => ({
        ...s,
        accounts: s.accounts.map(({ contributionEndAge: _omit, ...rest }) => rest),
      })),
    };
    const plan = repairPlan(old);
    expect(plan).not.toBeNull();
    for (const acct of plan!.scenarios[0].accounts) {
      expect(acct.contributionEndAge).toBeNull();
    }
  });

  it('generates ids for scenarios missing them and de-duplicates collisions', () => {
    const s = defaultPlan().scenarios[0];
    const dup = defaultPlan().scenarios[0];
    const plan = repairPlan({ scenarios: [{ ...s, id: '' }, dup] });
    expect(plan).not.toBeNull();
    const ids = plan!.scenarios.map((x) => x.id);
    expect(ids[0]).not.toBe('');
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/**
 * loadPlan is the import entry point; it must throw (not brick) on bad data.
 * The store itself runs fine in node — the debounced storage adapter no-ops
 * without window.localStorage.
 */
describe('loadPlan validation', () => {
  it('throws on schema-mismatched JSON and leaves the current plan intact', () => {
    const before = usePlanStore.getState().plan;
    expect(() => usePlanStore.getState().loadPlan({ foo: 1 })).toThrow();
    expect(usePlanStore.getState().plan).toBe(before);
  });

  it('accepts a valid plan and activates its first scenario', () => {
    const plan = defaultPlan();
    usePlanStore.getState().loadPlan(plan);
    const state = usePlanStore.getState();
    expect(state.activeScenarioId).toBe(plan.scenarios[0].id);
  });
});

/**
 * Reset Plan ("Erase all data?") and the welcome banner's "Start fresh" must
 * leave a BLANK plan. Regression: resetPlan used defaultPlan(), which ships
 * the sample scenario — resetting visibly re-seeded demo accounts, income,
 * and expenses instead of removing the user's inputs.
 */
describe('resetPlan', () => {
  it('clears all inputs to a blank plan with default assumptions', () => {
    usePlanStore.getState().resetPlan();
    const state = usePlanStore.getState();
    expect(state.plan.scenarios).toHaveLength(1);
    const sc = state.plan.scenarios[0];
    expect(sc.accounts).toEqual([]);
    expect(sc.incomeSources).toEqual([]);
    expect(sc.expenses).toEqual([]);
    expect(sc.events).toEqual([]);
    expect(sc.properties ?? []).toEqual([]);
    // Assumptions are settings, not inputs — they keep their defaults.
    expect(sc.assumptions.currentAge).toBe(defaultAssumptions().currentAge);
    expect(state.activeScenarioId).toBe(sc.id);
    // The reset is undoable like other destructive ops.
    expect(state.undoState?.label).toBe('Reset plan');
  });

  it('clears stale chat history along with the plan', () => {
    usePlanStore.getState().setChatHistory([{ role: 'user', content: 'old plan question', timestamp: 0 }]);
    usePlanStore.getState().resetPlan();
    expect(usePlanStore.getState().chatHistory).toEqual([]);
  });
});

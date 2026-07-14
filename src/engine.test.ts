import { describe, it, expect } from 'vitest';
import {
  runProjection,
  runMonteCarloProjection,
  createRng,
} from './engine';
import type { Scenario } from './types';

function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: 'test',
    name: 'Test',
    assumptions: {
      currentAge: 40,
      retirementAge: 65,
      endAge: 95,
      inflationRate: 0.03,
      socialSecurityCola: 0.025,
      retirementTaxRate: 0.15,
      safeWithdrawalRate: 0.04,
      preRetirementReturn: 0.07,
      postRetirementReturn: 0.05,
    },
    accounts: [],
    incomeSources: [],
    expenses: [],
    events: [],
    ...overrides,
  };
}

describe('runProjection', () => {
  it('projects growth with no contributions or expenses', () => {
    const scenario = makeScenario({
      accounts: [
        { id: 'a1', name: 'Savings', type: 'taxable_brokerage', balance: 100000, annualReturn: 0.07, annualContribution: 0, employerMatch: 0 },
      ],
    });
    const result = runProjection(scenario);
    // Year 1 (age 40): no contribution, 100k * 1.07 = 107000
    expect(result.years[0].endingAssets).toBeCloseTo(107000, 0);
    // Year 2 (age 41): 107000 * 1.07 = 114490
    expect(result.years[1].endingAssets).toBeCloseTo(114490, -1);
    expect(result.success).toBe(true);
  });

  it('models pre-retirement contributions', () => {
    const scenario = makeScenario({
      accounts: [
        { id: 'a1', name: '401k', type: 'traditional_401k', balance: 0, annualReturn: 0.07, annualContribution: 10000, employerMatch: 5000 },
      ],
    });
    const result = runProjection(scenario);
    // Age 40 (year 1): contribute 15000 (in today's dollars, year 0), then grow.
    // contribution = 15000 * inflationFactor(0) = 15000
    // After contribution: 15000. After growth: 15000 * 1.07 = 16050
    expect(result.years[0].contributions).toBeCloseTo(15000, 0);
    expect(result.years[0].endingAssets).toBeCloseTo(16050, 0);
  });

  it('stops contributions at retirement', () => {
    const scenario = makeScenario({
      assumptions: { ...makeScenario().assumptions, currentAge: 64, retirementAge: 65, endAge: 70 },
      accounts: [
        { id: 'a1', name: '401k', type: 'traditional_401k', balance: 100000, annualReturn: 0.05, annualContribution: 10000, employerMatch: 0 },
      ],
    });
    const result = runProjection(scenario);
    // Age 64: contributing
    expect(result.years[0].contributions).toBeGreaterThan(0);
    // Age 65: retired, no contributions
    expect(result.years[1].contributions).toBe(0);
  });

  it('withdraws for retirement expenses', () => {
    const scenario = makeScenario({
      assumptions: { ...makeScenario().assumptions, currentAge: 65, retirementAge: 65, endAge: 75, inflationRate: 0 },
      accounts: [
        { id: 'a1', name: '401k', type: 'traditional_401k', balance: 1000000, annualReturn: 0.05, annualContribution: 0, employerMatch: 0 },
      ],
      expenses: [
        { id: 'e1', name: 'Living', category: 'housing', annualAmount: 60000, preRetirement: false, postRetirement: true, startAge: null, endAge: null },
      ],
    });
    const result = runProjection(scenario);
    // First year: need 60000 net from traditional 401k (tax-deferred, 15% tax).
    // Gross up: 60000 / (1 - 0.15) = 70588.24
    expect(result.years[0].withdrawals).toBeCloseTo(70588, -1);
    expect(result.years[0].expenses).toBe(60000);
  });

  it('subtracts retirement income from withdrawal need', () => {
    const scenario = makeScenario({
      assumptions: { ...makeScenario().assumptions, currentAge: 67, retirementAge: 67, endAge: 75, inflationRate: 0, socialSecurityCola: 0 },
      accounts: [
        { id: 'a1', name: 'IRA', type: 'traditional_ira', balance: 500000, annualReturn: 0.05, annualContribution: 0, employerMatch: 0 },
      ],
      incomeSources: [
        { id: 'i1', name: 'SS', type: 'social_security', annualAmount: 30000, startAge: 67, endAge: null, cola: false, taxable: false },
      ],
      expenses: [
        { id: 'e1', name: 'Living', category: 'housing', annualAmount: 60000, preRetirement: false, postRetirement: true, startAge: null, endAge: null },
      ],
    });
    const result = runProjection(scenario);
    // Need 60000 - 30000 income = 30000 net withdrawal.
    // Gross up for 15% tax: 30000 / 0.85 = 35294
    expect(result.years[0].income).toBe(30000);
    expect(result.years[0].withdrawals).toBeCloseTo(35294, -1);
  });

  it('detects depletion', () => {
    const scenario = makeScenario({
      assumptions: { ...makeScenario().assumptions, currentAge: 65, retirementAge: 65, endAge: 80, inflationRate: 0 },
      accounts: [
        { id: 'a1', name: 'Savings', type: 'taxable_brokerage', balance: 100000, annualReturn: 0.02, annualContribution: 0, employerMatch: 0 },
      ],
      expenses: [
        { id: 'e1', name: 'Living', category: 'housing', annualAmount: 50000, preRetirement: false, postRetirement: true, startAge: null, endAge: null },
      ],
    });
    const result = runProjection(scenario);
    expect(result.success).toBe(false);
    expect(result.depletionAge).not.toBeNull();
    expect(result.depletionAge!).toBeGreaterThan(65);
    expect(result.depletionAge!).toBeLessThanOrEqual(80);
  });

  it('handles life events (home purchase)', () => {
    const scenario = makeScenario({
      assumptions: { ...makeScenario().assumptions, currentAge: 50, retirementAge: 65, endAge: 70, inflationRate: 0 },
      accounts: [
        { id: 'a1', name: 'Savings', type: 'taxable_brokerage', balance: 500000, annualReturn: 0, annualContribution: 0, employerMatch: 0 },
      ],
      events: [
        { id: 'ev1', name: 'Buy house', type: 'home_purchase', age: 52, cost: 100000, proceeds: 0, ongoingAnnualImpact: 15000, ongoingDurationYears: 15, notes: 'Down payment + mortgage' },
      ],
    });
    const result = runProjection(scenario);
    // At age 52, event cash flow = 0 - 100000 = -100000
    const eventYear = result.years.find((y) => y.age === 52)!;
    expect(eventYear.eventCashFlow).toBe(-100000);
    // From age 52, ongoing impact of 15000/year for 15 years should appear in expenses
    const ongoingYear = result.years.find((y) => y.age === 53)!;
    expect(ongoingYear.expenses).toBeGreaterThanOrEqual(15000);
  });

  it('counts expenses with both pre and post retirement checked', () => {
    const scenario = makeScenario({
      assumptions: { ...makeScenario().assumptions, currentAge: 62, retirementAge: 65, endAge: 70, inflationRate: 0 },
      accounts: [
        { id: 'a1', name: 'Savings', type: 'taxable_brokerage', balance: 10000000, annualReturn: 0, annualContribution: 0, employerMatch: 0 },
      ],
      expenses: [
        // Expense active in BOTH pre and post retirement
        { id: 'e1', name: 'Food', category: 'food', annualAmount: 12000, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
      ],
    });
    const result = runProjection(scenario);
    // Pre-retirement (age 62): expense should be counted
    expect(result.years[0].expenses).toBe(12000);
    // Retirement year (age 65): expense should STILL be counted
    const retirementYear = result.years.find((y) => y.age === 65)!;
    expect(retirementYear.expenses).toBe(12000);
    // Post-retirement (age 68): expense should still be counted
    const lateYear = result.years.find((y) => y.age === 68)!;
    expect(lateYear.expenses).toBe(12000);
  });

  it('does not double-inflate COLA income (Social Security)', () => {
    // Social Security entered as $34,800/yr ($2,900/mo), starts at 67.
    // With 3% inflation, at age 67 (7 years from now): nominal should be
    // 34800 * 1.03^7 ≈ 42799. In today's dollars it should still be 34800.
    // The old code multiplied by an additional COLA factor, inflating too fast.
    const scenario = makeScenario({
      assumptions: { ...makeScenario().assumptions, currentAge: 60, retirementAge: 67, endAge: 75, inflationRate: 0.03, socialSecurityCola: 0.025 },
      accounts: [
        { id: 'a1', name: 'Savings', type: 'taxable_brokerage', balance: 10000000, annualReturn: 0, annualContribution: 0, employerMatch: 0 },
      ],
      incomeSources: [
        { id: 'i1', name: 'SS', type: 'social_security', annualAmount: 34800, startAge: 67, endAge: null, cola: true, taxable: false },
      ],
    });
    const result = runProjection(scenario);

    // At age 67 (start): 34800 * 1.03^7 ≈ 42799
    const age67 = result.years.find((y) => y.age === 67)!;
    expect(age67.income).toBeCloseTo(42799, -1);

    // At age 68: 34800 * 1.03^8 ≈ 44083 (NOT 34800 * 1.03^8 * 1.025^1)
    const age68 = result.years.find((y) => y.age === 68)!;
    expect(age68.income).toBeCloseTo(44083, -1);

    // Verify real (today's $) income is still ~34800 at age 67
    const realIncome67 = age67.income / Math.pow(1.03, 7);
    expect(realIncome67).toBeCloseTo(34800, -1);
  });

  it('keeps non-COLA income at a fixed nominal amount', () => {
    // Fixed pension: $20,000/yr starting at 65. With 3% inflation,
    // the nominal amount is set at startAge and stays fixed thereafter.
    const scenario = makeScenario({
      assumptions: { ...makeScenario().assumptions, currentAge: 60, retirementAge: 65, endAge: 75, inflationRate: 0.03 },
      accounts: [
        { id: 'a1', name: 'Savings', type: 'taxable_brokerage', balance: 10000000, annualReturn: 0, annualContribution: 0, employerMatch: 0 },
      ],
      incomeSources: [
        { id: 'i1', name: 'Pension', type: 'pension', annualAmount: 20000, startAge: 65, endAge: null, cola: false, taxable: false },
      ],
    });
    const result = runProjection(scenario);

    // At age 65 (start): 20000 * 1.03^5 = 23186
    const age65 = result.years.find((y) => y.age === 65)!;
    expect(age65.income).toBeCloseTo(23186, -1);

    // At age 70: still 23186 (fixed nominal, NOT grown by inflation each year)
    const age70 = result.years.find((y) => y.age === 70)!;
    expect(age70.income).toBeCloseTo(23186, -1);
  });

  it('applies inflation to expenses', () => {
    const scenario = makeScenario({
      assumptions: { ...makeScenario().assumptions, currentAge: 40, retirementAge: 41, endAge: 45, inflationRate: 0.03 },
      accounts: [
        { id: 'a1', name: 'Cash', type: 'checking_savings', balance: 10000000, annualReturn: 0, annualContribution: 0, employerMatch: 0 },
      ],
      expenses: [
        { id: 'e1', name: 'Living', category: 'housing', annualAmount: 50000, preRetirement: false, postRetirement: true, startAge: null, endAge: null },
      ],
    });
    const result = runProjection(scenario);
    // Age 41: 1 year of inflation. 50000 * 1.03 = 51500
    expect(result.years[1].expenses).toBeCloseTo(51500, 0);
    // Age 42: 2 years. 50000 * 1.03^2 = 53045
    expect(result.years[2].expenses).toBeCloseTo(53045, -1);
  });
});

/* ============================================================
   MONTE CARLO TESTS
   ============================================================
   These verify the Monte Carlo runner behaves correctly under seeded
   RNG conditions so the test outcomes are deterministic regardless of
   platform or node version.
   ============================================================ */

describe('createRng (mulberry32)', () => {
  it('returns the same sequence for the same seed', () => {
    const r1 = createRng(42);
    const r2 = createRng(42);
    for (let i = 0; i < 100; i++) {
      expect(r1.next()).toBe(r2.next());
    }
  });

  it('returns values in [0, 1)', () => {
    const r = createRng(123);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('produces a different sequence for a different seed', () => {
    const r1 = createRng(1);
    const r2 = createRng(2);
    let mismatches = 0;
    for (let i = 0; i < 20; i++) {
      if (r1.next() !== r2.next()) mismatches++;
    }
    // With overwhelming probability, *every* pair should differ.
    expect(mismatches).toBeGreaterThan(15);
  });
});

describe('runMonteCarloProjection', () => {
  it('is fully deterministic given the same seed', () => {
    const scenario = makeScenario({
      accounts: [
        { id: 'a1', name: 'Brokerage', type: 'taxable_brokerage', balance: 500000, annualReturn: 0.07, annualContribution: 12000, employerMatch: 0 },
      ],
    });
    const a = runMonteCarloProjection(scenario, { numRuns: 200, returnStdDev: 0.15, seed: 42 });
    const b = runMonteCarloProjection(scenario, { numRuns: 200, returnStdDev: 0.15, seed: 42 });
    expect(a.successRate).toBe(b.successRate);
    expect(a.medianFinalAssets).toBe(b.medianFinalAssets);
    expect(a.p10FinalAssets).toBe(b.p10FinalAssets);
    expect(a.p90FinalAssets).toBe(b.p90FinalAssets);
    expect(a.depletionAges).toEqual(b.depletionAges);
    // Percentile paths should also match exactly.
    expect(a.percentilePaths.length).toBe(b.percentilePaths.length);
    expect(a.percentilePaths[0].p10).toBe(b.percentilePaths[0].p10);
    expect(a.percentilePaths[a.percentilePaths.length - 1].p90).toBe(b.percentilePaths[b.percentilePaths.length - 1].p90);
  });

  it('returns a bounded successRate in [0, 1]', () => {
    const scenario = makeScenario({
      accounts: [
        { id: 'a1', name: 'Brokerage', type: 'taxable_brokerage', balance: 100000, annualReturn: 0.05, annualContribution: 0, employerMatch: 0 },
      ],
      expenses: [
        { id: 'e1', name: 'Living', category: 'housing', annualAmount: 60000, preRetirement: false, postRetirement: true, startAge: null, endAge: null },
      ],
    });
    const mc = runMonteCarloProjection(scenario, { numRuns: 200, returnStdDev: 0.15, seed: 7 });
    expect(mc.successRate).toBeGreaterThanOrEqual(0);
    expect(mc.successRate).toBeLessThanOrEqual(1);
    expect(mc.successCount).toBe(mc.numRuns - mc.depletionCount);
  });

  it('achieves a high success rate with a healthy nest egg', () => {
    const scenario = makeScenario({
      // Realistic early-career plan with steady contributions.
      accounts: [
        { id: 'a1', name: 'Brokerage', type: 'taxable_brokerage', balance: 250000, annualReturn: 0.07, annualContribution: 24000, employerMatch: 0 },
        { id: 'a2', name: '401k', type: 'traditional_401k', balance: 400000, annualReturn: 0.07, annualContribution: 23000, employerMatch: 7000 },
      ],
      expenses: [
        { id: 'e1', name: 'Living', category: 'housing', annualAmount: 60000, preRetirement: false, postRetirement: true, startAge: null, endAge: null },
      ],
      incomeSources: [
        { id: 'i1', name: 'SS', type: 'social_security', annualAmount: 36000, startAge: 67, endAge: null, cola: true, taxable: true },
      ],
    });
    const mc = runMonteCarloProjection(scenario, { numRuns: 500, returnStdDev: 0.15, seed: 1 });
    // With ample savings + SS, almost every run should make it.
    expect(mc.successRate).toBeGreaterThan(0.85);
  });

  it('has a very low success rate when the nest egg is tiny', () => {
    const scenario = makeScenario({
      accounts: [
        { id: 'a1', name: 'Cash', type: 'checking_savings', balance: 10000, annualReturn: 0.02, annualContribution: 0, employerMatch: 0 },
      ],
      expenses: [
        { id: 'e1', name: 'Living', category: 'housing', annualAmount: 60000, preRetirement: false, postRetirement: true, startAge: null, endAge: null },
      ],
    });
    const mc = runMonteCarloProjection(scenario, { numRuns: 200, returnStdDev: 0.15, seed: 99 });
    // A $10k nest egg against $60k/yr of expenses will almost certainly fail.
    expect(mc.successRate).toBeLessThan(0.1);
    expect(mc.depletionCount).toBeGreaterThan(0);
  });

  it('produces monotone percentile paths (P10 ≤ P50 ≤ P90 at every age)', () => {
    const scenario = makeScenario({
      accounts: [
        { id: 'a1', name: 'Brokerage', type: 'taxable_brokerage', balance: 200000, annualReturn: 0.07, annualContribution: 12000, employerMatch: 0 },
      ],
    });
    const mc = runMonteCarloProjection(scenario, { numRuns: 200, returnStdDev: 0.15, seed: 5 });
    for (const p of mc.percentilePaths) {
      expect(p.p10).toBeLessThanOrEqual(p.p50);
      expect(p.p50).toBeLessThanOrEqual(p.p90);
    }
  });

  it('returns one percentile path entry per age in the plan', () => {
    const scenario = makeScenario({
      accounts: [
        { id: 'a1', name: 'Brokerage', type: 'taxable_brokerage', balance: 100000, annualReturn: 0.07, annualContribution: 0, employerMatch: 0 },
      ],
    });
    const mc = runMonteCarloProjection(scenario, { numRuns: 50, returnStdDev: 0.15, seed: 11 });
    // Plan runs from currentAge=40 to endAge=95, so 56 years.
    expect(mc.percentilePaths.length).toBe(56);
    expect(mc.percentilePaths[0].age).toBe(40);
    expect(mc.percentilePaths[mc.percentilePaths.length - 1].age).toBe(95);
  });

  it('produces a usable medianDepletionAge only when at least one run depleted', () => {
    // Tiny nest egg -> many depletions -> medianDepletionAge must be a number.
    const scenario = makeScenario({
      accounts: [
        { id: 'a1', name: 'Cash', type: 'checking_savings', balance: 5000, annualReturn: 0.02, annualContribution: 0, employerMatch: 0 },
      ],
      expenses: [
        { id: 'e1', name: 'Living', category: 'housing', annualAmount: 60000, preRetirement: false, postRetirement: true, startAge: null, endAge: null },
      ],
    });
    const mc = runMonteCarloProjection(scenario, { numRuns: 200, returnStdDev: 0.15, seed: 33 });
    expect(mc.depletionCount).toBeGreaterThan(0);
    expect(mc.medianDepletionAge).not.toBeNull();
    expect(mc.medianDepletionAge!).toBeGreaterThanOrEqual(65);
  });

  it('exposes trialFinalAssets parallel to depletionAges for histogram drill-down', () => {
    const scenario = makeScenario({
      accounts: [
        { id: 'a1', name: 'Brokerage', type: 'taxable_brokerage', balance: 200000, annualReturn: 0.07, annualContribution: 0, employerMatch: 0 },
      ],
    });
    const mc = runMonteCarloProjection(scenario, { numRuns: 50, returnStdDev: 0.15, seed: 11 });
    expect(mc.trialFinalAssets).toHaveLength(50);
    expect(mc.depletionAges).toHaveLength(50);
    // Both arrays share the same ordering — per-trial index lines up.
    for (let i = 0; i < 50; i++) {
      const age = mc.depletionAges[i];
      const assets = mc.trialFinalAssets[i];
      if (age === null) continue; // successful run
      expect(assets).toBeLessThan(1000); // depleted run should be ~zero
    }
  });
});

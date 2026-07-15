import { describe, it, expect } from 'vitest';
import {
  runProjection,
  runMonteCarloProjection,
  createRng,
  computeAnnualMortgage,
  deriveMortgageRate,
  mortgageBalanceAtAge,
  mortgagePaymentAtAge,
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

  it('falls back to assumption returns when an account has no annualReturn (0)', () => {
    // An account with annualReturn === 0 (the "unconfigured" sentinel) should
    // grow at preRetirementReturn during accumulation and postRetirementReturn
    // after retirement — so the assumption fields actually drive the projection.
    const scenario = makeScenario({
      assumptions: { ...makeScenario().assumptions, currentAge: 40, retirementAge: 41, endAge: 43, preRetirementReturn: 0.08, postRetirementReturn: 0.04 },
      accounts: [
        { id: 'a1', name: 'Unset', type: 'taxable_brokerage', balance: 100000, annualReturn: 0, annualContribution: 0, employerMatch: 0 },
      ],
    });
    const result = runProjection(scenario);
    // Age 40 (pre-retirement): grows at 8% → 100000 * 1.08 = 108000.
    expect(result.years[0].growth).toBeCloseTo(8000, -1);
    // Age 41 (retirement year): grows at the post-retirement rate of 4%.
    // beginningAssets = 108000, growth = 108000 * 0.04 = 4320.
    expect(result.years[1].growth).toBeCloseTo(108000 * 0.04, -1);
  });

  it('uses the account explicit return over the assumption fallback', () => {
    // An account with an explicit return always uses it, ignoring the phase
    // assumption — the assumption only fills in for unconfigured accounts.
    const scenario = makeScenario({
      assumptions: { ...makeScenario().assumptions, currentAge: 40, retirementAge: 41, endAge: 42, preRetirementReturn: 0.08, postRetirementReturn: 0.04 },
      accounts: [
        { id: 'a1', name: 'Set', type: 'taxable_brokerage', balance: 100000, annualReturn: 0.06, annualContribution: 0, employerMatch: 0 },
      ],
    });
    const result = runProjection(scenario);
    // Both years use the explicit 6%, never the 8%/4% assumptions.
    expect(result.years[0].growth).toBeCloseTo(6000, -1);
    expect(result.years[1].growth).toBeCloseTo(106000 * 0.06, -1);
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

  it('deposits event proceeds into accounts (home sale grows savings)', () => {
    // A $300k home-sale windfall at age 52 (pre-retirement) should be deposited
    // into the taxable brokerage account, not vanish. (annualReturn: 0 means
    // "unconfigured" → grows at the preRetirementReturn fallback, here 7%.)
    const scenario = makeScenario({
      assumptions: { ...makeScenario().assumptions, currentAge: 50, retirementAge: 65, endAge: 70, inflationRate: 0 },
      accounts: [
        { id: 'a1', name: 'Brokerage', type: 'taxable_brokerage', balance: 100000, annualReturn: 0, annualContribution: 0, employerMatch: 0 },
      ],
      events: [
        { id: 'ev1', name: 'Sell house', type: 'home_sale', age: 52, cost: 0, proceeds: 300000, ongoingAnnualImpact: 0, ongoingDurationYears: null, notes: '' },
      ],
    });
    const result = runProjection(scenario);
    // At age 52: eventCashFlow = +300000, no expenses/income, so netNeed = -300000.
    // The full $300k should be deposited into the brokerage.
    const eventYear = result.years.find((y) => y.age === 52)!;
    expect(eventYear.eventCashFlow).toBe(300000);
    expect(eventYear.deposits).toBe(300000);
    // End-of-year assets: 100000 compounds at 7% (the fallback) for 3 years,
    // then the 300000 deposit is added → 100000 × 1.07³ + 300000 ≈ 422504.
    expect(eventYear.endingAssets).toBeCloseTo(100000 * Math.pow(1.07, 3) + 300000, -1);
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

  it('grows COLA income at the Social Security COLA rate, decoupled from inflation', () => {
    // Social Security entered as $34,800/yr, starts at 67. The amount is in
    // today's dollars, so at startAge it's inflation-adjusted to nominal, then
    // grows by its OWN COLA rate (2.5%) each year — NOT by general inflation.
    // This decouples benefit growth from CPI (SS COLA is set separately).
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

    // At age 67 (start): 34800 * 1.03^7 ≈ 42799 (inflation-adjusted to nominal,
    // no COLA growth yet since yearsSinceStart = 0).
    const age67 = result.years.find((y) => y.age === 67)!;
    expect(age67.income).toBeCloseTo(34800 * Math.pow(1.03, 7), -1);

    // At age 68: nominalAtStart * 1.025^1 = 42799 * 1.025 ≈ 43869.
    // (Previously the whole amount grew at inflation: 34800 * 1.03^8 ≈ 44083.)
    const age68 = result.years.find((y) => y.age === 68)!;
    const nominalAtStart = 34800 * Math.pow(1.03, 7);
    expect(age68.income).toBeCloseTo(nominalAtStart * 1.025, -1);

    // Verify real (today's $) income at the start is still ~34800.
    const realIncome67 = age67.income / Math.pow(1.03, 7);
    expect(realIncome67).toBeCloseTo(34800, -1);
  });

  it('falls back to inflation when socialSecurityCola equals inflationRate', () => {
    // When COLA == inflation, the decoupled formula reduces to pure inflation
    // growth (the original behavior), so the two rates are interchangeable.
    const scenario = makeScenario({
      assumptions: { ...makeScenario().assumptions, currentAge: 60, retirementAge: 67, endAge: 75, inflationRate: 0.03, socialSecurityCola: 0.03 },
      accounts: [
        { id: 'a1', name: 'Savings', type: 'taxable_brokerage', balance: 10000000, annualReturn: 0, annualContribution: 0, employerMatch: 0 },
      ],
      incomeSources: [
        { id: 'i1', name: 'SS', type: 'social_security', annualAmount: 34800, startAge: 67, endAge: null, cola: true, taxable: false },
      ],
    });
    const result = runProjection(scenario);
    const age70 = result.years.find((y) => y.age === 70)!;
    // 3 years of COLA at 3% from the start-age nominal: 34800 * 1.03^7 * 1.03^3
    // = 34800 * 1.03^10 (COLA == inflation → identical to pure inflation growth).
    expect(age70.income).toBeCloseTo(34800 * Math.pow(1.03, 10), -1);
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

  it('produces a median depletion age over all runs (successes right-censored)', () => {
    // Tiny nest egg -> many depletions. medianDepletionAge is the median over
    // ALL runs, with successful runs (no depletion) right-censored at plan end.
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
    // Capped at planEndAge (95) — most runs deplete earlier, so the median
    // lands somewhere in retirement, before the plan end.
    expect(mc.medianDepletionAge!).toBeGreaterThanOrEqual(65);
    expect(mc.medianDepletionAge!).toBeLessThanOrEqual(95);
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

  it('exposes trialPeakAssets and trialAssetsAtRetirement for drill-down drawdown', () => {
    // Tiny nest egg → most runs deplete. Each depleted run should have:
    //   - trialPeakAssets > 0 (they built up something before crashing)
    //   - trialAssetsAtRetirement > 0 (they had a nest egg at retirementAge)
    //   - peak ≥ retirement_assets ≥ final_assets (peak is the high-water mark)
    const scenario = makeScenario({
      accounts: [
        { id: 'a1', name: 'Cash', type: 'checking_savings', balance: 5000, annualReturn: 0.02, annualContribution: 0, employerMatch: 0 },
      ],
      expenses: [
        { id: 'e1', name: 'Living', category: 'housing', annualAmount: 60000, preRetirement: false, postRetirement: true, startAge: null, endAge: null },
      ],
    });
    const mc = runMonteCarloProjection(scenario, { numRuns: 200, returnStdDev: 0.15, seed: 44 });
    expect(mc.trialPeakAssets).toHaveLength(200);
    expect(mc.trialAssetsAtRetirement).toHaveLength(200);
    // Find the depleted runs and verify the invariants on each.
    let checkedDepleted = 0;
    for (let i = 0; i < 200; i++) {
      if (mc.depletionAges[i] === null) continue; // skip successful runs
      const peak = mc.trialPeakAssets[i];
      const atRet = mc.trialAssetsAtRetirement[i];
      const final = mc.trialFinalAssets[i];
      expect(peak).toBeGreaterThan(0);
      expect(atRet).toBeGreaterThan(0);
      expect(peak).toBeGreaterThanOrEqual(atRet);
      expect(peak).toBeGreaterThanOrEqual(final);
      checkedDepleted++;
      if (checkedDepleted > 20) break; // sample, don't check all
    }
    expect(checkedDepleted).toBeGreaterThan(0);
  });
});

/* ============================================================
   PROPERTY NET-WORTH TESTS
   ============================================================
   Property values are now part of net worth (see ProjectionYear).
   These tests pin down the appreciation / sale / future-purchase
   semantics so future engine changes don't silently regress them. */

describe('runProjection property net worth', () => {
  it('reports zero propertyValue when no properties exist', () => {
    const scenario = makeScenario({
      accounts: [
        { id: 'a1', name: 'Brokerage', type: 'taxable_brokerage', balance: 100000, annualReturn: 0.05, annualContribution: 0, employerMatch: 0 },
      ],
    });
    const result = runProjection(scenario);
    for (const y of result.years) {
      expect(y.propertyValue).toBe(0);
      expect(y.propertyEquity).toBe(0);
      expect(y.realPropertyValue).toBe(0);
      expect(y.realPropertyEquity).toBe(0);
    }
  });

  it('appraises an owned property each year using annualAppreciation', () => {
    // $500k home, 3% annual appreciation. At age 40, value=500k. At 50,
    // value = 500k * 1.03^10 ≈ 671,958.
    const scenario = makeScenario({
      accounts: [],
      properties: [
        {
          id: 'p1',
          name: 'Family Home',
          type: 'primary_residence',
          currentValue: 500000,
          mortgageBalance: 200000,
          mortgagePayment: 12000,
          mortgageYearsLeft: 25,
          annualAppreciation: 0.03,
          annualPropertyTax: 6000,
          annualInsurance: 1800,
        },
      ],
    });
    const result = runProjection(scenario);
    const yr40 = result.years.find((y) => y.age === 40)!;
    const yr50 = result.years.find((y) => y.age === 50)!;
    expect(yr40.propertyValue).toBeCloseTo(500000, 0);
    expect(yr50.propertyValue).toBeCloseTo(500000 * Math.pow(1.03, 10), 0);
  });

  it('amortizes mortgage balance into propertyEquity over the loan term', () => {
    // The mortgage amortizes: by age 50 (10 years in), the balance has paid
    // down from 200k at the derived rate, so equity = value − remaining balance.
    const prop = {
      id: 'p1',
      name: 'Family Home',
      type: 'primary_residence' as const,
      currentValue: 500000,
      mortgageBalance: 200000,
      mortgagePayment: 12000,
      mortgageYearsLeft: 25,
      annualAppreciation: 0.03,
      annualPropertyTax: 6000,
      annualInsurance: 1800,
    };
    const scenario = makeScenario({ accounts: [], properties: [prop] });
    const result = runProjection(scenario);
    const yr50 = result.years.find((y) => y.age === 50)!;
    const expectedBalance = mortgageBalanceAtAge(prop, 50, 40);
    // Balance must have paid down (less than the original 200k, more than 0).
    expect(expectedBalance).toBeGreaterThan(0);
    expect(expectedBalance).toBeLessThan(200000);
    expect(yr50.propertyEquity).toBeCloseTo(
      500000 * Math.pow(1.03, 10) - expectedBalance,
      0,
    );
  });

  it('returns 0 property value after saleAge', () => {
    const scenario = makeScenario({
      accounts: [],
      properties: [
        {
          id: 'p1',
          name: 'Family Home',
          type: 'primary_residence',
          currentValue: 500000,
          mortgageBalance: 200000,
          annualAppreciation: 0.03,
          annualPropertyTax: 6000,
          annualInsurance: 1800,
          saleAge: 65,
          saleProceeds: 350000,
        },
      ],
    });
    const result = runProjection(scenario);
    // At age 64 (just before sale), value is still positive.
    const yr64 = result.years.find((y) => y.age === 64)!;
    expect(yr64.propertyValue).toBeGreaterThan(0);
    // At age 65 (sale year), value drops to 0.
    const yr65 = result.years.find((y) => y.age === 65)!;
    expect(yr65.propertyValue).toBe(0);
    expect(yr65.propertyEquity).toBe(0);
    // And stays 0 forever after.
    const yr80 = result.years.find((y) => y.age === 80)!;
    expect(yr80.propertyValue).toBe(0);
  });

  it('returns 0 property value before purchaseAge for future purchases', () => {
    // Property bought at age 55 with $400k purchase price and 3% appreciation.
    // Before 55: value = 0. From 55 onward: value = 400000 * 1.03^(age-55).
    const scenario = makeScenario({
      accounts: [],
      properties: [
        {
          id: 'p1',
          name: 'Vacation Home',
          type: 'vacation',
          currentValue: 0,
          mortgageBalance: 0,
          annualAppreciation: 0.03,
          annualPropertyTax: 0,
          annualInsurance: 0,
          purchaseAge: 55,
          purchasePrice: 400000,
          downPayment: 80000,
          mortgageRate: 0.06,
          mortgageTerm: 30,
        },
      ],
    });
    const result = runProjection(scenario);
    const yr54 = result.years.find((y) => y.age === 54)!;
    const yr55 = result.years.find((y) => y.age === 55)!;
    const yr60 = result.years.find((y) => y.age === 60)!;
    expect(yr54.propertyValue).toBe(0);
    expect(yr55.propertyValue).toBeCloseTo(400000, 0);
    expect(yr60.propertyValue).toBeCloseTo(400000 * Math.pow(1.03, 5), 0);
  });

  it('exposes propertyValue and propertyEquity in nominal and real ($today) terms', () => {
    const scenario = makeScenario({
      accounts: [],
      properties: [
        {
          id: 'p1',
          name: 'Family Home',
          type: 'primary_residence',
          currentValue: 500000,
          mortgageBalance: 100000,
          annualAppreciation: 0.03,
          annualPropertyTax: 6000,
          annualInsurance: 1800,
        },
      ],
    });
    const result = runProjection(scenario);
    // At age 40 (currentAge), nominal === real for value (inflationFactor=1).
    const yr40 = result.years.find((y) => y.age === 40)!;
    expect(yr40.realPropertyValue).toBeCloseTo(yr40.propertyValue, 0);
    expect(yr40.realPropertyEquity).toBeCloseTo(yr40.propertyEquity, 0);
    // At age 50 (10 years out), inflation reduces real values relative to nominal.
    const yr50 = result.years.find((y) => y.age === 50)!;
    expect(yr50.realPropertyValue).toBeLessThan(yr50.propertyValue);
    // realPropertyValue = nominal / (1 + inflation)^10
    const inflationFactor = Math.pow(1 + 0.03, 10);
    expect(yr50.realPropertyValue).toBeCloseTo(yr50.propertyValue / inflationFactor, 0);
  });

  it('lets getReadinessSummary combine accounts and home equity for "nest egg at retirement"', () => {
    // At retirement, the net worth should be account balance + property equity.
    const prop = {
      id: 'p1',
      name: 'Family Home',
      type: 'primary_residence' as const,
      currentValue: 500000,
      mortgageBalance: 100000,
      annualAppreciation: 0.03,
      annualPropertyTax: 6000,
      annualInsurance: 1800,
    };
    const scenario = makeScenario({
      accounts: [
        { id: 'a1', name: '401k', type: 'traditional_401k', balance: 600000, annualReturn: 0.07, annualContribution: 15000, employerMatch: 5000 },
      ],
      properties: [prop],
    });
    const result = runProjection(scenario);
    const retYear = result.years.find((y) => y.age === scenario.assumptions.retirementAge)!;
    // Total net worth at retirement = endingAssets (accounts) + propertyEquity.
    const totalNetWorth = retYear.endingAssets + retYear.propertyEquity;
    // The mortgage amortizes from 100k. With no payment/term given, defaults
    // apply (payment = 100k/30, term = 30, derived rate = 0% → linear paydown).
    const expectedBalance = mortgageBalanceAtAge(prop, scenario.assumptions.retirementAge, scenario.assumptions.currentAge);
    expect(retYear.propertyEquity).toBeCloseTo(
      500000 * Math.pow(1.03, 25) - expectedBalance,
      0,
    );
    // Sanity: propertyEquity should be a large positive contribution.
    expect(retYear.propertyEquity).toBeGreaterThan(500000);
    // The summary's nestEggAtRetirement uses the accounts-only beginningAssets;
    // net worth including property lives in the year row directly.
    expect(totalNetWorth).toBeGreaterThan(retYear.endingAssets);
  });
});

/* ============================================================
   MORTGAGE AMORTIZATION TESTS
   ============================================================
   The engine amortizes mortgages directly from the property fields, so the
   balance pays down over the loan term (raising equity) and the contractual
   payment is NOT inflated like a living expense. These pin down that
   behavior so it doesn't silently regress. */

describe('mortgage amortization helpers', () => {
  it('derives a rate whose amortization payment matches the input', () => {
    // The contract of deriveMortgageRate: at the derived rate, the standard
    // amortization payment (computeAnnualMortgage) reproduces the input payment.
    // 200k balance, 12k/yr payment, 25 years → a positive rate (~3.5%).
    const balance = 200000;
    const payment = 12000;
    const years = 25;
    const rate = deriveMortgageRate(balance, payment, years);
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeLessThan(1);
    // The payment at the derived rate must match the input payment (the bisection
    // targets exactly this). And the balance at term must reach ~0 under that
    // rate+payment — verify via mortgageBalanceAtAge for self-consistency.
    expect(computeAnnualMortgage(balance, rate, years)).toBeCloseTo(payment, -1);
    const prop = {
      currentValue: 0,
      mortgageBalance: balance,
      mortgagePayment: payment,
      mortgageYearsLeft: years,
      annualAppreciation: 0.03,
      annualPropertyTax: 0,
      annualInsurance: 0,
    };
    expect(mortgageBalanceAtAge(prop, 40 + years, 40)).toBeCloseTo(0, -3);
  });

  it('returns 0 rate when the payment cannot even cover principal', () => {
    // 200k balance, 1k/yr payment, 25 years: 25k paid < 200k principal.
    // No positive rate amortizes this — must return 0 (treated linearly).
    expect(deriveMortgageRate(200000, 1000, 25)).toBe(0);
  });

  it('amortizes the balance down to ~0 over the loan term', () => {
    const prop = {
      currentValue: 500000,
      mortgageBalance: 200000,
      mortgagePayment: 12000,
      mortgageYearsLeft: 25,
      annualAppreciation: 0.03,
      annualPropertyTax: 0,
      annualInsurance: 0,
    };
    // currentAge = 40, so the loan ends at age 65. At age 64 it's near zero;
    // at age 65+ it's fully paid off.
    expect(mortgageBalanceAtAge(prop, 50, 40)).toBeLessThan(200000);
    expect(mortgageBalanceAtAge(prop, 50, 40)).toBeGreaterThan(0);
    expect(mortgageBalanceAtAge(prop, 65, 40)).toBeCloseTo(0, -3);
  });

  it('returns 0 payment after the loan has paid off', () => {
    const prop = {
      currentValue: 500000,
      mortgageBalance: 200000,
      mortgagePayment: 12000,
      mortgageYearsLeft: 25,
      annualAppreciation: 0.03,
      annualPropertyTax: 0,
      annualInsurance: 0,
    };
    // Before payoff (age 50): payment is the contractual amount.
    expect(mortgagePaymentAtAge(prop, 50, 40)).toBe(12000);
    // After payoff (age 66): no payment due.
    expect(mortgagePaymentAtAge(prop, 66, 40)).toBe(0);
  });

  it('future-purchase mortgage amortizes from purchasePrice minus downPayment', () => {
    const prop = {
      currentValue: 0,
      mortgageBalance: 0,
      purchaseAge: 55,
      purchasePrice: 400000,
      downPayment: 80000,
      mortgageRate: 0.06,
      mortgageTerm: 30,
      annualAppreciation: 0.03,
      annualPropertyTax: 0,
      annualInsurance: 0,
    };
    // Before purchase: no balance, no payment.
    expect(mortgageBalanceAtAge(prop, 54, 40)).toBe(0);
    expect(mortgagePaymentAtAge(prop, 54, 40)).toBe(0);
    // At purchase age: balance = 400k − 80k = 320k.
    expect(mortgageBalanceAtAge(prop, 55, 40)).toBeCloseTo(320000, 0);
    // Payment matches the amortization formula on 320k @ 6% / 30 yrs.
    const expectedPayment = computeAnnualMortgage(320000, 0.06, 30);
    expect(mortgagePaymentAtAge(prop, 55, 40)).toBeCloseTo(expectedPayment, 0);
    // After full term (age 85): paid off.
    expect(mortgageBalanceAtAge(prop, 86, 40)).toBe(0);
  });

  it('returns 0 balance and payment after a sale', () => {
    const prop = {
      currentValue: 500000,
      mortgageBalance: 200000,
      mortgagePayment: 12000,
      mortgageYearsLeft: 25,
      annualAppreciation: 0.03,
      annualPropertyTax: 0,
      annualInsurance: 0,
      saleAge: 60,
    };
    expect(mortgageBalanceAtAge(prop, 60, 40)).toBe(0);
    expect(mortgagePaymentAtAge(prop, 60, 40)).toBe(0);
  });
});

describe('runProjection mortgage expenses', () => {
  it('does not inflate the mortgage payment (contractual, fixed)', () => {
    // Mortgage payment is contractual — it must NOT grow with inflation,
    // unlike property tax which does. Compare two consecutive retirement
    // years: property tax should rise with inflation, mortgage stays flat.
    const scenario = makeScenario({
      assumptions: { ...makeScenario().assumptions, currentAge: 64, retirementAge: 65, endAge: 68, inflationRate: 0.05 },
      accounts: [
        { id: 'a1', name: 'Cash', type: 'checking_savings', balance: 10_000_000, annualReturn: 0, annualContribution: 0, employerMatch: 0 },
      ],
      properties: [
        {
          id: 'p1',
          name: 'Home',
          type: 'primary_residence',
          currentValue: 500000,
          mortgageBalance: 100000,
          mortgagePayment: 10000,
          mortgageYearsLeft: 20,
          annualAppreciation: 0.03,
          annualPropertyTax: 6000,
          annualInsurance: 0,
        },
      ],
      expenses: [
        // Property tax as a linked expense — the engine reads housing costs
        // from the expense list (mortgage is the exception, computed directly).
        { id: 't1', name: 'Home — Property Tax', category: 'housing', annualAmount: 6000, preRetirement: false, postRetirement: true, startAge: null, endAge: null, _propertyId: 'p1:tax' },
      ],
    });
    const result = runProjection(scenario);
    const age65 = result.years.find((y) => y.age === 65)!;
    const age66 = result.years.find((y) => y.age === 66)!;

    // Property tax (linked expense) inflates with yearsFromNow; mortgage is flat.
    //   age65 (yearsFromNow=1): tax = 6000 × 1.05 = 6300, mortgage = 10000 → 16300
    //   age66 (yearsFromNow=2): tax = 6000 × 1.05² = 6615, mortgage = 10000 → 16615
    expect(age65.expenses).toBeCloseTo(6300 + 10000, -1);
    expect(age66.expenses).toBeCloseTo(6615 + 10000, -1);
    // The mortgage portion is identical across years (no inflation growth):
    // subtract the inflated tax from each year; both should equal 10000.
    const mortgage65 = age65.expenses - 6000 * 1.05;
    const mortgage66 = age66.expenses - 6000 * 1.05 * 1.05;
    expect(mortgage65).toBeCloseTo(10000, -1);
    expect(mortgage66).toBeCloseTo(10000, -1);
    expect(mortgage65).toBeCloseTo(mortgage66, -1);
  });

  it('stops counting the mortgage expense after the loan pays off', () => {
    // 100k balance, 10k/yr payment, 10 years left → pays off by age 50.
    // After payoff, expenses should drop by the mortgage amount.
    const scenario = makeScenario({
      assumptions: { ...makeScenario().assumptions, currentAge: 40, retirementAge: 40, endAge: 52, inflationRate: 0 },
      accounts: [
        { id: 'a1', name: 'Cash', type: 'checking_savings', balance: 10_000_000, annualReturn: 0, annualContribution: 0, employerMatch: 0 },
      ],
      properties: [
        {
          id: 'p1',
          name: 'Home',
          type: 'primary_residence',
          currentValue: 500000,
          mortgageBalance: 100000,
          mortgagePayment: 10000,
          mortgageYearsLeft: 10,
          annualAppreciation: 0.03,
          annualPropertyTax: 0,
          annualInsurance: 0,
        },
      ],
    });
    const result = runProjection(scenario);
    // Age 49 (year 10): mortgage still being paid → expenses ≥ 10000.
    const age49 = result.years.find((y) => y.age === 49)!;
    expect(age49.expenses).toBeGreaterThanOrEqual(10000);
    // Age 51 (after payoff): no mortgage → expenses drop to ~0.
    const age51 = result.years.find((y) => y.age === 51)!;
    expect(age51.expenses).toBeLessThan(1000);
  });
});

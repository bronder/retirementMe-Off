/**
 * Financial projection engine.
 *
 * Simulates a scenario year-by-year from the current age to the end age,
 * modeling contributions/growth during accumulation, and income/withdrawals/
 * expenses during retirement. Handles inflation (COLA), taxes (simplified),
 * and one-time/ongoing life events.
 */
import type {
  Scenario,
  ProjectionYear,
  ProjectionResult,
  Account,
  MonteCarloOptions,
  MonteCarloResult,
  MonteCarloPercentileYear,
} from './types';
import { ACCOUNT_TAX_TREATMENT } from './types';
import type { AccountTaxTreatment } from './types';

interface AccountState {
  account: Account;
  balance: number;
}

/**
 * A function that returns the annual return to apply to an account for a
 * given (age, calendar year). The deterministic projection passes a function
 * that always returns the account's configured `annualReturn`. Monte Carlo
 * passes a sampler that draws from a log-normal distribution each call.
 */
export type AnnualReturnSampler = (account: Account, age: number, year: number) => number;

/**
 * Run a full projection for a single scenario with the user-configured
 * annual return on each account (deterministic — same value every run).
 *
 * This is the existing single-run behavior used by every UI view. To run
 * randomized simulations, see `runMonteCarloProjection` below.
 */
export function runProjection(scenario: Scenario): ProjectionResult {
  // Default sampler: just return the account's configured expected return.
  const deterministic: AnnualReturnSampler = (acc) => acc.annualReturn;
  return runProjectionCore(scenario, deterministic);
}

/**
 * Core projection loop. Identical to `runProjection` but takes a return
 * sampler so Monte Carlo can inject randomness without changing the
 * single-run semantics.
 */
export function runProjectionCore(
  scenario: Scenario,
  sampleAnnualReturn: AnnualReturnSampler,
): ProjectionResult {
  const { assumptions } = scenario;
  const years: ProjectionYear[] = [];

  const accountStates: AccountState[] = scenario.accounts.map((a) => ({
    account: a,
    balance: a.balance,
  }));

  let depleted: number | null = null;
  const startYear = new Date().getFullYear();
  const birthYear = startYear - assumptions.currentAge;

  // When spouse planning is enabled, extend the projection to cover the
  // longer-lived partner's lifespan.
  const planEndAge =
    assumptions.spouse?.enabled
      ? Math.max(assumptions.endAge, assumptions.spouse.endAge)
      : assumptions.endAge;


  for (let age = assumptions.currentAge; age <= planEndAge; age++) {
    const year = birthYear + age;
    const yearsFromNow = age - assumptions.currentAge;
    const isRetired = age >= assumptions.retirementAge;
    const inflationFactor = Math.pow(1 + assumptions.inflationRate, yearsFromNow);
    const beginningAssets = sumBalances(accountStates);

    // --- Contributions (pre-retirement only) ---
    let contributions = 0;
    if (!isRetired) {
      for (const s of accountStates) {
        const nominalContribution = s.account.annualContribution * inflationFactor;
        const nominalMatch = s.account.employerMatch * inflationFactor;
        const total = nominalContribution + nominalMatch;
        s.balance += total;
        contributions += total;
      }
    }

    // --- Growth ---
    // Use the provided sampler so Monte Carlo can randomize per (account, year)
    // while the deterministic path still gets the account's configured return.
    let growth = 0;
    for (const s of accountStates) {
      const r = sampleAnnualReturn(s.account, age, year);
      const g = s.balance * r;
      s.balance += g;
      growth += g;
    }

    // --- Income (any active income source, pre- or post-retirement) ---
    // All income amounts are entered in today's dollars (same as expenses).
    let income = 0;
    for (const inc of scenario.incomeSources) {
      if (age >= inc.startAge && (inc.endAge === null || age <= inc.endAge)) {
        let nominalGross: number;
        if (inc.cola) {
          // COLA income (e.g. Social Security): grows with inflation from
          // today's dollars. inflationFactor already captures this growth —
          // a separate COLA factor would double-count inflation.
          nominalGross = inc.annualAmount * inflationFactor;
        } else {
          // Non-COLA income (e.g. fixed pension): the nominal amount is set
          // at startAge (inflated from today's dollars) and stays fixed.
          const startAgeInflation = Math.pow(
            1 + assumptions.inflationRate,
            inc.startAge - assumptions.currentAge,
          );
          nominalGross = inc.annualAmount * startAgeInflation;
        }
        const nominalNet = inc.taxable
          ? nominalGross * (1 - assumptions.retirementTaxRate)
          : nominalGross;
        income += nominalNet;
      }
    }

    // --- Expenses ---
    let expenses = 0;
    for (const exp of scenario.expenses) {
      const activePre = exp.preRetirement && !isRetired;
      const activePost = exp.postRetirement && isRetired;
      if (!activePre && !activePost) continue;
      if (exp.startAge !== null && age < exp.startAge) continue;
      if (exp.endAge !== null && age > exp.endAge) continue;
      expenses += exp.annualAmount * inflationFactor;
    }

    // --- Life events (initialize first) ---
    let eventCashFlow = 0;

    // --- Properties (purchase, sale events only) ---
    // Housing costs (property tax, insurance, mortgage) are now sourced from the
    // Expenses section — each property auto-creates linked expense entries on
    // add/update, so the engine no longer reads them from the Property fields.
    // The Property section only tracks net worth and one-time purchase/sale events.
    if (scenario.properties) {
      for (const prop of scenario.properties) {
        // One-time purchase: down payment deducted from savings
        if (prop.purchaseAge && age === prop.purchaseAge) {
          const dp = (prop.downPayment ?? 0) * inflationFactor;
          eventCashFlow -= dp; // reduces net worth
        }

        // One-time sale: proceeds added to savings
        if (prop.saleAge && age === prop.saleAge) {
          eventCashFlow += (prop.saleProceeds ?? 0) * inflationFactor;
        }
      }
    }

    // --- Life events ---
    for (const ev of scenario.events) {
      if (ev.age === age) {
        eventCashFlow += ev.proceeds - ev.cost;
      }
      if (age >= ev.age && ev.ongoingAnnualImpact !== 0) {
        const dur = ev.ongoingDurationYears;
        if (dur === null || age < ev.age + dur) {
          expenses += ev.ongoingAnnualImpact * inflationFactor;
        }
      }
    }

    // --- Withdrawals / Deposits ---
    // Determine the net cash needed from (or surplus to deposit into) assets.
    // eventCashFlow is net cash IN from events: positive = proceeds exceed
    // costs (e.g. a home sale), negative = costs exceed proceeds (e.g. a
    // down payment). The formula is the same for pre- and post-retirement:
    //   netNeed = expenses - income - eventCashFlow
    // When positive, we must withdraw from savings to cover the gap.
    // When negative, the surplus (e.g. sale proceeds) is deposited into
    // accounts so it actually grows your net worth.
    const netNeed = expenses - income - eventCashFlow;

    // Withdraw returns the GROSS amount pulled from accounts (incl. tax gross-up).
    let withdrawals = 0;
    if (netNeed > 0) {
      withdrawals = withdrawFromAccounts(accountStates, netNeed, assumptions.retirementTaxRate);
    }

    // Deposit surplus cash flow (event proceeds beyond what's needed) into
    // accounts so it compounds rather than vanishing. Deposit into taxable
    // first (most flexible), then tax-deferred, then tax-free.
    let deposits = 0;
    if (netNeed < 0) {
      deposits = depositToAccounts(accountStates, -netNeed);
    }

    const endingAssets = sumBalances(accountStates);
    if (depleted === null && endingAssets <= 0) {
      depleted = age;
    }

    years.push({
      age,
      year,
      beginningAssets: Math.max(0, beginningAssets),
      contributions,
      growth,
      withdrawals,
      deposits,
      endingAssets: Math.max(0, endingAssets),
      income,
      expenses,
      eventCashFlow,
      realAssets: Math.max(0, endingAssets) / inflationFactor,
      depleted: endingAssets <= 0,
    });
  }

  const last = years[years.length - 1];
  const finalInflation = Math.pow(
    1 + assumptions.inflationRate,
    planEndAge - assumptions.currentAge,
  );

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    years,
    depletionAge: depleted,
    finalAssets: last?.endingAssets ?? 0,
    finalAssetsReal: (last?.endingAssets ?? 0) / finalInflation,
    success: depleted === null,
  };
}

function sumBalances(states: AccountState[]): number {
  return states.reduce((sum, s) => sum + s.balance, 0);
}

/**
 * Deposit surplus cash flow (e.g. home-sale proceeds) into accounts so it
 * compounds rather than vanishing. Fill order mirrors the withdrawal order
 * (taxable → tax-deferred → tax-free) for symmetry: taxable accounts are
 * the most flexible destination for lump sums, and deposits are untaxed
 * regardless of bucket (no gross-up needed).
 *
 * Returns the total amount deposited.
 */
function depositToAccounts(states: AccountState[], amount: number): number {
  let remaining = amount;
  const buckets: AccountTaxTreatment[] = ['taxable', 'tax_deferred', 'tax_free'];
  for (const treatment of buckets) {
    if (remaining <= 0) break;
    for (const s of states) {
      if (ACCOUNT_TAX_TREATMENT[s.account.type] !== treatment) continue;
      if (remaining <= 0) break;
      s.balance += remaining;
      remaining = 0;
    }
  }
  return amount - remaining;
}

/**
 * Withdraw from accounts in tax-aware order: taxable, then tax-deferred, then Roth.
 * Tax-deferred withdrawals are grossed up for the retirement tax rate.
 * Returns the total GROSS amount withdrawn from accounts.
 */
function withdrawFromAccounts(
  states: AccountState[],
  amountNeeded: number,
  taxRate: number,
): number {
  let remaining = amountNeeded;
  let totalGross = 0;

  remaining = withdrawFromBucket(states, 'taxable', remaining, 1, (g) => (totalGross += g));
  if (remaining > 0) {
    const grossFactor = taxRate > 0 && taxRate < 1 ? 1 / (1 - taxRate) : 1;
    remaining = withdrawFromBucket(states, 'tax_deferred', remaining, grossFactor, (g) => (totalGross += g));
  }
  if (remaining > 0) {
    withdrawFromBucket(states, 'tax_free', remaining, 1, (g) => (totalGross += g));
  }
  return totalGross;
}

function withdrawFromBucket(
  states: AccountState[],
  treatment: 'taxable' | 'tax_deferred' | 'tax_free',
  netNeeded: number,
  grossFactor: number,
  onWithdraw: (gross: number) => void,
): number {
  let remaining = netNeeded;
  for (const s of states) {
    if (ACCOUNT_TAX_TREATMENT[s.account.type] !== treatment) continue;
    if (remaining <= 0) break;
    const grossNeeded = remaining * grossFactor;
    const take = Math.min(s.balance, grossNeeded);
    s.balance -= take;
    onWithdraw(take);
    remaining -= take / grossFactor;
  }
  return Math.max(0, remaining);
}

export interface ReadinessSummary {
  nestEggAtRetirement: number;
  nestEggAtRetirementReal: number;
  firstYearExpenses: number;
  firstYearIncome: number;
  firstYearWithdrawal: number;
  safeWithdrawalAmount: number;
  onTrack: boolean;
  neededWithdrawalRate: number;
}

export function getReadinessSummary(
  result: ProjectionResult,
  retirementAge: number,
  safeWithdrawalRate: number,
): ReadinessSummary {
  const retirementYear = result.years.find((y) => y.age === retirementAge);
  if (!retirementYear) {
    return {
      nestEggAtRetirement: 0,
      nestEggAtRetirementReal: 0,
      firstYearExpenses: 0,
      firstYearIncome: 0,
      firstYearWithdrawal: 0,
      safeWithdrawalAmount: 0,
      onTrack: false,
      neededWithdrawalRate: 0,
    };
  }

  const nestEgg = retirementYear.beginningAssets;
  const withdrawal = retirementYear.withdrawals;
  const income = retirementYear.income;
  const safe = nestEgg * safeWithdrawalRate;

  return {
    nestEggAtRetirement: nestEgg,
    nestEggAtRetirementReal: retirementYear.realAssets,
    firstYearExpenses: retirementYear.expenses,
    firstYearIncome: income,
    firstYearWithdrawal: withdrawal,
    safeWithdrawalAmount: safe,
    onTrack: withdrawal <= safe + income,
    neededWithdrawalRate: nestEgg > 0 ? withdrawal / nestEgg : 1,
  };
}

/* ============================================================
   MONTE CARLO ENGINE
   ============================================================
   A deterministic seedable RNG (mulberry32) so test runs are reproducible.
   Box-Muller transform turns two uniform draws into one standard-normal draw.
   A log-normal return is built so the effective annual return can never
   go below -100% — a more realistic model for long-horizon compounding
   than a clipped normal distribution.
*/

export interface SeededRng {
  /** Returns a uniform real in [0, 1). */
  next(): number;
}

/**
 * mulberry32 — a tiny, fast, well-distributed 32-bit seedable PRNG.
 * https://github.com/bryc/code/blob/master/jshash/PRNGs.md
 */
export function createRng(seed: number): SeededRng {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/**
 * Standard-normal sample via the Box-Muller transform.
 * Consumes 2 uniforms; the second is stashed for the next call so the RNG
 * remains deterministic at every call boundary.
 *
 * Guard: u1 must be strictly > 0 (or the log(0) in Box-Muller produces -Infinity
 * and the downstream exp silently propagates NaN). We resample until we get a
 * non-zero uniform — rare in practice since the PRNG output is in (0, 1).
 */
class NormalSampler {
  private cached: number | null = null;
  constructor(private readonly rng: SeededRng) {}
  next(): number {
    if (this.cached !== null) {
      const v = this.cached;
      this.cached = null;
      return v;
    }
    // Box-Muller: keep drawing u1 until it's strictly > 0, then split
    // the result into two cached normals (saves ~half the random draws).
    let u1: number;
    do {
      u1 = this.rng.next();
    } while (u1 === 0);
    const u2 = this.rng.next();
    const mag = Math.sqrt(-2 * Math.log(u1));
    const z0 = mag * Math.cos(2 * Math.PI * u2);
    const z1 = mag * Math.sin(2 * Math.PI * u2);
    this.cached = z1;
    return z0;
  }
}

/**
 * Build a sampler that picks, per (account, year), a log-normal return
 * whose expected value equals the account's `annualReturn` and whose
 * standard deviation equals `sigma`. Each draw is independent.
 *
 * Calibration: with r = e^x - 1 and x ~ N(m, σ²), the expected return is
 *   E[r] = exp(m + σ²/2) - 1,
 * so to hit an expected return μ we set  m = log(1 + μ) - σ²/2.
 *
 * The Box-Muller upstream guard (u1 ≠ 0) ensures x is always finite, so the
 * downstream exp(...) is always defined — no clamping needed here. (Log-normal
 * draws are already bounded below at 0% in expectation, and the calibration
 * keeps the median outcome stable across σ values.)
 */
export function createLogNormalReturnSampler(
  rng: SeededRng,
  sigma: number,
): AnnualReturnSampler {
  const normal = new NormalSampler(rng);
  return (acc) => {
    const mu = acc.annualReturn;
    if (sigma <= 0) return mu; // degenerate: deterministic
    const m = Math.log(1 + mu) - (sigma * sigma) / 2;
    const x = m + sigma * normal.next();
    return Math.exp(x) - 1; // log-normal: r > -1 always when x is finite
  };
}

/**
 * Wilson 95% confidence interval for a binomial proportion (successRate).
 * The naive ±√(p(1-p)/n) intervals can produce bounds outside [0, 1] for
 * extreme proportions; Wilson's score interval handles that correctly and is
 * standard for low-n or near-0/near-1 proportions.
 */
function wilson95CI(successes: number, n: number): { lower: number; upper: number } {
  if (n === 0) return { lower: 0, upper: 1 };
  const p = successes / n;
  const z = 1.959963984540054; // z for 95% two-sided
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const margin =
    (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return {
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
  };
}

/**
 * Run N independent trials of the projection, sampling annual returns
 * from a log-normal distribution. Aggregates percentile paths,
 * success rate, and depletion-age distribution.
 *
 * Deterministic when `options.seed` is provided (recommended for tests).
 */
export function runMonteCarloProjection(
  scenario: Scenario,
  options: MonteCarloOptions,
): MonteCarloResult {
  const start = performance.now();
  const numRuns = Math.max(1, Math.floor(options.numRuns));
  const rng = createRng(options.seed ?? Math.floor(Math.random() * 2 ** 31));
  const sampler = createLogNormalReturnSampler(rng, options.returnStdDev);

  // Run all trials.
  const trialResults: ProjectionResult[] = [];
  for (let i = 0; i < numRuns; i++) {
    trialResults.push(runProjectionCore(scenario, sampler));
  }

  // --- Aggregate ---
  // Percentile paths indexed by age. Assume all trials share the same age grid
  // (they do — the only varying input is returns).
  const firstResult = trialResults[0];
  const numYears = firstResult.years.length;

  // Per-age arrays of realAssets across all runs.
  const realByAge: number[][] = Array.from({ length: numYears }, () => []);
  for (const r of trialResults) {
    for (let y = 0; y < numYears; y++) {
      realByAge[y].push(r.years[y].realAssets);
    }
  }

  const percentilePaths: MonteCarloPercentileYear[] = realByAge.map((values, i) => ({
    age: firstResult.years[i].age,
    p10: percentile(values, 0.1),
    p50: percentile(values, 0.5),
    p90: percentile(values, 0.9),
  }));

  const finalReals = trialResults.map((r) => r.finalAssetsReal);
  const successCount = trialResults.filter((r) => r.success).length;
  const depletionAges: (number | null)[] = trialResults.map((r) => r.depletionAge);
  // Per-trial final assets in today's dollars, parallel to depletionAges so the
  // histogram drill-down table can show stats (count, median, range) for runs
  // that depleted at a given age, not just the count.
  const trialFinalAssets = finalReals.slice();
  // Peak real assets reached at any point in each run — the "high water mark"
  // before any crash, makes the depletion drill-down table impactful instead of
  // a column of near-zero final balances.
  const trialPeakAssets: number[] = trialResults.map((r) =>
    r.years.reduce((m, y) => Math.max(m, y.realAssets), 0),
  );
  // Real assets at the retirement age, per run — answers "how much did the
  // plan build up before retirement?" and contextualises the post-retirement drop.
  // We use `beginningAssets` (the value at the start of the retirement year,
  // before retirement-spending hits), converted to today's dollars via the
  // age-specific inflation factor, so that a run that depletes *during*
  // its retirement year still shows a positive nest-egg value. This is the
  // semantically correct definition of "at retirement": the moment they
  // retired, not the moment they ran out.
  const retYearsFromNow =
    scenario.assumptions.retirementAge - scenario.assumptions.currentAge;
  const retInflationFactor = Math.pow(
    1 + scenario.assumptions.inflationRate,
    retYearsFromNow,
  );
  const trialAssetsAtRetirement: number[] = trialResults.map((r) => {
    const yr = r.years.find((y) => y.age === scenario.assumptions.retirementAge);
    return yr ? yr.beginningAssets / retInflationFactor : 0;
  });
  const depletionNumbersOnly = depletionAges.filter((a): a is number => a !== null);
  const sortedDepletions = [...depletionNumbersOnly].sort((a, b) => a - b);
  const medianDepletionAge =
    sortedDepletions.length === 0
      ? null
      : sortedDepletions[Math.floor(sortedDepletions.length / 2)];

  return {
    numRuns,
    successCount,
    depletionCount: depletionNumbersOnly.length,
    successRate: successCount / numRuns,
    successRateCI: wilson95CI(successCount, numRuns),
    medianFinalAssets: percentile(finalReals, 0.5),
    p10FinalAssets: percentile(finalReals, 0.1),
    p90FinalAssets: percentile(finalReals, 0.9),
    medianDepletionAge,
    percentilePaths,
    depletionAges,
    trialFinalAssets,
    trialPeakAssets,
    trialAssetsAtRetirement,
    elapsedMs: performance.now() - start,
  };
}

/**
 * Linear-interpolated percentile of a numeric array.
 * Caller-supplied array is mutated (sorted) for efficiency.
 */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = p * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const frac = rank - lo;
  return sorted[lo] + frac * (sorted[hi] - sorted[lo]);
}

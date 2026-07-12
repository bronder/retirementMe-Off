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
} from './types';
import { ACCOUNT_TAX_TREATMENT } from './types';

interface AccountState {
  account: Account;
  balance: number;
}

/**
 * Run a full projection for a single scenario.
 */
export function runProjection(scenario: Scenario): ProjectionResult {
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
    let growth = 0;
    for (const s of accountStates) {
      const g = s.balance * s.account.annualReturn;
      s.balance += g;
      growth += g;
    }

    // --- Income (any active income source, pre- or post-retirement) ---
    let income = 0;
    for (const inc of scenario.incomeSources) {
      if (age >= inc.startAge && (inc.endAge === null || age <= inc.endAge)) {
        const colaFactor = inc.cola
          ? Math.pow(1 + assumptions.socialSecurityCola, age - inc.startAge)
          : 1;
        const nominalGross = inc.annualAmount * inflationFactor * colaFactor;
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

    // --- Life events ---
    let eventCashFlow = 0;
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

    // --- Withdrawals ---
    // Determine the net cash needed from assets.
    let netNeed = 0;
    if (isRetired) {
      netNeed = expenses - income - eventCashFlow;
    } else {
      netNeed = expenses + eventCashFlow - income;
    }

    // Withdraw returns the GROSS amount pulled from accounts (incl. tax gross-up).
    let withdrawals = 0;
    if (netNeed > 0) {
      withdrawals = withdrawFromAccounts(accountStates, netNeed, assumptions.retirementTaxRate);
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
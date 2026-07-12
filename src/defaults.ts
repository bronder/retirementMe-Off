import type { Plan, Scenario } from './types';

export const PLAN_VERSION = '1.0.0';

export function createId(): string {
  return Math.random().toString(36).slice(2, 11);
}

export function defaultAssumptions(): Scenario['assumptions'] {
  return {
    currentAge: 40,
    retirementAge: 65,
    endAge: 95,
    inflationRate: 0.03,
    socialSecurityCola: 0.025,
    retirementTaxRate: 0.15,
    safeWithdrawalRate: 0.04,
    preRetirementReturn: 0.07,
    postRetirementReturn: 0.05,
  };
}

export function defaultScenario(name = 'Baseline'): Scenario {
  return {
    id: createId(),
    name,
    assumptions: defaultAssumptions(),
    accounts: [
      {
        id: createId(),
        name: 'Checking & Savings',
        type: 'checking_savings',
        balance: 25000,
        annualReturn: 0.02,
        annualContribution: 0,
        employerMatch: 0,
      },
      {
        id: createId(),
        name: 'Taxable Brokerage',
        type: 'taxable_brokerage',
        balance: 50000,
        annualReturn: 0.07,
        annualContribution: 6000,
        employerMatch: 0,
      },
      {
        id: createId(),
        name: 'Traditional 401(k)',
        type: 'traditional_401k',
        balance: 120000,
        annualReturn: 0.07,
        annualContribution: 12000,
        employerMatch: 4000,
      },
      {
        id: createId(),
        name: 'Roth IRA',
        type: 'roth_ira',
        balance: 60000,
        annualReturn: 0.07,
        annualContribution: 7000,
        employerMatch: 0,
      },
    ],
    incomeSources: [
      {
        id: createId(),
        name: 'Social Security',
        type: 'social_security',
        annualAmount: 36000,
        startAge: 67,
        endAge: null,
        cola: true,
        taxable: false,
      },
    ],
    expenses: [
      { id: createId(), name: 'Mortgage / Rent', category: 'housing', annualAmount: 24000, preRetirement: true, postRetirement: false, startAge: null, endAge: null },
      { id: createId(), name: 'Food & Groceries', category: 'food', annualAmount: 12000, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
      { id: createId(), name: 'Transportation', category: 'transportation', annualAmount: 9000, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
      { id: createId(), name: 'Healthcare (pre-Medicare)', category: 'healthcare', annualAmount: 12000, preRetirement: false, postRetirement: true, startAge: null, endAge: 64 },
      { id: createId(), name: 'Healthcare (Medicare)', category: 'healthcare', annualAmount: 6000, preRetirement: false, postRetirement: true, startAge: 65, endAge: null },
      { id: createId(), name: 'Utilities', category: 'utilities', annualAmount: 4800, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
      { id: createId(), name: 'Entertainment', category: 'entertainment', annualAmount: 6000, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
      { id: createId(), name: 'Travel', category: 'travel', annualAmount: 8000, preRetirement: false, postRetirement: true, startAge: null, endAge: null },
      { id: createId(), name: 'Insurance', category: 'insurance', annualAmount: 3600, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
      { id: createId(), name: 'Miscellaneous', category: 'other', annualAmount: 6000, preRetirement: true, postRetirement: true, startAge: null, endAge: null },
    ],
    events: [],
  };
}

export function defaultPlan(): Plan {
  return {
    version: PLAN_VERSION,
    name: 'retirementMe-Off',
    lastModified: new Date().toISOString(),
    scenarios: [defaultScenario()],
  };
}
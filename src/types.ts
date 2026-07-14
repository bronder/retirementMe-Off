/**
 * Core data model for the Retirement Planner.
 * A Plan is the top-level object that gets serialized to JSON
 * and can be stored in localStorage or exported as a file.
 */

export type AccountType =
  | 'checking_savings' // Taxable cash / bank
  | 'taxable_brokerage' // Taxable investments
  | 'traditional_401k'
  | 'roth_401k'
  | 'traditional_ira'
  | 'roth_ira'
  | 'hsa' // Health Savings Account (invested)
  | 'pension' // Defined benefit (value = lump-sum equivalent, if any)
  | 'other';

export type AccountTaxTreatment = 'taxable' | 'tax_deferred' | 'tax_free';

export const ACCOUNT_TAX_TREATMENT: Record<AccountType, AccountTaxTreatment> = {
  checking_savings: 'taxable',
  taxable_brokerage: 'taxable',
  traditional_401k: 'tax_deferred',
  roth_401k: 'tax_free',
  traditional_ira: 'tax_deferred',
  roth_ira: 'tax_free',
  hsa: 'tax_free',
  pension: 'tax_deferred',
  other: 'taxable',
};

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  /** Current balance, in today's dollars. */
  balance: number;
  /** Assumed long-term annual rate of return, as a decimal (0.07 = 7%). */
  annualReturn: number;
  /** Current annual contribution (today's dollars). 0 in retirement. */
  annualContribution: number;
  /** Employer match (annual), if applicable (today's dollars). */
  employerMatch: number;
}

export type IncomeType =
  | 'salary'           // Full-time employment income (pre-retirement)
  | 'social_security'  // Social Security benefits
  | 'pension'          // Employer pension / defined benefit
  | 'part_time'        // Part-time work (pre- or post-retirement)
  | 'self_employment'  // Business / freelance / 1099 income
  | 'rental'           // Rental property income
  | 'annuity'          // Annuity payments
  | 'dividends'        // Investment dividends / interest
  | 'other';           // Any other income source

export interface IncomeSource {
  id: string;
  name: string;
  type: IncomeType;
  /** Annual amount in today's dollars. */
  annualAmount: number;
  /** Age at which this income begins. */
  startAge: number;
  /** Age at which this income ends (null = continues to end of plan). */
  endAge: number | null;
  /** Whether this income receives cost-of-living adjustments (COLA). */
  cola: boolean;
  /** For Social Security: whether this is already taxable (affects gross vs net). */
  taxable: boolean;
}

export type ExpenseCategory =
  | 'housing'
  | 'food'
  | 'transportation'
  | 'healthcare'
  | 'insurance'
  | 'utilities'
  | 'entertainment'
  | 'travel'
  | 'debt_payment'
  | 'taxes'
  | 'other';

export interface Expense {
  id: string;
  name: string;
  category: ExpenseCategory;
  /** Annual amount in today's dollars. */
  annualAmount: number;
  /** Whether this expense is present pre-retirement (current). */
  preRetirement: boolean;
  /** Whether this expense is present post-retirement. */
  postRetirement: boolean;
  /** Age at which this expense begins (null = always). */
  startAge: number | null;
  /** Age at which this expense ends (null = continues to end of plan). */
  endAge: number | null;
  /** Internal: links this expense to a property so it auto-syncs when
   *  the property is updated. Format: "{propertyId}:{kind}" where kind
   *  is "tax", "insurance", or "mortgage". */
  _propertyId?: string;
}

export type PropertyType = 'primary_residence' | 'vacation' | 'investment' | 'land' | 'other';

export interface Property {
  id: string;
  name: string;
  type: PropertyType;
  /** Estimated current market value in today's dollars. */
  currentValue: number;
  /** Remaining mortgage balance, if any (today's dollars). */
  mortgageBalance: number;
  /** Current annual mortgage payment (principal + interest), if any (today's dollars). */
  mortgagePayment?: number;
  /** Years remaining on the mortgage. */
  mortgageYearsLeft?: number;
  /** Expected annual appreciation rate (decimal, e.g., 0.03 = 3%). */
  annualAppreciation: number;
  /** Annual property tax in today's dollars. */
  annualPropertyTax: number;
  /** Annual insurance cost in today's dollars. */
  annualInsurance: number;

  /** What the user plans to do with this property. */
  planAction?: 'keep' | 'sell' | 'sell_and_buy' | 'undecided';

  // --- Future purchase (optional) ---
  /** If set, this property will be purchased at this age (not yet owned). */
  purchaseAge?: number | null;
  /** What kind of future purchase this represents. */
  purchaseType?: 'replacement' | 'additional' | 'move';
  /** Purchase price in today's dollars (only if purchaseAge is set). */
  purchasePrice?: number;
  /** Down payment amount in today's dollars (deducted from savings at purchase). */
  downPayment?: number;
  /** New mortgage interest rate (decimal, e.g., 0.065 = 6.5%). */
  mortgageRate?: number;
  /** New mortgage term in years (e.g., 30). */
  mortgageTerm?: number;

  // --- Future sale (optional) ---
  /** If set, this property will be sold at this age. */
  saleAge?: number | null;
  /** Net proceeds from sale in today's dollars (sale price - closing costs - mortgage payoff). */
  saleProceeds?: number;
}

export type EventType = 'home_purchase' | 'home_sale' | 'large_purchase' | 'windfall' | 'other';

export interface LifeEvent {
  id: string;
  name: string;
  type: EventType;
  /** Age at which the event occurs. */
  age: number;
  /** One-time cash outflow (negative impact) in today's dollars. */
  cost: number;
  /** One-time cash inflow (positive impact) in today's dollars. */
  proceeds: number;
  /** Ongoing annual impact in today's dollars (e.g., new mortgage payment). Positive = increases expenses. */
  ongoingAnnualImpact: number;
  /** Number of years the ongoing impact lasts (null = forever). */
  ongoingDurationYears: number | null;
  /** Notes for the user. */
  notes: string;
}

export interface SpouseAssumptions {
  /** Whether spouse planning is enabled. */
  enabled: boolean;
  /** Current age of the spouse. */
  currentAge: number;
  /** Spouse's planned retirement age. */
  retirementAge: number;
  /** Age to project the spouse to (may extend the plan beyond primary's endAge). */
  endAge: number;
}

export interface Assumptions {
  /** Current age of the primary planner. */
  currentAge: number;
  /** Planned retirement age. */
  retirementAge: number;
  /** Age to project to (end of plan). */
  endAge: number;
  /** General inflation rate (annual, decimal). */
  inflationRate: number;
  /** Social Security COLA (annual, decimal). Often ~= inflation. */
  socialSecurityCola: number;
  /** Effective tax rate during retirement (decimal). Applied to taxable + tax-deferred withdrawals. */
  retirementTaxRate: number;
  /** Safe withdrawal rate (decimal). 0.04 = 4% rule. Used for guidance indicators. */
  safeWithdrawalRate: number;
  /** Expected annual return during accumulation phase (blended, decimal). Used as fallback. */
  preRetirementReturn: number;
  /** Expected annual return during retirement (blended, decimal). Often more conservative. */
  postRetirementReturn: number;
  /** Optional spouse configuration. When enabled, the plan extends to cover the spouse's lifespan. */
  spouse?: SpouseAssumptions;
}

export interface Scenario {
  id: string;
  name: string;
  assumptions: Assumptions;
  accounts: Account[];
  properties?: Property[];
  incomeSources: IncomeSource[];
  expenses: Expense[];
  events: LifeEvent[];
}

export interface Plan {
  version: string;
  name: string;
  lastModified: string;
  scenarios: Scenario[];
}

/** A single year in the projection results. */
export interface ProjectionYear {
  age: number;
  year: number;
  /** Beginning-of-year total assets (nominal dollars at that year). */
  beginningAssets: number;
  /** Total contributions this year (nominal). */
  contributions: number;
  /** Total investment growth this year (nominal). */
  growth: number;
  /** Total withdrawals this year (nominal). */
  withdrawals: number;
  /** End-of-year total assets (nominal). */
  endingAssets: number;
  /** Total income (SS, pension, etc.) this year (nominal). */
  income: number;
  /** Total expenses this year (nominal). */
  expenses: number;
  /** One-time event cash flow this year (nominal, positive = net inflow). */
  eventCashFlow: number;
  /** Total assets in today's dollars (real). */
  realAssets: number;
  /** Whether the plan ran out of money at or before this year. */
  depleted: boolean;
}

export interface ProjectionResult {
  scenarioId: string;
  scenarioName: string;
  years: ProjectionYear[];
  /** Age at which assets are depleted (null = never within the plan). */
  depletionAge: number | null;
  /** Final assets at end of plan (nominal). */
  finalAssets: number;
  /** Final assets in today's dollars. */
  finalAssetsReal: number;
  /** Whether the plan succeeded (didn't deplete). */
  success: boolean;
}

/* ============================================================
   MONTE CARLO TYPES
   ============================================================
   Monte Carlo runs the deterministic projection many times,
   each time sampling annual investment returns from a
   log-normal distribution around the account's expected return.
   The aggregated results give a probability distribution of
   outcomes (success rate, percentile paths, depletion ages)
   instead of a single best-guess trajectory.
*/

export interface MonteCarloOptions {
  /** Number of independent trials to run. Default 1000. */
  numRuns: number;
  /** Standard deviation of annual returns (decimal). Default 0.15 (15%).
   *  Single global value applied to all accounts; log-normal distribution. */
  returnStdDev: number;
  /** Optional seed for the random number generator. With a fixed seed, the
   *  output is fully deterministic — useful for tests and reproducible runs. */
  seed?: number;
}

/** Per-age percentile of total real (today's dollars) assets across all runs. */
export interface MonteCarloPercentileYear {
  age: number;
  /** 10th percentile — worst-case-ish outcome. */
  p10: number;
  /** 50th percentile — median outcome. */
  p50: number;
  /** 90th percentile — best-case-ish outcome. */
  p90: number;
}

export interface MonteCarloResult {
  numRuns: number;
  /** Number of runs that did NOT deplete within the plan horizon. */
  successCount: number;
  /** Number of runs that depleted within the plan horizon. */
  depletionCount: number;
  /** Fraction of runs that did NOT deplete (0..1). Convenience = successCount/numRuns. */
  successRate: number;
  /** Median final assets in today's dollars across all runs. */
  medianFinalAssets: number;
  /** 10th percentile of final assets in today's dollars. */
  p10FinalAssets: number;
  /** 90th percentile of final assets in today's dollars. */
  p90FinalAssets: number;
  /** Median age at which runs depleted (null if no runs depleted). */
  medianDepletionAge: number | null;
  /** Per-age percentile bands across the plan. */
  percentilePaths: MonteCarloPercentileYear[];
  /** Raw depletion ages from each run (null = did not deplete).
   *  Used by the depletion histogram UI. */
  depletionAges: (number | null)[];
  /** Total computation time in ms. */
  elapsedMs: number;
}

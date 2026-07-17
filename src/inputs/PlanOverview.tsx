import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Printer, TrendingUp, TrendingDown } from 'lucide-react';
import type { Scenario } from '../types';
import { ACCOUNT_TAX_TREATMENT } from '../types';
import type { ProjectionResult } from '../types';
import type { ReadinessSummary } from '../engine';
import { formatCurrency, formatPercent, formatAge } from '../format';
import { prettify } from '../format';
import { useThemeColors } from '../hooks/useThemeColors';
import { useResponsiveChartHeight } from '../hooks/useResponsiveChartHeight';

/**
 * Plan Overview — a single-page financial report built from the live plan.
 *
 * Renders the data-backed sections of a planning report: executive KPIs,
 * retirement readiness, asset allocation (donut), debts, a detailed account
 * table, a balances-over-time chart, and a cash-flow chart. Each number is
 * derived from the projection — there is no placeholder data.
 *
 * Designed to print cleanly: the "Print / Save as PDF" button triggers
 * window.print(), and an @media print stylesheet in styles.css hides the app
 * chrome so only the report body remains.
 *
 * Sections the data model does NOT support (tax brackets, per-account balance
 * at retirement, must-vs-discretionary expenses, estate planning) are
 * intentionally omitted rather than faked.
 */

/* ------------------------------ type aliases ------------------------------ */

type ScenarioLike = Scenario;
type ResultLike = ProjectionResult;
type ReadinessLike = ReadinessSummary;

/* ------------------------------ helpers ------------------------------ */

const TAX_LABEL: Record<string, string> = {
  taxable: 'After-tax',
  tax_deferred: 'Tax-advantaged',
  tax_free: 'Roth / tax-free',
};

/** Net worth today = financial accounts + property equity. */
function computeNetWorth(scenario: ScenarioLike): {
  accountBalance: number;
  propertyEquity: number;
  total: number;
} {
  const accountBalance = scenario.accounts.reduce((s, a) => s + a.balance, 0);
  const propertyEquity = (scenario.properties ?? []).reduce(
    (s, p) => s + Math.max(0, (p.currentValue ?? 0) - (p.mortgageBalance ?? 0)),
    0,
  );
  return { accountBalance, propertyEquity, total: accountBalance + propertyEquity };
}

/** Group account balances by tax treatment for the allocation donut. */
function computeAssetBuckets(
  scenario: ScenarioLike,
  propertyEquity: number,
): { name: string; value: number }[] {
  const sums = { taxable: 0, tax_deferred: 0, tax_free: 0 };
  for (const a of scenario.accounts) {
    sums[ACCOUNT_TAX_TREATMENT[a.type]] += a.balance;
  }
  const buckets = [
    { name: TAX_LABEL.tax_deferred, value: sums.tax_deferred },
    { name: TAX_LABEL.tax_free, value: sums.tax_free },
    { name: TAX_LABEL.taxable, value: sums.taxable },
    { name: 'Real estate', value: propertyEquity },
  ];
  return buckets.filter((b) => b.value > 0);
}

/** Effective growth assumption for an account: its own rate, or the
 *  assumption fallback (matching the engine's rule for annualReturn === 0). */
function effectiveReturn(
  account: ScenarioLike['accounts'][0],
  scenario: ScenarioLike,
): number {
  return account.annualReturn !== 0
    ? account.annualReturn
    : scenario.assumptions.preRetirementReturn;
}

/* ------------------------------ the component ------------------------------ */

export function PlanOverview({
  scenario,
  result,
  readiness,
}: {
  scenario: ScenarioLike;
  result: ResultLike;
  readiness: ReadinessLike;
}) {
  const tc = useThemeColors();
  const balancesHeight = useResponsiveChartHeight({ min: 260, max: 380, vhFraction: 0.36 });
  const cashFlowHeight = useResponsiveChartHeight({ min: 240, max: 340, vhFraction: 0.34 });

  const a = scenario.assumptions;
  const nw = useMemo(() => computeNetWorth(scenario), [scenario]);
  const buckets = useMemo(
    () => computeAssetBuckets(scenario, nw.propertyEquity),
    [scenario, nw.propertyEquity],
  );
  const sliceColors = [tc.chart, tc.chart2, tc.chart3, tc.chart4, tc.chart5, tc.chart6];

  // Debts: mortgage balances + any debt_payment expenses (annual, no balance).
  const mortgageDebt = (scenario.properties ?? []).reduce(
    (s, p) => s + (p.mortgageBalance ?? 0),
    0,
  );
  const nonMortgageDebtPayments = scenario.expenses.filter(
    (e) => e.category === 'debt_payment',
  );

  // Safe monthly spending = first-year income + withdrawal, /12.
  const safeMonthly = (readiness.firstYearIncome + readiness.firstYearWithdrawal) / 12;

  // Balances-over-time chart data (nominal + real, liquid + total).
  const balancesData = useMemo(
    () =>
      result.years.map((y) => ({
        age: y.age,
        'Liquid (Nominal)': Math.round(y.endingAssets),
        'Total (Nominal)': Math.round(y.endingAssets + y.propertyEquity),
        'Liquid (Today’s $)': Math.round(y.realAssets),
        'Total (Today’s $)': Math.round(y.realAssets + y.realPropertyEquity),
      })),
    [result],
  );

  // Cash-flow chart data (retirement years only, like the deterministic view).
  const cashFlowData = useMemo(
    () =>
      result.years
        .filter((y) => y.age >= a.retirementAge)
        .map((y) => ({
          age: y.age,
          Income: Math.round(y.income),
          Withdrawals: Math.round(y.withdrawals),
          Expenses: Math.round(y.expenses),
        })),
    [result, a.retirementAge],
  );

  const tooltipStyle = {
    background: tc.panel,
    border: `1px solid ${tc.border}`,
    borderRadius: 8,
  };

  // Narrative insight: how much margin the plan has at end-of-plan.
  const finalReal = result.finalAssetsReal;
  const yearsInRetirement = a.endAge - a.retirementAge;
  const withdrawalVsSafe =
    readiness.neededWithdrawalRate <= a.safeWithdrawalRate
      ? 'under your safe withdrawal rate'
      : `${formatPercent(readiness.neededWithdrawalRate - a.safeWithdrawalRate)} above your safe rate`;

  return (
    <div className="plan-overview">
      {/* Header with Print action */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>{scenario.name}</h2>
            <p className="muted po-report-sub">
              Plan overview · retire at {a.retirementAge} · projected to age {a.endAge}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-sm po-print-btn"
            onClick={() => window.print()}
            title="Print or save this report as a PDF"
          >
            <Printer size={14} aria-hidden="true" /> Print / Save as PDF
          </button>
        </div>
      </div>

      {/* === 1. Executive summary === */}
      <section className="po-section">
        <h3 className="po-section-title">Executive Summary</h3>
        <div className="summary-grid">
          <div className="summary-card">
            <div className="label">Net worth today</div>
            <div className="value">{formatCurrency(nw.total, { compact: true })}</div>
            <div className="sub">
              {formatCurrency(nw.accountBalance, { compact: true })} accounts +{' '}
              {formatCurrency(nw.propertyEquity, { compact: true })} home equity
            </div>
          </div>
          <div className="summary-card">
            <div className="label">Projected end value</div>
            <div className={`value ${finalReal > 0 ? 'value-good' : 'value-bad'}`}>
              {formatCurrency(result.finalAssetsReal, { compact: true })}
            </div>
            <div className="sub">in today's dollars at age {a.endAge}</div>
          </div>
          <div className="summary-card">
            <div className="label">Safe monthly spending</div>
            <div className="value">{formatCurrency(safeMonthly, { compact: true })}/mo</div>
            <div className="sub">income + withdrawals in year one</div>
          </div>
          <div className="summary-card">
            <div className="label">Funded for life?</div>
            <div className={`value ${result.success ? 'value-good' : 'value-bad'}`}>
              {result.success ? '✓ Yes' : '✗ Runs short'}
            </div>
            <div className="sub">
              {result.success
                ? `Lasts through age ${a.endAge}`
                : `Depletes at age ${formatAge(result.depletionAge)}`}
            </div>
          </div>
        </div>

        <div className="chart-container po-balances-chart">
          <div className="chart-header-row">
            <h3>Long-term net worth trajectory</h3>
          </div>
          <ResponsiveContainer width="100%" height={balancesHeight}>
            <AreaChart data={balancesData}>
              <defs>
                <linearGradient id="poLiquidReal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={tc.chart} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={tc.chart} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={tc.border} />
              <XAxis dataKey="age" stroke={tc.textDim} />
              <YAxis
                stroke={tc.textDim}
                tickFormatter={(v) => formatCurrency(v, { compact: true })}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: number) => formatCurrency(v)}
                labelFormatter={(l) => `Age ${l}`}
                labelStyle={{ color: tc.text }}
                itemStyle={{ color: tc.text }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="Total (Today’s $)"
                stroke={tc.chart3}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                fill="none"
              />
              <Area
                type="monotone"
                dataKey="Liquid (Today’s $)"
                stroke={tc.chart}
                strokeWidth={2}
                fill="url(#poLiquidReal)"
              />
              <ReferenceLine
                x={a.retirementAge}
                stroke={tc.yellow}
                strokeDasharray="5 5"
                label={{ value: 'Retire', fill: tc.yellow, fontSize: 11 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* === 2. Retirement readiness === */}
      <section className="po-section">
        <h3 className="po-section-title">Retirement Readiness</h3>
        <div className="po-readiness-grid">
          <div className="panel po-readiness-facts">
            <div className="asm-chip">
              <span className="asm-chip-label">Retirement age</span>
              <span className="asm-chip-value">{a.retirementAge}</span>
            </div>
            <div className="asm-chip">
              <span className="asm-chip-label">Plan end age</span>
              <span className="asm-chip-value">{a.endAge}</span>
            </div>
            <div className="asm-chip">
              <span className="asm-chip-label">Years in retirement</span>
              <span className="asm-chip-value">{yearsInRetirement}</span>
            </div>
            <div className="asm-chip">
              <span className="asm-chip-label">Spouse</span>
              <span className="asm-chip-value">
                {a.spouse?.enabled ? `Yes (age ${a.spouse.currentAge})` : 'Single'}
              </span>
            </div>
            <div className="asm-chip">
              <span className="asm-chip-label">Nest egg at retirement</span>
              <span className="asm-chip-value">
                {formatCurrency(readiness.nestEggAtRetirementReal, { compact: true })}
              </span>
            </div>
            <div className="asm-chip">
              <span className="asm-chip-label">Year-1 withdrawal rate</span>
              <span
                className={`asm-chip-value ${
                  readiness.neededWithdrawalRate <= a.safeWithdrawalRate ? 'value-good' : 'value-bad'
                }`}
              >
                {formatPercent(readiness.neededWithdrawalRate)}
              </span>
            </div>
          </div>
          <div className="po-insight">
            <div className="po-insight-title">
              {readiness.onTrack ? (
                <TrendingUp size={16} aria-hidden="true" />
              ) : (
                <TrendingDown size={16} aria-hidden="true" />
              )}
              Advisor insight
            </div>
            <p>
              {result.success ? (
                <>
                  This plan is <strong>on track</strong>: it funds {yearsInRetirement} years of
                  retirement and still holds{' '}
                  <strong>{formatCurrency(finalReal, { compact: true })}</strong> (today's dollars)
                  at age {a.endAge}. Your first-year withdrawals are{' '}
                  <strong>{withdrawalVsSafe}</strong>, leaving a{' '}
                  {finalReal > readiness.nestEggAtRetirementReal ? 'growing' : 'comfortable'} margin.
                </>
              ) : (
                <>
                  This plan <strong>runs short</strong> at age {formatAge(result.depletionAge)}. The
                  first-year withdrawal rate ({formatPercent(readiness.neededWithdrawalRate)}) is{' '}
                  {withdrawalVsSafe}. Consider retiring later, saving more, or lowering retirement
                  spending — the “What If?” panel lets you test these live.
                </>
              )}
            </p>
          </div>
        </div>
      </section>

      {/* === 3. Assets === */}
      {buckets.length > 0 && (
        <section className="po-section">
          <h3 className="po-section-title">Asset Allocation</h3>
          <p className="section-help">
            How your current net worth is split across account types and real estate.
          </p>
          <div className="po-alloc-grid">
            <div className="po-alloc-donut">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={buckets}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {buckets.map((_, i) => (
                      <Cell key={i} fill={sliceColors[i % sliceColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v: number) => formatCurrency(v)}
                    labelStyle={{ color: tc.text }}
                    itemStyle={{ color: tc.text }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="table-scroll po-alloc-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="text-right">Weight</th>
                    <th className="text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {buckets.map((b, i) => {
                    const pct = nw.total > 0 ? (b.value / nw.total) * 100 : 0;
                    return (
                      <tr key={b.name}>
                        <td>
                          <span
                            className="po-alloc-dot"
                            style={{ background: sliceColors[i % sliceColors.length] }}
                            aria-hidden="true"
                          />
                          {b.name}
                        </td>
                        <td className="text-right">{pct.toFixed(1)}%</td>
                        <td className="text-right">{formatCurrency(b.value, { compact: true })}</td>
                      </tr>
                    );
                  })}
                  <tr className="po-total-row">
                    <td>Total</td>
                    <td className="text-right">100%</td>
                    <td className="text-right">{formatCurrency(nw.total, { compact: true })}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* === 4. Debts === */}
      {(mortgageDebt > 0 || nonMortgageDebtPayments.length > 0) && (
        <section className="po-section">
          <h3 className="po-section-title">Debts</h3>
          <p className="section-help">
            Mortgages are tracked as balances; other debts are tracked as annual payments only.
          </p>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Debt category</th>
                  <th className="text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {mortgageDebt > 0 && (
                  <tr>
                    <td>Mortgage balance</td>
                    <td className="text-right">
                      {formatCurrency(mortgageDebt, { compact: true })}
                    </td>
                  </tr>
                )}
                {nonMortgageDebtPayments.map((e) => (
                  <tr key={e.id}>
                    <td>
                      {e.name}
                      <span className="muted po-debt-note"> · annual payment</span>
                    </td>
                    <td className="text-right">{formatCurrency(e.annualAmount)}/yr</td>
                  </tr>
                ))}
                {mortgageDebt > 0 && (
                  <tr className="po-total-row">
                    <td>Total debt (balance)</td>
                    <td className="text-right">
                      {formatCurrency(mortgageDebt, { compact: true })}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* === 5. Detailed account breakdown === */}
      <section className="po-section">
        <h3 className="po-section-title">Detailed Account Breakdown</h3>
        <p className="section-help">
          Per-account growth assumption and current balance. Growth shown is the account's own rate,
          or the plan's pre-retirement fallback where unset.
        </p>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Type</th>
                <th>Tax treatment</th>
                <th className="text-right">Growth assumption</th>
                <th className="text-right">Current balance</th>
              </tr>
            </thead>
            <tbody>
              {scenario.accounts.map((acct) => (
                <tr key={acct.id}>
                  <td>{acct.name}</td>
                  <td className="muted">{prettify(acct.type)}</td>
                  <td>
                    <span className={`badge ${taxBadgeClass(ACCOUNT_TAX_TREATMENT[acct.type])}`}>
                      {TAX_LABEL[ACCOUNT_TAX_TREATMENT[acct.type]]}
                    </span>
                  </td>
                  <td className="text-right">{formatPercent(effectiveReturn(acct, scenario))}</td>
                  <td className="text-right">{formatCurrency(acct.balance)}</td>
                </tr>
              ))}
              <tr className="po-total-row">
                <td colSpan={4}>Total</td>
                <td className="text-right">{formatCurrency(nw.accountBalance)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* === 6. Balances over time === */}
      <section className="po-section">
        <h3 className="po-section-title">Balances Over Time</h3>
        <p className="section-help">
          Projected liquid assets vs total net worth (including home equity), in today's dollars.
        </p>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={balancesHeight}>
            <AreaChart data={balancesData}>
              <CartesianGrid strokeDasharray="3 3" stroke={tc.border} />
              <XAxis dataKey="age" stroke={tc.textDim} />
              <YAxis
                stroke={tc.textDim}
                tickFormatter={(v) => formatCurrency(v, { compact: true })}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: number) => formatCurrency(v)}
                labelFormatter={(l) => `Age ${l}`}
                labelStyle={{ color: tc.text }}
                itemStyle={{ color: tc.text }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="Total (Today’s $)"
                stroke={tc.chart3}
                strokeWidth={1.5}
                fill="none"
              />
              <Area
                type="monotone"
                dataKey="Liquid (Today’s $)"
                stroke={tc.chart}
                strokeWidth={2}
                fill="url(#poLiquidReal)"
              />
              <ReferenceLine
                x={a.retirementAge}
                stroke={tc.yellow}
                strokeDasharray="5 5"
                label={{ value: 'Retire', fill: tc.yellow, fontSize: 11 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* === 7. Cash flow === */}
      <section className="po-section">
        <h3 className="po-section-title">Retirement Cash Flow</h3>
        <p className="section-help">
          Income, withdrawals, and expenses each year from retirement onward. Where income +
          withdrawals fall short of expenses, the plan bridges the gap from savings.
        </p>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={cashFlowHeight}>
            <BarChart data={cashFlowData}>
              <CartesianGrid strokeDasharray="3 3" stroke={tc.border} />
              <XAxis dataKey="age" stroke={tc.textDim} />
              <YAxis
                stroke={tc.textDim}
                tickFormatter={(v) => formatCurrency(v, { compact: true })}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: number) => formatCurrency(v)}
                labelFormatter={(l) => `Age ${l}`}
                labelStyle={{ color: tc.text }}
                itemStyle={{ color: tc.text }}
              />
              <Legend />
              <Bar dataKey="Income" fill={tc.green} />
              <Bar dataKey="Withdrawals" fill={tc.chart} />
              <Bar dataKey="Expenses" fill={tc.red} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

/** Map a tax treatment to the badge modifier class. */
function taxBadgeClass(treatment: string): string {
  if (treatment === 'tax_free') return 'badge-green';
  if (treatment === 'tax_deferred') return 'badge-purple';
  return 'badge-accent';
}

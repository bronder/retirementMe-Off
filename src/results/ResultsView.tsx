/** Results & Charts tab: summary cards, section rail, deterministic charts,
 *  Monte Carlo / What If sub-panels, and the year-by-year table.
 *  Lazily loaded by App so the recharts dependency stays out of the initial
 *  bundle. */
import { useState, useEffect, useRef, Fragment, lazy, Suspense } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, CartesianGrid,
  XAxis, YAxis, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { Dices, ListChecks, Table2, Wallet, LayoutDashboard, Wand2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usePlanStore } from '../store';
import { runProjection, getReadinessSummary, mortgagePaymentAtAge, incomeNominalAtAge } from '../engine';
import { formatCurrency, formatPercent, formatAge, prettify } from '../format';
import { useThemeColors } from '../hooks/useThemeColors';
import { useResponsiveChartHeight } from '../hooks/useResponsiveChartHeight';
import { DataTable } from '../inputs/DataTable';
import { ChartDataDisclosure } from '../inputs/ChartDataDisclosure';
import { Glyph } from '../ui/shared';

// Heavy sub-panels load on demand — Monte Carlo and the What-If sliders are
// each a click away, not part of this chunk's initial download.
const MonteCarloPanel = lazy(() => import('../MonteCarloPanel').then((m) => ({ default: m.MonteCarloPanel })));
const PlanOverview = lazy(() => import('../inputs/PlanOverview').then((m) => ({ default: m.PlanOverview })));
const WhatIfPanel = lazy(() => import('../inputs/WhatIfPanel').then((m) => ({ default: m.WhatIfPanel })));

/** Loading shell shared by the lazy sub-panels. */
function PanelFallback() {
  return <div className="panel muted" style={{ padding: 24 }}>Loading…</div>;
}


/**
 * Results tab sub-sections. Deterministic is the default landing because
 * it renders fully on first view — charts, cash flow, and the year table
 * all populate immediately. Monte Carlo is gated behind a manual "Run"
 * (it starts idle), so defaulting to it showed a blank body beneath the
 * summary cards. Users still land on the straight-line projection and can
 * click into Monte Carlo for the probability view.
 */
type ResultSection = 'monte-carlo' | 'deterministic' | 'what-if' | 'overview';
const DEFAULT_RESULT_SECTION: ResultSection = 'overview';

export function ResultsView({ scenario, result, readiness }: {
  scenario: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0];
  result: NonNullable<ReturnType<typeof runProjection>>;
  readiness: NonNullable<ReturnType<typeof getReadinessSummary>>;
}) {
  const tc = useThemeColors();
  const nwChartHeight = useResponsiveChartHeight({ min: 260, max: 420, vhFraction: 0.38 });
  const cashFlowChartHeight = useResponsiveChartHeight({ min: 240, max: 380, vhFraction: 0.36 });

  const [section, setSection] = useState<ResultSection>(
    () => (localStorage.getItem('retirement-result-section') as ResultSection) || DEFAULT_RESULT_SECTION,
  );
  useEffect(() => {
    localStorage.setItem('retirement-result-section', section);
  }, [section]);

  // Net-worth chart view mode: show nominal OR real (today's $), not both.
  // Showing both at once produces 4 overlapping areas + reference lines — too
  // dense. Defaults to real (today's $) since that's the more meaningful number.
  const [nwView, setNwView] = useState<'real' | 'nominal'>(
    () => (localStorage.getItem('retirement-nw-view') as 'real' | 'nominal') || 'real',
  );
  useEffect(() => { localStorage.setItem('retirement-nw-view', nwView); }, [nwView]);

  // Headline-card → year-table drill-down. When the user clicks a headline
  // card, we set focusAge + flip to the deterministic section; the YearTable
  // (which only mounts under that section) consumes focusAge, scrolls the
  // matching row into view, and flashes a highlight. Cleared after the
  // highlight expires so re-clicking the same age re-triggers.
  const [focusAge, setFocusAge] = useState<number | null>(null);
  const focusOn = (age: number) => {
    setSection('deterministic');
    setFocusAge(age);
  };

  const tooltipStyle = { background: tc.panel, border: `1px solid ${tc.border}`, borderRadius: 8 };

  // Net worth chart: liquid (financial accounts) + home equity, stacked.
  // `nominal` and `real` are summed totals so the user can read total net
  // worth directly from the legend. The property-component series
  // (`homeNominal`, `homeReal`) is computed per-year from the engine.
  // NOTE: keys use the literal U+2019 (') rather than a \u2019 escape so they
  // match the dataKey attributes in JSX (which do not process backslash escapes).
  const chartData = result.years.map((y) => ({
    age: y.age,
    'Liquid (Nominal)': Math.round(y.endingAssets),
    'Home Equity (Nominal)': Math.round(y.propertyEquity),
    'Total (Nominal)': Math.round(y.endingAssets + y.propertyEquity),
    'Liquid (Today’s $)': Math.round(y.realAssets),
    'Home Equity (Today’s $)': Math.round(y.realPropertyEquity),
    'Total (Today’s $)': Math.round(y.realAssets + y.realPropertyEquity),
  }));

  const cashFlowData = result.years.filter((y) => y.age >= scenario.assumptions.retirementAge).map((y) => ({
    age: y.age,
    Income: Math.round(y.income),
    Withdrawals: Math.round(y.withdrawals),
    Expenses: Math.round(y.expenses),
  }));

  const navItems: { id: ResultSection; label: string; icon: LucideIcon; help: string }[] = [
    {
      id: 'overview',
      label: 'Plan Overview',
      icon: LayoutDashboard,
      help: 'A single-page report of your plan: net worth, allocation, accounts, and cash flow.',
    },
    {
      id: 'monte-carlo',
      label: 'Monte Carlo Stress Test',
      icon: Dices,
      help: 'Probability of success across thousands of random futures.',
    },
    {
      id: 'deterministic',
      label: 'Straight-Line Projection',
      icon: Table2,
      help: 'Single-trajectory view at your expected returns.',
    },
    {
      id: 'what-if',
      label: 'What If?',
      icon: Wand2,
      help: 'Drag sliders to compare an alternate retirement future.',
    },
  ];

  return (
    <div>
      {/* === Headline summary cards — always visible across sections ===
          The "Nest Egg" and "Final Assets" cards are clickable: they drill
          down into the year-by-year table at the relevant age so the user
          can see how the number was derived. The "Plan Outcome" card jumps
          to the depletion age (if the plan runs out) or the end age. */}
      <div className="summary-grid">
        <button type="button" className="summary-card summary-card-drilldown" onClick={() => focusOn(scenario.assumptions.retirementAge)} title="See the year-by-year breakdown at retirement">
          <div className="label">Nest Egg at Retirement</div>
          <div className="value">{formatCurrency(readiness.nestEggAtRetirement, { compact: true })}</div>
          <div className="sub">{formatCurrency(readiness.nestEggAtRetirementReal, { compact: true })} in today's dollars</div>
          <span className="summary-card-drilldown-hint" aria-hidden="true">View breakdown →</span>
        </button>
        <button type="button" className="summary-card summary-card-drilldown" onClick={() => focusOn(result.depletionAge ?? scenario.assumptions.endAge)} title="See the year the plan depletes (or the final year)">
          <div className="label">Plan Outcome</div>
          <div className={`value ${result.success ? 'value-good' : 'value-bad'}`}>
            {result.success ? '✓ Sustainable' : '✗ Runs Out'}
          </div>
          <div className="sub">{result.success ? `Lasts to age ${scenario.assumptions.endAge}` : `Depleted at age ${formatAge(result.depletionAge)}`}</div>
          <span className="summary-card-drilldown-hint" aria-hidden="true">View breakdown →</span>
        </button>
        <button type="button" className="summary-card summary-card-drilldown" onClick={() => focusOn(scenario.assumptions.retirementAge)} title="See the retirement-year row showing the first year of withdrawals">
          <div className="label">Year-1 Withdrawal Rate</div>
          <div className={`value ${readiness.neededWithdrawalRate <= scenario.assumptions.safeWithdrawalRate ? 'value-good' : 'value-bad'}`}>
            {formatPercent(readiness.neededWithdrawalRate)}
          </div>
          <div className="sub">Safe rate: {formatPercent(scenario.assumptions.safeWithdrawalRate)}</div>
          <span className="summary-card-drilldown-hint" aria-hidden="true">View breakdown →</span>
        </button>
        <button type="button" className="summary-card summary-card-drilldown" onClick={() => focusOn(scenario.assumptions.endAge)} title="See the final-year breakdown">
          <div className="label">Final Assets (age {scenario.assumptions.endAge})</div>
          <div className="value">{formatCurrency(result.finalAssets, { compact: true })}</div>
          <div className="sub">{formatCurrency(result.finalAssetsReal, { compact: true })} in today's dollars</div>
          <span className="summary-card-drilldown-hint" aria-hidden="true">View breakdown →</span>
        </button>
      </div>

      {/* === Sidebar layout: chart panels live behind a left rail === */}
      <div className="results-layout">
        <aside className="results-sidebar">
          <ul className="results-nav">
            {navItems.map((item) => (
              <li key={item.id}>
                <button
                  className={`results-nav-item ${section === item.id ? 'active' : ''}`}
                  onClick={() => setSection(item.id)}
                  title={item.help}
                >
                  <span className="results-nav-icon"><Glyph i={item.icon} /></span>
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
          <div className="sidebar-divider" />
          <div className="sidebar-resources-label">About</div>
          <p className="muted" style={{ fontSize: 'var(--text-xs)', padding: '0 16px', lineHeight: 1.5 }}>
            {section === 'overview'
              ? 'A single-page report built from your plan — net worth, asset allocation, accounts, and cash flow. Use Print to save as PDF.'
              : section === 'monte-carlo'
                ? 'Monte Carlo runs the plan many times with randomized returns to surface the probability of success across random futures.'
                : section === 'what-if'
                  ? 'What If? builds a throwaway copy of your plan and re-projects it live as you drag sliders. Apply to keep the changes — or close to discard.'
                  : 'Deterministic view projects the plan at your exact expected return — one possible future.'}
          </p>
        </aside>

        <div className="results-content">
          {section === 'overview' && (
            <Suspense fallback={<PanelFallback />}>
              <PlanOverview scenario={scenario} result={result} readiness={readiness} />
            </Suspense>
          )}

          {section === 'monte-carlo' && (
            <div className="panel">
              <div className="panel-header">
                <h2><Dices size={20} aria-hidden="true" /> Monte Carlo Stress Test</h2>
                <button
                  className="btn btn-sm"
                  onClick={() => setSection('deterministic')}
                  title="Jump to the deterministic single-trajectory charts"
                >
                  Compare to deterministic →
                </button>
              </div>
              <p className="section-help">
                The straight-line projection shows a single future at your exact expected return. Real
                markets vary year to year. This panel runs the plan many times with randomized returns
                to estimate the <strong>probability of success</strong> across thousands of possible futures.
              </p>
              <Suspense fallback={<PanelFallback />}>
                <MonteCarloPanel scenario={scenario} colors={tc} />
              </Suspense>
            </div>
          )}

          {section === 'deterministic' && (
            <>
              {/* Net worth chart — stacked liquid + home equity.
                  Toggle between Nominal and Today's $ to avoid 4 overlapping
                  areas; both views are available but not shown at once. */}
              <div className="chart-container">
                <div className="chart-header-row">
                  <h3>Projected Net Worth Over Time</h3>
                  <div className="seg-toggle" role="group" aria-label="Net worth view">
                    <button className={`seg-btn${nwView === 'real' ? ' active' : ''}`} onClick={() => setNwView('real')}>Today's $</button>
                    <button className={`seg-btn${nwView === 'nominal' ? ' active' : ''}`} onClick={() => setNwView('nominal')}>Nominal</button>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={nwChartHeight} aria-label={`Projected net worth over time, ${chartData.length} yearly data points from age ${chartData[0]?.age ?? ''} to ${chartData[chartData.length - 1]?.age ?? ''}`}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="detGradientLiquidNom" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={tc.chart} stopOpacity={0.25} />
                        <stop offset="100%" stopColor={tc.chart} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="detGradientLiquidReal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={tc.chart2} stopOpacity={0.2} />
                        <stop offset="100%" stopColor={tc.chart2} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="detGradientHomeNom" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={tc.chart3} stopOpacity={0.25} />
                        <stop offset="100%" stopColor={tc.chart3} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="detGradientHomeReal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={tc.chart4} stopOpacity={0.2} />
                        <stop offset="100%" stopColor={tc.chart4} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={tc.border} />
                    <XAxis dataKey="age" stroke={tc.textDim} />
                    <YAxis stroke={tc.textDim} tickFormatter={(v) => formatCurrency(v, { compact: true })} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v: number) => formatCurrency(v)}
                      labelFormatter={(l) => `Age ${l}`}
                      labelStyle={{ color: tc.text }}
                      itemStyle={{ color: tc.text }}
                    />
                    <Legend />
                    {nwView === 'nominal' ? (
                      <>
                        <Area type="monotone" dataKey="Liquid (Nominal)" stackId="nom" stroke={tc.chart} fill="url(#detGradientLiquidNom)" strokeWidth={1.5} />
                        <Area type="monotone" dataKey="Home Equity (Nominal)" stackId="nom" stroke={tc.chart3} fill="url(#detGradientHomeNom)" strokeWidth={1.5} />
                      </>
                    ) : (
                      <>
                        <Area type="monotone" dataKey="Liquid (Today’s $)" stackId="real" stroke={tc.chart2} fill="url(#detGradientLiquidReal)" strokeWidth={1.5} />
                        <Area type="monotone" dataKey="Home Equity (Today’s $)" stackId="real" stroke={tc.chart4} fill="url(#detGradientHomeReal)" strokeWidth={1.5} />
                      </>
                    )}
                    <ReferenceLine x={scenario.assumptions.retirementAge} stroke={tc.yellow} strokeDasharray="5 5" label={{ value: 'Retire', fill: tc.yellow, fontSize: 11 }} />
                    {scenario.events.filter((ev) => ev.proceeds > 0 || ev.cost > 0).map((ev) => (
                      <ReferenceLine
                        key={ev.id}
                        x={ev.age}
                        stroke={ev.proceeds >= ev.cost ? tc.green : tc.red}
                        strokeDasharray="3 3"
                        label={{ value: ev.name || (ev.proceeds >= ev.cost ? '▲' : '▼'), fill: ev.proceeds >= ev.cost ? tc.green : tc.red, fontSize: 10, position: 'top' }}
                      />
                    ))}
                    {scenario.properties?.filter((p) => p.saleAge || p.purchaseAge).flatMap((p) => {
                      const lines = [];
                      if (p.saleAge) lines.push(<ReferenceLine key={`${p.id}-sale`} x={p.saleAge} stroke={tc.green} strokeDasharray="3 3" label={{ value: '🏡 Sale', fill: tc.green, fontSize: 10, position: 'top' }} />);
                      if (p.purchaseAge) lines.push(<ReferenceLine key={`${p.id}-buy`} x={p.purchaseAge} stroke={tc.red} strokeDasharray="3 3" label={{ value: '🏠 Buy', fill: tc.red, fontSize: 10, position: 'top' }} />);
                      return lines;
                    })}
                  </AreaChart>
                </ResponsiveContainer>
                <ChartDataDisclosure summaryLabel="View as data table" rowCount={chartData.length}>
                  <DataTable
                    rows={chartData}
                    caption="Projected net worth by year, in both nominal and today's dollars"
                    columns={[
                      { key: 'age', label: 'Age' },
                      { key: 'Liquid (Nominal)', label: 'Liquid (Nominal)', format: (v) => formatCurrency(v as number) },
                      { key: 'Home Equity (Nominal)', label: 'Home Equity (Nominal)', format: (v) => formatCurrency(v as number) },
                      { key: 'Total (Nominal)', label: 'Total (Nominal)', format: (v) => formatCurrency(v as number) },
                      { key: 'Liquid (Today’s $)', label: 'Liquid (Today’s $)', format: (v) => formatCurrency(v as number) },
                      { key: 'Home Equity (Today’s $)', label: 'Home Equity (Today’s $)', format: (v) => formatCurrency(v as number) },
                      { key: 'Total (Today’s $)', label: 'Total (Today’s $)', format: (v) => formatCurrency(v as number) },
                    ]}
                  />
                </ChartDataDisclosure>
              </div>

              {/* Cash flow chart */}
              <div className="chart-container">
                <h3>Retirement Cash Flow (Income vs Expenses vs Withdrawals)</h3>
                <ResponsiveContainer width="100%" height={cashFlowChartHeight} aria-label={`Retirement cash flow from age ${cashFlowData[0]?.age ?? ''} onwards, ${cashFlowData.length} yearly data points`}>
                  <BarChart data={cashFlowData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={tc.border} />
                    <XAxis dataKey="age" stroke={tc.textDim} />
                    <YAxis stroke={tc.textDim} tickFormatter={(v) => formatCurrency(v, { compact: true })} />
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
                <ChartDataDisclosure summaryLabel="View as data table" rowCount={cashFlowData.length}>
                  <DataTable
                    rows={cashFlowData}
                    caption="Retirement cash flow: income vs expenses vs withdrawals, by age"
                    columns={[
                      { key: 'age', label: 'Age' },
                      { key: 'Income', label: 'Income', format: (v) => formatCurrency(v as number) },
                      { key: 'Withdrawals', label: 'Withdrawals', format: (v) => formatCurrency(v as number) },
                      { key: 'Expenses', label: 'Expenses', format: (v) => formatCurrency(v as number) },
                    ]}
                  />
                </ChartDataDisclosure>
              </div>

              {/* Year-by-year table */}
              <YearTable result={result} retirementAge={scenario.assumptions.retirementAge} scenario={scenario} focusAge={focusAge} onFocusConsumed={() => setFocusAge(null)} />
            </>
          )}

          {section === 'what-if' && (
            <Suspense fallback={<PanelFallback />}>
              <WhatIfPanel scenario={scenario} defaultOpen />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}

/** Builds a helpful "why is this empty?" message for the income detail row.
 *  Finds the next income source that will activate after the current age, so
 *  the user understands the gap (e.g. "Social Security starts at 67"). */
function nextIncomeHint(scenario: NonNullable<ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0]>, age: number): string {
  const upcoming = scenario.incomeSources
    .filter((i) => i.startAge > age)
    .sort((a, b) => a.startAge - b.startAge);
  if (upcoming.length > 0) {
    const next = upcoming[0];
    return `No income active at ${age}. Next up: ${next.name} at age ${next.startAge}.`;
  }
  const isRetired = age >= scenario.assumptions.retirementAge;
  return isRetired
    ? `No income active at ${age}. Add Social Security, a pension, or other sources on the Income tab.`
    : `No income active at ${age}. Add a salary or other income source on the Income tab.`;
}

/** Builds a helpful "why is this empty?" message for the expense detail row. */
function nextExpenseHint(scenario: NonNullable<ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0]>, age: number): string {
  const isRetired = age >= scenario.assumptions.retirementAge;
  // Check if any expenses exist at all for this phase
  const hasAnyForPhase = scenario.expenses.some((e) =>
    isRetired ? e.postRetirement : e.preRetirement,
  );
  if (!hasAnyForPhase) {
    return isRetired
      ? `No expenses marked for retirement at ${age}. Add housing, healthcare, and living costs on the Expenses tab.`
      : `No expenses marked for pre-retirement at ${age}. Add your current monthly costs on the Expenses tab.`;
  }
  // Expenses exist for the phase but none active at this exact age (age-window gap)
  return `No expenses active at age ${age}.`;
}

/** Compute per-source income breakdown for a given age */
function getIncomeBreakdown(scenario: NonNullable<ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0]>, age: number) {
  const a = scenario.assumptions;
  const items: { name: string; amount: number; type: string }[] = [];

  for (const inc of scenario.incomeSources) {
    if (age >= inc.startAge && (inc.endAge === null || age <= inc.endAge)) {
      // Shared with the engine so the breakdown can never drift from the
      // projection (COLA income grows at SS COLA, not general inflation).
      const nominalGross = incomeNominalAtAge(inc, age, a);
      const nominalNet = inc.taxable ? nominalGross * (1 - a.retirementTaxRate) : nominalGross;
      items.push({ name: inc.name, amount: nominalNet, type: inc.type });
    }
  }
  return items;
}

/** Compute per-source expense breakdown for a given age */
function getExpenseBreakdown(scenario: NonNullable<ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0]>, age: number) {
  const a = scenario.assumptions;
  const yearsFromNow = age - a.currentAge;
  const inflationFactor = Math.pow(1 + a.inflationRate, yearsFromNow);
  const isRetired = age >= a.retirementAge;
  const items: { name: string; amount: number; category: string }[] = [];

  // Regular expenses (includes linked :tax and :insurance entries).
  for (const exp of scenario.expenses) {
    const activePre = exp.preRetirement && !isRetired;
    const activePost = exp.postRetirement && isRetired;
    if (!activePre && !activePost) continue;
    if (exp.startAge !== null && age < exp.startAge) continue;
    if (exp.endAge !== null && age > exp.endAge) continue;
    // Legacy :mortgage linked expenses are computed by the engine now (see
    // below) — skip any that pre-date migration v6 to avoid double-counting.
    if (exp._propertyId?.endsWith(':mortgage')) continue;
    // In simple mode the whole housing payment (incl. tax + insurance) is
    // captured by the engine-computed mortgage payment below, so the separate
    // :tax / :insurance linked entries would double-count. Skip them.
    if (exp._propertyId) {
      const propId = exp._propertyId.split(':')[0];
      const linkedProp = scenario.properties?.find((p) => p.id === propId);
      if (linkedProp?.mortgageInputMode === 'simple') continue;
    }
    items.push({ name: exp.name, amount: exp.annualAmount * inflationFactor, category: exp.category });
  }

  // Mortgage payments (engine-computed, contractual — NOT inflated).
  // Counted in retirement only, matching the projection engine. Tax and
  // insurance are already covered above via their linked expense entries.
  if (isRetired && scenario.properties) {
    for (const prop of scenario.properties) {
      if (prop.saleAge && age >= prop.saleAge) continue;
      if (prop.purchaseAge && age < prop.purchaseAge) continue;
      const payment = mortgagePaymentAtAge(prop, age, a.currentAge);
      if (payment > 0) {
        // In simple mode the payment bundles tax + insurance (escrow).
        const label = prop.mortgageInputMode === 'simple'
          ? `${prop.name} — Mortgage (incl. tax & insurance)`
          : `${prop.name} — Mortgage`;
        items.push({ name: label, amount: payment, category: 'housing' });
      }
    }
  }

  // Life events ongoing
  for (const ev of scenario.events) {
    if (age >= ev.age && ev.ongoingAnnualImpact !== 0) {
      const dur = ev.ongoingDurationYears;
      if (dur === null || age < ev.age + dur) {
        items.push({ name: `${ev.name} — Ongoing`, amount: ev.ongoingAnnualImpact * inflationFactor, category: 'other' });
      }
    }
  }

  return items;
}

function YearTable({ result, retirementAge, scenario, focusAge, onFocusConsumed }: { result: NonNullable<ReturnType<typeof runProjection>>; retirementAge: number; scenario: NonNullable<ReturnType<typeof usePlanStore.getState>['plan']['scenarios'][0]>; focusAge?: number | null; onFocusConsumed?: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const [expandedAge, setExpandedAge] = useState<number | null>(null);
  // If a focusAge arrives that falls outside the default summary window,
  // widen the view so the row is actually rendered and scrollable to.
  const focusOutsideWindow = focusAge !== null && focusAge !== undefined && (focusAge < retirementAge - 5 || focusAge > retirementAge + 15);
  const data = (showAll || focusOutsideWindow) ? result.years : result.years.filter((y) => y.age >= retirementAge - 5 && y.age <= retirementAge + 15);

  // Refs to each year row so we can scrollIntoView when a headline card
  // drills down to a specific age.
  const rowRefs = useRef<Record<number, HTMLTableRowElement | null>>({});
  const [highlightAge, setHighlightAge] = useState<number | null>(null);

  // Toggle a row open/closed. When the user collapses the row that was just
  // highlighted by a card click, also clear the highlight — the persistent
  // outline otherwise has no obvious way to be dismissed.
  const toggleRow = (age: number) => {
    if (expandedAge === age) {
      setExpandedAge(null);
      if (highlightAge === age) setHighlightAge(null);
    } else {
      setExpandedAge(age);
    }
  };

  // When a focusAge arrives (from a headline card click), expand the row,
  // scroll it into view, and attach a highlight so the user sees exactly
  // which row backs the number they clicked. The highlight is now persistent
  // (no auto-clear timer) — it's only removed when the user clicks another
  // card OR manually collapses the highlighted row. Previously a 2.5s timer
  // raced screen-reader announcements and slow-scroll users.
  useEffect(() => {
    if (focusAge === null || focusAge === undefined) return;
    setExpandedAge(focusAge);
    setHighlightAge(focusAge);
    // Defer the scroll until React has rendered the row (and potentially
    // widened the data range via focusOutsideWindow).
    const scrollT = setTimeout(() => {
      rowRefs.current[focusAge]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
    // Reset the parent's focusAge shortly after so re-clicking the same card
    // can re-fire this effect (without this, focusAge stays at the same
    // value and React skips the effect). The visual highlight is independent
    // of focusAge, so it persists across the reset.
    const consumeT = setTimeout(() => onFocusConsumed?.(), 800);
    return () => { clearTimeout(scrollT); clearTimeout(consumeT); };
  }, [focusAge, onFocusConsumed]);

  return (
    <div className="panel">
      <div className="panel-header">
        <h2><Table2 size={20} aria-hidden="true" /> Year-by-Year Detail</h2>
        <button className="btn btn-sm" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show Summary' : 'Show All Years'}</button>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 28 }}></th>
              <th>Age</th>
              <th className="text-right col-optional">Start Assets</th>
              <th className="text-right col-optional">Contrib.</th>
              <th className="text-right col-optional">Deposits</th>
              <th className="text-right col-optional">Growth</th>
              <th className="text-right">Income</th>
              <th className="text-right">Withdrawals</th>
              <th className="text-right">Expenses</th>
              <th className="text-right">End Assets</th>
              <th className="text-right col-optional">Real $</th>
            </tr>
          </thead>
          <tbody>
            {data.map((y) => (
              <Fragment key={y.age}>
                <tr
                  ref={(el) => { rowRefs.current[y.age] = el; }}
                  style={y.depleted ? { color: 'var(--red)' } : {}}
                  className={`year-row${highlightAge === y.age ? ' year-row-highlight' : ''}`}
                  tabIndex={0}
                  role="button"
                  aria-expanded={expandedAge === y.age}
                  aria-label={`Age ${y.age}, ${expandedAge === y.age ? 'collapse' : 'expand'} details`}
                  onClick={() => toggleRow(y.age)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleRow(y.age);
                    }
                  }}
                >
                  <td className="drag-handle" style={{ cursor: 'pointer', opacity: 1 }} aria-hidden="true">{expandedAge === y.age ? '▼' : '▶'}</td>
                  <td style={{ cursor: 'pointer' }}>{y.age}</td>
                  <td className="text-right col-optional">{formatCurrency(y.beginningAssets, { compact: true })}</td>
                  <td className="text-right col-optional">{y.contributions > 0 ? formatCurrency(y.contributions, { compact: true }) : '—'}</td>
                  <td className="text-right col-optional" style={{ color: 'var(--chart-2)' }}>{y.deposits > 0 ? '+' + formatCurrency(y.deposits, { compact: true }) : '—'}</td>
                  <td className="text-right col-optional" style={{ color: 'var(--green)' }}>{y.growth > 0 ? '+' + formatCurrency(y.growth, { compact: true }) : '—'}</td>
                  <td className="text-right">{y.income > 0 ? formatCurrency(y.income, { compact: true }) : '—'}</td>
                  <td className="text-right" style={{ color: y.withdrawals > 0 ? 'var(--red)' : undefined }}>{y.withdrawals > 0 ? '-' + formatCurrency(y.withdrawals, { compact: true }) : '—'}</td>
                  <td className="text-right">{y.expenses > 0 ? formatCurrency(y.expenses, { compact: true }) : '—'}</td>
                  <td className="text-right" style={{ fontWeight: 600 }}>{formatCurrency(y.endingAssets, { compact: true })}</td>
                  <td className="text-right col-optional muted">{formatCurrency(y.realAssets, { compact: true })}</td>
                </tr>
                {expandedAge === y.age && (
                  <tr key={`${y.age}-detail`} className="year-detail-row">
                    <td colSpan={11} style={{ padding: 0 }}>
                      <div className="year-detail">
                        <div className="year-detail-grid">
                          <div className="year-detail-section">
                            <div className="year-detail-title"><Wallet size={15} aria-hidden="true" /> Income Sources</div>
                            <table className="data-table year-detail-table">
                              <tbody>
                                {(() => {
                                  const items = getIncomeBreakdown(scenario, y.age);
                                  if (items.length === 0) return <tr><td className="muted">{nextIncomeHint(scenario, y.age)}</td></tr>;
                                  const total = items.reduce((s, it) => s + it.amount, 0);
                                  return (
                                    <>
                                      {items.map((item, i) => (
                                        <tr key={i}>
                                          <td>{item.name}</td>
                                          <td className="muted" style={{ fontSize: 11 }}>{prettify(item.type)}</td>
                                          <td className="text-right" style={{ color: 'var(--green)' }}>{formatCurrency(item.amount)}</td>
                                        </tr>
                                      ))}
                                      <tr className="year-detail-total">
                                        <td colSpan={2}>Total / yr</td>
                                        <td className="text-right" style={{ color: 'var(--green)' }}>{formatCurrency(total)}</td>
                                      </tr>
                                    </>
                                  );
                                })()}
                              </tbody>
                            </table>
                          </div>
                          <div className="year-detail-section">
                            <div className="year-detail-title"><ListChecks size={15} aria-hidden="true" /> Expenses</div>
                            <table className="data-table year-detail-table">
                              <tbody>
                                {(() => {
                                  const items = getExpenseBreakdown(scenario, y.age);
                                  if (items.length === 0) return <tr><td className="muted">{nextExpenseHint(scenario, y.age)}</td></tr>;
                                  const total = items.reduce((s, it) => s + it.amount, 0);
                                  return (
                                    <>
                                      {items.map((item, i) => (
                                        <tr key={i}>
                                          <td>{item.name}</td>
                                          <td className="muted" style={{ fontSize: 11 }}>{prettify(item.category)}</td>
                                          <td className="text-right" style={{ color: 'var(--red)' }}>{formatCurrency(item.amount)}</td>
                                        </tr>
                                      ))}
                                      <tr className="year-detail-total">
                                        <td colSpan={2}>Total / yr</td>
                                        <td className="text-right" style={{ color: 'var(--red)' }}>{formatCurrency(total)}</td>
                                      </tr>
                                    </>
                                  );
                                })()}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

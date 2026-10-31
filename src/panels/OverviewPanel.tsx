/** Overview panel for the Inputs tab: wellness gauge, data completeness
 *  checklist, and a mini net worth chart. Lazily loaded by App so its
 *  recharts dependency stays out of the initial bundle. */
import { useMemo } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { ClipboardList, TrendingUp } from 'lucide-react';
import { useThemeColors } from '../hooks/useThemeColors';
import { useResponsiveChartHeight } from '../hooks/useResponsiveChartHeight';
import { projectScenario } from '../projectionCache';
import { getReadinessSummary } from '../engine';
import { formatCurrency, formatPercent, formatAge } from '../format';
import { ContextualResources, RESOURCE_GROUPS } from '../ui/shared';
import { ChartDataDisclosure } from '../inputs/ChartDataDisclosure';
import { DataTable } from '../inputs/DataTable';
import { UpcomingEventsWidget } from './UpcomingEventsWidget';
import type { Scenario } from '../types';

export function OverviewPanel({ scenario }: {
  scenario: Scenario;
}) {
  const tc = useThemeColors();
  const miniChartHeight = useResponsiveChartHeight({ min: 220, max: 360, vhFraction: 0.32 });
  const result = useMemo(() => projectScenario(scenario), [scenario]);
  const readiness = useMemo(
    () => getReadinessSummary(result, scenario.assumptions.retirementAge, scenario.assumptions.safeWithdrawalRate),
    [result, scenario.assumptions.retirementAge, scenario.assumptions.safeWithdrawalRate],
  );

  const currentNetWorth = scenario.accounts.reduce((s, a) => s + a.balance, 0);
  const totalContributions = scenario.accounts.reduce((s, a) => s + a.annualContribution + a.employerMatch, 0);

  // Net worth includes both financial-account balances AND home equity
  // (property market value minus outstanding mortgage). The mortgage
  // balance is treated as static here — see propertyValueAtAge in engine.ts
  // for the matching treatment in the year-by-year chart.
  const propertyEquityNow = (scenario.properties ?? []).reduce(
    (s, p) => s + Math.max(0, (p.currentValue ?? 0) - (p.mortgageBalance ?? 0)),
    0,
  );
  const totalNetWorth = currentNetWorth + propertyEquityNow;

  const checks = [
    { label: 'Has at least 1 account', pass: scenario.accounts.length > 0, weight: 8 },
    { label: 'Account balances > $0', pass: scenario.accounts.some(a => a.balance > 0), weight: 7 },
    { label: 'Has retirement contributions', pass: scenario.accounts.some(a => a.annualContribution > 0), weight: 8 },
    { label: `Well-balanced accounts (${Math.min(scenario.accounts.length, 5)}/5)`, pass: scenario.accounts.length >= 5, weight: 12, partial: Math.min(12, Math.round((Math.min(scenario.accounts.length, 5) / 5) * 12)) },
    { label: 'Has expenses defined', pass: scenario.expenses.length > 0, weight: 8 },
    { label: 'Has post-retirement expenses', pass: scenario.expenses.some(e => e.postRetirement), weight: 5 },
    { label: `Covers ${Math.min(10, scenario.expenses.length)}/10+ common categories`, pass: scenario.expenses.length >= 10, weight: 12, partial: Math.min(12, Math.round((Math.min(scenario.expenses.length, 10) / 10) * 12)) },
    { label: 'Has income sources', pass: scenario.incomeSources.length > 0, weight: 10 },
    { label: 'Has Social Security or pension', pass: scenario.incomeSources.some(i => i.type === 'social_security' || i.type === 'pension'), weight: 10 },
    { label: 'Current age < retirement age', pass: scenario.assumptions.currentAge < scenario.assumptions.retirementAge, weight: 5 },
    { label: 'Retirement age < end age', pass: scenario.assumptions.retirementAge < scenario.assumptions.endAge, weight: 5 },
    { label: 'Realistic withdrawal rate (3-5%)', pass: scenario.assumptions.safeWithdrawalRate >= 0.03 && scenario.assumptions.safeWithdrawalRate <= 0.05, weight: 5 },
    { label: 'Realistic pre-retirement return (5-10%)', pass: scenario.assumptions.preRetirementReturn >= 0.05 && scenario.assumptions.preRetirementReturn <= 0.10, weight: 5 },
  ];
  const wellnessScore = checks.reduce((sum, c) => {
    const earned = 'partial' in c && (c as { partial?: number }).partial !== undefined
      ? Math.max((c as { partial?: number }).partial!, c.pass ? c.weight : 0)
      : (c.pass ? c.weight : 0);
    return sum + earned;
  }, 0);
  const wellnessColor = wellnessScore >= 80 ? 'var(--green)' : wellnessScore >= 50 ? 'var(--yellow)' : 'var(--red)';
  const wellnessLabel = wellnessScore >= 80 ? 'Detailed' : wellnessScore >= 50 ? 'Basic' : 'Sparse';
  const gaugeDeg = Math.min(180, (wellnessScore / 100) * 180);

  // Mini-chart series: stacked liquid + property equity so users see both
  // the financial-account trajectory and how much of their wealth is tied
  // up in real estate. `total` is the convenience top-line sum.
  const miniChartData = result.years.map((y) => ({
    age: y.age,
    liquid: Math.round(y.realAssets),
    propertyEquity: Math.round(y.realPropertyEquity),
    total: Math.round(y.realAssets + y.realPropertyEquity),
  }));

  // Build the sub-line under "Current Net Worth" — distinguishes liquid
  // accounts vs. home equity so users understand what the total includes.
  const accountCount = scenario.accounts.length;
  const netWorthSub = propertyEquityNow > 0
    ? `${formatCurrency(currentNetWorth, { compact: true })} liquid · ${formatCurrency(propertyEquityNow, { compact: true })} equity`
    : `${accountCount} ${accountCount === 1 ? 'account' : 'accounts'}`;

  return (
    <div>
      <div className="summary-grid">
        <div className="summary-card">
          <div className="label">Current Net Worth</div>
          <div className="value">{formatCurrency(totalNetWorth, { compact: true })}</div>
          <div className="sub">{netWorthSub}</div>
        </div>
        <div className="summary-card">
          <div className="label">Projected at Retirement</div>
          <div className="value">
            {formatCurrency(
              readiness.nestEggAtRetirement +
                (result.years.find((y) => y.age === scenario.assumptions.retirementAge)?.propertyEquity ?? 0),
              { compact: true },
            )}
          </div>
          <div className="sub">
            {formatCurrency(
              readiness.nestEggAtRetirementReal +
                (result.years.find((y) => y.age === scenario.assumptions.retirementAge)?.realPropertyEquity ?? 0),
              { compact: true },
            )} in today's $
          </div>
        </div>
        <div className="summary-card">
          <div className="label">Annual Savings Rate</div>
          <div className="value">{formatCurrency(totalContributions, { compact: true })}</div>
          <div className="sub">{totalContributions > 0 && totalNetWorth > 0 ? `${formatPercent(totalContributions / totalNetWorth)} of net worth` : '—'}</div>
        </div>
        <div className="summary-card">
          <div className="label">Plan Outcome</div>
          <div className={`value ${result.success ? 'value-good' : 'value-bad'}`}>{result.success ? '✓ On Track' : '✗ At Risk'}</div>
          <div className="sub">{result.success ? `Lasts to age ${scenario.assumptions.endAge}` : `Depleted at age ${formatAge(result.depletionAge)}`}</div>
        </div>
      </div>

      <div className="overview-wellness-grid">
        <div className="panel overview-gauge-card">
          <h3 className="overview-section-title"><ClipboardList size={16} aria-hidden="true" /> Plan Detail</h3>
          <div className="overview-gauge-container">
            <div className="overview-gauge" style={{ background: `conic-gradient(from 270deg, ${wellnessColor} 0deg ${gaugeDeg}deg, var(--bg-subtle) ${gaugeDeg}deg 180deg, transparent 180deg)` }}>
              <div className="overview-gauge-inner">
                <span className="overview-gauge-score" style={{ color: wellnessColor }}>{wellnessScore}%</span>
                <span className="overview-gauge-label">{wellnessLabel}</span>
              </div>
            </div>
          </div>
          <div className="overview-gauge-hint">How much of your plan you've filled in — not a measure of whether it will succeed</div>
        </div>
        <div className="panel overview-checks-card">
          <h3 className="overview-section-title">✅ Checklist</h3>
          <div className="overview-checks-list">
            {checks.map((c, i) => (
              <div key={i} className="overview-check-item">
                <span className={`overview-check-icon ${c.pass ? 'pass' : 'fail'}`}>{c.pass ? '✓' : '○'}</span>
                <span className={`overview-check-label ${c.pass ? '' : 'incomplete'}`}>{c.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="chart-container">
        <h3><TrendingUp size={16} aria-hidden="true" /> Projected Net Worth (Today's Dollars)</h3>
        <ResponsiveContainer width="100%" height={miniChartHeight} aria-label={`Projected net worth in today's dollars, ${miniChartData.length} yearly data points from age ${miniChartData[0]?.age ?? ''} to ${miniChartData[miniChartData.length - 1]?.age ?? ''}`}>
          <AreaChart data={miniChartData}>
            <defs>
              <linearGradient id="overviewGradientLiquid" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={tc.chart} stopOpacity={0.35} />
                <stop offset="100%" stopColor={tc.chart} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="overviewGradientProperty" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={tc.chart3} stopOpacity={0.35} />
                <stop offset="100%" stopColor={tc.chart3} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={tc.border} />
            <XAxis dataKey="age" stroke={tc.textDim} />
            <YAxis stroke={tc.textDim} tickFormatter={(v) => formatCurrency(v, { compact: true })} />
            <Tooltip contentStyle={{ background: tc.panel, border: `1px solid ${tc.border}`, borderRadius: 8 }} formatter={(v: number) => formatCurrency(v)} labelFormatter={(l) => `Age ${l}`} labelStyle={{ color: tc.text }} itemStyle={{ color: tc.text }} />
            <Legend />
            {/* Stacked: liquid assets on the bottom, property equity on top. */}
            <Area type="monotone" dataKey="liquid" stackId="networth" name="Liquid Assets" stroke={tc.chart} strokeWidth={2} fill="url(#overviewGradientLiquid)" />
            <Area type="monotone" dataKey="propertyEquity" stackId="networth" name="Home Equity" stroke={tc.chart3} strokeWidth={2} fill="url(#overviewGradientProperty)" />
            {/* Top-line overlay showing total net worth so the user can read it directly. */}
            <Area type="monotone" dataKey="total" name="Total Net Worth" stroke={tc.text} strokeWidth={1.5} fill="none" strokeDasharray="0" />
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
        <ChartDataDisclosure summaryLabel="View as data table" rowCount={miniChartData.length}>
          <DataTable
            rows={miniChartData}
            caption="Projected net worth in today's dollars, by age"
            columns={[
              { key: 'age', label: 'Age' },
              { key: 'liquid', label: 'Liquid Assets', format: (v) => formatCurrency(v as number) },
              { key: 'propertyEquity', label: 'Home Equity', format: (v) => formatCurrency(v as number) },
              { key: 'total', label: 'Total Net Worth', format: (v) => formatCurrency(v as number) },
            ]}
          />
        </ChartDataDisclosure>
      </div>

      {/* Upcoming Life Events widget — shows the next few events so users can
          see at a glance what's coming. Each event affects the projection
          at its `age`; future events show up here but not in today's
          "Current Net Worth" card (which is always at currentAge). */}
      <UpcomingEventsWidget scenario={scenario} currentAge={scenario.assumptions.currentAge} />

      <div className="summary-strip">
        <div className="summary-strip-item"><span className="label">Years to Retirement</span><span className="value">{Math.max(0, scenario.assumptions.retirementAge - scenario.assumptions.currentAge)}</span></div>
        <div className="summary-strip-item"><span className="label">Years in Retirement</span><span className="value">{scenario.assumptions.endAge - scenario.assumptions.retirementAge}</span></div>
        <div className="summary-strip-item"><span className="label">Monthly Expenses (Ret.)</span><span className="value">{formatCurrency(readiness.firstYearExpenses / 12, { compact: true })}</span></div>
        <div className="summary-strip-item"><span className="label">Monthly Income (Ret.)</span><span className="value">{formatCurrency(readiness.firstYearIncome / 12, { compact: true })}</span></div>
        <div className="summary-strip-item"><span className="label">Life Events</span><span className="value">{scenario.events.length}</span></div>
      </div>

      <ContextualResources group={RESOURCE_GROUPS[0]} />
    </div>
  );
}

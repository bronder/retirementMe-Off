/** Compare Scenarios tab: overlaid net-worth trajectories and an assumption
 *  diff table across all scenarios. Lazily loaded by App so the recharts
 *  dependency stays out of the initial bundle. */
import { useMemo } from 'react';
import {
  ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from 'recharts';
import { Scale } from 'lucide-react';
import { usePlanStore } from '../store';
import type { runProjection } from '../engine';
import { formatCurrency, formatPercent, formatAge } from '../format';
import { useThemeColors } from '../hooks/useThemeColors';
import { useResponsiveChartHeight } from '../hooks/useResponsiveChartHeight';
import { DataTable } from '../inputs/DataTable';
import { ChartDataDisclosure } from '../inputs/ChartDataDisclosure';
import type { Scenario } from '../types';


export function CompareView({ results, scenarios }: { results: NonNullable<ReturnType<typeof runProjection>>[]; scenarios: ReturnType<typeof usePlanStore.getState>['plan']['scenarios'] }) {
  const tc = useThemeColors();
  const tooltipStyle = { background: tc.panel, border: `1px solid ${tc.border}`, borderRadius: 8 };
  const compareChartHeight = useResponsiveChartHeight({ min: 280, max: 480, vhFraction: 0.42 });
  // Need the store to offer a one-click "duplicate" from the empty state so a
  // user landing on Compare with a single scenario isn't staring at a lonely
  // card and a hidden diff table — they get a clear path to a 2nd scenario.
  const duplicateScenario = usePlanStore((s) => s.duplicateScenario);
  const activeScenarioId = usePlanStore((s) => s.activeScenarioId);

  // Assumption fields to compare, with label + formatter. Only fields that
  // DIFFER across scenarios are shown — identical values add noise, not signal.
  const assumptionFields: { key: keyof Scenario['assumptions']; label: string; fmt: (v: number) => string }[] = [
    { key: 'currentAge', label: 'Current age', fmt: (v) => String(v) },
    { key: 'retirementAge', label: 'Retirement age', fmt: (v) => String(v) },
    { key: 'endAge', label: 'Plan end age', fmt: (v) => String(v) },
    { key: 'inflationRate', label: 'Inflation', fmt: (v) => formatPercent(v) },
    { key: 'socialSecurityCola', label: 'SS COLA', fmt: (v) => formatPercent(v) },
    { key: 'retirementTaxRate', label: 'Retirement tax rate', fmt: (v) => formatPercent(v) },
    { key: 'safeWithdrawalRate', label: 'Safe withdrawal', fmt: (v) => formatPercent(v) },
    { key: 'preRetirementReturn', label: 'Pre-retirement return', fmt: (v) => formatPercent(v) },
    { key: 'postRetirementReturn', label: 'Post-retirement return', fmt: (v) => formatPercent(v) },
  ];
  // Map results back to their scenarios so the diff columns align with the
  // summary cards above (same scenario order).
  const orderedScenarios = results
    .map((r) => scenarios.find((s) => s.id === r.scenarioId))
    .filter((s): s is Scenario => !!s);
  const differingFields = assumptionFields.filter((f) => {
    const vals = orderedScenarios.map((s) => s.assumptions[f.key]);
    return !vals.every((v) => v === vals[0]);
  });
  // Each scenario gets two parallel lines: liquid and total (incl. home equity).
  // Total - Liquid === Home Equity at that age, so the gap between the lines
  // visually communicates how much of each scenario's wealth is real estate.
  const compareData = useMemo(() => {
    const maxAge = Math.max(...results.map((r) => r.years[r.years.length - 1]?.age ?? 0));
    const data: Record<string, number | string>[] = [];
    for (let age = results[0]?.years[0]?.age ?? 0; age <= maxAge; age++) {
      const row: Record<string, number | string> = { age };
      results.forEach((r) => {
        const y = r.years.find((y) => y.age === age);
        if (!y) return;
        row[`${r.scenarioName} (Liquid)`] = Math.round(y.realAssets);
        row[`${r.scenarioName} (Total)`] = Math.round(y.realAssets + y.realPropertyEquity);
      });
      data.push(row);
    }
    return data;
  }, [results]);

  // Scenario palette: derived from the active theme so switching themes
  // recolors these lines along with the rest of the chart. Slots 1–4 take the
  // four `--chart` tokens; slots 5–6 reuse `--red` / `--yellow` so a
  // scenario that's depleting its savings lands visually as "at risk" without
  // needing an extra legend.
  const colors = [tc.chart, tc.chart2, tc.chart3, tc.chart4, tc.chart5, tc.chart6];

  return (
    <div>
      {results.length < 2 && (
        <div className="panel mb-16 compare-empty">
          <div className="compare-empty-icon" aria-hidden="true"><Scale size={32} /></div>
          <div className="compare-empty-body">
            <h3>Compare needs at least two scenarios</h3>
            <p className="section-help" style={{ marginBottom: 0 }}>
              You currently have {results.length === 1 ? 'one' : 'none'}. Duplicate your active scenario and tweak an
              assumption (retirement age, withdrawal rate, returns) to see how the outcome changes side by side.
            </p>
          </div>
          {results.length === 1 && (
            <button
              className="btn"
              onClick={() => duplicateScenario(activeScenarioId)}
            >
              ⧉ Duplicate “{scenarios.find((s) => s.id === activeScenarioId)?.name ?? 'scenario'}”
            </button>
          )}
        </div>
      )}

      <div className="summary-grid">
        {results.map((r, i) => (
          <div key={r.scenarioId} className="summary-card">
            <div className="label" style={{ color: colors[i % colors.length] }}>{r.scenarioName}</div>
            <div className={`value ${r.success ? 'value-good' : 'value-bad'}`}>
              {r.success ? '✓ Sustainable' : '✗ Depleted'}
            </div>
            <div className="sub">
              {r.success ? `${formatCurrency(r.finalAssetsReal, { compact: true })} at end` : `Runs out at age ${formatAge(r.depletionAge)}`}
            </div>
          </div>
        ))}
      </div>

      {differingFields.length > 0 && (
        <div className="panel mb-16">
          <div className="panel-header">
            <h3>What's different?</h3>
          </div>
          <p className="section-help">
            Only the assumptions that vary between scenarios are shown — so you can see <em>why</em> the outcomes differ without switching back to Inputs.
          </p>
          <div className="table-scroll">
            <table className="data-table compare-diff-table">
              <thead>
                <tr>
                  <th>Assumption</th>
                  {orderedScenarios.map((s, i) => (
                    <th key={s.id} className="text-right" style={{ color: colors[i % colors.length] }}>{s.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {differingFields.map((f) => (
                  <tr key={f.key}>
                    <td>{f.label}</td>
                    {orderedScenarios.map((s) => (
                      <td key={s.id} className="text-right">{f.fmt(s.assumptions[f.key] as number)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="chart-container">
        <h3>Net Worth Comparison (Today's Dollars)</h3>
        <ResponsiveContainer width="100%" height={compareChartHeight} aria-label={`Net worth comparison across ${orderedScenarios.length} scenario${orderedScenarios.length === 1 ? '' : 's'}, in today's dollars, ${compareData.length} yearly data points`}>
          <LineChart data={compareData}>
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
            {results.map((r, i) => {
              const c = colors[i % colors.length];
              // Two lines per scenario: solid for liquid assets, dashed for
              // total (incl. home equity). The gap between them is the home
              // equity contribution at each age.
              // NOTE: <Line> must be a DIRECT child of <LineChart> — Recharts
              // discovers series via React.Children and skips anything nested
              // in a wrapper like <g> or <Fragment>, so we return a flat array.
              return [
                <Line key={`${r.scenarioId}-liquid`} type="monotone" dataKey={`${r.scenarioName} (Liquid)`} name={r.scenarioName} stroke={c} strokeWidth={2} dot={false} />,
                <Line key={`${r.scenarioId}-total`} type="monotone" dataKey={`${r.scenarioName} (Total)`} name={`${r.scenarioName} (+ home)`} stroke={c} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />,
              ];
            })}
          </LineChart>
        </ResponsiveContainer>
        <ChartDataDisclosure summaryLabel="View as data table" rowCount={compareData.length}>
          <DataTable
            rows={compareData}
            caption="Net worth comparison across scenarios in today's dollars"
            columns={[
              { key: 'age', label: 'Age' },
              ...orderedScenarios.flatMap((s, i) => {
                // Tint both of this scenario's columns with its chart color so
                // the eye groups them together and ties them to the line above.
                const accentColor = colors[i % colors.length];
                return [
                  { key: `${s.name} (Liquid)` as never, label: `${s.name} (Liquid)`, format: (v: unknown) => formatCurrency(v as number), accentColor },
                  { key: `${s.name} (Total)` as never, label: `${s.name} (Total, incl. home)`, format: (v: unknown) => formatCurrency(v as number), accentColor },
                ];
              }),
            ]}
          />
        </ChartDataDisclosure>
      </div>
    </div>
  );
}

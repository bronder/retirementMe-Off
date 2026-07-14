/**
 * Monte Carlo panel — runs the projection many times with randomized
 * returns and surfaces success-rate, percentile outcomes, and a
 * confidence-band chart on top of the deterministic trajectory.
 *
 * Reuses the existing `useThemeColors()` color hook from App.tsx so the
 * percentile chart respects the active theme without duplicate code.
 */
import { useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  BarChart,
  Bar,
} from 'recharts';
import { runMonteCarloProjection } from './engine';
import type { MonteCarloOptions, MonteCarloResult, Scenario } from './types';
import { formatCurrency } from './format';

type ThemeColor = string;
interface ThemeColors {
  panel: string;
  border: string;
  textDim: string;
  text: string;
  chart: string;
  chart2: string;
  chart3: string;
  chart4: string;
  green: string;
  red: string;
  yellow: string;
}

interface MonteCarloPanelProps {
  scenario: Scenario;
  colors: ThemeColors;
}

interface RunState {
  status: 'idle' | 'running' | 'done' | 'error';
  result: MonteCarloResult | null;
  error: string | null;
}

/**
 * Default σ value (15%) matches the rule of thumb for a balanced portfolio.
 * Real-world stock-heavy: ~18–20%, conservative: ~8–10%.
 */
const DEFAULT_SIGMA = 0.15;
const DEFAULT_RUNS = 1000;

/**
 * Tone buckets for success rate: green if ≥90%, yellow if 70–90%, red if <70%.
 * Aligned with the design system's reserved semantic colors.
 */
function successTone(rate: number, green: string, yellow: string, red: string): {
  color: ThemeColor;
  label: string;
} {
  if (rate >= 0.9) return { color: green, label: 'Strong' };
  if (rate >= 0.7) return { color: yellow, label: 'Moderate' };
  return { color: red, label: 'At risk' };
}

export function MonteCarloPanel({ scenario, colors }: MonteCarloPanelProps) {
  const [numRuns, setNumRuns] = useState<number>(DEFAULT_RUNS);
  const [returnStdDev, setReturnStdDev] = useState<number>(DEFAULT_SIGMA);
  const [run, setRun] = useState<RunState>({ status: 'idle', result: null, error: null });
  // Depletion histogram drill-down: when the user clicks a bar, we surface
  // the per-run final-asset values for that depletion age in a small table.
  const [selectedBin, setSelectedBin] = useState<number | null>(null);

  const handleRun = () => {
    setRun({ status: 'running', result: null, error: null });
    // Defer to next tick so the spinner has a chance to render before
    // we occupy the main thread running the trials.
    requestAnimationFrame(() => {
      try {
        const options: MonteCarloOptions = { numRuns, returnStdDev };
        // No seed → random each run. We re-randomize on purpose so the user
        // can hit Run multiple times and see natural variance.
        const result = runMonteCarloProjection(scenario, options);
        setRun({ status: 'done', result, error: null });
      } catch (e) {
        setRun({
          status: 'error',
          result: null,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    });
  };

  const tone = run.result ? successTone(run.result.successRate, colors.green, colors.yellow, colors.red) : null;

  // Build chart data from percentilePaths. We layer the bands by stacking
  // p10..p90 so Recharts' stacked area can fill between them.
  const bandData = useMemo(() => {
    if (!run.result) return [];
    return run.result.percentilePaths.map((p) => ({
      age: p.age,
      // Recharts stacked area trick: bottom and span values that sum to top.
      p10: Math.max(0, p.p10),
      bandMid: Math.max(0, p.p50 - p.p10),
      bandTop: Math.max(0, p.p90 - p.p50),
      p50: Math.max(0, p.p50),
      p90: Math.max(0, p.p90),
    }));
  }, [run.result]);

  // Depletion histogram — bucket depletion ages into single-year bins.
  const depletionHistogram = useMemo(() => {
    if (!run.result || run.result.depletionAges.length === 0) return [];
    const buckets = new Map<number, number>();
    for (const age of run.result.depletionAges) {
      if (age === null) continue;
      const bin = Math.floor(age);
      buckets.set(bin, (buckets.get(bin) ?? 0) + 1);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a - b)
      .map(([age, count]) => ({ age, count }));
  }, [run.result]);

  // Drill-down details for the currently-selected histogram bar. Lists every
  // trial that depleted at that exact age (1-indexed), plus summary stats.
  // Uses peak assets, retirement assets, and final assets so the table
  // shows the dramatic drawdown (peak → retirement → depleted at 0)
  // rather than a column of zeros.
  const selectedBinDetails = useMemo(() => {
    if (!run.result || selectedBin === null) return null;
    const {
      depletionAges,
      trialFinalAssets,
      trialPeakAssets,
      trialAssetsAtRetirement,
      depletionCount,
    } = run.result;
    // Enumerate the index of every trial that depleted at this age.
    const matchingIndices: number[] = [];
    for (let i = 0; i < depletionAges.length; i++) {
      if (depletionAges[i] === selectedBin) matchingIndices.push(i);
    }
    if (matchingIndices.length === 0) return null;
    const finalAssets = matchingIndices.map((i) => trialFinalAssets[i]);
    const peakAssets = matchingIndices.map((i) => trialPeakAssets[i]);
    const retirementAssets = matchingIndices.map((i) => trialAssetsAtRetirement[i]);
    const sorted = [...finalAssets].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const sortedPeak = [...peakAssets].sort((a, b) => a - b);
    const medianPeak = sortedPeak[Math.floor(sortedPeak.length / 2)];
    const sortedRet = [...retirementAssets].sort((a, b) => a - b);
    const medianRetirement = sortedRet[Math.floor(sortedRet.length / 2)];
    // Median drawdown: how much value the median run lost from peak to depleted.
    // The "% of peak left" is a related but different metric — it's the
    // fraction of peak that survived to depletion. We expose both so the
    // table can show "$X lost (Y% of peak left)".
    const medianDrawdown = medianPeak - median;
    const medianDrawdownPct =
      medianPeak > 0 ? Math.max(0, (median / medianPeak) * 100) : 0;
    return {
      age: selectedBin,
      count: matchingIndices.length,
      shareOfFailures: depletionCount > 0 ? matchingIndices.length / depletionCount : 0,
      medianFinalAssets: median,
      minFinalAssets: min,
      maxFinalAssets: max,
      medianPeakAssets: medianPeak,
      medianRetirementAssets: medianRetirement,
      medianDrawdown,
      medianDrawdownPct,
      runs: matchingIndices.map((trialIndex, positionInBin) => ({
        trialIndex: trialIndex + 1, // 1-indexed for display
        positionInBin: positionInBin + 1,
        depletionAge: selectedBin,
        retirementAssets: retirementAssets[positionInBin],
        peakAssets: peakAssets[positionInBin],
        finalAssets: trialFinalAssets[trialIndex],
      })),
    };
  }, [run.result, selectedBin]);

  return (
    <div className="monte-carlo-panel">
      {/* === Header / Controls === */}
      <div className="mc-controls">
        <div className="mc-control">
          <label htmlFor="mc-runs">Number of runs</label>
          <select
            id="mc-runs"
            className="table-select"
            value={String(numRuns)}
            onChange={(e) => setNumRuns(Number(e.target.value))}
            disabled={run.status === 'running'}
          >
            <option value="100">100 (fast)</option>
            <option value="500">500</option>
            <option value="1000">1,000 (recommended)</option>
            <option value="5000">5,000</option>
            <option value="10000">10,000 (slow)</option>
          </select>
        </div>

        <div className="mc-control">
          <label htmlFor="mc-sigma">Return σ (volatility)</label>
          <select
            id="mc-sigma"
            className="table-select"
            value={String(returnStdDev)}
            onChange={(e) => setReturnStdDev(Number(e.target.value))}
            disabled={run.status === 'running'}
          >
            <option value="0.08">8% — conservative</option>
            <option value="0.12">12% — moderate</option>
            <option value="0.15">15% — balanced (default)</option>
            <option value="0.18">18% — growth</option>
            <option value="0.22">22% — aggressive</option>
          </select>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleRun}
          disabled={run.status === 'running'}
          style={{ alignSelf: 'flex-end' }}
        >
          {run.status === 'running' ? 'Running…' : '🎲 Run Simulation'}
        </button>
      </div>

      <p className="mc-help muted">
        Each run samples annual returns from a log-normal distribution calibrated to your account
        expected returns. Showing how often your plan survives across {numRuns.toLocaleString()} trials.
      </p>

      {/* === Idle state === */}
      {run.status === 'idle' && (
        <div className="mc-idle muted">
          Configure above and click <strong>Run Simulation</strong> to stress-test your plan
          against market volatility.
        </div>
      )}

      {/* === Error === */}
      {run.status === 'error' && (
        <div className="mc-error">⚠️ {run.error}</div>
      )}

      {/* === Running state === */}
      {run.status === 'running' && (
        <div className="mc-running muted">Running {numRuns.toLocaleString()} trials…</div>
      )}

      {/* === Results === */}
      {run.status === 'done' && run.result && tone && (
        <>
          {/* Headline metrics */}
          <div className="mc-summary-grid">
            <div className="mc-summary-card mc-summary-hero">
              <div className="mc-summary-label">Success rate</div>
              <div className="mc-summary-value" style={{ color: tone.color }}>
                {(run.result.successRate * 100).toFixed(1)}%
              </div>
              <div className="mc-summary-sub">
                {run.result.successCount.toLocaleString()} of {run.result.numRuns.toLocaleString()} runs funded
                retirement through {scenario.assumptions.endAge}.
              </div>
              <div className="mc-tone-pill" style={{ background: tone.color }}>
                {tone.label}
              </div>
            </div>

            <div className="mc-summary-card">
              <div className="mc-summary-label">Median final assets</div>
              <div className="mc-summary-value">{formatCurrency(run.result.medianFinalAssets, { compact: true })}</div>
              <div className="mc-summary-sub muted">
                <span style={{ color: colors.red }}>{formatCurrency(run.result.p10FinalAssets, { compact: true })}</span>
                {' '} – {' '}
                <span style={{ color: colors.green }}>{formatCurrency(run.result.p90FinalAssets, { compact: true })}</span>
                {' '} (P10 – P90, in today's $)
              </div>
            </div>

            <div className="mc-summary-card">
              <div className="mc-summary-label">Depletion (failed runs)</div>
              <div className="mc-summary-value" style={{ color: colors.red }}>
                {run.result.depletionCount.toLocaleString()}
              </div>
              <div className="mc-summary-sub muted">
                {run.result.medianDepletionAge !== null
                  ? <>Median depletion at age <strong>{run.result.medianDepletionAge}</strong></>
                  : <>No runs depleted within the plan.</>}
              </div>
            </div>

            <div className="mc-summary-card">
              <div className="mc-summary-label">Elapsed</div>
              <div className="mc-summary-value">{run.result.elapsedMs.toFixed(0)} ms</div>
              <div className="mc-summary-sub muted">
                for {run.result.numRuns.toLocaleString()} trials · σ = {(returnStdDev * 100).toFixed(0)}%
              </div>
            </div>
          </div>

          {/* Confidence band chart */}
          <div className="chart-container">
            <h3>Confidence bands — net worth in today's dollars</h3>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={bandData}>
                <defs>
                  <linearGradient id="mcBandGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors.chart} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={colors.chart} stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
                <XAxis
                  dataKey="age"
                  stroke={colors.textDim}
                  label={{ value: 'Age', position: 'insideBottom', dy: 10, fill: colors.textDim, fontSize: 11 }}
                />
                <YAxis
                  stroke={colors.textDim}
                  tickFormatter={(v) => formatCurrency(v, { compact: true })}
                />
                <Tooltip
                  contentStyle={{ background: colors.panel, border: `1px solid ${colors.border}`, borderRadius: 8 }}
                  formatter={(value: number, name: string) => {
                    const labels: Record<string, string> = {
                      p10: '10th percentile (worst-ish)',
                      p50: 'Median',
                      p90: '90th percentile (best-ish)',
                      bandMid: 'P50 − P10 span',
                      bandTop: 'P90 − P50 span',
                    };
                    return [formatCurrency(value), labels[name] ?? name];
                  }}
                  labelFormatter={(l) => `Age ${l}`}
                  labelStyle={{ color: colors.text }}
                  itemStyle={{ color: colors.text }}
                />
                <ReferenceLine
                  x={scenario.assumptions.retirementAge}
                  stroke={colors.yellow}
                  strokeDasharray="5 5"
                  label={{ value: 'Retire', fill: colors.yellow, fontSize: 11 }}
                />
                {/* Stack the bands so p10 → mid → top produces a clean fill from p10 up to p90. */}
                <Area type="monotone" dataKey="p10" stackId="band" stroke="none" fill="transparent" />
                <Area type="monotone" dataKey="bandMid" stackId="band" stroke="none" fill="url(#mcBandGradient)" />
                <Area type="monotone" dataKey="bandTop" stackId="band" stroke="none" fill="url(#mcBandGradient)" />
                {/* Median line on top */}
                <Area type="monotone" dataKey="p50" stroke={colors.chart} strokeWidth={2} fill="none" />
              </AreaChart>
            </ResponsiveContainer>
            <div className="mc-legend">
              <span className="mc-legend-swatch" style={{ background: 'linear-gradient(180deg, var(--chart), transparent)' }} />
              <span className="muted">P10–P90 band (80% of outcomes)</span>
              <span className="mc-legend-swatch mc-legend-line" style={{ background: colors.chart }} />
              <span className="muted">Median (P50)</span>
            </div>
          </div>

          {/* Depletion histogram — only if any runs depleted. Bars are
              clickable: selecting one surfaces a per-bin run breakdown
              beneath the chart (count, share of failures, median & range
              of final assets, plus a per-run table). */}
          {depletionHistogram.length > 0 && (
            <div className="chart-container">
              <h3>When do failed runs run out of money?</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={depletionHistogram}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
                  <XAxis
                    dataKey="age"
                    stroke={colors.textDim}
                    label={{ value: 'Depletion age', position: 'insideBottom', dy: 10, fill: colors.textDim, fontSize: 11 }}
                  />
                  <YAxis
                    stroke={colors.textDim}
                    allowDecimals={false}
                    label={{ value: '# runs', angle: -90, position: 'insideLeft', fill: colors.textDim, fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{ background: colors.panel, border: `1px solid ${colors.border}`, borderRadius: 8 }}
                    formatter={(v: number) => [`${v} run${v === 1 ? '' : 's'} — click for details`, 'Depleted at this age']}
                    labelFormatter={(l) => `Age ${l}`}
                    labelStyle={{ color: colors.text }}
                    itemStyle={{ color: colors.text }}
                  />
                  <Bar
                    dataKey="count"
                    fill={colors.red}
                    cursor="pointer"
                    onClick={(d: { age: number; count: number }) =>
                      setSelectedBin((prev) => (prev === d.age ? null : d.age))
                    }
                  />
                </BarChart>
              </ResponsiveContainer>

              {/* Drill-down: per-bin run table when a bar is selected. */}
              {selectedBinDetails && (
                <div className="mc-drilldown">
                  <div className="mc-drilldown-header">
                    <div>
                      <div className="mc-drilldown-title">
                        Runs that depleted at age <strong>{selectedBinDetails.age}</strong>
                      </div>
                      <div className="mc-drilldown-sub muted">
                        {selectedBinDetails.count.toLocaleString()} run
                        {selectedBinDetails.count === 1 ? '' : 's'}
                        {' '}({(selectedBinDetails.shareOfFailures * 100).toFixed(1)}% of all failures)
                      </div>
                    </div>
                    <button
                      className="btn btn-sm"
                      onClick={() => setSelectedBin(null)}
                      title="Close drill-down"
                    >
                      ✕ Close
                    </button>
                  </div>

                  {/* Summary stats grid — three values that contextualize the
                      "drawdown" story: how much the typical run had at
                      retirement, how high it climbed (peak), and where it
                      finally ended up. */}
                  <div className="mc-drilldown-stats">
                    <div>
                      <div className="mc-summary-label">Median at retirement</div>
                      <div className="mc-drilldown-value">
                        {formatCurrency(selectedBinDetails.medianRetirementAssets, { compact: true })}
                      </div>
                      <div className="mc-drilldown-sub muted">Nest egg entering withdrawal</div>
                    </div>
                    <div>
                      <div className="mc-summary-label">Median peak (high water)</div>
                      <div className="mc-drilldown-value" style={{ color: colors.green }}>
                        {formatCurrency(selectedBinDetails.medianPeakAssets, { compact: true })}
                      </div>
                      <div className="mc-drilldown-sub muted">Highest the plan reached</div>
                    </div>
                    <div>
                      <div className="mc-summary-label">Median drawdown</div>
                      <div className="mc-drilldown-value" style={{ color: colors.red }}>
                        {formatCurrency(selectedBinDetails.medianDrawdown, { compact: true })}
                        {selectedBinDetails.medianDrawdownPct > 0 && (
                          <span className="muted" style={{ fontSize: 'var(--text-xs)', marginLeft: 4 }}>
                            ({(100 - selectedBinDetails.medianDrawdownPct).toFixed(0)}% left)
                          </span>
                        )}
                      </div>
                      <div className="mc-drilldown-sub muted">Peak → depleted</div>
                    </div>
                  </div>

                  {/* Per-run table — shows the run's full journey: started with
                      a nest egg at retirement, climbed to a peak, then collapsed
                      to ~0 at the depletion age. Each run is identified by
                      its global trial number. */}
                  <div className="mc-drilldown-table-wrap">
                    <table className="data-table mc-drilldown-table">
                      <thead>
                        <tr>
                          <th>Run #</th>
                          <th className="text-right">At retirement</th>
                          <th className="text-right">Peak (high water)</th>
                          <th className="text-right">Final (depleted)</th>
                          <th className="text-right">Drawdown</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedBinDetails.runs.map((r) => {
                          const drop = r.peakAssets - r.finalAssets;
                          const dropPct =
                            r.peakAssets > 0 ? (r.finalAssets / r.peakAssets) * 100 : 0;
                          return (
                            <tr key={r.trialIndex}>
                              <td>#{r.trialIndex}</td>
                              <td className="text-right">
                                {formatCurrency(r.retirementAssets, { compact: true })}
                              </td>
                              <td className="text-right" style={{ color: colors.green }}>
                                {formatCurrency(r.peakAssets, { compact: true })}
                              </td>
                              <td
                                className="text-right"
                                style={{ color: r.finalAssets < 100 ? colors.red : colors.text }}
                              >
                                {formatCurrency(r.finalAssets, { compact: true })}
                              </td>
                              <td className="text-right">
                                <span className="mc-drawdown-cell">
                                  <span className="mc-drawdown-amount" style={{ color: colors.red }}>
                                    −{formatCurrency(drop, { compact: true })}
                                  </span>
                                  <span className="mc-drawdown-pct muted">
                                    {dropPct > 0 ? `${dropPct.toFixed(0)}% of peak left` : '0%'}
                                  </span>
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Monte Carlo panel — runs the projection many times with randomized
 * returns and surfaces success-rate, percentile outcomes, and a
 * confidence-band chart on top of the deterministic trajectory.
 *
 * Reuses the existing `useThemeColors()` color hook from App.tsx so the
 * percentile chart respects the active theme without duplicate code.
 */
import { useMemo, useState, useRef, useEffect } from 'react';
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
import { DataTable } from './inputs/DataTable';
import { ChartDataDisclosure } from './inputs/ChartDataDisclosure';
import { useResponsiveChartHeight } from './hooks/useResponsiveChartHeight';

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
  const bandsChartHeight = useResponsiveChartHeight({ min: 260, max: 400, vhFraction: 0.36 });
  // Depletion histogram drill-down: when the user clicks a bar, we surface
  // the per-run final-asset values for that depletion age in a small table.
  const [selectedBin, setSelectedBin] = useState<number | null>(null);

  // Guards the auto-run so it fires exactly once per scenario, not on every
  // keystroke edit (which recreates the scenario object). See effects below.
  const autoRan = useRef(false);

  // When the user switches to a DIFFERENT scenario (not edits the current
  // one), the stale result no longer applies. Reset to idle so the auto-run
  // effect re-fires for the new scenario. Keyed on scenario.id so typing in
  // a field (which recreates the scenario object but keeps the same id)
  // does NOT trigger a re-run.
  const prevScenarioId = useRef(scenario.id);
  useEffect(() => {
    if (prevScenarioId.current !== scenario.id) {
      prevScenarioId.current = scenario.id;
      autoRan.current = false;
      setRun({ status: 'idle', result: null, error: null });
      setSelectedBin(null);
    }
  }, [scenario.id]);

  // Auto-run once on first mount (and after a scenario switch resets the
  // guard) so the user doesn't land on an idle/blank panel. Uses a FIXED
  // seed so the initial result is stable and reproducible — two users with
  // the same plan see the same success rate, and refreshing doesn't reshuffle
  // the outcome. A manual "Run Simulation" click stays unseeded so users can
  // still explore natural variance. The ref guard ensures this fires once
  // per scenario, not on every edit (which would re-run 1000 trials per
  // keystroke).
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    setRun({ status: 'running', result: null, error: null });
    requestAnimationFrame(() => {
      try {
        const result = runMonteCarloProjection(scenario, {
          numRuns,
          returnStdDev,
          seed: 42,
        });
        setRun({ status: 'done', result, error: null });
      } catch (e) {
        setRun({
          status: 'error',
          result: null,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario.id, numRuns, returnStdDev]);

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

  // Drill-down details for the currently-selected depletion-age bar.
  // Lists every trial that depleted at that exact age, plus summary stats.
  // Uses peak, retirement, and final assets so the table shows the
  // drawdown (peak → retirement → depleted at 0) rather than a column of
  // zeros.
  const selectedBinDetails = useMemo(() => {
    if (!run.result || selectedBin === null) return null;
    const {
      depletionAges,
      trialFinalAssets,
      trialPeakAssets,
      trialAssetsAtRetirement,
      depletionCount,
    } = run.result;
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
        trialIndex: trialIndex + 1,
        positionInBin: positionInBin + 1,
        depletionAge: selectedBin,
        retirementAssets: retirementAssets[positionInBin],
        peakAssets: peakAssets[positionInBin],
        finalAssets: trialFinalAssets[trialIndex],
      })),
    };
  }, [run.result, selectedBin]);

  // Success histogram — bucket successful runs by their ending balance
  // (today's $). Different lens from the depletion histogram (which bins
  // by age of failure). This shows "what does a typical successful run
  // look like" — i.e., how much money did the run end with?
  const successHistogram = useMemo(() => {
    const r = run.result;
    if (!r || r.successCount === 0) return [];
    // Use a fixed set of bins so the x-axis is stable across runs.
    // Bin edges in dollars; midpoint + label pre-computed for readability.
    const edges: [number, number, string][] = [
      [0, 100_000, '$0–100K'],
      [100_000, 250_000, '$100–250K'],
      [250_000, 500_000, '$250–500K'],
      [500_000, 1_000_000, '$500K–1M'],
      [1_000_000, 2_000_000, '$1–2M'],
      [2_000_000, Infinity, '$2M+'],
    ];
    const counts = edges.map(() => 0);
    for (let i = 0; i < r.depletionAges.length; i++) {
      if (r.depletionAges[i] !== null) continue; // skip depleted
      const v = r.trialFinalAssets[i];
      for (let j = 0; j < edges.length; j++) {
        const [lo, hi] = edges[j];
        if (v >= lo && v < hi) {
          counts[j]++;
          break;
        }
      }
    }
    return edges
      .map(([_lo, _hi, label], j) => ({ label, count: counts[j] }))
      .filter((b) => b.count > 0);
  }, [run.result]);

  // Drill-down details for the selected success-bin (final-balance band).
  // Lists every successful run that ended in the chosen band, with peak and
  // retirement values so the user sees the *growth* the run achieved from
  // retirement to its peak. (Unlike the depletion drill-down, all the
  // ending values here are positive — there's no "lost $X" story to tell.)
  const [selectedSuccessBin, setSelectedSuccessBin] = useState<string | null>(
    null,
  );
  const selectedSuccessBinDetails = useMemo(() => {
    const r = run.result;
    if (!r || selectedSuccessBin === null) return null;
    // Re-derive the bin edges (must match the histogram exactly so the
    // selected bin label lines up with a real bucket of trials).
    const edges: [number, number, string][] = [
      [0, 100_000, '$0–100K'],
      [100_000, 250_000, '$100–250K'],
      [250_000, 500_000, '$250–500K'],
      [500_000, 1_000_000, '$500K–1M'],
      [1_000_000, 2_000_000, '$1–2M'],
      [2_000_000, Infinity, '$2M+'],
    ];
    const edge = edges.find((e) => e[2] === selectedSuccessBin);
    if (!edge) return null;
    const [lo, hi] = edge;
    const matchingIndices: number[] = [];
    for (let i = 0; i < r.depletionAges.length; i++) {
      if (r.depletionAges[i] !== null) continue; // skip depleted
      const v = r.trialFinalAssets[i];
      if (v >= lo && v < hi) matchingIndices.push(i);
    }
    if (matchingIndices.length === 0) return null;
    const finalAssets = matchingIndices.map((i) => r.trialFinalAssets[i]);
    const peakAssets = matchingIndices.map((i) => r.trialPeakAssets[i]);
    const retirementAssets = matchingIndices.map(
      (i) => r.trialAssetsAtRetirement[i],
    );
    const sorted = [...finalAssets].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const sortedPeak = [...peakAssets].sort((a, b) => a - b);
    const medianPeak = sortedPeak[Math.floor(sortedPeak.length / 2)];
    const sortedRet = [...retirementAssets].sort((a, b) => a - b);
    const medianRetirement = sortedRet[Math.floor(sortedRet.length / 2)];
    return {
      label: selectedSuccessBin,
      count: matchingIndices.length,
      shareOfSuccesses:
        r.successCount > 0 ? matchingIndices.length / r.successCount : 0,
      medianFinalAssets: median,
      minFinalAssets: min,
      maxFinalAssets: max,
      medianPeakAssets: medianPeak,
      medianRetirementAssets: medianRetirement,
      runs: matchingIndices.map((trialIndex, positionInBin) => ({
        trialIndex: trialIndex + 1,
        positionInBin: positionInBin + 1,
        retirementAssets: retirementAssets[positionInBin],
        peakAssets: peakAssets[positionInBin],
        finalAssets: r.trialFinalAssets[trialIndex],
      })),
    };
  }, [run.result, selectedSuccessBin]);

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
              <div className="mc-summary-label">Simulation</div>
              <div className="mc-summary-value">{run.result.numRuns.toLocaleString()} trials</div>
              <div className="mc-summary-sub muted">
                σ = {(returnStdDev * 100).toFixed(0)}% volatility · computed in {run.result.elapsedMs.toFixed(0)} ms
              </div>
            </div>
          </div>

          {/* Confidence band chart */}
          <div className="chart-container">
            <h3>Confidence bands — net worth in today's dollars</h3>
            <ResponsiveContainer width="100%" height={bandsChartHeight} aria-label={`Monte Carlo confidence bands for net worth in today's dollars, ${bandData.length} yearly data points`}>
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
            <ChartDataDisclosure summaryLabel="View percentile bands as table" rowCount={bandData.length}>
              <DataTable
                rows={bandData as unknown as Record<string, unknown>[]}
                caption="Confidence bands: P10 / P25 / P50 / P75 / P90 net worth by age, in today's dollars"
                pageSize={60}
                columns={[
                  { key: 'age', label: 'Age' },
                  { key: 'p10', label: 'P10', format: (v) => formatCurrency(v as number) },
                  { key: 'p50', label: 'P50 (median)', format: (v) => formatCurrency(v as number) },
                  { key: 'p90', label: 'P90', format: (v) => formatCurrency(v as number) },
                ]}
              />
            </ChartDataDisclosure>
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
              <ResponsiveContainer width="100%" height={200} aria-label={`Depletion histogram: number of failed runs by age, ${depletionHistogram.length} bins`}>
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
              <ChartDataDisclosure summaryLabel="View depletion histogram as table" rowCount={depletionHistogram.length}>
                <DataTable
                  rows={depletionHistogram as unknown as Record<string, unknown>[]}
                  caption="Depletion histogram: number of Monte Carlo runs that ran out of money at each age"
                  columns={[
                    { key: 'age', label: 'Depletion Age' },
                    { key: 'count', label: '# of Runs', format: (v) => String(v) },
                  ]}
                />
              </ChartDataDisclosure>

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

                  {/* Per-run table — strict alignment: Run # (left, dim) and Age
                      (centered, dim) as identifiers; At retirement / Peak / Lost
                      right-aligned, tabular-nums for digit alignment. "Final"
                      is omitted because every row here depleted to ~$0 and the
                      Peak → Lost story already conveys it. Peak is tinted green
                      as the "good" reference; Lost is standard text with a tiny
                      muted "% of peak" annotation. Each run is identified by
                      its global trial number. */}
                  <div className="mc-drilldown-table-wrap">
                    <table className="data-table mc-drilldown-table">
                      <thead>
                        <tr>
                          <th>Run #</th>
                          <th>Age</th>
                          <th>At retirement</th>
                          <th>Peak</th>
                          <th>Lost (peak → depleted)</th>
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
                              <td>{r.depletionAge}</td>
                              <td>{formatCurrency(r.retirementAssets, { compact: true })}</td>
                              <td className="mc-drilldown-peak">
                                {formatCurrency(r.peakAssets, { compact: true })}
                              </td>
                              <td>
                                <span className="mc-drilldown-lost">
                                  <span>−{formatCurrency(drop, { compact: true })}</span>
                                  <span className="mc-drilldown-lost-pct">
                                    {dropPct > 0 ? `${dropPct.toFixed(0)}% of peak` : '0%'}
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

          {/* Success runs — how much money did successful runs end with?
              Mirror of the depletion block: histogram bins by final-balance
              band, click reveals per-run table. Successful runs don't deplete
              so the "story" is growth: nest egg → peak → final. We show all
              three so the user can see how much the run grew from retirement. */}
          {successHistogram.length > 0 && (
            <div className="chart-container">
              <h3>What does a typical successful run look like?</h3>
              <ResponsiveContainer width="100%" height={200} aria-label={`Final-assets distribution: how much money successful runs ended with, ${successHistogram.length} bins`}>
                <BarChart data={successHistogram}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
                  <XAxis
                    dataKey="label"
                    stroke={colors.textDim}
                    label={{ value: 'Final balance (today\'s $)', position: 'insideBottom', dy: 10, fill: colors.textDim, fontSize: 11 }}
                  />
                  <YAxis
                    stroke={colors.textDim}
                    allowDecimals={false}
                    label={{ value: '# runs', angle: -90, position: 'insideLeft', fill: colors.textDim, fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{ background: colors.panel, border: `1px solid ${colors.border}`, borderRadius: 8 }}
                    formatter={(v: number) => [`${v} run${v === 1 ? '' : 's'} — click for details`, 'Ended in this band']}
                  />
                  <Bar
                    dataKey="count"
                    fill={colors.green}
                    cursor="pointer"
                    onClick={(d: { label: string; count: number }) =>
                      setSelectedSuccessBin((prev) => (prev === d.label ? null : d.label))
                    }
                  />
                </BarChart>
              </ResponsiveContainer>
              <ChartDataDisclosure summaryLabel="View final-assets distribution as table" rowCount={successHistogram.length}>
                <DataTable
                  rows={successHistogram as unknown as Record<string, unknown>[]}
                  caption="Final-assets distribution: how much money successful runs ended with, in today's dollars"
                  columns={[
                    { key: 'label', label: 'Final Assets Band' },
                    { key: 'count', label: '# of Runs', format: (v) => String(v) },
                  ]}
                />
              </ChartDataDisclosure>

              {selectedSuccessBinDetails && (
                <div className="mc-drilldown">
                  <div className="mc-drilldown-header">
                    <div>
                      <div className="mc-drilldown-title">
                        Successful runs that ended with <strong>{selectedSuccessBinDetails.label}</strong>
                      </div>
                      <div className="mc-drilldown-sub muted">
                        {selectedSuccessBinDetails.count.toLocaleString()} run
                        {selectedSuccessBinDetails.count === 1 ? '' : 's'}
                        {' '}({(selectedSuccessBinDetails.shareOfSuccesses * 100).toFixed(1)}% of all successes)
                      </div>
                    </div>
                    <button
                      className="btn btn-sm"
                      onClick={() => setSelectedSuccessBin(null)}
                      title="Close drill-down"
                    >
                      ✕ Close
                    </button>
                  </div>

                  <div className="mc-drilldown-stats">
                    <div>
                      <div className="mc-summary-label">Median at retirement</div>
                      <div className="mc-drilldown-value">
                        {formatCurrency(selectedSuccessBinDetails.medianRetirementAssets, { compact: true })}
                      </div>
                      <div className="mc-drilldown-sub muted">Nest egg entering withdrawal</div>
                    </div>
                    <div>
                      <div className="mc-summary-label">Median peak (high water)</div>
                      <div className="mc-drilldown-value" style={{ color: colors.green }}>
                        {formatCurrency(selectedSuccessBinDetails.medianPeakAssets, { compact: true })}
                      </div>
                      <div className="mc-drilldown-sub muted">Highest the plan reached</div>
                    </div>
                    <div>
                      <div className="mc-summary-label">Median final</div>
                      <div className="mc-drilldown-value" style={{ color: colors.green }}>
                        {formatCurrency(selectedSuccessBinDetails.medianFinalAssets, { compact: true })}
                      </div>
                      <div className="mc-drilldown-sub muted">Plan finished with</div>
                    </div>
                  </div>

                  {/* Per-run table — same alignment system as the depletion one. */}
                  <div className="mc-drilldown-table-wrap">
                    <table className="data-table mc-drilldown-table">
                      <thead>
                        <tr>
                          <th>Run #</th>
                          <th>At retirement</th>
                          <th>Peak</th>
                          <th>Final</th>
                          <th>Growth (peak − retirement)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedSuccessBinDetails.runs.map((r) => {
                          const growth = r.peakAssets - r.retirementAssets;
                          return (
                            <tr key={r.trialIndex}>
                              <td>#{r.trialIndex}</td>
                              <td>{formatCurrency(r.retirementAssets, { compact: true })}</td>
                              <td className="mc-drilldown-peak">
                                {formatCurrency(r.peakAssets, { compact: true })}
                              </td>
                              <td>
                                {formatCurrency(r.finalAssets, { compact: true })}
                              </td>
                              <td className="mc-drilldown-lost">
                                <span style={{ color: colors.green }}>
                                  +{formatCurrency(growth, { compact: true })}
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

import { useEffect, useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Wand2, ChevronDown, RotateCcw, Check, ArrowUp, ArrowDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { runProjection, getReadinessSummary } from '../engine';
import { ASSUMPTION_BOUNDS, usePlanStore } from '../store';
import type { Assumptions, Scenario } from '../types';
import { formatCurrency, formatPercent, formatAge } from '../format';
import { useThemeColors } from '../hooks/useThemeColors';
import { useResponsiveChartHeight } from '../hooks/useResponsiveChartHeight';

/**
 * What-If panel — a live "what if I changed X?" sandbox on the Results tab.
 *
 * The user drags sliders (retire later, spend less, different returns, …) and
 * sees the projected net-worth curve and headline outcomes update instantly,
 * compared against the saved baseline. Nothing is written to the store until
 * the user clicks "Apply to plan" — until then this is a throwaway draft.
 *
 * Design notes
 * - The draft is a `structuredClone` of the active scenario held in a single
 *   state object, so every slider change produces a fresh scenario reference
 *   and the projection recomputes via `useMemo`.
 * - Only fields that actually move the trajectory are exposed as sliders
 *   (retirementAge, returns, inflation, and a *spending multiplier* applied to
 *   every post-retirement expense). Safe-withdrawal-rate is guidance-only and
 *   does not change the curve, so it is not a lever here.
 * - Reset restores the draft from the current saved scenario (so it also picks
 *   up any edits made elsewhere while the panel was open).
 */

/* ----------------------------- slider config ----------------------------- */

/** A multiplier applied to every post-retirement expense to model "spend more
 *  / less in retirement" without forcing the user to edit each expense. */
type WhatIfDraft = {
  retirementAge: number;
  preRetirementReturn: number;
  postRetirementReturn: number;
  inflationRate: number;
  spendingMultiplier: number; // 1.0 = unchanged
};

interface SliderConfig {
  key: keyof WhatIfDraft;
  label: string;
  /** What the slider step/value means, e.g. "years later" or "annual return". */
  unit: 'years' | 'percent' | 'multiplier';
  min: number;
  max: number;
  step: number;
  /** Help line under the slider. */
  help: string;
}

const SLIDERS: SliderConfig[] = [
  {
    key: 'retirementAge',
    label: 'Retire at age',
    unit: 'years',
    min: 45,
    max: 80,
    step: 1,
    help: 'Pushing retirement later gives savings more time to compound.',
  },
  {
    key: 'spendingMultiplier',
    label: 'Retirement spending',
    unit: 'multiplier',
    min: 0.5,
    max: 1.5,
    step: 0.05,
    help: 'Scales every retirement expense up or down as a group.',
  },
  {
    key: 'preRetirementReturn',
    label: 'Return while saving',
    unit: 'percent',
    min: 0,
    max: 0.12,
    step: 0.005,
    help: 'Annual return during your accumulation years.',
  },
  {
    key: 'postRetirementReturn',
    label: 'Return in retirement',
    unit: 'percent',
    min: 0,
    max: 0.1,
    step: 0.005,
    help: 'Annual return after you retire (often more conservative).',
  },
  {
    key: 'inflationRate',
    label: 'Inflation',
    unit: 'percent',
    min: 0,
    max: 0.08,
    step: 0.005,
    help: 'How fast living costs rise — erodes real purchasing power.',
  },
];

/* ------------------------------- helpers ------------------------------- */

function formatSliderValue(value: number, unit: SliderConfig['unit']): string {
  if (unit === 'years') return String(Math.round(value));
  if (unit === 'percent') return formatPercent(value, 1);
  // multiplier — show as a delta from baseline spending
  const pct = Math.round((value - 1) * 100);
  if (pct === 0) return 'baseline';
  return `${pct > 0 ? '+' : ''}${pct}%`;
}

/** Build a draft scenario from the saved one + the slider values. Applies the
 *  spending multiplier to every post-retirement expense and clamps assumption
 *  fields to their valid bounds so the projection can't be fed garbage. */
function buildDraftScenario(scenario: Scenario, draft: WhatIfDraft): Scenario {
  const clamp = (v: number, key: keyof typeof ASSUMPTION_BOUNDS) => {
    const [lo, hi] = ASSUMPTION_BOUNDS[key];
    return Math.min(hi, Math.max(lo, v));
  };
  const next: Scenario = structuredClone(scenario);
  next.assumptions = {
    ...next.assumptions,
    retirementAge: clamp(draft.retirementAge, 'retirementAge'),
    preRetirementReturn: clamp(draft.preRetirementReturn, 'preRetirementReturn'),
    postRetirementReturn: clamp(draft.postRetirementReturn, 'postRetirementReturn'),
    inflationRate: clamp(draft.inflationRate, 'inflationRate'),
  };
  // Salary (pre-retirement income) should end one year before the new
  // retirement age so the engine doesn't pay a salary past retirement.
  for (const src of next.incomeSources) {
    if (src.type === 'salary' && src.endAge !== null && src.endAge >= scenario.assumptions.retirementAge) {
      src.endAge = Math.max(src.startAge, next.assumptions.retirementAge - 1);
    }
  }
  // Scale post-retirement expenses by the multiplier. Pre-retirement expenses
  // are left alone — the lever is specifically about retirement lifestyle.
  if (draft.spendingMultiplier !== 1) {
    for (const e of next.expenses) {
      if (e.postRetirement) {
        e.annualAmount = Math.round(e.annualAmount * draft.spendingMultiplier);
      }
    }
  }
  return next;
}

function draftFromScenario(scenario: Scenario): WhatIfDraft {
  const a = scenario.assumptions;
  return {
    retirementAge: a.retirementAge,
    preRetirementReturn: a.preRetirementReturn,
    postRetirementReturn: a.postRetirementReturn,
    inflationRate: a.inflationRate,
    spendingMultiplier: 1,
  };
}

/* ------------------------------ the component ------------------------------ */

export function WhatIfPanel({ scenario, defaultOpen = false }: { scenario: Scenario; defaultOpen?: boolean }) {
  const tc = useThemeColors();
  const store = usePlanStore();
  const chartHeight = useResponsiveChartHeight({ min: 220, max: 320, vhFraction: 0.32 });
  const [open, setOpen] = useState(defaultOpen);

  const baseline = useMemo(() => draftFromScenario(scenario), [scenario]);
  const [draft, setDraft] = useState<WhatIfDraft>(baseline);

  // If the saved scenario changes (edited elsewhere) while the panel is at its
  // defaults, follow it. If the user has touched a slider, leave their draft
  // alone so we don't yank the slider out from under them.
  useEffect(() => {
    setDraft((prev) => {
      const untouched = (Object.keys(prev) as (keyof WhatIfDraft)[]).every(
        (k) => prev[k] === baseline[k],
      );
      return untouched ? baseline : prev;
    });
  }, [baseline]);

  const draftScenario = useMemo(() => buildDraftScenario(scenario, draft), [scenario, draft]);
  const draftResult = useMemo(() => runProjection(draftScenario), [draftScenario]);
  const draftReadiness = useMemo(
    () => getReadinessSummary(
      draftResult,
      draftScenario.assumptions.retirementAge,
      draftScenario.assumptions.safeWithdrawalRate,
    ),
    [draftResult, draftScenario],
  );

  const baselineResult = useMemo(() => runProjection(scenario), [scenario]);
  const baselineReadiness = useMemo(
    () => getReadinessSummary(
      baselineResult,
      scenario.assumptions.retirementAge,
      scenario.assumptions.safeWithdrawalRate,
    ),
    [baselineResult, scenario],
  );

  const isDirty = (Object.keys(draft) as (keyof WhatIfDraft)[]).some(
    (k) => draft[k] !== baseline[k],
  );

  // Chart data: total net worth (today's $) for baseline + what-if, aligned by age.
  const chartData = useMemo(() => {
    const map = new Map<number, { age: number; Baseline?: number; 'What If'?: number }>();
    for (const y of baselineResult.years) {
      map.set(y.age, { age: y.age, Baseline: Math.round(y.realAssets + y.realPropertyEquity) });
    }
    for (const y of draftResult.years) {
      const row = map.get(y.age) ?? { age: y.age };
      row['What If'] = Math.round(y.realAssets + y.realPropertyEquity);
      map.set(y.age, row);
    }
    return Array.from(map.values()).sort((a, b) => a.age - b.age);
  }, [baselineResult, draftResult]);

  const tooltipStyle = { background: tc.panel, border: `1px solid ${tc.border}`, borderRadius: 8 };

  // The fields we'd commit if the user clicks Apply. We only patch assumptions
  // fields; the spending multiplier is applied by editing expense amounts.
  const buildApplyPatch = (): { assumptions: Partial<Assumptions>; expenseScale: number } => ({
    assumptions: {
      retirementAge: draftScenario.assumptions.retirementAge,
      preRetirementReturn: draftScenario.assumptions.preRetirementReturn,
      postRetirementReturn: draftScenario.assumptions.postRetirementReturn,
      inflationRate: draftScenario.assumptions.inflationRate,
    },
    expenseScale: draft.spendingMultiplier,
  });

  const handleApply = () => {
    const { assumptions, expenseScale } = buildApplyPatch();
    store.updateAssumptions(scenario.id, assumptions);
    if (expenseScale !== 1) {
      for (const e of scenario.expenses) {
        if (e.postRetirement) {
          store.updateExpense(scenario.id, e.id, {
            annualAmount: Math.round(e.annualAmount * expenseScale),
          });
        }
      }
    }
    // After commit the scenario prop changes → the follow-baseline effect snaps
    // the sliders back to the (now-saved) values.
    setOpen(false);
  };

  const handleReset = () => setDraft(baseline);

  // Headline comparison cards: the four numbers that tell the story.
  type Delta = {
    label: string;
    baseline: number | null;
    whatIf: number | null;
    fmt: (v: number | null) => string;
    higherIsBetter: boolean;
    isOutcome?: boolean;
  };
  const deltas: Delta[] = [
    {
      label: 'Nest egg at retirement',
      baseline: baselineReadiness.nestEggAtRetirementReal,
      whatIf: draftReadiness.nestEggAtRetirementReal,
      fmt: (v) => formatCurrency(v as number, { compact: true }),
      higherIsBetter: true,
    },
    {
      label: 'Year-1 withdrawal rate',
      baseline: baselineReadiness.neededWithdrawalRate,
      whatIf: draftReadiness.neededWithdrawalRate,
      fmt: (v) => formatPercent(v as number),
      higherIsBetter: false,
    },
    {
      label: "Final assets (today's $)",
      baseline: baselineResult.finalAssetsReal,
      whatIf: draftResult.finalAssetsReal,
      fmt: (v) => formatCurrency(v as number, { compact: true }),
      higherIsBetter: true,
    },
    {
      label: 'Plan outcome',
      baseline: baselineResult.depletionAge,
      whatIf: draftResult.depletionAge,
      fmt: (v) => (v === null ? 'Sustainable' : `Runs out at ${formatAge(v)}`),
      // A non-null (depleted) what-if is worse; handled specially below.
      higherIsBetter: true,
      isOutcome: true,
    },
  ];

  return (
    <div className="panel whatif-panel">
      <button
        type="button"
        className="whatif-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="whatif-body"
      >
        <span className="whatif-trigger-title">
          <Wand2 size={18} aria-hidden="true" />
          What if…?
          {isDirty && <span className="whatif-dirty-dot" aria-label="unsaved changes" />}
        </span>
        <span className="whatif-trigger-sub">
          {open
            ? 'Hide'
            : 'Drag sliders to explore retirement age, spending, returns & inflation'}
        </span>
        <ChevronDown size={18} aria-hidden="true" className={`whatif-chevron${open ? ' open' : ''}`} />
      </button>

      {open && (
        <div id="whatif-body" className="whatif-body">
          <p className="section-help whatif-help">
            These sliders build a <strong>throwaway copy</strong> of your plan and re-run the
            projection live. Drag to compare against your saved plan, then <strong>Apply</strong> to
            keep the changes — or just close to discard.
          </p>

          <div className="whatif-grid">
            {/* Sliders column */}
            <div className="whatif-sliders">
              {SLIDERS.map((s) => {
                const value = draft[s.key];
                const changed = value !== baseline[s.key];
                return (
                  <div key={s.key} className="whatif-slider-row">
                    <div className="whatif-slider-head">
                      <label htmlFor={`wf-${s.key}`} className="whatif-slider-label">
                        {s.label}
                      </label>
                      <span className={`whatif-slider-value${changed ? ' changed' : ''}`}>
                        {formatSliderValue(value, s.unit)}
                        {changed && s.unit === 'years' && (
                          <span className="whatif-slider-delta">
                            {' '}
                            ({value > baseline[s.key] ? '+' : ''}
                            {value - (baseline[s.key] as number)} yrs)
                          </span>
                        )}
                      </span>
                    </div>
                    <input
                      id={`wf-${s.key}`}
                      type="range"
                      className="whatif-range"
                      min={s.min}
                      max={s.max}
                      step={s.step}
                      value={value}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, [s.key]: Number(e.target.value) }))
                      }
                    />
                    <div className="whatif-slider-help muted">{s.help}</div>
                  </div>
                );
              })}

              <div className="whatif-actions">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={handleReset}
                  disabled={!isDirty}
                  title="Reset sliders to the saved plan's values"
                >
                  <RotateCcw size={14} aria-hidden="true" /> Reset
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={handleApply}
                  disabled={!isDirty}
                  title="Write these values into your saved plan"
                >
                  <Check size={14} aria-hidden="true" /> Apply to plan
                </button>
              </div>
            </div>

            {/* Comparison column */}
            <div className="whatif-compare">
              <div className="whatif-deltas">
                {deltas.map((d) => {
                  const better = d.isOutcome
                    ? (draftResult.depletionAge === null) === (baselineResult.depletionAge === null)
                      ? null
                      : draftResult.depletionAge === null
                    : d.higherIsBetter
                      ? (d.whatIf ?? 0) > (d.baseline ?? 0)
                      : (d.whatIf ?? 0) < (d.baseline ?? 0);
                  return (
                    <div key={d.label} className="whatif-delta-card">
                      <div className="whatif-delta-label">{d.label}</div>
                      <div className="whatif-delta-vals">
                        <span className="whatif-delta-baseline">
                          {d.fmt(d.baseline)}
                        </span>
                        <span className="whatif-delta-arrow" aria-hidden="true">→</span>
                        <span className={`whatif-delta-new${better === null ? '' : better ? ' good' : ' bad'}`}>
                          {d.fmt(d.whatIf)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="chart-container whatif-chart">
                <div className="chart-header-row">
                  <h3>Net worth: baseline vs. what-if (today's $)</h3>
                </div>
                <ResponsiveContainer width="100%" height={chartHeight}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="wfBaseline" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={tc.textDim} stopOpacity={0.15} />
                        <stop offset="100%" stopColor={tc.textDim} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="wfWhatIf" x1="0" y1="0" x2="0" y2="1">
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
                      dataKey="Baseline"
                      stroke={tc.textDim}
                      strokeWidth={1.5}
                      strokeDasharray="5 4"
                      fill="url(#wfBaseline)"
                    />
                    <Area
                      type="monotone"
                      dataKey="What If"
                      stroke={tc.chart}
                      strokeWidth={2}
                      fill="url(#wfWhatIf)"
                    />
                    <ReferenceLine
                      x={draftScenario.assumptions.retirementAge}
                      stroke={tc.yellow}
                      strokeDasharray="5 5"
                      label={{ value: 'Retire', fill: tc.yellow, fontSize: 11 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {!isDirty && (
            <p className="whatif-clean muted">
              <ArrowUp size={12} aria-hidden="true" /> Sliders match your saved plan — drag one to
              see the effect. <ArrowDown size={12} aria-hidden="true" />
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Silence unused-import warnings for icons reserved for future affordances.
export type { LucideIcon };

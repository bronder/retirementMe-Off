# Monte Carlo simulation — how it's calculated

This document walks through the entire Monte Carlo pipeline in this app, from
the random number generator up to the per-bin summary tables the UI shows.

## 1. The goal

Answer the question: **"Given my plan and a realistic model of market
volatility, what's the probability my retirement plan survives to the end of
the plan, and what's the distribution of outcomes?"**

We do this by running the deterministic projection engine **N times** (default
1,000), each time with a different random sequence of annual investment
returns drawn from a log-normal distribution. We then aggregate the per-run
outcomes into summary statistics (success rate, percentile bands, depletion
histogram, etc.) that the UI renders.

## 2. End-to-end pipeline

```
1. PRNG (mulberry32) seeded from options.seed
2. Normal sampler (Box-Muller transform) consumes PRNG output
3. Log-normal return sampler produces a per-account, per-year return draw
4. Each trial runs runProjectionCore with the same sampler instance, so
   the random stream is consumed sequentially (one draw per account per
   year, in trial order)
5. After all N trials, we aggregate: percentilePaths, trialPeakAssets,
   trialAssetsAtRetirement, trialFinalAssets, depletionAges, etc.
6. UI groups the per-trial values into bins and renders the drill-down tables
```

## 3. The math, step by step

### 3.1 Random number generator — `createRng(seed)`

`mulberry32`, a fast 32-bit seedable PRNG. Each call returns a uniform
`[0, 1)` number. The state is fully determined by `seed`, so the same seed
produces the exact same sequence.

```ts
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

### 3.2 Normal sampler — `NormalSampler` (Box-Muller)

To get a standard normal sample `z ~ N(0, 1)` from two uniform draws
`u1, u2 ~ U(0,1)`:

```
z0 = sqrt(-2 * ln(u1)) * cos(2π * u2)
z1 = sqrt(-2 * ln(u1)) * sin(2π * u2)
```

We compute the pair on each call but cache `z1` for the next call (saves
half the random draws).

### 3.3 Log-normal return sampler — `createLogNormalReturnSampler(rng, sigma)`

For each (account, year), we draw a log-normal return whose **expected
value equals the account's configured `annualReturn`**.

The calibration: with `r = e^x − 1` and `x ~ N(m, σ²)`,

```
E[r] = exp(m + σ²/2) − 1
```

So to hit a target mean `μ`, set `m = log(1 + μ) − σ²/2`.

```ts
const m = Math.log(1 + mu) - (sigma * sigma) / 2;
const x = m + sigma * normal.next();
const r = Math.exp(x) - 1;
```

The cap at `r ≥ -0.999999` is a defensive safety net (log-normal draws
are extremely unlikely to ever produce a return below -100%, but a
floating-point artifact in extreme tails could).

### 3.4 Trial loop — `runProjectionCore` with the log-normal sampler

For each trial, the engine loops through `(currentAge … planEndAge)`. At
each year, for each account, the sampler is called once to produce that
account's return for that year. The stream is consumed sequentially, so
trial N+1 picks up where trial N left off (deterministic per seed).

The deterministic version (`runProjection`) skips the sampler — it always
returns the account's configured `annualReturn`. This means the same
single-run projection is just the Monte Carlo median for σ=0.

### 3.5 Trial aggregation

After all N trials, we have for each trial:

- `trialFinalAssets[i]` — final balance in today's $ (realAssets at endAge)
- `trialPeakAssets[i]` — max(realAssets) over all years for this trial
- `trialAssetsAtRetirement[i]` — realAssets at year=retirementAge
  (the start-of-withdrawal value; using `beginningAssets` of the retirement
  year so it works even if the trial depleted mid-year)
- `depletionAges[i]` — age at which the trial hit $0, or `null` if it survived

From these we compute:

- **successRate** = count(depletionAges === null) / numRuns
- **percentilePaths** — for each age, the P10/P50/P90 of realAssets across runs
  → renders as the confidence band chart
- **medianFinalAssets** etc. — P50 of the array, interpolated

### 3.6 The UI bins

Both histogram drill-downs share the same shape:

- **Depletion histogram** — bins `depletionAges` into single-year buckets
  (age 78, 79, 80, …) and shows the count of runs that hit zero at each age.
  Bars are red. Click a bar to drill in.
- **Success histogram** — bins `trialFinalAssets` for non-depleted runs into
  $0–100K, $100–250K, $250–500K, $500K–1M, $1–2M, $2M+. Bars are green.
  Click to drill in.

When the user clicks a bar:

- `selectedBinDetails` filters the per-trial arrays for that bucket.
- Median / min / max for each of `finalAssets`, `peakAssets`, `retirementAssets`
  are computed.
- Per-run rows are shown: peak → retirement → final, with the relevant delta
  (drawdown vs growth) annotated.

## 4. Why log-normal and not just normal?

Annual returns cluster near the long-term mean but **cannot go below
-100%** (you can't lose more than you started with). A symmetric normal
distribution would allow that. A log-normal of `r+1` is bounded below at 0,
which matches reality. The mean calibration `m = log(1+μ) − σ²/2` keeps the
expected return equal to the user's configured number.

It's the standard choice in the retirement-planning literature (Vanguard,
Morningstar, etc.) and is what tools like cFIREsim and FIRECalc use.

## 5. Calibration: which σ?

The UI default is 0.15 (15% annual std-dev). This roughly matches the
historical real return of a 60/40 portfolio over long horizons. The user
can pick a different value from the dropdown:

| σ      | Interpretation                              |
| ------ | ------------------------------------------- |
| 0.08   | Very conservative (mostly bonds / TIPS)      |
| 0.12   | Conservative (heavy bond allocation)        |
| **0.15** | **Balanced (default)**                     |
| 0.18   | Aggressive (more equity)                    |
| 0.22   | All-equity / single-stock volatile          |

Changing σ scales the spread of the outcome distribution but the *median*
is invariant (since we calibrated `m` so the expected return stays the same).

## 6. Reproducibility

`runMonteCarloProjection` accepts an optional `seed`. With the same seed,
the same scenario, the same σ, and the same number of runs, the output is
bit-for-bit identical — including the per-trial peak, retirement, and final
values. This is what makes the drill-down tables reproducible across runs.

## 7. Where the work is in the codebase

| Stage | File / function |
|-------|-----------------|
| PRNG | `engine.ts::createRng` |
| Normal sample | `engine.ts::NormalSampler.next` |
| Log-normal return | `engine.ts::createLogNormalReturnSampler` |
| Single trial | `engine.ts::runProjectionCore` (with sampler arg) |
| Aggregate | `engine.ts::runMonteCarloProjection` |
| UI bins | `MonteCarloPanel.tsx::successHistogram`, `depletionHistogram` |
| Drill-down | `MonteCarloPanel.tsx::selectedBinDetails`, `selectedSuccessBinDetails` |
| UI styling | `styles.css` `.mc-drilldown-*` classes |

## 8. Performance

- 1,000 trials × ~50 years × 4 accounts = ~200,000 log-normal draws per run
  → ~50ms on a modern laptop.
- The whole pipeline (draw + aggregate + UI) is under 100ms for default settings.

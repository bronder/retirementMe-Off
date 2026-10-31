/**
 * Web Worker wrapper around runMonteCarloProjection.
 *
 * The simulation runs 1,000–10,000 full projections synchronously; on the
 * main thread that freezes every input and animation for the duration
 * (noticeable at 10k runs). This worker keeps the UI responsive.
 *
 * Protocol: every request carries an incrementing `id`; the response echoes
 * it. The client drops responses whose id isn't the latest, which turns
 * "switch scenario while a run is in flight" into a clean no-op instead of a
 * stale result landing on the new scenario.
 */
import { runMonteCarloProjection } from './engine';
import type { MonteCarloOptions, MonteCarloResult, Scenario } from './types';

export interface MonteCarloRequest {
  id: number;
  scenario: Scenario;
  options: MonteCarloOptions;
}

export type MonteCarloResponse =
  | { id: number; ok: true; result: MonteCarloResult }
  | { id: number; ok: false; error: string };

// Cast instead of a `webworker` lib reference: the app compiles against the
// DOM lib, and a per-file lib triple-slash would clash with it.
const ctx = self as unknown as {
  onmessage: ((ev: MessageEvent<MonteCarloRequest>) => void) | null;
  postMessage(message: MonteCarloResponse): void;
};

ctx.onmessage = (event: MessageEvent<MonteCarloRequest>) => {
  const { id, scenario, options } = event.data;
  try {
    const result = runMonteCarloProjection(scenario, options);
    ctx.postMessage({ id, ok: true, result });
  } catch (e) {
    ctx.postMessage({
      id,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
};

import { runProjection } from './engine';
import type { Scenario } from './types';

export type ProjectionResult = NonNullable<ReturnType<typeof runProjection>>;

/**
 * Per-scenario projection cache. Zustand updates are immutable (spread/map/
 * filter), so an unedited scenario keeps its object identity across store
 * writes — which makes the object itself a perfect cache key. Switching tabs
 * or editing a different scenario reuses the cached result instead of
 * re-running the projection; editing a scenario replaces its identity and
 * re-projects exactly that one. A WeakMap lets old scenarios be GC'd with
 * their results when deleted.
 */
const projectionCache = new WeakMap<Scenario, ProjectionResult>();

export function projectScenario(scenario: Scenario): ProjectionResult {
  let result = projectionCache.get(scenario);
  if (!result) {
    result = runProjection(scenario);
    projectionCache.set(scenario, result);
  }
  return result;
}

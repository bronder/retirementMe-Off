import { useEffect, useState } from 'react';

/** Resize-driven chart height. Returns a number that's computed from the
 *  viewport height on mount (so the initial paint already has the right
 *  size — no flash), and recomputes on every window resize. The result
 *  is clamped to [min, max] so charts never collapse to postage-stamp size
 *  on a phone or spill off a 4K display.
 *
 *  Why this exists: Recharts parses its `height` prop with parseFloat and
 *  collapses to 0 when given a CSS function like `clamp(...)`. Giving it a
 *  real number that *originates* from a CSS-like clamp is the only way to
 *  get viewport-responsive chart heights that actually render.
 *
 *  Usage:
 *    const h = useResponsiveChartHeight({ min: 220, max: 360, vhFraction: 0.32 });
 *    <ResponsiveContainer height={h}>...</ResponsiveContainer>;
 */
export function useResponsiveChartHeight(opts: {
  /** Lower bound in px. */
  min: number;
  /** Upper bound in px. */
  max: number;
  /** What fraction of the viewport height to use as the target. Defaults to 0.35. */
  vhFraction?: number;
}): number {
  const { min, max, vhFraction = 0.35 } = opts;
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const compute = () => clamp(Math.round(window.innerHeight * vhFraction));
  const [height, setHeight] = useState(() =>
    typeof window !== 'undefined' ? compute() : min,
  );

  useEffect(() => {
    const onResize = () => setHeight(compute());
    window.addEventListener('resize', onResize);
    // Recompute once after mount in case `innerHeight` changed between the
    // initial-state read and the effect running (e.g., a viewport rotation
    // landed mid-render).
    onResize();
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [min, max, vhFraction]);

  return height;
}

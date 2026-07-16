import { useEffect, useState } from 'react';

/**
 * Theme-aware chart color set, read once from CSS custom properties.
 * Returned shape is exported via `ThemeColors` so other panels (e.g.
 * MonteCarloPanel) can type their props against it.
 */
export interface ThemeColors {
  panel: string;
  border: string;
  textDim: string;
  text: string;
  chart: string;
  chart2: string;
  chart3: string;
  chart4: string;
  /** 5th scenario palette color — reuses --red so depleting-savings
   *  trajectories read as "at risk" without an explicit legend. */
  chart5: string;
  /** 6th scenario palette color — reuses --yellow so marginal outcomes
   *  read as a warning accent. */
  chart6: string;
  green: string;
  red: string;
  yellow: string;
}

/** Light-theme fallbacks; the live values come from CSS variables. */
const DEFAULT_THEME_COLORS: ThemeColors = {
  panel: '#ffffff',
  border: '#e6e2da',
  textDim: '#6e6a60',
  text: '#1c1b19',
  chart: '#0d9488',
  chart2: '#0e7490',
  chart3: '#7c3aed',
  chart4: '#ca8a04',
  chart5: '#dc2626',
  chart6: '#b45309',
  green: '#15803d',
  red: '#dc2626',
  yellow: '#b45309',
};

/** Read CSS variable values for theme-aware chart styling, and re-read
 *  whenever the `data-theme` attribute on <html> changes (user picked a
 *  new theme). Returns a flat object of named colors consumers destructure. */
export function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState<ThemeColors>(DEFAULT_THEME_COLORS);

  useEffect(() => {
    const readColors = () => {
      const style = getComputedStyle(document.documentElement);
      setColors({
        panel: style.getPropertyValue('--panel').trim() || '#ffffff',
        border: style.getPropertyValue('--border').trim() || '#e6e2da',
        textDim: style.getPropertyValue('--text-dim').trim() || '#6e6a60',
        text: style.getPropertyValue('--text').trim() || '#1c1b19',
        chart: style.getPropertyValue('--chart').trim() || '#0d9488',
        chart2: style.getPropertyValue('--chart-2').trim() || '#0e7490',
        chart3: style.getPropertyValue('--chart-3').trim() || '#7c3aed',
        chart4: style.getPropertyValue('--chart-4').trim() || '#ca8a04',
        chart5: style.getPropertyValue('--red').trim() || '#dc2626',
        chart6: style.getPropertyValue('--yellow').trim() || '#b45309',
        green: style.getPropertyValue('--green').trim() || '#15803d',
        red: style.getPropertyValue('--red').trim() || '#dc2626',
        yellow: style.getPropertyValue('--yellow').trim() || '#b45309',
      });
    };
    readColors();
    // Re-read when theme attribute changes
    const observer = new MutationObserver(readColors);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return colors;
}

import type { ReactNode } from 'react';
import { Table2 } from 'lucide-react';

/** Wraps a chart's mirror table in a <details> so the table is collapsed
 *  by default and doesn't compete with the chart visually. Helper for
 *  consistent presentation across all 7 charts. */
export function ChartDataDisclosure({
  summaryLabel,
  rowCount,
  children,
}: {
  summaryLabel: string;
  rowCount: number;
  children: ReactNode;
}) {
  return (
    <details className="chart-data-disclosure">
      <summary>
        <span className="chart-data-disclosure-icon" aria-hidden="true"><Table2 size={15} /></span> {summaryLabel}
        {rowCount > 0 && <span className="muted"> ({rowCount} rows)</span>}
      </summary>
      <div className="chart-data-disclosure-body">
        {children}
      </div>
    </details>
  );
}

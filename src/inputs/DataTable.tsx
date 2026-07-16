import { useState } from 'react';

/** Accessible table that mirrors a Recharts chart's underlying data — the
 *  screen-reader / low-vision / "let me copy the numbers" path. Used in
 *  tandem with the chart above it via a <details> wrapper (see
 *  ChartDataDisclosure) so the data is always just one click away without
 *  dominating the page. */
export type DataTableColumn<Row> = {
  /** Object key to read from each row. */
  key: keyof Row & string;
  /** Column header text. */
  label: string;
  /** Optional formatter for the cell value. Defaults to String(value). */
  format?: (v: Row[keyof Row & string]) => string;
  /** Whether the user can click this column header to sort. Default true. */
  sortable?: boolean;
  /** Right-align numeric columns (Default true when format is provided). */
  align?: 'left' | 'right';
};

export function DataTable<Row extends Record<string, unknown>>({
  rows,
  columns,
  pageSize,
  caption,
  emptyMessage = 'No data.',
}: {
  rows: Row[];
  columns: DataTableColumn<Row>[];
  /** Rows per page. If undefined, no pagination. The "Show all" toggle
   *  appears in the footer when pageSize is set. */
  pageSize?: number;
  caption?: string;
  emptyMessage?: string;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showAll, setShowAll] = useState(false);

  // Sort a copy of the rows by the current sort key (numeric compare when
  // both sides are numbers, otherwise lexical). Stable on ties.
  const sorted = (() => {
    if (!sortKey) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp: number;
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else cmp = String(av ?? '').localeCompare(String(bv ?? ''));
      if (cmp === 0) return 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  })();

  // Pagination: if a pageSize is set and showAll is false, slice to the
  // current page. Otherwise show everything.
  const visible = (() => {
    if (pageSize === undefined || showAll) return sorted;
    return sorted.slice(0, pageSize);
  })();

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  if (rows.length === 0) {
    return <p className="muted">{emptyMessage}</p>;
  }

  return (
    <div className="data-table-disclosure">
      <table className="data-table data-table-chart-mirror">
        {caption && <caption className="visually-hidden">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((col) => {
              const sortable = col.sortable !== false;
              const align = col.align ?? (col.format ? 'right' : 'left');
              const isSorted = sortKey === col.key;
              const ariaSort = !sortable ? undefined : isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
              return (
                <th key={col.key} scope="col" className={align === 'right' ? 'text-right' : undefined} aria-sort={ariaSort}>
                  {sortable ? (
                    <button
                      type="button"
                      className="data-table-sort-btn"
                      onClick={() => handleSort(col.key)}
                      aria-label={`Sort by ${col.label}, currently ${isSorted ? sortDir + 'ending' : 'unsorted'}`}
                    >
                      {col.label}
                      <span className="data-table-sort-indicator" aria-hidden="true">
                        {isSorted ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ↕'}
                      </span>
                    </button>
                  ) : col.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {visible.map((row, i) => (
            <tr key={i}>
              {columns.map((col) => {
                const raw = row[col.key];
                const text = col.format ? col.format(raw) : String(raw ?? '');
                const align = col.align ?? (col.format ? 'right' : 'left');
                return (
                  <td key={col.key} className={align === 'right' ? 'text-right' : undefined}>
                    {text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {pageSize !== undefined && sorted.length > pageSize && (
        <div className="data-table-pagination">
          <span className="muted">
            Showing {visible.length} of {sorted.length} rows
          </span>
          <button type="button" className="btn btn-sm" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Show less' : 'Show all ' + sorted.length}
          </button>
        </div>
      )}
    </div>
  );
}

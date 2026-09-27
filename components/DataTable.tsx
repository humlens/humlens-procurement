import { useRef } from 'react';
import { useRouter } from 'next/router';
import { type ColumnDef, type RowData, useTable } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ArrowUpDown, Inbox, Search, type LucideIcon } from 'lucide-react';

import { tableFeatureSet } from '@/lib/tableFeatures';
import EmptyState from '@/components/EmptyState';

export type AppColumnDef<T extends RowData> = ColumnDef<typeof tableFeatureSet, T, any>;

// A single reusable table for every list page in the app: TanStack Table v9
// drives columns/sorting/global-filter, TanStack Virtual renders only the
// rows in view so the same component stays fast whether there are 10 rows
// or 10,000. Rows use flex layout (not table auto-layout) because
// absolutely positioned virtualized rows need explicit per-column widths —
// see each column's `size`.
export default function DataTable<T extends RowData>({
  columns,
  data,
  getRowHref,
  emptyMessage = 'Nothing here yet.',
  emptyDescription,
  emptyIcon: EmptyIcon = Inbox,
  searchPlaceholder = 'Filter…',
  isLoading,
}: {
  columns: AppColumnDef<T>[];
  data: T[];
  getRowHref?: (row: T) => string;
  emptyMessage?: string;
  emptyDescription?: string;
  emptyIcon?: LucideIcon;
  searchPlaceholder?: string;
  isLoading?: boolean;
}) {
  const router = useRouter();
  const parentRef = useRef<HTMLDivElement>(null);

  const table = useTable(
    {
      features: tableFeatureSet,
      columns,
      data,
      globalFilterFn: 'includesString',
      defaultColumn: { size: 180, minSize: 80 },
    },
    (state) => ({ sorting: state.sorting, globalFilter: state.globalFilter })
  );

  const rows = table.getRowModel().rows;

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 45,
    getItemKey: (index) => rows[index]!.id,
    overscan: 12,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  return (
    <div className="card overflow-hidden p-0">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5">
        <Search size={14} className="text-gray-400" />
        <input
          value={table.state.globalFilter ?? ''}
          onChange={(e) => table.setGlobalFilter(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full bg-transparent text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none"
        />
        {table.state.globalFilter && (
          <span className="shrink-0 text-xs text-gray-400">
            {rows.length} of {data.length}
          </span>
        )}
      </div>

      <div ref={parentRef} className="max-h-[60vh] overflow-auto">
        <table style={{ display: 'grid', minWidth: table.getTotalSize() }}>
          <thead className="sticky top-0 z-10" style={{ display: 'grid' }}>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} style={{ display: 'flex', width: '100%' }}>
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      style={{ display: 'flex', width: header.column.getSize() }}
                      className="items-center gap-1 border-b border-gray-200 bg-gray-50/90 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 backdrop-blur"
                    >
                      {header.isPlaceholder ? null : (
                        <button
                          type="button"
                          className={`flex items-center gap-1 ${
                            header.column.getCanSort() ? 'cursor-pointer select-none hover:text-gray-700' : ''
                          }`}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <table.FlexRender header={header} />
                          {header.column.getCanSort() &&
                            (sorted === 'asc' ? (
                              <ArrowUp size={12} />
                            ) : sorted === 'desc' ? (
                              <ArrowDown size={12} />
                            ) : (
                              <ArrowUpDown size={11} className="text-gray-300" />
                            ))}
                        </button>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody style={{ display: 'grid', position: 'relative', height: totalSize }}>
            {virtualItems.map((virtualRow) => {
              const row = rows[virtualRow.index]!;
              const href = getRowHref?.(row.original);
              return (
                <tr
                  key={row.id}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    display: 'flex',
                    width: '100%',
                    position: 'absolute',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className={`items-stretch border-b border-gray-100 transition-colors duration-100 hover:bg-gray-50/80 ${
                    href ? 'cursor-pointer' : ''
                  }`}
                  onClick={href ? () => router.push(href) : undefined}
                >
                  {row.getAllCells().map((cell) => (
                    <td
                      key={cell.id}
                      style={{ display: 'flex', width: cell.column.getSize() }}
                      className="items-center truncate px-4 py-2.5 text-sm text-gray-700"
                    >
                      <table.FlexRender cell={cell} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>

        {!isLoading && rows.length === 0 && (
          <EmptyState icon={EmptyIcon} title={emptyMessage} description={emptyDescription} />
        )}
      </div>
    </div>
  );
}

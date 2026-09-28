import type { ReactTable, RowData } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

import type { tableFeatureSet } from '@/lib/tableFeatures';

export const PAGE_SIZES = [25, 50, 100, 250, 1000];

const pageButton =
  'inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:pointer-events-none disabled:opacity-40';

export default function Pagination<TData extends RowData>({ table }: { table: ReactTable<typeof tableFeatureSet, TData> }) {
  const { pageIndex, pageSize } = table.state.pagination;
  const total = table.getPrePaginatedRowModel().rows.length;
  const pageCount = Math.max(table.getPageCount(), 1);
  const first = total === 0 ? 0 : pageIndex * pageSize + 1;
  const last = Math.min((pageIndex + 1) * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-gray-100 px-4 py-2 text-xs text-gray-500">
      <span className="tabular-nums">
        {first}–{last} of {total} rows
        {table.state.grouping.length > 0 && ` · ${table.getGroupedRowModel().rows.length} groups`}
      </span>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5">
          Rows per page
          <select
            className="h-7 rounded-md border border-gray-200 bg-white px-1.5 text-xs text-gray-700 focus:border-brand-500 focus:outline-none"
            value={pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-0.5">
          <button type="button" className={pageButton} aria-label="First page" onClick={() => table.firstPage()} disabled={!table.getCanPreviousPage()}>
            <ChevronsLeft size={14} />
          </button>
          <button type="button" className={pageButton} aria-label="Previous page" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            <ChevronLeft size={14} />
          </button>
          <span className="flex items-center gap-1 px-1.5">
            Page
            <input
              type="number"
              min={1}
              max={pageCount}
              aria-label="Page number"
              className="h-7 w-12 rounded-md border border-gray-200 px-1.5 text-center text-xs tabular-nums text-gray-700 focus:border-brand-500 focus:outline-none"
              value={pageIndex + 1}
              onChange={(e) => {
                const page = Number(e.target.value);
                if (page >= 1 && page <= pageCount) table.setPageIndex(page - 1);
              }}
            />
            of <span className="tabular-nums">{pageCount}</span>
          </span>
          <button type="button" className={pageButton} aria-label="Next page" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            <ChevronRight size={14} />
          </button>
          <button type="button" className={pageButton} aria-label="Last page" onClick={() => table.lastPage()} disabled={!table.getCanNextPage()}>
            <ChevronsRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

import { useRef, useState } from 'react';
import type { ReactTable, RowData } from '@tanstack/react-table';
import { Bookmark, Columns3, Download, Filter, Layers, Rows3, Rows4, RotateCcw, Search, X } from 'lucide-react';

import Popover from './Popover';
import Checkbox from './Checkbox';
import { columnLabel, isInternalColumn, type AnyColumn } from './utils';
import type { tableFeatureSet } from '@/lib/tableFeatures';

type AppTable<TData extends RowData> = ReactTable<typeof tableFeatureSet, TData>;

export type FilterChip = { id: string; label: string; onRemove: () => void };

const iconButton =
  'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900';

export default function Toolbar<TData extends RowData>({
  table,
  searchPlaceholder,
  filterChips,
  savedFilterName,
  onOpenFilters,
  onClearFilters,
  density,
  onToggleDensity,
  onExport,
  onResetView,
}: {
  table: AppTable<TData>;
  searchPlaceholder: string;
  /** One chip per active filter condition. */
  filterChips: FilterChip[];
  /** Name of the saved filter currently applied, if any. */
  savedFilterName?: string | null;
  onOpenFilters: () => void;
  onClearFilters: () => void;
  density: 'comfortable' | 'compact';
  onToggleDensity: () => void;
  onExport: () => void;
  onResetView: () => void;
}) {
  const state = table.state;
  const activeFilters = filterChips.length;
  const selectedCount = Object.keys(state.rowSelection).length;
  const grouping = state.grouping;
  const columnById = (id: string) => table.getColumn(id) as AnyColumn | undefined;

  return (
    <div className="border-b border-gray-100">
      <div className="flex flex-wrap items-center gap-1 px-3 py-2">
        <div className="flex min-w-[12rem] flex-1 items-center gap-2 px-1">
          <Search size={14} className="shrink-0 text-gray-400" />
          <input
            value={state.globalFilter ?? ''}
            onChange={(e) => table.setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label="Search table"
            className="w-full bg-transparent text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none"
          />
          {state.globalFilter && (
            <button type="button" aria-label="Clear search" className="text-gray-400 hover:text-gray-600" onClick={() => table.setGlobalFilter('')}>
              <X size={13} />
            </button>
          )}
        </div>

        <button type="button" className={`${iconButton} ${activeFilters ? 'text-brand-700' : ''}`} onClick={onOpenFilters}>
          <Filter size={13} />
          Filters
          {activeFilters > 0 && <span className="rounded-full bg-brand-100 px-1.5 text-[10px] text-brand-700">{activeFilters}</span>}
        </button>
        <ColumnsMenu table={table} />
        <button
          type="button"
          className={iconButton}
          onClick={onToggleDensity}
          aria-label={density === 'compact' ? 'Comfortable rows' : 'Compact rows'}
          title={density === 'compact' ? 'Comfortable rows' : 'Compact rows'}
        >
          {density === 'compact' ? <Rows3 size={13} /> : <Rows4 size={13} />}
        </button>
        <button type="button" className={iconButton} onClick={onExport} title="Download as CSV">
          <Download size={13} />
          {selectedCount > 0 ? `Export ${selectedCount}` : 'Export'}
        </button>
        <button type="button" className={iconButton} onClick={onResetView} title="Reset columns, filters, sorting, and grouping">
          <RotateCcw size={13} />
          <span className="sr-only">Reset view</span>
        </button>
      </div>

      {(grouping.length > 0 || activeFilters > 0 || selectedCount > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pb-2 text-xs">
          {grouping.map((id) => (
            <Chip key={id} icon={Layers} onRemove={() => columnById(id)?.toggleGrouping()}>
              Grouped by {columnById(id) ? columnLabel(columnById(id)!).toLowerCase() : id}
            </Chip>
          ))}
          {savedFilterName && activeFilters > 0 && (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-gray-600 hover:bg-gray-100"
              onClick={onOpenFilters}
            >
              <Bookmark size={11} />
              {savedFilterName}:
            </button>
          )}
          {filterChips.map((chip) => (
            <Chip key={chip.id} icon={Filter} onRemove={chip.onRemove} onClick={onOpenFilters}>
              {chip.label}
            </Chip>
          ))}
          {activeFilters > 1 && (
            <button type="button" className="px-1 font-medium text-gray-500 hover:text-gray-800" onClick={onClearFilters}>
              Clear filters
            </button>
          )}
          {selectedCount > 0 && (
            <span className="ml-auto flex items-center gap-2 text-gray-600">
              {selectedCount} selected
              <button type="button" className="font-medium text-brand-700 hover:text-brand-800" onClick={() => table.resetRowSelection(true)}>
                Clear
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({
  icon: Icon,
  children,
  onRemove,
  onClick,
}: {
  icon: typeof Filter;
  children: React.ReactNode;
  onRemove: () => void;
  onClick?: () => void;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-brand-50 py-0.5 pl-2 pr-1 font-medium text-brand-700 ring-1 ring-inset ring-brand-600/20">
      <Icon size={11} className="shrink-0" />
      {onClick ? (
        <button type="button" className="min-w-0 truncate" onClick={onClick}>
          {children}
        </button>
      ) : (
        children
      )}
      <button type="button" aria-label="Remove" className="rounded p-0.5 hover:bg-brand-100" onClick={onRemove}>
        <X size={11} />
      </button>
    </span>
  );
}

function ColumnsMenu<TData extends RowData>({ table }: { table: AppTable<TData> }) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const columns = (table.getAllLeafColumns() as AnyColumn[]).filter((column) => !isInternalColumn(column.id) && column.getCanHide());
  const hiddenCount = columns.filter((column) => !column.getIsVisible()).length;

  return (
    <>
      <button ref={anchorRef} type="button" className={iconButton} onClick={() => setOpen((v) => !v)}>
        <Columns3 size={13} />
        Columns
        {hiddenCount > 0 && <span className="rounded-full bg-gray-100 px-1.5 text-[10px] text-gray-600">{hiddenCount} hidden</span>}
      </button>
      <Popover anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} align="end" width={240}>
        <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Show columns</p>
        <div className="max-h-72 overflow-auto">
          {columns.map((column) => (
            <label key={column.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 hover:bg-gray-100">
              <Checkbox checked={column.getIsVisible()} onChange={() => column.toggleVisibility()} label={columnLabel(column)} />
              <span className="truncate text-gray-700">{columnLabel(column)}</span>
            </label>
          ))}
        </div>
        <p className="border-t border-gray-100 px-2.5 pb-1 pt-2 text-[11px] text-gray-400">Drag a column header to reorder. Use its ⋮ menu to pin or group.</p>
      </Popover>
    </>
  );
}

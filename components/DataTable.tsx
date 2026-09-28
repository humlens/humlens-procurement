import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/router';
import { type ColumnDef, type RowData, useTable } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, ChevronRight, Inbox, type LucideIcon } from 'lucide-react';

import { tableFeatureSet } from '@/lib/tableFeatures';
import {
  EMPTY_FILTER,
  OPERATORS,
  activeConditions,
  detectKind,
  isComplete,
  type AdvancedFilter,
  type FilterCondition,
} from '@/lib/advancedFilter';
import EmptyState from '@/components/EmptyState';
import Checkbox from '@/components/data-table/Checkbox';
import FilterSidebar, { prettyValue, type FilterColumn, type SavedFilterItem } from '@/components/data-table/FilterSidebar';
import HeaderCell from '@/components/data-table/HeaderCell';
import Pagination, { PAGE_SIZES } from '@/components/data-table/Pagination';
import Toolbar, { type FilterChip } from '@/components/data-table/Toolbar';
import { useSavedFilters } from '@/components/data-table/useSavedFilters';
import { stableFingerprint, useSavedView, type SavedView } from '@/components/data-table/useSavedView';
import {
  FILTER_COLUMN_ID,
  SELECT_COLUMN_ID,
  columnLabel,
  columnMeta,
  downloadCsv,
  hasData,
  isInternalColumn,
  type AnyColumn,
} from '@/components/data-table/utils';

export type AppColumnDef<T extends RowData> = ColumnDef<typeof tableFeatureSet, T, any>;

const DEFAULT_PAGE_SIZE = 50;

// What a table looks like with nothing saved. A saved view equal to this is
// deleted instead of stored.
const DEFAULT_VIEW: SavedView = {
  columnVisibility: { [FILTER_COLUMN_ID]: false },
  columnPinning: { start: [SELECT_COLUMN_ID], end: [] },
  pageSize: DEFAULT_PAGE_SIZE,
  density: 'comfortable',
};

const selectColumn: AppColumnDef<any> = {
  id: SELECT_COLUMN_ID,
  size: 44,
  minSize: 44,
  enableSorting: false,
  enableHiding: false,
  enableResizing: false,
  enableColumnFilter: false,
  enableGlobalFilter: false,
  enableGrouping: false,
  enablePinning: false,
  header: ({ table }) => (
    <Checkbox
      label="Select all rows on this page"
      checked={table.getIsAllPageRowsSelected()}
      indeterminate={table.getIsSomePageRowsSelected()}
      onChange={table.getToggleAllPageRowsSelectedHandler()}
    />
  ),
  cell: ({ row }) => (
    <Checkbox
      label="Select row"
      checked={row.getIsSelected()}
      indeterminate={row.getIsSomeSelected()}
      disabled={!row.getCanSelect()}
      onChange={row.getToggleSelectedHandler()}
    />
  ),
};

// Never shown: it carries the advanced filter so TanStack evaluates every
// condition (across any columns, AND/OR) as one column filter.
const filterColumn: AppColumnDef<any> = {
  id: FILTER_COLUMN_ID,
  accessorFn: () => null,
  filterFn: 'advanced',
  header: '',
  size: 0,
  enableSorting: false,
  enableHiding: false,
  enableResizing: false,
  enableGlobalFilter: false,
  enableGrouping: false,
  enablePinning: false,
};

function describeCondition(condition: FilterCondition, column: FilterColumn) {
  const op = OPERATORS[condition.operator];
  let value = '';
  if (op.input === 'many') {
    const values = (condition.values ?? []).map(prettyValue);
    value = values.length > 2 ? `${values.slice(0, 2).join(', ')} +${values.length - 2}` : values.join(', ');
  } else if (op.input === 'two') {
    value = `${condition.value} – ${condition.value2}`;
  } else if (op.input === 'one') {
    value = condition.operator === 'last_days' ? `${condition.value} days` : `${condition.value}`;
  }
  return `${column.label} ${op.label}${value ? ` ${value}` : ''}`;
}

// Measure before paint in the browser; plain effect during server rendering.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

type ColumnLayout = { widths: Map<string, number>; starts: Map<string, number>; afters: Map<string, number>; total: number; scale: number };

// Stretches the visible columns to fill the table's width, in proportion to
// their sizes (the checkbox column stays fixed); wider-than-container tables
// keep their sizes and scroll sideways. Also works out the sticky offsets of
// pinned columns from those final widths.
function layoutColumns(columns: AnyColumn[], containerWidth: number): ColumnLayout {
  const base = columns.reduce((sum, column) => sum + column.getSize(), 0);
  const fixed = columns.filter((column) => column.id === SELECT_COLUMN_ID).reduce((sum, column) => sum + column.getSize(), 0);
  const scale = containerWidth > base && base > fixed ? (containerWidth - fixed) / (base - fixed) : 1;

  const widths = new Map<string, number>();
  let used = 0;
  let lastFlexible: string | null = null;
  for (const column of columns) {
    const width = column.id === SELECT_COLUMN_ID ? column.getSize() : Math.floor(column.getSize() * scale);
    widths.set(column.id, width);
    used += width;
    if (column.id !== SELECT_COLUMN_ID) lastFlexible = column.id;
  }
  // Rounding leftovers go to the last column so the row ends exactly at the edge.
  if (scale > 1 && lastFlexible) widths.set(lastFlexible, widths.get(lastFlexible)! + (containerWidth - used));

  const starts = new Map<string, number>();
  let offset = 0;
  for (const column of columns) {
    if (column.getIsPinned() !== 'start') continue;
    starts.set(column.id, offset);
    offset += widths.get(column.id)!;
  }
  const afters = new Map<string, number>();
  offset = 0;
  for (const column of [...columns].reverse()) {
    if (column.getIsPinned() !== 'end') continue;
    afters.set(column.id, offset);
    offset += widths.get(column.id)!;
  }

  return { widths, starts, afters, total: Math.max(base, scale > 1 ? containerWidth : base), scale };
}

// Sticky offsets for pinned columns, plus an edge line where the pinned
// block meets the scrolling columns.
function pinning(column: AnyColumn, layout: ColumnLayout): { style: CSSProperties; className: string } {
  const pinned = column.getIsPinned();
  if (!pinned) return { style: {}, className: '' };
  const edge =
    pinned === 'start' && column.getIsLastColumn('start')
      ? 'shadow-[inset_-1px_0_0_theme(colors.gray.200)]'
      : pinned === 'end' && column.getIsFirstColumn('end')
        ? 'shadow-[inset_1px_0_0_theme(colors.gray.200)]'
        : '';
  return {
    style: {
      position: 'sticky',
      left: pinned === 'start' ? layout.starts.get(column.id) : undefined,
      right: pinned === 'end' ? layout.afters.get(column.id) : undefined,
      zIndex: 2,
    },
    className: edge,
  };
}

// The one table for every list page in the app, built on TanStack Table v9's
// full feature set: global search, a filter sidebar (conditions on any
// column with type-aware operators, matched with AND/OR, savable and
// shareable with the team — see FilterSidebar), multi-column sorting, grouping with
// aggregates, row selection, CSV export, column visibility, drag-to-reorder,
// pinning and resizing, density, and pagination. The layout, sorting,
// grouping, filters, page size, and density are saved against the signed-in
// user per page (see useSavedView), so they follow them across devices. TanStack Virtual
// renders only the rows in view, so large pages stay fast. Rows use flex
// layout (not table auto-layout) because absolutely positioned virtualized
// rows need explicit per-column widths — see each column's `size`.
export default function DataTable<T extends RowData>({
  columns,
  data,
  getRowHref,
  emptyMessage = 'Nothing here yet.',
  emptyDescription,
  emptyIcon: EmptyIcon = Inbox,
  searchPlaceholder = 'Search…',
  isLoading,
  exportFileName,
}: {
  columns: AppColumnDef<T>[];
  data: T[];
  getRowHref?: (row: T) => string;
  emptyMessage?: string;
  emptyDescription?: string;
  emptyIcon?: LucideIcon;
  searchPlaceholder?: string;
  isLoading?: boolean;
  exportFileName?: string;
}) {
  const router = useRouter();
  const parentRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useIsomorphicLayoutEffect(() => {
    const element = parentRef.current;
    if (!element) return;
    const measure = () => setContainerWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filter, setFilterState] = useState<AdvancedFilter>(EMPTY_FILTER);
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
  const [defaultFilterId, setDefaultFilterId] = useState<string | null>(null);
  const tableKey = router.pathname;
  const teamSlug = typeof router.query.slug === 'string' ? router.query.slug : undefined;
  const savedFilters = useSavedFilters(teamSlug, tableKey);
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');

  const allColumns = useMemo(() => [selectColumn as AppColumnDef<T>, ...columns, filterColumn as AppColumnDef<T>], [columns]);

  const table = useTable({
    features: tableFeatureSet,
    columns: allColumns,
    data,
    getRowId: (row, index) => {
      const id = (row as { id?: unknown }).id;
      return typeof id === 'string' ? id : String(index);
    },
    globalFilterFn: 'includesString',
    defaultColumn: { size: 180, minSize: 70 },
    columnResizeMode: 'onChange',
    initialState: {
      pagination: { pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE },
      columnPinning: { start: [SELECT_COLUMN_ID], end: [] },
      columnVisibility: { [FILTER_COLUMN_ID]: false },
    },
  });

  const state = table.state;

  // The columns a filter can use, with the type (and, for lists, the values
  // and counts) detected from all rows — not just the filtered ones.
  const filterColumns = useMemo<FilterColumn[]>(() => {
    const coreRows = table.getCoreRowModel().flatRows;
    return (table.getAllLeafColumns() as AnyColumn[])
      .filter((column) => !isInternalColumn(column.id) && hasData(column) && column.columnDef.enableColumnFilter !== false)
      .map((column) => {
        const values = coreRows.map((row) => row.getValue(column.id));
        const kind = detectKind(values, coreRows.length, columnMeta(column)?.filterKind);
        const counts = new Map<string, number>();
        if (kind === 'select') for (const value of values) counts.set(String(value ?? ''), (counts.get(String(value ?? '')) ?? 0) + 1);
        return {
          id: column.id,
          label: columnLabel(column),
          kind,
          options: [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => a.value.localeCompare(b.value)),
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, allColumns]);

  const filterColumnIds = useMemo(() => new Set(filterColumns.map((column) => column.id)), [filterColumns]);

  // Drops conditions on columns this page no longer has.
  const setFilter = (next: AdvancedFilter) => {
    const clean = { ...next, conditions: next.conditions.filter((c) => filterColumnIds.has(c.columnId)) };
    setFilterState(clean);
    table.setColumnFilters(activeConditions(clean).length ? [{ id: FILTER_COLUMN_ID, value: clean }] : []);
  };

  // Applies a saved view in full — anything it doesn't mention goes back to
  // the default. Columns that no longer exist on the page are ignored.
  const applyView = (view: SavedView) => {
    const known = new Set(table.getAllLeafColumns().map((column) => column.id));
    const ids = (list?: string[]) => (list ?? []).filter((id) => known.has(id));
    const byKey = <V,>(record?: Record<string, V>) => Object.fromEntries(Object.entries(record ?? {}).filter(([id]) => known.has(id)));

    table.setColumnVisibility({ ...byKey(view.columnVisibility), [FILTER_COLUMN_ID]: false });
    table.setColumnOrder(ids(view.columnOrder));
    table.setColumnSizing(byKey(view.columnSizing));
    table.setColumnPinning({
      start: [SELECT_COLUMN_ID, ...ids(view.columnPinning?.start).filter((id) => id !== SELECT_COLUMN_ID)],
      end: ids(view.columnPinning?.end),
    });
    table.setSorting((view.sorting ?? []).filter((sort) => known.has(sort.id)));
    table.setGrouping(ids(view.grouping));
    setFilter(view.filter ?? EMPTY_FILTER);
    setActiveFilterId(view.activeFilterId ?? null);
    setDefaultFilterId(view.defaultFilterId ?? null);
    table.setPageSize(view.pageSize && PAGE_SIZES.includes(view.pageSize) ? view.pageSize : DEFAULT_PAGE_SIZE);
    setDensity(view.density ?? 'comfortable');
  };

  const { loaded: viewLoaded, save: saveView } = useSavedView({ tableKey, defaultView: DEFAULT_VIEW, apply: applyView });

  // Open the page with the user's default saved filter, once both their
  // preferences and the team's saved filters have loaded.
  const defaultApplied = useRef<string | null>(null);
  useEffect(() => {
    if (!viewLoaded || !savedFilters.items || defaultApplied.current === tableKey) return;
    defaultApplied.current = tableKey;
    const preferred = savedFilters.items.find((item) => item.id === defaultFilterId);
    if (preferred) {
      setFilter(preferred.filter);
      setActiveFilterId(preferred.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewLoaded, savedFilters.items, tableKey]);

  // Forget saved filters that were deleted (here or by a teammate).
  useEffect(() => {
    if (!savedFilters.items) return;
    const ids = new Set(savedFilters.items.map((item) => item.id));
    if (activeFilterId && !ids.has(activeFilterId)) setActiveFilterId(null);
    if (defaultFilterId && !ids.has(defaultFilterId)) setDefaultFilterId(null);
  }, [savedFilters.items, activeFilterId, defaultFilterId]);

  useEffect(() => {
    saveView({
      columnVisibility: state.columnVisibility,
      columnOrder: state.columnOrder,
      columnSizing: state.columnSizing,
      columnPinning: state.columnPinning,
      sorting: state.sorting,
      grouping: state.grouping,
      filter: filter.conditions.length ? filter : undefined,
      activeFilterId: activeFilterId ?? undefined,
      defaultFilterId: defaultFilterId ?? undefined,
      pageSize: state.pagination.pageSize,
      density,
    });
  }, [
    saveView,
    state.columnVisibility,
    state.columnOrder,
    state.columnSizing,
    state.columnPinning,
    state.sorting,
    state.grouping,
    filter,
    activeFilterId,
    defaultFilterId,
    state.pagination.pageSize,
    density,
  ]);

  const rows = table.getRowModel().rows;
  const rowHeight = density === 'compact' ? 34 : 45;

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    getItemKey: (index) => rows[index]!.id,
    overscan: 12,
  });

  useEffect(() => {
    rowVirtualizer.measure();
  }, [rowHeight, rowVirtualizer]);

  useEffect(() => {
    parentRef.current?.scrollTo({ top: 0 });
  }, [state.pagination.pageIndex]);

  const reorderColumn = (draggedId: string, targetId: string) => {
    const leafIds = table.getAllLeafColumns().map((column) => column.id);
    const order = state.columnOrder.length ? [...state.columnOrder] : [...leafIds];
    for (const id of leafIds) if (!order.includes(id)) order.push(id);
    const from = order.indexOf(draggedId);
    const target = order.indexOf(targetId);
    order.splice(from, 1);
    order.splice(order.indexOf(targetId) + (from < target ? 1 : 0), 0, draggedId);
    table.setColumnOrder(order);
  };

  const resetView = () => {
    table.resetColumnVisibility();
    table.resetColumnOrder();
    table.resetColumnSizing();
    table.resetColumnPinning();
    table.resetSorting();
    setFilter(EMPTY_FILTER);
    setActiveFilterId(null);
    table.setGlobalFilter('');
    table.resetGrouping();
    table.resetExpanded();
    table.resetRowSelection();
    table.resetPagination();
    setDensity('comfortable');
    // The saved view now matches the default, so useSavedView deletes it.
  };

  const exportCsv = () => {
    const exportColumns = (table.getVisibleLeafColumns() as AnyColumn[]).filter(
      (column) => !isInternalColumn(column.id) && hasData(column)
    );
    const selected = table.getSelectedRowModel().flatRows;
    const source = selected.length > 0 ? selected : table.getSortedRowModel().flatRows;
    const exportRows = source.filter((row) => !row.getIsGrouped());
    const pageName = router.pathname.split('/').filter((part) => part && !part.startsWith('[')).pop() ?? 'export';
    downloadCsv(
      `${exportFileName ?? pageName}-${new Date().toISOString().slice(0, 10)}.csv`,
      exportColumns.map(columnLabel),
      exportRows.map((row) =>
        exportColumns.map((column) => {
          const exportValue = columnMeta(column)?.exportValue;
          return exportValue ? exportValue(row.original) : row.getValue(column.id);
        })
      )
    );
  };

  const activeSaved = savedFilters.items?.find((item) => item.id === activeFilterId) ?? null;
  const filterModified = Boolean(activeSaved) && stableFingerprint(activeSaved!.filter) !== stableFingerprint(filter);
  const filterColumnById = new Map(filterColumns.map((column) => [column.id, column]));

  const filterChips: FilterChip[] = filter.conditions.filter(isComplete).flatMap((condition) => {
    const column = filterColumnById.get(condition.columnId);
    if (!column) return [];
    return [
      {
        id: condition.id,
        label: describeCondition(condition, column),
        onRemove: () => setFilter({ ...filter, conditions: filter.conditions.filter((c) => c.id !== condition.id) }),
      },
    ];
  });

  const applySaved = (item: SavedFilterItem) => {
    setFilter(item.filter);
    setActiveFilterId(item.id);
  };

  const saveNewFilter = async ({ name, shared }: { name: string; shared: boolean }) => {
    const created = await savedFilters.create({ name, filter, shared });
    if (created) setActiveFilterId(created.id);
    return Boolean(created);
  };

  const layout = layoutColumns(
    (table.getHeaderGroups().at(-1)?.headers ?? []).map((header) => header.column as AnyColumn),
    containerWidth
  );
  const widthOf = (column: AnyColumn) => layout.widths.get(column.id) ?? column.getSize();

  // Resizing works on real sizes: first fix the stretched widths as the
  // columns' sizes, so the drag handle follows the pointer exactly.
  const fixStretchedWidths = () => {
    if (layout.scale <= 1) return;
    table.setColumnSizing(Object.fromEntries([...layout.widths].filter(([id]) => id !== SELECT_COLUMN_ID)));
  };

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const cellPadding = density === 'compact' ? 'px-3 py-1.5' : 'px-4 py-2.5';

  return (
    <div className="card overflow-hidden p-0">
      <Toolbar
        table={table}
        searchPlaceholder={searchPlaceholder}
        filterChips={filterChips}
        savedFilterName={activeSaved ? `${activeSaved.name}${filterModified ? ' (edited)' : ''}` : null}
        onOpenFilters={() => setFiltersOpen(true)}
        onClearFilters={() => {
          setFilter(EMPTY_FILTER);
          setActiveFilterId(null);
        }}
        density={density}
        onToggleDensity={() => setDensity((d) => (d === 'compact' ? 'comfortable' : 'compact'))}
        onExport={exportCsv}
        onResetView={resetView}
      />

      <div ref={parentRef} className="max-h-[60vh] overflow-auto">
        <table style={{ display: 'grid', width: layout.total }}>
          <thead className="sticky top-0 z-10" style={{ display: 'grid' }}>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} style={{ display: 'flex', width: '100%' }}>
                {headerGroup.headers.map((header) => {
                  const pin = pinning(header.column as AnyColumn, layout);
                  return (
                    <HeaderCell
                      key={header.id}
                      header={header}
                      onReorder={reorderColumn}
                      onResizeStart={fixStretchedWidths}
                      style={{ display: 'flex', width: widthOf(header.column as AnyColumn), ...pin.style }}
                      className={`items-center gap-1 border-b border-gray-200 bg-gray-50 ${cellPadding} text-left text-xs font-semibold uppercase tracking-wide text-gray-500 ${pin.className}`}
                    >
                      <table.FlexRender header={header} />
                    </HeaderCell>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody style={{ display: 'grid', position: 'relative', height: totalSize }}>
            {virtualItems.map((virtualRow) => {
              const row = rows[virtualRow.index]!;
              const grouped = row.getIsGrouped();
              const href = !grouped ? getRowHref?.(row.original) : undefined;
              const onClick = grouped ? () => row.toggleExpanded() : href ? () => router.push(href) : undefined;
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
                  className={`group items-stretch border-b border-gray-100 transition-colors duration-100 ${
                    row.getIsSelected() ? 'bg-brand-50' : grouped ? 'bg-gray-50' : 'bg-white'
                  } hover:bg-gray-50 ${onClick ? 'cursor-pointer' : ''}`}
                  onClick={onClick}
                >
                  {row.getVisibleCells().map((cell) => {
                    const column = cell.column as AnyColumn;
                    const pin = pinning(column, layout);
                    let content: React.ReactNode;
                    if (cell.getIsGrouped()) {
                      content = (
                        <span className="flex min-w-0 items-center gap-1.5 font-medium text-gray-900" style={{ paddingLeft: row.depth * 16 }}>
                          {row.getIsExpanded() ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
                          <span className="min-w-0 truncate">
                            <table.FlexRender cell={cell} />
                          </span>
                          <span className="shrink-0 text-xs font-normal text-gray-400">({row.subRows.length})</span>
                        </span>
                      );
                    } else if (grouped) {
                      // Group rows only show numeric aggregates (e.g. summed
                      // quantities); page renderers expect a real record.
                      const value = cell.getIsAggregated() ? cell.getValue() : undefined;
                      content = typeof value === 'number' ? <span className="font-medium tabular-nums text-gray-900">{value.toLocaleString()}</span> : null;
                    } else if (cell.getIsPlaceholder()) {
                      content = null;
                    } else {
                      content = <table.FlexRender cell={cell} />;
                    }
                    return (
                      <td
                        key={cell.id}
                        style={{ display: 'flex', width: widthOf(column), ...pin.style }}
                        className={`items-center truncate ${cellPadding} text-sm text-gray-700 ${
                          pin.style.position ? `${row.getIsSelected() ? 'bg-brand-50' : grouped ? 'bg-gray-50' : 'bg-white'} group-hover:bg-gray-50` : ''
                        } ${pin.className}`}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Outside the scroll container so it stays centered in the card even
          when the columns are wider than the card and scrolled sideways. */}
      {!isLoading && rows.length === 0 && (
        <EmptyState
          icon={EmptyIcon}
          title={data.length > 0 ? 'No matching rows' : emptyMessage}
          description={data.length > 0 ? 'Try a different search or clear some filters.' : emptyDescription}
        />
      )}

      {data.length > 0 && <Pagination table={table} />}

      <FilterSidebar
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        columns={filterColumns}
        filter={filter}
        onChange={setFilter}
        matchCount={table.getFilteredRowModel().rows.length}
        totalCount={data.length}
        savedFilters={savedFilters.items}
        activeFilterId={activeFilterId}
        defaultFilterId={defaultFilterId}
        isModified={filterModified}
        onApplySaved={applySaved}
        onSaveNew={saveNewFilter}
        onUpdateSaved={(item) => savedFilters.update(item, { filter }, `Updated “${item.name}”.`)}
        onDeleteSaved={(item) => {
          if (window.confirm(`Delete the saved filter “${item.name}”${item.shared ? ' for everyone on the team' : ''}?`)) {
            savedFilters.remove(item);
          }
        }}
        onToggleShared={(item) =>
          savedFilters.update(
            item,
            { shared: !item.shared },
            item.shared ? `“${item.name}” is now only visible to you.` : `Shared “${item.name}” with your team.`
          )
        }
        onToggleDefault={(item) => setDefaultFilterId((current) => (current === item.id ? null : item.id))}
      />
    </div>
  );
}

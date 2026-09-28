import {
  tableFeatures,
  rowSortingFeature,
  createSortedRowModel,
  columnFilteringFeature,
  globalFilteringFeature,
  createFilteredRowModel,
  columnFacetingFeature,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFacetedMinMaxValues,
  columnSizingFeature,
  columnResizingFeature,
  columnVisibilityFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnGroupingFeature,
  createGroupedRowModel,
  rowAggregationFeature,
  rowExpandingFeature,
  createExpandedRowModel,
  rowPaginationFeature,
  createPaginatedRowModel,
  rowSelectionFeature,
  constructFilterFn,
  sortFn_alphanumeric,
  sortFn_text,
  sortFn_basic,
  sortFn_datetime,
  filterFn_includesString,
  aggregationFn_sum,
  aggregationFn_count,
  aggregationFn_min,
  aggregationFn_max,
  aggregationFn_mean,
  aggregationFn_extent,
  aggregationFn_uniqueCount,
} from '@tanstack/react-table';

import { activeConditions, matchesFilter, type AdvancedFilter, type FilterKind } from '@/lib/advancedFilter';

export type DataTableColumnMeta = {
  /** Overrides the filter type picked from the column's values (see detectKind). */
  filterKind?: FilterKind;
  exportValue?: (row: any) => unknown;
};

// The whole advanced filter (all conditions, AND/OR) is evaluated as one
// column filter on a hidden column (ADVANCED_FILTER_COLUMN_ID in DataTable),
// so it runs inside TanStack's pipeline — counts, pagination, grouping and
// export all see the filtered rows.
const advancedFilterFn = constructFilterFn({
  filter: (_value: unknown, filter: AdvancedFilter, row) => matchesFilter(filter, (columnId) => row.getValue(columnId)),
  autoRemove: (filter?: AdvancedFilter) => activeConditions(filter).length === 0,
});

// TanStack Table v9 requires every feature to be opted into explicitly. One
// shared, module-scope feature set for every DataTable instance in the app —
// stable reference, registered once.
export const tableFeatureSet = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  columnFacetingFeature,
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
  facetedMinMaxValues: createFacetedMinMaxValues(),
  columnSizingFeature,
  columnResizingFeature,
  columnVisibilityFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnGroupingFeature,
  groupedRowModel: createGroupedRowModel(),
  rowAggregationFeature,
  rowExpandingFeature,
  expandedRowModel: createExpandedRowModel(),
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  rowSelectionFeature,
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    text: sortFn_text,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
  },
  filterFns: { includesString: filterFn_includesString, advanced: advancedFilterFn },
  aggregationFns: {
    sum: aggregationFn_sum,
    count: aggregationFn_count,
    min: aggregationFn_min,
    max: aggregationFn_max,
    mean: aggregationFn_mean,
    extent: aggregationFn_extent,
    uniqueCount: aggregationFn_uniqueCount,
  },
});

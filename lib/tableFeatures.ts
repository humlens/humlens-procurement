import {
  tableFeatures,
  rowSortingFeature,
  createSortedRowModel,
  columnFilteringFeature,
  globalFilteringFeature,
  createFilteredRowModel,
  columnSizingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  sortFn_basic,
  sortFn_datetime,
  filterFn_includesString,
} from '@tanstack/react-table';

// TanStack Table v9 requires every feature (sorting, filtering, sizing) to
// be opted into explicitly. One shared, module-scope feature set for every
// DataTable instance in the app — stable reference, registered once.
export const tableFeatureSet = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  columnSizingFeature,
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    text: sortFn_text,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
  },
  filterFns: { includesString: filterFn_includesString },
});

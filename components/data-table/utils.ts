import type { Column, RowData } from '@tanstack/react-table';

import type { DataTableColumnMeta, tableFeatureSet } from '@/lib/tableFeatures';

export type AppColumn<TData extends RowData> = Column<typeof tableFeatureSet, TData, unknown>;
export type AnyColumn = AppColumn<any>;

export const SELECT_COLUMN_ID = '_select';
// Hidden column that carries the advanced filter (see lib/tableFeatures.ts).
export const FILTER_COLUMN_ID = '_filter';

// Columns the table adds for itself, which never show up in menus or exports.
export const isInternalColumn = (id: string) => id === SELECT_COLUMN_ID || id === FILTER_COLUMN_ID;

export const columnLabel = <TData extends RowData>(column: AppColumn<TData>) =>
  typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id.replace(/([a-z])([A-Z])/g, '$1 $2');

export const columnMeta = <TData extends RowData>(column: AppColumn<TData>) => column.columnDef.meta as DataTableColumnMeta | undefined;

// Columns with an accessor hold data; display-only columns (row actions,
// checkboxes) can't be sorted, filtered, grouped, or exported.
export const hasData = <TData extends RowData>(column: AppColumn<TData>) => Boolean(column.accessorFn);

const csvCell = (value: unknown) => {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function downloadCsv(filename: string, header: string[], rows: unknown[][]) {
  const csv = [header, ...rows].map((line) => line.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

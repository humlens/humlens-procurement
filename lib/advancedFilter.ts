import { z } from 'zod';

// Advanced table filters: a list of conditions (column · operator · value)
// matched with AND ("all") or OR ("any"). Used by DataTable's filter
// sidebar, stored in saved filters (models/savedFilter.ts) and in each
// user's table preferences. Pure logic — safe to import on the server.

export type FilterKind = 'text' | 'select' | 'number' | 'date';

export const OPERATORS = {
  contains: { label: 'contains', kinds: ['text'], input: 'one' },
  not_contains: { label: 'does not contain', kinds: ['text'], input: 'one' },
  is: { label: 'is', kinds: ['text'], input: 'one' },
  is_not: { label: 'is not', kinds: ['text'], input: 'one' },
  starts_with: { label: 'starts with', kinds: ['text'], input: 'one' },
  ends_with: { label: 'ends with', kinds: ['text'], input: 'one' },
  any_of: { label: 'is any of', kinds: ['select'], input: 'many' },
  none_of: { label: 'is none of', kinds: ['select'], input: 'many' },
  eq: { label: '=', kinds: ['number'], input: 'one' },
  neq: { label: '≠', kinds: ['number'], input: 'one' },
  gt: { label: '>', kinds: ['number'], input: 'one' },
  gte: { label: '≥', kinds: ['number'], input: 'one' },
  lt: { label: '<', kinds: ['number'], input: 'one' },
  lte: { label: '≤', kinds: ['number'], input: 'one' },
  between: { label: 'is between', kinds: ['number'], input: 'two' },
  on: { label: 'is on', kinds: ['date'], input: 'one' },
  before: { label: 'is before', kinds: ['date'], input: 'one' },
  after: { label: 'is after', kinds: ['date'], input: 'one' },
  date_between: { label: 'is between', kinds: ['date'], input: 'two' },
  last_days: { label: 'is in the last', kinds: ['date'], input: 'one' },
  empty: { label: 'is empty', kinds: ['text', 'select', 'number', 'date'], input: 'none' },
  not_empty: { label: 'is not empty', kinds: ['text', 'select', 'number', 'date'], input: 'none' },
} as const satisfies Record<string, { label: string; kinds: readonly FilterKind[]; input: 'none' | 'one' | 'two' | 'many' }>;

export type Operator = keyof typeof OPERATORS;

export type FilterCondition = {
  id: string;
  columnId: string;
  operator: Operator;
  value?: string;
  value2?: string;
  values?: string[];
};

export type AdvancedFilter = { match: 'all' | 'any'; conditions: FilterCondition[] };

export const EMPTY_FILTER: AdvancedFilter = { match: 'all', conditions: [] };

export const operatorsFor = (kind: FilterKind) =>
  (Object.keys(OPERATORS) as Operator[]).filter((op) => (OPERATORS[op].kinds as readonly FilterKind[]).includes(kind));

const DEFAULT_OPERATOR: Record<FilterKind, Operator> = { text: 'contains', select: 'any_of', number: 'eq', date: 'after' };
export const defaultOperator = (kind: FilterKind): Operator => DEFAULT_OPERATOR[kind];

// A condition still being filled in (no value yet) is ignored rather than
// matching nothing.
export function isComplete(condition: FilterCondition) {
  const input = OPERATORS[condition.operator]?.input;
  if (input === 'none') return true;
  if (input === 'many') return (condition.values?.length ?? 0) > 0;
  if (input === 'two') return Boolean(condition.value) && Boolean(condition.value2);
  return condition.value !== undefined && condition.value !== '';
}

export const activeConditions = (filter: AdvancedFilter | null | undefined) =>
  (filter?.conditions ?? []).filter(isComplete);

export const toNumber = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  return null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;
export const isIsoDate = (value: unknown) => typeof value === 'string' && ISO_DATE.test(value);
const toDay = (value: unknown) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : isIsoDate(value) ? (value as string).slice(0, 10) : null;

const localDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const isBlank = (value: unknown) => value === null || value === undefined || String(value).trim() === '';

export function matchesCondition(value: unknown, condition: FilterCondition, today = new Date()): boolean {
  const { operator } = condition;
  if (operator === 'empty') return isBlank(value);
  if (operator === 'not_empty') return !isBlank(value);

  const text = String(value ?? '').toLowerCase();
  const target = (condition.value ?? '').toLowerCase();
  switch (operator) {
    case 'contains':
      return text.includes(target);
    case 'not_contains':
      return !text.includes(target);
    case 'is':
      return text === target;
    case 'is_not':
      return text !== target;
    case 'starts_with':
      return text.startsWith(target);
    case 'ends_with':
      return text.endsWith(target);
    case 'any_of':
      return (condition.values ?? []).includes(String(value ?? ''));
    case 'none_of':
      return !(condition.values ?? []).includes(String(value ?? ''));
  }

  if (operator in { eq: 1, neq: 1, gt: 1, gte: 1, lt: 1, lte: 1, between: 1 }) {
    const n = toNumber(value);
    const a = toNumber(condition.value);
    if (n === null || a === null) return false;
    switch (operator) {
      case 'eq':
        return n === a;
      case 'neq':
        return n !== a;
      case 'gt':
        return n > a;
      case 'gte':
        return n >= a;
      case 'lt':
        return n < a;
      case 'lte':
        return n <= a;
      case 'between': {
        const b = toNumber(condition.value2);
        return b !== null && n >= Math.min(a, b) && n <= Math.max(a, b);
      }
    }
  }

  const day = toDay(value);
  if (day === null) return false;
  const from = condition.value ?? '';
  switch (operator) {
    case 'on':
      return day === from;
    case 'before':
      return day < from;
    case 'after':
      return day > from;
    case 'date_between': {
      const to = condition.value2 ?? '';
      const [lo, hi] = from <= to ? [from, to] : [to, from];
      return day >= lo && day <= hi;
    }
    case 'last_days': {
      const days = toNumber(condition.value);
      if (days === null) return false;
      const start = new Date(today);
      start.setDate(start.getDate() - Math.max(0, Math.floor(days)));
      return day >= localDay(start) && day <= localDay(today);
    }
  }
  return true;
}

export function matchesFilter(filter: AdvancedFilter, getValue: (columnId: string) => unknown) {
  const conditions = activeConditions(filter);
  if (conditions.length === 0) return true;
  const test = (condition: FilterCondition) => matchesCondition(getValue(condition.columnId), condition);
  return filter.match === 'any' ? conditions.some(test) : conditions.every(test);
}

// Chooses the column's filter type from its values: numbers (including
// Prisma Decimals sent as strings) → number, ISO dates → date, a short list
// of repeated values (statuses, types, roles) → select, else text.
export function detectKind(values: unknown[], rowCount: number, explicit?: FilterKind): FilterKind {
  if (explicit) return explicit;
  const present = values.filter((v) => !isBlank(v));
  if (present.length === 0) return 'text';
  if (present.every((v) => toNumber(v) !== null)) return 'number';
  if (present.every((v) => toDay(v) !== null)) return 'date';
  const unique = new Set(present.map(String));
  if (present.every((v) => typeof v === 'string' || typeof v === 'boolean') && unique.size <= 15 && unique.size < rowCount) {
    return 'select';
  }
  return 'text';
}

// Server-side validation for filters stored in saved filters and table
// preferences.
const shortText = z.string().max(200);
export const filterConditionSchema = z.object({
  id: z.string().max(64),
  columnId: z.string().max(100),
  operator: z.enum(Object.keys(OPERATORS) as [Operator, ...Operator[]]),
  value: shortText.optional(),
  value2: shortText.optional(),
  values: z.array(shortText).max(100).optional(),
});

export const advancedFilterSchema = z.object({
  match: z.enum(['all', 'any']),
  conditions: z.array(filterConditionSchema).max(30),
});

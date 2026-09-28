import { useMemo, useState } from 'react';
import { Plus, Search, Share2, Star, Trash2, Users, X } from 'lucide-react';

import SidebarModal from '@/components/SidebarModal';
import Checkbox from './Checkbox';
import {
  OPERATORS,
  activeConditions,
  defaultOperator,
  operatorsFor,
  type AdvancedFilter,
  type FilterCondition,
  type FilterKind,
  type Operator,
} from '@/lib/advancedFilter';

export type FilterColumn = {
  id: string;
  label: string;
  kind: FilterKind;
  options: { value: string; count: number }[];
};

export type SavedFilterItem = {
  id: string;
  name: string;
  filter: AdvancedFilter;
  shared: boolean;
  mine: boolean;
  createdBy: { name: string | null; email: string } | null;
};

const newId = () => Math.random().toString(36).slice(2, 10);

export const prettyValue = (value: string) => value.replaceAll('_', ' ');

const inputClass =
  'h-9 w-full min-w-0 rounded-lg border border-gray-300 bg-white px-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20';

export default function FilterSidebar({
  open,
  onClose,
  columns,
  filter,
  onChange,
  matchCount,
  totalCount,
  savedFilters,
  activeFilterId,
  defaultFilterId,
  isModified,
  onApplySaved,
  onSaveNew,
  onUpdateSaved,
  onDeleteSaved,
  onToggleShared,
  onToggleDefault,
}: {
  open: boolean;
  onClose: () => void;
  columns: FilterColumn[];
  filter: AdvancedFilter;
  onChange: (filter: AdvancedFilter) => void;
  matchCount: number;
  totalCount: number;
  /** Undefined when saved filters aren't available (e.g. outside a team). */
  savedFilters?: SavedFilterItem[];
  activeFilterId: string | null;
  defaultFilterId: string | null;
  isModified: boolean;
  onApplySaved: (item: SavedFilterItem) => void;
  onSaveNew: (input: { name: string; shared: boolean }) => Promise<boolean>;
  onUpdateSaved: (item: SavedFilterItem) => void;
  onDeleteSaved: (item: SavedFilterItem) => void;
  onToggleShared: (item: SavedFilterItem) => void;
  onToggleDefault: (item: SavedFilterItem) => void;
}) {
  const columnById = useMemo(() => new Map(columns.map((column) => [column.id, column])), [columns]);
  const activeSaved = savedFilters?.find((item) => item.id === activeFilterId) ?? null;
  const hasConditions = filter.conditions.length > 0;

  const updateCondition = (id: string, patch: Partial<FilterCondition>) =>
    onChange({ ...filter, conditions: filter.conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)) });

  const addCondition = () => {
    const column = columns[0];
    if (!column) return;
    onChange({
      ...filter,
      conditions: [...filter.conditions, { id: newId(), columnId: column.id, operator: defaultOperator(column.kind) }],
    });
  };

  return (
    <SidebarModal
      open={open}
      onClose={onClose}
      title="Filters"
      description={`${matchCount} of ${totalCount} rows match${activeConditions(filter).length ? '' : ' — no filters applied'}`}
    >
      <div className="space-y-6">
        {savedFilters && (
          <section>
            <h3 className="label">Saved filters</h3>
            {savedFilters.length === 0 ? (
              <p className="text-sm text-gray-500">None yet. Build a filter below, then save it to reuse or share with your team.</p>
            ) : (
              <ul className="-mx-2 space-y-0.5">
                {savedFilters.map((item) => {
                  const active = item.id === activeFilterId;
                  const isDefault = item.id === defaultFilterId;
                  return (
                    <li
                      key={item.id}
                      className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 ${active ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
                    >
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onApplySaved(item)}>
                        <span className={`block truncate text-sm ${active ? 'font-semibold text-brand-700' : 'font-medium text-gray-800'}`}>
                          {item.name}
                          {active && isModified && <span className="ml-1.5 text-xs font-normal text-amber-600">· edited</span>}
                        </span>
                        <span className="flex items-center gap-1 truncate text-xs text-gray-500">
                          {item.shared && <Users size={11} className="shrink-0" />}
                          {item.mine ? (item.shared ? 'Shared with team' : 'Only you') : `Shared by ${item.createdBy?.name || item.createdBy?.email || 'a teammate'}`}
                          {' · '}
                          {activeConditions(item.filter).length} condition{activeConditions(item.filter).length === 1 ? '' : 's'}
                        </span>
                      </button>
                      <IconButton
                        label={isDefault ? 'Stop opening this page with this filter' : 'Open this page with this filter'}
                        onClick={() => onToggleDefault(item)}
                        active={isDefault}
                      >
                        <Star size={14} fill={isDefault ? 'currentColor' : 'none'} />
                      </IconButton>
                      {item.mine && (
                        <>
                          <IconButton
                            label={item.shared ? 'Stop sharing with the team' : 'Share with the team'}
                            onClick={() => onToggleShared(item)}
                            active={item.shared}
                            hover
                          >
                            <Share2 size={14} />
                          </IconButton>
                          <IconButton label={`Delete “${item.name}”`} onClick={() => onDeleteSaved(item)} hover danger>
                            <Trash2 size={14} />
                          </IconButton>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="label mb-0">Conditions</h3>
            {hasConditions && (
              <button type="button" className="text-xs font-medium text-gray-500 hover:text-gray-800" onClick={() => onChange({ ...filter, conditions: [] })}>
                Clear all
              </button>
            )}
          </div>

          {filter.conditions.length > 1 && (
            <div className="mb-3 flex items-center gap-2 text-sm text-gray-600">
              Show rows that match
              <div className="inline-flex rounded-lg border border-gray-200 p-0.5">
                {(['all', 'any'] as const).map((match) => (
                  <button
                    key={match}
                    type="button"
                    aria-pressed={filter.match === match}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                      filter.match === match ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                    onClick={() => onChange({ ...filter, match })}
                  >
                    {match}
                  </button>
                ))}
              </div>
              of these
            </div>
          )}

          <div className="space-y-2">
            {filter.conditions.map((condition, index) => {
              const column = columnById.get(condition.columnId);
              if (!column) return null;
              return (
                <ConditionEditor
                  key={condition.id}
                  prefix={index === 0 ? 'Where' : filter.match === 'any' ? 'Or' : 'And'}
                  condition={condition}
                  column={column}
                  columns={columns}
                  onChange={(patch) => updateCondition(condition.id, patch)}
                  onRemove={() => onChange({ ...filter, conditions: filter.conditions.filter((c) => c.id !== condition.id) })}
                />
              );
            })}
          </div>

          {columns.length === 0 ? (
            <p className="text-sm text-gray-500">This table has no filterable columns.</p>
          ) : (
            <button type="button" className="btn-secondary mt-3" onClick={addCondition}>
              <Plus size={14} />
              Add condition
            </button>
          )}
        </section>

        {savedFilters && hasConditions && (
          <SaveSection activeSaved={activeSaved} isModified={isModified} onSaveNew={onSaveNew} onUpdateSaved={onUpdateSaved} />
        )}
      </div>
    </SidebarModal>
  );
}

function IconButton({
  label,
  onClick,
  active,
  hover,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  hover?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${
        active ? 'text-amber-500' : 'text-gray-400'
      } ${danger ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-gray-200 hover:text-gray-700'} ${
        hover && !active ? 'opacity-0 focus:opacity-100 group-hover:opacity-100' : ''
      }`}
    >
      {children}
    </button>
  );
}

function ConditionEditor({
  prefix,
  condition,
  column,
  columns,
  onChange,
  onRemove,
}: {
  prefix: string;
  condition: FilterCondition;
  column: FilterColumn;
  columns: FilterColumn[];
  onChange: (patch: Partial<FilterCondition>) => void;
  onRemove: () => void;
}) {
  const input = OPERATORS[condition.operator].input;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{prefix}</span>
        <button
          type="button"
          aria-label="Remove condition"
          className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
          onClick={onRemove}
        >
          <X size={14} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select
          aria-label="Column"
          className={inputClass}
          value={condition.columnId}
          onChange={(e) => {
            const next = columns.find((c) => c.id === e.target.value)!;
            // A different column may have a different type: start its condition fresh.
            onChange({ columnId: next.id, operator: defaultOperator(next.kind), value: undefined, value2: undefined, values: undefined });
          }}
        >
          {columns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Operator"
          className={inputClass}
          value={condition.operator}
          onChange={(e) => onChange({ operator: e.target.value as Operator })}
        >
          {operatorsFor(column.kind).map((op) => (
            <option key={op} value={op}>
              {OPERATORS[op].label}
            </option>
          ))}
        </select>
      </div>

      {input === 'one' && (
        <div className="mt-2 flex items-center gap-2">
          <input
            aria-label="Value"
            className={inputClass}
            type={condition.operator === 'last_days' || column.kind === 'number' ? 'number' : column.kind === 'date' ? 'date' : 'text'}
            min={condition.operator === 'last_days' ? 1 : undefined}
            placeholder={column.kind === 'text' ? 'Value' : undefined}
            value={condition.value ?? ''}
            onChange={(e) => onChange({ value: e.target.value })}
          />
          {condition.operator === 'last_days' && <span className="text-sm text-gray-500">days</span>}
        </div>
      )}

      {input === 'two' && (
        <div className="mt-2 flex items-center gap-2">
          {(['value', 'value2'] as const).map((key, i) => (
            <div key={key} className="contents">
              {i === 1 && <span className="text-sm text-gray-500">and</span>}
              <input
                aria-label={i === 0 ? 'From' : 'To'}
                className={inputClass}
                type={column.kind === 'date' ? 'date' : 'number'}
                value={condition[key] ?? ''}
                onChange={(e) => onChange({ [key]: e.target.value })}
              />
            </div>
          ))}
        </div>
      )}

      {input === 'many' && <ValueChecklist column={column} selected={condition.values ?? []} onChange={(values) => onChange({ values })} />}
    </div>
  );
}

function ValueChecklist({
  column,
  selected,
  onChange,
}: {
  column: FilterColumn;
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const visible = column.options.filter((option) => prettyValue(option.value).toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-white">
      {column.options.length > 8 && (
        <div className="flex items-center gap-2 border-b border-gray-100 px-2.5 py-1.5">
          <Search size={13} className="text-gray-400" />
          <input
            aria-label={`Search ${column.label} values`}
            className="w-full bg-transparent text-sm focus:outline-none"
            placeholder="Search values…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}
      <div className="max-h-48 overflow-auto p-1">
        {visible.map((option) => (
          <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50">
            <Checkbox
              label={prettyValue(option.value) || '(empty)'}
              checked={selected.includes(option.value)}
              onChange={() =>
                onChange(selected.includes(option.value) ? selected.filter((v) => v !== option.value) : [...selected, option.value])
              }
            />
            <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{prettyValue(option.value) || '(empty)'}</span>
            <span className="text-xs tabular-nums text-gray-400">{option.count}</span>
          </label>
        ))}
        {visible.length === 0 && <p className="px-2 py-1.5 text-sm text-gray-400">No values match.</p>}
      </div>
    </div>
  );
}

function SaveSection({
  activeSaved,
  isModified,
  onSaveNew,
  onUpdateSaved,
}: {
  activeSaved: SavedFilterItem | null;
  isModified: boolean;
  onSaveNew: (input: { name: string; shared: boolean }) => Promise<boolean>;
  onUpdateSaved: (item: SavedFilterItem) => void;
}) {
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    if (await onSaveNew({ name: name.trim(), shared })) {
      setName('');
      setShared(false);
    }
    setSaving(false);
  };

  return (
    <section className="space-y-3 border-t border-gray-100 pt-5">
      {activeSaved?.mine && isModified && (
        <button type="button" className="btn-primary w-full" onClick={() => onUpdateSaved(activeSaved)}>
          Update “{activeSaved.name}”
        </button>
      )}
      <form onSubmit={save} className="space-y-2">
        <h3 className="label">Save as a new filter</h3>
        <div className="flex gap-2">
          <input
            aria-label="Filter name"
            className={inputClass}
            placeholder="e.g. Awaiting approval over $5k"
            maxLength={80}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="btn-secondary shrink-0" disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
          <Checkbox label="Share with the team" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          Share with the team
        </label>
      </form>
    </section>
  );
}

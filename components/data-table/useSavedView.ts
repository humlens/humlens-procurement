import { useCallback, useEffect, useRef, useState } from 'react';

import type { AdvancedFilter } from '@/lib/advancedFilter';

// The parts of a table's state that are saved against the signed-in user
// (see pages/api/me/table-preferences.ts), including the current filter, the
// saved filter it came from, and the user's default saved filter for the
// page. Search text, row selection, the
// current page, and expanded groups are deliberately left out — they belong
// to the moment, not to the user's preferred layout.
export type SavedView = {
  columnVisibility?: Record<string, boolean>;
  columnOrder?: string[];
  columnSizing?: Record<string, number>;
  columnPinning?: { start?: string[]; end?: string[] };
  sorting?: { id: string; desc: boolean }[];
  grouping?: string[];
  filter?: AdvancedFilter;
  activeFilterId?: string;
  defaultFilterId?: string;
  pageSize?: number;
  density?: 'comfortable' | 'compact';
};

const SAVE_DELAY_MS = 600;

const isEmpty = (value: unknown) =>
  value === undefined ||
  (Array.isArray(value) && value.length === 0) ||
  (typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === 0);

// Drops empty entries and sorts object keys, so two views that mean the same
// thing compare equal however they were built (Postgres JSONB reorders keys).
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, inner]) => [key, normalize(inner)] as const)
      .filter(([, inner]) => !isEmpty(inner))
      .sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries);
  }
  return value;
}

export const viewFingerprint = (view: SavedView) => JSON.stringify(normalize(view));
export const stableFingerprint = (value: unknown) => JSON.stringify(normalize(value));

// A local copy of the last known view, so the table paints in the user's
// layout straight away instead of flashing the default while the server
// responds. Storage can be unavailable (private mode, blocked site data).
const cacheKey = (tableKey: string) => `humlens:table:${tableKey}`;

function readCache(tableKey: string): SavedView | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(tableKey));
    return raw ? (JSON.parse(raw) as SavedView) : null;
  } catch {
    return null;
  }
}

function writeCache(tableKey: string, view: SavedView | null) {
  try {
    if (view) window.localStorage.setItem(cacheKey(tableKey), JSON.stringify(view));
    else window.localStorage.removeItem(cacheKey(tableKey));
  } catch {
    // The server copy is the one that matters.
  }
}

// Loads the user's saved view for a table and saves changes back, debounced
// so dragging a column edge or typing a filter doesn't send a request per
// keystroke. A view equal to the table's default is deleted rather than
// stored, so "Reset view" leaves nothing behind.
export function useSavedView({
  tableKey,
  defaultView,
  apply,
}: {
  tableKey: string;
  defaultView: SavedView;
  apply: (view: SavedView) => void;
}) {
  const url = `/api/me/table-preferences?table=${encodeURIComponent(tableKey)}`;
  const [loaded, setLoaded] = useState(false);
  const lastSaved = useRef<string | null>(null);
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; send: (keepalive?: boolean) => void } | null>(null);
  // Saves go out one at a time, in order: two overlapping requests (say a
  // resize's PUT and a Reset's DELETE) could otherwise finish out of order
  // and leave the older view stored.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const defaultFingerprint = viewFingerprint(defaultView);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    lastSaved.current = null;

    const cached = readCache(tableKey);
    if (cached) applyRef.current(cached);

    fetch(url, { headers: { Accept: 'application/json' } })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { data: { view: SavedView } | null } | null) => {
        if (cancelled || !body) return;
        const view = body.data?.view ?? null;
        // No saved view on the server: fall back to the default, even if a
        // stale local copy was applied a moment ago.
        applyRef.current(view ?? defaultView);
        writeCache(tableKey, view);
        lastSaved.current = viewFingerprint(view ?? defaultView);
      })
      .catch(() => {
        // Offline or signed out: keep whatever was applied from the cache.
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
    // defaultView is derived from constants; re-running on its identity would refetch every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableKey, url]);

  // Send any unsaved change right away when leaving the page.
  useEffect(
    () => () => {
      if (pending.current) {
        clearTimeout(pending.current.timer);
        pending.current.send(true);
        pending.current = null;
      }
    },
    [tableKey]
  );

  const save = useCallback(
    (view: SavedView) => {
      if (!loaded) return;
      const fingerprint = viewFingerprint(view);
      if (fingerprint === lastSaved.current) return;

      const isDefault = fingerprint === defaultFingerprint;
      writeCache(tableKey, isDefault ? null : view);

      if (pending.current) clearTimeout(pending.current.timer);
      const request = (keepalive: boolean) =>
        isDefault
          ? fetch(url, { method: 'DELETE', keepalive })
          : fetch(url, {
              method: 'PUT',
              keepalive,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ view }),
            });
      const send = (keepalive = false) => {
        // When leaving the page there's no time to wait for the queue.
        const run = () =>
          request(keepalive)
            .then((res) => {
              if (res.ok) lastSaved.current = fingerprint;
            })
            .catch(() => {
              // Retried on the next change.
            });
        queue.current = keepalive ? run() : queue.current.then(run);
      };
      pending.current = {
        timer: setTimeout(() => {
          pending.current = null;
          send();
        }, SAVE_DELAY_MS),
        send,
      };
    },
    [loaded, tableKey, url, defaultFingerprint]
  );

  return { loaded, save };
}

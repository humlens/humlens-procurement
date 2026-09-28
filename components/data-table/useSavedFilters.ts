import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { apiFetch, apiPost, apiPut } from '@/lib/fetcher';
import type { AdvancedFilter } from '@/lib/advancedFilter';
import type { SavedFilterItem } from './FilterSidebar';

// The team's saved filters for one list page (pages/api/teams/[slug]/saved-filters):
// the member's own plus those shared with the team. Only available on team
// pages — `items` is undefined elsewhere.
export function useSavedFilters(teamSlug: string | undefined, tableKey: string) {
  const queryClient = useQueryClient();
  const queryKey = ['saved-filters', teamSlug, tableKey];
  const base = `/api/teams/${teamSlug}/saved-filters`;

  const { data: items } = useQuery({
    queryKey,
    queryFn: () => apiFetch<SavedFilterItem[]>(`${base}?table=${encodeURIComponent(tableKey)}`),
    enabled: Boolean(teamSlug),
    staleTime: 30_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const fail = (err: unknown) => {
    toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    return null;
  };

  const create = (input: { name: string; filter: AdvancedFilter; shared: boolean }) =>
    apiPost<SavedFilterItem>(base, { tableKey, ...input })
      .then((item) => {
        toast.success(input.shared ? `Saved “${item.name}” and shared it with your team.` : `Saved “${item.name}”.`);
        refresh();
        return item;
      })
      .catch(fail);

  const update = (item: SavedFilterItem, patch: { name?: string; filter?: AdvancedFilter; shared?: boolean }, message: string) =>
    apiPut<SavedFilterItem>(`${base}/${item.id}`, patch)
      .then((updated) => {
        toast.success(message);
        refresh();
        return updated;
      })
      .catch(fail);

  const remove = (item: SavedFilterItem) =>
    apiFetch(`${base}/${item.id}`, { method: 'DELETE' })
      .then(() => {
        toast.success(`Deleted “${item.name}”.`);
        refresh();
        return true;
      })
      .catch((err) => fail(err) ?? false);

  return { items: teamSlug ? items : undefined, create, update, remove };
}

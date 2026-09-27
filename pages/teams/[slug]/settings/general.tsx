import { useEffect, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import SettingsLayout from '@/components/settings/SettingsLayout';
import { settingsTabs } from '@/components/settings/tabs';
import { apiFetch, apiPut } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

const currencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR', 'JPY'];

export default function GeneralSettings({ role }: { role: string }) {
  const router = useRouter();
  const slug = router.query.slug as string;
  const [form, setForm] = useState<{ name: string; currency: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: team } = useQuery({
    queryKey: ['team', slug],
    queryFn: () => apiFetch<any>(`/api/teams/${slug}`),
    enabled: !!slug,
  });

  useEffect(() => {
    if (team) setForm({ name: team.name, currency: team.currency });
  }, [team]);

  const canEdit = role === 'OWNER' || role === 'ADMIN';

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setLoading(true);
    try {
      await apiPut(`/api/teams/${slug}`, form);
      toast.success('Workspace updated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  if (!form) {
    return (
      <SettingsLayout tabs={settingsTabs} active="general">
        <p className="text-gray-400">Loading…</p>
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout tabs={settingsTabs} active="general" description="Basic details about this workspace.">
      <form onSubmit={save} className="card max-w-xl space-y-5">
        <div>
          <label className="label">Workspace name</label>
          <input
            className="input"
            required
            disabled={!canEdit}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>

        <div>
          <label className="label">Workspace URL</label>
          <div className="input bg-gray-50 text-gray-400">
            {typeof window !== 'undefined' ? window.location.origin : ''}/teams/{slug}
          </div>
          <p className="mt-1 text-xs text-gray-400">The workspace slug can&apos;t be changed after creation.</p>
        </div>

        <div>
          <label className="label">Default currency</label>
          <select
            className="input"
            disabled={!canEdit}
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
          >
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {canEdit ? (
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Saving…' : 'Save changes'}
          </button>
        ) : (
          <p className="text-xs text-gray-400">Only Owners and Admins can edit workspace settings.</p>
        )}
      </form>
    </SettingsLayout>
  );
}

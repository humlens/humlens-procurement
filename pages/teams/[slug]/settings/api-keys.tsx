import { useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Check, Copy, KeyRound } from 'lucide-react';

import SettingsLayout from '@/components/settings/SettingsLayout';
import { settingsTabs } from '@/components/settings/tabs';
import { apiFetch, apiPost } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  createdBy: { name: string; email: string } | null;
};

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never';

export default function ApiKeys() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const queryClient = useQueryClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4100';
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ name: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ['api-keys', slug],
    queryFn: () => apiFetch<ApiKey[]>(`/api/teams/${slug}/api-keys`),
    enabled: !!slug,
  });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const key = await apiPost<{ name: string; key: string }>(`/api/teams/${slug}/api-keys`, { name });
      setCreated(key);
      setCopied(false);
      setName('');
      queryClient.invalidateQueries({ queryKey: ['api-keys', slug] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (key: ApiKey) => {
    if (!window.confirm(`Revoke “${key.name}”? Anything using it stops working straight away.`)) return;
    try {
      await apiFetch(`/api/teams/${slug}/api-keys/${key.id}`, { method: 'DELETE' });
      toast.success('API key revoked.');
      queryClient.invalidateQueries({ queryKey: ['api-keys', slug] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  const copy = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(created.key).catch(() => undefined);
    setCopied(true);
  };

  return (
    <SettingsLayout
      tabs={settingsTabs}
      active="api-keys"
      description="Let other systems, such as your Humlens Commerce store, raise purchase requests and see what's been received. A key acts as the member who created it, with their role."
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {created && (
            <div className="card space-y-3 border-emerald-200 bg-emerald-50/60">
              <div>
                <h2 className="section-title">Copy your new key now</h2>
                <p className="mt-1 text-sm text-gray-600">
                  “{created.name}” won’t be shown again. Paste it into your store under Integrations → Operations.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <code className="min-w-0 flex-1 break-all rounded-md bg-white px-3 py-2 text-sm ring-1 ring-gray-200">{created.key}</code>
                <button className="btn-secondary shrink-0" type="button" onClick={copy}>
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}

          <div className="card">
            <h2 className="section-title mb-3">Active keys</h2>
            {isLoading ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : keys.length === 0 ? (
              <p className="text-sm text-gray-500">No API keys yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {keys.map((key) => (
                  <li key={key.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                    <KeyRound size={16} className="shrink-0 text-gray-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">{key.name}</p>
                      <p className="text-xs text-gray-500">
                        <code>{key.prefix}…</code> · created {formatDate(key.createdAt)}
                        {key.createdBy ? ` by ${key.createdBy.name || key.createdBy.email}` : ''} · last used {formatDate(key.lastUsedAt)}
                      </p>
                    </div>
                    <button className="btn-ghost text-red-600 hover:bg-red-50" type="button" onClick={() => revoke(key)}>
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card space-y-2">
            <h2 className="section-title">Using a key</h2>
            <p className="text-sm text-gray-600">
              Send it as <code className="rounded bg-gray-100 px-1">Authorization: Bearer &lt;key&gt;</code> to{' '}
              <code className="rounded bg-gray-100 px-1">{appUrl}/api/v1</code>. Endpoints: <code>GET /team</code>,{' '}
              <code>POST /requisitions</code>, <code>GET /requisitions</code>, <code>GET /goods-receipts</code>.
            </p>
          </div>
        </div>

        <form onSubmit={create} className="card h-fit space-y-3">
          <h2 className="section-title">Create a key</h2>
          <div>
            <label className="label" htmlFor="api-key-name">
              Name
            </label>
            <input
              id="api-key-name"
              className="input"
              required
              maxLength={100}
              placeholder="e.g. Online store"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <button className="btn-primary w-full" type="submit" disabled={creating}>
            {creating ? 'Creating…' : 'Create key'}
          </button>
        </form>
      </div>
    </SettingsLayout>
  );
}

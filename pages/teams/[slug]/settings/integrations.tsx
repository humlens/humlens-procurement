import { useEffect, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Role } from '@prisma/client';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Link2, RotateCw, Store } from 'lucide-react';

import SettingsLayout from '@/components/settings/SettingsLayout';
import { settingsTabs } from '@/components/settings/tabs';
import Badge from '@/components/Badge';
import { apiFetch, apiPost, apiPut } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';
import { can } from '@/lib/permissions';
import { integrationsConfig } from '@/lib/integrationsConfig';
import AccountingCard from '@/components/settings/AccountingCard';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

type Connection = {
  kind: 'INVENTORY' | 'PROCUREMENT' | 'COMMERCE' | 'ACCOUNTING' | 'SUPPLIER';
  url: string;
  secretHint: string;
  options: Record<string, boolean | string>;
  lastSuccessAt: string | null;
  lastError: string | null;
};

type OutboundEvent = {
  id: string;
  target: Connection['kind'];
  kind: string;
  reference: string;
  status: 'PENDING' | 'DELIVERED' | 'FAILED';
  attempts: number;
  lastError: string | null;
  createdAt: string;
  deliveredAt: string | null;
};

type Overview = {
  connections: Connection[];
  health: { failed: number; pending: number; lastDeliveredAt: string | null };
  events: OutboundEvent[];
};

const kindLabels: Record<string, string> = {
  'stock.changed': 'Stock changed',
  'requisition.raise': 'Purchase request',
  'requisition.updated': 'Request status',
  'receipt.created': 'Goods received',
  'stock.receipt': 'Goods received into stock',
  'item-costs': 'Item costs',
  'accounting.vendor': 'Vendor',
  'accounting.purchase-order': 'Purchase order',
  'accounting.bill': 'Bill',
  'accounting.payment': 'Payment',
  'supplier.order': 'cXML order',
};
const targetLabels: Record<Connection['kind'], string> = {
  INVENTORY: 'Inventory',
  PROCUREMENT: 'Procurement',
  COMMERCE: 'Store',
  ACCOUNTING: 'Accounting',
  SUPPLIER: 'Supplier',
};

const when = (value: string | null) => (value ? new Date(value).toLocaleString() : '—');

export default function Integrations({ role }: { role: Role }) {
  const router = useRouter();
  const slug = router.query.slug as string;
  const queryClient = useQueryClient();
  const canManage = can(role, 'team', 'update');
  const { target, targetName, toggles, keyHelp, thisApp } = integrationsConfig;

  const { data, isLoading } = useQuery({
    queryKey: ['integrations', slug],
    queryFn: () => apiFetch<Overview>(`/api/teams/${slug}/integrations`),
    enabled: !!slug,
    refetchInterval: 15_000,
  });
  const connection = data?.connections.find((c) => c.kind === target);
  const store = data?.connections.find((c) => c.kind === 'COMMERCE');

  const [url, setUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [options, setOptions] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setUrl(connection?.url ?? '');
    setOptions(Object.fromEntries(toggles.map((t) => [t.key, (connection?.options[t.key] as boolean | undefined) ?? t.default])));
  }, [connection, toggles]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['integrations', slug] });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await apiPut<{ connectedTo: string }>(`/api/teams/${slug}/integrations`, { url, apiKey: apiKey || undefined, options });
      toast.success(`Connected to ${result.connectedTo} in ${targetName}.`);
      setApiKey('');
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async (kind: Connection['kind'], label: string) => {
    if (!window.confirm(`Disconnect ${label}? Messages waiting to be sent to it will fail.`)) return;
    await apiFetch(`/api/teams/${slug}/integrations?kind=${kind}`, { method: 'DELETE' }).catch((err) => toast.error(err.message));
    refresh();
  };

  const act = async (event: OutboundEvent, action: 'retry' | 'dismiss') => {
    try {
      const result = await apiPost<OutboundEvent | { dismissed: true }>(`/api/teams/${slug}/integrations/events/${event.id}`, { action });
      if (action === 'retry') {
        const status = (result as OutboundEvent).status;
        if (status === 'DELIVERED') toast.success('Sent.');
        else toast.error((result as OutboundEvent).lastError || 'Still failing — it will be retried.');
      }
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  return (
    <SettingsLayout
      tabs={settingsTabs}
      active="integrations"
      description={`Connect ${thisApp} to the other Humlens apps. Every message between them is queued and retried until it arrives, and anything that keeps failing shows up here.`}
    >
      <div className="space-y-6">
        {data && data.health.failed > 0 && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">
                {data.health.failed} message{data.health.failed === 1 ? '' : 's'} to connected apps couldn’t be delivered.
              </p>
              <p className="mt-0.5 text-red-700">Fix the cause (often an expired API key or an app that’s down), then retry them below.</p>
            </div>
          </div>
        )}

        <form onSubmit={save} className="card space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="section-title flex items-center gap-2">
                <Link2 size={15} className="text-gray-400" />
                {targetName}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {connection ? (
                  <>
                    Connected to <span className="font-medium text-gray-700">{connection.url}</span> with key{' '}
                    <code className="rounded bg-gray-100 px-1">{connection.secretHint}</code>
                  </>
                ) : (
                  `Not connected. ${keyHelp}`
                )}
              </p>
            </div>
            {connection && <ConnectionStatus connection={connection} />}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="integration-url">
                Address
              </label>
              <input
                id="integration-url"
                className="input"
                placeholder="https://procurement.example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={!canManage}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="integration-key">
                API key
              </label>
              <input
                id="integration-key"
                className="input"
                type="password"
                autoComplete="off"
                placeholder={connection ? 'Unchanged' : `${integrationsConfig.keyPrefix}…`}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={!canManage}
                required={!connection}
              />
            </div>
          </div>

          <div className="space-y-2.5">
            {toggles.map((toggle) => {
              const disabled = !canManage || (toggle.requires ? !options[toggle.requires] : false);
              return (
                <label key={toggle.key} className={`flex items-start gap-2.5 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-brand-600"
                    checked={Boolean(options[toggle.key])}
                    disabled={disabled}
                    onChange={(e) => setOptions((current) => ({ ...current, [toggle.key]: e.target.checked }))}
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-800">{toggle.label}</span>
                    <span className="block text-xs text-gray-500">{toggle.description}</span>
                  </span>
                </label>
              );
            })}
          </div>

          {canManage && (
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" type="submit" disabled={saving}>
                {saving ? 'Checking…' : connection ? 'Save' : 'Test and connect'}
              </button>
              {connection && (
                <button type="button" className="btn-ghost text-red-600 hover:bg-red-50" onClick={() => disconnect(target, targetName)}>
                  Disconnect
                </button>
              )}
            </div>
          )}
        </form>

        <AccountingCard slug={slug} canManage={canManage} />

        <div className="card space-y-2">
          <h2 className="section-title flex items-center gap-2">
            <Store size={15} className="text-gray-400" />
            Store notifications
          </h2>
          {store ? (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="text-sm text-gray-600">
                Your Humlens Commerce store at <span className="font-medium text-gray-800">{new URL(store.url).origin}</span> is told
                straight away when stock changes here, so it never sells what’s gone.
              </p>
              <div className="flex items-center gap-2">
                <ConnectionStatus connection={store} />
                {canManage && (
                  <button type="button" className="btn-ghost text-xs text-red-600 hover:bg-red-50" onClick={() => disconnect('COMMERCE', 'the store')}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              No store registered. In Humlens Commerce, open Integrations → Operations and connect this app — the store registers itself here.
            </p>
          )}
        </div>

        <div className="card p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3">
            <h2 className="section-title">Messages to connected apps and systems</h2>
            {data && (
              <p className="text-xs text-gray-500">
                {data.health.pending} waiting · {data.health.failed} failed · last delivered {when(data.health.lastDeliveredAt)}
              </p>
            )}
          </div>
          {isLoading ? (
            <p className="px-5 py-4 text-sm text-gray-500">Loading…</p>
          ) : !data?.events.length ? (
            <p className="px-5 py-4 text-sm text-gray-500">Nothing sent yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {data.events.map((event) => (
                <li key={event.id} className="flex flex-wrap items-start gap-x-4 gap-y-1.5 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800">
                      {kindLabels[event.kind] ?? event.kind} → {targetLabels[event.target]}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {event.reference} · {when(event.createdAt)}
                      {event.attempts > 1 ? ` · ${event.attempts} attempts` : ''}
                    </p>
                    {event.lastError && event.status !== 'DELIVERED' && <p className="mt-0.5 text-xs text-red-600">{event.lastError}</p>}
                  </div>
                  <Badge status={event.status} />
                  {canManage && event.status !== 'DELIVERED' && (
                    <div className="flex gap-1">
                      <button type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={() => act(event, 'retry')}>
                        <RotateCw size={12} />
                        Retry now
                      </button>
                      {event.status === 'FAILED' && (
                        <button type="button" className="btn-ghost px-2.5 py-1 text-xs" onClick={() => act(event, 'dismiss')}>
                          Dismiss
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SettingsLayout>
  );
}

function ConnectionStatus({ connection }: { connection: Connection }) {
  if (connection.lastError) {
    return (
      <span className="inline-flex max-w-xs items-center gap-1 text-xs text-red-600" title={connection.lastError}>
        <AlertTriangle size={13} className="shrink-0" />
        <span className="truncate">{connection.lastError}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
      <CheckCircle2 size={13} />
      {connection.lastSuccessAt ? `Working · ${new Date(connection.lastSuccessAt).toLocaleString()}` : 'Connected'}
    </span>
  );
}

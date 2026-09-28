import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, ShoppingCart } from 'lucide-react';

import { apiFetch, apiPut } from '@/lib/fetcher';

type Catalog = {
  protocol: 'CXML' | 'OCI';
  setupUrl: string;
  fromDomain: string;
  fromIdentity: string | null;
  toDomain: string;
  toIdentity: string | null;
  senderIdentity: string | null;
  username: string | null;
  hasSecret: boolean;
  orderUrl: string | null;
  sendOrders: boolean;
  enabled: boolean;
  lastError: string | null;
};

type Overview = {
  catalog: Catalog | null;
  lastSession: { status: string; createdAt: string; itemCount: number; error: string | null } | null;
  returnUrlExample: string;
};

const empty = {
  protocol: 'CXML' as Catalog['protocol'],
  setupUrl: '',
  fromDomain: 'NetworkID',
  fromIdentity: '',
  toDomain: 'NetworkID',
  toIdentity: '',
  senderIdentity: '',
  username: '',
  secret: '',
  orderUrl: '',
  sendOrders: false,
  enabled: true,
};

// The vendor's PunchOut catalog: where requesters shop the supplier's own
// site, and (cXML) where issued POs are sent as orders.
export default function PunchoutCard({ slug, vendorId, canEdit }: { slug: string; vendorId: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const key = ['punchout', slug, vendorId];
  const { data } = useQuery({ queryKey: key, queryFn: () => apiFetch<Overview>(`/api/teams/${slug}/vendors/${vendorId}/punchout`), enabled: !!slug && !!vendorId });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const c = data?.catalog;
    if (!c) return setForm(empty);
    setForm({
      protocol: c.protocol,
      setupUrl: c.setupUrl,
      fromDomain: c.fromDomain,
      fromIdentity: c.fromIdentity ?? '',
      toDomain: c.toDomain,
      toIdentity: c.toIdentity ?? '',
      senderIdentity: c.senderIdentity ?? '',
      username: c.username ?? '',
      secret: '',
      orderUrl: c.orderUrl ?? '',
      sendOrders: c.sendOrders,
      enabled: c.enabled,
    });
  }, [data?.catalog]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ['punchout-catalogs', slug] });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiPut(`/api/teams/${slug}/vendors/${vendorId}/punchout`, { ...form, secret: form.secret || undefined });
      toast.success('PunchOut catalog saved.');
      setEditing(false);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Remove this PunchOut catalog? Requesters won’t be able to shop it.')) return;
    await apiFetch(`/api/teams/${slug}/vendors/${vendorId}/punchout`, { method: 'DELETE' }).catch((err) => toast.error(err.message));
    setEditing(false);
    refresh();
  };

  const catalog = data?.catalog;
  const cxml = form.protocol === 'CXML';

  return (
    <div className="card">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-medium">
            <ShoppingCart size={15} className="text-gray-400" />
            PunchOut catalog
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">Requesters shop this supplier’s own site; the cart comes back as requisition lines.</p>
        </div>
        {canEdit && !editing && (
          <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setEditing(true)}>
            {catalog ? 'Edit' : 'Set up'}
          </button>
        )}
      </div>

      {!editing && catalog && (
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">Protocol</dt>
            <dd>{catalog.protocol === 'CXML' ? 'cXML' : 'SAP OCI'}{catalog.enabled ? '' : ' · switched off'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Orders</dt>
            <dd>{catalog.sendOrders ? 'Issued POs are sent as cXML orders' : 'Sent as usual (email or portal)'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-gray-500">Setup address</dt>
            <dd className="truncate">{catalog.setupUrl}</dd>
          </div>
          <div className="sm:col-span-2">
            {catalog.lastError ? (
              <p className="flex items-start gap-1.5 text-xs text-red-600">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                {catalog.lastError}
              </p>
            ) : data?.lastSession ? (
              <p className="flex items-center gap-1.5 text-xs text-emerald-700">
                <CheckCircle2 size={13} />
                Last used {new Date(data.lastSession.createdAt).toLocaleString()}
                {data.lastSession.status === 'RETURNED' ? ` · ${data.lastSession.itemCount} item(s) brought back` : ''}
              </p>
            ) : (
              <p className="text-xs text-gray-500">Not used yet.</p>
            )}
          </div>
        </dl>
      )}

      {!editing && !catalog && <p className="text-sm text-gray-500">Not set up.</p>}

      {editing && (
        <form onSubmit={save} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="po-protocol">Protocol</label>
              <select id="po-protocol" className="input" value={form.protocol} onChange={(e) => set('protocol', e.target.value as Catalog['protocol'])}>
                <option value="CXML">cXML (Ariba, Coupa-style suppliers)</option>
                <option value="OCI">SAP OCI</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="po-setup">{cxml ? 'PunchOut setup address' : 'Catalog address'}</label>
              <input id="po-setup" className="input" required placeholder="https://supplier.example.com/punchout" value={form.setupUrl} onChange={(e) => set('setupUrl', e.target.value)} />
            </div>
          </div>

          {cxml ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="po-from">From identity (you)</label>
                <div className="flex gap-2">
                  <input className="input w-28" aria-label="From domain" value={form.fromDomain} onChange={(e) => set('fromDomain', e.target.value)} />
                  <input id="po-from" className="input" required value={form.fromIdentity} onChange={(e) => set('fromIdentity', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="po-to">To identity (supplier)</label>
                <div className="flex gap-2">
                  <input className="input w-28" aria-label="To domain" value={form.toDomain} onChange={(e) => set('toDomain', e.target.value)} />
                  <input id="po-to" className="input" required value={form.toIdentity} onChange={(e) => set('toIdentity', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="po-sender">Sender identity <span className="font-normal text-gray-400">(if different)</span></label>
                <input id="po-sender" className="input" value={form.senderIdentity} onChange={(e) => set('senderIdentity', e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="po-secret">Shared secret</label>
                <input id="po-secret" className="input" type="password" autoComplete="off" placeholder={catalog?.hasSecret ? 'Unchanged' : ''} value={form.secret} onChange={(e) => set('secret', e.target.value)} />
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="po-user">Username</label>
                <input id="po-user" className="input" value={form.username} onChange={(e) => set('username', e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="po-pass">Password</label>
                <input id="po-pass" className="input" type="password" autoComplete="off" placeholder={catalog?.hasSecret ? 'Unchanged' : ''} value={form.secret} onChange={(e) => set('secret', e.target.value)} />
              </div>
            </div>
          )}

          {cxml && (
            <div className="space-y-2 rounded-lg bg-gray-50 p-3">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={form.sendOrders} onChange={(e) => set('sendOrders', e.target.checked)} />
                <span>
                  <span className="block text-sm font-medium text-gray-800">Send issued POs to the supplier as cXML orders</span>
                  <span className="block text-xs text-gray-500">Each PO is delivered to the order address below when it’s issued, and retried until the supplier accepts it.</span>
                </span>
              </label>
              {form.sendOrders && (
                <input className="input" required placeholder="https://supplier.example.com/cxml/order" value={form.orderUrl} onChange={(e) => set('orderUrl', e.target.value)} aria-label="Order address" />
              )}
            </div>
          )}

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />
            Requesters can shop this catalog
          </label>

          <p className="text-xs text-gray-500">
            Give the supplier this return address pattern if they ask which addresses to accept carts from:{' '}
            <code className="break-all rounded bg-gray-100 px-1">{data?.returnUrlExample}</code>
          </p>

          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save catalog'}</button>
            <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
            {catalog && (
              <button type="button" className="btn-ghost ml-auto text-red-600 hover:bg-red-50" onClick={remove}>Remove</button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

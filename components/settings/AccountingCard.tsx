import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Landmark, RefreshCw } from 'lucide-react';

import { apiFetch, apiPost, apiPut } from '@/lib/fetcher';

type Provider = 'QUICKBOOKS' | 'XERO' | 'SAGE' | 'NETSUITE';
type Options = {
  expenseAccountId?: string;
  expenseAccountName?: string;
  paymentAccountId?: string;
  paymentAccountName?: string;
  subsidiaryId?: string;
  taxRateId?: string;
  syncPurchaseOrders?: boolean;
  syncBills?: boolean;
  syncPayments?: boolean;
  pullPayments?: boolean;
};
type Overview = {
  redirectUri: string;
  appConfigured: Record<Provider, boolean>;
  connection: {
    provider: Provider;
    companyName: string | null;
    signedIn: boolean;
    sandbox: boolean;
    options: Options;
    lastSuccessAt: string | null;
    lastError: string | null;
  } | null;
  synced: Partial<Record<'VENDOR' | 'PURCHASE_ORDER' | 'BILL' | 'PAYMENT', number>>;
};
type Account = { id: string; name: string; code?: string };

const providers: { id: Provider; name: string; note: string }[] = [
  { id: 'QUICKBOOKS', name: 'QuickBooks Online', note: 'Vendors, POs, bills and bill payments' },
  { id: 'XERO', name: 'Xero', note: 'Contacts, POs, bills and payments' },
  { id: 'SAGE', name: 'Sage Accounting', note: 'Vendors, purchase invoices and payments' },
  { id: 'NETSUITE', name: 'NetSuite', note: 'Vendors, POs, vendor bills and payments' },
];

const toggles: { key: keyof Options; label: string; description: string; not?: Provider }[] = [
  { key: 'syncPurchaseOrders', label: 'Send purchase orders when they’re issued', description: 'So committed spend shows in the accounting system before the bill arrives.', not: 'SAGE' },
  { key: 'syncBills', label: 'Send approved invoices as bills', description: 'Posted to the expense account below, with tax as its own line so totals match exactly.' },
  { key: 'syncPayments', label: 'Send payments when they’re marked paid', description: 'Applied to the bill, out of the payment account below.' },
  { key: 'pullPayments', label: 'Mark invoices paid when their bill is paid there', description: 'Checked every 30 minutes; the payment and budget spend are recorded here.' },
];

// Settings → Integrations → Accounting: connect QuickBooks, Xero, Sage or
// NetSuite, choose where records post, and see what has synced.
export default function AccountingCard({ slug, canManage }: { slug: string; canManage: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const key = ['accounting', slug];
  const { data } = useQuery({ queryKey: key, queryFn: () => apiFetch<Overview>(`/api/teams/${slug}/accounting`), enabled: !!slug });
  const connection = data?.connection?.signedIn ? data.connection : null;

  const [provider, setProvider] = useState<Provider>('QUICKBOOKS');
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [sandbox, setSandbox] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [options, setOptions] = useState<Options>({});

  useEffect(() => setOptions(connection?.options ?? {}), [connection?.options]);

  // Back from the provider's sign-in page.
  useEffect(() => {
    const { accounting, accounting_error: error, ...rest } = router.query;
    if (!accounting && !error) return;
    if (accounting === 'connected') toast.success('Accounting system connected. Choose the accounts below.', { id: 'accounting-return' });
    if (typeof error === 'string') toast.error(error, { id: 'accounting-return', duration: 8000 });
    void router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
    queryClient.invalidateQueries({ queryKey: key });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.accounting, router.query.accounting_error]);

  const accounts = useQuery({
    queryKey: ['accounting-accounts', slug, connection?.companyName],
    queryFn: () => apiFetch<{ expense: Account[]; bank: Account[] }>(`/api/teams/${slug}/accounting/accounts`),
    enabled: !!connection && canManage,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const run = async (label: string, work: () => Promise<void>) => {
    setBusy(label);
    try {
      await work();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  const connect = (e: React.FormEvent) => {
    e.preventDefault();
    return run('connect', async () => {
      if (provider === 'NETSUITE') {
        const result = await apiPost<{ companyName: string }>(`/api/teams/${slug}/accounting/connect`, { provider, ...creds });
        toast.success(`Connected to ${result.companyName}.`);
        setCreds({});
        refresh();
      } else {
        const { authorizeUrl } = await apiPost<{ authorizeUrl: string }>(`/api/teams/${slug}/accounting/connect`, {
          provider,
          clientId: creds.clientId || undefined,
          clientSecret: creds.clientSecret || undefined,
          sandbox,
        });
        window.location.assign(authorizeUrl);
      }
    });
  };

  const saveOptions = () =>
    run('save', async () => {
      await apiPut(`/api/teams/${slug}/accounting`, options);
      toast.success('Saved.');
      refresh();
    });

  const syncExisting = () =>
    run('sync', async () => {
      const { queued } = await apiPost<{ queued: number }>(`/api/teams/${slug}/accounting/sync`);
      toast.success(queued ? `${queued} record(s) queued. Progress shows under messages below.` : 'Everything is already in sync.');
      queryClient.invalidateQueries({ queryKey: ['integrations', slug] });
    });

  const disconnect = () =>
    run('disconnect', async () => {
      if (!window.confirm('Disconnect the accounting system? Records already sent stay there.')) return;
      await apiFetch(`/api/teams/${slug}/accounting`, { method: 'DELETE' });
      refresh();
    });

  const pick = (list: Account[] | undefined, field: 'expense' | 'payment', id: string) => {
    const account = list?.find((a) => a.id === id);
    setOptions((o) => ({ ...o, [`${field}AccountId`]: id || undefined, [`${field}AccountName`]: account?.name }));
  };
  const label = (a: Account) => (a.code ? `${a.code} · ${a.name}` : a.name);
  const needsSetup = connection && (!options.expenseAccountId || (options.syncPayments && !options.paymentAccountId));

  return (
    <div className="card space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="section-title flex items-center gap-2">
            <Landmark size={15} className="text-gray-400" />
            Accounting and ERP
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {connection
              ? <>Connected to <span className="font-medium text-gray-700">{connection.companyName}</span> in {providers.find((p) => p.id === connection.provider)?.name}{connection.sandbox ? ' (sandbox)' : ''}.</>
              : 'Send purchase orders, bills and payments to QuickBooks, Xero, Sage or NetSuite as they’re approved here, and bring paid bills back.'}
          </p>
        </div>
        {connection &&
          (connection.lastError ? (
            <span className="inline-flex max-w-xs items-center gap-1 text-xs text-red-600" title={connection.lastError}>
              <AlertTriangle size={13} className="shrink-0" />
              <span className="truncate">{connection.lastError}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
              <CheckCircle2 size={13} />
              {connection.lastSuccessAt ? `Working · ${new Date(connection.lastSuccessAt).toLocaleString()}` : 'Connected'}
            </span>
          ))}
      </div>

      {!connection && canManage && (
        <form onSubmit={connect} className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {providers.map((p) => (
              <label key={p.id} className={`cursor-pointer rounded-xl border p-3 text-sm transition ${provider === p.id ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500' : 'border-gray-200 hover:border-gray-300'}`}>
                <input type="radio" name="accounting-provider" className="sr-only" checked={provider === p.id} onChange={() => { setProvider(p.id); setCreds({}); }} />
                <span className="block font-medium text-gray-900">{p.name}</span>
                <span className="block text-xs text-gray-500">{p.note}</span>
              </label>
            ))}
          </div>

          {provider === 'NETSUITE' ? (
            <>
              <p className="text-xs text-gray-500">
                In NetSuite, enable REST web services and token-based authentication, create an integration record and an access token for a role that can create vendors, purchase orders, vendor bills and payments.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ['accountId', 'Account ID', '1234567 or 1234567_SB1'],
                  ['consumerKey', 'Consumer key', ''],
                  ['consumerSecret', 'Consumer secret', ''],
                  ['tokenId', 'Token ID', ''],
                  ['tokenSecret', 'Token secret', ''],
                ].map(([field, text, placeholder]) => (
                  <div key={field}>
                    <label className="label" htmlFor={`ns-${field}`}>{text}</label>
                    <input
                      id={`ns-${field}`}
                      className="input"
                      required
                      autoComplete="off"
                      type={field.toLowerCase().includes('secret') ? 'password' : 'text'}
                      placeholder={placeholder}
                      value={creds[field] ?? ''}
                      onChange={(e) => setCreds((c) => ({ ...c, [field]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-gray-500">
                Register an app in the {providers.find((p) => p.id === provider)?.name} developer portal and add this redirect address:{' '}
                <code className="break-all rounded bg-gray-100 px-1">{data?.redirectUri}</code>
              </p>
              {data?.appConfigured[provider] ? (
                <p className="text-xs text-emerald-700">This server already has an app configured for it. You’ll just sign in.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="acc-client-id">Client ID</label>
                    <input id="acc-client-id" className="input" required autoComplete="off" value={creds.clientId ?? ''} onChange={(e) => setCreds((c) => ({ ...c, clientId: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label" htmlFor="acc-client-secret">Client secret</label>
                    <input id="acc-client-secret" className="input" type="password" required autoComplete="off" value={creds.clientSecret ?? ''} onChange={(e) => setCreds((c) => ({ ...c, clientSecret: e.target.value }))} />
                  </div>
                </div>
              )}
              {provider === 'QUICKBOOKS' && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)} />
                  Sandbox company
                </label>
              )}
            </>
          )}

          <button className="btn-primary" type="submit" disabled={busy !== null}>
            {busy === 'connect' ? 'Connecting…' : provider === 'NETSUITE' ? 'Test and connect' : `Sign in to ${providers.find((p) => p.id === provider)?.name}`}
          </button>
        </form>
      )}

      {!connection && !canManage && <p className="text-sm text-gray-500">Not connected. An owner or admin can connect it.</p>}

      {connection && (
        <>
          {needsSetup && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              Choose the expense account{options.syncPayments ? ' and payment account' : ''} before anything can sync.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="acc-expense">Bills and POs post to</label>
              <select id="acc-expense" className="input" disabled={!canManage || accounts.isLoading} value={options.expenseAccountId ?? ''} onChange={(e) => pick(accounts.data?.expense, 'expense', e.target.value)}>
                <option value="">{accounts.isLoading ? 'Loading accounts…' : options.expenseAccountName ?? 'Choose an expense account'}</option>
                {accounts.data?.expense.map((a) => <option key={a.id} value={a.id}>{label(a)}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="acc-bank">Payments come from</label>
              <select id="acc-bank" className="input" disabled={!canManage || accounts.isLoading} value={options.paymentAccountId ?? ''} onChange={(e) => pick(accounts.data?.bank, 'payment', e.target.value)}>
                <option value="">{accounts.isLoading ? 'Loading accounts…' : options.paymentAccountName ?? 'Choose a bank account'}</option>
                {accounts.data?.bank.map((a) => <option key={a.id} value={a.id}>{label(a)}</option>)}
              </select>
            </div>
            {connection.provider === 'NETSUITE' && (
              <div>
                <label className="label" htmlFor="acc-subsidiary">Subsidiary ID for new vendors <span className="font-normal text-gray-400">(OneWorld)</span></label>
                <input id="acc-subsidiary" className="input" disabled={!canManage} value={options.subsidiaryId ?? ''} onChange={(e) => setOptions((o) => ({ ...o, subsidiaryId: e.target.value || undefined }))} />
              </div>
            )}
            {connection.provider === 'SAGE' && (
              <div>
                <label className="label" htmlFor="acc-tax">Tax rate ID for purchase lines <span className="font-normal text-gray-400">(if your region needs one)</span></label>
                <input id="acc-tax" className="input" disabled={!canManage} placeholder="e.g. GB_ZERO" value={options.taxRateId ?? ''} onChange={(e) => setOptions((o) => ({ ...o, taxRateId: e.target.value || undefined }))} />
              </div>
            )}
          </div>
          {accounts.error && <p className="text-xs text-red-600">{(accounts.error as Error).message}</p>}

          <div className="space-y-2.5">
            {toggles
              .filter((t) => t.not !== connection.provider)
              .map((t) => (
                <label key={t.key} className={`flex items-start gap-2.5 ${canManage ? 'cursor-pointer' : 'opacity-60'}`}>
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" disabled={!canManage} checked={Boolean(options[t.key])} onChange={(e) => setOptions((o) => ({ ...o, [t.key]: e.target.checked }))} />
                  <span>
                    <span className="block text-sm font-medium text-gray-800">{t.label}</span>
                    <span className="block text-xs text-gray-500">{t.description}</span>
                  </span>
                </label>
              ))}
            {connection.provider === 'SAGE' && <p className="text-xs text-gray-500">Sage’s API has no purchase orders, so POs stay here; their bills and payments sync.</p>}
          </div>

          <p className="text-xs text-gray-500">
            Synced so far: {data?.synced.VENDOR ?? 0} vendors · {data?.synced.PURCHASE_ORDER ?? 0} POs · {data?.synced.BILL ?? 0} bills · {data?.synced.PAYMENT ?? 0} payments
          </p>

          {canManage && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary" onClick={saveOptions} disabled={busy !== null}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
              <button type="button" className="btn-secondary" onClick={syncExisting} disabled={busy !== null || Boolean(needsSetup)}>
                <RefreshCw size={14} className={busy === 'sync' ? 'animate-spin' : ''} />
                Send existing records
              </button>
              <button type="button" className="btn-ghost text-red-600 hover:bg-red-50" onClick={disconnect} disabled={busy !== null}>Disconnect</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

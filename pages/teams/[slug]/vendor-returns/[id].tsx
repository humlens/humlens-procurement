import { useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import type { Role } from '@prisma/client';

import Layout from '@/components/Layout';
import Badge from '@/components/Badge';
import { apiFetch, apiPost } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';
import { can } from '@/lib/permissions';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

export default function VendorReturnDetail({ role }: { role: Role }) {
  const router = useRouter();
  const slug = router.query.slug as string;
  const id = router.query.id as string;
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');

  const { data: rtv } = useQuery({
    queryKey: ['vendor-return', slug, id],
    queryFn: () => apiFetch<any>(`/api/teams/${slug}/vendor-returns/${id}`),
    enabled: !!slug && !!id,
  });

  const act = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      await apiPost(`/api/teams/${slug}/vendor-returns/${id}/action`, body);
      toast.success(done);
      setCreditOpen(false);
      queryClient.invalidateQueries({ queryKey: ['vendor-return', slug, id] });
      queryClient.invalidateQueries({ queryKey: ['vendor-returns', slug] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (!rtv) {
    return (
      <Layout title="Return to vendor">
        <p className="text-gray-400">Loading…</p>
      </Layout>
    );
  }

  const due = rtv.lineItems.reduce((sum: number, li: any) => sum + Number(li.quantity) * Number(li.unitPrice), 0);
  const mayUpdate = can(role, 'vendor_return', 'update');
  const open = rtv.status === 'DRAFT' || rtv.status === 'SENT';

  return (
    <Layout title={rtv.returnNumber}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Badge status={rtv.status} />
        <span className="text-sm text-gray-500">
          {rtv.vendor?.name} ·{' '}
          <Link href={`/teams/${slug}/purchase-orders/${rtv.purchaseOrder.id}`} className="text-brand-700 hover:underline">
            {rtv.purchaseOrder.poNumber}
          </Link>{' '}
          · received {new Date(rtv.receipt.receivedAt).toLocaleDateString()}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {rtv.reason && (
            <div className="card">
              <h2 className="mb-2 font-medium">Reason</h2>
              <p className="text-sm text-gray-600">{rtv.reason}</p>
            </div>
          )}

          <div className="card">
            <h2 className="mb-3 font-medium">Returned items</h2>
            <table className="page-table">
              <thead className="text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="pb-2">Description</th>
                  <th className="pb-2">Qty</th>
                  <th className="pb-2">Condition</th>
                  <th className="pb-2">Unit price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rtv.lineItems.map((li: any) => (
                  <tr key={li.id}>
                    <td className="py-2">{li.poLineItem?.description}</td>
                    <td className="py-2">
                      {Number(li.quantity)} {li.poLineItem?.unit}
                    </td>
                    <td className="py-2">{li.condition || '—'}</td>
                    <td className="py-2">{Number(li.unitPrice).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-sm text-gray-600">
              Credit due: {rtv.currency} {due.toLocaleString()}
              {rtv.creditAmount !== null && (
                <>
                  {' · '}credited {rtv.currency} {Number(rtv.creditAmount).toLocaleString()}
                  {rtv.creditReference && ` (${rtv.creditReference})`}
                </>
              )}
            </p>
          </div>
        </div>

        <div className="card space-y-2 self-start">
          {rtv.status === 'DRAFT' && (
            <p className="text-xs text-gray-500">
              Nothing is sent from here. Contact {rtv.vendor?.name}
              {rtv.vendor?.email ? ` (${rtv.vendor.email})` : ''}, then mark the return sent.
            </p>
          )}
          {mayUpdate && rtv.status === 'DRAFT' && (
            <button className="btn-primary w-full" onClick={() => act({ action: 'send' }, 'Marked as sent.')} disabled={busy}>
              Mark sent to vendor
            </button>
          )}
          {mayUpdate && open && !creditOpen && (
            <button
              className="btn-secondary w-full"
              onClick={() => {
                setAmount(String(Math.round(due * 100) / 100));
                setCreditOpen(true);
              }}
              disabled={busy}
            >
              Record credit note
            </button>
          )}
          {creditOpen && (
            <form
              className="space-y-2 rounded-md border border-gray-200 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                act({ action: 'credit', amount: Number(amount), reference: reference || undefined }, 'Credit recorded.');
              }}
            >
              <label className="label" htmlFor="rtv-credit-amount">
                Amount credited ({rtv.currency})
              </label>
              <input
                id="rtv-credit-amount"
                className="input"
                type="number"
                min={0}
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <label className="label" htmlFor="rtv-credit-reference">
                Credit note reference
              </label>
              <input
                id="rtv-credit-reference"
                className="input"
                placeholder="e.g. CN-1042"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
              <div className="flex gap-2">
                <button className="btn-primary flex-1" type="submit" disabled={busy}>
                  Save
                </button>
                <button className="btn-secondary" type="button" onClick={() => setCreditOpen(false)}>
                  Back
                </button>
              </div>
            </form>
          )}
          {mayUpdate && open && (
            <button className="btn-danger w-full" onClick={() => act({ action: 'cancel' }, 'Return cancelled.')} disabled={busy}>
              Cancel return
            </button>
          )}
        </div>
      </div>
    </Layout>
  );
}

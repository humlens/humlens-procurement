import { useEffect, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import type { Role } from '@prisma/client';

import Layout from '@/components/Layout';
import Badge from '@/components/Badge';
import { apiFetch, apiPost, apiPut } from '@/lib/fetcher';
import { isGoodCondition } from '@/lib/receiving';
import { requireTeamPage } from '@/lib/pageAuth';
import { can } from '@/lib/permissions';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

// Stored as a date at 00:00 UTC, so read and show it in UTC.
const dateOnly = (value: string | null | undefined) => (value ? value.slice(0, 10) : '');

export default function PurchaseOrderDetail({ role }: { role: Role }) {
  const router = useRouter();
  const slug = router.query.slug as string;
  const id = router.query.id as string;
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data: po } = useQuery({
    queryKey: ['purchase-order', slug, id],
    queryFn: () => apiFetch<any>(`/api/teams/${slug}/purchase-orders/${id}`),
    enabled: !!slug && !!id,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['purchase-order', slug, id] });

  const [deliveryDate, setDeliveryDate] = useState('');
  useEffect(() => setDeliveryDate(dateOnly(po?.expectedDeliveryDate)), [po?.expectedDeliveryDate]);

  const saveDeliveryDate = async () => {
    setBusy(true);
    try {
      await apiPut(`/api/teams/${slug}/purchase-orders/${id}`, { expectedDeliveryDate: deliveryDate || null });
      toast.success(deliveryDate ? 'Delivery date saved.' : 'Delivery date cleared.');
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const act = async (action: 'approve' | 'issue' | 'cancel') => {
    setBusy(true);
    try {
      await apiPost(`/api/teams/${slug}/purchase-orders/${id}/action`, { action });
      toast.success('Updated.');
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (!po) {
    return (
      <Layout title="Purchase order">
        <p className="text-gray-400">Loading…</p>
      </Layout>
    );
  }

  return (
    <Layout title={po.poNumber}>
      <div className="mb-4 flex items-center gap-3">
        <Badge status={po.status} />
        <span className="text-sm text-gray-500">
          {po.vendor?.name} · {po.currency} {Number(po.totalAmount).toLocaleString()}
          {po.expectedDeliveryDate &&
            ` · promised by ${new Date(po.expectedDeliveryDate).toLocaleDateString(undefined, { timeZone: 'UTC' })}`}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card">
            <h2 className="mb-3 font-medium">Line items</h2>
            <table className="page-table">
              <thead className="text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="pb-2">Description</th>
                  <th className="pb-2">Qty</th>
                  <th className="pb-2">Received</th>
                  <th className="pb-2">Unit price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {po.lineItems.map((li: any) => (
                  <tr key={li.id}>
                    <td className="py-2">{li.description}</td>
                    <td className="py-2">
                      {li.quantity} {li.unit}
                    </td>
                    <td className="py-2">{li.receivedQty}</td>
                    <td className="py-2">{Number(li.unitPrice).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {po.goodsReceipts?.length > 0 && (
            <div className="card">
              <h2 className="mb-3 font-medium">Receiving history</h2>
              <ul className="space-y-2 text-sm">
                {po.goodsReceipts.map((r: any) => {
                  const bad = r.lineItems.filter((l: any) => !isGoodCondition(l.condition));
                  const rtv = po.vendorReturns?.find((v: any) => v.receiptId === r.id && v.status !== 'CANCELLED');
                  return (
                    <li key={r.id}>
                      <div className="flex items-center justify-between">
                        <span>{new Date(r.receivedAt).toLocaleDateString()}</span>
                        <Badge status={r.status} />
                      </div>
                      {bad.length > 0 && (
                        <p className="text-xs text-amber-700">
                          {bad.map((l: any) => `${Number(l.quantityReceived)} ${l.condition}`).join(', ')}
                          {rtv && (
                            <>
                              {' · '}
                              <Link href={`/teams/${slug}/vendor-returns/${rtv.id}`} className="underline">
                                {rtv.returnNumber}
                              </Link>
                            </>
                          )}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {po.vendorReturns?.length > 0 && (
            <div className="card">
              <h2 className="mb-3 font-medium">Returns to vendor</h2>
              <ul className="space-y-2 text-sm">
                {po.vendorReturns.map((v: any) => (
                  <li key={v.id} className="flex items-center justify-between">
                    <Link href={`/teams/${slug}/vendor-returns/${v.id}`} className="text-brand-700 hover:underline">
                      {v.returnNumber}
                    </Link>
                    <Badge status={v.status} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="card space-y-2">
          {can(role, 'purchase_order', 'update') && !['CLOSED', 'CANCELLED'].includes(po.status) && (
            <div className="border-b border-gray-100 pb-3">
              <label className="label" htmlFor="po-delivery-date">
                Promised delivery date
              </label>
              <div className="flex gap-2">
                <input
                  id="po-delivery-date"
                  className="input"
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                />
                <button
                  className="btn-secondary"
                  onClick={saveDeliveryDate}
                  disabled={busy || deliveryDate === dateOnly(po.expectedDeliveryDate)}
                >
                  Save
                </button>
              </div>
            </div>
          )}
          {(po.status === 'DRAFT' || po.status === 'PENDING_APPROVAL') && (
            <button className="btn-primary w-full" onClick={() => act('approve')} disabled={busy}>
              Approve
            </button>
          )}
          {po.status === 'APPROVED' && (
            <button className="btn-primary w-full" onClick={() => act('issue')} disabled={busy}>
              Issue to vendor
            </button>
          )}
          {['ISSUED', 'PARTIALLY_RECEIVED'].includes(po.status) && (
            <Link href={`/teams/${slug}/receiving?poId=${id}`} className="btn-primary block text-center">
              Receive goods
            </Link>
          )}
          {!['CLOSED', 'CANCELLED', 'RECEIVED'].includes(po.status) && (
            <button className="btn-danger w-full" onClick={() => act('cancel')} disabled={busy}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </Layout>
  );
}

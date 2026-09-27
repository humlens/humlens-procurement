import { useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import Layout from '@/components/Layout';
import Badge from '@/components/Badge';
import { apiFetch, apiPost } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

export default function PurchaseOrderDetail() {
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
                {po.goodsReceipts.map((r: any) => (
                  <li key={r.id} className="flex items-center justify-between">
                    <span>{new Date(r.receivedAt).toLocaleDateString()}</span>
                    <Badge status={r.status} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="card space-y-2">
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

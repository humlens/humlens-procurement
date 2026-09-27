import { useEffect, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { PackageCheck } from 'lucide-react';

import Layout from '@/components/Layout';
import Badge from '@/components/Badge';
import { apiFetch, apiPost } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

export default function Receiving() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const queryClient = useQueryClient();
  const [poId, setPoId] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (router.query.poId) setPoId(router.query.poId as string);
  }, [router.query.poId]);

  const { data: openPOs } = useQuery({
    queryKey: ['purchase-orders', slug, 'receivable'],
    queryFn: async () => {
      const [issued, partial] = await Promise.all([
        apiFetch<any[]>(`/api/teams/${slug}/purchase-orders?status=ISSUED`),
        apiFetch<any[]>(`/api/teams/${slug}/purchase-orders?status=PARTIALLY_RECEIVED`),
      ]);
      return [...issued, ...partial];
    },
    enabled: !!slug,
  });

  const { data: po } = useQuery({
    queryKey: ['purchase-order', slug, poId],
    queryFn: () => apiFetch<any>(`/api/teams/${slug}/purchase-orders/${poId}`),
    enabled: !!slug && !!poId,
  });

  const { data: receipts } = useQuery({
    queryKey: ['goods-receipts', slug],
    queryFn: () => apiFetch<any[]>(`/api/teams/${slug}/goods-receipts`),
    enabled: !!slug,
  });

  const submit = async () => {
    const lineItems = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([poLineItemId, quantityReceived]) => ({ poLineItemId, quantityReceived }));

    if (lineItems.length === 0) {
      toast.error('Enter at least one received quantity.');
      return;
    }

    setBusy(true);
    try {
      await apiPost(`/api/teams/${slug}/goods-receipts`, { poId, lineItems });
      toast.success('Receipt recorded.');
      setQuantities({});
      queryClient.invalidateQueries({ queryKey: ['purchase-order', slug, poId] });
      queryClient.invalidateQueries({ queryKey: ['goods-receipts', slug] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders', slug, 'receivable'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout title="Receiving" icon={PackageCheck} iconTone="teal">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <label className="label">Purchase order</label>
          <select className="input" value={poId} onChange={(e) => setPoId(e.target.value)}>
            <option value="">Select a PO to receive against…</option>
            {openPOs?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.poNumber} — {p.vendor?.name}
              </option>
            ))}
          </select>

          {po && (
            <div className="mt-4 space-y-3">
              {po.lineItems.map((li: any) => {
                const outstanding = Number(li.quantity) - Number(li.receivedQty);
                return (
                  <div key={li.id} className="flex items-center justify-between gap-3">
                    <div className="text-sm">
                      <p>{li.description}</p>
                      <p className="text-xs text-gray-500">
                        {li.receivedQty}/{li.quantity} received
                      </p>
                    </div>
                    <input
                      className="input w-28"
                      type="number"
                      min={0}
                      max={outstanding}
                      placeholder="Qty"
                      value={quantities[li.id] ?? ''}
                      onChange={(e) => setQuantities({ ...quantities, [li.id]: Number(e.target.value) })}
                    />
                  </div>
                );
              })}
              <button className="btn-primary w-full" onClick={submit} disabled={busy}>
                Record receipt
              </button>
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="mb-3 font-medium">Recent receipts</h2>
          <ul className="divide-y divide-gray-100 text-sm">
            {receipts?.slice(0, 10).map((r: any) => (
              <li key={r.id} className="flex items-center justify-between py-2">
                <span>{r.purchaseOrder?.poNumber}</span>
                <span className="text-gray-500">{new Date(r.receivedAt).toLocaleDateString()}</span>
                <Badge status={r.status} />
              </li>
            ))}
            {receipts?.length === 0 && <li className="py-2 text-gray-400">No receipts yet.</li>}
          </ul>
        </div>
      </div>
    </Layout>
  );
}

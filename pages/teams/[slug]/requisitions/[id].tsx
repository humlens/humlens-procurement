import { useEffect, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import Layout from '@/components/Layout';
import Badge from '@/components/Badge';
import { apiFetch, apiPost } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';
import ShopCatalogButton from '@/components/requisitions/ShopCatalogButton';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

export default function RequisitionDetail({ role }: { role: string }) {
  const router = useRouter();
  const slug = router.query.slug as string;
  const id = router.query.id as string;
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: requisition } = useQuery({
    queryKey: ['requisition', slug, id],
    queryFn: () => apiFetch<any>(`/api/teams/${slug}/requisitions/${id}`),
    enabled: !!slug && !!id,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['requisition', slug, id] });

  // Back from a supplier's PunchOut catalog.
  useEffect(() => {
    const added = router.query.punchout;
    if (typeof added !== 'string') return;
    toast.success(Number(added) > 0 ? `${added} item(s) added from the supplier’s catalog.` : 'You left the catalog without adding anything.', { id: 'punchout-return' });
    const { punchout: _added, ...rest } = router.query;
    void router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.punchout]);

  const submit = async () => {
    setBusy(true);
    try {
      await apiPost(`/api/teams/${slug}/requisitions/${id}/submit`);
      toast.success('Submitted for approval.');
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const decide = async (decision: 'APPROVED' | 'REJECTED') => {
    setBusy(true);
    try {
      await apiPost(`/api/teams/${slug}/requisitions/${id}/decide`, { decision, comment });
      toast.success(decision === 'APPROVED' ? 'Approved.' : 'Rejected.');
      setComment('');
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (!requisition) {
    return (
      <Layout title="Requisition">
        <p className="text-gray-400">Loading…</p>
      </Layout>
    );
  }

  const pendingStep = requisition.approvalSteps.find((s: any) => s.status === 'PENDING');
  const canDecide = pendingStep && (pendingStep.requiredRole === role || role === 'OWNER');

  return (
    <Layout title={requisition.title}>
      <div className="mb-4 flex items-center gap-3">
        <Badge status={requisition.status} />
        <span className="text-sm text-gray-500">
          {requisition.currency} {Number(requisition.totalAmount).toLocaleString()} · requested by{' '}
          {requisition.requester?.name}
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
                  <th className="pb-2">Est. price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {requisition.lineItems.map((li: any) => (
                  <tr key={li.id}>
                    <td className="py-2">{li.description}</td>
                    <td className="py-2">
                      {li.quantity} {li.unit}
                    </td>
                    <td className="py-2">{Number(li.estimatedPrice).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {requisition.justification && (
              <p className="mt-3 text-sm text-gray-500">{requisition.justification}</p>
            )}
          </div>

          {requisition.agentActions?.length > 0 && (
            <div className="card">
              <h2 className="mb-3 font-medium">AI agent activity</h2>
              <ul className="space-y-2">
                {requisition.agentActions.map((a: any) => (
                  <li key={a.id} className="text-sm">
                    <div className="flex items-center justify-between">
                      <span>{a.title ?? a.type.replaceAll('_', ' ')}</span>
                      <Badge status={a.status} />
                    </div>
                    {a.reasoning && <p className="text-xs text-gray-500">{a.reasoning}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="card">
            <h2 className="mb-3 font-medium">Approval steps</h2>
            <ol className="space-y-3">
              {requisition.approvalSteps.map((s: any) => (
                <li key={s.id} className="flex items-center justify-between text-sm">
                  <span>{s.requiredRole}</span>
                  <Badge status={s.status} />
                </li>
              ))}
              {requisition.approvalSteps.length === 0 && (
                <li className="text-sm text-gray-400">Not submitted yet.</li>
              )}
            </ol>
          </div>

          <div className="card space-y-3">
            {requisition.status === 'DRAFT' && (
              <>
                <button className="btn-primary w-full" onClick={submit} disabled={busy}>
                  Submit for approval
                </button>
                <ShopCatalogButton slug={slug} requisitionId={id} className="btn-secondary w-full justify-center" />
              </>
            )}

            {canDecide && (
              <>
                <textarea
                  className="input"
                  placeholder="Comment (optional)"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <div className="flex gap-2">
                  <button className="btn-primary flex-1" onClick={() => decide('APPROVED')} disabled={busy}>
                    Approve
                  </button>
                  <button className="btn-danger flex-1" onClick={() => decide('REJECTED')} disabled={busy}>
                    Reject
                  </button>
                </div>
              </>
            )}

            {requisition.status === 'APPROVED' && !requisition.purchaseOrder && (
              <Link href={`/teams/${slug}/purchase-orders?requisitionId=${id}`} className="btn-primary block text-center">
                Create purchase order
              </Link>
            )}

            {requisition.purchaseOrder && (
              <Link href={`/teams/${slug}/purchase-orders/${requisition.purchaseOrder.id}`} className="btn-secondary block text-center">
                View purchase order
              </Link>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

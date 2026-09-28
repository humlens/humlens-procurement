import { useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import Layout from '@/components/Layout';
import Badge from '@/components/Badge';
import { apiFetch, apiPost } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

export default function InvoiceDetail() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const id = router.query.id as string;
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data: invoice } = useQuery({
    queryKey: ['invoice', slug, id],
    queryFn: () => apiFetch<any>(`/api/teams/${slug}/invoices/${id}`),
    enabled: !!slug && !!id,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['invoice', slug, id] });

  const runMatch = async () => {
    setBusy(true);
    try {
      await apiPost(`/api/teams/${slug}/invoices/${id}/match`);
      toast.success('Match re-run.');
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    setBusy(true);
    try {
      await apiPost(`/api/teams/${slug}/invoices/${id}/approve`);
      toast.success('Invoice approved.');
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const schedulePayment = async () => {
    setBusy(true);
    try {
      await apiPost(`/api/teams/${slug}/payments`, {
        vendorId: invoice.vendorId,
        invoiceId: invoice.id,
        amount: Number(invoice.totalAmount),
        currency: invoice.currency,
      });
      toast.success('Payment scheduled.');
      router.push(`/teams/${slug}/payments`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (!invoice) {
    return (
      <Layout title="Invoice">
        <p className="text-gray-400">Loading…</p>
      </Layout>
    );
  }

  return (
    <Layout title={invoice.invoiceNumber}>
      <div className="mb-4 flex items-center gap-3">
        <Badge status={invoice.status} />
        <span className="text-sm text-gray-500">
          {invoice.vendor?.name} · {invoice.currency} {Number(invoice.totalAmount).toLocaleString()}
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
                  <th className="pb-2">Unit price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoice.lineItems.map((li: any) => (
                  <tr key={li.id}>
                    <td className="py-2">{li.description}</td>
                    <td className="py-2">{li.quantity}</td>
                    <td className="py-2">{Number(li.unitPrice).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {invoice.matchNotes && (
            <div className="card">
              <h2 className="mb-2 font-medium">Match result</h2>
              <p className="text-sm text-gray-600">{invoice.matchStatus}</p>
              <pre className="mt-2 whitespace-pre-wrap text-xs text-gray-500">{invoice.matchNotes}</pre>
            </div>
          )}

          {invoice.agentActions?.length > 0 && (
            <div className="card">
              <h2 className="mb-3 font-medium">AI agent activity</h2>
              <ul className="space-y-2 text-sm">
                {invoice.agentActions.map((a: any) => (
                  <li key={a.id}>
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

        <div className="card space-y-2">
          {invoice.poId && (
            <button className="btn-secondary w-full" onClick={runMatch} disabled={busy}>
              Re-run 3-way match
            </button>
          )}
          {['MATCHED', 'UNDER_REVIEW', 'RECEIVED'].includes(invoice.status) && (
            <button className="btn-primary w-full" onClick={approve} disabled={busy}>
              Approve invoice
            </button>
          )}
          {['APPROVED', 'MATCHED'].includes(invoice.status) && (
            <button className="btn-primary w-full" onClick={schedulePayment} disabled={busy}>
              Schedule payment
            </button>
          )}
        </div>
      </div>
    </Layout>
  );
}

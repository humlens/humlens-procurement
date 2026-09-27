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

export default function RfqDetail() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const id = router.query.id as string;
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string> | null>(null);

  const { data: rfq } = useQuery({
    queryKey: ['rfq', slug, id],
    queryFn: () => apiFetch<any>(`/api/teams/${slug}/rfqs/${id}`),
    enabled: !!slug && !!id,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['rfq', slug, id] });

  const award = async (quoteId: string) => {
    setBusy(true);
    try {
      await apiPost(`/api/teams/${slug}/rfqs/${id}/award`, { quoteId });
      toast.success('Quote awarded.');
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const draftOutreach = async () => {
    setBusy(true);
    try {
      const action = await apiPost<{ output: { drafts: Record<string, string> } }>(
        `/api/teams/${slug}/rfqs/${id}/draft-outreach`
      );
      setDrafts(action.output.drafts);
      toast.success('Drafted outreach emails.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (!rfq) {
    return (
      <Layout title="RFQ">
        <p className="text-gray-400">Loading…</p>
      </Layout>
    );
  }

  return (
    <Layout title={rfq.title}>
      <div className="mb-4 flex items-center justify-between">
        <Badge status={rfq.status} />
        <button className="btn-secondary" onClick={draftOutreach} disabled={busy}>
          Draft vendor outreach with AI
        </button>
      </div>

      {drafts && (
        <div className="card mb-6 space-y-4">
          <h2 className="font-medium">AI-drafted outreach emails</h2>
          {Object.entries(drafts).map(([vendorId, text]) => {
            const invite = rfq.vendorInvites.find((v: any) => v.vendorId === vendorId);
            return (
              <div key={vendorId} className="rounded-md border border-gray-200 p-3">
                <p className="mb-1 text-sm font-medium">{invite?.vendor?.name}</p>
                <p className="whitespace-pre-wrap text-sm text-gray-600">{text}</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        <h2 className="mb-3 font-medium">Quotes</h2>
        <table className="page-table">
          <thead className="text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="pb-2">Vendor</th>
              <th className="pb-2">Total</th>
              <th className="pb-2">Lead time</th>
              <th className="pb-2">Status</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rfq.quotes.map((q: any) => (
              <tr key={q.id}>
                <td className="py-2">{q.vendor?.name}</td>
                <td className="py-2">
                  {q.currency} {Number(q.totalAmount).toLocaleString()}
                </td>
                <td className="py-2">{q.leadTimeDays ? `${q.leadTimeDays}d` : '—'}</td>
                <td className="py-2">
                  <Badge status={q.status} />
                </td>
                <td className="py-2">
                  {q.status === 'SUBMITTED' && rfq.status !== 'AWARDED' && (
                    <button className="btn-secondary" onClick={() => award(q.id)} disabled={busy}>
                      Award
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rfq.quotes.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-gray-400">
                  No quotes received yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}

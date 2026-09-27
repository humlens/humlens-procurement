import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import { CheckSquare } from 'lucide-react';

import Layout from '@/components/Layout';
import Badge from '@/components/Badge';
import { apiFetch } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

export default function Approvals() {
  const router = useRouter();
  const slug = router.query.slug as string;

  const { data: requisitions, isLoading } = useQuery({
    queryKey: ['approvals', slug],
    queryFn: () => apiFetch<any[]>(`/api/teams/${slug}/approvals`),
    enabled: !!slug,
  });

  return (
    <Layout title="Pending my approval" icon={CheckSquare} iconTone="emerald">
      <div className="card overflow-x-auto p-0">
        <table className="page-table">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Requester</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Submitted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {requisitions?.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/teams/${slug}/requisitions/${r.id}`} className="font-medium hover:underline">
                    {r.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-600">{r.requester?.name}</td>
                <td className="px-4 py-3 text-gray-600">
                  {r.currency} {Number(r.totalAmount).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <Badge status={r.status} />
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
            {!isLoading && requisitions?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  Nothing waiting on your approval.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}

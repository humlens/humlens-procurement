import { useMemo } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import { CheckSquare } from 'lucide-react';

import Layout from '@/components/Layout';
import Badge from '@/components/Badge';
import DataTable, { type AppColumnDef } from '@/components/DataTable';
import { apiFetch } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

type PendingRequisition = {
  id: string;
  title: string;
  status: string;
  currency: string;
  totalAmount: string | number;
  submittedAt: string | null;
  requester?: { name: string };
};

export default function Approvals() {
  const router = useRouter();
  const slug = router.query.slug as string;

  const { data: requisitions, isLoading } = useQuery({
    queryKey: ['approvals', slug],
    queryFn: () => apiFetch<PendingRequisition[]>(`/api/teams/${slug}/approvals`),
    enabled: !!slug,
  });

  const columns = useMemo<AppColumnDef<PendingRequisition>[]>(
    () => [
      { accessorKey: 'title', header: 'Title', size: 320 },
      { accessorFn: (r) => r.requester?.name ?? '', id: 'requester', header: 'Requester', size: 180 },
      {
        accessorKey: 'totalAmount',
        header: 'Amount',
        size: 150,
        cell: ({ row }) => `${row.original.currency} ${Number(row.original.totalAmount).toLocaleString()}`,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        size: 160,
        cell: ({ getValue }) => <Badge status={getValue<string>()} />,
      },
      {
        accessorKey: 'submittedAt',
        header: 'Submitted',
        size: 140,
        cell: ({ getValue }) => {
          const value = getValue<string | null>();
          return value ? new Date(value).toLocaleDateString() : '—';
        },
      },
    ],
    []
  );

  return (
    <Layout title="Pending my approval" icon={CheckSquare} iconTone="emerald">
      <DataTable
        columns={columns}
        data={requisitions ?? []}
        isLoading={isLoading}
        searchPlaceholder="Search requisitions…"
        emptyMessage="Nothing waiting on your approval"
        emptyDescription="Requisitions that need your sign-off will appear here."
        emptyIcon={CheckSquare}
        getRowHref={(r) => `/teams/${slug}/requisitions/${r.id}`}
      />
    </Layout>
  );
}

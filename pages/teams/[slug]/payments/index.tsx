import { useMemo, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CreditCard } from 'lucide-react';

import Layout from '@/components/Layout';
import Badge from '@/components/Badge';
import DataTable, { type AppColumnDef } from '@/components/DataTable';
import { apiFetch, apiPost } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

type Payment = {
  id: string;
  status: string;
  currency: string;
  amount: string | number;
  vendor?: { name: string };
  invoice?: { invoiceNumber: string } | null;
};

export default function Payments() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: payments, isLoading } = useQuery({
    queryKey: ['payments', slug],
    queryFn: () => apiFetch<Payment[]>(`/api/teams/${slug}/payments`),
    enabled: !!slug,
  });

  const markPaid = async (id: string) => {
    setBusyId(id);
    try {
      await apiPost(`/api/teams/${slug}/payments/${id}/pay`);
      toast.success('Marked as paid.');
      queryClient.invalidateQueries({ queryKey: ['payments', slug] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusyId(null);
    }
  };

  const columns = useMemo<AppColumnDef<Payment>[]>(
    () => [
      { accessorFn: (p) => p.vendor?.name ?? '', id: 'vendor', header: 'Vendor', size: 240 },
      { accessorFn: (p) => p.invoice?.invoiceNumber ?? '—', id: 'invoice', header: 'Invoice', size: 160 },
      {
        accessorKey: 'amount',
        header: 'Amount',
        size: 150,
        cell: ({ row }) => `${row.original.currency} ${Number(row.original.amount).toLocaleString()}`,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        size: 150,
        cell: ({ getValue }) => <Badge status={getValue<string>()} />,
      },
      {
        id: 'actions',
        header: '',
        size: 120,
        enableSorting: false,
        cell: ({ row }) =>
          row.original.status === 'SCHEDULED' ? (
            <button
              className="btn-secondary"
              onClick={(e) => {
                e.stopPropagation();
                markPaid(row.original.id);
              }}
              disabled={busyId === row.original.id}
            >
              Mark paid
            </button>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busyId]
  );

  return (
    <Layout title="Payments" icon={CreditCard} iconTone="indigo">
      <DataTable
        columns={columns}
        data={payments ?? []}
        isLoading={isLoading}
        searchPlaceholder="Filter payments…"
        emptyMessage="No payments yet"
        emptyDescription="Payments appear here once an invoice is approved and scheduled."
        emptyIcon={CreditCard}
      />
    </Layout>
  );
}

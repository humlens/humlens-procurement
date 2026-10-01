import { useMemo } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import { PackageX } from 'lucide-react';

import Layout from '@/components/Layout';
import Badge from '@/components/Badge';
import DataTable, { type AppColumnDef } from '@/components/DataTable';
import { apiFetch } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

type VendorReturn = {
  id: string;
  returnNumber: string;
  status: string;
  currency: string;
  creditAmount: string | null;
  createdAt: string;
  vendor?: { name: string };
  purchaseOrder?: { poNumber: string };
  lineItems: { quantity: string; unitPrice: string }[];
};

const creditDue = (r: VendorReturn) => r.lineItems.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitPrice), 0);

export default function VendorReturns() {
  const router = useRouter();
  const slug = router.query.slug as string;

  const { data: returns, isLoading } = useQuery({
    queryKey: ['vendor-returns', slug],
    queryFn: () => apiFetch<VendorReturn[]>(`/api/teams/${slug}/vendor-returns`),
    enabled: !!slug,
  });

  const columns = useMemo<AppColumnDef<VendorReturn>[]>(
    () => [
      { accessorKey: 'returnNumber', header: 'Return #', size: 140 },
      { accessorFn: (r) => r.vendor?.name ?? '', id: 'vendor', header: 'Vendor', size: 220 },
      { accessorFn: (r) => r.purchaseOrder?.poNumber ?? '', id: 'po', header: 'PO', size: 130 },
      {
        id: 'credit',
        accessorFn: (r) => (r.creditAmount !== null ? Number(r.creditAmount) : creditDue(r)),
        header: 'Credit',
        size: 180,
        cell: ({ row }) =>
          row.original.creditAmount !== null
            ? `${row.original.currency} ${Number(row.original.creditAmount).toLocaleString()} credited`
            : `${row.original.currency} ${creditDue(row.original).toLocaleString()} due`,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        size: 140,
        cell: ({ getValue }) => <Badge status={getValue<string>()} />,
      },
      {
        accessorKey: 'createdAt',
        header: 'Created',
        size: 140,
        cell: ({ getValue }) => new Date(getValue<string>()).toLocaleDateString(),
      },
    ],
    []
  );

  return (
    <Layout title="Returns to vendor" icon={PackageX} iconTone="amber">
      <DataTable
        columns={columns}
        data={returns ?? []}
        isLoading={isLoading}
        searchPlaceholder="Filter returns…"
        emptyMessage="No returns to vendor"
        emptyDescription="When goods are received damaged or wrong, a draft return is prepared here for you to send."
        emptyIcon={PackageX}
        getRowHref={(r) => `/teams/${slug}/vendor-returns/${r.id}`}
      />
    </Layout>
  );
}

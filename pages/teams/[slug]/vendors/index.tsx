import { useMemo, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';

import Layout from '@/components/Layout';
import Badge from '@/components/Badge';
import DataTable, { type AppColumnDef } from '@/components/DataTable';
import NewButton from '@/components/NewButton';
import SidebarModal from '@/components/SidebarModal';
import VendorForm from '@/components/forms/VendorForm';
import { apiFetch } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';
import { useNewHotkey } from '@/lib/useNewHotkey';
import { useOpenNewFromQuery } from '@/lib/useOpenNewFromQuery';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

type Vendor = {
  id: string;
  name: string;
  status: string;
  rating: number | null;
  category?: { name: string } | null;
  _count?: { purchaseOrders: number; contracts: number };
};

export default function Vendors() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  useNewHotkey(() => setCreateOpen(true));
  useOpenNewFromQuery(setCreateOpen);

  const { data: vendors, isLoading } = useQuery({
    queryKey: ['vendors', slug, 'all'],
    queryFn: () => apiFetch<Vendor[]>(`/api/teams/${slug}/vendors`),
    enabled: !!slug,
  });

  const columns = useMemo<AppColumnDef<Vendor>[]>(
    () => [
      { accessorKey: 'name', header: 'Name', size: 260 },
      { accessorFn: (v) => v.category?.name ?? '—', id: 'category', header: 'Category', size: 180 },
      {
        accessorKey: 'rating',
        header: 'Rating',
        size: 100,
        cell: ({ getValue }) => {
          const v = getValue<number | null>();
          return v ? v.toFixed(1) : '—';
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        size: 170,
        cell: ({ getValue }) => <Badge status={getValue<string>()} />,
      },
      {
        accessorFn: (v) => v._count?.purchaseOrders ?? 0,
        id: 'poCount',
        header: 'POs',
        size: 100,
      },
    ],
    []
  );

  return (
    <Layout title="Vendors" icon={Building2} iconTone="cyan">
      <div className="mb-4 flex justify-end">
        <NewButton onClick={() => setCreateOpen(true)} label="New vendor" />
      </div>

      <DataTable
        columns={columns}
        data={vendors ?? []}
        isLoading={isLoading}
        searchPlaceholder="Filter vendors…"
        emptyMessage="No vendors yet"
        emptyDescription="Onboard a supplier to start sourcing and issuing purchase orders."
        emptyIcon={Building2}
        getRowHref={(v) => `/teams/${slug}/vendors/${v.id}`}
      />

      <SidebarModal open={createOpen} onClose={() => setCreateOpen(false)} title="New vendor">
        <VendorForm
          slug={slug}
          onSuccess={(vendor) => {
            setCreateOpen(false);
            queryClient.invalidateQueries({ queryKey: ['vendors', slug] });
            router.push(`/teams/${slug}/vendors/${vendor.id}`);
          }}
        />
      </SidebarModal>
    </Layout>
  );
}

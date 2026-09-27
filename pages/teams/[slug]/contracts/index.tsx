import { useMemo, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FileSignature } from 'lucide-react';

import Layout from '@/components/Layout';
import Badge from '@/components/Badge';
import DataTable, { type AppColumnDef } from '@/components/DataTable';
import NewButton from '@/components/NewButton';
import SidebarModal from '@/components/SidebarModal';
import { apiFetch, apiPost } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';
import { useNewHotkey } from '@/lib/useNewHotkey';
import { useOpenNewFromQuery } from '@/lib/useOpenNewFromQuery';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

type Contract = {
  id: string;
  title: string;
  status: string;
  value: string | number | null;
  currency: string;
  endDate: string | null;
  vendor?: { name: string };
};

export default function Contracts() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  useNewHotkey(() => setCreateOpen(true));
  useOpenNewFromQuery(setCreateOpen);

  const [vendorId, setVendorId] = useState('');
  const [title, setTitle] = useState('');
  const [value, setValue] = useState(0);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [autoRenew, setAutoRenew] = useState(false);
  const [creating, setCreating] = useState(false);

  const { data: contracts, isLoading } = useQuery({
    queryKey: ['contracts', slug],
    queryFn: () => apiFetch<Contract[]>(`/api/teams/${slug}/contracts`),
    enabled: !!slug,
  });

  const { data: vendors } = useQuery({
    queryKey: ['vendors', slug, 'active'],
    queryFn: () => apiFetch<any[]>(`/api/teams/${slug}/vendors?status=ACTIVE`),
    enabled: !!slug && createOpen,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await apiPost(`/api/teams/${slug}/contracts`, {
        vendorId,
        title,
        value: value || undefined,
        currency: 'USD',
        startDate: new Date(startDate).toISOString(),
        endDate: endDate ? new Date(endDate).toISOString() : undefined,
        autoRenew,
      });
      toast.success('Contract created.');
      setCreateOpen(false);
      setVendorId('');
      setTitle('');
      setValue(0);
      setStartDate('');
      setEndDate('');
      setAutoRenew(false);
      queryClient.invalidateQueries({ queryKey: ['contracts', slug] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setCreating(false);
    }
  };

  const columns = useMemo<AppColumnDef<Contract>[]>(
    () => [
      { accessorKey: 'title', header: 'Title', size: 280 },
      { accessorFn: (c) => c.vendor?.name ?? '', id: 'vendor', header: 'Vendor', size: 220 },
      {
        accessorKey: 'value',
        header: 'Value',
        size: 150,
        cell: ({ row }) =>
          row.original.value ? `${row.original.currency} ${Number(row.original.value).toLocaleString()}` : '—',
      },
      {
        accessorKey: 'endDate',
        header: 'Ends',
        size: 140,
        cell: ({ getValue }) => {
          const v = getValue<string | null>();
          return v ? new Date(v).toLocaleDateString() : '—';
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        size: 160,
        cell: ({ getValue }) => <Badge status={getValue<string>()} />,
      },
    ],
    []
  );

  return (
    <Layout title="Contracts" icon={FileSignature} iconTone="rose">
      <div className="mb-4 flex justify-end">
        <NewButton onClick={() => setCreateOpen(true)} label="New contract" />
      </div>

      <DataTable
        columns={columns}
        data={contracts ?? []}
        isLoading={isLoading}
        searchPlaceholder="Filter contracts…"
        emptyMessage="No contracts yet"
        emptyDescription="Attach a contract to a vendor to track terms, value, and renewal dates."
        emptyIcon={FileSignature}
      />

      <SidebarModal open={createOpen} onClose={() => setCreateOpen(false)} title="New contract">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Vendor</label>
            <select className="input" required value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              <option value="">Select a vendor…</option>
              {vendors?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Title</label>
            <input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="label">Contract value (USD)</label>
            <input className="input" type="number" min={0} value={value} onChange={(e) => setValue(Number(e.target.value))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Start date</label>
              <input className="input" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="label">End date</label>
              <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={autoRenew} onChange={(e) => setAutoRenew(e.target.checked)} />
            Auto-renew
          </label>
          <button className="btn-primary w-full" type="submit" disabled={creating}>
            {creating ? 'Creating…' : 'Create contract'}
          </button>
        </form>
      </SidebarModal>
    </Layout>
  );
}

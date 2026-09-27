import { useMemo, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FileSearch } from 'lucide-react';

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

type Rfq = {
  id: string;
  title: string;
  status: string;
  _count?: { vendorInvites: number; quotes: number };
};

type LineItem = { description: string; quantity: number; unit: string };
const blankLine: LineItem = { description: '', quantity: 1, unit: '' };

export default function Rfqs() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  useNewHotkey(() => setCreateOpen(true));
  useOpenNewFromQuery(setCreateOpen);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [vendorIds, setVendorIds] = useState<string[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([blankLine]);
  const [creating, setCreating] = useState(false);

  const { data: vendors } = useQuery({
    queryKey: ['vendors', slug, 'active'],
    queryFn: () => apiFetch<any[]>(`/api/teams/${slug}/vendors?status=ACTIVE`),
    enabled: !!slug && createOpen,
  });

  const updateLine = (i: number, patch: Partial<LineItem>) => {
    setLineItems((items) => items.map((li, idx) => (idx === i ? { ...li, ...patch } : li)));
  };

  const toggleVendor = (id: string) => {
    setVendorIds((ids) => (ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id]));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (vendorIds.length === 0) {
      toast.error('Invite at least one vendor.');
      return;
    }
    setCreating(true);
    try {
      const rfq = await apiPost<{ id: string }>(`/api/teams/${slug}/rfqs`, {
        title,
        description,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        vendorIds,
        lineItems: lineItems.filter((li) => li.description),
      });
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ['rfqs', slug] });
      router.push(`/teams/${slug}/rfqs/${rfq.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setCreating(false);
    }
  };

  const { data: rfqs, isLoading } = useQuery({
    queryKey: ['rfqs', slug],
    queryFn: () => apiFetch<Rfq[]>(`/api/teams/${slug}/rfqs`),
    enabled: !!slug,
  });

  const columns = useMemo<AppColumnDef<Rfq>[]>(
    () => [
      { accessorKey: 'title', header: 'Title', size: 320 },
      { accessorFn: (r) => r._count?.vendorInvites ?? 0, id: 'vendorInvites', header: 'Vendors invited', size: 160 },
      { accessorFn: (r) => r._count?.quotes ?? 0, id: 'quotes', header: 'Quotes', size: 120 },
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
    <Layout title="Sourcing (RFQs)" icon={FileSearch} iconTone="fuchsia">
      <div className="mb-4 flex justify-end">
        <NewButton onClick={() => setCreateOpen(true)} label="New RFQ" />
      </div>

      <DataTable
        columns={columns}
        data={rfqs ?? []}
        isLoading={isLoading}
        searchPlaceholder="Filter RFQs…"
        emptyMessage="No RFQs yet"
        emptyDescription="Invite vendors to quote on a set of line items to compare pricing before you buy."
        emptyIcon={FileSearch}
        getRowHref={(r) => `/teams/${slug}/rfqs/${r.id}`}
      />

      <SidebarModal open={createOpen} onClose={() => setCreateOpen(false)} title="New RFQ" width="lg">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Title</label>
            <input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="label">Quotes due by</label>
            <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>

          <div>
            <label className="label">Invite vendors</label>
            <div className="flex flex-wrap gap-2">
              {vendors?.map((v) => (
                <label key={v.id} className="flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-sm">
                  <input type="checkbox" checked={vendorIds.includes(v.id)} onChange={() => toggleVendor(v.id)} />
                  {v.name}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Line items</label>
            <div className="space-y-2">
              {lineItems.map((li, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                  <input
                    className="input sm:col-span-7"
                    placeholder="Description"
                    value={li.description}
                    onChange={(e) => updateLine(i, { description: e.target.value })}
                  />
                  <input
                    className="input sm:col-span-2"
                    type="number"
                    min={0}
                    placeholder="Qty"
                    value={li.quantity}
                    onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                  />
                  <input
                    className="input sm:col-span-3"
                    placeholder="Unit"
                    value={li.unit}
                    onChange={(e) => updateLine(i, { unit: e.target.value })}
                  />
                </div>
              ))}
            </div>
            <button type="button" className="btn-secondary mt-2" onClick={() => setLineItems((items) => [...items, blankLine])}>
              + Add line item
            </button>
          </div>

          <button className="btn-primary w-full" type="submit" disabled={creating}>
            {creating ? 'Sending…' : 'Send RFQ'}
          </button>
        </form>
      </SidebarModal>
    </Layout>
  );
}

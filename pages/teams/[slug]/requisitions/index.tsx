import { useMemo, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FileText } from 'lucide-react';

import Layout from '@/components/Layout';
import Badge from '@/components/Badge';
import DataTable, { type AppColumnDef } from '@/components/DataTable';
import NewButton from '@/components/NewButton';
import ShopCatalogButton from '@/components/requisitions/ShopCatalogButton';
import SidebarModal from '@/components/SidebarModal';
import { apiFetch, apiPost } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';
import { useNewHotkey } from '@/lib/useNewHotkey';
import { useOpenNewFromQuery } from '@/lib/useOpenNewFromQuery';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

type Requisition = {
  id: string;
  title: string;
  status: string;
  currency: string;
  totalAmount: string | number;
  createdAt: string;
  requester?: { name: string };
};

type LineItem = { description: string; quantity: number; unit: string; estimatedPrice: number };
const blankLine: LineItem = { description: '', quantity: 1, unit: '', estimatedPrice: 0 };

export default function Requisitions() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [mode, setMode] = useState<'manual' | 'ai'>('manual');
  useNewHotkey(() => setCreateOpen(true));
  useOpenNewFromQuery(setCreateOpen);

  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [justification, setJustification] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([blankLine]);
  const [creating, setCreating] = useState(false);

  const updateLine = (i: number, patch: Partial<LineItem>) => {
    setLineItems((items) => items.map((li, idx) => (idx === i ? { ...li, ...patch } : li)));
  };

  const resetForm = () => {
    setTitle('');
    setJustification('');
    setLineItems([blankLine]);
    setPrompt('');
    setMode('manual');
  };

  const goToRequisition = (id: string) => {
    setCreateOpen(false);
    resetForm();
    queryClient.invalidateQueries({ queryKey: ['requisitions', slug] });
    router.push(`/teams/${slug}/requisitions/${id}`);
  };

  const submitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const requisition = await apiPost<{ id: string }>(`/api/teams/${slug}/requisitions`, {
        title,
        justification,
        currency: 'USD',
        lineItems: lineItems.filter((li) => li.description),
      });
      goToRequisition(requisition.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setCreating(false);
    }
  };

  const submitAi = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const requisition = await apiPost<{ id: string }>(`/api/teams/${slug}/requisitions/draft-from-prompt`, {
        prompt,
      });
      toast.success('Draft created — review before submitting.');
      goToRequisition(requisition.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setCreating(false);
    }
  };

  const { data: requisitions, isLoading } = useQuery({
    queryKey: ['requisitions', slug],
    queryFn: () => apiFetch<Requisition[]>(`/api/teams/${slug}/requisitions`),
    enabled: !!slug,
  });

  const columns = useMemo<AppColumnDef<Requisition>[]>(
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
        accessorKey: 'createdAt',
        header: 'Created',
        size: 140,
        cell: ({ getValue }) => new Date(getValue<string>()).toLocaleDateString(),
      },
    ],
    []
  );

  return (
    <Layout title="Requisitions" icon={FileText} iconTone="blue">
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <ShopCatalogButton slug={slug} />
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            setMode('ai');
            setCreateOpen(true);
          }}
        >
          Draft with AI
        </button>
        <NewButton
          onClick={() => {
            setMode('manual');
            setCreateOpen(true);
          }}
          label="New requisition"
        />
      </div>

      <DataTable
        columns={columns}
        data={requisitions ?? []}
        isLoading={isLoading}
        searchPlaceholder="Filter requisitions…"
        emptyMessage="No requisitions yet"
        emptyDescription="Draft one yourself or describe what you need and let AI put together the line items."
        emptyIcon={FileText}
        getRowHref={(r) => `/teams/${slug}/requisitions/${r.id}`}
      />

      <SidebarModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={mode === 'ai' ? 'Draft a requisition with AI' : 'New requisition'}
        width="lg"
      >
        <div className="mb-4 flex gap-1 rounded-lg bg-gray-100 p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode('manual')}
            className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${
              mode === 'manual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Manual
          </button>
          <button
            type="button"
            onClick={() => setMode('ai')}
            className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${
              mode === 'ai' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Draft with AI
          </button>
        </div>

        {mode === 'ai' ? (
          <form onSubmit={submitAi} className="space-y-4">
            <div>
              <label className="label">Describe what you need</label>
              <textarea
                className="input min-h-32"
                placeholder="e.g. 20 standing desks for the new NYC office, budget around $8k, needed by end of next month"
                required
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
              <p className="mt-1 text-xs text-gray-500">
                The AI agent will draft a structured requisition with line items and estimated prices. You&apos;ll
                still review and submit it yourself.
              </p>
            </div>
            <button className="btn-primary w-full" type="submit" disabled={creating}>
              {creating ? 'Drafting…' : 'Draft with AI'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitManual} className="space-y-4">
            <div>
              <label className="label">Title</label>
              <input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="label">Justification</label>
              <textarea className="input" value={justification} onChange={(e) => setJustification(e.target.value)} />
            </div>

            <div>
              <label className="label">Line items</label>
              <div className="space-y-2">
                {lineItems.map((li, i) => (
                  <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                    <input
                      className="input sm:col-span-5"
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
                      className="input sm:col-span-2"
                      placeholder="Unit"
                      value={li.unit}
                      onChange={(e) => updateLine(i, { unit: e.target.value })}
                    />
                    <input
                      className="input sm:col-span-3"
                      type="number"
                      min={0}
                      placeholder="Est. unit price"
                      value={li.estimatedPrice}
                      onChange={(e) => updateLine(i, { estimatedPrice: Number(e.target.value) })}
                    />
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="btn-secondary mt-2"
                onClick={() => setLineItems((items) => [...items, blankLine])}
              >
                + Add line item
              </button>
            </div>

            <button className="btn-primary w-full" type="submit" disabled={creating}>
              {creating ? 'Creating…' : 'Create draft'}
            </button>
          </form>
        )}
      </SidebarModal>
    </Layout>
  );
}

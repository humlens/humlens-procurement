import { useMemo, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Receipt } from 'lucide-react';

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

type Invoice = {
  id: string;
  invoiceNumber: string;
  status: string;
  currency: string;
  totalAmount: string | number;
  vendor?: { name: string };
  purchaseOrder?: { poNumber: string } | null;
};

type LineItem = { description: string; quantity: number; unitPrice: number; poLineItemId?: string };
const blankLine: LineItem = { description: '', quantity: 1, unitPrice: 0 };

export default function Invoices() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  useNewHotkey(() => setCreateOpen(true));
  useOpenNewFromQuery(setCreateOpen);

  const [vendorId, setVendorId] = useState('');
  const [poId, setPoId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([blankLine]);
  const [creating, setCreating] = useState(false);

  const { data: vendors } = useQuery({
    queryKey: ['vendors', slug, 'active'],
    queryFn: () => apiFetch<any[]>(`/api/teams/${slug}/vendors?status=ACTIVE`),
    enabled: !!slug && createOpen,
  });

  const { data: pos } = useQuery({
    queryKey: ['purchase-orders', slug, 'for-vendor'],
    queryFn: () => apiFetch<any[]>(`/api/teams/${slug}/purchase-orders`),
    enabled: !!slug && createOpen,
  });

  const { data: po } = useQuery({
    queryKey: ['purchase-order', slug, poId],
    queryFn: () => apiFetch<any>(`/api/teams/${slug}/purchase-orders/${poId}`),
    enabled: !!slug && !!poId,
  });

  const vendorPOs = pos?.filter((p) => p.vendor?.id === vendorId || p.vendorId === vendorId);

  const updateLine = (i: number, patch: Partial<LineItem>) => {
    setLineItems((items) => items.map((li, idx) => (idx === i ? { ...li, ...patch } : li)));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const invoice = await apiPost<{ id: string }>(`/api/teams/${slug}/invoices`, {
        vendorId,
        poId: poId || undefined,
        invoiceNumber,
        currency: 'USD',
        tax: 0,
        lineItems: lineItems.filter((li) => li.description),
      });
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ['invoices', slug] });
      router.push(`/teams/${slug}/invoices/${invoice.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setCreating(false);
    }
  };

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['invoices', slug],
    queryFn: () => apiFetch<Invoice[]>(`/api/teams/${slug}/invoices`),
    enabled: !!slug,
  });

  const columns = useMemo<AppColumnDef<Invoice>[]>(
    () => [
      { accessorKey: 'invoiceNumber', header: 'Invoice #', size: 160 },
      { accessorFn: (i) => i.vendor?.name ?? '', id: 'vendor', header: 'Vendor', size: 240 },
      { accessorFn: (i) => i.purchaseOrder?.poNumber ?? '—', id: 'po', header: 'PO', size: 140 },
      {
        accessorKey: 'totalAmount',
        header: 'Total',
        size: 150,
        cell: ({ row }) => `${row.original.currency} ${Number(row.original.totalAmount).toLocaleString()}`,
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
    <Layout title="Invoices" icon={Receipt} iconTone="orange">
      <div className="mb-4 flex justify-end">
        <NewButton onClick={() => setCreateOpen(true)} label="Record invoice" />
      </div>

      <DataTable
        columns={columns}
        data={invoices ?? []}
        isLoading={isLoading}
        searchPlaceholder="Filter invoices…"
        emptyMessage="No invoices yet"
        emptyDescription="Record one against a purchase order and let the agent run the 3-way match."
        emptyIcon={Receipt}
        getRowHref={(i) => `/teams/${slug}/invoices/${i.id}`}
      />

      <SidebarModal open={createOpen} onClose={() => setCreateOpen(false)} title="Record invoice" width="lg">
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
            <label className="label">Purchase order (optional, enables auto-matching)</label>
            <select className="input" value={poId} onChange={(e) => setPoId(e.target.value)}>
              <option value="">No PO</option>
              {vendorPOs?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.poNumber}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Invoice number</label>
            <input className="input" required value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
          </div>

          <div>
            <label className="label">Line items</label>
            <div className="space-y-2">
              {lineItems.map((li, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                  <input
                    className="input sm:col-span-4"
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
                    type="number"
                    min={0}
                    placeholder="Unit price"
                    value={li.unitPrice}
                    onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })}
                  />
                  {po && (
                    <select
                      className="input sm:col-span-3"
                      value={li.poLineItemId || ''}
                      onChange={(e) => updateLine(i, { poLineItemId: e.target.value })}
                    >
                      <option value="">Match to PO line…</option>
                      {po.lineItems.map((pli: any) => (
                        <option key={pli.id} value={pli.id}>
                          {pli.description}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
            <button type="button" className="btn-secondary mt-2" onClick={() => setLineItems((items) => [...items, blankLine])}>
              + Add line item
            </button>
          </div>

          <button className="btn-primary w-full" type="submit" disabled={creating}>
            {creating ? 'Recording…' : 'Record invoice'}
          </button>
        </form>
      </SidebarModal>
    </Layout>
  );
}

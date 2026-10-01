import { useEffect, useMemo, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import type { Role } from '@prisma/client';
import { Plus, ShoppingCart } from 'lucide-react';

import Layout from '@/components/Layout';
import Badge from '@/components/Badge';
import DataTable, { type AppColumnDef } from '@/components/DataTable';
import NewButton from '@/components/NewButton';
import SidebarModal from '@/components/SidebarModal';
import VendorForm from '@/components/forms/VendorForm';
import { apiFetch, apiPost } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';
import { can } from '@/lib/permissions';
import { useNewHotkey } from '@/lib/useNewHotkey';
import { useOpenNewFromQuery } from '@/lib/useOpenNewFromQuery';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

type PO = {
  id: string;
  poNumber: string;
  status: string;
  currency: string;
  totalAmount: string | number;
  expectedDeliveryDate: string | null;
  createdAt: string;
  vendor?: { name: string };
};

type VendorOption = { id: string; name: string; status: string };

const NEW_VENDOR = '__new__';

type LineItem = { description: string; quantity: number; unit: string; unitPrice: number };
const blankLine: LineItem = { description: '', quantity: 1, unit: '', unitPrice: 0 };

export default function PurchaseOrders({ role }: { role: Role }) {
  const router = useRouter();
  const slug = router.query.slug as string;
  const requisitionId = router.query.requisitionId as string | undefined;
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  useNewHotkey(() => setCreateOpen(true));
  useOpenNewFromQuery(setCreateOpen);
  // Also open when arriving with just ?requisitionId= (no ?new=1), e.g. a
  // "Convert to PO" link from the requisition detail page.
  useEffect(() => {
    if (requisitionId) setCreateOpen(true);
  }, [requisitionId]);

  const [vendorId, setVendorId] = useState('');
  const [newVendorOpen, setNewVendorOpen] = useState(false);
  // New vendors normally wait for approval; members who can approve vendors
  // can add one here already active, so it's usable on this order at once.
  const canAddVendor = can(role, 'vendor', 'create') && can(role, 'vendor', 'update');
  const [lineItems, setLineItems] = useState<LineItem[]>([blankLine]);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [creating, setCreating] = useState(false);

  const { data: vendors } = useQuery({
    queryKey: ['vendors', slug],
    queryFn: () => apiFetch<VendorOption[]>(`/api/teams/${slug}/vendors?status=ACTIVE`),
    enabled: !!slug && createOpen,
  });

  const { data: requisition } = useQuery({
    queryKey: ['requisition', slug, requisitionId],
    queryFn: () => apiFetch<any>(`/api/teams/${slug}/requisitions/${requisitionId}`),
    enabled: !!slug && !!requisitionId,
  });

  useEffect(() => {
    if (requisition) {
      setLineItems(
        requisition.lineItems.map((li: any) => ({
          description: li.description,
          quantity: Number(li.quantity),
          unit: li.unit || '',
          unitPrice: Number(li.estimatedPrice),
        }))
      );
    }
  }, [requisition]);

  const updateLine = (i: number, patch: Partial<LineItem>) => {
    setLineItems((items) => items.map((li, idx) => (idx === i ? { ...li, ...patch } : li)));
  };

  const closeModal = () => {
    setCreateOpen(false);
    setVendorId('');
    setNewVendorOpen(false);
    setLineItems([blankLine]);
    setExpectedDeliveryDate('');
    if (requisitionId) {
      const { requisitionId: _r, ...rest } = router.query;
      router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
    }
  };

  const onVendorCreated = (vendor: VendorOption) => {
    queryClient.setQueryData<VendorOption[]>(['vendors', slug], (current = []) =>
      [...current.filter((v) => v.id !== vendor.id), vendor].sort((a, b) => a.name.localeCompare(b.name))
    );
    queryClient.invalidateQueries({ queryKey: ['vendors', slug] });
    setVendorId(vendor.id);
    setNewVendorOpen(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorId) {
      toast.error('Select a vendor.');
      return;
    }
    setCreating(true);
    try {
      const po = await apiPost<{ id: string }>(`/api/teams/${slug}/purchase-orders`, {
        vendorId,
        requisitionId,
        currency: 'USD',
        tax: 0,
        shipping: 0,
        expectedDeliveryDate: expectedDeliveryDate || undefined,
        lineItems: lineItems.filter((li) => li.description),
      });
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ['purchase-orders', slug] });
      router.push(`/teams/${slug}/purchase-orders/${po.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setCreating(false);
    }
  };

  const { data: pos, isLoading } = useQuery({
    queryKey: ['purchase-orders', slug],
    queryFn: () => apiFetch<PO[]>(`/api/teams/${slug}/purchase-orders`),
    enabled: !!slug,
  });

  const columns = useMemo<AppColumnDef<PO>[]>(
    () => [
      { accessorKey: 'poNumber', header: 'PO #', size: 140 },
      { accessorFn: (p) => p.vendor?.name ?? '', id: 'vendor', header: 'Vendor', size: 260 },
      {
        accessorKey: 'totalAmount',
        header: 'Total',
        size: 150,
        cell: ({ row }) => `${row.original.currency} ${Number(row.original.totalAmount).toLocaleString()}`,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        size: 170,
        cell: ({ getValue }) => <Badge status={getValue<string>()} />,
      },
      {
        accessorKey: 'expectedDeliveryDate',
        header: 'Promised by',
        size: 140,
        // A date without a time, so show it as stored rather than shifted to local time.
        cell: ({ getValue }) => (getValue<string | null>() ? new Date(getValue<string>()).toLocaleDateString(undefined, { timeZone: 'UTC' }) : '—'),
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
    <Layout title="Purchase Orders" icon={ShoppingCart} iconTone="violet">
      <div className="mb-4 flex justify-end">
        <NewButton onClick={() => setCreateOpen(true)} label="New purchase order" />
      </div>

      <DataTable
        columns={columns}
        data={pos ?? []}
        isLoading={isLoading}
        searchPlaceholder="Filter purchase orders…"
        emptyMessage="No purchase orders yet"
        emptyDescription="Issue one directly, or convert an approved requisition into a PO."
        emptyIcon={ShoppingCart}
        getRowHref={(p) => `/teams/${slug}/purchase-orders/${p.id}`}
      />

      <SidebarModal open={createOpen} onClose={closeModal} title="New purchase order" width="lg">
        <div className="space-y-4">
          {requisitionId && (
            <p className="rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-700">
              Converting requisition {requisitionId} — line items pre-filled from the requisition.
            </p>
          )}

          {/* Outside the PO form: the inline vendor form is a form of its own. */}
          <div>
            <div className="flex items-center justify-between">
              <label className="label" htmlFor="po-vendor">
                Vendor
              </label>
              {canAddVendor && !newVendorOpen && (
                <button
                  type="button"
                  className="mb-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800"
                  onClick={() => setNewVendorOpen(true)}
                >
                  <Plus size={12} />
                  New vendor
                </button>
              )}
            </div>
            {newVendorOpen ? (
              <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-4">
                <p className="text-sm font-medium text-gray-900">New vendor</p>
                <p className="mb-3 mt-0.5 text-xs text-gray-500">It&apos;s approved straight away and selected for this order.</p>
                <VendorForm
                  slug={slug}
                  activate
                  submitLabel="Create and select"
                  onCancel={() => setNewVendorOpen(false)}
                  onSuccess={onVendorCreated}
                />
              </div>
            ) : (
              <>
                <select
                  id="po-vendor"
                  form="new-po-form"
                  className="input"
                  required
                  value={vendorId}
                  onChange={(e) => (e.target.value === NEW_VENDOR ? setNewVendorOpen(true) : setVendorId(e.target.value))}
                >
                  <option value="">Select a vendor…</option>
                  {vendors?.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                  {canAddVendor && <option value={NEW_VENDOR}>+ Create a new vendor…</option>}
                </select>
                {vendors?.length === 0 && (
                  <p className="mt-1.5 text-xs text-gray-500">
                    {canAddVendor
                      ? 'No active vendors yet — create one to continue.'
                      : 'No active vendors yet. Ask an admin to add or approve one.'}
                  </p>
                )}
              </>
            )}
          </div>

          <form id="new-po-form" onSubmit={submit} className="space-y-4">
            <div>
              <label className="label" htmlFor="po-delivery-date">
                Promised delivery date <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                id="po-delivery-date"
                className="input sm:w-56"
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
              />
              <p className="mt-1 text-xs text-gray-500">Counts towards the vendor&apos;s on-time delivery rate.</p>
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
                      placeholder="Unit price"
                      value={li.unitPrice}
                      onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })}
                    />
                  </div>
                ))}
              </div>
              <button type="button" className="btn-secondary mt-2" onClick={() => setLineItems((items) => [...items, blankLine])}>
                + Add line item
              </button>
            </div>

            <button className="btn-primary w-full" type="submit" disabled={creating}>
              {creating ? 'Creating…' : 'Create purchase order'}
            </button>
          </form>
        </div>
      </SidebarModal>
    </Layout>
  );
}

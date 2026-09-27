import { useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Pencil } from 'lucide-react';

import Layout from '@/components/Layout';
import Badge from '@/components/Badge';
import SidebarModal from '@/components/SidebarModal';
import VendorForm from '@/components/forms/VendorForm';
import { apiFetch, apiPut } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

export default function VendorDetail() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const id = router.query.id as string;
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const { data: vendor } = useQuery({
    queryKey: ['vendor', slug, id],
    queryFn: () => apiFetch<any>(`/api/teams/${slug}/vendors/${id}`),
    enabled: !!slug && !!id,
  });

  const setStatus = async (status: string) => {
    setBusy(true);
    try {
      await apiPut(`/api/teams/${slug}/vendors/${id}`, { status });
      toast.success('Updated.');
      queryClient.invalidateQueries({ queryKey: ['vendor', slug, id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (!vendor) {
    return (
      <Layout title="Vendor">
        <p className="text-gray-400">Loading…</p>
      </Layout>
    );
  }

  return (
    <Layout title={vendor.name}>
      <div className="mb-4 flex items-center gap-3">
        <Badge status={vendor.status} />
        {vendor.rating && <span className="text-sm text-gray-500">Rating: {vendor.rating.toFixed(1)}/5</span>}
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700"
        >
          <Pencil size={13} /> Edit
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card">
            <h2 className="mb-3 font-medium">Details</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-gray-500">Email</dt>
                <dd>{vendor.email || '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Phone</dt>
                <dd>{vendor.phone || '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Payment terms</dt>
                <dd>{vendor.paymentTerms || '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Preferred currency</dt>
                <dd>{vendor.preferredCurrency}</dd>
              </div>
            </dl>
          </div>

          <div className="card">
            <h2 className="mb-3 font-medium">Recent purchase orders</h2>
            <ul className="divide-y divide-gray-100 text-sm">
              {vendor.purchaseOrders?.map((po: any) => (
                <li key={po.id} className="flex items-center justify-between py-2">
                  <span>{po.poNumber}</span>
                  <Badge status={po.status} />
                </li>
              ))}
              {vendor.purchaseOrders?.length === 0 && <li className="py-2 text-gray-400">None yet.</li>}
            </ul>
          </div>
        </div>

        <div className="card space-y-2">
          {vendor.status === 'PENDING_APPROVAL' && (
            <button className="btn-primary w-full" onClick={() => setStatus('ACTIVE')} disabled={busy}>
              Approve vendor
            </button>
          )}
          {vendor.status === 'ACTIVE' && (
            <button className="btn-secondary w-full" onClick={() => setStatus('INACTIVE')} disabled={busy}>
              Mark inactive
            </button>
          )}
          {vendor.status !== 'BLOCKED' && (
            <button className="btn-danger w-full" onClick={() => setStatus('BLOCKED')} disabled={busy}>
              Block vendor
            </button>
          )}
        </div>
      </div>

      <SidebarModal open={editOpen} onClose={() => setEditOpen(false)} title="Edit vendor">
        <VendorForm
          slug={slug}
          vendorId={id}
          initialValues={vendor}
          onSuccess={() => {
            setEditOpen(false);
            queryClient.invalidateQueries({ queryKey: ['vendor', slug, id] });
          }}
        />
      </SidebarModal>
    </Layout>
  );
}

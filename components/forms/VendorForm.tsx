import { useState } from 'react';
import toast from 'react-hot-toast';

import { apiPost, apiPut } from '@/lib/fetcher';

type VendorFormValues = { name: string; email: string; phone: string; paymentTerms: string };

// Shared by the vendors list page (create, inside a SidebarModal) and the
// vendor detail page (edit, inside the same modal) so the field list and
// submit logic only exist once.
export default function VendorForm({
  slug,
  vendorId,
  initialValues,
  onSuccess,
}: {
  slug: string;
  vendorId?: string;
  initialValues?: Partial<VendorFormValues>;
  onSuccess: (vendor: { id: string }) => void;
}) {
  const [form, setForm] = useState<VendorFormValues>({
    name: initialValues?.name ?? '',
    email: initialValues?.email ?? '',
    phone: initialValues?.phone ?? '',
    paymentTerms: initialValues?.paymentTerms ?? 'NET30',
  });
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const vendor = vendorId
        ? await apiPut<{ id: string }>(`/api/teams/${slug}/vendors/${vendorId}`, form)
        : await apiPost<{ id: string }>(`/api/teams/${slug}/vendors`, form);
      toast.success(vendorId ? 'Vendor updated.' : 'Vendor created.');
      onSuccess(vendor);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label">Name</label>
        <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div>
        <label className="label">Email</label>
        <input
          className="input"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </div>
      <div>
        <label className="label">Phone</label>
        <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </div>
      <div>
        <label className="label">Payment terms</label>
        <input
          className="input"
          value={form.paymentTerms}
          onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}
        />
      </div>
      <button className="btn-primary w-full" type="submit" disabled={loading}>
        {loading ? (vendorId ? 'Saving…' : 'Creating…') : vendorId ? 'Save changes' : 'Create vendor'}
      </button>
    </form>
  );
}

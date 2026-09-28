import { useState } from 'react';
import toast from 'react-hot-toast';

import { apiPost, apiPut } from '@/lib/fetcher';

type VendorFormValues = { name: string; email: string; phone: string; paymentTerms: string };

// Shared by the vendors list page (create, inside a SidebarModal), the
// vendor detail page (edit, inside the same modal), and the new purchase
// order panel (quick create, inline) so the field list and submit logic only
// exist once.
export default function VendorForm({
  slug,
  vendorId,
  initialValues,
  onSuccess,
  onCancel,
  activate = false,
  submitLabel,
}: {
  slug: string;
  vendorId?: string;
  initialValues?: Partial<VendorFormValues>;
  onSuccess: (vendor: { id: string; name: string; status: string }) => void;
  onCancel?: () => void;
  /** Create the vendor already approved (Active) — the API only allows this for members who can approve vendors. */
  activate?: boolean;
  submitLabel?: string;
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
      type Saved = { id: string; name: string; status: string };
      const vendor = vendorId
        ? await apiPut<Saved>(`/api/teams/${slug}/vendors/${vendorId}`, form)
        : await apiPost<Saved>(`/api/teams/${slug}/vendors`, activate ? { ...form, activate: true } : form);
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
        <input
          className="input"
          required
          autoFocus={Boolean(onCancel)}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
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
      <div className="flex gap-2">
        {onCancel && (
          <button className="btn-secondary flex-1" type="button" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
        )}
        <button className="btn-primary flex-1" type="submit" disabled={loading}>
          {loading ? (vendorId ? 'Saving…' : 'Creating…') : (submitLabel ?? (vendorId ? 'Save changes' : 'Create vendor'))}
        </button>
      </div>
    </form>
  );
}

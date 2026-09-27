import { useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import SettingsLayout from '@/components/settings/SettingsLayout';
import { settingsTabs } from '@/components/settings/tabs';
import { apiFetch, apiPost } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

const roles = ['APPROVER', 'ADMIN', 'FINANCE', 'OWNER'];

type Workflow = {
  id: string;
  name: string;
  minAmount: string | number;
  maxAmount: string | number | null;
  approverRoles: string[];
  isDefault: boolean;
};

export default function ApprovalWorkflowsSettings({ role }: { role: string }) {
  const router = useRouter();
  const slug = router.query.slug as string;
  const queryClient = useQueryClient();
  const canEdit = role === 'OWNER' || role === 'ADMIN';

  const [form, setForm] = useState({ name: '', minAmount: 0, maxAmount: '', approverRoles: [] as string[], isDefault: false });
  const [loading, setLoading] = useState(false);

  const { data: workflows } = useQuery({
    queryKey: ['approval-workflows', slug],
    queryFn: () => apiFetch<Workflow[]>(`/api/teams/${slug}/approval-workflows`),
    enabled: !!slug,
  });

  const toggleRole = (r: string) => {
    setForm((f) => ({
      ...f,
      approverRoles: f.approverRoles.includes(r) ? f.approverRoles.filter((x) => x !== r) : [...f.approverRoles, r],
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.approverRoles.length === 0) {
      toast.error('Pick at least one approver role.');
      return;
    }
    setLoading(true);
    try {
      await apiPost(`/api/teams/${slug}/approval-workflows`, {
        name: form.name,
        minAmount: form.minAmount,
        maxAmount: form.maxAmount ? Number(form.maxAmount) : undefined,
        approverRoles: form.approverRoles,
        isDefault: form.isDefault,
      });
      toast.success('Approval workflow created.');
      setForm({ name: '', minAmount: 0, maxAmount: '', approverRoles: [], isDefault: false });
      queryClient.invalidateQueries({ queryKey: ['approval-workflows', slug] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SettingsLayout
      tabs={settingsTabs}
      active="approval-workflows"
      description="Requisitions are routed through approval steps based on which amount band they fall into. A requisition above every configured band falls back to a single Admin approval."
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <h2 className="section-title mb-3">Amount bands</h2>
          <div className="space-y-2">
            {workflows
              ?.slice()
              .sort((a, b) => Number(a.minAmount) - Number(b.minAmount))
              .map((w) => (
                <div key={w.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3.5 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {w.name}
                      {w.isDefault && (
                        <span className="badge ml-2 bg-brand-50 text-brand-700 ring-brand-600/20">Default</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">
                      ${Number(w.minAmount).toLocaleString()}
                      {w.maxAmount ? ` – $${Number(w.maxAmount).toLocaleString()}` : '+'} · requires{' '}
                      {w.approverRoles.join(' → ')}
                    </p>
                  </div>
                </div>
              ))}
            {workflows?.length === 0 && (
              <p className="py-6 text-center text-sm text-gray-400">
                No amount bands configured yet — every requisition falls back to a single Admin approval.
              </p>
            )}
          </div>
        </div>

        {canEdit ? (
          <form onSubmit={submit} className="card space-y-3">
            <h2 className="section-title">New band</h2>
            <div>
              <label className="label">Name</label>
              <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Min amount</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={form.minAmount}
                  onChange={(e) => setForm({ ...form, minAmount: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="label">Max amount</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  placeholder="No limit"
                  value={form.maxAmount}
                  onChange={(e) => setForm({ ...form, maxAmount: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="label">Approval sequence</label>
              <div className="flex flex-wrap gap-1.5">
                {roles.map((r) => (
                  <button
                    type="button"
                    key={r}
                    onClick={() => toggleRole(r)}
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                      form.approverRoles.includes(r)
                        ? 'border-brand-600 bg-brand-50 text-brand-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {r}
                    {form.approverRoles.includes(r) && ` (${form.approverRoles.indexOf(r) + 1})`}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-gray-400">Tap in order — the requisition must clear each role in sequence.</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
              Use as fallback for amounts outside every band
            </label>
            <button className="btn-primary w-full" type="submit" disabled={loading}>
              {loading ? 'Creating…' : 'Create band'}
            </button>
          </form>
        ) : (
          <div className="card">
            <p className="text-sm text-gray-500">Only Owners and Admins can configure approval workflows.</p>
          </div>
        )}
      </div>
    </SettingsLayout>
  );
}

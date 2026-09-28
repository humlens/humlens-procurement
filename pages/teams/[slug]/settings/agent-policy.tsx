import { useEffect, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import AiModelCard from '@/components/settings/AiModelCard';
import SettingsLayout from '@/components/settings/SettingsLayout';
import { settingsTabs } from '@/components/settings/tabs';
import { apiFetch, apiPut } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

export default function AgentPolicySettings() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const [form, setForm] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const { data: policy } = useQuery({
    queryKey: ['agent-policy', slug],
    queryFn: () => apiFetch<any>(`/api/teams/${slug}/agent-policy`),
    enabled: !!slug,
  });

  useEffect(() => {
    if (policy) setForm(policy);
  }, [policy]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiPut(`/api/teams/${slug}/agent-policy`, {
        autoApproveEnabled: form.autoApproveEnabled,
        autoApproveMaxAmount: Number(form.autoApproveMaxAmount),
        autoMatchInvoices: form.autoMatchInvoices,
        autoMatchTolerancePct: Number(form.autoMatchTolerancePct),
        autoDraftRfqOutreach: form.autoDraftRfqOutreach,
        spendAnomalyThresholdPct: Number(form.spendAnomalyThresholdPct),
      });
      toast.success('Policy updated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  if (!form) {
    return (
      <SettingsLayout tabs={settingsTabs} active="agent-policy">
        <p className="text-gray-400">Loading…</p>
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout
      tabs={settingsTabs}
      active="agent-policy"
      description="These limits govern what the autonomous procurement agents may do without a human in the loop. A hard platform-wide ceiling always applies on top of whatever is set here."
    >
      <form onSubmit={save} className="card max-w-xl space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Auto-approve requisitions</p>
            <p className="text-xs text-gray-500">Let the agent clear the current approval step within a limit.</p>
          </div>
          <input
            type="checkbox"
            checked={form.autoApproveEnabled}
            onChange={(e) => setForm({ ...form, autoApproveEnabled: e.target.checked })}
          />
        </div>
        {form.autoApproveEnabled && (
          <div>
            <label className="label">Auto-approve ceiling (USD)</label>
            <input
              className="input"
              type="number"
              min={0}
              value={form.autoApproveMaxAmount}
              onChange={(e) => setForm({ ...form, autoApproveMaxAmount: e.target.value })}
            />
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Auto-match invoices (3-way match)</p>
            <p className="text-xs text-gray-500">Run PO × receipt × invoice matching automatically on intake.</p>
          </div>
          <input
            type="checkbox"
            checked={form.autoMatchInvoices}
            onChange={(e) => setForm({ ...form, autoMatchInvoices: e.target.checked })}
          />
        </div>
        {form.autoMatchInvoices && (
          <div>
            <label className="label">Price match tolerance (%)</label>
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              value={form.autoMatchTolerancePct}
              onChange={(e) => setForm({ ...form, autoMatchTolerancePct: e.target.value })}
            />
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Auto-draft RFQ outreach</p>
            <p className="text-xs text-gray-500">Let the agent draft vendor emails for new RFQs.</p>
          </div>
          <input
            type="checkbox"
            checked={form.autoDraftRfqOutreach}
            onChange={(e) => setForm({ ...form, autoDraftRfqOutreach: e.target.checked })}
          />
        </div>

        <div>
          <label className="label">Spend anomaly alert threshold (%)</label>
          <input
            className="input"
            type="number"
            min={0}
            max={100}
            value={form.spendAnomalyThresholdPct}
            onChange={(e) => setForm({ ...form, spendAnomalyThresholdPct: e.target.value })}
          />
        </div>

        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? 'Saving…' : 'Save policy'}
        </button>
      </form>

      <div className="mt-6">
        <AiModelCard slug={slug} />
      </div>
    </SettingsLayout>
  );
}

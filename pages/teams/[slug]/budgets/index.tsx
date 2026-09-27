import { useMemo, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Wallet } from 'lucide-react';

import Layout from '@/components/Layout';
import EmptyState from '@/components/EmptyState';
import HorizontalBarChart from '@/components/charts/HorizontalBarChart';
import NewButton from '@/components/NewButton';
import SidebarModal from '@/components/SidebarModal';
import { apiFetch, apiPost } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';
import { useNewHotkey } from '@/lib/useNewHotkey';
import { useOpenNewFromQuery } from '@/lib/useOpenNewFromQuery';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

export default function Budgets() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  useNewHotkey(() => setCreateOpen(true));
  useOpenNewFromQuery(setCreateOpen);

  const [name, setName] = useState('');
  const [period, setPeriod] = useState('ANNUAL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [allocatedAmount, setAllocatedAmount] = useState(0);
  const [creating, setCreating] = useState(false);

  const { data: budgets, isLoading } = useQuery({
    queryKey: ['budgets', slug],
    queryFn: () => apiFetch<any[]>(`/api/teams/${slug}/budgets`),
    enabled: !!slug,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await apiPost(`/api/teams/${slug}/budgets`, {
        name,
        period,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        allocatedAmount,
        currency: 'USD',
      });
      toast.success('Budget created.');
      setCreateOpen(false);
      setName('');
      setStartDate('');
      setEndDate('');
      setAllocatedAmount(0);
      queryClient.invalidateQueries({ queryKey: ['budgets', slug] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setCreating(false);
    }
  };

  const utilization = useMemo(
    () =>
      (budgets ?? []).map((b) => ({
        label: b.name,
        value: Math.round(
          Math.min(100, ((Number(b.committedAmount) + Number(b.spentAmount)) / Number(b.allocatedAmount)) * 100 || 0)
        ),
      })),
    [budgets]
  );

  return (
    <Layout title="Budgets" icon={Wallet} iconTone="amber">
      <div className="mb-4 flex justify-end">
        <NewButton onClick={() => setCreateOpen(true)} label="New budget" />
      </div>

      {utilization.length > 0 && (
        <div className="card mb-6">
          <h2 className="section-title mb-3">Budget utilization</h2>
          <HorizontalBarChart data={utilization} ariaLabel="Budget utilization percentage" valueFormat={(v) => `${v}%`} />
        </div>
      )}

      {!isLoading && budgets?.length === 0 && (
        <div className="card">
          <EmptyState
            icon={Wallet}
            title="No budgets yet"
            description="Allocate a budget per department or category to track committed and spent amounts."
            tone="emerald"
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {budgets?.map((b) => {
          const used = Number(b.committedAmount) + Number(b.spentAmount);
          const pct = Math.min(100, (used / Number(b.allocatedAmount)) * 100 || 0);
          return (
            <div key={b.id} className="card">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{b.name}</h3>
                <span className="text-xs text-gray-500">{b.period}</span>
              </div>
              {b.department && <p className="text-xs text-gray-500">{b.department.name}</p>}
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-brand-600'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-sm">
                <span>
                  {b.currency} {used.toLocaleString()} used
                </span>
                <span className="text-gray-500">of {Number(b.allocatedAmount).toLocaleString()}</span>
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {b.currency} {b.availableAmount.toLocaleString()} available
              </div>
            </div>
          );
        })}
      </div>

      <SidebarModal open={createOpen} onClose={() => setCreateOpen(false)} title="New budget">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Period</label>
            <select className="input" value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="MONTHLY">Monthly</option>
              <option value="QUARTERLY">Quarterly</option>
              <option value="ANNUAL">Annual</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Start date</label>
              <input className="input" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="label">End date</label>
              <input className="input" type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Allocated amount (USD)</label>
            <input
              className="input"
              type="number"
              min={0}
              required
              value={allocatedAmount}
              onChange={(e) => setAllocatedAmount(Number(e.target.value))}
            />
          </div>
          <button className="btn-primary w-full" type="submit" disabled={creating}>
            {creating ? 'Creating…' : 'Create budget'}
          </button>
        </form>
      </SidebarModal>
    </Layout>
  );
}

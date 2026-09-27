import { useMemo, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Sparkles } from 'lucide-react';

import Layout from '@/components/Layout';
import Badge from '@/components/Badge';
import DataTable, { type AppColumnDef } from '@/components/DataTable';
import HorizontalBarChart from '@/components/charts/HorizontalBarChart';
import { apiFetch, apiPost } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

type AgentAction = {
  id: string;
  type: string;
  status: string;
  reasoning: string | null;
  createdAt: string;
};

export default function AgentActions() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data: actions, isLoading } = useQuery({
    queryKey: ['agent-actions', slug],
    queryFn: () => apiFetch<AgentAction[]>(`/api/teams/${slug}/agent-actions`),
    enabled: !!slug,
  });

  const runSpendCheck = async () => {
    setBusy(true);
    try {
      const result = await apiPost(`/api/teams/${slug}/agent-actions`);
      toast.success(result ? 'Anomaly found — see below.' : 'No spend anomalies detected.');
      queryClient.invalidateQueries({ queryKey: ['agent-actions', slug] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const columns = useMemo<AppColumnDef<AgentAction>[]>(
    () => [
      {
        accessorKey: 'type',
        header: 'Type',
        size: 240,
        cell: ({ getValue }) => getValue<string>().replaceAll('_', ' '),
      },
      { accessorKey: 'reasoning', header: 'Reasoning', size: 420 },
      {
        accessorKey: 'status',
        header: 'Status',
        size: 170,
        cell: ({ getValue }) => <Badge status={getValue<string>()} />,
      },
      {
        accessorKey: 'createdAt',
        header: 'When',
        size: 180,
        cell: ({ getValue }) => new Date(getValue<string>()).toLocaleString(),
      },
    ],
    []
  );

  const typeBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of actions ?? []) {
      counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([label, value]) => ({ label: label.replaceAll('_', ' '), value }))
      .sort((a, b) => b.value - a.value);
  }, [actions]);

  return (
    <Layout title="AI Agent Activity" icon={Sparkles} iconTone="purple">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Every autonomous decision the procurement agents make — or decline to make — is logged here for review.
        </p>
        <button className="btn-secondary" onClick={runSpendCheck} disabled={busy}>
          Run spend anomaly check
        </button>
      </div>

      {typeBreakdown.length > 0 && (
        <div className="card mb-6">
          <h2 className="section-title mb-3">Actions by type</h2>
          <HorizontalBarChart data={typeBreakdown} ariaLabel="Agent actions by type" color="#6366f1" />
        </div>
      )}

      <DataTable
        columns={columns}
        data={actions ?? []}
        isLoading={isLoading}
        searchPlaceholder="Filter agent activity…"
        emptyMessage="No agent activity yet"
        emptyDescription="The agent logs a decision here every time it auto-approves, matches, or declines to act."
        emptyIcon={Sparkles}
      />
    </Layout>
  );
}

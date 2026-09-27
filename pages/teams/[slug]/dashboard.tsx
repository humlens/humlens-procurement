import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, FileText, ShoppingCart, Wallet, Sparkles, ArrowRight } from 'lucide-react';

import Layout from '@/components/Layout';
import StatCard from '@/components/StatCard';
import Badge from '@/components/Badge';
import { apiFetch } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

export default function Dashboard({ role }: { role: string }) {
  const router = useRouter();
  const slug = router.query.slug as string;

  const { data: requisitions } = useQuery({
    queryKey: ['requisitions', slug],
    queryFn: () => apiFetch<any[]>(`/api/teams/${slug}/requisitions`),
    enabled: !!slug,
  });
  const { data: purchaseOrders } = useQuery({
    queryKey: ['purchase-orders', slug],
    queryFn: () => apiFetch<any[]>(`/api/teams/${slug}/purchase-orders`),
    enabled: !!slug,
  });
  const { data: budgets } = useQuery({
    queryKey: ['budgets', slug],
    queryFn: () => apiFetch<any[]>(`/api/teams/${slug}/budgets`),
    enabled: !!slug,
  });
  const { data: agentActions } = useQuery({
    queryKey: ['agent-actions', slug],
    queryFn: () => apiFetch<any[]>(`/api/teams/${slug}/agent-actions`),
    enabled: !!slug,
  });

  const pendingApproval = requisitions?.filter((r) => r.status === 'IN_APPROVAL' || r.status === 'SUBMITTED').length ?? 0;
  const openPOs = purchaseOrders?.filter((p) => ['ISSUED', 'PARTIALLY_RECEIVED'].includes(p.status)).length ?? 0;
  const totalAvailable = budgets?.reduce((sum, b) => sum + b.availableAmount, 0) ?? 0;
  const autoActions = agentActions?.filter((a) => a.status === 'EXECUTED').length ?? 0;

  return (
    <Layout title="Dashboard" icon={LayoutDashboard} iconTone="brand">
      <div className="mb-6 flex items-center gap-2">
        <span className="badge bg-gray-100 text-gray-600 ring-gray-500/10">Signed in as {role}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Awaiting approval" value={String(pendingApproval)} icon={FileText} tone="amber" />
        <StatCard label="Open purchase orders" value={String(openPOs)} icon={ShoppingCart} tone="brand" />
        <StatCard label="Budget available" value={`$${totalAvailable.toLocaleString()}`} icon={Wallet} tone="emerald" />
        <StatCard
          label="Agent actions executed"
          value={String(autoActions)}
          sub="this session"
          icon={Sparkles}
          tone="violet"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card p-0">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
            <h2 className="section-title">Recent requisitions</h2>
            <Link
              href={`/teams/${slug}/requisitions`}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              View all <ArrowRight size={13} />
            </Link>
          </div>
          <ul className="divide-y divide-gray-100 px-2 py-1">
            {requisitions?.slice(0, 6).map((r) => (
              <li key={r.id}>
                <Link
                  href={`/teams/${slug}/requisitions/${r.id}`}
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm hover:bg-gray-50"
                >
                  <span className="truncate pr-3 text-gray-700">{r.title}</span>
                  <Badge status={r.status} />
                </Link>
              </li>
            ))}
            {requisitions?.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-gray-400">No requisitions yet.</li>
            )}
          </ul>
        </div>

        <div className="card p-0">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
            <h2 className="section-title">Recent AI agent activity</h2>
            <Link
              href={`/teams/${slug}/agent-actions`}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              View all <ArrowRight size={13} />
            </Link>
          </div>
          <ul className="divide-y divide-gray-100 px-2 py-1">
            {agentActions?.slice(0, 6).map((a) => (
              <li key={a.id} className="rounded-lg px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-700">{a.type.replaceAll('_', ' ')}</span>
                  <Badge status={a.status} />
                </div>
                {a.reasoning && <p className="mt-1 text-xs leading-relaxed text-gray-400">{a.reasoning}</p>}
              </li>
            ))}
            {agentActions?.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-gray-400">No agent activity yet.</li>
            )}
          </ul>
        </div>
      </div>
    </Layout>
  );
}

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';

import { apiFetch } from '@/lib/fetcher';

// Dashboard banner when messages to connected apps (stock updates to the
// store, purchase requests, receipts…) have stopped getting through.
export default function IntegrationAlert({ slug }: { slug: string }) {
  const { data } = useQuery({
    queryKey: ['integrations', slug],
    queryFn: () => apiFetch<{ health: { failed: number; pending: number } }>(`/api/teams/${slug}/integrations`),
    enabled: !!slug,
    refetchInterval: 60_000,
  });
  const failed = data?.health.failed ?? 0;
  if (!failed) return null;

  return (
    <Link
      href={`/teams/${slug}/settings/integrations`}
      className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 hover:bg-red-100"
    >
      <AlertTriangle size={18} className="shrink-0" />
      <span className="flex-1">
        <span className="font-medium">
          {failed} update{failed === 1 ? '' : 's'} to connected apps couldn’t be delivered.
        </span>{' '}
        Review and retry them in Settings → Integrations.
      </span>
    </Link>
  );
}

import { useMemo } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { Role } from '@prisma/client';
import { ScrollText } from 'lucide-react';

import SettingsLayout from '@/components/settings/SettingsLayout';
import { settingsTabs } from '@/components/settings/tabs';
import DataTable, { type AppColumnDef } from '@/components/DataTable';
import { apiFetch } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';
import { can } from '@/lib/permissions';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

type AuditEntry = {
  id: string;
  actorName: string;
  actorEmail: string | null;
  source: 'APP' | 'API_KEY' | 'MCP';
  resource: string;
  action: string;
  targetId: string | null;
  targetLabel: string | null;
  ipAddress: string | null;
  createdAt: string;
};

type AuditPage = { entries: AuditEntry[]; nextCursor: string | null };

const verbs: Record<string, string> = {
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  approve: 'Approved',
  reject: 'Rejected',
  override: 'Overrode',
  issue: 'Issued',
  cancel: 'Cancelled',
  complete: 'Completed',
  start: 'Started',
  submit: 'Submitted',
  receive: 'Received',
  transfer: 'Transferred',
  adjust: 'Adjusted',
  count: 'Counted',
  configure: 'Configured',
  invite: 'Sent',
  revoke: 'Revoked',
  match: 'Matched',
  pay: 'Paid',
  draft_outreach: 'Drafted outreach for',
};

const resourceNames: Record<string, string> = {
  team_invitation: 'invitation',
  api_key: 'API key',
  rfq: 'RFQ',
};

const describeEvent = (entry: Pick<AuditEntry, 'resource' | 'action'>) => {
  if (entry.action === 'run' && entry.resource === 'agent_action') return 'Ran agent checks';
  const verb = verbs[entry.action] ?? entry.action.replaceAll('_', ' ');
  const resource = resourceNames[entry.resource] ?? entry.resource.replaceAll('_', ' ');
  return `${verb} ${resource}`;
};

const sourceLabels: Record<AuditEntry['source'], string> = { APP: 'Web app', API_KEY: 'API key', MCP: 'MCP' };

export default function AuditLog({ role }: { role: Role }) {
  const router = useRouter();
  const slug = router.query.slug as string;
  const allowed = can(role, 'audit_log', 'read');

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['audit-logs', slug],
    queryFn: ({ pageParam }) =>
      apiFetch<AuditPage>(`/api/teams/${slug}/audit-logs${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!slug && allowed,
  });

  const entries = useMemo(() => data?.pages.flatMap((page) => page.entries) ?? [], [data]);

  const columns = useMemo<AppColumnDef<AuditEntry>[]>(
    () => [
      {
        accessorKey: 'createdAt',
        header: 'When',
        size: 190,
        cell: ({ getValue }) => new Date(getValue<string>()).toLocaleString(),
      },
      {
        accessorKey: 'actorName',
        header: 'Who',
        size: 220,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-sm text-gray-900">{row.original.actorName}</p>
            {row.original.actorEmail && <p className="truncate text-xs text-gray-500">{row.original.actorEmail}</p>}
          </div>
        ),
      },
      {
        id: 'event',
        header: 'What',
        size: 360,
        accessorFn: (entry) => `${describeEvent(entry)} ${entry.targetLabel ?? ''}`,
        cell: ({ row }) => (
          <span className="text-sm text-gray-700">
            {describeEvent(row.original)}
            {row.original.targetLabel && <span className="font-medium text-gray-900"> {row.original.targetLabel}</span>}
          </span>
        ),
      },
      {
        accessorKey: 'source',
        header: 'Via',
        size: 110,
        cell: ({ getValue }) => sourceLabels[getValue<AuditEntry['source']>()],
      },
      { accessorKey: 'ipAddress', header: 'IP address', size: 150, cell: ({ getValue }) => getValue<string | null>() ?? '—' },
    ],
    []
  );

  return (
    <SettingsLayout
      tabs={settingsTabs}
      active="audit-log"
      description="Every change made to this team — in the app, through an API key, or by an agent over MCP — with who made it and when. Entries can't be edited or deleted."
    >
      {!allowed ? (
        <div className="card">
          <p className="text-sm text-gray-600">Only owners, admins, and auditors can view the audit log.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <DataTable
            columns={columns}
            data={entries}
            isLoading={isLoading}
            searchPlaceholder="Filter by person, action, or record…"
            emptyMessage="No activity yet"
            emptyDescription="Changes made to this team will appear here."
            emptyIcon={ScrollText}
          />
          {hasNextPage && (
            <div className="flex justify-center">
              <button className="btn-secondary" type="button" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? 'Loading…' : 'Load older entries'}
              </button>
            </div>
          )}
        </div>
      )}
    </SettingsLayout>
  );
}

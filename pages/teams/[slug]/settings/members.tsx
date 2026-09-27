import { useMemo, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Mail } from 'lucide-react';

import SettingsLayout from '@/components/settings/SettingsLayout';
import { settingsTabs } from '@/components/settings/tabs';
import DataTable, { type AppColumnDef } from '@/components/DataTable';
import { apiFetch, apiPost } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

const roles = ['OWNER', 'ADMIN', 'APPROVER', 'FINANCE', 'REQUESTER', 'AUDITOR'];

const roleTone: Record<string, string> = {
  OWNER: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  ADMIN: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  APPROVER: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  FINANCE: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  REQUESTER: 'bg-gray-50 text-gray-600 ring-gray-500/20',
  AUDITOR: 'bg-gray-50 text-gray-600 ring-gray-500/20',
};

function RoleBadge({ role }: { role: string }) {
  return <span className={`badge ${roleTone[role] ?? roleTone.REQUESTER}`}>{role}</span>;
}

type Member = {
  id: string;
  role: string;
  user: { name: string; email: string };
};

export default function Members() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('REQUESTER');
  const [loading, setLoading] = useState(false);

  const { data } = useQuery({
    queryKey: ['members', slug],
    queryFn: () => apiFetch<{ members: Member[]; invitations: any[] }>(`/api/teams/${slug}/members`),
    enabled: !!slug,
  });

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiPost(`/api/teams/${slug}/members`, { email, role });
      toast.success('Invitation sent.');
      setEmail('');
      queryClient.invalidateQueries({ queryKey: ['members', slug] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const columns = useMemo<AppColumnDef<Member>[]>(
    () => [
      { accessorFn: (m) => m.user.name, id: 'name', header: 'Name', size: 220 },
      { accessorFn: (m) => m.user.email, id: 'email', header: 'Email', size: 260 },
      {
        accessorKey: 'role',
        header: 'Role',
        size: 160,
        cell: ({ getValue }) => <RoleBadge role={getValue<string>()} />,
      },
    ],
    []
  );

  return (
    <SettingsLayout tabs={settingsTabs} active="members" description="Who has access to this workspace, and what they can do in it.">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <DataTable
            columns={columns}
            data={data?.members ?? []}
            searchPlaceholder="Filter members…"
            emptyMessage="No members yet"
          />

          {data?.invitations && data.invitations.length > 0 && (
            <div className="card">
              <h2 className="section-title mb-3">Pending invitations</h2>
              <ul className="divide-y divide-gray-100">
                {data.invitations.map((inv: any) => (
                  <li key={inv.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="flex items-center gap-2 text-gray-700">
                      <Mail size={14} className="text-gray-400" />
                      {inv.email}
                    </span>
                    <RoleBadge role={inv.role} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <form onSubmit={invite} className="card h-fit space-y-3">
          <h2 className="section-title">Invite someone</h2>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <button className="btn-primary w-full" type="submit" disabled={loading}>
            {loading ? 'Sending…' : 'Send invitation'}
          </button>
        </form>
      </div>
    </SettingsLayout>
  );
}

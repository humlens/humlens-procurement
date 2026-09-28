import { useState } from 'react';
import { useRouter } from 'next/router';
import toast from 'react-hot-toast';

import AuthShell from '@/components/AuthShell';
import { apiPost } from '@/lib/fetcher';

export default function NewTeam() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const team = await apiPost<{ slug: string }>('/api/teams', { name });
      router.push(`/teams/${team.slug}/inbox`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Create a workspace" subtitle="Set up a new procurement tenant to get started.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label">Company / team name</label>
          <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button className="btn-primary w-full" type="submit" disabled={loading}>
          {loading ? 'Creating…' : 'Create'}
        </button>
      </form>
    </AuthShell>
  );
}

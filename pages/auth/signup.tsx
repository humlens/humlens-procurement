import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import toast from 'react-hot-toast';

import AuthShell from '@/components/AuthShell';
import { apiPost } from '@/lib/fetcher';

export default function Signup() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [teamName, setTeamName] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await apiPost('/api/auth/signup', { name, email, password, teamName });
      const result = await signIn('credentials', { email, password, redirect: false });
      if (result?.error) throw new Error('Account created, but sign-in failed. Try logging in.');
      router.push('/');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Create your Humlens Procurement workspace"
      subtitle="You become the Owner of a new procurement tenant."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/auth/login" className="font-medium text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label">Your name</label>
          <input className="input" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Email</label>
          <input
            className="input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Password</label>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Company / team name</label>
          <input className="input" required value={teamName} onChange={(e) => setTeamName(e.target.value)} />
        </div>
        <button className="btn-primary w-full" type="submit" disabled={loading}>
          {loading ? 'Creating…' : 'Create workspace'}
        </button>
      </form>
    </AuthShell>
  );
}

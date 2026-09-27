import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import toast from 'react-hot-toast';

import AuthShell from '@/components/AuthShell';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const result = await signIn('credentials', { email, password, redirect: false });

    setLoading(false);

    if (result?.error) {
      toast.error('Invalid email or password.');
      return;
    }

    router.push('/');
  };

  return (
    <AuthShell
      title="Sign in to Humlens Procurement"
      subtitle="Procurement, run by your team and its AI agents."
      footer={
        <>
          No account?{' '}
          <Link href="/auth/signup" className="font-medium text-brand-600 hover:text-brand-700">
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
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
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="btn-primary w-full" type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  );
}

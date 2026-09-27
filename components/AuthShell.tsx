import { ReactNode } from 'react';

import AuthHero from '@/components/illustrations/AuthHero';

export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gray-50 px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at 15% 20%, rgba(99,102,241,0.08), transparent 40%), radial-gradient(circle at 85% 80%, rgba(99,102,241,0.08), transparent 40%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(15,23,42,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,23,42,0.04) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <AuthHero />
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">{title}</h1>
          <p className="mt-1.5 text-sm text-gray-500">{subtitle}</p>
        </div>

        <div className="card shadow-popover">{children}</div>

        {footer && <div className="mt-6 text-center text-sm text-gray-500">{footer}</div>}
      </div>
    </div>
  );
}

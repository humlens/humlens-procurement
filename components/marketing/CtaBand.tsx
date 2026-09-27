import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function CtaBand() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-20">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700 px-8 py-14 text-center shadow-popover sm:px-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.3) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
        <div className="relative">
          <h2 className="text-3xl font-semibold tracking-tight text-white">Ready to let procurement run itself?</h2>
          <p className="mx-auto mt-3 max-w-lg text-brand-100">
            Set up your workspace, invite your team, and configure exactly how much the agents are allowed to do.
          </p>
          <div className="mt-8 flex justify-center">
            <Link
              href="/auth/signup"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-5 py-2.5 text-[15px] font-medium text-brand-700 shadow-sm transition-colors hover:bg-brand-50"
            >
              Get started free
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

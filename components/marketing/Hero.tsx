import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';

import ProductMockup from '@/components/marketing/ProductMockup';

export default function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 10%, rgba(99,102,241,0.10), transparent 45%), radial-gradient(circle at 85% 30%, rgba(99,102,241,0.08), transparent 40%)',
        }}
      />

      <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 py-20 lg:grid-cols-2 lg:py-28">
        <div>
          <span className="badge bg-violet-50 text-violet-700 ring-violet-600/20">
            <Sparkles size={12} />
            AI-native procurement
          </span>

          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
            Procurement that runs itself — until it shouldn&apos;t.
          </h1>

          <p className="mt-5 max-w-xl text-lg leading-relaxed text-gray-600">
            Requisitions, approvals, purchase orders, vendors, budgets, sourcing, and 3-way invoice matching in one
            place — with AI agents that clear the routine decisions and always leave a trail for the ones that
            aren&apos;t.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/auth/signup" className="btn-primary px-5 py-2.5 text-[15px]">
              Get started free
              <ArrowRight size={16} />
            </Link>
            <a href="#how-it-works" className="btn-secondary px-5 py-2.5 text-[15px]">
              See how it works
            </a>
          </div>

          <p className="mt-4 text-sm text-gray-400">No credit card required. Set up your workspace in minutes.</p>
        </div>

        <ProductMockup />
      </div>
    </section>
  );
}

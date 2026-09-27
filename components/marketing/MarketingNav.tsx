import Link from 'next/link';

import HumlensMark from '@/components/HumlensMark';

export default function MarketingNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2.5">
          <HumlensMark className="h-8 w-8 shrink-0" />
          <span className="text-[15px] font-semibold tracking-tight text-gray-900">
            Humlens <span className="font-normal text-gray-400">Procurement</span>
          </span>
        </div>

        <nav className="hidden items-center gap-8 text-sm font-medium text-gray-600 md:flex">
          <a href="#features" className="hover:text-gray-900">
            Features
          </a>
          <a href="#agents" className="hover:text-gray-900">
            AI Agents
          </a>
          <a href="#how-it-works" className="hover:text-gray-900">
            How it works
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/auth/login" className="btn-ghost">
            Sign in
          </Link>
          <Link href="/auth/signup" className="btn-primary">
            Get started free
          </Link>
        </div>
      </div>
    </header>
  );
}

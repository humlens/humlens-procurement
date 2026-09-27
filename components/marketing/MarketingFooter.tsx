import Link from 'next/link';

import HumlensMark from '@/components/HumlensMark';

export default function MarketingFooter() {
  return (
    <footer className="border-t border-gray-200">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
        <div className="flex items-center gap-2">
          <HumlensMark className="h-6 w-6 shrink-0" />
          <span className="text-sm font-medium text-gray-700">
            Humlens <span className="text-gray-400">Procurement</span>
          </span>
        </div>
        <div className="flex items-center gap-6 text-sm text-gray-500">
          <Link href="/auth/login" className="hover:text-gray-900">
            Sign in
          </Link>
          <Link href="/auth/signup" className="hover:text-gray-900">
            Get started
          </Link>
        </div>
        <p className="text-xs text-gray-400">© {new Date().getFullYear()} Humlens. All rights reserved.</p>
      </div>
    </footer>
  );
}

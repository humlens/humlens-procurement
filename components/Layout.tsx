import Link from 'next/link';
import { useRouter } from 'next/router';
import { signOut, useSession } from 'next-auth/react';
import { ReactNode, useEffect, useState } from 'react';
import {
  Inbox,
  LayoutDashboard,
  FileText,
  CheckSquare,
  ShoppingCart,
  Building2,
  Wallet,
  FileSearch,
  FileSignature,
  PackageCheck,
  Receipt,
  CreditCard,
  Sparkles,
  Settings,
  LogOut,
  Search,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react';

import CommandPalette from '@/components/CommandPalette';
import HumlensMark from '@/components/HumlensMark';
import { openCommandPalette } from '@/lib/store';
import { iconToneClasses, type IconTone } from '@/lib/iconTones';
import AppSwitcher from '@/components/AppSwitcher';

type NavItem = { href: string; label: string; icon: LucideIcon; tone: IconTone };
type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { href: 'inbox', label: 'Inbox', icon: Inbox, tone: 'brand' },
      { href: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, tone: 'brand' },
    ],
  },
  {
    label: 'Procure',
    items: [
      { href: 'requisitions', label: 'Requisitions', icon: FileText, tone: 'blue' },
      { href: 'approvals', label: 'Approvals', icon: CheckSquare, tone: 'emerald' },
      { href: 'purchase-orders', label: 'Purchase Orders', icon: ShoppingCart, tone: 'violet' },
      { href: 'budgets', label: 'Budgets', icon: Wallet, tone: 'amber' },
    ],
  },
  {
    label: 'Source',
    items: [
      { href: 'vendors', label: 'Vendors', icon: Building2, tone: 'cyan' },
      { href: 'rfqs', label: 'Sourcing (RFQs)', icon: FileSearch, tone: 'fuchsia' },
      { href: 'contracts', label: 'Contracts', icon: FileSignature, tone: 'rose' },
    ],
  },
  {
    label: 'Fulfill',
    items: [
      { href: 'receiving', label: 'Receiving', icon: PackageCheck, tone: 'teal' },
      { href: 'invoices', label: 'Invoices', icon: Receipt, tone: 'orange' },
      { href: 'payments', label: 'Payments', icon: CreditCard, tone: 'indigo' },
    ],
  },
  {
    label: 'Insights',
    items: [{ href: 'agent-actions', label: 'AI Agent Activity', icon: Sparkles, tone: 'purple' }],
  },
];

function initials(name?: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || name[0]?.toUpperCase();
}

export default function Layout({
  children,
  title,
  icon: HeaderIcon,
  iconTone = 'brand',
}: {
  children: ReactNode;
  title?: string;
  icon?: LucideIcon;
  iconTone?: IconTone;
}) {
  const router = useRouter();
  const slug = router.query.slug as string;
  const { data: session } = useSession();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Close the off-canvas nav on every navigation so a link tap doesn't leave
  // it open behind the new page.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [router.asPath]);

  const sidebarContent = (
    <>
      <div className="flex items-center gap-2.5 border-b border-gray-200 px-5 py-4">
        <HumlensMark className="h-8 w-8 shrink-0" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-[14px] font-semibold tracking-tight text-gray-900">Humlens</p>
          <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Procurement</p>
        </div>
        <button
          onClick={() => setMobileNavOpen(false)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 lg:hidden"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const href = `/teams/${slug}/${item.href}`;
                const active = router.asPath.startsWith(href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={href}
                    className={`group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
                      active ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    {active && <span className="absolute -left-3 h-5 w-1 rounded-r-full bg-brand-600" />}
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-opacity ${iconToneClasses[item.tone]} ${
                        active ? '' : 'opacity-80 group-hover:opacity-100'
                      }`}
                    >
                      <Icon size={15} strokeWidth={2.25} />
                    </span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        <div>
          <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Workspace</p>
          <Link
            href={`/teams/${slug}/settings`}
            className={`group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
              router.asPath.startsWith(`/teams/${slug}/settings`)
                ? 'bg-brand-50 text-brand-700'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-500">
              <Settings size={15} strokeWidth={2.25} />
            </span>
            Settings
          </Link>
        </div>
        <AppSwitcher />
      </nav>

      <div className="border-t border-gray-200 p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
            {initials(session?.user?.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-gray-900">{session?.user?.name || 'Account'}</p>
            <p className="truncate text-xs text-gray-400">{session?.user?.email}</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/auth/login' })}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            title="Sign out"
          >
            <LogOut size={15} strokeWidth={2} />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-gray-50">
      {mobileNavOpen && (
        <div
          aria-hidden
          className="fixed inset-0 z-30 bg-gray-900/40 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] shrink-0 -translate-x-full flex-col border-r border-gray-200 bg-white transition-transform duration-200 ease-out lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:max-w-none lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : ''
        }`}
      >
        {sidebarContent}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-gray-200 bg-white/80 px-4 py-3.5 backdrop-blur sm:px-6 lg:px-8 lg:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 lg:hidden"
            >
              <Menu size={19} />
            </button>
            {HeaderIcon && (
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconToneClasses[iconTone]}`}
              >
                <HeaderIcon size={16} strokeWidth={2.25} />
              </span>
            )}
            {title && <h1 className="truncate text-lg font-semibold tracking-tight text-gray-900">{title}</h1>}
          </div>
          <button
            onClick={openCommandPalette}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-400 shadow-sm hover:border-gray-300 hover:text-gray-600 sm:px-3"
          >
            <Search size={14} />
            <span className="hidden sm:inline">Search</span>
            <kbd className="hidden rounded border border-gray-200 bg-gray-50 px-1 py-0.5 font-sans text-[10px] font-medium text-gray-400 sm:inline">
              ⌘K
            </kbd>
          </button>
        </header>
        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">{children}</main>
      </div>
      <CommandPalette />
    </div>
  );
}

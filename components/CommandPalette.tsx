import { Command } from 'cmdk';
import { useRouter } from 'next/router';
import { useHotkeys } from 'react-hotkeys-hook';
import { useSelector } from '@tanstack/react-store';
import {
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
  PlusCircle,
  Search,
} from 'lucide-react';

import { appUiStore, closeCommandPalette, toggleCommandPalette, pushRecentItem } from '@/lib/store';
import { iconToneClasses, type IconTone } from '@/lib/iconTones';

const navCommands: { href: string; label: string; icon: typeof LayoutDashboard; tone: IconTone }[] = [
  { href: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, tone: 'brand' },
  { href: 'requisitions', label: 'Requisitions', icon: FileText, tone: 'blue' },
  { href: 'approvals', label: 'Approvals', icon: CheckSquare, tone: 'emerald' },
  { href: 'purchase-orders', label: 'Purchase Orders', icon: ShoppingCart, tone: 'violet' },
  { href: 'vendors', label: 'Vendors', icon: Building2, tone: 'cyan' },
  { href: 'budgets', label: 'Budgets', icon: Wallet, tone: 'amber' },
  { href: 'rfqs', label: 'Sourcing (RFQs)', icon: FileSearch, tone: 'fuchsia' },
  { href: 'contracts', label: 'Contracts', icon: FileSignature, tone: 'rose' },
  { href: 'receiving', label: 'Receiving', icon: PackageCheck, tone: 'teal' },
  { href: 'invoices', label: 'Invoices', icon: Receipt, tone: 'orange' },
  { href: 'payments', label: 'Payments', icon: CreditCard, tone: 'indigo' },
  { href: 'agent-actions', label: 'AI Agent Activity', icon: Sparkles, tone: 'purple' },
  { href: 'settings', label: 'Settings', icon: Settings, tone: 'gray' },
];

// `?new=1` opens the destination list page's create panel in place — see
// lib/useOpenNewFromQuery.ts — now that creation happens in a sidebar modal
// instead of on a separate /new route.
const createCommands = [
  { href: 'requisitions?new=1', label: 'New requisition' },
  { href: 'purchase-orders?new=1', label: 'New purchase order' },
  { href: 'vendors?new=1', label: 'New vendor' },
  { href: 'budgets?new=1', label: 'New budget' },
  { href: 'rfqs?new=1', label: 'New RFQ' },
  { href: 'contracts?new=1', label: 'New contract' },
  { href: 'invoices?new=1', label: 'Record invoice' },
];

export default function CommandPalette() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const open = useSelector(appUiStore, (s) => s.commandPaletteOpen);

  // Global mod+k opens the palette from anywhere, including form fields —
  // this is the app's primary keyboard entry point, so it must never be
  // shadowed by an input's default handling.
  useHotkeys('mod+k', (e) => {
    e.preventDefault();
    toggleCommandPalette();
  }, { enableOnFormTags: true, enableOnContentEditable: true });

  const go = (href: string) => {
    const target = `/teams/${slug}/${href}`;
    pushRecentItem({ label: href, href: target });
    router.push(target);
    closeCommandPalette();
  };

  if (!slug) return null;

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(v) => (v ? undefined : closeCommandPalette())}
      label="Command palette"
      className="fixed inset-0 z-50"
    >
      <div className="fixed inset-0 bg-gray-900/30 backdrop-blur-[2px]" onClick={closeCommandPalette} />
      <div className="relative mx-auto mt-[15vh] w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-xl border border-gray-200 bg-white shadow-popover">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4">
          <Search size={16} className="text-gray-400" />
          <Command.Input
            autoFocus
            placeholder="Jump to a page or create something…"
            className="w-full bg-transparent py-3.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
          />
          <kbd className="hidden rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 sm:block">
            Esc
          </kbd>
        </div>
        <Command.List className="max-h-80 overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-gray-400">No results found.</Command.Empty>

          <Command.Group heading="Navigate" className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 [&_[cmdk-group-items]]:mt-1">
            {navCommands.map((c) => (
              <Command.Item
                key={c.href}
                onSelect={() => go(c.href)}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-700 data-[selected=true]:bg-brand-50 data-[selected=true]:text-brand-700"
              >
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${iconToneClasses[c.tone]}`}>
                  <c.icon size={13} strokeWidth={2.25} />
                </span>
                {c.label}
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading="Create" className="mt-2 mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 [&_[cmdk-group-items]]:mt-1">
            {createCommands.map((c) => (
              <Command.Item
                key={c.href}
                onSelect={() => go(c.href)}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-700 data-[selected=true]:bg-brand-50 data-[selected=true]:text-brand-700"
              >
                <PlusCircle size={16} className="text-gray-400" />
                {c.label}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </div>
    </Command.Dialog>
  );
}

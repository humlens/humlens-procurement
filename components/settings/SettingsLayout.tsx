import Link from 'next/link';
import { useRouter } from 'next/router';
import { Settings as SettingsIcon, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import Layout from '@/components/Layout';
import { iconToneClasses, type IconTone } from '@/lib/iconTones';

export type SettingsTab = { key: string; label: string; icon: LucideIcon; tone: IconTone };

// Shared settings shell: a left sub-nav (vertical on desktop, a horizontal
// scrollable strip on mobile) plus a content panel — used by every settings
// page so the section list only has to be defined once.
export default function SettingsLayout({
  tabs,
  active,
  description,
  children,
}: {
  tabs: SettingsTab[];
  active: string;
  description?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const slug = router.query.slug as string;

  return (
    <Layout title="Settings" icon={SettingsIcon} iconTone="gray">
      {description && <p className="mb-5 max-w-2xl text-sm text-gray-500">{description}</p>}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:sticky lg:top-20 lg:mx-0 lg:w-56 lg:shrink-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
          {tabs.map((tab) => {
            const isActive = tab.key === active;
            return (
              <Link
                key={tab.key}
                href={`/teams/${slug}/settings/${tab.key}`}
                className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors lg:whitespace-normal ${
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${iconToneClasses[tab.tone]}`}>
                  <tab.icon size={13} strokeWidth={2.25} />
                </span>
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </Layout>
  );
}

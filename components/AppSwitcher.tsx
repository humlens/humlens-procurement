import { ArrowUpRight } from 'lucide-react';

import { APP_LABELS, THIS_APP, appUrls, type HumlensApp } from '@/lib/sso';

// Sidebar links to the other Humlens apps; you arrive signed in as yourself
// (see lib/sso.ts). Only apps whose address is configured are shown.
export default function AppSwitcher() {
  const others = (Object.keys(APP_LABELS) as HumlensApp[]).filter((app) => app !== THIS_APP && appUrls[app]);
  if (!others.length) return null;

  return (
    <div>
      <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Humlens apps</p>
      {others.map((app) => (
        <a
          key={app}
          href={`/api/sso/handoff?to=${app}`}
          className="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-500">
            <ArrowUpRight size={15} strokeWidth={2.25} />
          </span>
          {APP_LABELS[app]}
        </a>
      ))}
    </div>
  );
}

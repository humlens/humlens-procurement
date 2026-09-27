import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import SpotIllustration from '@/components/illustrations/SpotIllustration';

export default function EmptyState({
  icon,
  title,
  description,
  action,
  tone = 'brand',
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: 'brand' | 'emerald' | 'amber' | 'violet';
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <SpotIllustration icon={icon} tone={tone} />
      <h3 className="mt-4 text-sm font-semibold text-gray-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-gray-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

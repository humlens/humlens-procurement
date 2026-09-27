import type { LucideIcon } from 'lucide-react';

export default function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'brand',
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  tone?: 'brand' | 'emerald' | 'amber' | 'violet';
}) {
  const toneStyles: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    violet: 'bg-violet-50 text-violet-600',
  };

  return (
    <div className="card flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
        <div className="mt-1.5 text-2xl font-semibold tracking-tight text-gray-900">{value}</div>
        {sub && <div className="mt-1 text-xs text-gray-400">{sub}</div>}
      </div>
      {Icon && (
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneStyles[tone]}`}>
          <Icon size={18} strokeWidth={2} />
        </div>
      )}
    </div>
  );
}

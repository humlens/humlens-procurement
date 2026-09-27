import type { LucideIcon } from 'lucide-react';

const toneStyles = {
  brand: { blob: 'text-brand-50', icon: 'text-brand-600', dot: 'bg-brand-200' },
  emerald: { blob: 'text-emerald-50', icon: 'text-emerald-600', dot: 'bg-emerald-200' },
  amber: { blob: 'text-amber-50', icon: 'text-amber-600', dot: 'bg-amber-200' },
  violet: { blob: 'text-violet-50', icon: 'text-violet-600', dot: 'bg-violet-200' },
} as const;

// A small "spot illustration": a soft irregular blob behind a large line
// icon, with a couple of scattered accent dots for depth. Used for empty
// states across the app so "nothing here yet" reads as designed rather than
// as a bare gray sentence.
export default function SpotIllustration({
  icon: Icon,
  tone = 'brand',
  size = 112,
}: {
  icon: LucideIcon;
  tone?: keyof typeof toneStyles;
  size?: number;
}) {
  const t = toneStyles[tone];

  return (
    <div className="relative mx-auto flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className={`absolute inset-0 h-full w-full ${t.blob}`} aria-hidden>
        <path
          fill="currentColor"
          d="M48.8 6.9c16.7-2.3 33.9 6 40.9 21.3 7 15.2 3.7 34.4-8.4 45.9C69.2 85.6 51 90.4 34.9 85 18.8 79.7 5 65.2 4.2 48.4 3.4 31.7 15.6 13.3 32 8 37.3 6.3 43.2 7.7 48.8 6.9Z"
        />
      </svg>
      <span className={`absolute right-1 top-2 h-2 w-2 rounded-full ${t.dot}`} />
      <span className={`absolute bottom-3 left-0 h-1.5 w-1.5 rounded-full ${t.dot}`} />
      <Icon size={size * 0.36} strokeWidth={1.5} className={`relative ${t.icon}`} />
    </div>
  );
}

import { useId } from 'react';

type HumlensMarkProps = {
  className?: string;
  title?: string;
};

// The real Humlens mark — ported from the parent brand (apps/humlens-localization /
// components/marketing/HumlensMark.tsx) so this product carries the actual
// identity rather than a generic icon-in-a-box.
export default function HumlensMark({ className, title = 'Humlens' }: HumlensMarkProps) {
  const rawId = useId();
  const safeId = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const gradientId = `humlens-grad-${safeId}`;
  const strokeId = `humlens-stroke-${safeId}`;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className={className} role="img" aria-label={title}>
      <defs>
        <linearGradient id={gradientId} x1="10" y1="10" x2="54" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#14b8a6" />
          <stop offset="55%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>
        <linearGradient id={strokeId} x1="8" y1="14" x2="58" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2dd4bf" />
          <stop offset="55%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#e9d5ff" />
        </linearGradient>
      </defs>

      <rect x="6" y="6" width="52" height="52" rx="18" fill="#0b1020" />
      <rect x="6" y="6" width="52" height="52" rx="18" fill="none" stroke="rgba(255,255,255,0.12)" />

      <circle cx="32" cy="32" r="20" fill={`url(#${gradientId})`} opacity="0.22" />
      <circle cx="32" cy="32" r="20" fill="none" stroke={`url(#${strokeId})`} strokeWidth="4" strokeLinecap="round" />
      <circle cx="44.5" cy="22" r="3.2" fill={`url(#${gradientId})`} opacity="0.95" />

      <g fill="#f8fafc">
        <rect x="23.5" y="20" width="5" height="24" rx="2.5" />
        <rect x="35.5" y="20" width="5" height="24" rx="2.5" />
        <rect x="28.5" y="29.5" width="7" height="5" rx="2.5" />
      </g>
    </svg>
  );
}

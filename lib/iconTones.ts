// A shared palette of colored icon-chip styles, used wherever an icon needs
// a distinct identity color instead of flat gray — nav items, settings tabs,
// page headers, command palette entries. Keeping the map in one place means
// the same module (e.g. Purchase Orders) always reads as the same color
// everywhere it appears.
export type IconTone =
  | 'brand'
  | 'blue'
  | 'emerald'
  | 'amber'
  | 'violet'
  | 'cyan'
  | 'fuchsia'
  | 'rose'
  | 'teal'
  | 'orange'
  | 'indigo'
  | 'purple'
  | 'gray';

export const iconToneClasses: Record<IconTone, string> = {
  brand: 'bg-brand-50 text-brand-600',
  blue: 'bg-blue-50 text-blue-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  violet: 'bg-violet-50 text-violet-600',
  cyan: 'bg-cyan-50 text-cyan-600',
  fuchsia: 'bg-fuchsia-50 text-fuchsia-600',
  rose: 'bg-rose-50 text-rose-600',
  teal: 'bg-teal-50 text-teal-600',
  orange: 'bg-orange-50 text-orange-600',
  indigo: 'bg-indigo-50 text-indigo-600',
  purple: 'bg-purple-50 text-purple-600',
  gray: 'bg-gray-100 text-gray-500',
};

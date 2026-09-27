import { Sparkles } from 'lucide-react';

import HumlensMark from '@/components/HumlensMark';

// The auth screens' hero mark: the real Humlens mark, slightly tilted, with
// an AI "sparkle" badge overlapping it and a couple of floating accent dots
// — reads as a small illustrated scene rather than a bare logo.
export default function AuthHero() {
  return (
    <div className="relative mx-auto mb-5 h-20 w-20">
      <HumlensMark className="h-20 w-20 rotate-6 drop-shadow-lg" />
      <div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-popover ring-4 ring-gray-50">
        <Sparkles size={14} className="text-violet-500" strokeWidth={2.5} />
      </div>
      <span className="absolute -left-3 top-1 h-2 w-2 rounded-full bg-amber-300" />
      <span className="absolute -right-1 -top-3 h-1.5 w-1.5 rounded-full bg-emerald-300" />
    </div>
  );
}

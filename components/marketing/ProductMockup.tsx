import { CheckCircle2, Sparkles, TrendingUp } from 'lucide-react';

const rows = [
  { title: 'Ergonomic office chairs', amount: '$4,200', status: 'Approved', tone: 'success' as const },
  { title: 'Annual SOC 2 audit', amount: '$18,000', status: 'In review', tone: 'warning' as const },
  { title: 'Laptop refresh — Design', amount: '$26,400', status: 'Issued', tone: 'info' as const },
];

const toneStyles = {
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  warning: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  info: 'bg-blue-50 text-blue-700 ring-blue-600/20',
};

// A hand-built "product screenshot" for the hero — no real screenshot to
// show yet, so this stands in with the app's actual visual language (cards,
// badges, stat tiles) plus two floating accent cards that call out the
// AI-native angle, the way a real annotated screenshot would.
export default function ProductMockup() {
  return (
    <div className="relative mx-auto w-full max-w-lg">
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-popover">
        <div className="flex items-center gap-1.5 border-b border-gray-100 bg-gray-50 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
          <span className="ml-2 text-xs font-medium text-gray-400">app.yourcompany.com</span>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Awaiting approval</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">7</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Open POs</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">23</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Budget left</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">$142K</p>
            </div>
          </div>

          <div className="space-y-1.5">
            {rows.map((r) => (
              <div key={r.title} className="flex items-center justify-between rounded-lg px-2.5 py-2 hover:bg-gray-50">
                <span className="truncate pr-3 text-sm text-gray-700">{r.title}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-gray-400">{r.amount}</span>
                  <span className={`badge ${toneStyles[r.tone]}`}>{r.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute -right-6 -top-6 hidden w-52 rotate-3 rounded-xl border border-gray-200 bg-white p-3 shadow-popover sm:block">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600">
            <Sparkles size={14} />
          </div>
          <p className="text-xs font-medium text-gray-900">Auto-approved by agent</p>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-gray-500">
          PO-00234 was within policy — approved and issued automatically.
        </p>
      </div>

      <div className="absolute -bottom-6 -left-6 hidden w-44 -rotate-3 rounded-xl border border-gray-200 bg-white p-3 shadow-popover sm:block">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <TrendingUp size={14} />
          </div>
          <p className="text-xs font-medium text-gray-900">Budget on track</p>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div className="h-full w-[68%] rounded-full bg-emerald-500" />
        </div>
        <p className="mt-1 flex items-center gap-1 text-[11px] text-gray-500">
          <CheckCircle2 size={11} className="text-emerald-500" /> 68% used, on pace
        </p>
      </div>
    </div>
  );
}

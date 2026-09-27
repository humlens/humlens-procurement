import { CheckCircle2, FileSearch, Scale, Sparkles, TrendingUp, type LucideIcon } from 'lucide-react';

const agents: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: CheckCircle2,
    title: 'Auto-approval agent',
    description:
      'Clears requisitions that fall within your policy limits automatically, and explains exactly why every time it does — or doesn’t.',
  },
  {
    icon: Scale,
    title: 'Invoice matching agent',
    description:
      'Runs the 3-way match — PO, goods receipt, invoice — the moment an invoice comes in, before it ever reaches a human queue.',
  },
  {
    icon: FileSearch,
    title: 'Sourcing agent',
    description: 'Drafts vendor outreach emails for every RFQ you send, so getting quotes out the door takes minutes, not a day.',
  },
  {
    icon: TrendingUp,
    title: 'Spend anomaly agent',
    description: 'Watches spend by vendor and category, and flags unusual patterns before they become a budget surprise.',
  },
];

export default function AgentShowcase() {
  return (
    <section id="agents" className="bg-gray-925 py-20" style={{ backgroundColor: '#0b1120' }}>
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="badge bg-violet-500/10 text-violet-300 ring-violet-400/20">
            <Sparkles size={12} />
            Autonomous, not automatic
          </span>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight text-white">Meet your AI procurement team</h2>
          <p className="mt-3 text-base text-gray-400">
            Every agent works within a policy you set, and logs a reasoned entry for each decision it makes — or
            declines to make. Nothing happens silently.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {agents.map((a) => (
            <div key={a.title} className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
                <a.icon size={18} strokeWidth={2} />
              </div>
              <h3 className="mt-3.5 text-sm font-semibold text-white">{a.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-400">{a.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-xl border border-white/10 bg-white/[0.04] px-6 py-5 text-center">
          <p className="text-sm text-gray-300">
            Also exposed as an <span className="font-medium text-white">MCP server</span> — Claude or any MCP-compatible
            agent can create requisitions, check budgets, or approve a purchase order directly, under the same
            role-based permissions as a human teammate.
          </p>
        </div>
      </div>
    </section>
  );
}

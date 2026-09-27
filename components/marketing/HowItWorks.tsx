import { CheckSquare, FileText, PackageCheck, ShoppingCart, type LucideIcon } from 'lucide-react';

const steps: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: FileText,
    title: 'Request',
    description: 'Anyone on the team submits a requisition — structured, or just described in plain English.',
  },
  {
    icon: CheckSquare,
    title: 'Approve',
    description: 'Routed to the right approver by amount and role. Within policy, the agent can clear it instantly.',
  },
  {
    icon: ShoppingCart,
    title: 'Order',
    description: 'Approved requests become a purchase order in one click and get issued straight to the vendor.',
  },
  {
    icon: PackageCheck,
    title: 'Reconcile',
    description: 'Receiving and invoices are matched automatically, and payment is scheduled once everything lines up.',
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-gray-900">From request to reconciled</h2>
        <p className="mt-3 text-base text-gray-600">Four steps, one system — with an agent watching every handoff.</p>
      </div>

      <div className="relative mt-14 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div className="absolute left-0 right-0 top-9 hidden h-px bg-gray-200 lg:block" aria-hidden />
        {steps.map((s, i) => (
          <div key={s.title} className="relative text-center">
            <div className="relative mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full border border-gray-200 bg-white shadow-card">
              <s.icon size={26} strokeWidth={1.75} className="text-brand-600" />
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[10px] font-semibold text-white">
                {i + 1}
              </span>
            </div>
            <h3 className="mt-4 text-sm font-semibold text-gray-900">{s.title}</h3>
            <p className="mx-auto mt-1.5 max-w-[220px] text-sm leading-relaxed text-gray-500">{s.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

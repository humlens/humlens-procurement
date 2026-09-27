import {
  FileText,
  CheckSquare,
  ShoppingCart,
  Building2,
  Wallet,
  FileSearch,
  FileSignature,
  PackageCheck,
  type LucideIcon,
} from 'lucide-react';

const features: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: FileText,
    title: 'Purchase requisitions',
    description: 'Submit structured requests with line items — or describe what you need in plain English and let AI draft it.',
  },
  {
    icon: CheckSquare,
    title: 'Multi-step approvals',
    description: 'Policy-based approval chains by amount and role, plus a single queue for everything waiting on you.',
  },
  {
    icon: ShoppingCart,
    title: 'Purchase orders',
    description: 'Convert an approved requisition into a PO in one click, or create one directly for a vendor.',
  },
  {
    icon: Building2,
    title: 'Vendor management',
    description: 'Track vendor status, ratings, and performance history in one place, tied to every order and contract.',
  },
  {
    icon: Wallet,
    title: 'Budgets & spend control',
    description: 'Real-time committed-vs-spent tracking per budget, with automatic anomaly alerts when spend moves.',
  },
  {
    icon: FileSearch,
    title: 'Strategic sourcing',
    description: 'Send RFQs to multiple vendors, compare quotes side by side, and award the winner with one click.',
  },
  {
    icon: FileSignature,
    title: 'Contracts',
    description: 'Keep terms, value, and renewal dates tied to the vendor and the sourcing event that produced them.',
  },
  {
    icon: PackageCheck,
    title: 'Receiving & 3-way match',
    description: 'Record what arrived, then let the agent match it against the PO and invoice before anything gets paid.',
  },
];

export default function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-6 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-gray-900">
          Everything procurement needs, nothing it doesn&apos;t
        </h2>
        <p className="mt-3 text-base text-gray-600">
          One workspace for the whole purchase-to-pay cycle, built around the roles that already run it.
        </p>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f) => (
          <div key={f.title} className="card">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <f.icon size={18} strokeWidth={2} />
            </div>
            <h3 className="mt-3.5 text-sm font-semibold text-gray-900">{f.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{f.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

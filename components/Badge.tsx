type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'purple';

const toneStyles: Record<Tone, string> = {
  neutral: 'bg-gray-50 text-gray-600 ring-gray-500/20',
  info: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  warning: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  danger: 'bg-red-50 text-red-700 ring-red-600/20',
  purple: 'bg-violet-50 text-violet-700 ring-violet-600/20',
};

const toneDot: Record<Tone, string> = {
  neutral: 'bg-gray-400',
  info: 'bg-blue-500',
  warning: 'bg-amber-500',
  success: 'bg-emerald-500',
  danger: 'bg-red-500',
  purple: 'bg-violet-500',
};

const statusTone: Record<string, Tone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'info',
  IN_APPROVAL: 'warning',
  PENDING: 'warning',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'success',
  AUTO_APPROVED: 'success',
  ISSUED: 'info',
  PARTIALLY_RECEIVED: 'warning',
  RECEIVED: 'success',
  COMPLETE: 'success',
  CLOSED: 'neutral',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
  CONVERTED_TO_PO: 'purple',
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  BLOCKED: 'danger',
  SENT: 'info',
  QUOTES_RECEIVED: 'warning',
  AWARDED: 'success',
  MATCHED: 'success',
  MISMATCHED: 'danger',
  DISPUTED: 'danger',
  PAID: 'success',
  SCHEDULED: 'info',
  PROCESSING: 'warning',
  FAILED: 'danger',
  EXPIRING_SOON: 'warning',
  EXPIRED: 'danger',
  TERMINATED: 'neutral',
  EXECUTED: 'success',
  PROPOSED: 'warning',
  REJECTED_BY_POLICY: 'neutral',
  OVERRIDDEN_BY_HUMAN: 'purple',
  UNDER_REVIEW: 'warning',
};

export default function Badge({ status }: { status: string }) {
  const tone = statusTone[status] || 'neutral';
  return (
    <span className={`badge ${toneStyles[tone]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${toneDot[tone]}`} />
      {status.replaceAll('_', ' ')}
    </span>
  );
}

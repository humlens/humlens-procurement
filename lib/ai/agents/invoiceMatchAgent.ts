import { prisma } from '@/lib/prisma';
import { logAgentAction, proposeAction } from 'models/agentAction';
import { getMatchTolerancePct } from '@/lib/ai/policy';

// Runs the three-way match (PO × goods receipt × invoice) on its own whenever
// a new invoice comes in, through the same `invoice.applyMatch` action the
// inbox can undo. A clean match still needs a person to approve the invoice
// for payment (see models/invoice.ts#approveInvoice); the agent only saves
// the reviewer checking the numbers.
export async function runInvoiceMatchAgent(teamId: string, invoiceId: string) {
  const tolerancePct = await getMatchTolerancePct(teamId);

  if (tolerancePct === null) {
    return logAgentAction({
      teamId,
      type: 'AUTO_MATCH_INVOICE',
      status: 'REJECTED_BY_POLICY',
      agent: 'invoice-match',
      title: 'Invoice not matched: automatic matching is off',
      invoiceId,
      reasoning: 'Autonomous invoice matching is disabled for this team.',
    });
  }

  const action = await proposeAction({
    teamId,
    type: 'AUTO_MATCH_INVOICE',
    agent: 'invoice-match',
    tool: 'invoice.applyMatch',
    args: { invoiceId, tolerancePct },
    invoiceId,
    autoApply: true,
    reasoning: 'Matching the invoice against its purchase order and what was received.',
  });

  // Say what the match found, now that it has run.
  const result = action.result as { matched?: boolean; mismatches?: number } | null;
  if (action.status !== 'EXECUTED' || !result) return action;
  return prisma.agentAction.update({
    where: { id: action.id },
    data: {
      evidence: [
        { label: 'Result', value: result.matched ? 'matched' : 'mismatched' },
        { label: 'Lines off', value: result.mismatches ?? 0 },
        { label: 'Tolerance', value: `${tolerancePct}%` },
      ],
      reasoning: result.matched
        ? 'All invoice lines matched their PO price and received quantity within tolerance.'
        : `${result.mismatches} line(s) failed to match, so the invoice is flagged for a person to review.`,
      confidence: result.matched ? 0.95 : 0.4,
    },
  });
}

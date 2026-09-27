import { runThreeWayMatch, applyMatchResult } from 'models/invoice';
import { logAgentAction } from 'models/agentAction';
import { getMatchTolerancePct } from '@/lib/ai/policy';

// Runs the 3-way match (PO x goods receipt x invoice) autonomously whenever
// a new invoice comes in, using the same matching logic the manual "Review
// match" button uses. A clean match still requires human sign-off to move
// to APPROVED (see models/invoice.ts#approveInvoice) — the agent only saves
// the reviewer the work of checking the numbers themselves.
export async function runInvoiceMatchAgent(teamId: string, invoiceId: string) {
  const tolerancePct = await getMatchTolerancePct(teamId);

  if (tolerancePct === null) {
    return logAgentAction({
      teamId,
      type: 'AUTO_MATCH_INVOICE',
      status: 'REJECTED_BY_POLICY',
      invoiceId,
      reasoning: 'Autonomous invoice matching is disabled for this team.',
    });
  }

  const result = await runThreeWayMatch(teamId, invoiceId, tolerancePct);
  await applyMatchResult(teamId, invoiceId, result);

  return logAgentAction({
    teamId,
    type: 'AUTO_MATCH_INVOICE',
    status: 'EXECUTED',
    invoiceId,
    input: { tolerancePct },
    output: { matched: result.matched, mismatches: result.mismatches },
    reasoning: result.matched
      ? 'All invoice lines matched their PO price and received quantity within tolerance.'
      : `${result.mismatches.length} line(s) failed to match — flagged for human review.`,
    confidence: result.matched ? 0.95 : 0.4,
  });
}

import { getRequisition } from 'models/requisition';
import { hasOpenAgentAction, proposeAction } from 'models/agentAction';
import { canAutoApproveRequisition } from '@/lib/ai/policy';

// Runs after a requisition is submitted. The agent always prepares the
// approval of the current pending step: it approves on its own when the
// team's AgentPolicy (and the hard env ceiling) allow it for this amount and
// category, and otherwise leaves it in the inbox for a person with the
// step's role to approve, saying why.
export async function runApprovalAgent(teamId: string, requisitionId: string) {
  const requisition = await getRequisition(teamId, requisitionId);
  const pendingStep = requisition.approvalSteps.find((s) => s.status === 'PENDING');

  if (!pendingStep || (await hasOpenAgentAction(teamId, 'AUTO_APPROVE_REQUISITION', { requisitionId }))) {
    return null;
  }

  const categoryIds = requisition.lineItems.map((li) => li.categoryId).filter((id): id is string => !!id);
  const amount = Number(requisition.totalAmount);
  const decision = await canAutoApproveRequisition({ teamId, amount, categoryIds });

  return proposeAction({
    teamId,
    type: 'AUTO_APPROVE_REQUISITION',
    agent: 'approval',
    tool: 'requisition.approveStep',
    args: { requisitionId, stepId: pendingStep.id },
    requisitionId,
    autoApply: decision.allowed,
    evidence: [
      { label: 'Amount', value: `${requisition.currency} ${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` },
      { label: 'Lines', value: requisition.lineItems.length },
      { label: 'Step needs', value: pendingStep.requiredRole.toLowerCase().replaceAll('_', ' ') },
    ],
    reasoning: decision.allowed
      ? "Amount and category are within the team's auto-approve policy, so the agent approved this step."
      : `This needs a person with the ${pendingStep.requiredRole.toLowerCase().replaceAll('_', ' ')} role: ${decision.reason ?? 'the auto-approve policy does not cover it.'}`,
    confidence: decision.allowed ? 1 : undefined,
  });
}

import { Role } from '@prisma/client';

import { getRequisition, decideRequisitionStep } from 'models/requisition';
import { logAgentAction } from 'models/agentAction';
import { canAutoApproveRequisition } from '@/lib/ai/policy';

// Runs after a requisition is submitted. Auto-approves the current pending
// step only when the team's AgentPolicy (and the hard env ceiling) allow it
// for this amount/category; otherwise leaves it for a human and logs why,
// so the decision is always visible in the requisition's Agent Actions tab.
export async function runApprovalAgent(teamId: string, requisitionId: string) {
  const requisition = await getRequisition(teamId, requisitionId);
  const pendingStep = requisition.approvalSteps.find((s) => s.status === 'PENDING');

  if (!pendingStep) {
    return null;
  }

  const categoryIds = requisition.lineItems
    .map((li) => li.categoryId)
    .filter((id): id is string => !!id);

  const decision = await canAutoApproveRequisition({
    teamId,
    amount: Number(requisition.totalAmount),
    categoryIds,
  });

  if (!decision.allowed) {
    return logAgentAction({
      teamId,
      type: 'AUTO_APPROVE_REQUISITION',
      status: 'REJECTED_BY_POLICY',
      requisitionId,
      input: { amount: Number(requisition.totalAmount), categoryIds },
      reasoning: decision.reason ?? undefined,
    });
  }

  await decideRequisitionStep({
    teamId,
    requisitionId,
    actorId: null,
    actorRole: pendingStep.requiredRole as Role,
    decision: 'APPROVED',
    comment: 'Auto-approved by the procurement agent within policy limits.',
    actedByAgent: true,
  });

  return logAgentAction({
    teamId,
    type: 'AUTO_APPROVE_REQUISITION',
    status: 'EXECUTED',
    requisitionId,
    input: { amount: Number(requisition.totalAmount), categoryIds },
    output: { stepId: pendingStep.id, decision: 'APPROVED' },
    reasoning: `Amount and category are within the team's auto-approve policy.`,
    confidence: 1,
  });
}

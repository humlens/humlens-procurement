import { getAgentPolicy } from 'models/agentAction';

// Hard ceiling that no per-team AgentPolicy can override — a safety net so a
// misconfigured policy row can never let the agent auto-approve above this,
// regardless of what an admin sets in the UI.
const HARD_MAX_AUTO_APPROVE = Number(process.env.AGENT_MAX_AUTO_APPROVE_AMOUNT || 1000);

export async function canAutoApproveRequisition(params: {
  teamId: string;
  amount: number;
  categoryIds: string[];
}) {
  const policy = await getAgentPolicy(params.teamId);

  if (!policy.autoApproveEnabled) {
    return { allowed: false, reason: 'Autonomous approval is disabled for this team.' };
  }

  const ceiling = Math.min(Number(policy.autoApproveMaxAmount), HARD_MAX_AUTO_APPROVE);
  if (params.amount > ceiling) {
    return { allowed: false, reason: `Amount ${params.amount} exceeds the auto-approve ceiling of ${ceiling}.` };
  }

  if (
    policy.autoApproveCategories.length > 0 &&
    !params.categoryIds.some((c) => policy.autoApproveCategories.includes(c))
  ) {
    return { allowed: false, reason: 'No line item falls in an approved auto-approve category.' };
  }

  return { allowed: true as const, reason: null };
}

export async function getMatchTolerancePct(teamId: string) {
  const policy = await getAgentPolicy(teamId);
  return policy.autoMatchInvoices ? policy.autoMatchTolerancePct : null;
}

export async function canAutoDraftRfqOutreach(teamId: string) {
  const policy = await getAgentPolicy(teamId);
  return policy.autoDraftRfqOutreach;
}

export async function getSpendAnomalyThresholdPct(teamId: string) {
  const policy = await getAgentPolicy(teamId);
  return policy.spendAnomalyThresholdPct;
}

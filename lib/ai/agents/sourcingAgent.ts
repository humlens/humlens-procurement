import { generateText } from 'ai';

import { getRfq } from 'models/rfq';
import { logAgentAction } from 'models/agentAction';
import { canAutoDraftRfqOutreach } from '@/lib/ai/policy';
import { getAgentModel } from '@/lib/ai/provider';

// Drafts a vendor-outreach email per invited vendor for an RFQ. This only
// *drafts* — it never sends on its own; the draft lands in AgentAction.output
// for a human to review/send (email sending isn't wired up in v1).
export async function runSourcingAgent(teamId: string, rfqId: string) {
  const allowed = await canAutoDraftRfqOutreach(teamId);

  if (!allowed) {
    return logAgentAction({
      teamId,
      type: 'DRAFT_RFQ_OUTREACH',
      status: 'REJECTED_BY_POLICY',
      agent: 'sourcing',
      title: 'RFQ outreach not drafted: drafting is off',
      reasoning: 'Autonomous RFQ outreach drafting is disabled for this team.',
    });
  }

  const rfq = await getRfq(teamId, rfqId);

  const lineItemsSummary = rfq.lineItems
    .map((li) => `- ${li.quantity} ${li.unit || 'units'} of ${li.description}`)
    .join('\n');

  const drafts: Record<string, string> = {};
  let tokens = 0;

  const ai = await getAgentModel(teamId);

  for (const invite of rfq.vendorInvites) {
    const { text, usage } = await generateText({
      model: ai.model,
      prompt: `Write a brief, professional RFQ outreach email to the vendor "${invite.vendor.name}" for the following request for quote titled "${rfq.title}"${rfq.description ? `: ${rfq.description}` : '.'}\n\nLine items:\n${lineItemsSummary}\n\n${rfq.dueDate ? `Quotes are due by ${rfq.dueDate.toDateString()}.` : ''}\n\nKeep it under 150 words, and ask them to reply with pricing and lead time per line item.`,
    });
    drafts[invite.vendorId] = text;
    tokens += usage?.totalTokens ?? 0;
  }

  return logAgentAction({
    teamId,
    type: 'DRAFT_RFQ_OUTREACH',
    status: 'EXECUTED',
    agent: 'sourcing',
    title: `Outreach emails drafted for “${rfq.title}”`,
    evidence: [{ label: 'Vendors', value: rfq.vendorInvites.length }],
    aiModel: ai.id,
    aiTokens: tokens || undefined,
    input: { rfqId, vendorCount: rfq.vendorInvites.length },
    output: { drafts },
    reasoning: `Drafted outreach emails for ${rfq.vendorInvites.length} invited vendor(s).`,
  });
}

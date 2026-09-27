import { generateObject } from 'ai';
import { z } from 'zod';

import { createRequisition } from 'models/requisition';
import { logAgentAction } from 'models/agentAction';
import { agentModel } from '@/lib/ai/provider';

const draftSchema = z.object({
  title: z.string(),
  justification: z.string(),
  currency: z.string().default('USD'),
  lineItems: z
    .array(
      z.object({
        description: z.string(),
        quantity: z.number().positive(),
        unit: z.string().optional(),
        estimatedPrice: z.number().nonnegative(),
      })
    )
    .min(1),
});

// Natural-language requisition creation: "I need 20 standing desks for the
// new NYC office, budget around $8k" -> a structured draft requisition. The
// agent only ever produces a DRAFT — a human still has to review and submit
// it, so a bad extraction never becomes real spend on its own.
export async function draftRequisitionFromPrompt(params: {
  teamId: string;
  requesterId: string;
  departmentId?: string;
  budgetId?: string;
  prompt: string;
}) {
  const { object } = await generateObject({
    model: agentModel,
    schema: draftSchema,
    prompt: `A team member wrote this purchase request in plain language:\n\n"${params.prompt}"\n\nExtract a structured purchase requisition: a short title, a one-sentence business justification, and a line-item breakdown with realistic estimated unit prices in USD (research typical market prices if not stated). If quantity or price is ambiguous, make a reasonable assumption rather than leaving it blank.`,
  });

  const requisition = await createRequisition({
    teamId: params.teamId,
    requesterId: params.requesterId,
    departmentId: params.departmentId,
    budgetId: params.budgetId,
    title: object.title,
    justification: object.justification,
    currency: object.currency,
    lineItems: object.lineItems,
  });

  await logAgentAction({
    teamId: params.teamId,
    type: 'NL_REQUISITION_DRAFT',
    status: 'EXECUTED',
    requisitionId: requisition.id,
    input: { prompt: params.prompt },
    output: { requisitionId: requisition.id, ...object },
    reasoning: 'Extracted a structured draft requisition from the natural-language request. Still requires human submission.',
  });

  return requisition;
}

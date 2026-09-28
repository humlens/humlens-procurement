import { generateObject } from 'ai';
import { z } from 'zod';

import { getRequisition } from 'models/requisition';
import { proposeAction } from 'models/agentAction';
import { ApiError } from '@/lib/errors';
import { getAgentModel } from '@/lib/ai/provider';

// Smaller models (local ones especially) sometimes put the currency in the
// unit: "USD/EA", "USD per unit". Keep only the unit of measure.
const CURRENCY = /^\s*(USD|INR|EUR|GBP|AED|SGD|AUD|CAD|JPY|CNY|CHF|HKD|NZD|ZAR)\b\s*(\/|per\b)?\s*/i;

export const cleanUnit = (unit?: string) => {
  const cleaned = unit?.replace(CURRENCY, '').replace(/^\s*per\s+/i, '').trim();
  return !cleaned || /^units?$/i.test(cleaned) ? undefined : cleaned;
};

const draftSchema = z.object({
  title: z.string(),
  justification: z.string(),
  currency: z.string().default('USD'),
  lineItems: z
    .array(
      z.object({
        description: z.string().describe('What to buy, e.g. "Ergonomic office chair"'),
        quantity: z.number().positive(),
        unit: z.string().optional().describe('Unit of measure such as "each", "box" or "kg". Never a currency.'),
        estimatedPrice: z.number().nonnegative().describe('Estimated price for one unit, as a number'),
      })
    )
    .min(1),
});

// Natural-language requisition creation: "I need 20 standing desks for the
// new NYC office, budget around $8k" -> a structured draft requisition. The
// agent only ever produces a DRAFT (through the `requisition.createDraft`
// action, so it can be undone from the inbox); a person still has to review
// and submit it, so a bad extraction never becomes real spend on its own.
export async function draftRequisitionFromPrompt(params: {
  teamId: string;
  requesterId: string;
  departmentId?: string;
  budgetId?: string;
  prompt: string;
}) {
  const ai = await getAgentModel(params.teamId);
  const { object, usage } = await generateObject({
    model: ai.model,
    schema: draftSchema,
    prompt: `A team member wrote this purchase request in plain language:\n\n"${params.prompt}"\n\nExtract a structured purchase requisition: a short title, a one-sentence business justification, and a line-item breakdown with realistic estimated unit prices in USD (research typical market prices if not stated). If quantity or price is ambiguous, make a reasonable assumption rather than leaving it blank.`,
  });

  const action = await proposeAction({
    teamId: params.teamId,
    type: 'NL_REQUISITION_DRAFT',
    agent: 'nl-requisition',
    tool: 'requisition.createDraft',
    args: {
      title: object.title,
      justification: object.justification,
      currency: object.currency,
      departmentId: params.departmentId,
      budgetId: params.budgetId,
      lineItems: object.lineItems.map((line) => ({ ...line, unit: cleanUnit(line.unit) })),
    },
    requestedById: params.requesterId,
    actAs: params.requesterId,
    autoApply: true,
    evidence: [{ label: 'Asked', value: params.prompt.slice(0, 200) }],
    reasoning: 'Wrote a draft requisition from the plain-English request. It stays a draft until someone reviews and submits it.',
    aiModel: ai.id,
    aiTokens: usage?.totalTokens,
  });

  const requisitionId = (action.result as { requisitionId?: string } | null)?.requisitionId;
  if (!requisitionId) throw new ApiError(500, action.error ?? 'The draft requisition could not be created.');
  return getRequisition(params.teamId, requisitionId);
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { draftRequisitionFromPrompt } from '@/lib/ai/agents/requisitionDraftAgent';
import { validateWithSchema } from '@/lib/zod';

const promptSchema = z.object({
  prompt: z.string().min(3),
  departmentId: z.string().optional(),
  budgetId: z.string().optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.status(405).end();
      return;
    }

    const teamMember = await guardTeamAccess(req, res, 'requisition', 'create');
    const { prompt, departmentId, budgetId } = validateWithSchema(promptSchema, req.body);

    const requisition = await draftRequisitionFromPrompt({
      teamId: teamMember.teamId,
      requesterId: teamMember.userId,
      departmentId,
      budgetId,
      prompt,
    });

    res.status(201).json({ data: requisition });
  } catch (error) {
    handleApiError(res, error);
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { reviewAgentAction } from 'models/agentAction';
import { validateWithSchema } from '@/lib/zod';

const reviewSchema = z.object({ status: z.enum(['EXECUTED', 'OVERRIDDEN_BY_HUMAN']) });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.status(405).end();
      return;
    }

    const teamMember = await guardTeamAccess(req, res, 'agent_action', 'approve');
    const { status } = validateWithSchema(reviewSchema, req.body);

    const action = await reviewAgentAction(teamMember.teamId, req.query.id as string, teamMember.userId, status);
    res.status(200).json({ data: action });
  } catch (error) {
    handleApiError(res, error);
  }
}

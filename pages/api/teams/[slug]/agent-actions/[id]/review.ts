import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { setAuditEvent } from '@/lib/audit';
import { reviewAgentAction } from 'models/agentAction';
import { validateWithSchema } from '@/lib/zod';

// Older endpoint, kept for existing clients: EXECUTED approves, OVERRIDDEN_BY_HUMAN
// dismisses. New code uses approve / reject / undo alongside this file.
const reviewSchema = z.object({ status: z.enum(['EXECUTED', 'OVERRIDDEN_BY_HUMAN']) });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.status(405).end();
      return;
    }

    const teamMember = await guardTeamAccess(req, res, 'agent_action', 'approve');
    const { status } = validateWithSchema(reviewSchema, req.body);
    setAuditEvent(res, { resource: 'agent_action', action: status === 'EXECUTED' ? 'approve' : 'override' });

    const action = await reviewAgentAction(teamMember.teamId, req.query.id as string, { userId: teamMember.userId, role: teamMember.role }, status);
    res.status(200).json({ data: action });
  } catch (error) {
    handleApiError(res, error);
  }
}

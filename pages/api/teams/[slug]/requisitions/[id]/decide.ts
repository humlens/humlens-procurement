import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { decideRequisitionStep, getRequisition } from 'models/requisition';
import { validateWithSchema } from '@/lib/zod';

const decideSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  comment: z.string().optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.status(405).end();
      return;
    }

    const { decision, comment } = validateWithSchema(decideSchema, req.body);
    const action = decision === 'APPROVED' ? 'approve' : 'reject';
    const teamMember = await guardTeamAccess(req, res, 'requisition', action);
    const id = req.query.id as string;

    await decideRequisitionStep({
      teamId: teamMember.teamId,
      requisitionId: id,
      actorId: teamMember.userId,
      actorRole: teamMember.role,
      decision,
      comment,
    });

    res.status(200).json({ data: await getRequisition(teamMember.teamId, id) });
  } catch (error) {
    handleApiError(res, error);
  }
}

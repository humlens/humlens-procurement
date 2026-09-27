import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { listRequisitions, createRequisition } from 'models/requisition';
import { validateWithSchema, createRequisitionSchema } from '@/lib/zod';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'requisition', 'read');
      const { status, mine } = req.query;
      res.status(200).json({
        data: await listRequisitions(teamMember.teamId, {
          status: status as any,
          requesterId: mine === 'true' ? teamMember.userId : undefined,
        }),
      });
      return;
    }

    if (req.method === 'POST') {
      const teamMember = await guardTeamAccess(req, res, 'requisition', 'create');
      const params = validateWithSchema(createRequisitionSchema, req.body);
      const requisition = await createRequisition({
        teamId: teamMember.teamId,
        requesterId: teamMember.userId,
        title: params.title,
        justification: params.justification,
        departmentId: params.departmentId,
        budgetId: params.budgetId,
        neededBy: params.neededBy ? new Date(params.neededBy) : undefined,
        currency: params.currency,
        lineItems: params.lineItems,
      });
      res.status(201).json({ data: requisition });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}

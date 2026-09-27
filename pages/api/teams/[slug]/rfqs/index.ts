import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { listRfqs, createRfq } from 'models/rfq';
import { validateWithSchema, createRfqSchema } from '@/lib/zod';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'rfq', 'read');
      res.status(200).json({ data: await listRfqs(teamMember.teamId) });
      return;
    }

    if (req.method === 'POST') {
      const teamMember = await guardTeamAccess(req, res, 'rfq', 'create');
      const params = validateWithSchema(createRfqSchema, req.body);
      const rfq = await createRfq({
        teamId: teamMember.teamId,
        createdById: teamMember.userId,
        title: params.title,
        description: params.description,
        dueDate: params.dueDate ? new Date(params.dueDate) : undefined,
        vendorIds: params.vendorIds,
        lineItems: params.lineItems,
      });
      res.status(201).json({ data: rfq });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}

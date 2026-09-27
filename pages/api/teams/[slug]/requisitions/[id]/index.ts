import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { getRequisition } from 'models/requisition';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'requisition', 'read');
      res.status(200).json({ data: await getRequisition(teamMember.teamId, req.query.id as string) });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}

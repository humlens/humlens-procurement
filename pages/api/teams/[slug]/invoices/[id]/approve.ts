import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { approveInvoice } from 'models/invoice';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.status(405).end();
      return;
    }

    const teamMember = await guardTeamAccess(req, res, 'invoice', 'approve');
    const invoice = await approveInvoice(teamMember.teamId, req.query.id as string, teamMember.userId);

    res.status(200).json({ data: invoice });
  } catch (error) {
    handleApiError(res, error);
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { markPaymentPaid } from 'models/payment';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.status(405).end();
      return;
    }

    const teamMember = await guardTeamAccess(req, res, 'payment', 'pay');
    const payment = await markPaymentPaid(teamMember.teamId, req.query.id as string, teamMember.userId);

    res.status(200).json({ data: payment });
  } catch (error) {
    handleApiError(res, error);
  }
}

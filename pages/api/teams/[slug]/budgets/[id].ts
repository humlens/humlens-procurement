import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { getBudget } from 'models/budget';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'budget', 'read');
      const budget = await getBudget(teamMember.teamId, req.query.id as string);
      res.status(200).json({
        data: {
          ...budget,
          availableAmount:
            Number(budget.allocatedAmount) - Number(budget.committedAmount) - Number(budget.spentAmount),
        },
      });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}

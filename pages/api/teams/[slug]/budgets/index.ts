import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { listBudgets, createBudget } from 'models/budget';
import { validateWithSchema, createBudgetSchema } from '@/lib/zod';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'budget', 'read');
      const budgets = await listBudgets(teamMember.teamId);
      res.status(200).json({
        data: budgets.map((b) => ({
          ...b,
          availableAmount: Number(b.allocatedAmount) - Number(b.committedAmount) - Number(b.spentAmount),
        })),
      });
      return;
    }

    if (req.method === 'POST') {
      const teamMember = await guardTeamAccess(req, res, 'budget', 'create');
      const params = validateWithSchema(createBudgetSchema, req.body);
      const budget = await createBudget({
        teamId: teamMember.teamId,
        name: params.name,
        departmentId: params.departmentId,
        period: params.period,
        startDate: new Date(params.startDate),
        endDate: new Date(params.endDate),
        allocatedAmount: params.allocatedAmount,
        currency: params.currency,
      });
      res.status(201).json({ data: budget });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}

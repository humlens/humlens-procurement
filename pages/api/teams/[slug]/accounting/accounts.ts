import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { ApiError } from '@/lib/errors';
import { getAccountingAdapter } from '@/lib/accounting';
import { AccountingError } from '@/lib/accounting/types';

// GET: the expense and bank accounts in the connected system, to choose where
// bills post and payments come from.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET') return res.status(405).end();
    const member = await guardTeamAccess(req, res, 'team', 'update');
    const found = await getAccountingAdapter(member.teamId);
    if (!found) throw new ApiError(404, 'Connect an accounting system first.');
    try {
      const [expense, bank] = await Promise.all([found.adapter.expenseAccounts(), found.adapter.bankAccounts()]);
      res.status(200).json({ data: { expense, bank } });
    } catch (error) {
      throw new ApiError(502, error instanceof AccountingError ? error.message : 'Couldn’t load the accounts.');
    }
  } catch (error) {
    handleApiError(res, error);
  }
}

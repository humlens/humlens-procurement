import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { runInvoiceMatchAgent } from '@/lib/ai/agents/invoiceMatchAgent';
import { getInvoice } from 'models/invoice';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.status(405).end();
      return;
    }

    const teamMember = await guardTeamAccess(req, res, 'invoice', 'match');
    await runInvoiceMatchAgent(teamMember.teamId, req.query.id as string);

    res.status(200).json({ data: await getInvoice(teamMember.teamId, req.query.id as string) });
  } catch (error) {
    handleApiError(res, error);
  }
}

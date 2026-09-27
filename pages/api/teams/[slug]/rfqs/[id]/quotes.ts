import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { submitQuote, getRfq } from 'models/rfq';
import { validateWithSchema, createQuoteSchema } from '@/lib/zod';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.status(405).end();
      return;
    }

    const teamMember = await guardTeamAccess(req, res, 'quote', 'create');
    const params = validateWithSchema(createQuoteSchema, req.body);

    await submitQuote({ teamId: teamMember.teamId, rfqId: req.query.id as string, ...params });

    res.status(201).json({ data: await getRfq(teamMember.teamId, req.query.id as string) });
  } catch (error) {
    handleApiError(res, error);
  }
}

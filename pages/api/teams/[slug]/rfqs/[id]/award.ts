import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { awardQuote, getRfq } from 'models/rfq';
import { validateWithSchema } from '@/lib/zod';

const awardSchema = z.object({ quoteId: z.string().min(1) });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.status(405).end();
      return;
    }

    const teamMember = await guardTeamAccess(req, res, 'quote', 'approve');
    const { quoteId } = validateWithSchema(awardSchema, req.body);
    const rfqId = req.query.id as string;

    await awardQuote(teamMember.teamId, rfqId, quoteId);

    res.status(200).json({ data: await getRfq(teamMember.teamId, rfqId) });
  } catch (error) {
    handleApiError(res, error);
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { guardApiKey, handleV1Error } from '@/lib/apiKey';
import { validateWithSchema } from '@/lib/zod';
import { listReceiptsForSync } from 'models/storeSync';

const querySchema = z.object({
  since: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

// GET /api/v1/goods-receipts?since=<ISO>&limit= — goods received, oldest first.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET') return res.status(405).end();
    const { teamId } = await guardApiKey(req, res, 'goods_receipt', 'read');
    const query = validateWithSchema(querySchema, req.query);
    res.status(200).json({ data: await listReceiptsForSync(teamId, { since: query.since ? new Date(query.since) : undefined, limit: query.limit }) });
  } catch (error) {
    handleV1Error(res, error);
  }
}

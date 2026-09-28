import type { NextApiRequest, NextApiResponse } from 'next';

import { guardApiKey, handleV1Error } from '@/lib/apiKey';
import { getTeamSummary } from 'models/storeSync';

// GET /api/v1/team — the key's team and departments. Doubles as a connection check.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET') return res.status(405).end();
    const { teamId } = await guardApiKey(req, res, 'requisition', 'read');
    res.status(200).json({ data: await getTeamSummary(teamId) });
  } catch (error) {
    handleV1Error(res, error);
  }
}

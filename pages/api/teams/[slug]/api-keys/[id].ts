import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { setAuditEvent } from '@/lib/audit';
import { revokeApiKey } from 'models/apiKey';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'DELETE') {
      const teamMember = await guardTeamAccess(req, res, 'team', 'update');
      setAuditEvent(res, { resource: 'api_key', action: 'revoke' });
      await revokeApiKey(teamMember.teamId, req.query.id as string);
      res.status(204).end();
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}

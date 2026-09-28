import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { listAuditLogs } from 'models/auditLog';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'audit_log', 'read');
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      res.status(200).json({ data: await listAuditLogs(teamMember.teamId, { cursor }) });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}

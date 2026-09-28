import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { setAuditEvent } from '@/lib/audit';
import { runSourcingAgent } from '@/lib/ai/agents/sourcingAgent';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.status(405).end();
      return;
    }

    const teamMember = await guardTeamAccess(req, res, 'rfq', 'update');
    setAuditEvent(res, { resource: 'rfq', action: 'draft_outreach' });
    const action = await runSourcingAgent(teamMember.teamId, req.query.id as string);

    res.status(200).json({ data: action });
  } catch (error) {
    handleApiError(res, error);
  }
}

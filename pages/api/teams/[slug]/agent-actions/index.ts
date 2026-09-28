import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { setAuditEvent } from '@/lib/audit';
import { listAgentActions } from 'models/agentAction';
import { runSpendAnomalyAgent } from '@/lib/ai/agents/spendAnomalyAgent';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'agent_action', 'read');
      res.status(200).json({ data: await listAgentActions(teamMember.teamId) });
      return;
    }

    // Manual trigger for the spend-anomaly check (also intended to run on a
    // schedule — see workers/agentScheduler.ts).
    if (req.method === 'POST') {
      const teamMember = await guardTeamAccess(req, res, 'agent_action', 'read');
      setAuditEvent(res, { resource: 'agent_action', action: 'run' });
      const result = await runSpendAnomalyAgent(teamMember.teamId);
      res.status(200).json({ data: result });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}

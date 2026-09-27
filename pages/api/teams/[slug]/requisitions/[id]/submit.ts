import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { submitRequisition, getRequisition } from 'models/requisition';
import { runApprovalAgent } from '@/lib/ai/agents/approvalAgent';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.status(405).end();
      return;
    }

    const teamMember = await guardTeamAccess(req, res, 'requisition', 'submit');
    const id = req.query.id as string;

    await submitRequisition(teamMember.teamId, id);

    // Give the autonomous approval agent a chance to clear the first step
    // immediately, within whatever the team's AgentPolicy allows. Failures
    // here must never block the submission itself — the requisition still
    // exists and waits for a human either way.
    try {
      await runApprovalAgent(teamMember.teamId, id);
    } catch (agentError) {
      // eslint-disable-next-line no-console
      console.error('approval agent failed', agentError);
    }

    res.status(200).json({ data: await getRequisition(teamMember.teamId, id) });
  } catch (error) {
    handleApiError(res, error);
  }
}

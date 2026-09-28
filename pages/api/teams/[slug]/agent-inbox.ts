import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { getAgentInbox } from 'models/agentAction';

// GET: the agent inbox (needs you, done automatically, findings) for the
// signed-in member, with the buttons their role allows.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET') {
      res.status(405).end();
      return;
    }
    const member = await guardTeamAccess(req, res, 'agent_action', 'read');
    res.status(200).json({ data: await getAgentInbox(member.teamId, { userId: member.userId, role: member.role }) });
  } catch (error) {
    handleApiError(res, error);
  }
}

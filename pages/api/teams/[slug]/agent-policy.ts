import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { getAgentPolicy, updateAgentPolicy } from 'models/agentAction';
import { validateWithSchema, updateAgentPolicySchema } from '@/lib/zod';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'agent_policy', 'read');
      // The team's AI key stays server-side; see ./ai-model.ts.
      const { aiApiKey: _key, ...policy } = await getAgentPolicy(teamMember.teamId);
      res.status(200).json({ data: policy });
      return;
    }

    if (req.method === 'PUT') {
      const teamMember = await guardTeamAccess(req, res, 'agent_policy', 'configure');
      const params = validateWithSchema(updateAgentPolicySchema, req.body);
      const { aiApiKey: _key, ...policy } = await updateAgentPolicy(teamMember.teamId, params);
      res.status(200).json({ data: policy });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}

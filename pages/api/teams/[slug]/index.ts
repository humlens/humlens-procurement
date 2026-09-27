import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { updateTeam } from 'models/team';
import { validateWithSchema, updateTeamSchema } from '@/lib/zod';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'team', 'read');
      res.status(200).json({ data: { ...teamMember.team, myRole: teamMember.role } });
      return;
    }

    if (req.method === 'PUT') {
      const teamMember = await guardTeamAccess(req, res, 'team', 'update');
      const params = validateWithSchema(updateTeamSchema, req.body);
      const team = await updateTeam(teamMember.team.slug, params);
      res.status(200).json({ data: team });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}

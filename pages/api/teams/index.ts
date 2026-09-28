import type { NextApiRequest, NextApiResponse } from 'next';

import { getSession } from '@/lib/session';
import { getTeams, createTeam } from 'models/team';
import { handleApiError } from '@/lib/apiGuard';
import { clientIp, recordAudit } from '@/lib/audit';
import { validateWithSchema, createTeamSchema } from '@/lib/zod';
import { ApiError } from '@/lib/errors';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await getSession(req, res);
    if (!session) throw new ApiError(401, 'Unauthorized');

    if (req.method === 'GET') {
      res.status(200).json({ data: await getTeams(session.user.id) });
      return;
    }

    if (req.method === 'POST') {
      const { name } = validateWithSchema(createTeamSchema, req.body);
      const team = await createTeam({ userId: session.user.id, name });
      await recordAudit({
        teamId: team.id,
        actor: session.user,
        resource: 'team',
        action: 'create',
        targetId: team.id,
        targetLabel: team.name,
        ipAddress: clientIp(req),
      });
      res.status(201).json({ data: team });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}

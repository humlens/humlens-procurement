import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { setAuditEvent } from '@/lib/audit';
import { validateWithSchema } from '@/lib/zod';
import { createApiKey, listApiKeys } from 'models/apiKey';

const createApiKeySchema = z.object({ name: z.string().trim().min(1, 'Give the key a name.').max(100) });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'team', 'update');
      res.status(200).json({ data: await listApiKeys(teamMember.teamId) });
      return;
    }

    if (req.method === 'POST') {
      const teamMember = await guardTeamAccess(req, res, 'team', 'update');
      setAuditEvent(res, { resource: 'api_key', action: 'create' });
      const { name } = validateWithSchema(createApiKeySchema, req.body);
      res.status(201).json({ data: await createApiKey({ teamId: teamMember.teamId, name, createdById: teamMember.userId }) });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
